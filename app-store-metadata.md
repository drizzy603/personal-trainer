# App Store Metadata

Source of truth for App Store Connect & TestFlight copy. Update here, then paste into App Store Connect.

## App Information

**App Name** *(30 char limit)*

```
Personal Trainer
```

Fallback if taken: `Personal Trainer — AI Coach` (29 chars)

**Subtitle** *(30 char limit)*

```
AI-built training programmes
```

**Promotional Text** *(170 char limit, editable any time without review)*

```
Your AI coach builds a custom plan, tracks every set, and adapts week by week. No accounts. No subscriptions. Your data stays on your phone.
```

**Description** *(4000 char limit)*

```
Personal Trainer is a private, no-account training tracker with an AI coach that builds your programme around your goals, schedule, and equipment.

Tell the coach what you want to train for — strength, size, a 5K, getting back in shape — and it generates a full multi-week programme in seconds. Push, pull, legs, runs, rest days; the cadence matches your week, not someone else's template.

━━━━━━━━━━━━━━━━━━━━
WHAT'S INSIDE
━━━━━━━━━━━━━━━━━━━━

• AI Coach — Conversational programme building, mid-cycle tweaks, honest RPE-based progression
• Log — Quick set entry, supersets, exercise notes, rest timer, session notes
• Progress — Streaks, weekly volume, bodyweight, lift goals, run pace
• Library — 70+ exercises with muscles worked, form tips, and cues
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
workout,gym,training,fitness,coach,ai,strength,running,tracker,programme,push,pull,legs,log
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

Set in App Store Connect → My Apps → Personal Trainer → App Information → App Review Information.

## TestFlight

**Beta App Description** *(shown to external testers before install)*

```
Personal Trainer is a private AI-powered training tracker. Beta testers will help shape the AI Coach experience and verify the programme-building flow on real devices. All data is stored locally — no accounts needed.
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

- [ ] `npx cap copy ios` to bundle the latest web build
- [ ] Bump `CURRENT_PROJECT_VERSION` in `ios/App/App.xcodeproj/project.pbxproj` (each upload needs a unique build number)
- [ ] Bump `MARKETING_VERSION` only on user-facing release version changes
- [ ] In Xcode: destination = "Any iOS Device (arm64)"
- [ ] Product → Archive → Distribute App → App Store Connect → Upload
- [ ] Answer "No" to encryption export compliance prompt (declared in Info.plist via `ITSAppUsesNonExemptEncryption=false`)
