'use strict';

const { Device } = require('homey');
const { EddiMode, EddiBoost, EddiHeaterStatus } = require('myenergi-api/dist');

class EddiDevice extends Device {

  #callbackId = -1;
  #onOff = EddiMode.Off;
  #heaterStatus = EddiHeaterStatus.Boost;
  #lastOnState = EddiHeaterStatus.Boost;
  #systemVoltage = 0;
  #heater1Power = 0;
  #heater2Power = 0;
  #heater1Name = 'Heater 1';
  #heater2Name = 'Heater 2';
  #heater1Current = 0;
  #heater2Current = 0;
  #energyTransferred = 0;
  #generatedPower = 0;

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
      const eddi = await this.myenergiClient.getStatusEddi(this.deviceId);
      this.#heaterStatus = eddi.sta;
      this.#heater1Power = eddi.ectp1 ? eddi.ectp1 : 0;
      this.#heater2Power = eddi.ectp2 ? eddi.ectp2 : 0;
      this.#heater1Name = eddi.ht1 ? eddi.ht1 : this.#heater1Name;
      this.#heater2Name = eddi.ht2 ? eddi.ht2 : this.#heater2Name;
      this.#systemVoltage = eddi.vol ? (eddi.vol / 10) : 0;
      this.#generatedPower = eddi.gen ? eddi.gen : 0;
      this.#energyTransferred = eddi.che ? eddi.che : 0;
      this.#heater1Current = (this.#systemVoltage > 0) ? (this.#heater1Power / this.#systemVoltage) : 0; // P=U*I -> I=P/U
      this.#heater2Current = (this.#systemVoltage > 0) ? (this.#heater2Power / this.#systemVoltage) : 0; // P=U*I -> I=P/U
      if (this.#heaterStatus !== EddiHeaterStatus.Stopped) {
        this.#lastOnState = this.#heaterStatus;
      }
    } catch (error) {
      this.error(error);
    }

    this.setCapabilityValue('onoff', this.#onOff !== EddiMode.Off).catch(this.error);
    this.setCapabilityValue('heater_status', `${this.#heaterStatus}`).catch(this.error);
    this.setCapabilityValue('measure_voltage', this.#systemVoltage).catch(this.error);
    this.setCapabilityValue('measure_power_ct1', this.#heater1Power).catch(this.error);
    this.setCapabilityValue('measure_power_ct2', this.#heater2Power).catch(this.error);
    this.setCapabilityValue('measure_current_ct1', this.#heater1Current).catch(this.error);
    this.setCapabilityValue('measure_current_ct2', this.#heater2Current).catch(this.error);
    this.setCapabilityValue('measure_power_generated', this.#generatedPower).catch(this.error);
    this.setCapabilityValue('heater_session_transferred', this.#energyTransferred).catch(this.error);
    this.log(`Status: ${this.#chargerStatus}`);

    this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));

    this.log('EddiDevice has been initialized');
  }

  dataUpdated(data) {
    this.log('Received data from driver.');
    if (data) {
      data.forEach(zappi => {
        if (zappi && zappi.sno === this.deviceId) {
          try {
            if (zappi.zmo !== EddiMode.Off) {
              this.#lastOnState = zappi.zmo;
            }
            this.#chargeMode = zappi.zmo;
            this.#chargerStatus = zappi.pst;
            this.#heater1Power = zappi.ectp1 ? zappi.ectp1 : 0;
            this.#systemVoltage = zappi.vol ? (zappi.vol / 10) : 0;
            this.#energyTransferred = zappi.che ? zappi.che : 0;
            this.#heater1Current = (this.#systemVoltage > 0) ? (this.#heater1Power / this.#systemVoltage) : 0; // P=U*I -> I=P/U
            this.setCapabilityValue('onoff', this.#onOff !== EddiMode.Off).catch(this.error);
            this.setCapabilityValue('heater_status', `${this.#heaterStatus}`).catch(this.error);
            this.setCapabilityValue('measure_power', this.#heater1Power).catch(this.error);
            this.setCapabilityValue('measure_voltage', this.#systemVoltage).catch(this.error);
            this.setCapabilityValue('measure_current', this.#heater1Current).catch(this.error);
            this.setCapabilityValue('charge_session_consumption', this.#energyTransferred).catch(this.error);
          } catch (error) {
            this.error(error);
          }
        }
      });
    }
  }

  async setChargeMode(isOn) {
    try {
      const result = await this.myenergiClient.setZappiChargeMode(this.deviceId, isOn ? this.#lastOnState : EddiMode.Off);
      if (result.status !== 0) {
        throw new Error(result);
      }
      this.log(`Zappi was switched ${isOn ? 'on' : 'off'}`);
    } catch (error) {
      this.error(error);
      throw new Error(`Switching the Zappi ${isOn ? 'on' : 'off'} failed!`);
    }
  }

  async onCapabilityOnoff(value, opts) {
    this.log(`onoff: ${value}`);
    await this.setChargeMode(value);
    this.setCapabilityValue('charge_mode', value ? `${this.#chargeMode}` : `${EddiMode.Off}`).catch(this.error);
    this.setCapabilityValue('charge_mode_selector', value ? `${this.#chargeMode}` : `${EddiMode.Off}`).catch(this.error);
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
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
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('EddiDevice settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('EddiDevice was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.driver.removeDataUpdateCallback(this.#callbackId);
    this.log('EddiDevice has been deleted');
  }

}

module.exports = EddiDevice;
