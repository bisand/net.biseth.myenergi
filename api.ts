import { SimpleClass } from 'homey';
import Homey from 'homey/lib/Homey';
import { MyEnergiApp } from './app';
import { Credential } from './models/Credential';

module.exports = {

    async postLogin(data: { homey: Homey, body: any }) {
        const app = data.homey.app as MyEnergiApp;
        const response = await app.validateCredentials(data.body);
        console.log(response);
        return (response);
    },

    async getTest(data: { homey: Homey, query: any }) {
        // you can access query parameters like "/?foo=bar" through `query.foo`

        // you can access the App instance through homey.app
        const result = [{ test: "test1" }, { test: "test2" }];

        // perform other logic like mapping result data

        return result;
    }
}

