import { Device } from 'homey';
import { Libbi, LibbiMode, MyEnergi, MyEnergiAccount } from 'myenergi-api';
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

// The charge from grid setup rarely changes, and comes from a separate API.
const CHARGE_SETUP_REFRESH_INTERVAL = 5 * 60 * 1000;
const ACCOUNT_REQUIRED_MESSAGE = 'Charge from grid needs your myenergi account email and password. Add them under the myenergi app settings.';

export class LibbiDevice extends Device {

  private _callbackId = -1;
  private _isSolar = false;
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
  private _lastChargeSetupRefresh = 0;
  private _syncingAccountCapabilities = false;

  public deviceId!: string;
  public myenergiClientId!: string;
  public myenergiClient!: MyEnergi;

  /**
   * onInit is called when the device is initialized.
   */
  public async onInit(): Promise<void> {
    this._isSolar = this.getData().type === 'solar';

    // The solar device pairs with the driver's battery class and switches
    // itself over on first init. Homey Energy does not allow one device to
    // be both a home battery and a solar producer.
    if (this._isSolar && this.getClass() !== 'solarpanel') {
      await this.setClass('solarpanel').catch(this.error);
      await this.setEnergy({}).catch(this.error);
    }

    this.deviceId = this.getData().id;
    this.myenergiClientId = this.getStoreValue('myenergiClientId');

    // Make sure capabilities are up to date.
    if (this.detectCapabilityChanges()) {
      await this.InitializeCapabilities().catch(this.error);
    }
    await this.syncAccountCapabilities().catch(this.error);

    this._callbackId = (this.driver as LibbiDriver).registerDataUpdateCallback((data: LibbiData[]) => this.dataUpdated(data)) - 1;

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

    if (this._isSolar) {
      this.registerCapabilityListener('button.reset_meter', async () => {
        this.setCapabilityValue('meter_power', 0).catch(this.error);
      });
    } else {
      this.registerCapabilityListener('libbi_mode_selector', this.onCapabilityMode.bind(this));
      this.registerCapabilityListener('button.reset_meter', async () => {
        this.setCapabilityValue('meter_power.charged', 0).catch(this.error);
        this.setCapabilityValue('meter_power.discharged', 0).catch(this.error);
      });
      if (this.hasCapability('libbi_charge_from_grid')) {
        this.registerCapabilityListener('libbi_charge_from_grid', this.setChargeFromGrid.bind(this));
        this.refreshChargeSetup().catch(this.error);
      }
    }
    this.registerCapabilityListener('button.reload_capabilities', async () => {
      this.InitializeCapabilities();
    });

    this.log(`LibbiDevice ${this.deviceId}${this._isSolar ? ' (solar)' : ''} has been initialized`);
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
    for (const cap of this.driverCapabilities()) {
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
    // The account capabilities are added and removed on their own by
    // syncAccountCapabilities, without rebuilding the whole capability set.
    const accountCaps = (this.driver as LibbiDriver).accountCapabilities;
    const caps = this.getCapabilities().filter(cap => !accountCaps.includes(cap));
    const driverCaps = this.driverCapabilities().filter(cap => !accountCaps.includes(cap));
    for (const cap of caps) {
      if (!driverCaps.includes(cap)) {
        this.log(`Libbi capability ${cap} was removed.`);
        result = true;
      }
    }
    for (const cap of driverCaps) {
      if (!this.hasCapability(cap)) {
        this.log(`Libbi capability ${cap} was added.`);
        result = true;
      }
    }
    if (!result) {
      // The Homey app derives the default picker from the capability order,
      // so an order change must also trigger a rebuild.
      if (caps.some((cap, i) => cap !== driverCaps[i])) {
        this.log('Libbi capability order changed.');
        result = true;
      }
    }
    if (!result)
      this.log('No changes in capabilities.');
    return result;
  }

  /**
   * The capability set this device should have, depending on whether it is
   * the battery or the solar generation device of the Libbi.
   */
  private driverCapabilities(): string[] {
    const driver = this.driver as LibbiDriver;
    if (this._isSolar)
      return driver.solarCapabilities;
    return this.accountClient ? [...driver.capabilities, ...driver.accountCapabilities] : driver.capabilities;
  }

  /**
   * The myenergi account API client of this device's hub. Only available
   * when an account email and password are set in the app settings.
   */
  private get accountClient(): MyEnergiAccount | undefined {
    return (this.homey.app as MyEnergiApp).accountClients[this.myenergiClientId];
  }

  /**
   * Add or remove the charge from grid capabilities when the account
   * credentials are added to or removed from the app settings.
   */
  private async syncAccountCapabilities(): Promise<void> {
    if (this._isSolar || this._syncingAccountCapabilities)
      return;
    const enabled = !!this.accountClient;
    const accountCapabilities = (this.driver as LibbiDriver).accountCapabilities;
    if (accountCapabilities.every(cap => this.hasCapability(cap) === enabled))
      return;
    this._syncingAccountCapabilities = true;
    try {
      for (const cap of accountCapabilities) {
        if (enabled && !this.hasCapability(cap)) {
          await this.addCapability(cap);
          this.log(`*** ${cap} - Added`);
        } else if (!enabled && this.hasCapability(cap)) {
          await this.removeCapability(cap);
          this.log(`*** ${cap} - Removed`);
        }
      }
      if (enabled) {
        this.registerCapabilityListener('libbi_charge_from_grid', this.setChargeFromGrid.bind(this));
        this._lastChargeSetupRefresh = 0;
      }
    } finally {
      this._syncingAccountCapabilities = false;
    }
  }

  /**
   * Read the charge from grid setting and charge target from the
   * myenergi account API.
   */
  private async refreshChargeSetup(): Promise<void> {
    const accountClient = this.accountClient;
    if (!accountClient || !this.hasCapability('libbi_charge_from_grid'))
      return;
    this._lastChargeSetupRefresh = Date.now();
    const setup = await accountClient.getLibbiChargeSetup(`${this.deviceId}`);
    this.setCapabilityValue('libbi_charge_from_grid', !!setup.chargeFromGrid).catch(this.error);
    this.setCapabilityValue('libbi_charge_target', (setup.energyTarget || 0) / 1000).catch(this.error);
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
    if (this._isSolar) {
      this.setSolarCapabilityValues();
      return;
    }
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

  private setSolarCapabilityValues() {
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
   * Allow or disallow the Libbi to charge from the grid. The Libbi only
   * charges during the cheap periods of the tariff set in the myenergi app.
   * @param enabled Charge from grid on or off
   */
  public async setChargeFromGrid(enabled: boolean): Promise<void> {
    const accountClient = this.accountClient;
    if (!accountClient)
      throw new Error(ACCOUNT_REQUIRED_MESSAGE);
    try {
      await accountClient.setLibbiChargeFromGrid(`${this.deviceId}`, enabled);
      this.setCapabilityValue('libbi_charge_from_grid', enabled).catch(this.error);
      this.log(`Libbi charge from grid changed to ${enabled}`);
    } catch (error) {
      this.error(`Setting Libbi charge from grid to ${enabled} failed:\n${error}`);
      throw new Error(`Setting charge from grid failed.`, { cause: error });
    }
  }

  /**
   * Whether the Libbi is allowed to charge from the grid.
   */
  public isChargeFromGridEnabled(): boolean {
    return this.getCapabilityValue('libbi_charge_from_grid') === true;
  }

  /**
   * Set how much energy the Libbi should hold when charging from the grid.
   * @param kwh Charge target in kWh
   */
  public async setChargeTarget(kwh: number): Promise<void> {
    const accountClient = this.accountClient;
    if (!accountClient)
      throw new Error(ACCOUNT_REQUIRED_MESSAGE);
    try {
      await accountClient.setLibbiChargeTarget(`${this.deviceId}`, kwh * 1000);
      this.setCapabilityValue('libbi_charge_target', kwh).catch(this.error);
      this.log(`Libbi charge target changed to ${kwh} kWh`);
    } catch (error) {
      this.error(`Setting the Libbi charge target to ${kwh} kWh failed:\n${error}`);
      throw new Error(`Setting the charge target failed.`, { cause: error });
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
    this.syncAccountCapabilities()
      .then(() => {
        if (Date.now() - this._lastChargeSetupRefresh >= CHARGE_SETUP_REFRESH_INTERVAL)
          return this.refreshChargeSetup();
      })
      .catch(this.error);
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
