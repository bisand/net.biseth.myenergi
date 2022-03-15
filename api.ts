import { Console } from 'console';
import { SimpleClass } from 'homey';
import Homey from 'homey/lib/Homey';
import { MyEnergi } from 'myenergi-api';
import { MyEnergiApp } from './app';
import { Credential } from './models/Credential';
import { Response } from './models/Result';

module.exports = {

    async validateCredentials(data: { homey: Homey, body: Credential }) {
        console.log(data);
        const app = data.homey.app as MyEnergiApp;
        const response = await app.validateCredentials(data.body);
        console.log(response);
        return (response);
    }
};
