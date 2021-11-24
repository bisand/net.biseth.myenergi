'use strict';

const Homey = require('homey');
const { MyEnergi } = require('myenergi-api');

class MyEnergiApp extends Homey.App {

  async initClients(myenergiHubs) {
    if (this.clients) {
      Object.keys(this.clients).forEach((key, i, arr) => {
        this.log(key);
        delete this.clients[key];
      });
    }
    if (myenergiHubs) {
      this.clients = {};
      myenergiHubs.forEach(hub => {
        this.log(hub);
        this.clients[`${hub.hubname}_${hub.username}`] = new MyEnergi(hub.username, hub.password);
      });
    }
  }

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    const myenergiHubs = this.homey.settings.get('myenergiHubs');
    this.initClients(myenergiHubs);
    this.homey.settings.on('set', key => {
      if (key === 'myenergiHubs') {
        const myenergiHubs = this.homey.settings.get('myenergiHubs');
        this.initClients(myenergiHubs);
      }
    });
    this.log('myenergi app has been initialized');
  }

}

module.exports = MyEnergiApp;
