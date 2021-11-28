'use strict';

const Homey = require('homey');
const { MyEnergi } = require('myenergi-api');

class MyEnergiApp extends Homey.App {

  #dataUpdateInterval = 60 * 1000;
  #dataUpdateId;
  #dataUpdateCallbacks = [];

  async initClients(myenergiHubs) {
    if (this.clients) {
      Object.keys(this.clients).forEach((key, i, arr) => {
        this.log(key);
        delete this.clients[key];
      });
    }
    if (myenergiHubs) {
      this.clients = {};
      myenergiHubs.forEach((hub, index) => {
        this.log(hub);
        this.clients[`${hub.hubname}_${hub.username}`] = new MyEnergi(hub.username, hub.password);
        if (index === 0) {
          this.#dataUpdateInterval = hub.pollInterval * 1000;
        }
      });
    }
  }

  registerDataUpdateCallback(callback) {
    this.#dataUpdateCallbacks.push(callback);
  }

  runDataUpdate() {
    const updateInterval = this.#dataUpdateInterval / 1000;
    this.log(`Starting scheduled data update. Running every ${updateInterval} seconds.`);
    clearTimeout(this.#dataUpdateId);
    if (this.clients) {
      Object.keys(this.clients).forEach(async client => {
        this.log(`Fetching data for ${client}`);
        const data = await this.clients[client].getStatusAll().catch(this.error);
        this.#dataUpdateCallbacks.forEach(callback => {
          callback(data);
        });
      });
    }
    this.#dataUpdateId = setTimeout(() => {
      this.runDataUpdate();
    }, this.#dataUpdateInterval);
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
    this.runDataUpdate();
    this.log('myenergi app has been initialized');
  }

}

module.exports = MyEnergiApp;
