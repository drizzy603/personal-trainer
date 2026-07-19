# App Store Metadata

Source of truth for App Store Connect & TestFlight copy. Update here, then paste into App Store Connect.

## App Information

**App Name** *(30 char limit)* — as registered in App Store Connect

```
Supero — AI Trainer
```

Home-screen name (CFBundleDisplayName) is the short form `Supero`. Bare "Supero" and "Alzo" were both reserved by unreleased app records, so the store listing carries the qualifier.

**Subtitle** *(30 char limit)*

```
AI-built training programmes
```

**Promotional Text** *(170 char limit, editable any time without review)*

```
Your AI coach builds a custom plan, tracks every set, and syncs your Apple Watch workouts. No accounts. No subscriptions. Your data stays on your phone.
```

**Description** *(4000 char limit)*

```
Supero is a private, no-account training tracker with an AI coach that builds your programme around your goals, schedule, and equipment.

Tell the coach what you want to train for — strength, size, a 5K, getting back in shape — and it generates a full multi-week programme in seconds. Push, pull, legs, runs, rest days; the cadence matches your week, not someone else's template.

━━━━━━━━━━━━━━━━━━━━
WHAT'S INSIDE
━━━━━━━━━━━━━━━━━━━━

• AI Coach — Conversational programme building, weekly reviews, mid-cycle tweaks, honest RPE-based progression
• Log — Workout runner with rest timer on your Lock Screen, plus runs, body tracking, and 14 sports with fully customizable fields
• CrossFit — Build WODs from a 56-movement library and track your repeated benchmarks
• Apple Health — Watch workouts (runs, rides, swims, pickleball, and more) land in your log automatically; finished lifts can count toward your rings
• Progress — Streaks, strength trends, PRs, weekly volume, activity mix, repeated-WOD bests
• Widgets — Today's session on your Home Screen and Lock Screen
• Library — 80 exercises with muscles worked, form tips, and cues
• Programme — Visual training plan with week-by-week notes and PR attempts

━━━━━━━━━━━━━━━━━━━━
PRIVATE BY DESIGN
━━━━━━━━━━━━━━━━━━━━

Every workout, run, weigh-in, and chat is stored only on your device. No accounts. No tracking. No ads. No analytics.

The AI Coach uses your own Anthropic API key — your conversations go directly from your phone to Anthropic, never through our servers (because we don't have any).

━━━━━━━━━━━━━━━━━━━━
WHAT YOU NEED
━━━━━━━━━━━━━━━━━━━━

• An Anthropic API key (free to create at console.anthropic.com)
• That's it.

━━━━━━━━━━━━━━━━━━━━

Made for lifters, runners, and anyone who wants their training plan to actually be theirs.
```

**Keywords** *(100 char limit, comma-separated, no spaces between commas)*

```
workout,gym,training,fitness,coach,strength,running,tracker,crossfit,cycling,log,lifting,health
```

Do not include words already in the app name or category — Apple indexes those automatically.

**Support URL** *(required)*

```
https://github.com/drizzy603/personal-trainer/issues
```

**Marketing URL** *(optional)*

```
https://drizzy603.github.io/personal-trainer/
```

**Privacy Policy URL** *(required)*

```
https://drizzy603.github.io/personal-trainer/privacy.html
```

**Category**

- Primary: Health & Fitness
- Secondary: Lifestyle

**Age Rating**: 4+ (no objectionable content, no ads, no third-party data sharing)

## App Review Contact

```
Email: robertokalanisosa@outlook.com
```

Set in App Store Connect → My Apps → Supero → App Information → App Review Information.

## TestFlight

**Beta App Description** *(shown to external testers before install)*

```
Supero is a private AI-powered training tracker. Beta testers will help shape the AI Coach experience and verify the programme-building flow on real devices. All data is stored locally — no accounts needed.
```

**What to Test** *(shown in TestFlight app)*

