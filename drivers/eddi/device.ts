import { Device } from 'homey';
import { EddiMode, EddiHeaterStatus, MyEnergi, Eddi } from 'myenergi-api';
import { KeyValue } from 'myenergi-api/dist/src/models/KeyValue';
import { MyEnergiApp } from '../../app';
import { EddiSettings } from '../../models/EddiSettings';
import { calculateEnergy } from '../../tools';
import { EddiDriver } from './driver';
import { EddiData } from "./EddiData";

export class EddiDevice extends Device {

  private _callbackId = -1;
  private _onOff: EddiMode = EddiMode.Off;
  private _heaterStatus: EddiHeaterStatus = EddiHeaterStatus.Boost;
  private _lastHeaterStatus: EddiHeaterStatus = EddiHeaterStatus.Boost;
  private _systemVoltage = 0;
  private _heater1Power = 0;
  private _heater2Power = 0;
  private _heater1Name = 'Heater 1';
  private _heater2Name = 'Heater 2';
  private _heater1Current = 0;
  private _heater2Current = 0;
  private _energyTransferred = 0;
  private _generatedPower = 0;
  private _settings!: EddiSettings;
  private _settingsTimeoutHandle?: NodeJS.Timeout;
  private _powerCalculationModeSetToAuto!: boolean;

  private _lastEnergyCalculation: Date = new Date();
  private _lastHeater1Power = 0;
  private _lastHeater2Power = 0;
  private _lastGeneratedPower = 0;

  public deviceId!: string;
  public myenergiClientId!: string;
  public myenergiClient!: MyEnergi;

