'use strict';

const { Device } = require('homey');
const { ZappiChargeMode } = require('myenergi-api/dist/MyEnergi');

class ZappiDevice extends Device {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.deviceId = this.getData().id;
    this.log(`Device ID: ${this.deviceId}`);
    this.myenergiClientId = this.getStoreValue('myenergiClientId');
    try {
      this.myenergiClient = this.homey.app.clients[this.myenergiClientId];
    } catch (error) {
      this.error(error);
    }

    this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));

    this.log('ZappiDevice has been initialized');
  }

  async onCapabilityOnoff(value, opts) {
    try {
      let result = await this.myenergiClient.setZappiChargeMode(this.deviceId, value ? ZappiChargeMode.Fast : ZappiChargeMode.Off);
      result = JSON.parse(result);
      if (result.status !== 0) {
        throw new Error(result);
      }
      this.log(`Zappi was switched ${value ? 'on' : 'off'}`);
    } catch (error) {
      this.error(error);
      throw new Error(`Switching the Zappi ${value ? 'on' : 'off'} failed!`);
    }
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
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
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('ZappiDevice settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('ZappiDevice was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('ZappiDevice has been deleted');
  }

}

module.exports = ZappiDevice;
