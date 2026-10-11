import { LibbiChargeSetup, MyEnergiAccount } from 'myenergi-api';

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
}
