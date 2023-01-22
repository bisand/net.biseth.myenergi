import { Driver } from 'homey';
import { MyEnergi } from 'myenergi-api';
import { AppKeyValues } from 'myenergi-api/dist/src/models/AppKeyValues';
import { KeyValue } from 'myenergi-api/dist/src/models/KeyValue';
import { MyEnergiApp } from '../../app';
import { DataCallbackFunction } from '../../dataCallbackFunction';
import { PairDevice } from '../../models/PairDevice';
import { EddiData } from './EddiData';

export class EddiDriver extends Driver {

  private _dataUpdateCallbacks: DataCallbackFunction[] = [];
  private readonly _capabilities: string[] = [
    'onoff',
    'heater_status',
    'heater_session_transferred',
    'measure_power_ct1',
    'measure_power_ct2',
    'measure_power_generated',
    'measure_current_ct1',
    'measure_current_ct2',
    'measure_voltage',
    'heater_1_name',
    'heater_2_name',
    "meter_power",
    "meter_power_ct1",
    "meter_power_ct2",
    "meter_power_generated"
  ];

  public eddiDevices: EddiData[] = [];
  public get capabilities(): string[] {
    return this._capabilities;
  }

  /**
   * onInit is called when the driver is initialized.
   */
  public async onInit() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.homey.app as MyEnergiApp).registerDataUpdateCallback((data: any) => this.dataUpdated(data));
    this.log('EddiDriver has been initialized');
  }

  public registerDataUpdateCallback(callback: DataCallbackFunction) {
    return this._dataUpdateCallbacks.push(callback);
  }

  public removeDataUpdateCallback(callbackId: number) {
    this._dataUpdateCallbacks.splice(callbackId, 1);
  }

  public async getDeviceAndSiteName(myenergiClient: MyEnergi, deviceId: string): Promise<{ siteNameResult: AppKeyValues; eddiNameResult: KeyValue[]; }> {
    const [siteNameResult, eddiNameResult] = await Promise.all([
      myenergiClient.getAppKeyFull("siteName"),
      myenergiClient.getAppKey(`E${deviceId}`),
    ]).catch(this.error) as [AppKeyValues, KeyValue[]];
    return { siteNameResult, eddiNameResult };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private dataUpdated(data: any[]) {
    if (process.env.DEBUG === '1') this.log('Received data from app. Relaying to devices.');
    if (data) {
      data.forEach(d => {
        if (d.eddi) {
          this._dataUpdateCallbacks.forEach(callback => {
            callback(d.eddi);
          });
        }
      });
    }
  }

  private async loadEddiDevices(): Promise<EddiData[]> {
    try {
      for (const key in (this.homey.app as MyEnergiApp).clients) {
        if (Object.prototype.hasOwnProperty.call((this.homey.app as MyEnergiApp).clients, key)) {
          const client: MyEnergi = (this.homey.app as MyEnergiApp).clients[key];
          const eddis: EddiData[] = await client.getStatusEddiAll().catch(this.error) as EddiData[];
          for (const eddi of eddis) {
            if (this.eddiDevices.findIndex((e: EddiData) => e.sno === eddi.sno) === -1) {
              eddi.myenergiClientId = key;
              this.eddiDevices.push(eddi);
            }
          }
        }
      }
      return this.eddiDevices;
    } catch (error) {
      this.error(error);
    }
    return [];
  }

  private async getEddiDevices(): Promise<PairDevice[]> {
    const eddiDevices = await this.loadEddiDevices().catch(this.error) as EddiData[];
    const result = await Promise.all(eddiDevices.map(async (v: EddiData): Promise<PairDevice> => {
      let deviceName = `Eddi ${v.sno}`;
      let hubSerial = "";
      let siteName = "";
      let eddiSerial = `E${v.sno}`;
      try {
        const client = (this.homey.app as MyEnergiApp).clients[v.myenergiClientId as string];
        const { siteNameResult, eddiNameResult: eddiNameResult } = await this.getDeviceAndSiteName(client, v.sno);
        hubSerial = Object.keys(siteNameResult)[0];
        siteName = Object.values(siteNameResult)[0][0].val;
        eddiSerial = eddiNameResult ? eddiNameResult[0]?.key : v.sno;
        deviceName = eddiNameResult ? eddiNameResult[0].val : deviceName;
      } catch (error) {
        this.error(error);
      }
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
          eddiSerial: eddiSerial,
        },
      } as PairDevice;
    })).catch(this.error) as PairDevice[];
    return result;
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
      const devs = await this.getEddiDevices();
      return devs ? devs : [];
    } catch (error) {
      throw new Error(`An error occurred while trying to fetch devices. Please check your credentials in the app settings. (${JSON.stringify(error)})`);
    }
  }

}

module.exports = EddiDriver;
