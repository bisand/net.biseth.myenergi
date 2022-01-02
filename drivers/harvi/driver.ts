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

  private async loadHarviDevices() {
    const res = new Promise((resolve, reject) => {
      Object.keys(this._app.clients).forEach(async (key, i, arr) => {
        const client = this._app.clients[key];
        const harvis: HarviData[] = await client.getStatusHarviAll();
        harvis.forEach((harvi: HarviData) => {
          if (this.harviDevices.findIndex(h => h.sno === harvi.sno) === -1) {
            harvi.myenergiClientId = key;
            this.harviDevices.push(harvi);
          }
        });
        resolve(this.harviDevices);
      });
    });
    return res;
  }

  private async getHarviDevices() {
    await this.loadHarviDevices();
    return this.harviDevices.map((v, i, a) => {
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
    return this.getHarviDevices();
  }

  public async onPair(session: any) {
    session.setHandler('list_devices', () => {
      const devices = this.getHarviDevices();

      // you can emit when devices are still being searched
      // session.emit("list_devices", devices);
      // return devices when searching is done
      return devices;
      // when no devices are found, return an empty array
      // return [];
      // or throw an Error to show that instead
      // throw new Error('Something bad has occured!');
    });
  }

}

module.exports = HarviDriver;
