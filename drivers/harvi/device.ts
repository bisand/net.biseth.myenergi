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

  public deviceId!: string;
  public myenergiClientId!: string;
  public myenergiClient!: MyEnergi;

  /**
   * onInit is called when the device is initialized.
   */
  public async onInit() {
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

    this.validateCapabilities();
    this.setCapabilityValues();

    this.log('HarviDevice has been initialized');
  }

  private calculateValues(harvi: Harvi) {
    this._ectp1 = harvi.ectp1;
    this._ectp2 = harvi.ectp2;
    this._ectp3 = harvi.ectp3;
    this._ectt1 = harvi.ectt1;
    this._ectt2 = harvi.ectt2;
    this._ectt3 = harvi.ectt3;
  }

  private setCapabilityValues() {
    this.setCapabilityValue('measure_power_ct1', this._ectp1 ? this._ectp1 : 0).catch(this.error);
    this.setCapabilityValue('measure_power_ct2', this._ectp2 ? this._ectp2 : 0).catch(this.error);
    this.setCapabilityValue('measure_power_ct3', this._ectp3 ? this._ectp3 : 0).catch(this.error);
    this.setCapabilityValue('ct1_type', this._ectt1).catch(this.error);
    this.setCapabilityValue('ct2_type', this._ectt2).catch(this.error);
    this.setCapabilityValue('ct3_type', this._ectt3).catch(this.error);
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
