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
  private _systemFrequency = 0.0;
  private _ct1Type = 'None';
  private _ct2Type = 'None';
  private _ct3Type = 'None';
  private _ct1Power = 0;
  private _ct2Power = 0;
  private _ct3Power = 0;
  private _heater1Name = 'Heater 1';
  private _heater2Name = 'Heater 2';
  private _ct1Current = 0;
  private _ct2Current = 0;
  private _ct3Current = 0;
  private _generatedPower = 0;
  private _settings!: EddiSettings;
  private _powerCalculationModeSetToAuto!: boolean;

  private _lastEnergyCalculation: Date = new Date();
  private _lastCT1Power = 0;
  private _lastCT2Power = 0;
  private _lastCT3Power = 0;
  private _lastGeneratedPower = 0;

  private _settingsTimeoutHandle?: NodeJS.Timeout;

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
    this._callbackId = (this.driver as EddiDriver).registerDataUpdateCallback((data: EddiData[]) => this.dataUpdated(data)) - 1;
    this.deviceId = this.getData().id;
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

    this.setCapabilityValues();
    this.log(`Status: ${this._heaterStatus}`);

    this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));

    this.registerCapabilityListener('button.reset_meter', async () => {
      this.setCapabilityValue('meter_power', 0);
    });
    this.registerCapabilityListener('button.reset_meter_ct1', async () => {
      this.setCapabilityValue('meter_power_ct1', 0);
    });
    this.registerCapabilityListener('button.reset_meter_ct2', async () => {
      this.setCapabilityValue('meter_power_ct2', 0);
    });
    this.registerCapabilityListener('button.reset_meter_ct3', async () => {
      this.setCapabilityValue('meter_power_ct3', 0);
    });
    this.registerCapabilityListener('button.reset_meter_generated', async () => {
      this.setCapabilityValue('meter_power_generated', 0);
    });
    this.registerCapabilityListener('button.reload_capabilities', async () => {
      this.InitializeCapabilities();
    });

    this.log('EddiDevice has been initialized');
  }

  /**
   * Validate capabilities. Add new and delete removed capabilities.
   */
  private async InitializeCapabilities(): Promise<void> {
    await this.setUnavailable('Zappi is currently doing some maintenance taks and will be back shortly.').catch(this.error);
    this.log(`****** Initializing Zappi sensor capabilities ******`);
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
    for (const cap of (this.driver as EddiDriver).capabilities) {
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
    this.log(`Detecting Zappi capability changes...`);
    const caps = this.getCapabilities();
    for (const cap of caps) {
      if (!(this.driver as EddiDriver).capabilities.includes(cap)) {
        this.log(`Zappi capability ${cap} was removed.`);
        result = true;
      }
    }
    for (const cap of (this.driver as EddiDriver).capabilities) {
      if (!this.hasCapability(cap)) {
        this.log(`Zappi capability ${cap} was added.`);
        result = true;
      }
    }
    if (!result)
      this.log('No changes in capabilities.');
    return result;
  }

  private calculateValues(eddi: Eddi) {
    this._onOff = (eddi.sta === EddiHeaterStatus.Stopped) ? EddiMode.Off : EddiMode.On;
    this._heaterStatus = eddi.sta;
    this._ct1Power = eddi.ectp1 ? eddi.ectp1 : 0;
    this._ct2Power = eddi.ectp2 ? eddi.ectp2 : 0;
    this._ct3Power = eddi.ectp3 ? eddi.ectp3 : 0;
    this._ct1Type = eddi.ectt1;
    this._ct2Type = eddi.ectt2;
    this._ct3Type = eddi.ectt3;
    this._heater1Name = eddi.ht1 ? eddi.ht1 : this._heater1Name;
    this._heater2Name = eddi.ht2 ? eddi.ht2 : this._heater2Name;
    this._systemVoltage = eddi.vol ? (eddi.vol / 10) : 0;
    this._systemFrequency = eddi.frq;
    this._generatedPower = eddi.gen ? eddi.gen : 0;
    this._ct1Current = (this._systemVoltage > 0) ? (this._ct1Power / this._systemVoltage) : 0; // P=U*I -> I=P/U
    this._ct2Current = (this._systemVoltage > 0) ? (this._ct2Power / this._systemVoltage) : 0; // P=U*I -> I=P/U
    this._ct3Current = (this._systemVoltage > 0) ? (this._ct3Power / this._systemVoltage) : 0; // P=U*I -> I=P/U

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
    this.setCapabilityValue('measure_frequency', this._systemFrequency).catch(this.error);
    this.setCapabilityValue('ct1_type', this._ct1Type).catch(this.error);
    this.setCapabilityValue('ct2_type', this._ct2Type).catch(this.error);
    this.setCapabilityValue('ct3_type', this._ct3Type).catch(this.error);
    this.setCapabilityValue('measure_power_ct1', this._ct1Power).catch(this.error);
    this.setCapabilityValue('measure_power_ct2', this._ct2Power).catch(this.error);
    this.setCapabilityValue('measure_power_ct3', this._ct3Power).catch(this.error);
    this.setCapabilityValue('measure_current_ct1', this._ct1Current).catch(this.error);
    this.setCapabilityValue('measure_current_ct2', this._ct2Current).catch(this.error);
    this.setCapabilityValue('measure_current_ct3', this._ct3Current).catch(this.error);
    this.setCapabilityValue('measure_power_generated', this._generatedPower).catch(this.error);

    const meter_power_prev = this.getCapabilityValue('meter_power');
    const meter_power_ct1_prev = this.getCapabilityValue('meter_power_ct1');
    const meter_power_ct1 = calculateEnergy(this._lastEnergyCalculation, this._lastCT1Power, this._ct1Power, 0);
    this._lastCT1Power = this._ct1Power;
    const meter_power_ct2_prev = this.getCapabilityValue('meter_power_ct2');
    const meter_power_ct2 = calculateEnergy(this._lastEnergyCalculation, this._lastCT2Power, this._ct2Power, 0);
    this._lastCT2Power = this._ct2Power;
    const meter_power_ct3_prev = this.getCapabilityValue('meter_power_ct3');
    const meter_power_ct3 = calculateEnergy(this._lastEnergyCalculation, this._lastCT3Power, this._ct3Power, 0);
    this._lastCT3Power = this._ct3Power;
    const meter_power_gen_prev = this.getCapabilityValue('meter_power_generated');
    const meter_power_gen = calculateEnergy(this._lastEnergyCalculation, this._lastGeneratedPower, this._generatedPower, 0);
    this._lastGeneratedPower = this._generatedPower;
    this._lastEnergyCalculation = new Date();

    this.setCapabilityValue('meter_power_ct1', meter_power_ct1_prev + meter_power_ct1).catch(this.error);
    this.setCapabilityValue('meter_power_ct2', meter_power_ct2_prev + meter_power_ct2).catch(this.error);
    this.setCapabilityValue('meter_power_ct3', meter_power_ct3_prev + meter_power_ct3).catch(this.error);
    this.setCapabilityValue('meter_power_generated', meter_power_gen_prev + meter_power_gen).catch(this.error);
    this.setCapabilityValue('meter_power', meter_power_prev + ((meter_power_ct1 + meter_power_ct2 + meter_power_ct3) - meter_power_gen)).catch(this.error);
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
    if (process.env.DEBUG === '1') this.log('Received data from driver.');
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

  /**
   * Event handler for onoff capability listener
   * @param value On or off
   * @param opts Options
   */
  public async onCapabilityOnoff(value: boolean, opts: unknown) {
    this.log(`onoff: ${value} - ${opts}`);
    await this.setEddiMode(value).catch(this.error);
    this.setCapabilityValue('onoff', value).catch(this.error);
    this.setCapabilityValue('heater_status', value ? `${this._lastHeaterStatus}` : `${EddiHeaterStatus.Stopped}`).catch(this.error);
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
          this._settings.includeCT3 = eddi.ectt3 === 'Internal Load';
        }
      } else if (newSettings.powerCalculationMode === "manual") {
        this._settings.includeCT1 = newSettings.includeCT1;
        this._settings.includeCT2 = newSettings.includeCT2;
        this._settings.includeCT3 = newSettings.includeCT3;
      }
    }
    if (changedKeys.includes('energyOffsetTotal')) {
      const prevEnergy: number = this.getCapabilityValue('meter_power');
      this.setCapabilityValue('meter_power', prevEnergy + (newSettings.energyOffsetTotal ? newSettings.energyOffsetTotal : 0));
      this._settings.energyOffsetTotal = 0;
    }
    if (changedKeys.includes('energyOffsetCT1')) {
      const prevEnergy: number = this.getCapabilityValue('meter_power_ct1');
      this.setCapabilityValue('meter_power_ct1', prevEnergy + (newSettings.energyOffsetCT1 ? newSettings.energyOffsetCT1 : 0));
      this._settings.energyOffsetCT1 = 0;
    }
    if (changedKeys.includes('energyOffsetCT2')) {
      const prevEnergy: number = this.getCapabilityValue('meter_power_ct2');
      this.setCapabilityValue('meter_power_ct2', prevEnergy + (newSettings.energyOffsetCT2 ? newSettings.energyOffsetCT2 : 0));
      this._settings.energyOffsetCT2 = 0;
    }
    if (changedKeys.includes('energyOffsetCT3')) {
      const prevEnergy: number = this.getCapabilityValue('meter_power_ct3');
      this.setCapabilityValue('meter_power_ct3', prevEnergy + (newSettings.energyOffsetCT3 ? newSettings.energyOffsetCT3 : 0));
      this._settings.energyOffsetCT3 = 0;
    }
    if (changedKeys.includes('energyOffsetGenerated')) {
      const prevEnergy: number = this.getCapabilityValue('meter_power_generated');
      this.setCapabilityValue('meter_power_generated', prevEnergy + (newSettings.energyOffsetGenerated ? newSettings.energyOffsetGenerated : 0));
      this._settings.energyOffsetGenerated = 0;
    }
    if (changedKeys.includes('siteName')) {
      this._settings.siteName = newSettings.siteName;
      await this.myenergiClient.setAppKey("siteName", newSettings.siteName as string).catch(this.error);
    }

    // Reset energy offset settings after one second to prevent potential conflicts.
    this._settingsTimeoutHandle = setTimeout(() => {
      this.setSettings({ energyOffsetTotal: 0, energyOffsetCT1: 0, energyOffsetCT2: 0, energyOffsetCT3: 0, energyOffsetGenerated: 0 });
      clearTimeout(this._settingsTimeoutHandle);
    }, 1000);
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
