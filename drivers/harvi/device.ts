import { Device } from 'homey';
import { Harvi, MyEnergi } from 'myenergi-api';
import { MyEnergiApp } from '../../app';
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

    // this.validateCapabilities();
    this.setCapabilityValues();

    this.log('HarviDevice has been initialized');
  }

  /**
   * Validate capabilities. Add new and delete removed capabilities.
   */
  private async InitializeCapabilities(): Promise<void> {
    await this.setUnavailable('Harvi is currently doing some maintenance taks and will be back shortly.').catch(this.error);
    this.log(`****** Initializing Harvi sensor capabilities ******`);
    const caps = this.getCapabilities();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tmpCaps: any = {};
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
    this._power = (harvi.ectp1 ? harvi.ectp1 : 0) + (harvi.ectp2 ? harvi.ectp2 : 0) + (harvi.ectp3 ? harvi.ectp3 : 0)
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

  private validateCapabilities() {
    this.log(`Validating Harvi capabilities...`);
    const caps = this.getCapabilities();
    caps.forEach(async cap => {
      if (!(this.driver as HarviDriver).capabilities.includes(cap)) {
        try {
          await this.removeCapability(cap);
          this.log(`${cap} - Removed`);
        } catch (error) {
          this.error(error);
        }
      }
    });
    (this.driver as HarviDriver).capabilities.forEach(async cap => {
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
    oldSettings: object;
    newSettings: object;
    changedKeys: string[];
  }): Promise<string | void> {
    this.log(`HarviDevice settings where changed: ${changedKeys} - ${oldSettings} - ${newSettings}`);
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  public async onRenamed(name: string) {
    this.log(`HarviDevice was renamed to ${name}`);
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
