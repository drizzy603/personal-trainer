#!/usr/bin/env bash
# Native smoke test: build the current code into the iOS + watch simulators,
# drive the main screens, and drop screenshots for eyeballing.
#
#   ./test-native.sh              # full run: build + drive + screenshots
#   ./test-native.sh --no-build   # reuse the last build, just drive + shoot
#
# What it does (the verified recipe from 2026-08-02):
#   1. Refresh www/ from repo-root sources (cap copy alone ships a STALE www).
#   2. Build the App scheme with -destination (never -sdk: forcing the
#      iphonesimulator SDK breaks the embedded watch target's WatchKit).
#   3. Boot the first paired iPhone+Watch simulator duo.
#   4. Install + launch the phone app, then drive screens by writing
#      kt_dev_nav into the WKWebView's localstorage.sqlite3 (UTF-16LE) and
#      relaunching — routes per CLAUDE.md.
#   5. Install + launch the watch app; its screenshot proves the plan arrived
#      over the real WCSession bridge.
# Screenshots land in screenshots/out/native/. LOOK AT THEM — a blank frame
# is a failed run. Set completion / wrist taps can't be driven from here
# (no UI-automation harness); those behaviors are covered by tests/specs.
set -euo pipefail
cd "$(dirname "$0")"

DERIVED=/tmp/supero-build
OUT=screenshots/out/native
APP_ID=app.kt.trainer
WATCH_ID=app.kt.trainer.watchkitapp
ROUTES="log/workout progress coach settings log/sport"
mkdir -p "$OUT"

if [ "${1:-}" != "--no-build" ]; then
  echo "── Refreshing www/ from repo root"
  npm run --silent build:web
  npx cap copy ios >/dev/null
  echo "── Building App scheme (phone + watch) for simulators"
  ( cd ios/App && xcodebuild -project App.xcodeproj -scheme App -configuration Debug \
      -destination 'generic/platform=iOS Simulator' -derivedDataPath "$DERIVED" \
      build CODE_SIGNING_ALLOWED=NO 2>&1 | tail -1 )
fi
PHONE_APP="$DERIVED/Build/Products/Debug-iphonesimulator/App.app"
WATCH_APP="$DERIVED/Build/Products/Debug-watchsimulator/SuperoWatch.app"
[ -d "$PHONE_APP" ] || { echo "FAIL: $PHONE_APP missing — run without --no-build"; exit 1; }

# First active pair: watch UDID then phone UDID.
read -r WATCH PHONE <<<"$(xcrun simctl list pairs | python3 -c "
import re, sys
w = None
for line in sys.stdin:
    m = re.search(r'\((\w{8}-\w{4}-\w{4}-\w{4}-\w{12})\)', line)
    if not m: continue
    if 'Watch:' in line: w = m.group(1)
    elif 'Phone:' in line and w: print(w, m.group(1)); break
")"
[ -n "${PHONE:-}" ] || { echo "FAIL: no paired iPhone+Watch simulators (Xcode → Devices)"; exit 1; }
echo "── Pair: phone $PHONE / watch $WATCH"

boot(){ xcrun simctl boot "$1" 2>/dev/null || true
  for _ in $(seq 1 45); do xcrun simctl list devices | grep -q "$1.*Booted" && return; sleep 1; done
  echo "FAIL: $1 did not boot"; exit 1; }
boot "$PHONE"; open -a Simulator

echo "── Installing + launching phone app"
xcrun simctl install "$PHONE" "$PHONE_APP"
xcrun simctl launch "$PHONE" $APP_ID >/dev/null; sleep 4

DATA=$(xcrun simctl get_app_container "$PHONE" $APP_ID data)
DB=$(find "$DATA/Library/WebKit" -name localstorage.sqlite3 2>/dev/null | head -1)
[ -n "$DB" ] || { echo "FAIL: localstorage.sqlite3 not found (app never painted?)"; exit 1; }

drive(){  # drive <route> <shot-name>
  xcrun simctl terminate "$PHONE" $APP_ID 2>/dev/null || true; sleep 1
  python3 - "$DB" "$1" <<'EOF'
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
db.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('kt_dev_nav', ?)",
           (sys.argv[2].encode('utf-16-le'),))
db.commit(); db.close()
EOF
  xcrun simctl launch "$PHONE" $APP_ID >/dev/null; sleep 4
  xcrun simctl io "$PHONE" screenshot "$OUT/$2.png" >/dev/null 2>&1
  echo "  shot: $OUT/$2.png"
}
for r in $ROUTES; do drive "$r" "$(echo "$r" | tr '/' '-')"; done
# Clean relaunch — the app must boot normally after all the nav driving.
xcrun simctl terminate "$PHONE" $APP_ID 2>/dev/null || true; sleep 1
xcrun simctl launch "$PHONE" $APP_ID >/dev/null; sleep 4
xcrun simctl io "$PHONE" screenshot "$OUT/boot.png" >/dev/null 2>&1
echo "  shot: $OUT/boot.png"

echo "── Watch app on the paired watch"
boot "$WATCH"
xcrun simctl install "$WATCH" "$WATCH_APP"
xcrun simctl launch "$WATCH" $WATCH_ID >/dev/null; sleep 8
xcrun simctl io "$WATCH" screenshot "$OUT/watch.png" >/dev/null 2>&1
echo "  shot: $OUT/watch.png"

echo
echo "DONE — inspect every PNG in $OUT/ (watch.png showing today's plan"
echo "proves the WCSession bridge; a blank frame anywhere is a failure)."
echo "Sims left booted for hand-testing taps (runner sets, wrist logging)."