```
1. Open the Coach tab and walk through the intake to generate a programme
2. Log a session under the Log tab — try editing sets, reps, RPE
3. Switch the active session day; check Progress reflects it
4. Settings → How the app works should fully render
Report any layout glitches, crashes, or AI Coach errors.
```

**Beta App Review Information** *(required for external testers)*

- Contact email: `robertokalanisosa@outlook.com`
- Demo account: not applicable (no login required)
- Notes for reviewer:

```
This app requires the user to provide their own Anthropic API key for the AI Coach feature. To test the Coach: open Settings → API key, paste a valid Anthropic key. Without a key, the Coach tab shows an empty state but the rest of the app (Log, Progress, Library) is fully functional.
```

## Build Checklist (per upload)

- [ ] Run `./release-ios.sh` from the project root — bumps `CURRENT_PROJECT_VERSION` and runs `npx cap copy ios`
- [ ] Bump `MARKETING_VERSION` only on user-facing release version changes (manual edit in Xcode → target → General → Version)
- [ ] In Xcode: destination = "Any iOS Device (arm64)"
- [ ] Product → Archive → Distribute App → App Store Connect → Upload
- [ ] Answer "No" if asked about encryption export compliance (declared in Info.plist via `ITSAppUsesNonExemptEncryption=false`, but Xcode may re-confirm)

## Submission Day Playbook

Run top-to-bottom once Apple Developer verification clears.

### 1. Apple Developer portal (developer.apple.com)
- Identifiers → **+** → App IDs → App → Bundle ID **`app.kt.trainer`** (explicit) → Capabilities: enable **HealthKit** and **App Groups** (the app entitlements carry both; App Groups backs the share extension + timer widget via `group.app.kt.trainer`) → Continue → Register
- App Groups → **+** → register group **`group.app.kt.trainer`** if the capability step didn't create it
- The project has three signed targets: **App**, **TrovoShareExtension**, **TrovoTimerWidget**. With "Automatically manage signing" Xcode registers the extension bundle IDs itself on first archive — no manual App IDs needed for them, but each target needs the Team set (step 3).
- Note the **Team ID** (top-right of the portal, 10 chars)
- Skip cert/profile manual creation — Xcode "Automatically manage signing" handles both on first archive with `-allowProvisioningUpdates`

### 2. App Store Connect (appstoreconnect.apple.com)
- My Apps → **+** → New App
  - Platform: iOS
  - Name: **Supero**
  - Primary language: English (U.S.)
  - Bundle ID: `app.kt.trainer` (dropdown picks up the registered identifier)
  - SKU: `supero-001`
  - User access: Full
- App Information:
  - Category: Health & Fitness / Lifestyle
  - Privacy Policy URL: `https://drizzy603.github.io/personal-trainer/privacy.html`
- Pricing and Availability: Free, all territories
- App Privacy: answer **No** to "Do you or your third-party partners collect data from this app?" → label reads **Data Not Collected**. (ASC shows no data-type checkboxes on the "No" path — there is nothing to tick.)
  - Rationale to keep on file: all data is on-device; the only transmission is the user sending their own training data (including imported Apple Health runs/rides) to Anthropic under their **own** API key and account — not collection by us or our partners. Disclosed in privacy policy sections 2–4 and 6. Health writes (opt-in "Save lifts to Apple Health", added in 1.2) go device → HealthKit only and are likewise not collection; background delivery processes workouts on-device.
  - If App Review pushes back on Health data + the AI Coach, the fallback is to redo the questionnaire as: Health & Fitness → collected → App Functionality only → Not linked to identity → No tracking.
- Age Rating: 4+ (no objectionable content, no tracking, no ads, no UGC)
- Version 1.0 → paste from sections above:
  - Subtitle, Promotional Text, Description, Keywords
  - Support URL, Marketing URL
  - **Screenshots → 6.9" slot:** drag the PNGs from `screenshots/out/` (9 as of the last reshoot; ASC accepts up to 10). ASC will upscale for 6.7" + smaller automatically. **Reshoot first if the UI has changed since the PNGs were captured** — check the build stamp in the capture vs. current.
