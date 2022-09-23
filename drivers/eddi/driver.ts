import { Driver } from 'homey';
import { MyEnergiApp } from '../../app';
import { EddiData } from './EddiData';

export class EddiDriver extends Driver {

  private _app!: MyEnergiApp;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _dataUpdateCallbacks: any[] = [];
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
  ];

  public eddiDevices: EddiData[] = [];
  public get capabilities(): string[] {
    return this._capabilities;
  }

  /**
   * onInit is called when the driver is initialized.
   */
  public async onInit() {
    this._app = this.homey.app as MyEnergiApp;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._app.registerDataUpdateCallback((data: any[]) => this.dataUpdated(data));
    this.log('EddiDriver has been initialized');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public registerDataUpdateCallback(callback: any) {
    return this._dataUpdateCallbacks.push(callback);
  }

  public removeDataUpdateCallback(callbackId: number) {
    this._dataUpdateCallbacks.splice(callbackId, 1);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  private async loadEddiDevices(): Promise<EddiData[]> {
    for (const key in this._app.clients) {
      try {
        if (Object.prototype.hasOwnProperty.call(this._app.clients, key)) {
          const client = this._app.clients[key];
          const eddis: EddiData[] = await client.getStatusEddiAll();
          for (const eddi of eddis) {
            if (this.eddiDevices.findIndex((e: EddiData) => e.sno === eddi.sno) === -1) {
              eddi.myenergiClientId = key;
              this.eddiDevices.push(eddi);
            }
          }
          return this.eddiDevices;
        }

      } catch (error) {
        this.error(error);
      }
    }
    return [];
  }

  private async getEddiDevices() {
    const eddiDevices = await this.loadEddiDevices().catch(this.error) as EddiData[];
    return eddiDevices.map((v) => {
      return {
        name: `Eddi ${v.sno}`,
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
    if (!this._app.clients || Object.keys(this._app.clients).length < 1)
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
