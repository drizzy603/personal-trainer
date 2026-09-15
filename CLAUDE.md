# Supero App

A single-file web training app with an AI coach, wrapped in a Capacitor 8 iOS shell (phone app + Apple Watch app + widgets) for native distribution.

## Files
- `index.html` — the entire web app (HTML + CSS + JS in one file, including the inlined "How It Works" overlay and the inlined privacy section opened from Settings). ~15k lines, ES5-style inline JS; `render()` rebuilds `#screen`, `paintRunner()` the runner overlay.
- `build.txt` — the current `<meta build>` stamp on its own line. The native shell polls this 12-byte file to learn whether a newer page exists before downloading the whole page. `verify.sh` keeps it in sync with `index.html`; stage it with every `index.html` commit.
- `assets/fonts/` — bundled web fonts (Inter, JetBrains Mono, Anton, Archivo; latin + latin-ext woff2). `build:web` copies the folder into `www/`; every `@font-face` also carries a network fallback src so an OTA'd page on an old bundle still gets the real face.
- `sw.js` — service worker for offline/PWA support (precaches the fonts; bump `CACHE` when the list changes)
- `manifest.json` — PWA manifest (paper colours to match the default look)
- `privacy.html` — standalone privacy policy (linked from App Store; also rendered inline in Settings)
- `ios/` — Capacitor iOS shell. Custom Swift plugins live in `ios/App/CapApp-SPM/Sources/CapApp-SPM/` (auto-included by SPM; no registration beyond `SuperoViewController.capacitorDidLoad` in `ios/App/App/AppDelegate.swift`):
  - `TrovoHealthPlugin.swift` + `HealthKitReader.swift` — Apple Health: run/ride/sport import, readiness (sleep/HRV/RHR), background delivery, **and writing finished lifts as workouts when the user turns "Save lifts to Health" on**. `getState` reports the native truth for the Settings sheet.
  - `TrovoWatchPlugin.swift` — WCSession bridge to the watch app (`ios/App/SuperoWatch/SuperoWatchApp.swift`): plan push, live wrist mirror, finished-session drain.
  - `TrovoWidgetPlugin.swift` — App Group summary for the Home Screen widget (`ios/App/TrovoTimerWidget/`) and the watch complication (`ios/App/SuperoWatchWidget/`).
  - `TrovoTimerPlugin.swift` — rest-timer Live Activity.
  - `TrovoSharePlugin.swift` + `ios/App/TrovoShareExtension/` — share-sheet image intake and iCloud backup writes.
  - `TrovoOtaPlugin.swift` — live-page staging (see Deployment).
  HealthKit entitlement is in `ios/App/App/App.entitlements`.
- `release-ios.sh` — pre-archive script. Bumps the web `<meta build>` (+ `build.txt`), bumps `CURRENT_PROJECT_VERSION`, refreshes `www/`, runs `cap copy ios`. Run this before every archive.
- `verify.sh` — static safety check. Extracts every `<script>` block and syntax-checks the combined JS, bans curly quotes in code, cross-checks inline event handlers against defined functions, fails if `index.html` changed without a `<meta build>` bump, and syncs `build.txt`. **Run before every commit that touches `index.html`** — one syntax error blanks the entire app.
- `test-native.sh` — native smoke test. Refreshes `www/`, builds the App scheme (phone + watch) for simulators, boots the paired iPhone+Watch duo, drives the main screens via `kt_dev_nav` injection, waits for the watch to pull the plan, and screenshots everything into `screenshots/out/native/`. **This is the standard flow when the user asks to "test" a change** — run it, then actually look at every screenshot. Gotchas baked in: `cap copy` alone ships a stale `www/`; forcing `-sdk iphonesimulator` breaks the embedded watch target (use `-destination`). Taps (runner sets, wrist logging) can't be driven — those behaviours live in `tests/specs/`.
- `app-store-metadata.md` — single source of truth for App Store description, App Privacy answers, and the Submission Day playbook.
- `screenshots/` — App Store screenshot pipeline. `make-seed.js` (demo data + store fixups → `out/store-seed.json`) then `shoot.py` (fresh sim container, sqlite seed injection, kt_dev_nav-driven capture of all ten 1320×2868 PNGs into `screenshots/out/`). `shoot.py` expects the sim build at `/tmp/supero-dd` (symlink your derived-data dir there). README has the full flow.
- `tests/` — Playwright regression suites (`./tests/run.sh`, ~96 specs). Headless Chromium boots index.html on the demo seed, with an optional mocked Capacitor bridge for native code paths (watch sync, widgets, OTA staging). **Run alongside verify.sh for any commit that changes app logic in `index.html`** — verify.sh catches syntax, these catch behaviour. Add a spec for every behaviour you change.

