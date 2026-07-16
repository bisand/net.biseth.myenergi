import { Device } from 'homey';
import { Libbi, MyEnergi } from 'myenergi-api';
import { MyEnergiApp } from '../../app';
import { calculateEnergy } from '../../tools';
import { LibbiData } from '../libbi/LibbiData';
import { LibbiSolarDriver } from './driver';

/**
 * Exposes the solar generation of the Libbi's built-in hybrid inverter as a
 * separate solar panel device. Homey Energy does not allow one device to be
 * both a home battery and a solar producer, so installations with the panels
 * connected to the Libbi need this device for their production data.
 */
export class LibbiSolarDevice extends Device {

  private _callbackId = -1;
  private _generatedPower = 0;

  private _lastPowerMeasurement = 0;
  private _lastEnergyCalculation: Date = new Date();

  public deviceId!: string;
  public myenergiClientId!: string;
  public myenergiClient!: MyEnergi;

  /**
   * onInit is called when the device is initialized.
   */
  public async onInit(): Promise<void> {
    // Make sure capabilities are up to date.
    if (this.detectCapabilityChanges()) {
      await this.InitializeCapabilities().catch(this.error);
    }

    this._callbackId = (this.driver as LibbiSolarDriver).registerDataUpdateCallback((data: LibbiData[]) => this.dataUpdated(data)) - 1;
    this.deviceId = this.getData().id;
    this.myenergiClientId = this.getStoreValue('myenergiClientId');

    try {
      this.myenergiClient = (this.homey.app as MyEnergiApp).clients[this.myenergiClientId];
      const libbi = await this.myenergiClient?.getStatusLibbi(this.deviceId).catch(this.error);
      if (libbi) {
        this.calculateValues(libbi);
        this.setCapabilityValues();
      }
    } catch (error) {
      this.error(error);
    }

    this.registerCapabilityListener('button.reset_meter', async () => {
      this.setCapabilityValue('meter_power', 0).catch(this.error);
    });
    this.registerCapabilityListener('button.reload_capabilities', async () => {
      this.InitializeCapabilities();
    });

    this.log(`LibbiSolarDevice ${this.deviceId} has been initialized`);
  }

  /**
   * Validate capabilities. Add new and delete removed capabilities.
   */
  private async InitializeCapabilities(): Promise<void> {
    await this.setUnavailable('Libbi Solar is currently doing some maintenance taks and will be back shortly.').catch(this.error);
    this.log(`****** Initializing Libbi Solar sensor capabilities ******`);
    const caps = this.getCapabilities();
    const tmpCaps: { [name: string]: unknown } = {};
    // Remove all capabilities in case the order has changed
    for (const cap of caps) {
      try {
        tmpCaps[cap] = this.getCapabilityValue(cap);
        await this.removeCapability(cap).catch(this.error);
        this.log(`*** ${cap} - Removed`);
      } catch (error) {
        this.error(error);
      }
    }
    // Re-apply all capabilities.
    for (const cap of (this.driver as LibbiSolarDriver).capabilities) {
      try {
        if (this.hasCapability(cap))
          continue;
        await this.addCapability(cap).catch(this.error);
        if (tmpCaps[cap] !== undefined && tmpCaps[cap] !== null)
          this.setCapabilityValue(cap, tmpCaps[cap]);
        this.log(`*** ${cap} - Added`);
      } catch (error) {
        this.error(error);
      }
    }
    this.log(`****** Sensor capability initialization complete ******`);
    this.setAvailable().catch(this.error);
  }

  /**
   * Validate capabilities. Add new and delete removed capabilities.
   */
  private detectCapabilityChanges(): boolean {
    let result = false;
    this.log(`Detecting Libbi Solar capability changes...`);
    const caps = this.getCapabilities();
    for (const cap of caps) {
      if (!(this.driver as LibbiSolarDriver).capabilities.includes(cap)) {
        this.log(`Libbi Solar capability ${cap} was removed.`);
        result = true;
      }
    }
    for (const cap of (this.driver as LibbiSolarDriver).capabilities) {
      if (!this.hasCapability(cap)) {
        this.log(`Libbi Solar capability ${cap} was added.`);
        result = true;
      }
    }
    if (!result) {
      // The Homey app derives the default picker from the capability order,
      // so an order change must also trigger a rebuild.
      const driverCaps = (this.driver as LibbiSolarDriver).capabilities;
      if (caps.some((cap, i) => cap !== driverCaps[i])) {
        this.log('Libbi Solar capability order changed.');
        result = true;
      }
    }
    if (!result)
      this.log('No changes in capabilities.');
    return result;
  }

  private calculateValues(libbi: Libbi) {
    this._generatedPower = libbi.gen ? libbi.gen : 0;
  }

  private setCapabilityValues() {
    this.setCapabilityValue('measure_power', this._generatedPower).catch(this.error);

    // Accumulate generated energy. The inverter can draw a little power at
    // night (slightly negative gen), which must not decrease the meter.
    const generatedPower = Math.max(0, this._generatedPower);
    const lastGeneratedPower = Math.max(0, this._lastPowerMeasurement);
    const meterPower = calculateEnergy(this._lastEnergyCalculation, lastGeneratedPower, generatedPower, this.getCapabilityValue('meter_power') || 0);
    this.setCapabilityValue('meter_power', meterPower).catch(this.error);

    this._lastPowerMeasurement = this._generatedPower;
    this._lastEnergyCalculation = new Date();
  }

  /**
   * Event handler for data updates.
   * @param data Libbi data
   */
  private dataUpdated(data: LibbiData[]) {
    if (process.env.DEBUG === '1') this.log('Received data from driver.');
    if (!this.getAvailable())
      return;
    if (data) {
      data.forEach((libbi: LibbiData) => {
        if (libbi && libbi.sno === this.deviceId) {
          try {
            this.calculateValues(libbi);
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
  public async onAdded(): Promise<void> {
    this.log('LibbiSolarDevice has been added');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * @param {string} name The new name
   */
  public async onRenamed(name: string): Promise<void> {
    this.log(`LibbiSolarDevice was renamed to ${name}`);
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  public async onDeleted(): Promise<void> {
    (this.driver as LibbiSolarDriver).removeDataUpdateCallback(this._callbackId);
    this.log('LibbiSolarDevice has been deleted');
  }
}

module.exports = LibbiSolarDevice;
