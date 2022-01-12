import { Device } from 'homey';
import { MyEnergi, Zappi, ZappiChargeMode, ZappiStatus } from 'myenergi-api';
import { MyEnergiApp } from '../../app';
import { ZappiDriver } from './driver';
import { ZappiData } from "./ZappiData";

export class ZappiDevice extends Device {

  private _app!: MyEnergiApp;
  private _driver!: ZappiDriver;

  private _callbackId: number = -1;
  private _chargeMode: ZappiChargeMode = ZappiChargeMode.Fast;
  private _lastOnState: ZappiChargeMode = ZappiChargeMode.Fast;
  private _lastChargingStarted: boolean = false;
  private _chargerStatus: ZappiStatus = ZappiStatus.EvDisconnected;
  private _chargingPower: number = 0;
  private _chargingVoltage: number = 0;
  private _chargingCurrent: number = 0;
  private _chargeAdded: number = 0;
  private _frequency: number = 0;
  private _settings: any;
  private _powerCalculationModeSetToAuto!: boolean;

  private _lastEnergyUpdate: Date = new Date();
  private _lastPowerMeasure: number = 0;

  public deviceId!: string;
  public myenergiClientId!: string;
  public myenergiClient!: MyEnergi;

  /**
   * onInit is called when the device is initialized.
   */
  public async onInit() {
    const dev = this as ZappiDevice;

    dev._app = dev.homey.app as MyEnergiApp;
    dev._driver = dev.driver as ZappiDriver;
    dev._settings = dev.getSettings();
    dev._callbackId = dev._driver.registerDataUpdateCallback((data: any) => dev.dataUpdated(data)) - 1;
    dev.deviceId = dev.getData().id;
    dev.myenergiClientId = dev.getStoreValue('myenergiClientId');
    dev.validateCapabilities();

    try {
      // Collect data.
      dev.myenergiClient = dev._app.clients[dev.myenergiClientId];
      const zappi: Zappi | null = await dev.myenergiClient.getStatusZappi(dev.deviceId);
      if (zappi) {
        dev.calculateValues(zappi); // P=U*I -> I=P/U
        if (dev._chargeMode !== ZappiChargeMode.Off) {
          dev._lastOnState = dev._chargeMode;
          dev._lastChargingStarted = true;
        }
      }
    } catch (error) {
      dev.error(error);
    }

    // Set capabilities
    dev.setCapabilityValues();
    dev.log(`Status: ${dev._chargerStatus}`);

    dev.registerCapabilityListener('onoff', dev.onCapabilityOnoff.bind(this));
    dev.registerCapabilityListener('charge_mode_selector', dev.onCapabilityChargeMode.bind(this));

    // Flow logic
    const chargingCondition = dev.homey.flow.getConditionCard('is_charging');
    chargingCondition.registerRunListener(async (args, state) => {
      dev.log(`Is Charging: ${args} - ${state}`);
      const charging = dev._chargerStatus === ZappiStatus.Charging; // true or false
      return charging;
    });

    const startChargingAction = dev.homey.flow.getActionCard('start_charging');
    startChargingAction.registerRunListener(async (args, state) => {
      dev.log(`Start Charging: ${args} - ${state}`);
      await dev.setChargeMode(true);
    });

    const stopChargingAction = dev.homey.flow.getActionCard('stop_charging');
    stopChargingAction.registerRunListener(async (args, state) => {
      dev.log(`Stop Charging: ${args} - ${state}`);
      await dev.setChargeMode(false);
    });

    dev.log(`ZappiDevice ${dev.deviceId} has been initialized`);
  }

