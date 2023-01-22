import { EddiMode } from 'myenergi-api';

/**
 * Calculate accumulated kWh since last power measurement
 * @returns Accumulated kWh 
 */
export function calculateEnergy(lastCalculation: Date, lastPower: number, currentPower: number, lastEnergy: number): number {
    const dateNow = new Date();
    const seconds = Math.abs((dateNow.getTime() - lastCalculation.getTime()) / 1000);
    const energy: number = lastEnergy + ((((lastPower + currentPower) / 2) * seconds) / 3600000);
    // this.log(`Energy algo: ${lastEnergy} + ((((${lastPower} + ${currentPower}) / 2) * ${seconds}) / 3600000)`);
    return energy;
}

/**
 * Generates a fake Zappi EV charger that can be used for testing/debug porposes.
 * @returns A fake Zappi object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getFakeZappi(myenergiClientId: string, id: string, name: string): any {
    return {
        name: name,
        data: {
            id: id,
        },
        icon: 'icon.svg',
        store: {
            myenergiClientId: myenergiClientId
        },
        capabilities: [
            "onoff",
            "charge_mode_selector",
            "set_minimum_green_level",
            "button.reset_meter",
            "button.reload_capabilities",
            "charge_mode",
            "charge_mode_txt",
            "charger_status",
            "charger_status_txt",
            "measure_power",
            "measure_current",
            "measure_voltage",
            "measure_frequency",
            "charge_session_consumption",
            "meter_power",
            "zappi_boost_mode",
            "minimum_green_level",
            "zappi_boost_kwh",
            "zappi_boost_time",
            "zappi_boost_kwh_remaining",
            "ev_connected"
        ],
        capabilitiesOptions: {}
    };
}

/**
 * Generates a fake Zappi EV charger that can be used for testing/debug porposes.
 * @returns A fake Zappi object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getFakeEddi(myenergiClientId: string, id: string, name: string): any {
    return {
        name: name,
        data: {
            id: id,
        },
        icon: 'icon.svg',
        store: {
            myenergiClientId: myenergiClientId
        },
        capabilities: [
            "onoff",
            "heater_status",
            "heater_session_transferred",
            "measure_power_ct1",
            "measure_power_ct2",
            "measure_power_generated",
            "measure_current_ct1",
            "measure_current_ct2",
            "measure_voltage",
            "heater_1_name",
            "heater_2_name",
            "meter_power",
            "meter_power_ct1",
            "meter_power_ct2",
            "meter_power_generated"
        ],
        capabilitiesOptions: {}
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function includeFakeData(data: any) {
    if (process.env.DEBUG !== '1')
        return data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = data.reduce((a: any, c: any) => {
        if (c.eddi) {
            c.eddi.push(getFakeEddiData());
        }
        if (c.zappi) {
            c.zappi.push(getFakeZappiData());
        }
        if (c.harvi) {
            c.harvi.push(getFakeHarviData());
        }
        a.push(c);
        return a;
    }, []);
    return result;
}

export function getFakeZappiData(serialNumber = 99999999) {
    return { "sno": serialNumber, "dat": getDate(), "tim": getTime(), "ectp2": -3, "ectt1": "Internal Load", "ectt2": "None", "ectt3": "None", "bsm": 0, "bst": 0, "cmt": 255, "dst": 1, "div": 0, "frq": getRandom(51, 49), "fwv": "3300S0.000", "grd": getRandomInt(10000), "pha": 1, "pri": 1, "sta": 1, "tz": 0, "vol": getRandomInt(2400, 2200), "che": 59.91, "bss": 0, "lck": 0, "pst": "A", "zmo": 1, "zs": 20, "rdc": 3, "rac": 1, "rrac": 2, "zsl": 20, "ectt4": "None", "ectt5": "None", "ectt6": "None", "newAppAvailable": false, "newBootloaderAvailable": false, "beingTamperedWith": false, "batteryDischargeEnabled": false, "mgl": 32, "sbh": 6, "sbk": 22, "sbm": 15 };
}

export function getFakeHarviData(serialNumber = 99999998) {
    return { "sno": serialNumber, "dat": getDate(), "tim": getTime(), "ectp1": getRandomInt(15000), "ectp2": getRandomInt(15000), "ectp3": getRandomInt(15000), "ectt1": "Grid", "ectt2": "Grid", "ectt3": "Grid", "ect1p": 1, "ect2p": 2, "ect3p": 3, "fwv": "3170S0.000" }
}

export function getFakeEddiData(serialNumber = 99999997, eddiMode: EddiMode = EddiMode.Off) {
    return {
        bsm: 0,                         // Boost-Manual
        bst: 0,                         // Boost-Timed
        cmt: 255,                       // Command Tries
        dat: getDate(),                 // Date of Data
        dcv: 0,                         // Device Config Version
        div: getRandom(500),            // Diverted Power (Load power)
        dst: 0,                         // Daylight savings time
        ectp1: getRandomInt(2500),      // CT 1 Power (Watts)
        ectp2: getRandomInt(4000),      // CT 2 Power
        ectp3: 0,                       // CT 3 Power
        ectp4: 0,                       // CT 4 Power
        ectp5: 0,                       // CT 5 Power
        ectp6: 0,                       // CT 6 Power
        ectt1: "Grid",                  // CT 1 Type (AC Battery, Generation, Generation & Battery, Grid, Internal Load, Monitor, None, Storage)
        ectt2: "Generation",            // CT 2 Type
        ectt3: "None",                  // CT 3 Type
        ectt4: "None",                  // CT 4 Type
        ectt5: "None",                  // CT 5 Type
        ectt6: "None",                  // CT 6 Type
        eli: false,                     // Ethernet Link Up
        frq: getRandom(51, 49),         // Frequency
        fwv: "3300S0.000",              // Firmware Version
        gen: getRandomInt(5000),        // Gen Power (Watts)
        grd: getRandomInt(10000),       // Grid Power (Watts)
        hno: getRandomInt(2),           // Heater No
        ht1: "Tank 1",                  // Heater Types for heaters 1 (None, Tank 1, Tank 2, Radiator, Underfloor, Pool)
        ht2: "Pool",                    // Heater Types for heaters 2
        naa: false,                     // New App Available
        nba: false,                     // New Bootloader Available
        pha: 1,                         // Phase
        pri: getRandomInt(7),           // Priority
        r1a: getRandomInt(1),           // Relay 1 Active
        r2a: getRandomInt(1),           // Relay 2 Active
        r1b: 0,                         // Relay 1 Boost Type (0=Not boostable, 1=Boiler, 2=Heat Pump, 3=Battery)
        r2b: 1,                         // Relay 2 Boost Type
        rbc: 1,                         // Relay Board Connected
        rbt: new Date().getSeconds(),   // Remaining boost time (Manual Boost)
        sno: serialNumber,              // Serial No of unit
        sta: eddiMode === EddiMode.Off ? 6 : getRandomInt(5),   // State (0=Starting, 1=Waiting for export, 2=DSR, 3=Diverting, 4=Boosting, 5=Hot, 6=Stopped)
        tim: getTime(),                 // Time of Data
        tp1: getRandom(80, 60),         // Temp Probe 1 temp
        tp2: getRandom(80, 60),         // Temp Probe 2 temp
        tz: 3,                          // Time Zone
        vol: getRandomInt(2400, 2200),  // Voltage
        vhu: false,                     // Virtual Hub
        wli: false,                     // WiFi link. The WiFi link is up
    }
}

/**
 * Generate random number with a max value.
 * @param {number} max Maximum number
 * @returns {number} Random number.
 */
function getRandomInt(max: number, min = 0): number {
    return Math.floor(Math.random() * (max - min) + min);
}

function getRandom(max: number, min = 0): number {
    return Number((Math.random() * (max - min) + min).toFixed(2))
}

function getDate(): string {
    const d = new Date();
    return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`
}

function getTime(): string {
    const d = new Date();
    return `${d.getHours()}:${d.getMinutes() + 1}:${d.getSeconds()}`
}
