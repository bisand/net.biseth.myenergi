---
name: homey-app-dev
description: Homey (Athom) app development with SDK v3 — manifest/compose structure, drivers, capabilities, flow cards, Node.js runtime constraints, CLI commands, validation and publishing. Use when working on this Homey app (drivers, capabilities, flows, app.json, .homeycompose) or any Homey apps SDK question.
---

# Homey App Development (SDK v3)

## Authoritative documentation — fetch it, don't guess

Homey publishes the full Apps SDK documentation in machine-readable form:

- Index of every page: https://apps.developer.homey.app/llms.txt
- Any docs page is available as markdown by appending `.md` to its URL,
  e.g. https://apps.developer.homey.app/the-basics/devices/capabilities.md
- SDK API reference (Device, Driver, Homey, FlowCard classes): https://apps-sdk-v3.developer.homey.app

When unsure about a manifest field, capability, or SDK API, fetch the relevant page instead of relying on memory. Key pages: `the-basics/app/manifest.md`, `the-basics/devices/capabilities.md`, `the-basics/flow.md`, `the-basics/devices/energy.md`, `advanced/homey-compose.md`, `app-store/guidelines.md`.

## Runtime and compatibility model

- Apps declare `"sdk": 3` and a `"compatibility"` semver range of supported **Homey firmware** versions (not hardware models). Minimum allowed is `">=5.0.0"`.
- All Homey hardware still receiving firmware updates — including Homey Pro (Early 2016/2018/2019) — runs the latest firmware. Supporting older hardware means supporting the firmware range, and thereby its Node.js version:

| Platform | Firmware | Node.js |
|---|---|---|
| Homey Pro (2016–2019) | < 7.4.0 | 12 |
| Homey Pro (2016–2019) | 7.4.0 – 12.8.x | 16 |
| All platforms | >= 12.9.0 | 22 |

- Consequence: pick the TypeScript `target` and `@types/node` major to match the **lowest** Node version implied by the app's `compatibility`. This app declares `">=12.2.0"`, so the floor is Node 16 (older 2016–2019 hubs on firmware 12.2–12.8): keep `@types/node` at ^16 and the compile target at ES2021, even though tooling runs on newer Node.
- Apps are plain Node.js (CommonJS by default; ESM possible), entry point `app.js`/`app.ts`, running sandboxed on the hub itself.

## Project structure (Homey Compose)

`app.json` is **generated** — never edit it by hand. Sources live in:

- `.homeycompose/app.json` — id, version, compatibility, sdk, brandColor, category, name/description (i18n objects), permissions, author, contributors.
- `.homeycompose/capabilities/<name>.json` — custom (non-system) capabilities: `type` (boolean/number/string/enum), `title`, `getable`/`setable`, `uiComponent`, enum `values` with translated titles.
- `drivers/<driver>/driver.compose.json` — driver class, capabilities list, energy object, pair views, images.
- `drivers/<driver>/driver.flow.compose.json` — flow cards scoped to the driver: `triggers`, `conditions`, `actions`, each with translated `title`/`hint`, optional `args` and `tokens`.
- `drivers/<driver>/driver.settings.compose.json` — device settings shown in the mobile app.
- `.homeycompose/flow/` — app-level (non-device) flow cards, if any.
- `locales/<lang>.json` — app-wide translations referenced as `{ "en": ..., "no": ... }` objects.

Regenerate `app.json` with `npx homey app build` (or any run/validate command, which composes first). After changing any compose file, rebuild and commit the regenerated `app.json` alongside the sources.

Translations: this app maintains en, no, nl, sv, de. Every new user-visible string (capability titles, enum values, flow card titles/hints, tokens) needs all five.

## Devices, capabilities, flows — core patterns

- `Driver.onInit` registers flow cards: `this.homey.flow.getDeviceTriggerCard(id)`, `getConditionCard(id).registerRunListener(...)`, `getActionCard(id).registerRunListener(...)`. A trigger card declared in compose but never fetched+triggered from code silently does nothing.
- `Device.onInit` registers capability listeners (`registerCapabilityListener('onoff', ...)`) for setable capabilities and starts polling/subscriptions.
- Update state with `setCapabilityValue(cap, value)` (returns a promise — attach `.catch(this.error)`).
- Adding/removing capabilities on existing devices requires `addCapability`/`removeCapability` migration in `onInit` — capabilities in the manifest only apply to newly paired devices.
- Enum capability values are string IDs; adding new enum values to an existing capability is backward compatible, removing/renaming breaks users' flows.
- `energy` objects (per driver or device class `evcharger`, cumulative, etc.) power the Homey Energy tab — see `the-basics/devices/energy.md`.
- Device class changes (e.g. to `evcharger`) need a `setClass` migration in `onInit`.
- **Energy tab visuals are Homey's, not the app's (verified empirically July 2026):** apps only publish `evcharger_charging_state` (`plugged_out`/`plugged_in`/`plugged_in_charging`/`plugged_in_paused`); the garage/door/car scene does not react to it (door stays open with a car shown even while the charger reports `plugged_out`). Requests to animate it are Athom feature requests, not app issues.
- **Multiple picker capabilities (undocumented, verified empirically July 2026 on the iOS app):** the device view shows ONE picker widget with a dropdown menu to switch between picker capabilities. The menu lists them in capability order, but the DEFAULT selection is the LAST picker capability in the device's capability order — so put the picker you want as default last among the pickers. Not sticky: the app recomputes the default every time the device view opens. Order changes on existing devices require a capability rebuild (remove+re-add all in the new order) in `onInit`, since set-based change detection won't fire.

## CLI (npx homey ...)

- `homey app validate` — manifest validation; `--level=publish` for the App Store bar (this repo's target).
- `homey app build` — compose + TypeScript compile. The CLI requires `tsconfig.json` `outDir` to be `./.homeybuild`.
- `homey app run` — run on a hub in dev mode with live console; `homey app install` — install without console.
- `homey app publish` — push to the App Store (asks to bump version; pre-release versions not allowed).
- `homey app version patch|minor|major` — bump version in `.homeycompose/app.json` + `app.json`.
- `homey app driver create`, `homey app flow create`, `homey app driver flow create` — scaffolding.
- First use: `homey login`.

## Publishing checklist

1. `npm run build` (tsc) and `npm run lint` pass.
2. `npx homey app validate --level=publish` passes.
3. Version bumped (compose + app.json in sync; `package.json` version kept matching by convention).
4. Changelog: `.homeychangelog.json` if present; App Store “What’s new” text on publish.
5. Review App Store guidelines (`app-store/guidelines.md`) for naming, images, and description rules.

## This repository's specifics

- myenergi cloud API client lives in the `myenergi-api` npm package (same author); device data models (`Zappi`, `Eddi`, `Harvi`) come from there. Zappi status combines pilot state (`pst`) with device state (`sta`) — see `drivers/zappi/device.ts` `getChargerStatusText`.
- Data flows: `app.ts` polls the myenergi cloud per hub credential → drivers relay via registered callbacks → devices update capabilities in `dataUpdated`.
- Energy values from the myenergi API history endpoints are in joules (watt-seconds); instantaneous values are watts.
