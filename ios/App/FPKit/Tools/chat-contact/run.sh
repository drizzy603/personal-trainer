#!/bin/bash
# The native Coach chat beside the web chat (plan task C6): renders every coach fixture natively
# (FPUITests' CoachRenderTests on an iOS simulator) and on the web (web-shots.js, Playwright), then
# builds the contact sheets (sheet.py).
#
#   ios/App/FPKit/Tools/chat-contact/run.sh <simulator UDID> <shots dir> <sheets dir>
#
# Use a simulator of your own (xcrun simctl create "FP-Chat-<you>" <iPhone type> <iOS runtime>),
# never the paired iPhone + Watch that test-native.sh drives. Needs Xcode, node with Playwright in
# tests/node_modules, and Pillow.
set -euo pipefail
SIM="${1:?simulator UDID}"
SHOTS="${2:?shots dir}"
SHEETS="${3:?sheets dir}"
HERE="$(cd "$(dirname "$0")" && pwd)"
FPKIT="$(cd "$HERE/../.." && pwd)"
ROOT="$(cd "$FPKIT/../../.." && pwd)"
mkdir -p "$SHOTS" "$SHEETS"
SHOTS="$(cd "$SHOTS" && pwd)"
rm -rf "$SHOTS/native" "$SHOTS/web"

echo "== native (xcodebuild test, CoachRenderTests)"
(cd "$FPKIT" && TEST_RUNNER_FPUI_SHOTS="$SHOTS" xcodebuild test -scheme FPKit-Package \
  -destination "platform=iOS Simulator,id=$SIM" -parallel-testing-enabled NO \
  -only-testing:FPUITests/CoachRenderTests > "$SHOTS/xcodebuild.log" 2>&1) || { tail -40 "$SHOTS/xcodebuild.log"; exit 1; }
grep -E "Executed|\*\* TEST" "$SHOTS/xcodebuild.log" | tail -2

echo "== web (Playwright)"
(cd "$ROOT" && node ios/App/FPKit/Tools/chat-contact/web-shots.js "$SHOTS")

echo "== sheets"
python3 "$HERE/sheet.py" "$SHOTS" "$SHEETS"
