import { Device } from 'homey';
import { EddiMode, EddiHeaterStatus, MyEnergi, Eddi } from 'myenergi-api';
import { MyEnergiApp } from '../../app';
import { EddiDriver } from './driver';
import { EddiData } from "./EddiData";

export class EddiDevice extends Device {

  private _app!: MyEnergiApp;
  private _driver!: EddiDriver;

  private _callbackId = -1;
  private _onOff: EddiMode = EddiMode.Off;
  private _heaterStatus: EddiHeaterStatus = EddiHeaterStatus.Boost;
  private _lastHeaterStatus: EddiHeaterStatus = EddiHeaterStatus.Boost;
  private _systemVoltage = 0;
  private _heater1Power = 0;
  private _heater2Power = 0;
  private _heater1Name = 'Heater 1';
  private _heater2Name = 'Heater 2';
  private _heater1Current = 0;
  private _heater2Current = 0;
  private _energyTransferred = 0;
  private _generatedPower = 0;

  public deviceId!: string;
  public myenergiClientId!: string;
  public myenergiClient!: MyEnergi;

  /**
   * onInit is called when the device is initialized.
   */
  public async onInit() {
    const dev = this as EddiDevice;
    this._app = this.homey.app as MyEnergiApp;
    this._driver = this.driver as EddiDriver;
    this._callbackId = this._driver.registerDataUpdateCallback((data: any[]) => this.dataUpdated(data)) - 1;
    this.deviceId = this.getData().id;
    this.log(`Device ID: ${this.deviceId}`);
    this.myenergiClientId = this.getStoreValue('myenergiClientId');

    try {
      this.myenergiClient = this._app.clients[this.myenergiClientId];
      const eddi: Eddi | null = await this.myenergiClient.getStatusEddi(this.deviceId);
      if (eddi) {
        this.calculateValues(eddi); // P=U*I -> I=P/U
        this._lastHeaterStatus = this._heaterStatus;
      }
    } catch (error) {
      this.error(error);
    }

    this.validateCapabilities();
    this.setCapabilityValues();
    this.log(`Status: ${this._heaterStatus}`);

    this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));

    this.log('EddiDevice has been initialized');
  }

  private calculateValues(eddi: Eddi) {
    this._heaterStatus = eddi.sta;
    this._heater1Power = eddi.ectp1 ? eddi.ectp1 : 0;
    this._heater2Power = eddi.ectp2 ? eddi.ectp2 : 0;
    this._heater1Name = eddi.ht1 ? eddi.ht1 : this._heater1Name;
    this._heater2Name = eddi.ht2 ? eddi.ht2 : this._heater2Name;
    this._systemVoltage = eddi.vol ? (eddi.vol / 10) : 0;
    this._generatedPower = eddi.gen ? eddi.gen : 0;
    this._energyTransferred = eddi.che ? eddi.che : 0;
    this._heater1Current = (this._systemVoltage > 0) ? (this._heater1Power / this._systemVoltage) : 0; // P=U*I -> I=P/U
    this._heater2Current = (this._systemVoltage > 0) ? (this._heater2Power / this._systemVoltage) : 0; // P=U*I -> I=P/U
  }

  private setCapabilityValues() {
    this.setCapabilityValue('onoff', this._onOff !== EddiMode.Off).catch(this.error);
    this.setCapabilityValue('heater_status', `${this._heaterStatus}`).catch(this.error);
    this.setCapabilityValue('heater_1_name', `${this._heater1Name}`).catch(this.error);
    this.setCapabilityValue('heater_2_name', `${this._heater2Name}`).catch(this.error);
    this.setCapabilityValue('measure_voltage', this._systemVoltage).catch(this.error);
    this.setCapabilityValue('measure_power_ct1', this._heater1Power).catch(this.error);
    this.setCapabilityValue('measure_power_ct2', this._heater2Power).catch(this.error);
    this.setCapabilityValue('measure_current_ct1', this._heater1Current).catch(this.error);
    this.setCapabilityValue('measure_current_ct2', this._heater2Current).catch(this.error);
    this.setCapabilityValue('measure_power_generated', this._generatedPower).catch(this.error);
    this.setCapabilityValue('heater_session_transferred', this._energyTransferred).catch(this.error);
  }

  private validateCapabilities() {
    this.log(`Validating Eddi capabilities...`);
    const caps = this.getCapabilities();
    caps.forEach(async cap => {
      if (!this._driver.capabilities.includes(cap)) {
        try {
          await this.removeCapability(cap);
          this.log(`${cap} - Removed`);
        } catch (error) {
          this.error(error);
        }
      }
    });
    this._driver.capabilities.forEach(async cap => {
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
    this.log('Received data from driver.');
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

  public async onCapabilityOnoff(value: boolean, opts: any) {
    this.log(`onoff: ${value}`);
    await this.setEddiMode(value).catch(this.error);
    this.setCapabilityValue('onoff', value ? EddiMode.On : EddiMode.Off).catch(this.error);
    this.setCapabilityValue('heater_status', value ? `${this._lastHeaterStatus}` : EddiHeaterStatus.Stopped).catch(this.error);
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
    oldSettings: object;
    newSettings: object;
    changedKeys: string[];
  }): Promise<string | void> {
    this.log(`EddiDevice settings where changed: ${changedKeys}`);
  }
  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  public async onRenamed(name: any) {
    this.log('EddiDevice was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  public async onDeleted() {
    this._driver.removeDataUpdateCallback(this._callbackId);
    this.log('EddiDevice has been deleted');
  }

}

module.exports = EddiDevice;
