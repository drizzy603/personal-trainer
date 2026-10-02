#!/bin/sh
# Live Activity mockups on the Mac → screenshots/out/live-activity/mac/
set -e
H="$(cd "$(dirname "$0")" && pwd)"; R="$H/../.."; OUT="$R/screenshots/out/live-activity/mac"
B="$R/screenshots/out/live-activity/bin"; mkdir -p "$B"
swiftc -swift-version 5 -O -o "$B/render-mac" "$R/ios/App/App/TrovoTimerAttributes.swift" \
  "$R/ios/App/TrovoTimerWidget/TrovoRestViews.swift" "$H/shim.swift" "$H/main.swift"
rm -rf "$OUT"; "$B/render-mac" "$R/ios/App/TrovoTimerWidget/Fonts" "$OUT" | sed 's#.*/##'
