import { Device } from 'homey';
import { Harvi, MyEnergi } from 'myenergi-api';
import { KeyValue } from 'myenergi-api/dist/src/models/KeyValue';
import { MyEnergiApp } from '../../app';
import { HarviSettings } from '../../models/HarviSettings';
import { HarviDriver } from './driver';
import { HarviData } from "./HarviData";

class HarviDevice extends Device {

  private _callbackId = -1;
  private _ectp1 = 0;
  private _ectp2 = 0;
  private _ectp3 = 0;
  private _ectt1 = '';
  private _ectt2 = '';
  private _ectt3 = '';
  private _power = 0;

  private _lastPowerMeasurement = 0;
  private _lastEnergyCalculation: Date = new Date();
  private _settings!: HarviSettings;
  private _powerCalculationModeSetToAuto!: boolean;
  private _settingsTimeoutHandle!: NodeJS.Timeout;

  public deviceId!: string;
  public myenergiClientId!: string;
  public myenergiClient!: MyEnergi;

  /**
   * onInit is called when the device is initialized.
   */
  public async onInit() {

    // Make sure capabilities are up to date.
    if (this.detectCapabilityChanges()) {
      await this.InitializeCapabilities().catch(this.error);
    }

    this._settings = this.getSettings();
    this._callbackId = (this.driver as HarviDriver).registerDataUpdateCallback((data: HarviData[]) => this.dataUpdated(data)) - 1;
    this.deviceId = this.getData().id;
    this.log(`Device ID: ${this.deviceId}`);
    this.myenergiClientId = this.getStoreValue('myenergiClientId');

    try {
      this.myenergiClient = (this.homey.app as MyEnergiApp).clients[this.myenergiClientId];
      const harvi = await this.myenergiClient.getStatusHarvi(this.deviceId);
      if (harvi) {
        this.calculateValues(harvi);
      }
    } catch (error) {
      this.error(error);
    }

    if (this._settings && (!this._settings.siteName || !this._settings.hubSerial || !this._settings.harviSerial)) {
      try {
        const { siteNameResult, harviNameResult } = await (this.driver as HarviDriver).getDeviceAndSiteName(this.myenergiClient, this.deviceId);
        const hubSerial = Object.keys(siteNameResult)[0];
        const siteName = Object.values(siteNameResult)[0][0].val;
        const harviSerial = harviNameResult[0]?.key;
        await this.setSettings({
          siteName: siteName,
          hubSerial: hubSerial,
          harviSerial: harviSerial,
        } as HarviSettings).catch(this.error);

      } catch (error) {
        this.error(error);
      }
    }

    // Set capabilities
    this.setCapabilityValues();

    this.registerCapabilityListener('button.reset_meter', async () => {
      this.setCapabilityValue('meter_power', 0);
    });
    this.registerCapabilityListener('button.reload_capabilities', async () => {
      this.InitializeCapabilities();
    });

    this.log('HarviDevice has been initialized');
  }

  /**
   * Validate capabilities. Add new and delete removed capabilities.
   */
  private async InitializeCapabilities(): Promise<void> {
    await this.setUnavailable('Harvi is currently doing some maintenance taks and will be back shortly.').catch(this.error);
    this.log(`****** Initializing Harvi sensor capabilities ******`);
    const caps = this.getCapabilities();
    const tmpCaps: { [name: string]: unknown } = {};
    // Remove all capabilities in case the order has changed
    for (const cap of caps) {
      try {
        tmpCaps[cap] = this.getCapabilityValue(cap);
        await this.removeCapability(cap).catch(this.error);
        this.log(`*** ${cap} - Removed`);
      } catch (error) {
        this.error(error);
      }
    }
    // Re-apply all capabilities.
    for (const cap of (this.driver as HarviDriver).capabilities) {
      try {
        if (this.hasCapability(cap))
          continue;
        await this.addCapability(cap).catch(this.error);
        if (tmpCaps[cap])
          this.setCapabilityValue(cap, tmpCaps[cap]);
        this.log(`*** ${cap} - Added`);
      } catch (error) {
        this.error(error);
      }
    }
    this.log(`****** Sensor capability initialization complete ******`);
    this.setAvailable().catch(this.error);
  }

  /**
   * Validate capabilities. Add new and delete removed capabilities.
   */
  private detectCapabilityChanges(): boolean {
    let result = false;
    this.log(`Detecting Harvi capability changes...`);
    const caps = this.getCapabilities();
    for (const cap of caps) {
      if (!(this.driver as HarviDriver).capabilities.includes(cap)) {
        this.log(`Harvi capability ${cap} was removed.`);
        result = true;
      }
    }
    for (const cap of (this.driver as HarviDriver).capabilities) {
      if (!this.hasCapability(cap)) {
        this.log(`Harvi capability ${cap} was added.`);
        result = true;
      }
    }
    if (!result)
      this.log('No changes in capabilities.');
    return result;
  }

