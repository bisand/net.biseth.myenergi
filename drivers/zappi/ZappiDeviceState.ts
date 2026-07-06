
/**
 * Device state as reported in the sta field of the Zappi status.
 * Complements the pilot state (pst) with what the charger is actually doing.
 */
export enum ZappiDeviceState {
    Unknown = -1,
    Starting = 0,
    WaitingForExport = 1,
    DSR = 2,
    Diverting = 3,
    Boosting = 4,
    Complete = 5,
    Stopped = 6
}
