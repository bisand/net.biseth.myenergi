import { AccountDevice, AccountVehicle, LibbiChargeSetup, MyEnergiAccount, ZappiSingleCharge } from 'myenergi-api';

export class MyEnergiAccountFake extends MyEnergiAccount {
    private _fakeChargeFromGrid = false;
    private _fakeEnergyTarget = 4600;
    public override async login(): Promise<void> {
        console.log(`MyEnergiAccountFake->login()`);
    }
    public override async getLibbiChargeFromGrid(serialNo: string): Promise<boolean> {
        console.log(`MyEnergiAccountFake->getLibbiChargeFromGrid(${serialNo})`);
        return this._fakeChargeFromGrid;
    }
    public override async setLibbiChargeFromGrid(serialNo: string, chargeFromGrid: boolean): Promise<void> {
        console.log(`MyEnergiAccountFake->setLibbiChargeFromGrid(${serialNo}, ${chargeFromGrid})`);
        this._fakeChargeFromGrid = chargeFromGrid;
    }
    public override async getLibbiChargeSetup(serialNo: string): Promise<LibbiChargeSetup> {
        console.log(`MyEnergiAccountFake->getLibbiChargeSetup(${serialNo})`);
        return { deviceSerial: serialNo, chargeFromGrid: this._fakeChargeFromGrid, energyTarget: this._fakeEnergyTarget };
    }
    public override async setLibbiChargeTarget(serialNo: string, targetEnergyWh: number): Promise<void> {
        console.log(`MyEnergiAccountFake->setLibbiChargeTarget(${serialNo}, ${targetEnergyWh})`);
        this._fakeEnergyTarget = targetEnergyWh;
    }
    public override async getDevice(serialNo: string): Promise<AccountDevice | null> {
        console.log(`MyEnergiAccountFake->getDevice(${serialNo})`);
        return { id: `fake-${serialNo}`, deviceName: 'Fake', deviceType: 'zappi', serialNumber: serialNo, firmware: '', status: 2 };
    }
    public override async getVehicles(): Promise<AccountVehicle[]> {
        console.log(`MyEnergiAccountFake->getVehicles()`);
        return [{ id: 'fake-vehicle', manufacturer: 'Fake', model: 'EV', batterySize: 60, chargeRate: 7.4 }];
    }
    public override async setZappiSingleCharge(deviceId: string, charge: ZappiSingleCharge): Promise<unknown> {
        console.log(`MyEnergiAccountFake->setZappiSingleCharge(${deviceId}, ${JSON.stringify(charge)})`);
        return {};
    }
    public override async removeZappiSingleCharges(deviceId: string, name: string): Promise<unknown> {
        console.log(`MyEnergiAccountFake->removeZappiSingleCharges(${deviceId}, ${name})`);
        return {};
    }
}
