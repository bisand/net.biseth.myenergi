'use strict';

const { Device } = require('homey');
const { ZappiChargeMode, ZappiStatus } = require('myenergi-api');

class ZappiDevice extends Device {

  #callbackId = -1;
  #chargeMode = ZappiChargeMode.Fast;
  #lastOnState = ZappiChargeMode.Fast;
  #lastChargingStarted = false;
  #chargerStatus = ZappiStatus.EvDisconnected;
  #chargingPower = 0;
  #chargingVoltage = 0;
  #chargingCurrent = 0;
  #chargeAdded = 0;

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
      const zappi = await this.myenergiClient.getStatusZappi(this.deviceId);
      this.#chargeMode = zappi.zmo;
      this.#chargerStatus = zappi.pst;
      this.#chargingPower = zappi.ectp1 ? zappi.ectp1 : 0;
      this.#chargingVoltage = zappi.vol ? (zappi.vol / 10) : 0;
      this.#chargeAdded = zappi.che ? zappi.che : 0;
      this.#chargingCurrent = (this.#chargingVoltage > 0) ? (this.#chargingPower / this.#chargingVoltage) : 0; // P=U*I -> I=P/U
      if (this.#chargeMode !== ZappiChargeMode.Off) {
        this.#lastOnState = this.#chargeMode;
        this.#lastChargingStarted = true;
      }
    } catch (error) {
      this.error(error);
    }

    this.setCapabilityValue('onoff', this.#chargeMode !== ZappiChargeMode.Off).catch(this.error);
    this.setCapabilityValue('charge_mode', `${this.#chargeMode}`).catch(this.error);
    this.setCapabilityValue('charge_mode_selector', `${this.#chargeMode}`).catch(this.error);
    this.setCapabilityValue('charger_status', `${this.#chargerStatus}`).catch(this.error);
    this.setCapabilityValue('measure_power', this.#chargingPower).catch(this.error);
    this.setCapabilityValue('measure_voltage', this.#chargingVoltage).catch(this.error);
    this.setCapabilityValue('measure_current', this.#chargingCurrent).catch(this.error);
    this.setCapabilityValue('charge_session_consumption', this.#chargeAdded).catch(this.error);
    this.log(`Status: ${this.#chargerStatus}`);

    this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
    this.registerCapabilityListener('charge_mode_selector', this.onCapabilityChargeMode.bind(this));

    //TODO Fix logic here!
    const rainingCondition = this.homey.flow.getConditionCard('is_charging');
    rainingCondition.registerRunListener(async (args, state) => {
      const raining = await RainApi.isItRaining(); // true or false
      return raining;
    });

    const stopRainingAction = this.homey.flow.getActionCard('start_charging');
    stopRainingAction.registerRunListener(async (args, state) => {
      await RainApi.makeItStopRaining();
    });

    const stopRainingAction = this.homey.flow.getActionCard('stop_charging');
    stopRainingAction.registerRunListener(async (args, state) => {
      await RainApi.makeItStopRaining();
    });

    this.log('ZappiDevice has been initialized');
  }

  triggerChargingFlow(chargingStarted) {
    let device = this; // We're in a Device instance
    let tokens = {};
    let state = {};
    if (chargingStarted === this.#lastChargingStarted) {
      return;
    }
    this.#lastChargingStarted = chargingStarted;

    this.driver.ready().then(() => {
      if (chargingStarted)
        this.driver.triggerChargingStartedFlow(device, tokens, state);
      else
        this.driver.triggerChargingStoppedFlow(device, tokens, state);
    });
  }

  dataUpdated(data) {
    this.log('Received data from driver.');
    if (data) {
      data.forEach(zappi => {
        if (zappi && zappi.sno === this.deviceId) {
          try {
            if (zappi.zmo !== ZappiChargeMode.Off) {
              this.#lastOnState = zappi.zmo;
            }
            this.#chargeMode = zappi.zmo;
            this.#chargerStatus = zappi.pst;
            this.#chargingPower = zappi.ectp1 ? zappi.ectp1 : 0;
            this.#chargingVoltage = zappi.vol ? (zappi.vol / 10) : 0;
            this.#chargeAdded = zappi.che ? zappi.che : 0;
            this.#chargingCurrent = (this.#chargingVoltage > 0) ? (this.#chargingPower / this.#chargingVoltage) : 0; // P=U*I -> I=P/U
            this.setCapabilityValue('onoff', this.#chargeMode !== ZappiChargeMode.Off).catch(this.error);
            this.setCapabilityValue('charge_mode', `${this.#chargeMode}`).catch(this.error);
            this.setCapabilityValue('charge_mode_selector', `${this.#chargeMode}`).catch(this.error);
            this.setCapabilityValue('charger_status', `${this.#chargerStatus}`).catch(this.error);
            this.setCapabilityValue('measure_power', this.#chargingPower).catch(this.error);
            this.setCapabilityValue('measure_voltage', this.#chargingVoltage).catch(this.error);
            this.setCapabilityValue('measure_current', this.#chargingCurrent).catch(this.error);
            this.setCapabilityValue('charge_session_consumption', this.#chargeAdded).catch(this.error);
          } catch (error) {
            this.error(error);
          }
        }
      });
    }
  }

  async setChargeMode(isOn) {
    try {
      const result = await this.myenergiClient.setZappiChargeMode(this.deviceId, isOn ? this.#lastOnState : ZappiChargeMode.Off);
      if (result.status !== 0) {
        throw new Error(result);
      }
      triggerChargingFlow(isOn);
      this.log(`Zappi was switched ${isOn ? 'on' : 'off'}`);
    } catch (error) {
      this.error(error);
      throw new Error(`Switching the Zappi ${isOn ? 'on' : 'off'} failed!`);
    }
  }

  async onCapabilityChargeMode(value, opts) {
    this.log(`Charge Mode: ${value}`);
    this.#chargeMode = Number(value);
    if (this.#chargeMode !== ZappiChargeMode.Off) {
      this.#lastOnState = this.#chargeMode;
    }
    await this.setChargeMode(this.#chargeMode !== ZappiChargeMode.Off);
    this.setCapabilityValue('onoff', this.#chargeMode !== ZappiChargeMode.Off).catch(this.error);
    this.setCapabilityValue('charge_mode', `${this.#chargeMode}`).catch(this.error);
  }

  async onCapabilityOnoff(value, opts) {
    this.log(`onoff: ${value}`);
    await this.setChargeMode(value);
    this.setCapabilityValue('charge_mode', value ? `${this.#chargeMode}` : `${ZappiChargeMode.Off}`).catch(this.error);
    this.setCapabilityValue('charge_mode_selector', value ? `${this.#chargeMode}` : `${ZappiChargeMode.Off}`).catch(this.error);
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
    this.driver.removeDataUpdateCallback(this.#callbackId);
    this.log('ZappiDevice has been deleted');
  }

}

module.exports = ZappiDevice;
