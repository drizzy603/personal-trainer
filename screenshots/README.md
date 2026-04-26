# App Store Screenshots

App Store Connect requires:
- **6.7" iPhone** (iPhone 14/15/16 Pro Max) — minimum required, max 10 shots
- **6.9" iPhone** (iPhone 17 Pro Max) — recommended for best presentation on newer devices

If you only ship 6.7" shots, App Store Connect upscales them for 6.9" — acceptable but slightly less crisp.

## Workflow

```bash
# 1. Boot simulator + open the PWA URL
./screenshots/launch-sim.sh           # 6.9" iPhone 17 Pro Max
./screenshots/launch-sim.sh 6.7       # 6.7" iPhone 15 Pro Max

# 2. In the sim:
#    Share icon → Add to Home Screen → Open the PWA from the home screen
#
# 3. On the Mac:
#    Safari → Develop → <Simulator> → pick the webview
#    Paste contents of screenshots/seed-demo.js into the console
#
# 4. Reload the page in the sim (Cmd+R inside Web Inspector or pull-to-refresh)
#
# 5. Navigate to a screen and capture:
./screenshots/take-shot.sh log
./screenshots/take-shot.sh coach
./screenshots/take-shot.sh progress
./screenshots/take-shot.sh library
./screenshots/take-shot.sh settings
```

Output lands in `screenshots/out/`.

## Recommended screen list (5 shots)

1. **Log** — Push session loaded with realistic exercise rows
2. **Coach** — Mid-conversation showing the AI coaching tone (you'll need a real reply, see "Coach screenshot" below)
3. **Progress** — Streak, weekly volume, weight trend
4. **Library** — 70+ exercises with categories
5. **Settings** — How the app works walkthrough or About

## Coach screenshot

The Coach tab shows real Anthropic responses, so seeding chat history isn't faked.
Best path:
- After seeding demo data, go to Settings, paste a real Anthropic API key
- Open Coach → ask "make week 7 a bit lighter, my left shoulder is sore"
- Wait for the reply, then capture
- Remove the API key from Settings before clearing the simulator (or just delete the simulator data when done)

## Cleanup

When done, on the simulator:
- Long-press the PWA icon → Remove App
- Or wipe the simulator entirely: `xcrun simctl erase "iPhone 17 Pro Max"`
