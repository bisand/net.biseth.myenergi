import { Device } from 'homey';
import { MyEnergi } from 'myenergi-api';
import { MyEnergiApp } from '../../app';
import { HarviData, HarviDriver } from './driver';

class HarviDevice extends Device {

  private _app!: MyEnergiApp;
  private _driver!: HarviDriver;

  private _callbackId: number = -1;
  private _ectp1: number = 0;
  private _ectp2: number = 0;
  private _ectp3: number = 0;
  private _ectt1: string = '';
  private _ectt2: string = '';
  private _ectt3: string = '';

  public deviceId!: string;
  public myenergiClientId!: string;
  public myenergiClient!: MyEnergi;

  /**
   * onInit is called when the device is initialized.
   */
  public async onInit() {
    this._app = this.homey.app as MyEnergiApp;
    this._driver = this.driver as HarviDriver;
    this._callbackId = this._driver.registerDataUpdateCallback((data: any) => this.dataUpdated(data)) - 1;
    this.deviceId = this.getData().id;
    this.log(`Device ID: ${this.deviceId}`);
    this.myenergiClientId = this.getStoreValue('myenergiClientId');
    try {
      this.myenergiClient = this._app.clients[this.myenergiClientId];
      const harvi = await this.myenergiClient.getStatusHarvi(this.deviceId);
      if (harvi) {
        this._ectp1 = harvi.ectp1;
        this._ectp2 = harvi.ectp2;
        this._ectp3 = harvi.ectp3;
        this._ectt1 = harvi.ectt1;
        this._ectt2 = harvi.ectt2;
        this._ectt3 = harvi.ectt3;
      }
    } catch (error) {
      this.error(error);
    }

    this.setCapabilityValue('measure_power_ct1', this._ectp1).catch(this.error);
    this.setCapabilityValue('measure_power_ct2', this._ectp2).catch(this.error);
    this.setCapabilityValue('measure_power_ct3', this._ectp3).catch(this.error);
    this.setCapabilityValue('ct1_type', this._ectt1).catch(this.error);
    this.setCapabilityValue('ct2_type', this._ectt2).catch(this.error);
    this.setCapabilityValue('ct3_type', this._ectt3).catch(this.error);

    this.log('HarviDevice has been initialized');
  }

  private dataUpdated(data: HarviData[]) {
    this.log('Received data from driver.');
    if (data) {
      data.forEach(harvi => {
        if (harvi && harvi.sno === this.deviceId) {
          try {
            this._ectp1 = harvi.ectp1;
            this._ectp2 = harvi.ectp2;
            this._ectp3 = harvi.ectp3;
            this._ectt1 = harvi.ectt1;
            this._ectt2 = harvi.ectt2;
            this._ectt3 = harvi.ectt3;

            this.setCapabilityValue('measure_power_ct1', this._ectp1).catch(this.error);
            this.setCapabilityValue('measure_power_ct2', this._ectp2).catch(this.error);
            this.setCapabilityValue('measure_power_ct3', this._ectp3).catch(this.error);
            this.setCapabilityValue('ct1_type', this._ectt1).catch(this.error);
            this.setCapabilityValue('ct2_type', this._ectt2).catch(this.error);
            this.setCapabilityValue('ct3_type', this._ectt3).catch(this.error);
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
    this.log(`HarviDevice settings where changed: ${changedKeys}`);
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
   public async onRenamed(name: any) {
    this.log('HarviDevice was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
   public async onDeleted() {
    this._driver.removeDataUpdateCallback(this._callbackId);
    this.log('HarviDevice has been deleted');
  }

}

module.exports = HarviDevice;
