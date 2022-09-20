import { Driver } from 'homey';
import { MyEnergiApp } from '../../app';
import { HarviData } from './HarviData';

export class HarviDriver extends Driver {

  private _app!: MyEnergiApp;

  private _dataUpdateCallbacks: any[] = [];
  private readonly _capabilities = [
    'ct1_type',
    'measure_power_ct1',
    'ct2_type',
    'measure_power_ct2',
    'ct3_type',
    'measure_power_ct3',
  ];

  public harviDevices: HarviData[] = [];
  public get capabilities() {
    return this._capabilities;
  }

  /**
   * onInit is called when the driver is initialized.
   */
  public async onInit() {
    this._app = this.homey.app as MyEnergiApp;
    this._app.registerDataUpdateCallback((data: any[]) => this.dataUpdated(data));
    this.log('HarviDriver has been initialized');
  }

  public registerDataUpdateCallback(callback: any) {
    return this._dataUpdateCallbacks.push(callback);
  }

  public removeDataUpdateCallback(callbackId: number) {
    this._dataUpdateCallbacks.splice(callbackId, 1);
  }

  private dataUpdated(data: any[]) {
    this.log('Received data from app. Relaying to devices.');
    if (data) {
      data.forEach(d => {
        if (d.harvi) {
          this._dataUpdateCallbacks.forEach(callback => {
            callback(d.harvi);
          });
        }
      });
    }
  }

  private async loadHarviDevices(): Promise<HarviData[]> {
    for (const key in this._app.clients) {
      if (Object.prototype.hasOwnProperty.call(this._app.clients, key)) {
        const client = this._app.clients[key];
        const harvis: HarviData[] = await client.getStatusHarviAll().catch(this.error);
        for (const harvi of harvis) {
          if (this.harviDevices.findIndex((h: HarviData) => h.sno === harvi.sno) === -1) {
            harvi.myenergiClientId = key;
            this.harviDevices.push(harvi);
          }
        }
        return this.harviDevices;
      }
    }
    return [];
  }

  private async getHarviDevices() {
    const harviDevices = await this.loadHarviDevices().catch(this.error) as HarviData[];
    return harviDevices.map((v, i, a) => {
      return {
        name: `Harvi ${v.sno}`,
        data: { id: v.sno },
        icon: 'icon.svg', // relative to: /drivers/<driver_id>/assets/
        store: {
          myenergiClientId: v.myenergiClientId,
        },
        capabilities: this._capabilities,
        capabilitiesOptions: {
        },
      };
    });
  }

  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  public async onPairListDevices() {
    if (!this._app.clients || this._app.clients.length < 1)
      throw new Error("Can not find any myenergi hubs. Please add the hub credentials under myenergi app settings.");

    try {
      const devs = await this.getHarviDevices();
      return devs ? devs : [];
    } catch (error) {
      throw new Error(`An error occurred while trying to fetch devices. Please check your credentials in the app settings. (${JSON.stringify(error)})`);
    }
  }

}

module.exports = HarviDriver;
