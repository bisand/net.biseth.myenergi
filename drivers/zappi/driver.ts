import { Driver, FlowCardTriggerDevice } from 'homey';
import { Device } from 'homey/lib/FlowCardTriggerDevice';
import { MyEnergi, ZappiChargeMode, ZappiStatus } from 'myenergi-api';
import { MyEnergiApp } from '../../app';
import { Capability } from '../../models/Capability';
import { CapabilityType } from '../../models/CapabilityType';
import { ZappiDevice } from './device';
import { ZappiData } from './ZappiData';

export class ZappiDriver extends Driver {

  private _app!: MyEnergiApp;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _dataUpdateCallbacks: any[] = [];
  private _chargingStarted!: FlowCardTriggerDevice;
  private _chargingStopped!: FlowCardTriggerDevice;
  private _chargeModeChanged!: FlowCardTriggerDevice;
  private _boostModeChanged!: FlowCardTriggerDevice;
  private _evConnected!: FlowCardTriggerDevice;
  private _evDisconnected!: FlowCardTriggerDevice;

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
    new Capability('zappi_boost_kwh_remaining', CapabilityType.Sensor, 20),
    new Capability('ev_connected', CapabilityType.Sensor, 21),
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._app.registerDataUpdateCallback((data: any[]) => this.dataUpdated(data));
    this._chargingStarted = this.homey.flow.getDeviceTriggerCard('charging_started');
    this._chargingStopped = this.homey.flow.getDeviceTriggerCard('charging_stopped');
    this._chargeModeChanged = this.homey.flow.getDeviceTriggerCard('charge_mode_changed');
    this._boostModeChanged = this.homey.flow.getDeviceTriggerCard('boost_mode_changed');
    this._evConnected = this.homey.flow.getDeviceTriggerCard('ev_connected');
    this._evDisconnected = this.homey.flow.getDeviceTriggerCard('ev_disconnected');

    // Flow logic
    const chargingCondition = this.homey.flow.getConditionCard('is_charging');
    chargingCondition.registerRunListener(async (args, state) => {
      const dev: ZappiDevice = args.device;
      if (!dev) {
        this.error('Unable to detect device on flow: is_charging');
        return;
      }
      dev.log(`Is Charging: ${args} - ${state}`);
      const charging = dev.chargerStatus === ZappiStatus.Charging; // true or false
      return charging;
    });

    const startChargingAction = this.homey.flow.getActionCard('start_charging');
    startChargingAction.registerRunListener(async (args, state) => {
      const dev: ZappiDevice = args.device;
      if (!dev) {
        this.error('Unable to detect device on flow: start_charging');
        return;
      }
      dev.log(`Start Charging: ${args} - ${state}`);
      try {
        await dev.setChargerState(true);
      } catch (error) {
        dev.error(error);
      }
    });

    const stopChargingAction = this.homey.flow.getActionCard('stop_charging');
    stopChargingAction.registerRunListener(async (args, state) => {
      const dev: ZappiDevice = args.device;
      if (!dev) {
        this.error('Unable to detect device on flow: stop_charging');
        return;
      }
      dev.log(`Stop Charging: ${args} - ${state}`);
      try {
        await dev.setChargerState(false);
      } catch (error) {
        dev.error(error);
      }
    });

    const setChargeModeAction = this.homey.flow.getActionCard('set_charge_mode');
    setChargeModeAction.registerRunListener(async (args, state) => {
      const dev: ZappiDevice = args.device;
      if (!dev) {
        this.error('Unable to detect device on flow: set_charge_mode');
        return;
      }
      dev.log(`Charge Mode: ${args.charge_mode_txt}`);
      dev.log(`State: ${state}`);
      try {
        dev.chargeMode = dev.getChargeMode(args.charge_mode_txt);
        if (dev.chargeMode !== ZappiChargeMode.Off) {
          dev.lastOnState = dev.chargeMode;
        }
        await dev.setChargeMode(dev.chargeMode);
      } catch (error) {
        dev.error(error);
      }
    });

    const selectChargeModeAction = this.homey.flow.getActionCard('select_charge_mode');
    selectChargeModeAction.registerRunListener(async (args, state) => {
      const dev = args.device;
      if (!dev) {
        this.error('Unable to detect device on flow: select_charge_mode');
        return;
      }
      dev.log(`Charge Mode: ${args.charge_mode_selector}`);
      dev.debug(`State: ${state}`);
      try {
        dev._chargeMode = dev.getChargeMode(args.charge_mode_selector);
        if (dev._chargeMode !== ZappiChargeMode.Off) {
          dev._lastOnState = dev._chargeMode;
        }
        await dev.setChargeMode(dev._chargeMode);
      } catch (error) {
        dev.error(error);
      }
    });

    const setBoostModeAction = this.homey.flow.getActionCard('set_boost_mode');
    setBoostModeAction.registerRunListener(async (args, state) => {
      const dev = args.device;
      if (!dev) {
        this.error('Unable to detect device on flow: set_boost_mode');
        return;
      }
      dev.log(`Boost Mode: ${args.boost_mode_txt}, Boost Mode: ${args.boost_mode_kwh}, Boost Mode: ${args.boost_mode_complete_time}`);
      const kwh = args.boost_mode_kwh ? args.boost_mode_kwh as number : 0;
      const completeTime = dev.getValidBoostTime(args.boost_mode_complete_time ? args.boost_mode_complete_time : '0000');
      dev.log(`Complete time: ${completeTime}`);
      dev.debug(`State: ${state}`);
      try {
        dev._boostMode = dev.getBoostMode(args.boost_mode_txt);
        dev._lastBoostState = dev._boostMode;
        await dev.setBoostMode(dev._boostMode, kwh, completeTime);
      } catch (error) {
        dev.error(error);
      }
    });

