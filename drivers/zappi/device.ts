import { Device } from 'homey';
import { MyEnergi, Zappi, ZappiChargeMode, ZappiStatus } from 'myenergi-api';
import { MyEnergiApp } from '../../app';
import { ZappiData, ZappiDriver } from './driver';

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

  public deviceId!: string;
  public myenergiClientId!: string;
  public myenergiClient!: MyEnergi;

  /**
   * onInit is called when the device is initialized.
   */
  public async onInit() {
    this._app = this.homey.app as MyEnergiApp;
    this._driver = this.driver as ZappiDriver;
    this._settings = this.getSettings();
    const device = this;
    this._callbackId = this._driver.registerDataUpdateCallback((data: any) => this.dataUpdated(data)) - 1;
    this.deviceId = this.getData().id;
    this.log(`Device ID: ${this.deviceId}`);
    this.myenergiClientId = this.getStoreValue('myenergiClientId');
    try {
      // Collect data.
      this.myenergiClient = this._app.clients[this.myenergiClientId];
      const zappi: Zappi | null = await this.myenergiClient.getStatusZappi(this.deviceId);
      if (zappi) {
        this.calculateValues(zappi); // P=U*I -> I=P/U
        if (this._chargeMode !== ZappiChargeMode.Off) {
          this._lastOnState = this._chargeMode;
          this._lastChargingStarted = true;
        }
      }
    } catch (error) {
      this.error(error);
    }

    // Set capabilities
    this.setCapabilityValues();
    this.log(`Status: ${this._chargerStatus}`);

    this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
    this.registerCapabilityListener('charge_mode_selector', this.onCapabilityChargeMode.bind(this));

    // Flow logic
    const chargingCondition = this.homey.flow.getConditionCard('is_charging');
    chargingCondition.registerRunListener(async (args, state) => {
      device.log(`Is Charging: ${args} - ${state}`);
      const charging = device._chargerStatus === ZappiStatus.Charging; // true or false
      return charging;
    });

    const startChargingAction = this.homey.flow.getActionCard('start_charging');
    startChargingAction.registerRunListener(async (args, state) => {
      device.log(`Start Charging: ${args} - ${state}`);
      await device.setChargeMode(true);
    });

    const stopChargingAction = this.homey.flow.getActionCard('stop_charging');
    stopChargingAction.registerRunListener(async (args, state) => {
      this.log(`Stop Charging: ${args} - ${state}`);
      await device.setChargeMode(false);
    });

    this.log('ZappiDevice has been initialized');
  }

  // Set capability values from collected values.
  private setCapabilityValues() {
    this.setCapabilityValue('onoff', this._chargeMode !== ZappiChargeMode.Off).catch(this.error);
    this.setCapabilityValue('charge_mode', `${this._chargeMode}`).catch(this.error);
    this.setCapabilityValue('charge_mode_selector', `${this._chargeMode}`).catch(this.error);
    this.setCapabilityValue('charger_status', `${this._chargerStatus}`).catch(this.error);
    this.setCapabilityValue('measure_power', this._chargingPower).catch(this.error);
    this.setCapabilityValue('measure_voltage', this._chargingVoltage).catch(this.error);
    this.setCapabilityValue('measure_current', this._chargingCurrent).catch(this.error);
    this.setCapabilityValue('charge_session_consumption', this._chargeAdded).catch(this.error);
    this.setCapabilityValue('measure_frequency', this._frequency).catch(this.error);
  }

  // Assign and calculate values from Zappi.
  private calculateValues(zappi: Zappi) {
    this._chargeMode = zappi.zmo;
    this._chargerStatus = zappi.pst as ZappiStatus;
    this._chargingPower = 0;
    if ((this._settings.powerCalculationMode === 'automatic' && zappi.ectt1 === 'Internal Load')
      || (this._settings.powerCalculationMode === 'manual' && this._settings.includeCT1)) {
      this._chargingPower += zappi.ectp1 ? zappi.ectp1 : 0;
    }
    if ((this._settings.powerCalculationMode === 'automatic' && zappi.ectt2 === 'Internal Load')
      || (this._settings.powerCalculationMode === 'manual' && this._settings.includeCT2)) {
      this._chargingPower += zappi.ectp2 ? zappi.ectp2 : 0;
    }
    if ((this._settings.powerCalculationMode === 'automatic' && zappi.ectt3 === 'Internal Load')
      || (this._settings.powerCalculationMode === 'manual' && this._settings.includeCT3)) {
      this._chargingPower += zappi.ectp3 ? zappi.ectp3 : 0;
    }
    if ((this._settings.powerCalculationMode === 'automatic' && zappi.ectt4 === 'Internal Load')
      || (this._settings.powerCalculationMode === 'manual' && this._settings.includeCT4)) {
      this._chargingPower += zappi.ectp4 ? zappi.ectp4 : 0;
    }
    if ((this._settings.powerCalculationMode === 'automatic' && zappi.ectt5 === 'Internal Load')
      || (this._settings.powerCalculationMode === 'manual' && this._settings.includeCT5)) {
      this._chargingPower += zappi.ectp5 ? zappi.ectp5 : 0;
    }
    if ((this._settings.powerCalculationMode === 'automatic' && zappi.ectt6 === 'Internal Load')
      || (this._settings.powerCalculationMode === 'manual' && this._settings.includeCT6)) {
      this._chargingPower += zappi.ectp6 ? zappi.ectp6 : 0;
    }

    if (this._settings.showNegativeValues === false) {
      this._chargingPower = this._chargingPower > 0 ? this._chargingPower : 0;
    }

    this._chargingVoltage = zappi.vol ? (zappi.vol / 10) : 0;
    this._chargeAdded = zappi.che ? zappi.che : 0;
    this._frequency = zappi.frq ? zappi.frq : 0;
    this._chargingCurrent = (this._chargingVoltage > 0) ? (this._chargingPower / this._chargingVoltage) : 0; // P=U*I -> I=P/U
  }

  private triggerChargingFlow(chargingStarted: boolean) {
    const device = this; // We're in a Device instance
    const tokens = {};
    const state = {};
    if (chargingStarted === this._lastChargingStarted) {
      return;
    }
    this._lastChargingStarted = chargingStarted;

    this.driver.ready().then(() => {
      if (chargingStarted) {
        (this.driver as ZappiDriver).triggerChargingStartedFlow(device, tokens, state);
      } else {
        (this.driver as ZappiDriver).triggerChargingStoppedFlow(device, tokens, state);
      }
    });
  }

  private dataUpdated(data: ZappiData[]) {
    this.log('Received data from driver.');
    if (data) {
      data.forEach((zappi: ZappiData) => {
        if (zappi && zappi.sno === this.deviceId) {
          try {
            if (zappi.zmo !== ZappiChargeMode.Off) {
              this._lastOnState = zappi.zmo;
            }
            this.calculateValues(zappi);
            this.setCapabilityValues();
          } catch (error) {
            this.error(error);
          }
        }
      });
    }
  }

  private async setChargeMode(isOn: boolean) {
    try {
      const result = await this.myenergiClient.setZappiChargeMode(this.deviceId, isOn ? this._lastOnState : ZappiChargeMode.Off);
      if (result.status !== 0) {
        throw new Error(result);
      }
      this.triggerChargingFlow(isOn);
      this.log(`Zappi was switched ${isOn ? 'on' : 'off'}`);
    } catch (error) {
      this.error(error);
      throw new Error(`Switching the Zappi ${isOn ? 'on' : 'off'} failed!`);
    }
  }

  private async onCapabilityChargeMode(value: any, opts: any) {
    this.log(`Charge Mode: ${value}`);
    this._chargeMode = Number(value);
    if (this._chargeMode !== ZappiChargeMode.Off) {
      this._lastOnState = this._chargeMode;
    }
    await this.setChargeMode(this._chargeMode !== ZappiChargeMode.Off);
    this.setCapabilityValue('onoff', this._chargeMode !== ZappiChargeMode.Off).catch(this.error);
    this.setCapabilityValue('charge_mode', `${this._chargeMode}`).catch(this.error);
  }

  private async onCapabilityOnoff(value: boolean, opts: any) {
    this.log(`onoff: ${value}`);
    await this.setChargeMode(value);
    this.setCapabilityValue('charge_mode', value ? `${this._chargeMode}` : `${ZappiChargeMode.Off}`).catch(this.error);
    this.setCapabilityValue('charge_mode_selector', value ? `${this._chargeMode}` : `${ZappiChargeMode.Off}`).catch(this.error);
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
    this.log(`ZappiDevice settings where changed: ${changedKeys}`);
    if (changedKeys.includes('showNegativeValues')) {
      this._settings.showNegativeValues = newSettings.showNegativeValues;
    }
    if (changedKeys.includes('powerCalculationMode')) {
      if (this._settings.powerCalculationMode === "automatic") {
        const zappi = await this.myenergiClient.getStatusZappi(this.deviceId);
        if (zappi) {
          this.calculateValues(zappi);
          this._settings.includeCT1 = zappi.ectt1 === 'Internal Load';
          this._settings.includeCT2 = zappi.ectt2 === 'Internal Load';
          this._settings.includeCT3 = zappi.ectt3 === 'Internal Load';
          this._settings.includeCT4 = zappi.ectt4 === 'Internal Load';
          this._settings.includeCT5 = zappi.ectt5 === 'Internal Load';
          this._settings.includeCT6 = zappi.ectt6 === 'Internal Load';
          const tmpSettings: any = this._settings;
          this.setSettings({
            includeCT1: tmpSettings.includeCT1,
            includeCT2: tmpSettings.includeCT2,
            includeCT3: tmpSettings.includeCT3,
            includeCT4: tmpSettings.includeCT4,
            includeCT5: tmpSettings.includeCT5,
            includeCT6: tmpSettings.includeCT6,
          });
        }
      } else if (this._settings.powerCalculationMode === "manual") {
        if (changedKeys.includes('includeCT1'))
          this._settings.includeCT1 = newSettings.includeCT1;
        if (changedKeys.includes('includeCT2'))
          this._settings.includeCT2 = newSettings.includeCT2;
        if (changedKeys.includes('includeCT3'))
          this._settings.includeCT3 = newSettings.includeCT3;
        if (changedKeys.includes('includeCT4'))
          this._settings.includeCT4 = newSettings.includeCT4;
        if (changedKeys.includes('includeCT5'))
          this._settings.includeCT5 = newSettings.includeCT5;
        if (changedKeys.includes('includeCT6'))
          this._settings.includeCT6 = newSettings.includeCT6;
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
