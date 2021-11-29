'use strict';

const { Device } = require('homey');

class HarviDevice extends Device {

  #callbackId = -1;
  #ectp1 = 0;
  #ectp2 = 0;
  #ectp3 = 0;
  #ectt1 = '';
  #ectt2 = '';
  #ectt3 = '';

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.#callbackId = this.driver.registerDataUpdateCallback(data => this.dataUpdated(data)) - 1;
    this.deviceId = this.getData().id;
    this.log(`Device ID: ${this.deviceId}`);
    this.myenergiClientId = this.getStoreValue('myenergiClientId');
    try {
      this.myenergiClient = this.homey.app.clients[this.myenergiClientId];
      const harvi = await this.myenergiClient.getStatusHarvi(this.deviceId);
      this.#ectp1 = harvi.ectp1;
      this.#ectp2 = harvi.ectp2;
      this.#ectp3 = harvi.ectp3;
      this.#ectt1 = harvi.ectt1;
      this.#ectt2 = harvi.ectt2;
      this.#ectt3 = harvi.ectt3;
    } catch (error) {
      this.error(error);
    }

    this.setCapabilityValue('measure_power_ct1', this.#ectp1).catch(this.error);
    this.setCapabilityValue('measure_power_ct2', this.#ectp2).catch(this.error);
    this.setCapabilityValue('measure_power_ct3', this.#ectp3).catch(this.error);
    this.setCapabilityValue('ct1_type', this.#ectt1).catch(this.error);
    this.setCapabilityValue('ct2_type', this.#ectt2).catch(this.error);
    this.setCapabilityValue('ct3_type', this.#ectt3).catch(this.error);

    this.log('HarviDevice has been initialized');
  }

  dataUpdated(data) {
    this.log('Received data from driver.');
    if (data) {
      data.forEach(harvi => {
        if (harvi && harvi.sno === this.deviceId) {
          try {
            this.#ectp1 = harvi.ectp1;
            this.#ectp2 = harvi.ectp2;
            this.#ectp3 = harvi.ectp3;
            this.#ectt1 = harvi.ectt1;
            this.#ectt2 = harvi.ectt2;
            this.#ectt3 = harvi.ectt3;

            this.setCapabilityValue('measure_power_ct1', this.#ectp1).catch(this.error);
            this.setCapabilityValue('measure_power_ct2', this.#ectp2).catch(this.error);
            this.setCapabilityValue('measure_power_ct3', this.#ectp3).catch(this.error);
            this.setCapabilityValue('ct1_type', this.#ectt1).catch(this.error);
            this.setCapabilityValue('ct2_type', this.#ectt2).catch(this.error);
            this.setCapabilityValue('ct3_type', this.#ectt3).catch(this.error);
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
  async onAdded() {
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
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('HarviDevice settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('HarviDevice was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.driver.removeDataUpdateCallback(this.#callbackId);
    this.log('HarviDevice has been deleted');
  }

}

module.exports = HarviDevice;