  private calculateValues(harvi: Harvi) {
    this._ectp1 = harvi.ectp1;
    this._ectp2 = harvi.ectp2;
    this._ectp3 = harvi.ectp3;
    this._ectt1 = harvi.ectt1;
    this._ectt2 = harvi.ectt2;
    this._ectt3 = harvi.ectt3;
    this._power = 0;

    if ((this._settings.powerCalculationMode === 'automatic')
      || (this._settings.powerCalculationMode === 'manual' && this._settings.includeCT1)) {
      this._power += harvi.ectp1 ? harvi.ectp1 : 0;
    }
    if ((this._settings.powerCalculationMode === 'automatic')
      || (this._settings.powerCalculationMode === 'manual' && this._settings.includeCT2)) {
      this._power += harvi.ectp2 ? harvi.ectp2 : 0;
    }
    if ((this._settings.powerCalculationMode === 'automatic')
      || (this._settings.powerCalculationMode === 'manual' && this._settings.includeCT3)) {
      this._power += harvi.ectp3 ? harvi.ectp3 : 0;
    }

    if (this._settings.showNegativeValues === false) {
      this._power = this._power > 0 ? this._power : 0;
    }

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
    this.setCapabilityValue('measure_power_ct1', this._ectp1 ? this._ectp1 : 0).catch(this.error);
    this.setCapabilityValue('measure_power_ct2', this._ectp2 ? this._ectp2 : 0).catch(this.error);
    this.setCapabilityValue('measure_power_ct3', this._ectp3 ? this._ectp3 : 0).catch(this.error);
    this.setCapabilityValue('ct1_type', this._ectt1).catch(this.error);
    this.setCapabilityValue('ct2_type', this._ectt2).catch(this.error);
    this.setCapabilityValue('ct3_type', this._ectt3).catch(this.error);
    this.setCapabilityValue('measure_power', this._power ? this._power : 0).catch(this.error);
    this.setCapabilityValue('meter_power', this.calculateEnergy()).catch(this.error);
  }

  /**
   * Calculate accumulated kWh since last power measurement
   * @returns Accumulated kWh 
   */
  private calculateEnergy(): number {
    const dateNow = new Date();
    const seconds = Math.abs((dateNow.getTime() - this._lastEnergyCalculation.getTime()) / 1000);
    const prevEnergy: number = this.getCapabilityValue('meter_power');
    const newEnergy: number = prevEnergy + ((((this._lastPowerMeasurement + this._power) / 2) * seconds) / 3600000);
    this.log(`Energy algo: ${prevEnergy} + ((((${this._lastPowerMeasurement} + ${this._power}) / 2) * ${seconds}) / 3600000)`);
    this._lastPowerMeasurement = this._power;
    this._lastEnergyCalculation = dateNow;
    return newEnergy;
  }

  private dataUpdated(data: HarviData[]) {
    this.log('Received data from driver.');
    if (data) {
      data.forEach(harvi => {
        if (harvi && harvi.sno === this.deviceId) {
          try {
            this.calculateValues(harvi);
            this.setCapabilityValues();
          } catch (error) {
            this.error(error);
          }
        }
      });
    }
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  public async onAdded() {
    this.log('HarviDevice has been added');
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
    oldSettings: HarviSettings;
    newSettings: HarviSettings;
    changedKeys: string[];
  }): Promise<string | void> {
    this.log(`HarviDevice settings where changed: ${changedKeys} - ${oldSettings} - ${newSettings}`);
    if (changedKeys.includes('showNegativeValues')) {
      this._settings.showNegativeValues = newSettings.showNegativeValues;
    }
    if (changedKeys.includes('powerCalculationMode')) {
      this._settings.powerCalculationMode = newSettings.powerCalculationMode;
      if (newSettings.powerCalculationMode === "automatic") {
        this._powerCalculationModeSetToAuto = true;
        const harvi = await this.myenergiClient?.getStatusHarvi(this.deviceId).catch(this.error);
        if (harvi) {
          this.log(harvi);
          this._settings.includeCT1 = harvi.ectt1 === 'Internal Load';
          this._settings.includeCT2 = harvi.ectt2 === 'Internal Load';
          this._settings.includeCT3 = harvi.ectt3 === 'Internal Load';
        }
      } else if (newSettings.powerCalculationMode === "manual") {
        this._settings.includeCT1 = newSettings.includeCT1;
        this._settings.includeCT2 = newSettings.includeCT2;
        this._settings.includeCT3 = newSettings.includeCT3;
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
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  public async onRenamed(name: string) {
    const result = await this.myenergiClient.setAppKey(`H${this.deviceId}`, name).catch(this.error) as KeyValue[];
    if (result && result.length && result[0].val === name)
      this.log(`HarviDevice was renamed to ${name}`);
    else
      this.error(`Failed to rename HarviDevice to ${name} at myenergi`);
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  public async onDeleted() {
    (this.driver as HarviDriver).removeDataUpdateCallback(this._callbackId);
    this.log('HarviDevice has been deleted');
  }

}

module.exports = HarviDevice;
