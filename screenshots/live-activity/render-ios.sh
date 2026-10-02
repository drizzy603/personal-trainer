#!/bin/sh
# Live Activity mockups drawn by iOS: builds the renderer for the simulator and runs it INSIDE a
# booted iPhone simulator (no Simulator.app needed) → screenshots/out/live-activity/ios/
# SIM_UDID picks the device (default: the first available iPhone Pro Max).
set -e
H="$(cd "$(dirname "$0")" && pwd)"; R="$H/../.."; OUT="$R/screenshots/out/live-activity/ios"
B="$R/screenshots/out/live-activity/bin"; mkdir -p "$B"
UDID=${SIM_UDID:-$(xcrun simctl list devices available | grep -m1 "iPhone [0-9]* Pro Max (" | grep -oE '[0-9A-F-]{36}' || true)}
[ -n "$UDID" ] || { echo "no iPhone Pro Max simulator: set SIM_UDID (xcrun simctl list devices available)"; exit 1; }
SDK=$(xcrun --sdk iphonesimulator --show-sdk-path)
xcrun --sdk iphonesimulator swiftc -swift-version 5 -O -target arm64-apple-ios17.0-simulator -sdk "$SDK" -o "$B/render-ios" \
  "$R/ios/App/App/TrovoTimerAttributes.swift" "$R/ios/App/TrovoTimerWidget/TrovoRestViews.swift" "$H/shim.swift" "$H/main.swift"
xcrun simctl boot "$UDID" 2>/dev/null || true
for _ in $(seq 1 60); do xcrun simctl list devices | grep -q "$UDID) (Booted" && break; sleep 1; done
rm -rf "$OUT"; LOG="$B/render-ios.log"
xcrun simctl spawn "$UDID" "$B/render-ios" "$R/ios/App/TrovoTimerWidget/Fonts" "$OUT" > "$LOG" 2>&1 & P=$!
( sleep 120; kill $P ) >/dev/null 2>&1 & W=$!
wait $P || true; kill $W 2>/dev/null || true; wait $W 2>/dev/null || true
grep -E 'wrote|font failed' "$LOG" | sed 's#.*/##'
grep -q wrote "$LOG" || { echo "nothing rendered — see $LOG"; exit 1; }
