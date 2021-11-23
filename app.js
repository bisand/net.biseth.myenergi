'use strict';

const Homey = require('homey');
const { MyEnergi } = require('myenergi-api');

const USERNAME = Homey.env.HUB_USERNAME;
const PASSWORD = Homey.env.HUB_PASSWORD;

class MyApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.client = new MyEnergi(USERNAME, PASSWORD);
    this.log('MyApp has been initialized');
  }

}

module.exports = MyApp;