  /**
   * onInit is called when the device is initialized.
   */
  public async onInit() {
    this._callbackId = (this.driver as EddiDriver).registerDataUpdateCallback((data: EddiData[]) => this.dataUpdated(data)) - 1;
    this.deviceId = this.getData().id;
    this.log(`Device ID: ${this.deviceId}`);
    this.myenergiClientId = this.getStoreValue('myenergiClientId');

    try {
      this.myenergiClient = (this.homey.app as MyEnergiApp).clients[this.myenergiClientId];
      const eddi: Eddi | null = await this.myenergiClient.getStatusEddi(this.deviceId);
      if (eddi) {
        this.calculateValues(eddi); // P=U*I -> I=P/U
        this._lastHeaterStatus = this._heaterStatus;
      }
    } catch (error) {
      this.error(error);
    }

    if (this._settings && (!this._settings.siteName || !this._settings.hubSerial || !this._settings.eddiSerial)) {
      try {
        const { siteNameResult, eddiNameResult: eddiNameResult } = await (this.driver as EddiDriver).getDeviceAndSiteName(this.myenergiClient, this.deviceId);
        const hubSerial = Object.keys(siteNameResult)[0];
        const siteName = Object.values(siteNameResult)[0][0].val;
        const eddiSerial = eddiNameResult[0]?.key;
        await this.setSettings({
          siteName: siteName,
          hubSerial: hubSerial,
          eddiSerial: eddiSerial,
        } as EddiSettings).catch(this.error);

      } catch (error) {
        this.error(error);
      }
    }

    this.validateCapabilities();
    this.setCapabilityValues();
    this.log(`Status: ${this._heaterStatus}`);

    this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));

    this.log('EddiDevice has been initialized');
  }

  private calculateValues(eddi: Eddi) {
    this._heaterStatus = eddi.sta;
    this._heater1Power = eddi.ectp1 ? eddi.ectp1 : 0;
    this._heater2Power = eddi.ectp2 ? eddi.ectp2 : 0;
    this._heater1Name = eddi.ht1 ? eddi.ht1 : this._heater1Name;
    this._heater2Name = eddi.ht2 ? eddi.ht2 : this._heater2Name;
    this._systemVoltage = eddi.vol ? (eddi.vol / 10) : 0;
    this._generatedPower = eddi.gen ? eddi.gen : 0;
    this._energyTransferred = eddi.che ? eddi.che : 0;
    this._heater1Current = (this._systemVoltage > 0) ? (this._heater1Power / this._systemVoltage) : 0; // P=U*I -> I=P/U
    this._heater2Current = (this._systemVoltage > 0) ? (this._heater2Power / this._systemVoltage) : 0; // P=U*I -> I=P/U

    if (this._powerCalculationModeSetToAuto) {
      this._powerCalculationModeSetToAuto = false;
      const tmpSettings =
      {
        includeCT1: true,
        includeCT2: true,
        includeCT3: true,
      };
      this.setSettings(tmpSettings);
    }
  }

  private setCapabilityValues() {
    this.setCapabilityValue('onoff', this._onOff !== EddiMode.Off).catch(this.error);
    this.setCapabilityValue('heater_status', `${this._heaterStatus}`).catch(this.error);
    this.setCapabilityValue('heater_1_name', `${this._heater1Name}`).catch(this.error);
    this.setCapabilityValue('heater_2_name', `${this._heater2Name}`).catch(this.error);
    this.setCapabilityValue('measure_voltage', this._systemVoltage).catch(this.error);
    this.setCapabilityValue('measure_power_ct1', this._heater1Power).catch(this.error);
    this.setCapabilityValue('measure_power_ct2', this._heater2Power).catch(this.error);
    this.setCapabilityValue('measure_current_ct1', this._heater1Current).catch(this.error);
    this.setCapabilityValue('measure_current_ct2', this._heater2Current).catch(this.error);
    this.setCapabilityValue('measure_power_generated', this._generatedPower).catch(this.error);
    this.setCapabilityValue('heater_session_transferred', this._energyTransferred).catch(this.error);

    const meter_power_ct1 = calculateEnergy(this._lastEnergyCalculation, this._lastHeater1Power, this._heater1Power, this.getCapabilityValue('meter_power_ct1'));
    this._lastHeater1Power = this._heater1Power;
    const meter_power_ct2 = calculateEnergy(this._lastEnergyCalculation, this._lastHeater2Power, this._heater2Power, this.getCapabilityValue('meter_power_ct2'));
    this._lastHeater2Power = this._heater2Power;
    const meter_power_gen = calculateEnergy(this._lastEnergyCalculation, this._lastGeneratedPower, this._generatedPower, this.getCapabilityValue('meter_power_generated'));
    this._lastGeneratedPower = this._generatedPower;
    this._lastEnergyCalculation = new Date();

    this.setCapabilityValue('meter_power_ct1', meter_power_ct1).catch(this.error);
    this.setCapabilityValue('meter_power_ct2', meter_power_ct2).catch(this.error);
    this.setCapabilityValue('meter_power_generated', meter_power_gen).catch(this.error);
  }

  private validateCapabilities() {
    this.log(`Validating Eddi capabilities...`);
    const caps = this.getCapabilities();
    caps.forEach(async cap => {
      if (!(this.driver as EddiDriver).capabilities.includes(cap)) {
        try {
          await this.removeCapability(cap);
          this.log(`${cap} - Removed`);
        } catch (error) {
          this.error(error);
        }
      }
    });
    (this.driver as EddiDriver).capabilities.forEach(async cap => {
      try {
        if (!this.hasCapability(cap)) {
          await this.addCapability(cap);
          this.log(`${cap} - Added`);
        } else {
          this.log(`${cap} - OK`);
        }
      } catch (error) {
        this.error(error);
      }
    });
  }

  private dataUpdated(data: EddiData[]) {
    this.log('Received data from driver.');
    if (data) {
      data.forEach((eddi: EddiData) => {
        if (eddi && eddi.sno === this.deviceId) {
          try {
            this._lastHeaterStatus = eddi.sta;
            this.calculateValues(eddi)
            this.setCapabilityValues();
          } catch (error) {
            this.error(error);
          }
        }
      });
    }
  }

  private async setEddiMode(isOn: boolean) {
    try {
      const result = await this.myenergiClient.setEddiMode(this.deviceId, isOn ? EddiMode.On : EddiMode.Off);
      if (result.status !== 0) {
        throw new Error(result);
      }
      this.log(`Eddi was switched ${isOn ? 'on' : 'off'}`);
    } catch (error) {
      this.error(`Switching the Eddi ${isOn ? 'on' : 'off'} failed!`)
      this.error(error);
    }
  }

  public async onCapabilityOnoff(value: boolean, opts: unknown) {
    this.log(`onoff: ${value} - ${opts}`);
    await this.setEddiMode(value).catch(this.error);
    this.setCapabilityValue('onoff', value ? EddiMode.On : EddiMode.Off).catch(this.error);
    this.setCapabilityValue('heater_status', value ? `${this._lastHeaterStatus}` : EddiHeaterStatus.Stopped).catch(this.error);
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  public async onAdded() {
    this.log('EddiDevice has been added');
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
    oldSettings: EddiSettings;
    newSettings: EddiSettings;
    changedKeys: string[];
  }): Promise<string | void> {
    this.log(`EddiDevice settings where changed: ${changedKeys} - ${oldSettings} - ${newSettings}`);
    if (changedKeys.includes('showNegativeValues')) {
      this._settings.showNegativeValues = newSettings.showNegativeValues;
    }
    if (changedKeys.includes('powerCalculationMode')) {
      this._settings.powerCalculationMode = newSettings.powerCalculationMode;
      if (newSettings.powerCalculationMode === "automatic") {
        this._powerCalculationModeSetToAuto = true;
        const eddi = await this.myenergiClient?.getStatusEddi(this.deviceId).catch(this.error);
        if (eddi) {
          this.log(eddi);
          this._settings.includeCT1 = eddi.ectt1 === 'Internal Load';
          this._settings.includeCT2 = eddi.ectt2 === 'Internal Load';
        }
      } else if (newSettings.powerCalculationMode === "manual") {
        this._settings.includeCT1 = newSettings.includeCT1;
        this._settings.includeCT2 = newSettings.includeCT2;
      }
    }
    if (changedKeys.includes('totalEnergyOffset')) {
      const prevEnergy: number = this.getCapabilityValue('meter_power');
      this.setCapabilityValue('meter_power', prevEnergy + (newSettings.totalEnergyOffset ? newSettings.totalEnergyOffset : 0));
      this._settings.totalEnergyOffset = 0;
      // Reset the total energy offset after one second
      this._settingsTimeoutHandle = setTimeout(() => {
        this.setSettings({ totalEnergyOffset: 0 });
        clearTimeout(this._settingsTimeoutHandle);
      }, 1000);
    }
    if (changedKeys.includes('siteName')) {
      this._settings.siteName = newSettings.siteName;
      await this.myenergiClient.setAppKey("siteName", newSettings.siteName as string).catch(this.error);
    }
  }
  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  public async onRenamed(name: string) {
    const result = await this.myenergiClient.setAppKey(`E${this.deviceId}`, name).catch(this.error) as KeyValue[];
    if (result && result.length && result[0].val === name)
      this.log(`EddiDevice was renamed to ${name}`);
    else
      this.error(`Failed to rename EddiDevice to ${name} at myenergi`);
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  public async onDeleted() {
    (this.driver as EddiDriver).removeDataUpdateCallback(this._callbackId);
    this.log('EddiDevice has been deleted');
  }

}

module.exports = EddiDevice;
