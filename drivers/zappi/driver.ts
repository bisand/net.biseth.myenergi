import { Driver, FlowCardTriggerDevice } from 'homey';
import { MyEnergiApp } from '../../app';
import { Capability } from '../../models/Capability';
import { CapabilityType } from '../../models/CapabilityType';
import { ZappiData } from './ZappiData';

export class ZappiDriver extends Driver {

  private _app!: MyEnergiApp;

  private _dataUpdateCallbacks: any[] = [];
  private _chargingStarted!: FlowCardTriggerDevice;
  private _chargingStopped!: FlowCardTriggerDevice;
  private _chargeModeChanged!: FlowCardTriggerDevice;
  private _boostModeChanged!: FlowCardTriggerDevice;

  private _capabilities: Capability[] = [
    new Capability('onoff', CapabilityType.Control, 1),
    new Capability('charge_mode_selector', CapabilityType.Control, 2),
    new Capability('button.reset_meter', CapabilityType.Control, 3),
    new Capability('button.reload_capabilities', CapabilityType.Control, 4),
    new Capability('set_minimum_green_level', CapabilityType.Control, 5),
    new Capability('charge_mode', CapabilityType.Sensor, 6),
    new Capability('charge_mode_txt', CapabilityType.Sensor, 7),
    new Capability('charger_status', CapabilityType.Sensor, 8),
    new Capability('charger_status_txt', CapabilityType.Sensor, 9),
    new Capability('charge_session_consumption', CapabilityType.Sensor, 10),
    new Capability('meter_power', CapabilityType.Sensor, 11),
    new Capability('measure_power', CapabilityType.Sensor, 12),
    new Capability('measure_current', CapabilityType.Sensor, 13),
    new Capability('measure_voltage', CapabilityType.Sensor, 14),
    new Capability('measure_frequency', CapabilityType.Sensor, 15),
    new Capability('zappi_boost_mode', CapabilityType.Sensor, 16),
    new Capability('minimum_green_level', CapabilityType.Sensor, 17),
    new Capability('zappi_boost_kwh', CapabilityType.Sensor, 18),
    new Capability('zappi_boost_time', CapabilityType.Sensor, 19),
  ];

  public zappiDevices: ZappiData[] = [];
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
    this._app = this.homey.app as MyEnergiApp;
    this._app.registerDataUpdateCallback((data: any[]) => this.dataUpdated(data));
    this._chargingStarted = this.homey.flow.getDeviceTriggerCard('charging_started');
    this._chargingStopped = this.homey.flow.getDeviceTriggerCard('charging_stopped');
    this._chargeModeChanged = this.homey.flow.getDeviceTriggerCard('charge_mode_changed');
    this._boostModeChanged = this.homey.flow.getDeviceTriggerCard('boost_mode_changed');
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

  public triggerChargeModeFlow(device: any, tokens: any, state: any) {
    this._chargeModeChanged
      .trigger(device, tokens, state)
      .then((x: any) => this.log(`triggerChargeModeFlow: ${x}`))
      .catch(this.error);
  }

  public triggerBoostModeFlow(device: any, tokens: any, state: any) {
    this._boostModeChanged
      .trigger(device, tokens, state)
      .then((x: any) => this.log(`triggerBoostModeFlow: ${x}`))
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

  private async loadZappiDevices(): Promise<ZappiData[]> {
    if (!this._app.clients || this._app.clients.length < 1)
      throw new Error("Can not find any myenergi hubs. Please add the hub credentials under myenergi app settings.");

    for (const key in this._app.clients) {
      if (Object.prototype.hasOwnProperty.call(this._app.clients, key)) {
        const client = this._app.clients[key];
        const zappis: ZappiData[] = await client.getStatusZappiAll();
        for (const zappi of zappis) {
          if (this.zappiDevices.findIndex((z: ZappiData) => z.sno === zappi.sno) === -1) {
            zappi.myenergiClientId = key;
            this.zappiDevices.push(zappi);
          }
        }
        return this.zappiDevices;
      }
    }
    return [];
  }

  private async getZappiDevices() {
    const zappiDevices = await this.loadZappiDevices();
    return zappiDevices.map((v, i, a) => {
      return {
        name: `Zappi ${v.sno}`,
        data: { id: v.sno },
        icon: 'icon.svg', // relative to: /drivers/<driver_id>/assets/
        store: {
          myenergiClientId: v.myenergiClientId,
        },
        capabilities: this.capabilities,
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
    try {
      const devs = await this.getZappiDevices();
      return devs ? devs : [];
    } catch (error) {
      throw new Error(`An error occurred while trying to fetch devices. Please check your credentials in the app settings. (${JSON.stringify(error)})`);
    }
  }

}

module.exports = ZappiDriver;
