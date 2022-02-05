import { CapabilityType } from './CapabilityType';

export class Capability {
    constructor(name: string, type: CapabilityType, order: number) {
        this.name = name;
        this.type = type;
        this.order = order;
    }
    public name!: string;
    public type!: CapabilityType;
    public order!: number;
}