## Deployment
- GitHub repo: `drizzy603/personal-trainer`
- Live PWA at: `https://drizzy603.github.io/personal-trainer/`
- GitHub Pages serves directly from `main`, root folder — pushing deploys the web app automatically.
- Native distribution is via TestFlight/App Store; the iOS shell wraps the same web sources after `npx cap copy ios`. Archive with `-project App.xcodeproj` (there is no workspace); export with `/tmp/supero-export.plist` (`app-store-connect`, `upload`, team `7D243X2KD4`, `manageAppVersionAndBuildNumber:false`) — `/tmp` gets purged, so recreate the plist BEFORE archiving.
- **Live updates (OTA) in the native shell.** At launch the page fetches `build.txt`; only a newer stamp downloads `index.html`. On shells with `TrovoOtaPlugin` (build 41+) the page is handed to `TrovoOta.stage`, which clones the bundled web folder into `Application Support/supero-live` and writes the new `index.html` + `build.txt` there; `SuperoViewController.instanceDescriptor()` serves that folder on the next launch whenever its build beats the bundle's, wipes it once a newer binary ships, and trips a one-strike breaker (`otaAttempt`) if a served page never calls `TrovoOta.confirm()` on first render. Older shells keep the localStorage `kt_cached_html` swap (head bootstrap + `<plaintext>` hide + deferred `document.write`). Either way a change only reaches phones if `<meta build>` is strictly newer.