    const setMinimumGreenLevelAction = this.homey.flow.getActionCard('set_minimum_green_level');
    setMinimumGreenLevelAction.registerRunListener(async (args, state) => {
      const dev = args.device;
      if (!dev) {
        this.error('Unable to detect device on flow: set_minimum_green_level');
        return;
      }
      dev.log(`Minimum Green Level: ${args.minimum_green_level}`);
      dev.debug(`State: ${state}`);
      dev._minimumGreenLevel = args.minimum_green_level;
      try {
        await dev.setMinimumGreenLevel(dev._minimumGreenLevel);
      } catch (error) {
        dev.error(error);
      }
    });

    this.log('ZappiDriver has been initialized');
  }

  public triggerChargingStartedFlow(device: Device, tokens?: object | undefined, state?: object | undefined) {
    this._chargingStarted
      .trigger(device, tokens, state)
      .then((x: unknown) => this.log(`triggerChargingStartedFlow: ${x}`))
      .catch(this.error);
  }

  public triggerChargingStoppedFlow(device: Device, tokens?: object | undefined, state?: object | undefined) {
    this._chargingStopped
      .trigger(device, tokens, state)
      .then((x: unknown) => this.log(`triggerChargingStoppedFlow: ${x}`))
      .catch(this.error);
  }

  public triggerChargeModeFlow(device: Device, tokens?: object | undefined, state?: object | undefined) {
    this._chargeModeChanged
      .trigger(device, tokens, state)
      .then((x: unknown) => this.log(`triggerChargeModeFlow: ${x}`))
      .catch(this.error);
  }

  public triggerBoostModeFlow(device: Device, tokens?: object | undefined, state?: object | undefined) {
    this._boostModeChanged
      .trigger(device, tokens, state)
      .then((x: unknown) => this.log(`triggerBoostModeFlow: ${x}`))
      .catch(this.error);
  }

  public triggerEvConnectedFlow(device: Device, tokens?: object | undefined, state?: object | undefined) {
    this._evConnected
      .trigger(device, tokens, state)
      .then((x: unknown) => this.log(`triggerEvConnectedFlow: ${x}`))
      .catch(this.error);
  }

  public triggerEvDisconnectedFlow(device: Device, tokens?: object | undefined, state?: object | undefined) {
    this._evDisconnected
      .trigger(device, tokens, state)
      .then((x: unknown) => this.log(`triggerEvDisconnectedFlow: ${x}`))
      .catch(this.error);
  }

  public registerDataUpdateCallback(callback: unknown) {
    return this._dataUpdateCallbacks.push(callback);
  }

  public removeDataUpdateCallback(callbackId: number) {
    this._dataUpdateCallbacks.splice(callbackId, 1);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private dataUpdated(data: any[]) {
    this.log('Received data from app. Relaying to devices.');
    if (data) {
      data.forEach((d) => {
        if (d.zappi) {
          this._dataUpdateCallbacks.forEach(callback => {
            callback(d.zappi);
          });
        }
      });
    }
  }

  private async loadZappiDevices(): Promise<ZappiData[]> {
    for (const key in this._app.clients) {
      if (Object.prototype.hasOwnProperty.call(this._app.clients, key)) {
        const client: MyEnergi = this._app.clients[key];
        const zappis: ZappiData[] = await client.getStatusZappiAll().catch(this.error) as ZappiData[];
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
    const zappiDevices = await this.loadZappiDevices().catch(this.error) as ZappiData[];
    const result = zappiDevices.map((v) => {
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
    if (process.env.DEBUG === '1') {
      try {
        const myenergiClientId = result[0]?.store.myenergiClientId;
        result.push(this.getFakeZappi(myenergiClientId, '99999999', 'Zappi Test 123'));
      } catch (error) {
        this.error(error);
      }
    }
    return result;
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
      const devs = await this.getZappiDevices().catch(this.error);
      return devs ? devs : [];
    } catch (error) {
      throw new Error(`An error occurred while trying to fetch devices. Please check your credentials in the app settings. (${JSON.stringify(error)})`);
    }
  }

  /**
   * Generates a fake Zappi EV charger that can be used for testing/debug porposes.
   * @returns A fake Zappi object.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getFakeZappi(myenergiClientId: string, id: string, name: string): any {
    return {
      name: name,
      data: {
        id: id,
      },
      icon: 'icon.svg',
      store: {
        myenergiClientId: myenergiClientId
      },
      capabilities: [
        "onoff",
        "charge_mode_selector",
        "set_minimum_green_level",
        "button.reset_meter",
        "button.reload_capabilities",
        "charge_mode",
        "charge_mode_txt",
        "charger_status",
        "charger_status_txt",
        "measure_power",
        "measure_current",
        "measure_voltage",
        "measure_frequency",
        "charge_session_consumption",
        "meter_power",
        "zappi_boost_mode",
        "minimum_green_level",
        "zappi_boost_kwh",
        "zappi_boost_time",
        "zappi_boost_kwh_remaining",
        "ev_connected"
      ],
      capabilitiesOptions: {}
    };
  }
}

module.exports = ZappiDriver;
