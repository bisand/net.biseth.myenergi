import { Device } from 'homey';
import { MyEnergi, Zappi, ZappiBoostMode, ZappiChargeMode, ZappiStatus } from 'myenergi-api';
import { KeyValue } from 'myenergi-api/dist/src/models/KeyValue';
import { MyEnergiApp } from '../../app';
import { ZappiSettings } from '../../models/ZappiSettings';
import { ZappiDriver } from './driver';
import { ZappiBoostModeText } from './ZappiBoostModeText';
import { ZappiChargeModeText } from './ZappiChargeModeText';
import { ZappiData } from "./ZappiData";
import { ZappiStatusText } from './ZappiStatusText';

export class ZappiDevice extends Device {

  private _callbackId = -1;
  private _chargeMode: ZappiChargeMode = ZappiChargeMode.Fast;
  public get chargeMode(): ZappiChargeMode {
    return this._chargeMode;
  }
  public set chargeMode(value: ZappiChargeMode) {
    this._chargeMode = value;
  }
  private _lastOnState: ZappiChargeMode = ZappiChargeMode.Fast;
  public get lastOnState(): ZappiChargeMode {
    return this._lastOnState;
  }
  public set lastOnState(value: ZappiChargeMode) {
    this._lastOnState = value;
  }
  private _lastChargingStarted = false;
  private _lastChargeMode: ZappiChargeMode = ZappiChargeMode.Fast;
  private _lastBoostMode: ZappiBoostMode = ZappiBoostMode.Stop;
  private _chargerStatus: ZappiStatus = ZappiStatus.EvDisconnected;
  public get chargerStatus(): ZappiStatus {
    return this._chargerStatus;
  }
  public set chargerStatus(value: ZappiStatus) {
    this._chargerStatus = value;
  }
  private _boostMode: ZappiBoostMode = ZappiBoostMode.Stop;
  private _lastBoostState: ZappiBoostMode = ZappiBoostMode.Stop;
  private _lastEvConnected = false;
  private _boostManualKwh = 0;
  private _boostSmartKwh = 0;
  private _boostManualKwhRemaining = 0;
  private _boostSmartKwhRemaining = 0;
  private _boostSmartTime = '';
  private _chargingPower = 0;
  private _chargingVoltage = 0;
  private _chargingCurrent = 0;
  private _chargeAdded = 0;
  private _frequency = 0;
  private _minimumGreenLevel = 0;
  private _settings!: ZappiSettings;
  private _powerCalculationModeSetToAuto!: boolean;

  private _lastEnergyCalculation: Date = new Date();
  private _lastPowerMeasurement = 0;
  private _settingsTimeoutHandle!: NodeJS.Timeout;

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

    this._settings = this.getSettings();
    this._callbackId = (this.driver as ZappiDriver).registerDataUpdateCallback((data: ZappiData[]) => this.dataUpdated(data)) - 1;
    this.deviceId = this.getData().id;
    this.myenergiClientId = this.getStoreValue('myenergiClientId');

    try {
      // Collect data.
      this.myenergiClient = (this.homey.app as MyEnergiApp).clients[this.myenergiClientId];
      const zappi = await this.myenergiClient?.getStatusZappi(this.deviceId).catch(this.error);
      if (zappi) {
        this.calculateValues(zappi, true); // P=U*I -> I=P/U
        if (this._chargeMode !== ZappiChargeMode.Off) {
          this._lastOnState = this._chargeMode;
          this._lastChargingStarted = true;
        }
      }
    } catch (error) {
      this.error(error);
    }

    // Set capabilities
    this.setCapabilityValues();
    this.log(`Status: ${this._chargerStatus}`);

    this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
    this.registerCapabilityListener('charge_mode_selector', this.onCapabilityChargeMode.bind(this));
    this.registerCapabilityListener('set_minimum_green_level', this.onCapabilityGreenLevel.bind(this));

    this.registerCapabilityListener('button.reset_meter', async () => {
      this.setCapabilityValue('meter_power', 0);
    });
    this.registerCapabilityListener('button.reload_capabilities', async () => {
      this.InitializeCapabilities();
    });

