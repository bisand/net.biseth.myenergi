
export interface EddiSettings {
  powerCalculationMode?: string;
  includeCT1?: boolean;
  includeCT2?: boolean;
  includeCT3?: boolean;
  showNegativeValues?: boolean;
  subtractGeneratedEnergy?: boolean;
  energyOffsetTotal?: number;
  energyOffsetCT1?: number;
  energyOffsetCT2?: number;
  energyOffsetCT3?: number;
  energyOffsetGenerated?: number;
  siteName?: string;
  hubSerial?: string;
  eddiSerial?: string;
}
