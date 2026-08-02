# Supero App

A single-file web training app with an AI coach, wrapped in a Capacitor 8 iOS shell for native distribution.

## Files
- `index.html` — the entire web app (HTML + CSS + JS in one file, including the inlined "How It Works" overlay and the inlined privacy section opened from Settings)
- `sw.js` — service worker for offline/PWA support
- `manifest.json` — PWA manifest
- `privacy.html` — standalone privacy policy (linked from App Store; also rendered inline in Settings)
- `ios/` — Capacitor iOS shell. Custom Swift plugins live in `ios/App/CapApp-SPM/Sources/CapApp-SPM/` (currently `TrovoHealthPlugin.swift` + `HealthKitReader.swift` for Apple Health run import). HealthKit entitlement is in `ios/App/App/App.entitlements`.
- `release-ios.sh` — pre-archive script. Bumps the web `<meta build>`, bumps `CURRENT_PROJECT_VERSION`, refreshes `www/`, runs `cap copy ios`. Run this before every Xcode archive.
- `verify.sh` — static safety check. Extracts every `<script>` block and syntax-checks the combined JS, bans curly quotes in code, cross-checks inline event handlers against defined functions, and fails if `index.html` changed without a `<meta build>` bump. **Run before every commit that touches `index.html`** — one syntax error blanks the entire app.
- `test-native.sh` — native smoke test. Refreshes `www/`, builds the App scheme (phone + watch) for simulators, boots the paired iPhone+Watch duo, drives the main screens via `kt_dev_nav` injection, and screenshots everything into `screenshots/out/native/` (the watch shot proves the WCSession bridge). **This is the standard flow when the user asks to "test" a change** — run it, then actually look at every screenshot. Gotchas baked in: `cap copy` alone ships a stale `www/`; forcing `-sdk iphonesimulator` breaks the embedded watch target (use `-destination`). Taps (runner sets, wrist logging) can't be driven — those behaviors live in `tests/specs/`.
- `app-store-metadata.md` — single source of truth for App Store description, App Privacy answers, and the Submission Day playbook.
- `screenshots/` — sim launcher, demo seed script, and screenshot helper.
- `tests/` — Playwright regression suites (`./tests/run.sh`). Headless Chromium boots index.html on the demo seed, with an optional mocked Capacitor bridge for native code paths (watch sync, widgets). **Run alongside verify.sh for any commit that changes app logic in `index.html`** — verify.sh catches syntax, these catch behavior.

## Deployment
- GitHub repo: `drizzy603/personal-trainer`
- Live PWA at: `https://drizzy603.github.io/personal-trainer/`
- GitHub Pages serves directly from `main`, root folder — pushing deploys the web app automatically.
- Native distribution is via TestFlight/App Store; the iOS shell wraps the same web sources after `npx cap copy ios`.

## Rules
- **Always commit and push after every change.** Do not wait to be asked.
- **Run `./verify.sh` before committing changes to `index.html` or `sw.js`.**
- **Bump `<meta build>` (YYYYMMDD-N) in every commit that changes `index.html`** — the native shell's OTA loader only applies the live page when its stamp is strictly newer than the bundled one. verify.sh enforces this.
- Never commit `.DS_Store` or other system files (already in `.gitignore`).
- Keep `.gitignore` minimal. Current entries cover `.vercel`, `.DS_Store`, generated artifacts (`www/`, `node_modules/`), user-data exports (`*-backup-*.json`), and large captures (`screenshots/out/`). Don't add more without reason.

## App overview
- Four tabs: Log, Progress, Coach, Settings.
- All data stored in browser/WKWebView `localStorage` — no server, no accounts.
- AI Coach uses the Anthropic API (user supplies their own key in Settings). Responses are **non-streaming** — WKWebView SSE was unreliable in the iOS PWA shell (see commit `8eea4c5`).
- Coach supports: persistent chat history, intake flow to build a custom programme, native tool calls for routine edits, image input. Programmes come from two paths: a built-in 5-tap starter intake (openStarterIntake / buildStarterRoutine — deterministic, on-device, no API key) and the Coach's AI intake for custom plans. Until one exists, the Log tab shows an empty-state CTA offering both.
- Log tab reads exercises from `kt_routine` via `getSessionExercises()` / `getWkData()`. There is no silent fallback programme — but the keyless starter intake can create `kt_routine` without the AI.
- User name is dynamic (pulled from their AI-generated routine) — no hardcoded names anywhere.
- **iOS native shell only:** Settings → Data → Import from Apple Health pulls running workouts from HealthKit into `kt_runs`, with dedup against `kt_hk_imported`. Read-only — Supero never writes to HealthKit.

## Key localStorage keys
- `kt_sessions` — logged gym sessions
- `kt_runs` — run logs (manual + Apple Health imports)
- `kt_sports` — non-running sport activity logs
- `kt_weights` — bodyweight per exercise (working weight cache)
- `kt_bw` — body weight history
- `kt_prs` — personal records
- `kt_week` — current week number
- `kt_routine` — AI-generated programme (includes user name)
- `kt_routine_backup` — pre-edit snapshot of the routine; powers Restore Previous in Settings
- `kt_coach_msgs` — chat history
- `kt_apikey` — Anthropic API key
- `kt_theme` — selected theme
- `kt_hk_imported` — set of HealthKit workout UUIDs already imported (dedup)
- `kt_hk_last_sync` — cursor for incremental Apple Health imports
- `kt_dev_nav` — read once at boot, dispatches navigation, deletes itself. Used by `/tmp/shoot.py`-style scripts to drive the simulator through every screen for App Store screenshot regeneration. Routes: `log/workout` · `log/run` · `log/body` · `log/sport` · `progress` · `coach` · `coach/chat` · `settings` · `modal/programme` · `overlay/how` · `overlay/privacy`. No-op when absent. To inject without going through the in-app file picker, write the value as raw UTF-16LE into the WKWebView's `localstorage.sqlite3` (path resolves via `xcrun simctl get_app_container booted app.kt.trainer data` → `Library/WebKit/.../LocalStorage/`).

## Debugging on device
- **iOS keyboard scroll-offset guard** (boot section of index.html): after the on-screen keyboard closes, WKWebView can leave the document scrolled, shifting the paint up relative to touch targets (every tap lands below the finger). The guard snaps document scroll back to 0 on focusout/viewport-resize/scroll whenever no editable element is focused. Confirmed fixing the bug on device (2026-07-09) — do not remove; html/body are overflow:hidden so document-level scroll is always illegitimate.
- A disposable diagnostics overlay for this bug existed briefly (commit `a2d1647`, removed at user request) — resurrect from git history if on-device state ever needs eyeballing again.
