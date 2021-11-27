'use strict';

const { Device } = require('homey');
const { ZappiChargeMode } = require('myenergi-api/dist/MyEnergi');

class ZappiDevice extends Device {

  _chargeMode = ZappiChargeMode.Fast;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.deviceId = this.getData().id;
    this.log(`Device ID: ${this.deviceId}`);
    this.myenergiClientId = this.getStoreValue('myenergiClientId');
    try {
      this.myenergiClient = this.homey.app.clients[this.myenergiClientId];
      const zappi = await this.myenergiClient.getStatusZappi(this.deviceId);
      this._chargeMode = zappi.zmo;
    } catch (error) {
      this.error(error);
    }

    this.setCapabilityValue('onoff', this._chargeMode !== ZappiChargeMode.Off).catch(this.error);
    this.setCapabilityValue('charge_mode', this._chargeMode.toString()).catch(this.error);
    this.setCapabilityValue('charge_mode_selector', this._chargeMode.toString()).catch(this.error);

    this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
    this.registerCapabilityListener('charge_mode_selector', this.onCapabilityChargeMode.bind(this));

    this.log('ZappiDevice has been initialized');
  }

  async setChargeMode(isOn) {
    try {
      const result = await this.myenergiClient.setZappiChargeMode(this.deviceId, isOn ? this._chargeMode : ZappiChargeMode.Off);
      if (result.status !== 0) {
        throw new Error(result);
      }
      this.log(`Zappi was switched ${isOn ? 'on' : 'off'}`);
    } catch (error) {
      this.error(error);
      throw new Error(`Switching the Zappi ${isOn ? 'on' : 'off'} failed!`);
    }
  }

  async onCapabilityChargeMode(value, opts) {
    this.log(`Charge Mode: ${value}`);
    this._chargeMode = Number(value);
    await this.setChargeMode(this._chargeMode !== ZappiChargeMode.Off);
    this.setCapabilityValue('onoff', this._chargeMode !== ZappiChargeMode.Off).catch(this.error);
    this.setCapabilityValue('charge_mode', `${this._chargeMode}`).catch(this.error);
  }

  async onCapabilityOnoff(value, opts) {
    this.log(`onoff: ${value}`);
    await this.setChargeMode(value);
    this.setCapabilityValue('charge_mode', value ? `${this._chargeMode}` : `${ZappiChargeMode.Off}`).catch(this.error);
    this.setCapabilityValue('charge_mode_selector', value ? `${this._chargeMode}` : `${ZappiChargeMode.Off}`).catch(this.error);
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