- App Review Information:
  - Email: `robertokalanisosa@outlook.com`
  - Notes: paste from "Beta App Review Information" → Notes for reviewer above
- Build: assign once the archive uploads (next step)

### 3. Archive + upload (local, simplest path)
```bash
./release-ios.sh                      # bumps CURRENT_PROJECT_VERSION + cap copy
open ios/App/App.xcodeproj
```
In Xcode:
- Signing & Capabilities → Team = your team, **for all three targets** (App, TrovoShareExtension, TrovoTimerWidget — the dropdown will populate after verification clears)
- App target → Signing & Capabilities: confirm **HealthKit** and **App Groups** (`group.app.kt.trainer`) show without errors; add via **+ Capability** if Xcode flags the entitlements. TrovoShareExtension needs the same App Group. The portal App ID must have both capabilities enabled (step 1).
- Destination dropdown → "Any iOS Device (arm64)"
- Product → Archive
- Organizer window → Distribute App → App Store Connect → Upload → Automatic signing → Done
- Wait ~10 min for processing, then back in ASC: Version 1.0 → Build → pick the new build

### 4. TestFlight smoke test (before submitting for review)
- TestFlight tab → Internal Testing → add yourself as tester (uses Apple ID associated with the developer account)
- Install via TestFlight on real iPhone → run through:
  - Coach intake → programme generation
  - Log a session, edit sets
  - Switch tabs, open Settings → How the app works
  - Verify hybrid loader: Settings → About should show "App build YYYYMMDD-N · Up to date"

### 5. Submit for review
- Version 1.0 → Add for Review → Submit
- Expected review time: 24–48h. Common rejection causes for this app:
  - **Guideline 4.7 (live updates)** — if reviewer flags the hybrid loader, fallback is to drop `server.url` work and ship bundled-only (memory note in `project_pt_ios_capacitor.md`)
  - **Guideline 5.1.1 (data collection)** — privacy policy already covers this; reference `privacy.html`
  - **API key requirement** — Notes for reviewer already explains the BYO-key model

### Optional: enable CI auto-upload (post-launch)
The `release` job in `.github/workflows/ios-build.yml` is gated `if: false`. To enable for future versions:
1. App Store Connect → Users and Access → Keys → **+** → role Developer → download `.p8` (one-time)
2. Export distribution cert from Keychain as `.p12` → `base64 -i cert.p12 | pbcopy`
3. GitHub repo → Settings → Secrets and variables → Actions → add:
   - `BUILD_CERTIFICATE_BASE64` (paste base64 cert)
   - `P12_PASSWORD` (cert export password)
   - `KEYCHAIN_PASSWORD` (any string)
   - `APPLE_TEAM_ID` (from dev portal)
   - `APP_STORE_CONNECT_KEY_ID` (10-char from ASC)
   - `APP_STORE_CONNECT_ISSUER_ID` (UUID from ASC)
   - `APP_STORE_CONNECT_PRIVATE_KEY` (full contents of `.p8`, including BEGIN/END lines)
4. Flip `if: false` → `if: github.ref == 'refs/heads/main'` in `.github/workflows/ios-build.yml`

### Optional: empty-state Log screenshot
Standalone PWA on the sim has real data. To capture an empty-state shot without losing it, paste in Web Inspector:
```js
// Backup + clear
localStorage.kt_routine_screenshot_backup = localStorage.kt_routine;
localStorage.removeItem('kt_routine');
location.reload();
```
Take the shot via `./screenshots/take-shot.sh log-empty`, then restore:
```js
localStorage.kt_routine = localStorage.kt_routine_screenshot_backup;
localStorage.removeItem('kt_routine_screenshot_backup');
location.reload();
```
