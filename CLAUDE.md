# Trovo App

A single-file web training app with an AI coach, wrapped in a Capacitor 8 iOS shell for native distribution.

## Files
- `index.html` — the entire web app (HTML + CSS + JS in one file, including the inlined "How It Works" overlay and the inlined privacy section opened from Settings)
- `sw.js` — service worker for offline/PWA support
- `manifest.json` — PWA manifest
- `privacy.html` — standalone privacy policy (linked from App Store; also rendered inline in Settings)
- `ios/` — Capacitor iOS shell. Custom Swift plugins live in `ios/App/CapApp-SPM/Sources/CapApp-SPM/` (currently `TrovoHealthPlugin.swift` + `HealthKitReader.swift` for Apple Health run import). HealthKit entitlement is in `ios/App/App/App.entitlements`.
- `release-ios.sh` — pre-archive script. Bumps the web `<meta build>`, bumps `CURRENT_PROJECT_VERSION`, refreshes `www/`, runs `cap copy ios`. Run this before every Xcode archive.
- `app-store-metadata.md` — single source of truth for App Store description, App Privacy answers, and the Submission Day playbook.
- `screenshots/` — sim launcher, demo seed script, and screenshot helper.

## Deployment
- GitHub repo: `drizzy603/personal-trainer`
- Live PWA at: `https://drizzy603.github.io/personal-trainer/`
- GitHub Pages serves directly from `main`, root folder — pushing deploys the web app automatically.
- Native distribution is via TestFlight/App Store; the iOS shell wraps the same web sources after `npx cap copy ios`.

## Rules
- **Always commit and push after every change.** Do not wait to be asked.
- Never commit `.DS_Store` or other system files (already in `.gitignore`).
- Keep `.gitignore` minimal. Current entries cover `.vercel`, `.DS_Store`, generated artifacts (`www/`, `node_modules/`), user-data exports (`*-backup-*.json`), and large captures (`screenshots/out/`). Don't add more without reason.

## App overview
- Four tabs: Log, Progress, Coach, Settings.
- All data stored in browser/WKWebView `localStorage` — no server, no accounts.
- AI Coach uses the Anthropic API (user supplies their own key in Settings). Responses are **non-streaming** — WKWebView SSE was unreliable in the iOS PWA shell (see commit `8eea4c5`).
- Coach supports: persistent chat history, intake flow to build a custom programme, native tool calls for routine edits, image input. Programme is AI-generated per user via a 10-question intake — until generated, the Log tab shows an empty-state CTA pointing to the Coach.
- Log tab reads exercises from `kt_routine` via `getSessionExercises()` / `getWkData()`. There is no built-in fallback programme.
- User name is dynamic (pulled from their AI-generated routine) — no hardcoded names anywhere.
- **iOS native shell only:** Settings → Data → Import from Apple Health pulls running workouts from HealthKit into `kt_runs`, with dedup against `kt_hk_imported`. Read-only — Trovo never writes to HealthKit.

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
