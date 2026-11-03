#!/usr/bin/env bash
# Native smoke test: build the current code into the iOS + watch simulators,
# drive the main screens, and drop screenshots for eyeballing.
#
#   ./test-native.sh              # full run: build + drive + screenshots
#   ./test-native.sh --no-build   # reuse this tree's last build, just drive + shoot
#                                 # (another tree's build is refused; --no-build=any takes it, saying so)
#   ROOMS="heavyweight" ./test-native.sh   # one pass instead of two ("default": the stored room)
#
# One runner uses the paired simulators at a time: the run takes ~/Library/Caches/FPKit/sim.lock
# first (tests/tools/simlock.sh: it waits as long as a live holder holds, says whose lock it waits
# for, and breaks one whose holder is gone, or one naming no holder once it is 2 hours old), and
# builds inside that hold.
#
# What it does (the verified recipe from 2026-08-02):
#   1. Refresh www/ from repo-root sources (cap copy alone ships a STALE www).
#   2. Build the App scheme with -destination (never -sdk: forcing the
#      iphonesimulator SDK breaks the embedded watch target's WatchKit), as
#      build 61 at least (FPStore gives a new store minReader 60, so a lower
#      build number would refuse its own native copy from its second launch,
#      and the verdicts a container kept from build 60's runs must not apply),
#      and check the built app's scene manifest (tests/tools/scene-plist.sh).
#      Steps 1-2 are tests/tools/fp-build.sh's: the build lands in
#      ~/Library/Caches/FPKit/<checkout>/dd-native with build-id.txt beside it.
#   3. Boot the first paired iPhone+Watch simulator duo.
#   4. Install + launch the phone app, then drive screens by relaunching it
#      with the route as a launch argument (-devNav <route>; routes per
#      CLAUDE.md), which the shell hands to the page in window.__FP_SHELL.
#      Nothing writes WebKit's localstorage.sqlite3 behind the native copy.
#      Every route runs once per room in ROOMS (default: Heavyweight, then Lime,
#      each through -devTheme, so a container whose stored room is Lime still
#      shoots Heavyweight first; "default" leaves the stored room), all on one app container with the native
#      copy attached; -fpOffline keeps the page's own update check off, so the
#      bundled page is the one under test even when Pages serves a newer one.
#      Every launch takes -fpIgnoreMarker: ending the app with simctl terminate
#      while the native chat is up leaves a crash marker, which must not turn
#      the chat off for the rest of the run (tests/native-shell.sh tests markers).
#   5. The native Coach chat, live (tests/tools/native-chat.py; plan task C7):
#      -fpSmoke logs "fp: ping ok v1"; the keyboard sequences the simulator can
#      drive (its software keyboard on for them); a real coach turn from the
#      native composer on a stand-in for the Messages API on this Mac's loopback
#      (tests/tools/coach-stub.py, the Debug argument -fpApiBase), with the echo,
#      Thinking, the reply, a tool pill and PLAN CHANGES with Undo and Keep
#      round-tripping; then coach/chat by launch argument in both rooms x the
#      phone's appearance (simctl ui appearance light|dark) x its text size
#      (simctl ui content_size large|extra-extra-large). Whatever it changed in
#      the container is put back after, and the phone's settings too.
#   6. Check the native copy (FPStore's store.sqlite) holds what WebKit holds.
#   7. Install + launch the watch app; its screenshot proves the plan arrived
#      over the real WCSession bridge.
# Screenshots land in screenshots/out/native/. LOOK AT THEM — a blank frame
# is a failed run. Set completion / wrist taps can't be driven from here
# (no UI-automation harness); those behaviors are covered by tests/specs.
set -euo pipefail
cd "$(dirname "$0")"

NOBUILD=""
case "${1:-}" in
  "") ;;
  --no-build|--no-build=any) NOBUILD="$1" ;;
  *) echo "unknown option $1"; exit 2 ;;
esac
OUT=screenshots/out/native
APP_ID=app.kt.trainer
WATCH_ID=app.kt.trainer.watchkitapp
ROUTES="log/workout progress progress/calendar progress/day progress/compare progress/records coach settings settings/storage settings/storage-sheet log/sport modal/build modal/routines modal/nextround"
ROOMS=${ROOMS:-"heavyweight dark"}
mkdir -p "$OUT"

. tests/tools/simlock.sh
simlock test-native
# iOS 27 kills an app built against its SDK without a scene delegate (builds 44/45), and the simulator does not
# enforce it: fp-build checks the built Info.plist (tests/tools/scene-plist.sh) on every run, --no-build included.
DERIVED=$(tests/tools/fp-build.sh native $NOBUILD)
PHONE_APP="$DERIVED/Build/Products/Debug-iphonesimulator/App.app"
WATCH_APP="$DERIVED/Build/Products/Debug-watchsimulator/SuperoWatch.app"
SHELL_BUILD=$(plutil -extract CFBundleVersion raw -o - "$PHONE_APP/Info.plist")

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
boot "$PHONE"; open -a Simulator 2>/dev/null || true   # Simulator.app is optional: devices boot and screenshot headless

echo "── Installing + launching phone app"
xcrun simctl install "$PHONE" "$PHONE_APP"
xcrun simctl launch "$PHONE" $APP_ID -fpOffline -fpIgnoreMarker >/dev/null; sleep 4

DATA=$(xcrun simctl get_app_container "$PHONE" $APP_ID data)
DB=$(find "$DATA/Library/WebKit" -name localstorage.sqlite3 2>/dev/null | head -1)
[ -n "$DB" ] || { echo "FAIL: localstorage.sqlite3 not found (app never painted?)"; exit 1; }

