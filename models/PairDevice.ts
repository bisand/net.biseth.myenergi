import { PairDeviceData } from './PairDeviceData';
import { PairDeviceStore } from './PairDeviceStore';


export interface PairDevice {
  name: string;
  data: PairDeviceData;
  icon: string; // relative to: /drivers/<driver_id>/assets/
  store: PairDeviceStore;
  capabilities: string[];
  capabilitiesOptions: unknown;
  settings: unknown;
}
