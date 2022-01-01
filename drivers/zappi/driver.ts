import { Driver } from 'homey';
import { MyEnergiApp } from '../../app';
import { Zappi } from 'myenergi-api';

export interface ZappiData extends Zappi {
  myenergiClientId: string;
}

export class ZappiDriver extends Driver {

  private _app!: MyEnergiApp;

  private _capabilities: string[] = [
    'onoff',
    'charge_mode_selector',
    'charge_mode',
    'charger_status',
    'charge_session_consumption',
    'measure_power',
    'measure_current',
    'measure_voltage',
    'measure_frequency',
  ];

  private _dataUpdateCallbacks: any[] = [];
  private _chargingStarted: any;
  private _chargingStopped: any;

  public zappiDevices: ZappiData[] = [];
  public get capabilities(): string[] {
    return this._capabilities;
  }

  /**
   * onInit is called when the driver is initialized.
   */
  public async onInit() {
    this._app = this.homey.app as MyEnergiApp;
    this._app.registerDataUpdateCallback((data: any[]) => this.dataUpdated(data));
    this._chargingStarted = this.homey.flow.getDeviceTriggerCard('charging_started');
    this._chargingStopped = this.homey.flow.getDeviceTriggerCard('charging_stopped');
    this.log('ZappiDriver has been initialized');
  }

  public triggerChargingStartedFlow(device: any, tokens: any, state: any) {
    this._chargingStarted
      .trigger(device, tokens, state)
      .then((x: any) => this.log(`triggerChargingStartedFlow: ${x}`))
      .catch(this.error);
  }

  public triggerChargingStoppedFlow(device: any, tokens: any, state: any) {
    this._chargingStopped
      .trigger(device, tokens, state)
      .then((x: any) => this.log(`triggerChargingStoppedFlow: ${x}`))
      .catch(this.error);
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
        if (d.zappi) {
          this._dataUpdateCallbacks.forEach(callback => {
            callback(d.zappi);
          });
        }
      });
    }
  }

  private async loadZappiDevices() {
    const res = new Promise((resolve, reject) => {
      Object.keys(this._app.clients).forEach(async (key, i, arr) => {
        const client = this._app.clients[key];
        const zappis: ZappiData[] = await client.getStatusZappiAll();
        zappis.forEach((zappi: ZappiData) => {
          if (this.zappiDevices.findIndex((z: ZappiData) => z.sno === zappi.sno) === -1) {
            zappi.myenergiClientId = key;
            this.zappiDevices.push(zappi);
          }
        });
        resolve(this.zappiDevices);
      });
    });
    return res;
  }

  private async getZappiDevices() {
    await this.loadZappiDevices();
    return this.zappiDevices.map((v, i, a) => {
      return {
        name: `Zappi ${v.sno}`,
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
    return this.getZappiDevices();
  }

  public async onPair(session: any) {
    session.setHandler('list_devices', () => {
      const devices = this.getZappiDevices();

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

module.exports = ZappiDriver;
