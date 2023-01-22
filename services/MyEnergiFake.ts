/* eslint-disable @typescript-eslint/no-explicit-any */
import { Eddi, EddiBoost, EddiMode, Harvi, MyEnergi, Zappi, ZappiBoostMode, ZappiChargeMode } from 'myenergi-api';
import { AppKeyValues } from 'myenergi-api/dist/src/models/AppKeyValues';
import { KeyValue } from 'myenergi-api/dist/src/models/KeyValue';
import { getFakeEddiData, getFakeHarviData, getFakeZappiData } from '../tools';

export class MyEnergiFake extends MyEnergi {
    private _fakeEddiMode: EddiMode;
    constructor(username: string, password: string, apiBaseUrl?: string) {
        super(username, password, apiBaseUrl);
        this._fakeEddiMode = EddiMode.On;
    }
    public override getStatusAll(): Promise<any> {
        return new Promise<any>((resolve) => {
            console.log(`${typeof MyEnergiFake}->getStatusAll()`);
            const result = [];
            result.push({ eddi: Array(1).fill(getFakeEddiData(99999997, this._fakeEddiMode)) });
            result.push({ zappi: Array(1).fill(getFakeZappiData()) });
            result.push({ harvi: Array(1).fill(getFakeHarviData()) });
            resolve(result);
        });
    }
    public override getStatusZappiAll(): Promise<Zappi[]> {
        return new Promise<any>((resolve) => {
            console.log(`${typeof MyEnergiFake}->getStatusZappiAll()`);
            const result = [];
            result.push(getFakeZappiData());
            resolve(result);
        });
    }
    public override getStatusZappi(serialNumber: string): Promise<Zappi | null> {
        return new Promise<any>((resolve) => {
            console.log(`${typeof MyEnergiFake}->getStatusZappi(${serialNumber})`);
            resolve(getFakeZappiData(Number(serialNumber)));
        });
    }
    public override setZappiChargeMode(serialNo: string, chargeMode: ZappiChargeMode): Promise<any> {
        return new Promise<any>((resolve) => {
            console.log(`${typeof MyEnergiFake}->setZappiChargeMode(${serialNo}, ${chargeMode})`);
            resolve({ status: 0, statustext: "" });
        });
    }
    public override setZappiBoostMode(serialNo: string, boostMode: ZappiBoostMode, kwh?: number, completeTime?: string): Promise<any> {
        return new Promise<any>((resolve) => {
            console.log(`${typeof MyEnergiFake}->setZappiBoostMode(${serialNo}, ${boostMode}, ${kwh}, ${completeTime})`);
            resolve({ status: 0, statustext: "" });
        });
    }
    public override setZappiGreenLevel(serialNo: string, percentage: number): Promise<any> {
        return new Promise<any>((resolve) => {
            console.log(`${typeof MyEnergiFake}->setZappiGreenLevel(${serialNo}, ${percentage})`);
            resolve({ status: 0, statustext: "" });
        });
    }
    public override getStatusEddiAll(): Promise<Eddi[]> {
        return new Promise<any>((resolve) => {
            console.log(`${typeof MyEnergiFake}->getStatusEddiAll()`);
            const result = [];
            result.push(getFakeEddiData(99999997, this._fakeEddiMode));
            resolve(result);
        });
    }
    public override getStatusEddi(serialNumber: string): Promise<Eddi | null> {
        return new Promise<any>((resolve) => {
            console.log(`${typeof MyEnergiFake}->getStatusEddi(${serialNumber})`);
            resolve(getFakeEddiData(Number(serialNumber), this._fakeEddiMode));
        });
    }
    public override setEddiMode(serialNo: string, mode: EddiMode): Promise<any> {
        return new Promise<any>((resolve) => {
            this._fakeEddiMode = mode;
            console.log(`${typeof MyEnergiFake}->setEddiMode(${serialNo}, ${mode})`);
            resolve({ status: 0, statustext: "" });
        });
    }
    public override setEddiBoost(serialNo: string, boost: EddiBoost, minutes?: number): Promise<any> {
        return new Promise<any>((resolve) => {
            console.log(`${typeof MyEnergiFake}->setEddiBoost(${serialNo}, ${boost}, ${minutes})`);
            resolve({ status: 0, statustext: "" });
        });
    }
    public override getStatusHarviAll(): Promise<Harvi[]> {
        return new Promise<any>((resolve) => {
            console.log(`${typeof MyEnergiFake}->getStatusHarviAll()`);
            const result = [];
            result.push(getFakeHarviData());
            resolve(result);
        });
    }
    public override getStatusHarvi(serialNumber: string): Promise<Harvi | null> {
        return new Promise<any>((resolve) => {
            console.log(`${typeof MyEnergiFake}->getStatusHarviAll(${serialNumber})`);
            resolve(getFakeHarviData(Number(serialNumber)));
        });
    }
    public override getAppKeyFull(key: string): Promise<AppKeyValues | null> {
        return new Promise<any>((resolve) => {
            console.log(`${typeof MyEnergiFake}->getAppKeyFull(${key})`);
            resolve({ H00000000: [{ key: key, val: `Fake ${key}` }] });
        });
    }
    public override getAppKey(key: string): Promise<KeyValue[] | null> {
        return new Promise<any>((resolve) => {
            console.log(`${typeof MyEnergiFake}->getAppKey(${key})`);
            resolve([{ key: key, val: `Fake ${key}` }]);
        });
    }
    public override setAppKey(key: string, val: string): Promise<KeyValue[] | null> {
        return new Promise<any>((resolve) => {
            console.log(`${typeof MyEnergiFake}->setAppKey(${key}, ${val})`);
            resolve({ H00000000: [{ key: key, val: val }] });
        });
    }
}
