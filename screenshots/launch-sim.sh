#!/usr/bin/env bash
# Boot a screenshot simulator and open the PWA URL so you can seed demo
# data and capture App Store screenshots.
#
# Usage:
#   ./screenshots/launch-sim.sh                  # 6.9" iPhone 17 Pro Max
#   ./screenshots/launch-sim.sh 6.7              # 6.7" iPhone 15 Pro Max
#
# After the simulator boots, the PWA URL opens in mobile Safari.
#   1. Tap the share icon → Add to Home Screen → Open the PWA card
#   2. Safari → Develop → <Simulator name> → Select the app's webview
#   3. Paste the contents of screenshots/seed-demo.js into the console
#   4. Refresh the page in the simulator
#   5. Take screenshots: Cmd+S (saves to ~/Desktop) or `./take-shot.sh <name>`

set -euo pipefail

SIZE="${1:-6.9}"
case "$SIZE" in
  6.9) DEVICE="iPhone 17 Pro Max" ;;
  6.7) DEVICE="iPhone 15 Pro Max" ;;
  *)   echo "Unsupported size: $SIZE (use 6.9 or 6.7)"; exit 1 ;;
esac

URL="https://drizzy603.github.io/personal-trainer/"

echo "Booting $DEVICE…"
xcrun simctl boot "$DEVICE" 2>/dev/null || true
open -a Simulator

# Wait for the simulator to be Booted (not Booting)
for _ in {1..30}; do
  STATUS=$(xcrun simctl list devices booted | grep -c "$DEVICE" || true)
  [ "$STATUS" -ge 1 ] && break
  sleep 1
done

echo "Opening $URL in mobile Safari…"
xcrun simctl openurl booted "$URL"

cat <<EOF

Simulator ready: $DEVICE
PWA URL opened in mobile Safari.

Next steps:
  1. In the sim: tap Share → Add to Home Screen → open the PWA card
  2. Mac: Safari → Develop → $DEVICE Simulator → pick the webview
  3. Paste contents of screenshots/seed-demo.js into the console
  4. Refresh the page on the sim
  5. Screenshot via Cmd+S in Simulator or:
       ./screenshots/take-shot.sh <name>
EOF