## Rules
- **Always commit and push after every change.** Do not wait to be asked.
- **Run `./verify.sh` before committing changes to `index.html` or `sw.js`.**
- **Bump `<meta build>` (YYYYMMDD-N, today's date) in every commit that changes `index.html`, and stage `build.txt` with it.** verify.sh enforces both.
- Curly quotes are banned inside JS — use `’` etc.
- Never commit `.DS_Store` or other system files (already in `.gitignore`).
- Keep `.gitignore` minimal. Current entries cover `.vercel`, `.DS_Store`, generated artifacts (`www/`, `node_modules/`), user-data exports (`*-backup-*.json`), and large captures (`screenshots/out/`). Don't add more without reason.

## App overview
- Four tabs: Log, Progress, Coach, Settings. Log has sub-tabs (Workout · Run · Body · + sports, user-pinnable).
- All data stored in browser/WKWebView `localStorage` — no server, no accounts. Everything is **stored in lb and km**; Settings → Workout → Units switches what is shown and typed (kg / mi) through `wDisp/wStore/fmtW`, `dDisp/dStore/fmtD`, `fmtPace/paceStore`. New code must go through those helpers or it will misrender for kg/mi users.
- **Look:** two theme rooms in `THEMES` — `heavyweight` (default: paper `#f7f5ef`, blue `#0a43f5` = the action, lime `#b7f000` / ink `#4f7000` = the earned state, Anton display + Archivo body, flat white cards, fixed tab bar) and `dark` ("Lime", the original green-and-black Studio). `_paintTheme` paints tokens on `<html>` and sets `data-room`; Heavyweight's CSS is the block titled "HEAVYWEIGHT ROOM", scoped to `html[data-room="heavyweight"]`. Use tokens (`--accent` for actions, `--earned`/`--earned-ink` for earned states, `--on-accent` for text on accent, `--border`, `--card`, `--card2`); never hardcode `#000`/white-alpha colours. Satellites (widgets, Live Activity, share posters) draw on a dark base and take the Studio lime via `_posterAccent()`.
- Dynamic Type: `applyDynamicType()` scales the page with a root zoom (≤125%) from an `-apple-system-body` probe; Settings toggle `kt_dyn_type`.
- AI Coach uses the Anthropic API (user supplies their own key in Settings). Responses are **non-streaming** — WKWebView SSE was unreliable in the iOS PWA shell (see commit `8eea4c5`).
- Coach supports: persistent chat history, intake flow to build a custom programme, native tool calls for routine edits (applied immediately; the newest tool message shows a PLAN CHANGES ledger with Keep / Undo = Restore Previous), image input. Programmes come from two paths: a built-in 5-tap starter intake (openStarterIntake / buildStarterRoutine — deterministic, on-device, no API key) and the Coach's AI intake for custom plans. Until one exists, the Log tab shows an empty-state CTA offering both.
- Log tab reads exercises from `kt_routine` via `getSessionExercises()` / `getWkData()`. There is no silent fallback programme — but the keyless starter intake can create `kt_routine` without the AI.
- Runner: START opens a pre-session overview sheet, then the deck runner (`openDeckRunner`); finishing opens the COMPLETE sheet (`openCompleteSheet`). Runner state lives in `runner*` globals and a debounced `kt_runner_draft`.
- User name is dynamic (pulled from their AI-generated routine) — no hardcoded names anywhere.
- Apple Watch: the phone pushes today's plan (WCSession applicationContext + instant message), the wrist runner mirrors live sets to the phone, finished wrist sessions drain into `kt_sessions`. The wrist runner persists across watchOS termination and shows "Synced" only once WatchConnectivity reports delivery.

## Key localStorage keys
- `kt_sessions` — logged gym sessions
- `kt_runs` — run logs (manual + Apple Health imports; `feel` 1–5 optional)
- `kt_sports` — non-running sport activity logs
- `kt_weights` — working weight per exercise (lb)
- `kt_bw` — body weight history (lb)
- `kt_prs` — personal records (`{name: lb}`; reps/date derived by `_prMeta`)
- `kt_week` — current week number
- `kt_routine` — AI-generated programme (includes user name; `weeks[i].weekPlan` = per-week cadence override)
- `kt_routine_backup` — pre-edit snapshot of the routine; powers Restore Previous in Settings and the coach ledger's Undo
- `kt_pre_restore` — snapshot taken before a backup restore (Undo last restore, 7 days)
- `kt_coach_msgs` — chat history
- `kt_apikey` — Anthropic API key
- `kt_theme` — `heavyweight` (default) or `dark`
- `kt_unit_w` / `kt_unit_d` — display units (`lb`|`kg`, `km`|`mi`)
- `kt_hk_imported` — set of HealthKit workout UUIDs already imported (dedup)
- `kt_hk_last_sync` — cursor for incremental Apple Health imports (overlapped by 72h)
- `kt_ota_staged` — build stamp handed to `TrovoOta.stage` (Settings shows "Update ready")
- `kt_dev_nav` — read once at boot, dispatches navigation, deletes itself. Used by `screenshots/shoot.py` and `test-native.sh` to drive the simulator through every screen. Routes: `log/workout` · `log/run` · `log/body` · `log/sport` · `progress` · `coach` · `coach/chat` · `settings` · `modal/programme` · `overlay/how` · `overlay/privacy`. No-op when absent. To inject without going through the in-app file picker, write the value as raw UTF-16LE into the WKWebView's `localstorage.sqlite3` (path resolves via `xcrun simctl get_app_container <phone UDID> app.kt.trainer data` → `Library/WebKit/.../LocalStorage/`; use the phone UDID — `booted` is ambiguous when the paired watch is up).

## Debugging on device
- **iOS keyboard scroll-offset guard** (boot section of index.html): after the on-screen keyboard closes, WKWebView can leave the document scrolled, shifting the paint up relative to touch targets (every tap lands below the finger). The guard snaps document scroll back to 0 on focusout/viewport-resize/scroll whenever no editable element is focused. Confirmed fixing the bug on device (2026-07-09) — do not remove; html/body are overflow:hidden so document-level scroll is always illegitimate.
- Settings → About → Error log shows `kt_err_log` and the watch-bridge breadcrumbs (`kt_wch_log`); native logs use subsystem `app.kt.trainer` (`log stream --level info`).
- A disposable diagnostics overlay for the keyboard bug existed briefly (commit `a2d1647`, removed at user request) — resurrect from git history if on-device state ever needs eyeballing again.
