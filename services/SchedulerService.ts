import { EventEmitter } from 'events';

export class SchedulerService extends EventEmitter {

    private _action: () => void;
    private _handle?: NodeJS.Timer;
    private _interval: number;

    constructor(action: () => void, ms: number) {
        super();
        this._action = action;
        this._handle = undefined;
        this._interval = ms;
        this.addListener('timeout', this._action);
    }

    public start(interval?: number) {
        if (interval) {
            this._interval = interval;
        }
        if (!this._handle) {
            this._handle = setInterval(() => this.emit('timeout'), this._interval);
        }
    }

    public stop() {
        if (this._handle) {
            clearInterval(this._handle);
            this._handle = undefined;
        }
    }
}