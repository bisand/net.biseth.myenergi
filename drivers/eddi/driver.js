'use strict';

const { Driver } = require('homey');

class EddiDriver extends Driver {

  #dataUpdateCallbacks = [];
  eddiDevices = [];

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.homey.app.registerDataUpdateCallback(data => this.dataUpdated(data));
    this.log('EddiDriver has been initialized');
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
        if (d.eddi) {
          this.#dataUpdateCallbacks.forEach(callback => {
            callback(d.eddi);
          });
        }
      });
    }
  }

  async loadEddiDevices() {
    const res = new Promise((resolve, reject) => {
      Object.keys(this.homey.app.clients).forEach(async (key, i, arr) => {
        const client = this.homey.app.clients[key];
        const eddis = await client.getStatusEddiAll();
        eddis.forEach(eddi => {
          if (this.eddiDevices.findIndex(z => z.sno === eddi.sno) === -1) {
            eddi['myenergiClientId'] = key;
            this.eddiDevices.push(eddi);
          }
        });
        resolve(this.eddiDevices);
      });
    });
    return res;
  }

  async getEddiDevices() {
    await this.loadEddiDevices();
    return this.eddiDevices.map((v, i, a) => {
      return {
        name: `Eddi ${v.sno}`,
        data: { id: v.sno },
        icon: 'icon.svg', // relative to: /drivers/<driver_id>/assets/
        store: {
          myenergiClientId: v.myenergiClientId,
        },
        capabilities: [
          'onoff',
          'heater_status',
          'heater_session_transferred',
          'measure_power_ct1',
          'measure_power_ct2',
          'measure_power_generated',
          'measure_current_ct1',
          'measure_current_ct2',
          'measure_voltage',
          'heater_1_name',
          'heater_2_name',
        ],
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
    return this.getEddiDevices();
  }

  async onPair(session) {
    session.setHandler('list_devices', () => {
      const devices = this.getEddiDevices();

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

module.exports = EddiDriver;
