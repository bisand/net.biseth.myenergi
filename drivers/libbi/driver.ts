import { Driver } from 'homey';
import { MyEnergi } from 'myenergi-api';
import { AppKeyValues } from 'myenergi-api/dist/src/models/AppKeyValues';
import { KeyValue } from 'myenergi-api/dist/src/models/KeyValue';
import { MyEnergiApp } from '../../app';
import { DataCallbackFunction } from '../../dataCallbackFunction';
import { Capability } from '../../models/Capability';
import { CapabilityType } from '../../models/CapabilityType';
import { PairDevice } from '../../models/PairDevice';
import { LibbiDevice } from './device';
import { LibbiData } from './LibbiData';

export class LibbiDriver extends Driver {

  private _dataUpdateCallbacks: DataCallbackFunction[] = [];
  private readonly _capabilities: Capability[] = [
    new Capability('libbi_mode_selector', CapabilityType.Control, 1),
    new Capability('button.reload_capabilities', CapabilityType.Control, 2),
    new Capability('measure_battery', CapabilityType.Sensor, 3),
    new Capability('battery_charging_state', CapabilityType.Sensor, 4),
    new Capability('libbi_status', CapabilityType.Sensor, 5),
    new Capability('measure_power_generated', CapabilityType.Sensor, 6),
    new Capability('measure_voltage', CapabilityType.Sensor, 7),
    new Capability('measure_frequency', CapabilityType.Sensor, 8),
    new Capability('charge_session_consumption', CapabilityType.Sensor, 9),
  ];

  public libbiDevices: LibbiData[] = [];
  public get capabilities(): string[] {
    return this._capabilities.sort((x, y) => x.order - y.order).map(value => value.name);
  }

  public get capabilityObjects(): Capability[] {
    return this._capabilities.sort((x, y) => x.order - y.order);
  }

  /**
   * onInit is called when the driver is initialized.
   */
  public async onInit() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.homey.app as MyEnergiApp).registerDataUpdateCallback((data: any) => this.dataUpdated(data));

    const setLibbiModeAction = this.homey.flow.getActionCard('set_libbi_mode');
    setLibbiModeAction.registerRunListener(async (args, state) => {
      const dev: LibbiDevice = args.device;
      if (!dev) {
        this.error('Unable to detect device on flow: set_libbi_mode');
        return;
      }
      dev.log(`Libbi Mode: ${args.libbi_mode}`);
      dev.log(`State: ${state}`);
      await dev.setMode(args.libbi_mode);
    });

    this.log('LibbiDriver has been initialized');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public registerDataUpdateCallback(callback: any) {
    return this._dataUpdateCallbacks.push(callback);
  }

  public removeDataUpdateCallback(callbackId: number) {
    this._dataUpdateCallbacks.splice(callbackId, 1);
  }

  public async getDeviceAndSiteName(myenergiClient: MyEnergi, deviceId: string): Promise<{ siteNameResult: AppKeyValues; libbiNameResult: KeyValue[]; }> {
    const [siteNameResult, libbiNameResult] = await Promise.all([
      myenergiClient.getAppKeyFull("siteName"),
      myenergiClient.getAppKey(`L${deviceId}`),
    ]).catch(this.error) as [AppKeyValues, KeyValue[]];
    return { siteNameResult, libbiNameResult };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private dataUpdated(data: any[]) {
    if (process.env.DEBUG === '1') this.log('Received data from app. Relaying to devices.');
    if (data) {
      data.forEach(d => {
        if (d.libbi) {
          this._dataUpdateCallbacks.forEach(callback => {
            callback(d.libbi);
          });
        }
      });
    }
  }

  private async loadLibbiDevices(): Promise<LibbiData[]> {
    try {
      for (const key in (this.homey.app as MyEnergiApp).clients) {
        if (Object.prototype.hasOwnProperty.call((this.homey.app as MyEnergiApp).clients, key)) {
          const client: MyEnergi = (this.homey.app as MyEnergiApp).clients[key];
          const libbis: LibbiData[] = await client.getStatusLibbiAll().catch(this.error) as LibbiData[];
          for (const libbi of libbis) {
            if (this.libbiDevices.findIndex((l: LibbiData) => l.sno === libbi.sno) === -1) {
              libbi.myenergiClientId = key;
              this.libbiDevices.push(libbi);
            }
          }
        }
      }
      return this.libbiDevices;
    } catch (error) {
      this.error(error);
    }
    return [];
  }

  private async getLibbiDevices(): Promise<PairDevice[]> {
    const libbiDevices = await this.loadLibbiDevices().catch(this.error) as LibbiData[];
    return await Promise.all(libbiDevices.map(async (v: LibbiData): Promise<PairDevice> => {
      let deviceName = `Libbi ${v.sno}`;
      let hubSerial = "";
      let siteName = "";
      let libbiSerial = `L${v.sno}`;
      try {
        const client = (this.homey.app as MyEnergiApp).clients[v.myenergiClientId as string];
        const { siteNameResult, libbiNameResult } = await this.getDeviceAndSiteName(client, v.sno);
        hubSerial = Object.keys(siteNameResult)[0];
        siteName = Object.values(siteNameResult)[0][0].val;
        libbiSerial = libbiNameResult ? libbiNameResult[0]?.key : v.sno;
        deviceName = libbiNameResult ? libbiNameResult[0].val : deviceName;
      } catch (error) {
        this.error(error);
      }
      this.log(`Found: ${deviceName}`)
      return {
        name: deviceName,
        data: { id: v.sno },
        icon: 'icon.svg', // relative to: /drivers/<driver_id>/assets/
        store: {
          myenergiClientId: v.myenergiClientId,
        },
        capabilities: this.capabilities,
        capabilitiesOptions: {
        },
        settings: {
          hubSerial: hubSerial,
          siteName: siteName,
          libbiSerial: libbiSerial,
        },
      } as PairDevice;
    })).catch(this.error) as PairDevice[];
  }

  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  public async onPairListDevices() {
    if (!(this.homey.app as MyEnergiApp).clients || Object.keys((this.homey.app as MyEnergiApp).clients).length < 1)
      throw new Error("Can not find any myenergi hubs. Please add the hub credentials under myenergi app settings.");

    try {
      const devs = await this.getLibbiDevices();
      return devs ? devs : [];
    } catch (error) {
      throw new Error(`An error occurred while trying to fetch devices. Please check your credentials in the app settings. (${JSON.stringify(error)})`, { cause: error });
    }
  }
}

module.exports = LibbiDriver;
