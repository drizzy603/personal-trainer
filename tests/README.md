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
`conflicts()`, `stagePutBack()` read and act as Settings › About › Storage will.

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
an OTA page). It reinstalls the app on that phone and leaves it with the
scenario seed.
