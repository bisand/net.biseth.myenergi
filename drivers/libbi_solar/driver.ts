import { Driver } from 'homey';
import { MyEnergi } from 'myenergi-api';
import { AppKeyValues } from 'myenergi-api/dist/src/models/AppKeyValues';
import { KeyValue } from 'myenergi-api/dist/src/models/KeyValue';
import { MyEnergiApp } from '../../app';
import { DataCallbackFunction } from '../../dataCallbackFunction';
import { Capability } from '../../models/Capability';
import { CapabilityType } from '../../models/CapabilityType';
import { PairDevice } from '../../models/PairDevice';
import { LibbiData } from '../libbi/LibbiData';

export class LibbiSolarDriver extends Driver {

  private _dataUpdateCallbacks: DataCallbackFunction[] = [];
  private readonly _capabilities: Capability[] = [
    new Capability('button.reset_meter', CapabilityType.Control, 1),
    new Capability('button.reload_capabilities', CapabilityType.Control, 2),
    new Capability('measure_power', CapabilityType.Sensor, 3),
    new Capability('meter_power', CapabilityType.Sensor, 4),
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
    this.log('LibbiSolarDriver has been initialized');
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

  private async getLibbiSolarDevices(): Promise<PairDevice[]> {
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
      deviceName = `${deviceName} Solar`;
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
      const devs = await this.getLibbiSolarDevices();
      return devs ? devs : [];
    } catch (error) {
      throw new Error(`An error occurred while trying to fetch devices. Please check your credentials in the app settings. (${JSON.stringify(error)})`, { cause: error });
    }
  }
}

module.exports = LibbiSolarDriver;
