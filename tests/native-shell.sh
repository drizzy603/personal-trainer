#!/usr/bin/env bash
# Native shell scenarios (plan task C5): the TrovoShell plugin, ScreenHost and PageLink (FPKit FPUI) in the real app (the
# real index.html in the real Capacitor shell) on an iOS simulator. The app's Debug build runs each scenario's steps from
# launch arguments (FPUI ShellProbe), and tests/tools/native-shell.py reads what it reports and decides.
#
#   ./tests/native-shell.sh                  # build as build 61 at least, run every scenario on iOS 26.x
#   ./tests/native-shell.sh --os 27          # another runtime (26 or 27; "26 27" for both)
#   ./tests/native-shell.sh --phone <udid>   # one simulator
#   ./tests/native-shell.sh --no-build       # reuse this tree's last build (another tree's is refused)
#   ./tests/native-shell.sh --no-build=any   # reuse the last build whatever tree it came from (its identity first)
#   ./tests/native-shell.sh --only chat,wckill
#
# Scenarios: smoke (-fpSmoke logs "fp: ping ok v1"), chat (the native chat presented .overFullScreen on the page's
# model, a message, the model switch, a forwarded confirm and Undo toast round-trip, Back, no visibilitychange, the
# rooms' appearance), focus (a focused web field, then present and dismiss: no keyboard comes back and the document is
# not scrolled, by the page's dismiss, Back and the edge pan), wckill (WebContent killed with the chat up: taken over
# and resynced on the new boot, nothing resent, the open confirm closed as stale), marker (a planted crash marker
# brings back the web chat once), policy (screens.coach "off" at once), breaker (three timeouts turn it off for the
# page build). Shots land in screenshots/out/native-shell/: look at them.
#
# The simulator is named by UDID (never "booted"); the default is the phone of the first paired iPhone + Watch on the
# runtime, as test-native.sh picks it. The app is installed over what the phone holds (its data stays; the scenarios
# write their own key and conversation).
#
# One runner uses the paired simulators at a time: the run takes ~/Library/Caches/FPKit/sim.lock first
# (tests/tools/simlock.sh: it waits, says whose lock it waits for, and breaks one whose holder is gone or that is over
# 2 hours old), and builds inside that hold. The build is tests/tools/fp-build.sh's: ~/Library/Caches/FPKit/<checkout>/
# dd-shell, build-id.txt beside the app, the scene rule (tests/tools/scene-plist.sh) checked on the app every run.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=screenshots/out/native-shell
OSES="26"; PHONE=""; NOBUILD=""; ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --os) OSES="$2"; shift 2 ;;
    --phone) PHONE="$2"; shift 2 ;;
    --no-build|--no-build=any) NOBUILD="$1"; shift ;;
    --only) ONLY="$2"; shift 2 ;;
    *) echo "unknown option $1"; exit 2 ;;
  esac
done
mkdir -p "$OUT"

. tests/tools/simlock.sh
simlock native-shell
# Build 61 at least (FPStore gives a new store minReader 60, and the verdicts and breaker records a container kept from
# build 60's runs must not apply); --no-build refuses another tree's build.
DD=$(tests/tools/fp-build.sh shell $NOBUILD)
APP="$DD/Build/Products/Debug-iphonesimulator/App.app"
SHELL_BUILD=$(plutil -extract CFBundleVersion raw -o - "$APP/Info.plist")

phone_for(){  # phone_for <26|27>: the first active paired iPhone + Watch on that runtime, else its first iPhone
  python3 - "$1" <<'PY'
import json, re, subprocess, sys
want = 'iOS-' + sys.argv[1]
devs = json.loads(subprocess.run(['xcrun', 'simctl', 'list', '-j', 'devices'], capture_output=True, text=True).stdout)['devices']
rt = {u['udid']: r for r, ds in devs.items() for u in ds}
pairs = subprocess.run(['xcrun', 'simctl', 'list', 'pairs'], capture_output=True, text=True).stdout
active = False
for line in pairs.splitlines():
    if re.match(r'^\S', line):
        active = '(active' in line
    m = re.search(r'Phone: .*\((\w{8}-\w{4}-\w{4}-\w{4}-\w{12})\)', line)
    if m and active and want in rt.get(m.group(1), ''):
        print(m.group(1)); sys.exit()
for r, ds in sorted(devs.items(), reverse=True):
    if want in r:
        for u in ds:
            if u['name'].startswith('iPhone') and u.get('isAvailable', True):
                print(u['udid']); sys.exit()
PY
}

RC=0
run_on(){  # run_on <udid>
  local args=(--phone "$1" --app "$APP" --shell "$SHELL_BUILD" --out "$OUT")
  [ -n "$ONLY" ] && args+=(--only "$ONLY")
  python3 tests/tools/native-shell.py "${args[@]}" || RC=1
}
if [ -n "$PHONE" ]; then
  run_on "$PHONE"
else
  for os in $OSES; do
    P=$(phone_for "$os")
    [ -n "$P" ] || { echo "FAIL: no iPhone simulator on iOS $os"; RC=1; continue; }
    run_on "$P"
  done
fi
ANY=""; [ "$NOBUILD" = --no-build=any ] && ANY=" (--no-build=any: the build's identity is at the top)"
[ "$RC" = 0 ] && echo "native-shell: all scenarios passed$ANY" || echo "native-shell: FAILED (see FAIL lines above)$ANY"
exit $RC
