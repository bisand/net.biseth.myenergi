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

