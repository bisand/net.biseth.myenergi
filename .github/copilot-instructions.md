# Copilot Instructions for MyEnergi Homey App

## Project Overview
This is a Homey app for myenergi devices (Zappi EV chargers, Eddi water heaters, Harvi power monitors). Built with TypeScript using Homey SDK v3, it connects to myenergi cloud API to control and monitor energy devices.

## Architecture
- **App entry**: `app.ts` - Main application class managing multiple client connections
- **Device drivers**: `drivers/{zappi,eddi,harvi}/` - Device-specific implementations following Homey's driver pattern
- **Data models**: `models/` - TypeScript interfaces for device data and settings
- **Services**: `services/` - Background services like SchedulerService for periodic updates
- **API integration**: Uses `myenergi-api` npm package for cloud communication

## Key Development Patterns

### Homey Build System
- **Source**: Edit files in `.homeycompose/` directory, NOT `app.json`
- **Generated files**: `app.json` is auto-generated from `.homeycompose/app.json`
- **Build command**: `npm run build` compiles TypeScript to `build/` directory
- **Task available**: Use `CopyBuild` task to copy `.homeybuild` to `build/`

### Device Architecture
Each device type follows this pattern:
```
drivers/{device}/
├── device.ts     # Device implementation extending Homey.Device
├── driver.ts     # Driver managing device discovery/pairing
├── {Device}Data.ts # Data structure definitions
└── assets/       # Device icons and images
```

### Client Management Pattern
- Multiple myenergi hubs supported via `clients` object in `app.ts`
- Each client keyed by `${hubname}_${username}`
- Debug mode uses `MyEnergiFake` service with fake data from `tools.ts`
- Polling interval configurable per hub (default 60s)

### Capability System
Devices expose capabilities through ordered arrays:
- Control capabilities (buttons, selectors) have lower order numbers
- Sensor capabilities (measurements) have higher order numbers
- Example: `new Capability('onoff', CapabilityType.Control, 1)`

### Energy Calculations
Use `calculateEnergy()` from `tools.ts` for accumulated kWh:
```typescript
// Trapezoidal rule integration over time
const energy = calculateEnergy(lastTime, lastPower, currentPower, lastEnergy);
```

## Development Workflow

### Build & Run
```bash
npm run build      # Compile TypeScript
npm run lint       # ESLint with TypeScript rules
npm test          # Currently not implemented
```

### Debug Mode
Set `process.env.DEBUG = '1'` to enable:
- Fake device data via `MyEnergiFake` service
- Fake client ID stored in Homey settings
- Mock API responses for testing

### Device Testing
Use `getFake{Zappi,Eddi,Harvi}Data()` functions from `tools.ts` for consistent test data.

## API Integration
- **Base URL**: `https://s18.myenergi.net`
- **Authentication**: Username/password per hub
- **Rate limiting**: Respect polling intervals to avoid API throttling
- **Error handling**: Check `status` field in API responses

## Localization
Multi-language support in:
- `locales/en.json` - Main translations
- `.homeycompose/app.json` - App metadata translations
- `README.{lang}.txt` - Documentation translations

## Flow Cards & Triggers
Drivers implement flow card triggers for device state changes:
- Charging started/stopped
- Mode changes (charge mode, boost mode)
- Connection status (EV connected/disconnected)

## Code Style
- ESLint configuration in `.eslintrc.json`
- TypeScript strict mode enabled
- Homey SDK types from `@types/homey`
- Use explicit types, avoid `any` except in fake services