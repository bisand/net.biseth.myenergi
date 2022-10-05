// import sourceMapSupport from 'source-map-support';
// sourceMapSupport.install();

import Homey, { Device } from 'homey';
import { MyEnergi } from 'myenergi-api';
import { Credential } from './models/Credential';
import { MyEnergiHub } from './models/MyEnergiHub';
import { Response } from './models/Result';
import { SchedulerService } from './services/SchedulerService';

interface fn {
  (data: unknown): void;
}

export class MyEnergiApp extends Homey.App {

  private _dataUpdateInterval: number = 60 * 1000;
  private _dataUpdateCallbacks: fn[] = [];
  private _apiBaseUrl = 'https://s18.myenergi.net';

  public clients: { [name: string]: MyEnergi } = {};
  private _schedulerService!: SchedulerService;

  private async initClients(hubs: MyEnergiHub[]) {
    this.log(`Starting client init...`);
    if (this.clients) {
      Object.keys(this.clients).forEach((key: string) => {
        this.log(key);
        delete this.clients[key];
      });
    }
    if (hubs) {
      this.clients = {};
      hubs.forEach((hub: MyEnergiHub, index: number) => {
        this.log(hub);
        this.clients[`${hub.hubname}_${hub.username}`] = new MyEnergi(hub.username, hub.password, this._apiBaseUrl);
        if (index === 0) {
          this._dataUpdateInterval = hub.pollInterval * 1000;
        }
        this.log(`Added hub ${hub.hubname} with url ${this._apiBaseUrl}`);
      });
    }

    const runDataUpdate = () => {
      const updateInterval: number = this._dataUpdateInterval / 1000;
      this.log(`Starting scheduled data update. Running every ${updateInterval} seconds.`);
      if (this.clients) {
        Object.keys(this.clients).forEach(async c => {
          this.log(`Fetching data for ${c}`);
          const client: MyEnergi = this.clients[c] as MyEnergi;
          const data = await client.getStatusAll().catch(this.error);
          if (data)
            this._dataUpdateCallbacks.forEach(callback => {
              try {
                callback(data);
              } catch (error) {
                this.error(error);
              }
            });
        });
      }
    }

    runDataUpdate();
    if (!this._schedulerService) {
      this._schedulerService = new SchedulerService(runDataUpdate, this._dataUpdateInterval);
    } else {
      this._schedulerService.stop();
    }

    this._schedulerService.start(this._dataUpdateInterval);

    this.log(`Client init complete.`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public registerDataUpdateCallback(callback: any) {
    this._dataUpdateCallbacks.push(callback);
  }

  private async checkCredential(apiBaseUrl: string, username: string, password: string): Promise<boolean> {
    try {
      const client = new MyEnergi(username, password, apiBaseUrl);
      const data = await client.getStatusAll().catch(this.error);
      this.log(`Credential check: ${JSON.stringify(data)}`);
      if (data && Array.isArray(data)) {
        return true;
      }
    } catch (error) {
      this.log(`Credential check error: ${JSON.stringify(error)}`);
    }
    return false;
  }

  /**
 * onInit is called when the app is initialized.
 */
  public async onInit() {

    // Start debuger
    if (process.env.DEBUG === '1') {
      // require('inspector').open(9229, '0.0.0.0', false);
      // debugger;
    }

    const myenergiHubs = this.homey.settings.get('myenergiHubs');
    const apiBaseUrl = this.homey.settings.get('apiBaseUrl');
    if (apiBaseUrl)
      this._apiBaseUrl = apiBaseUrl;
    this.initClients(myenergiHubs);

    this.homey.settings.on('set', async key => {

      const apiBaseUrl = this.homey.settings.get('apiBaseUrl');
      const hubs = this.homey.settings.get('myenergiHubs');

      if (key === 'apiBaseUrl') {
        this.log(`Saved apiBaseUrl ${apiBaseUrl}`);
        if (apiBaseUrl)
          this._apiBaseUrl = apiBaseUrl;
      }
      if (key === 'myenergiHubs') {
        this.log(`Saved myenergiHubs ${JSON.stringify(hubs)}`);
      }
      this.initClients(hubs);
    });

    this.log('myenergi app has been initialized');
  }

  /**
 * Validate capabilities to see if anything has changed.
 * @param capabilities Capabilities represented by an array of strings.
 * @returns true if changes are detected
 */
  public detectCapabilityChanges(device: Device, capabilities: string[]): boolean {
    let result = false;
    try {
      const devName = device.getName();
      device.log(`Detecting ${devName} capability changes...`);
      const caps = device.getCapabilities();
      for (const cap of caps) {
        if (!capabilities.includes(cap)) {
          device.log(`${devName} capability ${cap} was removed.`);
          result = true;
        }
      }
      for (const cap of capabilities) {
        if (!device.hasCapability(cap)) {
          device.log(`${devName} capability ${cap} was added.`);
          result = true;
        }
      }
      if (!result)
        device.log('No changes in capabilities.');

    } catch (error) {
      device.error(`An error ocurred while detecting capabilities.\n${error}`);
    }
    return result;
  }

  /**
   * Initialize capabilities. Add new and delete removed capabilities.
   * @param capabilities Capabilities represented by an array of strings
   */
  public async initializeCapabilities(device: Device, capabilities: string[]) {
    const devName = device.getName();
    await device.setUnavailable(`${devName} is currently doing some maintenance taks and will be back shortly.`).catch(device.error);
    device.log(`****** Initializing ${devName} sensor capabilities ******`);
    const caps = device.getCapabilities();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tmpCaps: any = {};
    // Remove all capabilities in case the order has changed
    for (const cap of caps) {
      try {
        tmpCaps[cap] = device.getCapabilityValue(cap);
        await device.removeCapability(cap).catch(device.error);
        device.log(`*** ${cap} - Removed`);
      } catch (error) {
        device.error(error);
      }
    }
    // Re-apply all capabilities.
    for (const cap of capabilities) {
      try {
        if (device.hasCapability(cap))
          continue;
        await device.addCapability(cap).catch(device.error);
        if (tmpCaps[cap])
          device.setCapabilityValue(cap, tmpCaps[cap]);
        device.log(`*** ${cap} - Added`);
      } catch (error) {
        device.error(error);
      }
    }
    device.log(`****** Sensor capability initialization complete ******`);
    device.setAvailable().catch(device.error);
  }

  /**
   * Generates a random number based on input constraints.
   * @param min Minimum number
   * @param max Maximum number
   * @returns Random number based on input.
   */
  public getRndInteger(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /*******************
   * API functions   * 
   *******************/

  /**
   * Validate credentials API call
   * @param body Credentials
   */
  public async validateCredentials(body: Credential): Promise<Response> {
    const res = await this.checkCredential(this._apiBaseUrl, body.username, body.password).catch(this.error);
    return res ? { result: 'ok' } : { result: 'error' } as Response;
  }
}

module.exports = MyEnergiApp;
