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
- **Scene lifecycle (required).** `AppDelegate.swift` also holds `SceneDelegate` and `Info.plist` carries `UIApplicationSceneManifest` (storyboard `Main`, delegate `$(PRODUCT_MODULE_NAME).SceneDelegate`). Apps linked against the iOS 27 SDK (Xcode 27+) abort at launch on iOS 27 without it — builds 44/45 (2026-09-15) crashed on the phone while the iOS 26.5 simulator ran fine. URL opens / user activities reach Capacitor's `ApplicationDelegateProxy` and the `trovo://` deep link through the scene delegate. Never remove the manifest; test launch on an iOS 27 simulator runtime after touching it.
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
- Runner: START opens a pre-session overview sheet (with the one-time REST ALERTS ask on iOS), then the deck runner (`openDeckRunner`); finishing opens the COMPLETE sheet (`openCompleteSheet`, with the one-time reminders offer). Runner state lives in `runner*` globals and a debounced `kt_runner_draft`. Every logged set and every Log-all has a 6 s Undo (`runnerUndoSet`, `runnerUndoLogAll`); a finished exercise offers `+1 set` (`runnerExtraSet`); RPE chips on the engaged card write per-set effort; a ledger edit survives the rest clock (`_stashRunnerEdit`); skipping the last card confirms first.
- User name is dynamic (`getUserFirstName()`: `kt_user_name` from the starter reveal's optional field or Settings, else the routine) — no hardcoded names anywhere. The coach prompt greets by that name.
- **Coach units:** prompts render every number through `fmtW/fmtD/fmtPaceStr` and open with `_coachUnitsNote()`; tool schemas carry `{W}`/`{D}` placeholders filled per request by `_unitizeSchema`; every weight-writing tool converts through `_coachLoadIn`/`wStore`, run goals through `paceStore`; `log_run` takes `distance` (user unit) or `distance_km`/`distance_mi`, programme runs accept `{mi}`.
- **Keyless proactive coach:** `_progressionDue/_plateauFixDue/_weekReviewDue` are not key-gated. Without a key, `applyProgressionLocal` / `applyPlateauFixLocal` (10% deload) write the change on-device with a 6 s Undo, `openLocalWeekReview` is a sheet, and the COMPLETE insight doubles as the Today debrief card. With a key the same taps go through the Coach.
- **One streak:** `calcStreakDays()` (scheduled training days; calendar days with no plan) drives the Today chip (`… · TRAIN TODAY TO KEEP IT` when at risk), the streak milestone and the Progress hero; the widget summary carries `streakDays`.
- **Deep link:** `trovo://start` (widget `.widgetURL`) → AppDelegate parks it in UserDefaults `pendingDeepLink` and posts `.trovoDeepLink`; `SuperoViewController` evals `window._trovoOpen(url)` when the page is up; the page consumes the parked URL at boot through `TrovoWidget.consumeDeepLink` and `_handleDeepLink` opens today's session.
- Apple Watch: the phone pushes today's plan (`hasPlan:false` when there is no programme → the watch shows NoPlanView instead of "Syncing…"; Health authorization is requested at the first logged set, not at launch) (WCSession applicationContext + instant message), the wrist runner mirrors live sets to the phone, finished wrist sessions drain into `kt_sessions`. The wrist runner persists across watchOS termination and shows "Synced" only once WatchConnectivity reports delivery.

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
- `kt_ota_staged` — build stamp handed to `TrovoOta.stage` (Settings › About calls it "latest content", never "update")
- `kt_profile` — athlete profile (goals, experience, equipment, injuries, likes, dislikes, sports, notes); written by the coach's `save_profile` tool or Settings › AI Coach › Athlete profile; injected into every coach prompt via `_profilePrompt()`
- `kt_coach_usage` — token ledger from `response.usage` (turns, input, output, cacheRead, cacheWrite); Settings shows it next to the key. Chat turns send `output_config.effort: 'medium'` on models that accept it (`_coachOutputConfig`); intake keeps the default
- `kt_notif_asked` / `kt_notif_offered` / `kt_notif_hour` — the pre-session sheet asks for notifications once; the COMPLETE sheet offers training-day reminders once; reminders cover `REMINDER_DAYS` (28) at `_reminderHour()` (user hour or median session start − 1 h, default 9)
- `kt_skips` — `{date,type}` skips; `_missedThisWeek()` drives the rest-day make-up CTA and `skipMissed()` records one
- `kt_dev_nav` — read once at boot, dispatches navigation, deletes itself. Used by `screenshots/shoot.py` and `test-native.sh` to drive the simulator through every screen. Routes: `log/workout` · `log/run` · `log/body` · `log/sport` · `progress` · `coach` · `coach/chat` · `settings` · `modal/programme` · `overlay/how` · `overlay/privacy`. No-op when absent. To inject without going through the in-app file picker, write the value as raw UTF-16LE into the WKWebView's `localstorage.sqlite3` (path resolves via `xcrun simctl get_app_container <phone UDID> app.kt.trainer data` → `Library/WebKit/.../LocalStorage/`; use the phone UDID — `booted` is ambiguous when the paired watch is up).

## Debugging on device
- **iOS keyboard scroll-offset guard** (boot section of index.html): after the on-screen keyboard closes, WKWebView can leave the document scrolled, shifting the paint up relative to touch targets (every tap lands below the finger). The guard snaps document scroll back to 0 on focusout/viewport-resize/scroll whenever no editable element is focused. Confirmed fixing the bug on device (2026-07-09) — do not remove; html/body are overflow:hidden so document-level scroll is always illegitimate.
- Settings → About → Error log shows `kt_err_log` and the watch-bridge breadcrumbs (`kt_wch_log`); native logs use subsystem `app.kt.trainer` (`log stream --level info`).
- A disposable diagnostics overlay for the keyboard bug existed briefly (commit `a2d1647`, removed at user request) — resurrect from git history if on-device state ever needs eyeballing again.
