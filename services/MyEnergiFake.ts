/* eslint-disable @typescript-eslint/no-explicit-any */
import { Eddi, EddiBoost, EddiMode, Harvi, HistoryRecord, Libbi, LibbiMode, MyEnergi, Zappi, ZappiBoostMode, ZappiChargeMode, ZappiPhaseSetting } from 'myenergi-api';
import { AppKeyValues } from 'myenergi-api/dist/src/models/AppKeyValues';
import { KeyValue } from 'myenergi-api/dist/src/models/KeyValue';
import { getFakeEddiData, getFakeHarviData, getFakeLibbiData, getFakeZappiData } from '../tools';

export class MyEnergiFake extends MyEnergi {
    private _fakeEddiMode: EddiMode;
    private _fakePhaseSetting = 'auto';
    private _fakeLibbiMode: string | number = 'BALANCE';
    constructor(username: string, password: string, apiBaseUrl?: string) {
        super(username, password, apiBaseUrl);
        this._fakeEddiMode = EddiMode.On;
    }
    public override getStatusAll(): Promise<any> {
        return new Promise<any>((resolve) => {
            console.log(`MyEnergiFake->getStatusAll()`);
            const result = [];
            result.push({ eddi: Array(1).fill(getFakeEddiData(99999997, this._fakeEddiMode)) });
            result.push({ zappi: Array(1).fill(getFakeZappiData(undefined, this._fakePhaseSetting)) });
            result.push({ harvi: Array(1).fill(getFakeHarviData()) });
            result.push({ libbi: Array(1).fill(getFakeLibbiData(undefined, this._fakeLibbiMode)) });
            resolve(result);
        });
    }
    public override getStatusZappiAll(): Promise<Zappi[]> {
        return new Promise<any>((resolve) => {
            console.log(`MyEnergiFake->getStatusZappiAll()`);
            const result = [];
            result.push(getFakeZappiData(undefined, this._fakePhaseSetting));
            resolve(result);
        });
    }
    public override getStatusZappi(serialNumber: string): Promise<Zappi | null> {
        return new Promise<any>((resolve) => {
            console.log(`MyEnergiFake->getStatusZappi(${serialNumber})`);
            resolve(getFakeZappiData(Number(serialNumber), this._fakePhaseSetting));
        });
    }
    public override setZappiChargeMode(serialNo: string, chargeMode: ZappiChargeMode): Promise<any> {
        return new Promise<any>((resolve) => {
            console.log(`MyEnergiFake->setZappiChargeMode(${serialNo}, ${chargeMode})`);
            resolve({ status: 0, statustext: "" });
        });
    }
    public override setZappiBoostMode(serialNo: string, boostMode: ZappiBoostMode, kwh?: number, completeTime?: string): Promise<any> {
        return new Promise<any>((resolve) => {
            console.log(`MyEnergiFake->setZappiBoostMode(${serialNo}, ${boostMode}, ${kwh}, ${completeTime})`);
            resolve({ status: 0, statustext: "" });
        });
    }
    public override setZappiGreenLevel(serialNo: string, percentage: number): Promise<any> {
        return new Promise<any>((resolve) => {
            console.log(`MyEnergiFake->setZappiGreenLevel(${serialNo}, ${percentage})`);
            resolve({ status: 0, statustext: "" });
        });
    }
    public override setZappiPhaseSetting(serialNo: string, phaseSetting: ZappiPhaseSetting): Promise<any> {
        return new Promise<any>((resolve) => {
            console.log(`MyEnergiFake->setZappiPhaseSetting(${serialNo}, ${phaseSetting})`);
            this._fakePhaseSetting = phaseSetting === ZappiPhaseSetting.SinglePhase ? '1' : (phaseSetting === ZappiPhaseSetting.ThreePhase ? '3' : 'auto');
            resolve({ status: 0, statustext: "" });
        });
    }
    public override getDayHourHistory(id: string, year: number, month: number, day: number, startHour?: number, noHours?: number): Promise<HistoryRecord[]> {
        return new Promise<HistoryRecord[]>((resolve) => {
            console.log(`MyEnergiFake->getDayHourHistory(${id}, ${year}-${month}-${day}, ${startHour}, ${noHours})`);
            const hours = noHours ?? 24;
            const records: HistoryRecord[] = [];
            for (let i = 0; i < hours; i++) {
                records.push({
                    hr: ((startHour ?? 0) + i) % 24,
                    dom: day,
                    mon: month,
                    yr: year,
                    imp: 3600000,
                    h1d: 1800000,
                    h1b: 900000,
                });
            }
            resolve(records);
        });
    }
    public override getStatusLibbiAll(): Promise<Libbi[]> {
        return new Promise<any>((resolve) => {
            console.log(`MyEnergiFake->getStatusLibbiAll()`);
            resolve([getFakeLibbiData(undefined, this._fakeLibbiMode)]);
        });
    }
    public override getStatusLibbi(serialNumber: string): Promise<Libbi | null> {
        return new Promise<any>((resolve) => {
            console.log(`MyEnergiFake->getStatusLibbi(${serialNumber})`);
            resolve(getFakeLibbiData(Number(serialNumber), this._fakeLibbiMode));
        });
    }
    public override setLibbiMode(serialNo: string, mode: LibbiMode): Promise<any> {
        return new Promise<any>((resolve) => {
            console.log(`MyEnergiFake->setLibbiMode(${serialNo}, ${mode})`);
            this._fakeLibbiMode = mode === LibbiMode.Stop ? 'STOP' : (mode === LibbiMode.Export ? 'DRAIN' : 'BALANCE');
            resolve({ status: 0, statustext: "" });
        });
    }
    public override getStatusEddiAll(): Promise<Eddi[]> {
        return new Promise<any>((resolve) => {
            console.log(`MyEnergiFake->getStatusEddiAll()`);
            const result = [];
            result.push(getFakeEddiData(99999997, this._fakeEddiMode));
            resolve(result);
        });
    }
    public override getStatusEddi(serialNumber: string): Promise<Eddi | null> {
        return new Promise<any>((resolve) => {
            console.log(`MyEnergiFake->getStatusEddi(${serialNumber})`);
            resolve(getFakeEddiData(Number(serialNumber), this._fakeEddiMode));
        });
    }
    public override setEddiMode(serialNo: string, mode: EddiMode): Promise<any> {
        return new Promise<any>((resolve) => {
            this._fakeEddiMode = mode;
            console.log(`MyEnergiFake->setEddiMode(${serialNo}, ${mode})`);
            resolve({ status: 0, statustext: "" });
        });
    }
    public override setEddiBoost(serialNo: string, boost: EddiBoost, minutes?: number): Promise<any> {
        return new Promise<any>((resolve) => {
            console.log(`MyEnergiFake->setEddiBoost(${serialNo}, ${boost}, ${minutes})`);
            resolve({ status: 0, statustext: "" });
        });
    }
    public override getStatusHarviAll(): Promise<Harvi[]> {
        return new Promise<any>((resolve) => {
            console.log(`MyEnergiFake->getStatusHarviAll()`);
            const result = [];
            result.push(getFakeHarviData());
            resolve(result);
        });
    }
    public override getStatusHarvi(serialNumber: string): Promise<Harvi | null> {
        return new Promise<any>((resolve) => {
            console.log(`MyEnergiFake->getStatusHarviAll(${serialNumber})`);
            resolve(getFakeHarviData(Number(serialNumber)));
        });
    }
    public override getAppKeyFull(key: string): Promise<AppKeyValues | null> {
        return new Promise<any>((resolve) => {
            console.log(`MyEnergiFake->getAppKeyFull(${key})`);
            resolve({ H00000000: [{ key: key, val: `Fake ${key}` }] });
        });
    }
    public override getAppKey(key: string): Promise<KeyValue[] | null> {
        return new Promise<any>((resolve) => {
            console.log(`MyEnergiFake->getAppKey(${key})`);
            resolve([{ key: key, val: `Fake ${key}` }]);
        });
    }
    public override setAppKey(key: string, val: string): Promise<KeyValue[] | null> {
        return new Promise<any>((resolve) => {
            console.log(`MyEnergiFake->setAppKey(${key}, ${val})`);
            resolve({ H00000000: [{ key: key, val: val }] });
        });
    }
}
