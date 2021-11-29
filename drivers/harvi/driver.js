'use strict';

const { Driver } = require('homey');

class HarviDriver extends Driver {

  #dataUpdateCallbacks = [];
  harviDevices = [];

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.homey.app.registerDataUpdateCallback(data => this.dataUpdated(data));
    this.log('HarviDriver has been initialized');
  }

  registerDataUpdateCallback(callback) {
    return this.#dataUpdateCallbacks.push(callback);
  }

  removeDataUpdateCallback(callbackId) {
    this.#dataUpdateCallbacks.splice(callbackId, 1);
  }

  dataUpdated(data) {
    this.log('Received data from app. Relaying to devices.');
    if (data) {
      data.forEach(d => {
        if (d.harvi) {
          this.#dataUpdateCallbacks.forEach(callback => {
            callback(d.harvi);
          });
        }
      });
    }
  }

  async loadHarviDevices() {
    const res = new Promise((resolve, reject) => {
      Object.keys(this.homey.app.clients).forEach(async (key, i, arr) => {
        const client = this.homey.app.clients[key];
        const harvis = await client.getStatusHarviAll();
        harvis.forEach(harvi => {
          if (this.harviDevices.findIndex(z => z.sno === harvi.sno) === -1) {
            harvi['myenergiClientId'] = key;
            this.harviDevices.push(harvi);
          }
        });
        resolve(this.harviDevices);
      });
    });
    return res;
  }

  async getHarviDevices() {
    await this.loadHarviDevices();
    return this.harviDevices.map((v, i, a) => {
      return {
        name: `Harvi ${v.sno}`,
        data: { id: v.sno },
        icon: 'icon.svg', // relative to: /drivers/<driver_id>/assets/
        store: {
          myenergiClientId: v.myenergiClientId,
        },
        capabilities: ['ct1_type', 'measure_power_ct1', 'ct2_type', 'measure_power_ct2', 'ct3_type', 'measure_power_ct3'],
        capabilitiesOptions: {
        },
      };
    });
  }

  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    return this.getHarviDevices();
  }

  async onPair(session) {
    session.setHandler('list_devices', () => {
      const devices = this.getHarviDevices();

      // you can emit when devices are still being searched
      // session.emit("list_devices", devices);
      // return devices when searching is done
      return devices;
      // when no devices are found, return an empty array
      // return [];
      // or throw an Error to show that instead
      // throw new Error('Something bad has occured!');
    });
  }

}

module.exports = HarviDriver;
