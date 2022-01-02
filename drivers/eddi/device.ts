import { Device } from 'homey';
import { EddiMode, EddiHeaterStatus, MyEnergi, Eddi } from 'myenergi-api';
import { MyEnergiApp } from '../../app';
import { EddiDriver } from './driver';
import { EddiData } from "./EddiData";

export class EddiDevice extends Device {

  private _app!: MyEnergiApp;
  private _driver!: EddiDriver;

  private _callbackId: number = -1;
  private _onOff: EddiMode = EddiMode.Off;
  private _heaterStatus: EddiHeaterStatus = EddiHeaterStatus.Boost;
  private _lastHeaterStatus: EddiHeaterStatus = EddiHeaterStatus.Boost;
  private _systemVoltage: number = 0;
  private _heater1Power: number = 0;
  private _heater2Power: number = 0;
  private _heater1Name: string = 'Heater 1';
  private _heater2Name: string = 'Heater 2';
  private _heater1Current: number = 0;
  private _heater2Current: number = 0;
  private _energyTransferred: number = 0;
  private _generatedPower: number = 0;

  public deviceId!: string;
  public myenergiClientId!: string;
  public myenergiClient!: MyEnergi;

  /**
   * onInit is called when the device is initialized.
   */
  public async onInit() {
    const dev = this as EddiDevice;
    dev._app = dev.homey.app as MyEnergiApp;
    dev._driver = dev.driver as EddiDriver;
    dev._callbackId = dev._driver.registerDataUpdateCallback((data: any[]) => dev.dataUpdated(data)) - 1;
    dev.deviceId = dev.getData().id;
    dev.log(`Device ID: ${dev.deviceId}`);
    dev.myenergiClientId = dev.getStoreValue('myenergiClientId');

    try {
      dev.myenergiClient = dev._app.clients[dev.myenergiClientId];
      const eddi: Eddi | null = await dev.myenergiClient.getStatusEddi(dev.deviceId);
      if (eddi) {
        dev.calculateValues(eddi); // P=U*I -> I=P/U
        dev._lastHeaterStatus = dev._heaterStatus;
      }
    } catch (error) {
      dev.error(error);
    }

    dev.validateCapabilities();
    dev.setCapabilityValues();
    dev.log(`Status: ${dev._heaterStatus}`);

    dev.registerCapabilityListener('onoff', dev.onCapabilityOnoff.bind(this));

    dev.log('EddiDevice has been initialized');
  }

  private calculateValues(eddi: Eddi) {
    const dev: EddiDevice = this;
    dev._heaterStatus = eddi.sta;
    dev._heater1Power = eddi.ectp1 ? eddi.ectp1 : 0;
    dev._heater2Power = eddi.ectp2 ? eddi.ectp2 : 0;
    dev._heater1Name = eddi.ht1 ? eddi.ht1 : dev._heater1Name;
    dev._heater2Name = eddi.ht2 ? eddi.ht2 : dev._heater2Name;
    dev._systemVoltage = eddi.vol ? (eddi.vol / 10) : 0;
    dev._generatedPower = eddi.gen ? eddi.gen : 0;
    dev._energyTransferred = eddi.che ? eddi.che : 0;
    dev._heater1Current = (dev._systemVoltage > 0) ? (dev._heater1Power / dev._systemVoltage) : 0; // P=U*I -> I=P/U
    dev._heater2Current = (dev._systemVoltage > 0) ? (dev._heater2Power / dev._systemVoltage) : 0; // P=U*I -> I=P/U
  }

  private setCapabilityValues() {
    const dev: EddiDevice = this;
    dev.setCapabilityValue('onoff', dev._onOff !== EddiMode.Off).catch(dev.error);
    dev.setCapabilityValue('heater_status', `${dev._heaterStatus}`).catch(dev.error);
    dev.setCapabilityValue('heater_1_name', `${dev._heater1Name}`).catch(dev.error);
    dev.setCapabilityValue('heater_2_name', `${dev._heater2Name}`).catch(dev.error);
    dev.setCapabilityValue('measure_voltage', dev._systemVoltage).catch(dev.error);
    dev.setCapabilityValue('measure_power_ct1', dev._heater1Power).catch(dev.error);
    dev.setCapabilityValue('measure_power_ct2', dev._heater2Power).catch(dev.error);
    dev.setCapabilityValue('measure_current_ct1', dev._heater1Current).catch(dev.error);
    dev.setCapabilityValue('measure_current_ct2', dev._heater2Current).catch(dev.error);
    dev.setCapabilityValue('measure_power_generated', dev._generatedPower).catch(dev.error);
    dev.setCapabilityValue('heater_session_transferred', dev._energyTransferred).catch(dev.error);
  }

  private validateCapabilities() {
    const dev: EddiDevice = this;
    dev.log(`Checking for new capabilities...`);
    dev._driver.capabilities.forEach(v => {
      dev.log(`${v}`);
      if (!dev.hasCapability(v)) {
        dev.addCapability(v);
        dev.log(`Added new capability: ${v}`);
      }
    });
  }

  private dataUpdated(data: EddiData[]) {
    const dev: EddiDevice = this;
    dev.log('Received data from driver.');
    if (data) {
      data.forEach((eddi: EddiData) => {
        if (eddi && eddi.sno === dev.deviceId) {
          try {
            dev._lastHeaterStatus = eddi.sta;
            dev.calculateValues(eddi)
            dev.setCapabilityValues();
          } catch (error) {
            dev.error(error);
          }
        }
      });
    }
  }

  private async setEddiMode(isOn: boolean) {
    const dev: EddiDevice = this;
    try {
      const result = await dev.myenergiClient.setEddiMode(dev.deviceId, isOn ? EddiMode.On : EddiMode.Off);
      if (result.status !== 0) {
        throw new Error(result);
      }
      dev.log(`Eddi was switched ${isOn ? 'on' : 'off'}`);
    } catch (error) {
      dev.error(error);
      throw new Error(`Switching the Eddi ${isOn ? 'on' : 'off'} failed!`);
    }
  }

  public async onCapabilityOnoff(value: boolean, opts: any) {
    const dev: EddiDevice = this;
    dev.log(`onoff: ${value}`);
    await dev.setEddiMode(value);
    dev.setCapabilityValue('onoff', value ? EddiMode.On : EddiMode.Off).catch(dev.error);
    dev.setCapabilityValue('heater_status', value ? `${dev._lastHeaterStatus}` : EddiHeaterStatus.Stopped).catch(dev.error);
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
