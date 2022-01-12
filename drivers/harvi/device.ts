import { Device } from 'homey';
import { Harvi, MyEnergi } from 'myenergi-api';
import { MyEnergiApp } from '../../app';
import { HarviDriver } from './driver';
import { HarviData } from "./HarviData";

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
    const dev = this as HarviDevice;
    dev._app = dev.homey.app as MyEnergiApp;
    dev._driver = dev.driver as HarviDriver;
    dev._callbackId = dev._driver.registerDataUpdateCallback((data: any) => dev.dataUpdated(data)) - 1;
    dev.deviceId = dev.getData().id;
    dev.log(`Device ID: ${dev.deviceId}`);
    dev.myenergiClientId = dev.getStoreValue('myenergiClientId');

    try {
      dev.myenergiClient = dev._app.clients[dev.myenergiClientId];
      const harvi = await dev.myenergiClient.getStatusHarvi(dev.deviceId);
      if (harvi) {
        this.calculateValues(harvi);
      }
    } catch (error) {
      dev.error(error);
    }

    dev.validateCapabilities();
    dev.setCapabilityValues();

    dev.log('HarviDevice has been initialized');
  }

  private calculateValues(harvi: Harvi) {
    const dev = this as HarviDevice;
    dev._ectp1 = harvi.ectp1;
    dev._ectp2 = harvi.ectp2;
    dev._ectp3 = harvi.ectp3;
    dev._ectt1 = harvi.ectt1;
    dev._ectt2 = harvi.ectt2;
    dev._ectt3 = harvi.ectt3;
  }

  private setCapabilityValues() {
    const dev = this as HarviDevice;
    dev.setCapabilityValue('measure_power_ct1', dev._ectp1 ? dev._ectp1 : 0).catch(dev.error);
    dev.setCapabilityValue('measure_power_ct2', dev._ectp2 ? dev._ectp2 : 0).catch(dev.error);
    dev.setCapabilityValue('measure_power_ct3', dev._ectp3 ? dev._ectp3 : 0).catch(dev.error);
    dev.setCapabilityValue('ct1_type', dev._ectt1).catch(dev.error);
    dev.setCapabilityValue('ct2_type', dev._ectt2).catch(dev.error);
    dev.setCapabilityValue('ct3_type', dev._ectt3).catch(dev.error);
  }

  private validateCapabilities() {
    const dev: HarviDevice = this;
    dev.log(`Validating Harvi capabilities...`);
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

  private dataUpdated(data: HarviData[]) {
    const dev = this as HarviDevice;
    dev.log('Received data from driver.');
    if (data) {
      data.forEach(harvi => {
        if (harvi && harvi.sno === dev.deviceId) {
          try {
            dev.calculateValues(harvi);
            dev.setCapabilityValues();
          } catch (error) {
            dev.error(error);
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
