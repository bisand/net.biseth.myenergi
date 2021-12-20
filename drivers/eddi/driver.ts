import { Driver } from 'homey';
import { Eddi } from 'myenergi-api';
import { MyEnergiApp } from '../../app';

export interface EddiData extends Eddi {
  myenergiClientId: string;
}

export class EddiDriver extends Driver {

  private _app!: MyEnergiApp;

  private _dataUpdateCallbacks: any[] = [];

  public eddiDevices: EddiData[] = [];

  /**
   * onInit is called when the driver is initialized.
   */
  public async onInit() {
    this._app = this.homey.app as MyEnergiApp;
    this._app.registerDataUpdateCallback((data: any[]) => this.dataUpdated(data));
    this.log('EddiDriver has been initialized');
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
        if (d.eddi) {
          this._dataUpdateCallbacks.forEach(callback => {
            callback(d.eddi);
          });
        }
      });
    }
  }

  private async loadEddiDevices() {
    const res = new Promise((resolve, reject) => {
      Object.keys(this._app.clients).forEach(async (key, i, arr) => {
        const client = this._app.clients[key];
        const eddis: EddiData[] = await client.getStatusEddiAll();
        eddis.forEach((eddi: EddiData) => {
          if (this.eddiDevices.findIndex(z => z.sno === eddi.sno) === -1) {
            eddi.myenergiClientId = key;
            this.eddiDevices.push(eddi);
          }
        });
        resolve(this.eddiDevices);
      });
    });
    return res;
  }

  private async getEddiDevices() {
    await this.loadEddiDevices();
    return this.eddiDevices.map((v, i, a) => {
      return {
        name: `Eddi ${v.sno}`,
        data: { id: v.sno },
        icon: 'icon.svg', // relative to: /drivers/<driver_id>/assets/
        store: {
          myenergiClientId: v.myenergiClientId,
        },
        capabilities: [
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
        ],
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
    return this.getEddiDevices();
  }

  public async onPair(session: any) {
    session.setHandler('list_devices', () => {
      const devices = this.getEddiDevices();

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

module.exports = EddiDriver;
