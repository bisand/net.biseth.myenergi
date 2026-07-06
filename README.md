# myenergi app for Homey

[![DeepScan grade](https://deepscan.io/api/teams/16513/projects/19834/branches/520482/badge/grade.svg)](https://deepscan.io/dashboard#view=project&tid=16513&pid=19834&bid=520482)
![GitHub](https://img.shields.io/github/license/bisand/net.biseth.myenergi?link=https://github.com/bisand/net.biseth.myenergi/blob/master/LICENSE)
![GitHub last commit](https://img.shields.io/github/last-commit/bisand/net.biseth.myenergi?link=https://github.com/bisand/net.biseth.myenergi/)
[![Node.js CI](https://github.com/bisand/net.biseth.myenergi/actions/workflows/node.js.yml/badge.svg)](https://github.com/bisand/net.biseth.myenergi/actions/workflows/node.js.yml)

![](https://raw.githubusercontent.com/bisand/net.biseth.myenergi/master/assets/images/small.png)

Adds support for myenergi products like Zappi, Eddi and Harvy. You will be able to monitor and control your devices using Homey. Start and stop charging of your EV or control your water heater based on energy prices from [Tibber](https://invite.tibber.com/3ea6e31f) or total power consumption in your home. 

This app talks to your myenergi devices through the myenergi cloud. Your devices must therefore be connected to the internet, either through a myenergi hub (older installations — the standalone hub is no longer sold) or through the built-in hub functionality of newer Zappi and Eddi devices connected via Wi-Fi/Ethernet.

## Installation
Install the [latest version](https://homey.app/no-no/app/net.biseth.myenergi/myenergi/) of myenergi app for Homey from the Homey App Store. (A [beta version](https://homey.app/no-no/app/net.biseth.myenergi/myenergi/test) is also available for those who like to live on the edge.)

## Usage
After installing the app on your Homey you will have to register your hub credentials before devices can be added. Open the app settings (More -> Apps -> myenergi -> Configure app) and enter:

- **Hub serial no**: the serial number of your myenergi **hub**. If your Zappi/Eddi connects to the internet without a separate hub (built-in hub), use the serial number of that device instead. You can find it under "Live products" on [myaccount.myenergi.com](https://myaccount.myenergi.com).
- **API key**: generate one on [myaccount.myenergi.com](https://myaccount.myenergi.com) under your device's **Advanced settings**. Note that your myenergi account password will **not** work.

The hub itself does not appear as a device in Homey — it is only the connection. Once the credentials are saved successfully, add your Zappi, Eddi or Harvi devices via *Devices -> + -> myenergi*.

## Support
Feel free to ask questions, suggest new features or bug reports in the [issues section](https://github.com/bisand/net.biseth.myenergi/issues) of this repository.

## Contribute
Contributers are welcome to submit pull requests for translations, bug fixes and new features. Before a pull request is accepted they will have to resolve an issue in the [Issue section](https://github.com/bisand/net.biseth.myenergi/issues) of this repository. If no issue is registered, please create one. 

Pull requests:
1. Fork this repository
2. Create a new branch in your own forked repository on Github
3. Translate all the files that need translations (I will try to list them below)
4. Commit and push your changes.
5. On your forked repository on github.com go to "Pull requests"
6. Press the button "New pull request" and follow the instructions.

Files that needs translation:

* README.txt -> README.nl.txt (New file)
* .homeycompose/app.json
* All JSON files under .homeycompose/capabilities/
* All JSON files under drivers/


## License
![GitHub](https://img.shields.io/github/license/bisand/net.biseth.myenergi?link=https://github.com/bisand/net.biseth.myenergi/blob/master/LICENSE)
