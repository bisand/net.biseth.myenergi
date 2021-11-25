'use strict';

const { Driver } = require('homey');

class ZappiDriver extends Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.zappiDevices = [];
    this.log('ZappiDriver has been initialized');
  }

  async loadZappiDevices() {
    const res = new Promise((resolve, reject) => {
      Object.keys(this.homey.app.clients).forEach(async (key, i, arr) => {
        const client = this.homey.app.clients[key];
        const zappis = await client.getStatusZappiAll();
        zappis.forEach(zappi => {
          if (this.zappiDevices.findIndex(z => z.sno === zappi.sno) === -1) {
            zappi['myenergiClientId'] = key;
            this.zappiDevices.push(zappi);
          }
        });
        resolve(this.zappiDevices);
      });
    });
    return res;
  }

  async getZappiDevices() {
    await this.loadZappiDevices();
    return this.zappiDevices.map((v, i, a) => {
      return {
        name: `Zappi ${v.sno}`,
        data: { id: v.sno },
        icon: 'images/zappi.svg', // relative to: /drivers/<driver_id>/assets/
        store: {
          myenergiClientId: v.myenergiClientId,
        },
        capabilities: ['onoff'],
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
    return this.getZappiDevices();
  }

  async onPair(session) {
    session.setHandler('list_devices', () => {
      const devices = this.getZappiDevices();

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

module.exports = ZappiDriver;
