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
