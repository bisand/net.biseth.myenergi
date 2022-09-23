import Homey from 'homey/lib/Homey';
import { MyEnergiApp } from './app';

module.exports = {

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async postLogin(data: { homey: Homey, body: any }) {
        const app = data.homey.app as MyEnergiApp;
        const response = await app.validateCredentials(data.body).catch(this.error);
        console.log(response);
        return (response);
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
    async getTest(data: { homey: Homey, query: any }) {
        // you can access query parameters like "/?foo=bar" through `query.foo`

        // you can access the App instance through homey.app
        const result = [{ test: "test1" }, { test: "test2" }];

        // perform other logic like mapping result data

        return result;
    }
}

