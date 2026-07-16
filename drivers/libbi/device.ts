import { Device } from 'homey';
import { Libbi, LibbiMode, MyEnergi } from 'myenergi-api';
import { MyEnergiApp } from '../../app';
import { calculateEnergy, isCommandSuccessful } from '../../tools';
import { LibbiDriver } from './driver';
import { LibbiData } from './LibbiData';
import { LibbiModeText } from './LibbiModeText';

/**
 * Known Libbi state codes. Codes not in this map (mostly fault codes)
 * are shown as "Code <n>".
 */
const LIBBI_STATES: { [key: number]: string } = {
  0: 'Off',
  1: 'On',
  2: 'Battery Full',
  4: 'Idle',
  5: 'Charging',
  6: 'Discharging',
  7: 'Duration Charging',
  8: 'Duration Drain',
  11: 'Stopped',
  12: 'Target Charge',
  51: 'Boosting',
  53: 'Boosting',
  55: 'Boosting',
  101: 'Battery Empty',
  102: 'Battery Full',
  104: 'Full',
  151: 'Fault',
  234: 'Calibration Charge',
  251: 'Firmware Upgrade',
  252: 'Firmware Upgrade',
  253: 'BMS Upgrading',
};

const CHARGING_STATES = [5, 7, 12, 51, 53, 55, 234];
const DISCHARGING_STATES = [6, 8];

export class LibbiDevice extends Device {

  private _callbackId = -1;
  private _stateOfCharge = 0;
  private _state = 0;
  private _mode: LibbiModeText = LibbiModeText.Normal;
  private _batteryPower = 0;
  private _generatedPower = 0;
  private _voltage = 0;
  private _frequency = 0;
  private _sessionEnergy = 0;

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

    this._callbackId = (this.driver as LibbiDriver).registerDataUpdateCallback((data: LibbiData[]) => this.dataUpdated(data)) - 1;
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

    this.registerCapabilityListener('libbi_mode_selector', this.onCapabilityMode.bind(this));
    this.registerCapabilityListener('button.reset_meter', async () => {
      this.setCapabilityValue('meter_power.charged', 0).catch(this.error);
      this.setCapabilityValue('meter_power.discharged', 0).catch(this.error);
    });
    this.registerCapabilityListener('button.reload_capabilities', async () => {
      this.InitializeCapabilities();
    });

