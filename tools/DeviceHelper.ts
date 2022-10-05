import { Device } from 'homey';

export class DeviceHelper {
    private _device: Device;
    /**
     *
     */
    constructor(device: Device) {
        this._device = device;
    }

    /**
     * Validate capabilities to see if anything has changed.
     * @param capabilities Capabilities represented by an array of strings.
     * @returns true if changes are detected
     */
    public detectCapabilityChanges(capabilities: string[]): boolean {
        let result = false;
        try {
            const devName = this._device.getName();
            this._device.log(`Detecting ${devName} capability changes...`);
            const caps = this._device.getCapabilities();
            for (const cap of caps) {
                if (!capabilities.includes(cap)) {
                    this._device.log(`${devName} capability ${cap} was removed.`);
                    result = true;
                }
            }
            for (const cap of capabilities) {
                if (!this._device.hasCapability(cap)) {
                    this._device.log(`${devName} capability ${cap} was added.`);
                    result = true;
                }
            }
            if (!result)
                this._device.log('No changes in capabilities.');

        } catch (error) {
            this._device.error(`An error ocurred while detecting capabilities.\n${error}`);
        }
        return result;
    }

    /**
     * Initialize capabilities. Add new and delete removed capabilities.
     * @param capabilities Capabilities represented by an array of strings
     */
    public async initializeCapabilities(capabilities: string[]) {
        const devName = this._device.getName();
        await this._device.setUnavailable(`${devName} is currently doing some maintenance taks and will be back shortly.`).catch(this._device.error);
        this._device.log(`****** Initializing ${devName} sensor capabilities ******`);
        const caps = this._device.getCapabilities();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tmpCaps: any = {};
        // Remove all capabilities in case the order has changed
        for (const cap of caps) {
            try {
                tmpCaps[cap] = this._device.getCapabilityValue(cap);
                await this._device.removeCapability(cap).catch(this._device.error);
                this._device.log(`*** ${cap} - Removed`);
            } catch (error) {
                this._device.error(error);
            }
        }
        // Re-apply all capabilities.
        for (const cap of capabilities) {
            try {
                if (this._device.hasCapability(cap))
                    continue;
                await this._device.addCapability(cap).catch(this._device.error);
                if (tmpCaps[cap])
                    this._device.setCapabilityValue(cap, tmpCaps[cap]);
                this._device.log(`*** ${cap} - Added`);
            } catch (error) {
                this._device.error(error);
            }
        }
        this._device.log(`****** Sensor capability initialization complete ******`);
        this._device.setAvailable().catch(this._device.error);
    }

    /**
     * Generates a random number based on input constraints.
     * @param min Minimum number
     * @param max Maximum number
     * @returns Random number based on input.
     */
    public getRndInteger(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}