  private validateCapabilities() {
    const dev: ZappiDevice = this;
    dev.log(`Validating Zappi capabilities...`);
    const caps = dev.getCapabilities();
    caps.forEach(async cap => {
      if (!dev._driver.capabilities.includes(cap)) {
        try {
          await dev.removeCapability(cap);
          dev.log(`${cap} - Removed`);
        } catch (error) {
          dev.error(error);
        }
      }
    });
    dev._driver.capabilities.forEach(async cap => {
      try {
        if (!dev.hasCapability(cap)) {
          await dev.addCapability(cap);
          dev.log(`${cap} - Added`);
        } else {
          dev.log(`${cap} - OK`);
        }
      } catch (error) {
        dev.error(error);
      }
    });
  }
  private _getRndInteger(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Set capability values from collected values.
  private setCapabilityValues() {
    const dev: ZappiDevice = this;
    //dev._chargingPower = this._getRndInteger(3000, 7200);
    dev.setCapabilityValue('onoff', dev._chargeMode !== ZappiChargeMode.Off).catch(dev.error);
    dev.setCapabilityValue('charge_mode', `${dev._chargeMode}`).catch(dev.error);
    dev.setCapabilityValue('charge_mode_selector', `${dev._chargeMode}`).catch(dev.error);
    dev.setCapabilityValue('charger_status', `${dev._chargerStatus}`).catch(dev.error);
    dev.setCapabilityValue('measure_power', dev._chargingPower ? dev._chargingPower : 0).catch(dev.error);
    dev.setCapabilityValue('measure_voltage', dev._chargingVoltage ? dev._chargingVoltage : 0).catch(dev.error);
    dev.setCapabilityValue('measure_current', dev._chargingCurrent ? dev._chargingCurrent : 0).catch(dev.error);
    dev.setCapabilityValue('charge_session_consumption', dev._chargeAdded ? dev._chargeAdded : 0).catch(dev.error);
    dev.setCapabilityValue('measure_frequency', dev._frequency ? dev._frequency : 0).catch(dev.error);

    // Calculate energy usage.
    const energyUpdated = new Date();
    var seconds = Math.abs((energyUpdated.getTime() - this._lastEnergyUpdate.getTime()) / 1000);
    let prevEnergy: number = dev.getCapabilityValue('meter_power');
    let newEnergy: number = prevEnergy + ((((this._lastPowerMeasure + dev._chargingPower) / 2) * seconds) / 3600000)
    dev.log(`Energy algo: ${prevEnergy} + ((((${this._lastPowerMeasure} + ${dev._chargingPower}) / 2) * ${seconds}) / 3600000)`);
    this._lastPowerMeasure = dev._chargingPower;
    this._lastEnergyUpdate = energyUpdated;

    // Set energy capability.
    dev.setCapabilityValue('meter_power', newEnergy).catch(dev.error);
  }

  // Assign and calculate values from Zappi.
  private calculateValues(zappi: Zappi) {
    const dev: ZappiDevice = this;
    dev._chargeMode = zappi.zmo;
    dev._chargerStatus = zappi.pst as ZappiStatus;
    dev._chargingPower = 0;
    if ((dev._settings.powerCalculationMode === 'automatic' && zappi.ectt1 === 'Internal Load')
      || (dev._settings.powerCalculationMode === 'manual' && dev._settings.includeCT1)) {
      dev._chargingPower += zappi.ectp1 ? zappi.ectp1 : 0;
    }
    if ((dev._settings.powerCalculationMode === 'automatic' && zappi.ectt2 === 'Internal Load')
      || (dev._settings.powerCalculationMode === 'manual' && dev._settings.includeCT2)) {
      dev._chargingPower += zappi.ectp2 ? zappi.ectp2 : 0;
    }
    if ((dev._settings.powerCalculationMode === 'automatic' && zappi.ectt3 === 'Internal Load')
      || (dev._settings.powerCalculationMode === 'manual' && dev._settings.includeCT3)) {
      dev._chargingPower += zappi.ectp3 ? zappi.ectp3 : 0;
    }
    if ((dev._settings.powerCalculationMode === 'automatic' && zappi.ectt4 === 'Internal Load')
      || (dev._settings.powerCalculationMode === 'manual' && dev._settings.includeCT4)) {
      dev._chargingPower += zappi.ectp4 ? zappi.ectp4 : 0;
    }
    if ((dev._settings.powerCalculationMode === 'automatic' && zappi.ectt5 === 'Internal Load')
      || (dev._settings.powerCalculationMode === 'manual' && dev._settings.includeCT5)) {
      dev._chargingPower += zappi.ectp5 ? zappi.ectp5 : 0;
    }
    if ((dev._settings.powerCalculationMode === 'automatic' && zappi.ectt6 === 'Internal Load')
      || (dev._settings.powerCalculationMode === 'manual' && dev._settings.includeCT6)) {
      dev._chargingPower += zappi.ectp6 ? zappi.ectp6 : 0;
    }

    if (dev._settings.showNegativeValues === false) {
      dev._chargingPower = dev._chargingPower > 0 ? dev._chargingPower : 0;
    }

    dev._chargingVoltage = zappi.vol ? (zappi.vol / 10) : 0;
    dev._chargeAdded = zappi.che ? zappi.che : 0;
    dev._frequency = zappi.frq ? zappi.frq : 0;
    dev._chargingCurrent = (dev._chargingVoltage > 0) ? (dev._chargingPower / dev._chargingVoltage) : 0; // P=U*I -> I=P/U

    if (dev._powerCalculationModeSetToAuto) {
      dev._powerCalculationModeSetToAuto = false;
      const tmpSettings: any =
      {
        includeCT1: zappi.ectt1 === 'Internal Load',
        includeCT2: zappi.ectt2 === 'Internal Load',
        includeCT3: zappi.ectt3 === 'Internal Load',
        includeCT4: zappi.ectt4 === 'Internal Load',
        includeCT5: zappi.ectt5 === 'Internal Load',
        includeCT6: zappi.ectt6 === 'Internal Load',
      };

      dev.setSettings(tmpSettings);
    }
  }

  private triggerChargingFlow(chargingStarted: boolean) {
    const dev: ZappiDevice = this;
    const tokens = {};
    const state = {};
    if (chargingStarted === dev._lastChargingStarted) {
      return;
    }
    dev._lastChargingStarted = chargingStarted;

    dev.driver.ready().then(() => {
      if (chargingStarted) {
        (dev.driver as ZappiDriver).triggerChargingStartedFlow(dev, tokens, state);
      } else {
        (dev.driver as ZappiDriver).triggerChargingStoppedFlow(dev, tokens, state);
      }
    });
  }

  private dataUpdated(data: ZappiData[]) {
    const dev: ZappiDevice = this;
    dev.log('Received data from driver.');
    if (data) {
      data.forEach((zappi: ZappiData) => {
        if (zappi && zappi.sno === dev.deviceId) {
          try {
            if (zappi.zmo !== ZappiChargeMode.Off) {
              dev._lastOnState = zappi.zmo;
            }
            dev.calculateValues(zappi);
            dev.setCapabilityValues();
          } catch (error) {
            dev.error(error);
          }
        }
      });
    }
  }

  private async setChargeMode(isOn: boolean) {
    const dev: ZappiDevice = this;
    try {
      const result = await dev.myenergiClient.setZappiChargeMode(dev.deviceId, isOn ? dev._lastOnState : ZappiChargeMode.Off);
      if (result.status !== 0) {
        throw new Error(result);
      }
      dev.triggerChargingFlow(isOn);
      dev.log(`Zappi was switched ${isOn ? 'on' : 'off'}`);
    } catch (error) {
      dev.error(error);
      throw new Error(`Switching the Zappi ${isOn ? 'on' : 'off'} failed!`);
    }
  }

  private async onCapabilityChargeMode(value: any, opts: any) {
    const dev: ZappiDevice = this;
    dev.log(`Charge Mode: ${value}`);
    dev._chargeMode = Number(value);
    if (dev._chargeMode !== ZappiChargeMode.Off) {
      dev._lastOnState = dev._chargeMode;
    }
    await dev.setChargeMode(dev._chargeMode !== ZappiChargeMode.Off);
    dev.setCapabilityValue('onoff', dev._chargeMode !== ZappiChargeMode.Off).catch(dev.error);
    dev.setCapabilityValue('charge_mode', `${dev._chargeMode}`).catch(dev.error);
  }

  private async onCapabilityOnoff(value: boolean, opts: any) {
    const dev: ZappiDevice = this;
    dev.log(`onoff: ${value}`);
    await dev.setChargeMode(value);
    dev.setCapabilityValue('charge_mode', value ? `${dev._chargeMode}` : `${ZappiChargeMode.Off}`).catch(dev.error);
    dev.setCapabilityValue('charge_mode_selector', value ? `${dev._chargeMode}` : `${ZappiChargeMode.Off}`).catch(dev.error);
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  public async onAdded() {
    this.log('ZappiDevice has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  public async onSettings({ oldSettings, newSettings, changedKeys }: {
    oldSettings: any;
    newSettings: any;
    changedKeys: string[];
  }): Promise<string | void> {
    const dev: ZappiDevice = this;
    dev.log(`ZappiDevice settings where changed: ${changedKeys}`);
    if (changedKeys.includes('showNegativeValues')) {
      dev._settings.showNegativeValues = newSettings.showNegativeValues;
    }
    if (changedKeys.includes('powerCalculationMode')) {
      dev._settings.powerCalculationMode = newSettings.powerCalculationMode;
      if (newSettings.powerCalculationMode === "automatic") {
        dev._powerCalculationModeSetToAuto = true;
        const zappi = await dev.myenergiClient.getStatusZappi(dev.deviceId);
        if (zappi) {
          dev.log(zappi);
          const tmpSettings: any =
          {
            includeCT1: zappi.ectt1 === 'Internal Load',
            includeCT2: zappi.ectt2 === 'Internal Load',
            includeCT3: zappi.ectt3 === 'Internal Load',
            includeCT4: zappi.ectt4 === 'Internal Load',
            includeCT5: zappi.ectt5 === 'Internal Load',
            includeCT6: zappi.ectt6 === 'Internal Load',
          };

          Object.keys(tmpSettings).forEach(key => dev._settings[key] = tmpSettings[key]);
        }
      } else if (newSettings.powerCalculationMode === "manual") {
        dev._settings.includeCT1 = newSettings.includeCT1;
        dev._settings.includeCT2 = newSettings.includeCT2;
        dev._settings.includeCT3 = newSettings.includeCT3;
        dev._settings.includeCT4 = newSettings.includeCT4;
        dev._settings.includeCT5 = newSettings.includeCT5;
        dev._settings.includeCT6 = newSettings.includeCT6;
      }
    }
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  public async onRenamed(name: any) {
    this.log('ZappiDevice was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  public async onDeleted() {
    (this.driver as ZappiDriver).removeDataUpdateCallback(this._callbackId);
    this.log('ZappiDevice has been deleted');
  }

}

module.exports = ZappiDevice;
