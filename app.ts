// import sourceMapSupport from 'source-map-support';
// sourceMapSupport.install();

import Homey from 'homey';
import { MyEnergi } from 'myenergi-api';
import { DataCallbackFunction } from './dataCallbackFunction';
import { Credential } from './models/Credential';
import { MyEnergiHub } from './models/MyEnergiHub';
import { Response } from './models/Result';
import { SchedulerService } from './services/SchedulerService';

export class MyEnergiApp extends Homey.App {

  private _dataUpdateInterval: number = 60 * 1000;
  private _dataUpdateCallbacks: DataCallbackFunction[] = [];
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
        // this.log(hub);
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

  public registerDataUpdateCallback(callback: DataCallbackFunction) {
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
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      // require('inspector').open(9229, '0.0.0.0', false);
      // debugger;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
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
