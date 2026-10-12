# Supero regression tests

Playwright suites that boot `index.html` in headless Chromium against the demo
seed (`seed-dump.json`, generated from `screenshots/seed-demo.js`) and drive the
app through its JS globals. `lib/harness.js` serves the repo over local HTTP,
seeds localStorage before boot, and can mock the Capacitor bridge (`native:
true`) so watch/widget code paths run as they do inside the iOS shell. All
network traffic is blocked except the local server.

Run everything:

```sh
./tests/run.sh
```

Shell contracts (plan task C3): `boot({shell})` runs a boot under one contract an installable shell
speaks: `'none'` (no flag, every shell up to 59 and the PWA; the default), `'inert'` (build 60's
`window.__FP_SHELL` with no native screen) or `'coach'` (build 60: the native Coach chat), with a
mock TrovoShell that negotiates hello as FPCore does and records every call in `window.__fpShell`.
`FP_SHELL_INERT=1 ./tests/run.sh` runs every native boot as `'inert'`: per-spec results must equal
the classic run's. Spec 118 drives the bridge (`window.FPScreens.call`); `tests/golden/check.sh`
holds the chat's HTML, the page's coach models and FPCore's fixtures together.

First run installs Playwright into `tests/node_modules` (gitignored). Suites:

- `01-boot` — boot smoke, all four tabs render, no page errors, voice logging stays removed
- `02-runner` — engage a Push session, log a set, finish, entry lands in `kt_sessions`
- `03-watch-sync` — wrist sessions drain into the log; double-log guard in both directions
- `04-progress` — Progress tab charts, week dots, and history render
- `05-sheets` — all six overlay sheets mount on the shared R2 shell (surface, scrim, ✕, grabber)
- `06-today-slots` — Today slot system: one banner, chip promotion, dismissal drops chips
- `07-themes-visuals` — theme-room tokens, share-card draw path, editorial empty states

Run these before any commit that touches app logic in `index.html` (verify.sh
covers syntax; these cover behavior).

## The store matrix

```sh
STORE=shadow ./tests/run.sh
```

runs every spec as a build 60 shell runs the page: each document starts with the
flag `window.__ktStore`, `lib/ktstore-mock.js` (a JavaScript reference of FPStore's
native side, kept in sessionStorage so it survives a reload) answering the KT1
prompt channel, and the shipped facade
`ios/App/FPKit/Sources/FPStore/Resources/ktstore.js`, all before the seed and the
page. Every write goes to WebKit first and is mirrored to the mock store; each
`app.close()` checks that the store, WebKit and the page's reads hold the same
values (a difference fails the spec as `store drift`). Per-spec results must equal
the classic run's. CI runs both as separate jobs; `publish.sh` adds the shadow run
when the facade, the mock or the harness changed.

`boot({store: 'shadow'})` turns it on for one boot whatever STORE says
(`store: 'classic'` turns it off). Specs 119 and 120 drive the mock through
`window.__ktMock`: `device({shell:false})` is a store-less build from the next
document on, `device({seed:false})` stops the harness re-seeding WebKit at each
load (a real relaunch does not), `next({wipe | restore | plant | unreadable})`
changes WebKit behind the facade at the next document start, `fail({...})` makes
the store answer full, busy, err or nothing, and `status()`, `values()`,
`conflicts()`, `stagePutBack()` read and act as Settings › About › Storage will
(`status(true)` with the losses still open, as the shell's Storage reads it).
Spec 120 also runs the page's own Storage sheet over the mock (a TrovoStore
plugin in front of `__ktMock`): a finish WebKit lost goes back in one Put back.

Spec 121 covers the page's side of Storage with a mocked TrovoStore plugin: the
row only with the shell's flag (`window.__FP_SHELL`) and the plugin, the sheet's
counts and actions (Put back after a preview, one Put back for everything a start
lost, Remove for a value kept as none, the Native copy switch, Export a copy, the
TestFlight-only test quit), `bootDone` and the OTA confirm at the end of boot
(also when the first render is the coach route), and the tools'
`dev.nav`/`dev.theme` in the flag.

## The native store on a simulator

```sh
./tests/native-store.sh               # build as build 60, every scenario on iOS 26.x and 27.0
./tests/native-store.sh --downgrade   # also build 59 at its own commit: the 59 <-> 60 drill
```

runs the same facade in the real app: StoreAttach (FPHost) in the real Capacitor
shell, the real page and FPStore, on the iPhone of each runtime's first paired
iPhone + Watch. The app's Debug build takes each scenario's steps from launch
arguments (`-fpProbe`), so nothing writes WebKit's file behind the facade, and
`tools/native-store.py` reads WebKit's `localstorage.sqlite3` and the store's
`store.sqlite` itself to decide (migration, writes while hidden and in the
background, a WebContent kill, the SIGKILL sweep, WebKit unreadable or wiped and
Put back, the policy file, the store breaker, a crash marker, a scene reconnect,
an OTA page, Settings › About › Storage through the real TrovoStore plugin). It
reinstalls the app on that phone and leaves it with the scenario seed.

`../test-native.sh` (the "test it" flow) drives its routes with launch arguments
too (`-devNav <route>`, `-devTheme <room>`), builds as build 60 so the native copy
stays attached, runs every route once per room on one app container, and checks
the native copy against WebKit's file before the watch step.