    this.log(`ZappiDevice ${this.deviceId} has been initialized`);
  }

  /**
   * Validate capabilities. Add new and delete removed capabilities.
   */
  private async InitializeCapabilities(): Promise<void> {
    await this.setUnavailable('Zappi is currently doing some maintenance taks and will be back shortly.').catch(this.error);
    this.log(`****** Initializing Zappi sensor capabilities ******`);
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
    for (const cap of (this.driver as ZappiDriver).capabilities) {
      try {
        if (this.hasCapability(cap))
          continue;
        await this.addCapability(cap).catch(this.error);
        if (tmpCaps[cap])
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
    this.log(`Detecting Zappi capability changes...`);
    const caps = this.getCapabilities();
    for (const cap of caps) {
      if (!(this.driver as ZappiDriver).capabilities.includes(cap)) {
        this.log(`Zappi capability ${cap} was removed.`);
        result = true;
      }
    }
    for (const cap of (this.driver as ZappiDriver).capabilities) {
      if (!this.hasCapability(cap)) {
        this.log(`Zappi capability ${cap} was added.`);
        result = true;
      }
    }
    if (!result)
      this.log('No changes in capabilities.');
    return result;
  }

  private getRndInteger(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Set capability values from collected values.
   */
  private setCapabilityValues(): void {
    this.setCapabilityValue('onoff', this._chargeMode !== ZappiChargeMode.Off).catch(this.error);
    this.setCapabilityValue('charge_mode', `${this._chargeMode}`).catch(this.error);
    this.setCapabilityValue('charge_mode_txt', `${this.getChargeModeText(this._chargeMode)}`).catch(this.error);
    this.setCapabilityValue('charge_mode_selector', `${this._chargeMode}`).catch(this.error);
    this.setCapabilityValue('charger_status', `${this._chargerStatus}`).catch(this.error);
    this.setCapabilityValue('charger_status_txt', `${this.getChargerStatusText(this._chargerStatus)}`).catch(this.error);
    this.setCapabilityValue('measure_power', this._chargingPower ? this._chargingPower : 0).catch(this.error);
    this.setCapabilityValue('measure_voltage', this._chargingVoltage ? this._chargingVoltage : 0).catch(this.error);
    this.setCapabilityValue('measure_current', this._chargingCurrent ? this._chargingCurrent : 0).catch(this.error);
    this.setCapabilityValue('charge_session_consumption', this._chargeAdded ? this._chargeAdded : 0).catch(this.error);
    this.setCapabilityValue('measure_frequency', this._frequency ? this._frequency : 0).catch(this.error);
    this.setCapabilityValue('meter_power', this.calculateEnergy()).catch(this.error);
    this.setCapabilityValue('minimum_green_level', this._minimumGreenLevel).catch(this.error);
    this.setCapabilityValue('set_minimum_green_level', this._minimumGreenLevel).catch(this.error);
    this.setCapabilityValue('zappi_boost_mode', `${this.getBoostModeText(this._boostMode)}`).catch(this.error);
    this.setCapabilityValue('zappi_boost_kwh', (this._boostMode === ZappiBoostMode.Manual ? this._boostManualKwh : (this._boostMode === ZappiBoostMode.Smart ? this._boostSmartKwh : 0))).catch(this.error);
    this.setCapabilityValue('zappi_boost_kwh_remaining', (this._boostMode === ZappiBoostMode.Manual ? this._boostManualKwhRemaining : (this._boostMode === ZappiBoostMode.Smart ? this._boostSmartKwhRemaining : 0))).catch(this.error);
    this.setCapabilityValue('zappi_boost_time', `${this._boostSmartTime}`).catch(this.error);
    this.setCapabilityValue('ev_connected', this._chargerStatus !== ZappiStatus.EvDisconnected).catch(this.error);
  }

  /**
   * Calculate accumulated kWh since last power measurement
   * @returns Accumulated kWh 
   */
  private calculateEnergy(): number {
    const dateNow = new Date();
    const seconds = Math.abs((dateNow.getTime() - this._lastEnergyCalculation.getTime()) / 1000);
    const prevEnergy: number = this.getCapabilityValue('meter_power');
    const newEnergy: number = prevEnergy + ((((this._lastPowerMeasurement + this._chargingPower) / 2) * seconds) / 3600000);
    this.log(`Energy algo: ${prevEnergy} + ((((${this._lastPowerMeasurement} + ${this._chargingPower}) / 2) * ${seconds}) / 3600000)`);
    this._lastPowerMeasurement = this._chargingPower;
    this._lastEnergyCalculation = dateNow;
    return newEnergy;
  }

  /**
   * Convert a number to a two digit string.
   * @param n Number to be converted to a two digit representation.
   * @returns String containing the two digit representation of the provided number.
   */
  private format_two_digits(n: number): string {
    return n < 10 ? '0' + n.toString() : n.toString();
  }

  private getBoostModeTime(value: string): string {
    value = value ? value : '0000';
    while (value.length < 4) {
      value = '0' + value;
    }
    return value.slice(0, 2) + ':' + value.slice(2);
  }


  /**
   * Takes a time string and tries to validate it and return valid representation of a boost time. Zappi only allows time devided in 15 minutes.
   * @param timeString Must be a string in the time format HHMM
   * @returns Valid boost time string
   */
  private getValidBoostTime(timeString: string): string {
    try {
      timeString = timeString.replace(/\D+/g, '');
      while (timeString.length < 4) {
        timeString = '0' + timeString;
      }
      timeString = timeString.substring(timeString.length - 4);
      const d = new Date();
      d.setHours(Number(timeString.substring(0, 2)), Number(timeString.substring(2, 4)), 0)
      d.setMilliseconds(Math.round(d.getMilliseconds() / 1000) * 1000);
      d.setSeconds(Math.round(d.getSeconds() / 60) * 60);
      d.setMinutes(Math.round(d.getMinutes() / 15) * 15);

      const hours = this.format_two_digits(d.getHours());
      const minutes = this.format_two_digits(d.getMinutes());

      return `${hours}${minutes}`;

    } catch (error) {
      this.error(error);
    }
    return '0000';
  }

  /**
   * Assign and calculate values from Zappi.
   */
  private async calculateValues(zappi: Zappi, initializing = false): Promise<void> {
    this._chargeMode = zappi.zmo;
    this._chargerStatus = zappi.pst as ZappiStatus;
    this._chargingPower = 0;
    if ((this._settings.powerCalculationMode === 'automatic' && zappi.ectt1 === 'Internal Load')
      || (this._settings.powerCalculationMode === 'manual' && this._settings.includeCT1)) {
      this._chargingPower += zappi.ectp1 ? zappi.ectp1 : 0;
    }
    if ((this._settings.powerCalculationMode === 'automatic' && zappi.ectt2 === 'Internal Load')
      || (this._settings.powerCalculationMode === 'manual' && this._settings.includeCT2)) {
      this._chargingPower += zappi.ectp2 ? zappi.ectp2 : 0;
    }
    if ((this._settings.powerCalculationMode === 'automatic' && zappi.ectt3 === 'Internal Load')
      || (this._settings.powerCalculationMode === 'manual' && this._settings.includeCT3)) {
      this._chargingPower += zappi.ectp3 ? zappi.ectp3 : 0;
    }
    if ((this._settings.powerCalculationMode === 'automatic' && zappi.ectt4 === 'Internal Load')
      || (this._settings.powerCalculationMode === 'manual' && this._settings.includeCT4)) {
      this._chargingPower += zappi.ectp4 ? zappi.ectp4 : 0;
    }
    if ((this._settings.powerCalculationMode === 'automatic' && zappi.ectt5 === 'Internal Load')
      || (this._settings.powerCalculationMode === 'manual' && this._settings.includeCT5)) {
      this._chargingPower += zappi.ectp5 ? zappi.ectp5 : 0;
    }
    if ((this._settings.powerCalculationMode === 'automatic' && zappi.ectt6 === 'Internal Load')
      || (this._settings.powerCalculationMode === 'manual' && this._settings.includeCT6)) {
      this._chargingPower += zappi.ectp6 ? zappi.ectp6 : 0;
    }

    if (this._settings.showNegativeValues === false) {
      this._chargingPower = this._chargingPower > 0 ? this._chargingPower : 0;
    }

    this._chargingVoltage = zappi.vol ? (zappi.vol / 10) : 0;
    this._chargeAdded = zappi.che ? zappi.che : 0;
    this._frequency = zappi.frq ? zappi.frq : 0;
    this._minimumGreenLevel = zappi.mgl ? zappi.mgl : 0;
    this._chargingCurrent = (this._chargingVoltage > 0) ? (this._chargingPower / this._chargingVoltage) : 0; // P=U*I -> I=P/U

    this._boostMode = (zappi.bsm === 1 && zappi.tbk ? ZappiBoostMode.Manual : (zappi.bss === 1 ? ZappiBoostMode.Smart : ZappiBoostMode.Stop));
    this._boostManualKwh = zappi.tbk ? zappi.tbk : 0;
    this._boostSmartKwh = zappi.sbk ? zappi.sbk : 0;
    this._boostManualKwhRemaining = (zappi.bsm === 1) ? zappi.tbk - zappi.che : 0;
    this._boostSmartKwhRemaining = (zappi.bss === 1) ? zappi.sbk - zappi.che : 0;
    this._boostSmartTime = (zappi.sbh ? this.format_two_digits(zappi.sbh) : '00') + ':' + (zappi.sbm ? this.format_two_digits(zappi.sbm) : '00');

    if (this._powerCalculationModeSetToAuto) {
      this._powerCalculationModeSetToAuto = false;
      const tmpSettings =
      {
        includeCT1: zappi.ectt1 === 'Internal Load',
        includeCT2: zappi.ectt2 === 'Internal Load',
        includeCT3: zappi.ectt3 === 'Internal Load',
        includeCT4: zappi.ectt4 === 'Internal Load',
        includeCT5: zappi.ectt5 === 'Internal Load',
        includeCT6: zappi.ectt6 === 'Internal Load',
      };

      this.setSettings(tmpSettings);
    }

    const evConnected = this._chargerStatus !== ZappiStatus.EvDisconnected;
    if (!initializing && evConnected !== this._lastEvConnected) {
      evConnected ? this.triggerEvConnectedFlow(evConnected) : this.triggerEvDisconnectedFlow(evConnected)
    }
    this._lastEvConnected = evConnected;
  }

  /**
   * Trigger charging flows.
   * @param chargingStarted true if charging has started
   * @returns void
   */
  private async triggerChargingFlow(chargingStarted: boolean): Promise<void> {
    const tokens = {}; //TODO Add tokens
    const state = {};
    if (chargingStarted === this._lastChargingStarted) {
      return;
    }
    this._lastChargingStarted = chargingStarted;

    this.driver.ready().then(() => {
      if (chargingStarted) {
        (this.driver as ZappiDriver).triggerChargingStartedFlow(this, tokens, state);
      } else {
        (this.driver as ZappiDriver).triggerChargingStoppedFlow(this, tokens, state);
      }
    });
  }

  /**
   * Trigger charging flows.
   * @param chargingStarted true if charging has started
   * @returns void
   */
  private async triggerChargeModeFlow(chargeMode: ZappiChargeMode): Promise<void> {
    const tokens = {}; //TODO Add tokens
    const state = {};
    if (chargeMode === this._lastChargeMode) {
      return;
    }
    const isTurnedOn = this._lastChargeMode === ZappiChargeMode.Off;
    this._lastChargeMode = chargeMode;

    this.driver.ready().then(() => {
      (this.driver as ZappiDriver).triggerChargeModeFlow(this, tokens, state);
      if (chargeMode === ZappiChargeMode.Off) {
        (this.driver as ZappiDriver).triggerChargingStoppedFlow(this, tokens, state);
      } else if (isTurnedOn) {
        (this.driver as ZappiDriver).triggerChargingStartedFlow(this, tokens, state);
      }
    });
  }

  /**
   * Trigger charging flows.
   * @param chargingStarted true if charging has started
   * @returns void
   */
  private async triggerBoostModeFlow(boostMode: ZappiBoostMode): Promise<void> {
    const tokens = {}; //TODO Add tokens
    const state = {};
    if (boostMode === this._lastBoostMode) {
      return;
    }
    const isTurnedOn = this._lastChargeMode === ZappiChargeMode.Off;
    this.log(`Zappi boost is on -> ${isTurnedOn}`)
    this._lastBoostMode = boostMode;

    this.driver.ready().then(() => {
      (this.driver as ZappiDriver).triggerBoostModeFlow(this, tokens, state);
    });
  }

  /**
  * Trigger EV connected flows.
  * @param evConnected true if charging has started
  * @returns void
  */
  private async triggerEvConnectedFlow(evConnected: boolean): Promise<void> {
    const tokens = {}; //TODO Add tokens
    const state = {};
    if (evConnected === this._lastEvConnected) {
      return;
    }
    this._lastEvConnected = evConnected;

    this.driver.ready().then(() => {
      (this.driver as ZappiDriver).triggerEvConnectedFlow(this, tokens, state);
    });
  }

  /**
  * Trigger EV connected flows.
  * @param evConnected true if charging has started
  * @returns void
  */
  private async triggerEvDisconnectedFlow(evConnected: boolean): Promise<void> {
    const tokens = {}; //TODO Add tokens
    const state = {};
    if (evConnected === this._lastEvConnected) {
      return;
    }
    this._lastEvConnected = evConnected;

    this.driver.ready().then(() => {
      (this.driver as ZappiDriver).triggerEvDisconnectedFlow(this, tokens, state);
    });
  }

  /**
   * Event handler for data updates.
   * @param data Zappi data
   */
  private async dataUpdated(data: ZappiData[]): Promise<void> {
    this.log('Received data from driver.');
    if (!this.getAvailable())
      return;
    if (data) {
      data.forEach((zappi: ZappiData) => {
        if (zappi && zappi.sno === this.deviceId) {
          try {
            if (zappi.zmo !== ZappiChargeMode.Off) {
              this._lastOnState = zappi.zmo;
            }
            this.calculateValues(zappi);
            this.setCapabilityValues();
          } catch (error) {
            this.error(error);
          }
        }
      });
    }
  }

  /**
   * Turn Zappi on or off. On is last charge mode.
   * @param isOn true if charger is on
   */
  public async setChargerState(isOn: boolean): Promise<void> {
    try {
      const result = await this.myenergiClient?.setZappiChargeMode(this.deviceId, isOn ? this._lastOnState : ZappiChargeMode.Off);
      if (result.status !== 0) {
        throw new Error(result);
      }
      this.triggerChargingFlow(isOn);
      this.log(`Zappi was switched ${isOn ? 'on' : 'off'}`);
    } catch (error) {
      this.error(`Switching the Zappi ${isOn ? 'on' : 'off'} failed:\n${error}`);
    }
  }

  /**
   * Set Zappi minimum green level.
   * @param value Percentage generated power
   */
  private async setMinimumGreenLevel(value: number): Promise<void> {
    try {
      const result = await this.myenergiClient?.setZappiGreenLevel(this.deviceId, value);
      if (result.mgl !== value) {
        throw new Error(JSON.stringify(result));
      }
      this.setCapabilityValue('minimum_green_level', value).catch(this.error);
      this.setCapabilityValue('set_minimum_green_level', value).catch(this.error);
    } catch (error) {
      this.error(`Setting minimum greenn level to ${value} failed:\n${error}`);
    }
  }

  /**
   * Set Zappi charge mode.
   * @param chargeMode @type ZappiChargeMode
   */
  public async setChargeMode(chargeMode: ZappiChargeMode): Promise<void> {
    try {
      this.setCapabilityValue('onoff', chargeMode !== ZappiChargeMode.Off).catch(this.error);
      this.setCapabilityValue('charge_mode', `${chargeMode}`).catch(this.error);
      this.setCapabilityValue('charge_mode_selector', `${chargeMode}`).catch(this.error);
      this.setCapabilityValue('charge_mode_txt', `${this.getChargeModeText(chargeMode)}`).catch(this.error);

      const result = await this.myenergiClient?.setZappiChargeMode(this.deviceId, chargeMode);
      if (result.status !== 0) {
        throw new Error(result);
      }

      this.triggerChargeModeFlow(chargeMode);
      this.log(`Zappi changed charge mode ${this.getChargeModeText(chargeMode)}`);
    } catch (error) {
      this.error(`Switching the Zappi charge mode ${this.getChargeModeText(chargeMode)} failed:\n${error}`);
    }
  }

  /**
   * Set Zappi Boost mode.
   * @param boostMode @type ZappiBoostMode
   * @param kWh Number of kWh to boost
   * @param completeTime Time to complete
   */
  private async setBoostMode(boostMode: ZappiBoostMode, kWh?: number, completeTime?: string): Promise<void> {
    try {
      this.setCapabilityValue('zappi_boost_mode', `${this.getBoostModeText(boostMode)}`).catch(this.error);
      this.setCapabilityValue('zappi_boost_kwh', kWh ? kWh : 0).catch(this.error);
      this.setCapabilityValue('zappi_boost_time', `${this.getBoostModeTime(completeTime ? completeTime : '0000')}`).catch(this.error);

      const result = await this.myenergiClient?.setZappiBoostMode(this.deviceId, boostMode, kWh, completeTime);
      if (result.status !== 0) {
        throw new Error(JSON.stringify(result));
      }

      this.triggerBoostModeFlow(boostMode);
      this.log(`Zappi changed boost mode ${this.getBoostModeText(boostMode)}`);
    } catch (error) {
      this.error(`Switching the Zappi boost mode ${(this.getBoostModeText(boostMode))} failed:\n${error}`);
    }
  }

  /**
   * Event handler for charge mode capability listener
   * @param value Charge mode
   * @param opts Options
   */
  private async onCapabilityChargeMode(value: ZappiChargeMode, opts: unknown): Promise<void> {
    this.log(`Charge Mode: ${value} - ${opts}`);
    this._chargeMode = value;
    if (this._chargeMode !== ZappiChargeMode.Off) {
      this._lastOnState = this._chargeMode;
    }
    try {
      await this.setChargerState(this._chargeMode !== ZappiChargeMode.Off);
      this.setCapabilityValue('onoff', this._chargeMode !== ZappiChargeMode.Off).catch(this.error);
      this.setCapabilityValue('charge_mode', `${this._chargeMode}`).catch(this.error);
      this.setCapabilityValue('charge_mode_txt', `${this.getChargeModeText(this._chargeMode as ZappiChargeMode)}`).catch(this.error);

    } catch (error) {
      this.error(error);
    }
  }

  /**
   * Event handler for onoff capability listener
   * @param value On or off
   * @param opts Options
   */
  private async onCapabilityOnoff(value: boolean, opts: unknown): Promise<void> {
    this.log(`onoff: ${value} - ${opts}`);
    try {
      await this.setChargerState(value);
      this.setCapabilityValue('charge_mode', value ? `${this._chargeMode}` : `${ZappiChargeMode.Off}`).catch(this.error);
      this.setCapabilityValue('charge_mode_txt', value ? `${this.getChargeModeText(this._chargeMode)}` : `${ZappiChargeModeText.Off}`).catch(this.error);
      this.setCapabilityValue('charge_mode_selector', value ? `${this._chargeMode}` : `${ZappiChargeMode.Off}`).catch(this.error);
    } catch (error) {
      this.error(error);
    }
  }

  /**
   * Event handler for onoff capability listener
   * @param value On or off
   * @param opts Options
   */
  private async onCapabilityGreenLevel(value: number, opts: unknown): Promise<void> {
    this.log(`Minimum Green Level: ${value} - ${opts}`);
    await this.setMinimumGreenLevel(value).catch(this.error);
  }

  public getChargeMode(value: ZappiChargeModeText): ZappiChargeMode {
    if (value == ZappiChargeModeText.Fast)
      return ZappiChargeMode.Fast;
    else if (value == ZappiChargeModeText.Eco)
      return ZappiChargeMode.Eco;
    else if (value == ZappiChargeModeText.EcoPlus)
      return ZappiChargeMode.EcoPlus;
    else if (value == ZappiChargeModeText.Off)
      return ZappiChargeMode.Off;
    else
      throw new Error(`Invalid charge mode text ${value}`);
  }

  private getChargeModeText(value: ZappiChargeMode): ZappiChargeModeText {
    if (value == ZappiChargeMode.Fast)
      return ZappiChargeModeText.Fast;
    else if (value == ZappiChargeMode.Eco)
      return ZappiChargeModeText.Eco;
    else if (value == ZappiChargeMode.EcoPlus)
      return ZappiChargeModeText.EcoPlus;
    else if (value == ZappiChargeMode.Off)
      return ZappiChargeModeText.Off;
    else
      throw new Error(`Invalid charge mode ${value}`);
  }

  private getBoostMode(value: ZappiBoostModeText): ZappiBoostMode {
    if (value == ZappiBoostModeText.Manual)
      return ZappiBoostMode.Manual;
    else if (value == ZappiBoostModeText.Smart)
      return ZappiBoostMode.Smart;
    else if (value == ZappiBoostModeText.Stop)
      return ZappiBoostMode.Stop;
    else
      throw new Error(`Invalid boost mode text ${value}`);
  }

  private getBoostModeText(value: ZappiBoostMode): ZappiBoostModeText {
    if (value == ZappiBoostMode.Manual)
      return ZappiBoostModeText.Manual;
    else if (value == ZappiBoostMode.Smart)
      return ZappiBoostModeText.Smart;
    else if (value == ZappiBoostMode.Stop)
      return ZappiBoostModeText.Stop;
    else
      throw new Error(`Invalid boost mode ${value}`);
  }

  private getChargerStatusText(value: ZappiStatus): ZappiStatusText {
    if (value == ZappiStatus.Charging)
      return ZappiStatusText.Charging;
    else if (value == ZappiStatus.EvConnected)
      return ZappiStatusText.EvConnected;
    else if (value == ZappiStatus.EvDisconnected)
      return ZappiStatusText.EvDisconnected;
    else if (value == ZappiStatus.EvReadyToCharge)
      return ZappiStatusText.EvReadyToCharge;
    else if (value == ZappiStatus.Fault)
      return ZappiStatusText.Fault;
    else if (value == ZappiStatus.WaitingForEv)
      return ZappiStatusText.WaitingForEv;
    else
      throw new Error(`Invalid charger status ${value}`);
  }

  /**
    * onAdded is called when the user adds the device, called just after pairing.
    */
  public async onAdded(): Promise<void> {
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
  public async onSettings({ oldSettings, newSettings, changedKeys }: {
    oldSettings: ZappiSettings;
    newSettings: ZappiSettings;
    changedKeys: string[];
  }): Promise<string | void> {
    this.log(`ZappiDevice old settings: ${oldSettings}`);
    this.log(`ZappiDevice settings where changed: ${changedKeys}`);
    if (changedKeys.includes('showNegativeValues')) {
      this._settings.showNegativeValues = newSettings.showNegativeValues;
    }
    if (changedKeys.includes('powerCalculationMode')) {
      this._settings.powerCalculationMode = newSettings.powerCalculationMode;
      if (newSettings.powerCalculationMode === "automatic") {
        this._powerCalculationModeSetToAuto = true;
        const zappi = await this.myenergiClient?.getStatusZappi(this.deviceId).catch(this.error);
        if (zappi) {
          this.log(zappi);
          this._settings.includeCT1 = zappi.ectt1 === 'Internal Load';
          this._settings.includeCT2 = zappi.ectt2 === 'Internal Load';
          this._settings.includeCT3 = zappi.ectt3 === 'Internal Load';
          this._settings.includeCT4 = zappi.ectt4 === 'Internal Load';
          this._settings.includeCT5 = zappi.ectt5 === 'Internal Load';
          this._settings.includeCT6 = zappi.ectt6 === 'Internal Load';
        }
      } else if (newSettings.powerCalculationMode === "manual") {
        this._settings.includeCT1 = newSettings.includeCT1;
        this._settings.includeCT2 = newSettings.includeCT2;
        this._settings.includeCT3 = newSettings.includeCT3;
        this._settings.includeCT4 = newSettings.includeCT4;
        this._settings.includeCT5 = newSettings.includeCT5;
        this._settings.includeCT6 = newSettings.includeCT6;
      }
    }
    if (changedKeys.includes('totalEnergyOffset')) {
      const prevEnergy: number = this.getCapabilityValue('meter_power');
      this.setCapabilityValue('meter_power', prevEnergy + (newSettings.totalEnergyOffset ? newSettings.totalEnergyOffset : 0));
      this._settings.totalEnergyOffset = 0;
      // Reset the total energy offset after one second
      this._settingsTimeoutHandle = setTimeout(() => {
        this.setSettings({ totalEnergyOffset: 0 });
        clearTimeout(this._settingsTimeoutHandle);
      }, 1000);
    }
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  public async onRenamed(name: string): Promise<void> {
    const result = await this.myenergiClient.setAppKey(`Z${this.deviceId}`, name).catch(this.error) as KeyValue[];
    if (result && result.length && result[0].val === name)
      this.log(`ZappiDevice was renamed to ${name}`);
    else
      this.error(`Failed to rename ZappiDevice to ${name} at myenergi`);
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  public async onDeleted(): Promise<void> {
    (this.driver as ZappiDriver).removeDataUpdateCallback(this._callbackId);
    this.log('ZappiDevice has been deleted');
  }

}

module.exports = ZappiDevice;
