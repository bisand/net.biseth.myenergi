# myenergi app for Homey

[![DeepScan grade](https://deepscan.io/api/teams/16513/projects/19834/branches/520482/badge/grade.svg)](https://deepscan.io/dashboard#view=project&tid=16513&pid=19834&bid=520482)
![GitHub](https://img.shields.io/github/license/bisand/net.biseth.myenergi?link=https://github.com/bisand/net.biseth.myenergi/blob/master/LICENSE)
![GitHub last commit](https://img.shields.io/github/last-commit/bisand/net.biseth.myenergi?link=https://github.com/bisand/net.biseth.myenergi/)
[![Node.js CI](https://github.com/bisand/net.biseth.myenergi/actions/workflows/node.js.yml/badge.svg)](https://github.com/bisand/net.biseth.myenergi/actions/workflows/node.js.yml)

![](https://raw.githubusercontent.com/bisand/net.biseth.myenergi/master/assets/images/small.png)

Adds support for myenergi products like Zappi, Eddi, Harvi and Libbi. You will be able to monitor and control your devices using Homey. Start and stop charging of your EV, control your water heater, or let your home battery charge from the grid, based on energy prices from [Tibber](https://invite.tibber.com/3ea6e31f) or total power consumption in your home.

This app talks to your myenergi devices through the myenergi cloud. Your devices must therefore be connected to the internet, either through a myenergi hub (older installations — the standalone hub is no longer sold) or through the built-in hub functionality of newer Zappi and Eddi devices connected via Wi-Fi/Ethernet.

## Supported devices

| Device | What you can do in Homey |
|---|---|
| **Zappi** EV charger | Follow charging power, energy and status. Start and stop charging, change charge mode, boost, set the minimum green level and phase setting, see whether it is locked and unlock it, and set a single charge. |
| **Eddi** power diverter | Follow diverted power and energy, heater status and temperature probes. Turn it on and off and boost. |
| **Harvi** energy sensor | Follow power and energy per CT clamp, with imported and exported energy shown separately. |
| **Libbi** home battery | Follow state of charge, battery power and solar generation in Homey Energy. Change mode, turn charge from grid on and off, and set the charge target. |

## Installation
Install the [latest version](https://homey.app/no-no/app/net.biseth.myenergi/myenergi/) of myenergi app for Homey from the Homey App Store. (A [beta version](https://homey.app/no-no/app/net.biseth.myenergi/myenergi/test) is also available for those who like to live on the edge.)

## Usage
After installing the app on your Homey you have to connect your hub before devices can be added. Open the app settings (More -> Apps -> myenergi -> Configure app).

### The easy way: sign in with your myenergi account
1. Enter the email and password you use on [myaccount.myenergi.com](https://myaccount.myenergi.com) and press **Find my hubs**. Your hubs are filled in with their serial number and API key.
2. Check the result and press **Save changes**.

You stay signed in until you press **Sign out**. Your sign-in is stored on your Homey and only sent to myenergi. It is also what the [Libbi charge from grid](#libbi-charge-from-grid) and [Zappi single charge](#zappi-single-charge) features use.

### By hand
Press **Add a hub by hand** and enter:

- **Hub name**: a name of your own choice. Devices you add are tied to this name and the serial number, so do not change it afterwards.
- **Hub serial number**: the serial number of your myenergi **hub**. If your Zappi/Eddi connects to the internet without a separate hub (built-in hub), use the serial number of that device instead. You can find it under "Live products" on [myaccount.myenergi.com](https://myaccount.myenergi.com).
- **API key**: generate one on [myaccount.myenergi.com](https://myaccount.myenergi.com) under your device's **Advanced settings**. Note that your myenergi account password will **not** work here.

The hub itself does not appear as a device in Homey — it is only the connection. Once the hub is saved successfully, add your Zappi, Eddi, Harvi or Libbi devices via *Devices -> + -> myenergi*.

## Features that need the myenergi account sign-in
These use a different part of the myenergi service than the rest of the app, which the API key does not give access to. Sign in under the app settings to use them.

### Libbi charge from grid
The Libbi gets a **Charge from grid** switch and a **Charge target** reading, and these flow cards:

- *Turn charge from grid on or off*
- *Set charge target to ... kWh*
- *Charge from grid is / isn't turned on* (condition)

Good to know: the Libbi only charges from the grid up to its charge target, and only during the cheap periods of the tariff set in the myenergi app. The switch allows grid charging; it is not a "charge now" command. If you want to decide the timing from Homey, for example from your own electricity prices, set a flat cheap tariff in the myenergi app and control the switch from a flow.

### Zappi single charge
A single charge is a one-off charge where myenergi picks the cheapest times in a window, from the tariff set on your myenergi account. Flow cards:

- *Set a single charge of ... kWh for [vehicle] today/tomorrow, between ... and ...*
- *Remove the single charge set by Homey*

The vehicle is one of the vehicle profiles on your myenergi account. Setting a single charge replaces the one Homey set earlier; single charges you made in the myenergi app are kept.

This needs a Zappi that supports schedules in the myenergi app. On other models the cards answer "This Zappi does not support single charges."

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