    this.log(`LibbiDevice ${this.deviceId} has been initialized`);
  }

  /**
   * Validate capabilities. Add new and delete removed capabilities.
   */
  private async InitializeCapabilities(): Promise<void> {
    await this.setUnavailable('Libbi is currently doing some maintenance taks and will be back shortly.').catch(this.error);
    this.log(`****** Initializing Libbi sensor capabilities ******`);
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
    for (const cap of (this.driver as LibbiDriver).capabilities) {
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
    this.log(`Detecting Libbi capability changes...`);
    const caps = this.getCapabilities();
    for (const cap of caps) {
      if (!(this.driver as LibbiDriver).capabilities.includes(cap)) {
        this.log(`Libbi capability ${cap} was removed.`);
        result = true;
      }
    }
    for (const cap of (this.driver as LibbiDriver).capabilities) {
      if (!this.hasCapability(cap)) {
        this.log(`Libbi capability ${cap} was added.`);
        result = true;
      }
    }
    if (!result) {
      // The Homey app derives the default picker from the capability order,
      // so an order change must also trigger a rebuild.
      const driverCaps = (this.driver as LibbiDriver).capabilities;
      if (caps.some((cap, i) => cap !== driverCaps[i])) {
        this.log('Libbi capability order changed.');
        result = true;
      }
    }
    if (!result)
      this.log('No changes in capabilities.');
    return result;
  }

  private calculateValues(libbi: Libbi) {
    this._stateOfCharge = libbi.soc ? libbi.soc : 0;
    this._state = libbi.sta ? libbi.sta : 0;
    this._mode = this.getModeText(libbi.lmo);
    // The div field is the live battery power: positive while charging,
    // negative while discharging — the same convention Homey Energy
    // expects from a home battery's measure_power.
    this._batteryPower = libbi.div ? libbi.div : 0;
    this._generatedPower = libbi.gen ? libbi.gen : 0;
    this._voltage = libbi.vol ? (libbi.vol / 10) : 0;
    this._frequency = libbi.frq ? libbi.frq : 0;
    this._sessionEnergy = libbi.che ? libbi.che : 0;
  }

  private setCapabilityValues() {
    this.setCapabilityValue('measure_battery', this._stateOfCharge).catch(this.error);
    this.setCapabilityValue('battery_charging_state', this.getBatteryChargingState()).catch(this.error);
    this.setCapabilityValue('libbi_mode_selector', `${this._mode}`).catch(this.error);
    this.setCapabilityValue('libbi_status', this.getStateText()).catch(this.error);
    this.setCapabilityValue('measure_power', this._batteryPower).catch(this.error);
    this.setCapabilityValue('measure_power_generated', this._generatedPower).catch(this.error);
    this.setCapabilityValue('measure_voltage', this._voltage).catch(this.error);
    this.setCapabilityValue('measure_frequency', this._frequency).catch(this.error);
    this.setCapabilityValue('charge_session_consumption', this._sessionEnergy).catch(this.error);

    // Accumulate charged/discharged energy for the Homey Energy tab.
    if (this.hasCapability('meter_power.charged') && this.hasCapability('meter_power.discharged')) {
      if (this._batteryPower >= 0) {
        const lastChargedPower = Math.max(0, this._lastPowerMeasurement);
        const charged = calculateEnergy(this._lastEnergyCalculation, lastChargedPower, this._batteryPower, this.getCapabilityValue('meter_power.charged') || 0);
        this.setCapabilityValue('meter_power.charged', charged).catch(this.error);
      } else {
        const lastDischargedPower = Math.abs(Math.min(0, this._lastPowerMeasurement));
        const discharged = calculateEnergy(this._lastEnergyCalculation, lastDischargedPower, Math.abs(this._batteryPower), this.getCapabilityValue('meter_power.discharged') || 0);
        this.setCapabilityValue('meter_power.discharged', discharged).catch(this.error);
      }
    }
    this._lastPowerMeasurement = this._batteryPower;
    this._lastEnergyCalculation = new Date();
  }

  private getBatteryChargingState(): string {
    if (CHARGING_STATES.includes(this._state))
      return 'charging';
    if (DISCHARGING_STATES.includes(this._state))
      return 'discharging';
    return 'idle';
  }

  private getStateText(): string {
    return LIBBI_STATES[this._state] ?? `Code ${this._state}`;
  }

  /**
   * The lmo status field has been observed both as a mode name
   * ("BALANCE", "STOP", "DRAIN", ...) and as a number. Normalize both.
   */
  private getModeText(lmo: string | number | undefined): LibbiModeText {
    switch (`${lmo ?? ''}`.toUpperCase()) {
      case '0':
      case 'STOP':
      case 'STOPPED':
        return LibbiModeText.Stop;
      case '2':
      case 'CAPTURE':
        return LibbiModeText.Capture;
      case '3':
      case 'MATCH':
        return LibbiModeText.Match;
      case '4':
      case 'CHARGE':
        return LibbiModeText.Charge;
      case '5':
      case 'DRAIN':
      case 'EXPORT':
        return LibbiModeText.Export;
      default:
        // '1' / 'BALANCE' / unknown
        return LibbiModeText.Normal;
    }
  }

  /**
   * Set the Libbi operating mode. Only Normal, Stopped and Export can be
   * set through the myenergi API.
   * @param modeText @type LibbiModeText
   */
  public async setMode(modeText: LibbiModeText | string): Promise<void> {
    let mode: LibbiMode;
    switch (modeText) {
      case LibbiModeText.Normal:
        mode = LibbiMode.Normal;
        break;
      case LibbiModeText.Stop:
        mode = LibbiMode.Stop;
        break;
      case LibbiModeText.Export:
        mode = LibbiMode.Export;
        break;
      default:
        throw new Error(`The mode ${modeText} can not be set through the myenergi API.`);
    }
    try {
      const result = await this.myenergiClient?.setLibbiMode(this.deviceId, mode);
      if (!isCommandSuccessful(result)) {
        throw new Error(JSON.stringify(result));
      }
      this._mode = modeText as LibbiModeText;
      this.setCapabilityValue('libbi_mode_selector', `${modeText}`).catch(this.error);
      this.log(`Libbi mode changed to ${modeText}`);
    } catch (error) {
      this.error(`Setting the Libbi mode to ${modeText} failed:\n${error}`);
      throw new Error(`Setting the Libbi mode failed.`, { cause: error });
    }
  }

  /**
   * Event handler for mode capability listener
   * @param value Libbi mode
   * @param opts Options
   */
  private async onCapabilityMode(value: LibbiModeText, opts: unknown): Promise<void> {
    this.log(`Libbi Mode: ${value} - ${opts}`);
    await this.setMode(value);
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
    this.log('LibbiDevice has been added');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * @param {string} name The new name
   */
  public async onRenamed(name: string): Promise<void> {
    this.log(`LibbiDevice was renamed to ${name}`);
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  public async onDeleted(): Promise<void> {
    (this.driver as LibbiDriver).removeDataUpdateCallback(this._callbackId);
    this.log('LibbiDevice has been deleted');
  }
}

module.exports = LibbiDevice;