drive(){  # drive <route> <shot-name> [room]: relaunch on the route (and the room), then shoot
  xcrun simctl terminate "$PHONE" $APP_ID 2>/dev/null || true; sleep 1
  if [ -n "${3:-}" ]; then
    xcrun simctl launch "$PHONE" $APP_ID -fpOffline -fpIgnoreMarker -devNav "$1" -devTheme "$3" >/dev/null
  else
    xcrun simctl launch "$PHONE" $APP_ID -fpOffline -fpIgnoreMarker -devNav "$1" >/dev/null
  fi
  sleep 4
  xcrun simctl io "$PHONE" screenshot "$OUT/$2.png" >/dev/null 2>&1
  echo "  shot: $OUT/$2.png"
}
pass=0
for room in $ROOMS; do
  pass=$((pass + 1))
  echo "── Pass $pass: every route (room: $room)"
  for r in $ROUTES; do
    name=$(echo "$r" | tr '/' '-')
    if [ "$pass" -gt 1 ]; then name="$name-$pass-$room"; fi
    if [ "$room" = default ]; then drive "$r" "$name"; else drive "$r" "$name" "$room"; fi
  done
done

echo "── The native Coach chat, live (coach/chat in both rooms x appearance x text size, keys, a stand-in coach turn)"
CHAT_RC=0
python3 tests/tools/native-chat.py --phone "$PHONE" --shell "$SHELL_BUILD" --out "$OUT" || CHAT_RC=1

# Clean relaunch — the app must boot normally after all the nav driving.
xcrun simctl terminate "$PHONE" $APP_ID 2>/dev/null || true; sleep 1
xcrun simctl launch "$PHONE" $APP_ID -fpOffline -fpIgnoreMarker >/dev/null; sleep 4
xcrun simctl io "$PHONE" screenshot "$OUT/boot.png" >/dev/null 2>&1
echo "  shot: $OUT/boot.png"

echo "── The native copy against WebKit"
# Copies of both SQLite files (with their -wal), compared value by value; WebKit writes its file a moment after the
# page's save, so a difference gets a few seconds to settle before it fails the run.
python3 - "$DATA" <<'EOF'
import os, shutil, sqlite3, sys, tempfile, time
data = sys.argv[1]
def copy(p):
    d = tempfile.mkdtemp(prefix='tn-')
    dst = os.path.join(d, os.path.basename(p))
    for ext in ('', '-wal', '-shm'):
        if os.path.exists(p + ext):
            shutil.copyfile(p + ext, dst + ext)
    return d, dst
def u16(b):
    return None if b is None else (b if isinstance(b, str) else bytes(b).decode('utf-16-le', 'surrogatepass'))
def webkit():
    for dp, _dn, fn in os.walk(os.path.join(data, 'Library', 'WebKit')):
        if 'localstorage.sqlite3' in fn:
            d, p = copy(os.path.join(dp, 'localstorage.sqlite3'))
            try:
                return {k: u16(v) for k, v in sqlite3.connect(p).execute('SELECT key, value FROM ItemTable')}
            finally:
                shutil.rmtree(d, ignore_errors=True)
    return None
def store():
    p = os.path.join(data, 'Library', 'Application Support', 'FPStore', 'store.sqlite')
    if not os.path.exists(p):
        return None
    d, cp = copy(p)
    try:
        db = sqlite3.connect(cp)
        kv = {k: u16(v) for k, v, enc in db.execute('SELECT k, v, enc FROM kv') if enc == 'u16' and v is not None}
        return kv, dict(db.execute('SELECT k, v FROM meta'))
    finally:
        shutil.rmtree(d, ignore_errors=True)
def reserved(k):
    return k == 'kt_apikey' or k.startswith('kt__store')
bad = None
for _ in range(8):
    w, s = webkit(), store()
    if w is None or s is None:
        sys.exit('FAIL: ' + ('no WebKit file' if w is None else 'no native copy (Library/Application Support/FPStore/store.sqlite)'))
    kv, meta = s
    w = {k: v for k, v in w.items() if not reserved(k)}
    bad = sorted(k for k in set(w) | set(kv) if w.get(k) != kv.get(k))
    if not bad:
        break
    time.sleep(1)
if bad:
    sys.exit('FAIL: the native copy and WebKit differ on ' + ', '.join(bad[:8]))
print('  native copy attached: in step with WebKit on all %d keys (store boot %s, minReader %s)' % (len(kv), meta.get('boot', '?'), meta.get('minReader', '?')))
EOF

echo "── Watch app on the paired watch"
boot "$WATCH"
xcrun simctl install "$WATCH" "$WATCH_APP"
xcrun simctl launch "$WATCH" $WATCH_ID >/dev/null
# The sim bridge answers the watch's plan pull ~10-15s after launch (the
# phone replies in ~2s; delivery is the slow half). Shooting at 8s captured
# the previous cached plan and read as a sync failure — wait for the pull.
for i in $(seq 1 25); do
  sleep 1
  if xcrun simctl spawn "$WATCH" log show --last 1m --info --predicate 'subsystem == "app.kt.trainer"' 2>/dev/null \
     | grep -q "refresh: reply received"; then
    echo "  watch pulled today's plan after ${i}s"; sleep 1; break
  fi
done
xcrun simctl io "$WATCH" screenshot "$OUT/watch.png" >/dev/null 2>&1
echo "  shot: $OUT/watch.png"

echo
if [ "$CHAT_RC" != 0 ]; then
  echo "FAIL: the native Coach chat checks failed (the FAIL lines under \"The native Coach chat, live\" above)"
  exit 1
fi
echo "DONE — inspect every PNG in $OUT/ (watch.png showing today's plan"
echo "proves the WCSession bridge; coach-chat-*, keys-* and live-* are the native"
echo "chat; a blank frame anywhere is a failure)."
echo "Sims left booted for hand-testing taps (runner sets, wrist logging)."
