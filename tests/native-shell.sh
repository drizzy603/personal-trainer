#!/usr/bin/env bash
# Native shell scenarios (plan tasks C5 and T16): the TrovoShell plugin, ScreenHost, PageLink and build 61's tab root
# (FPKit FPUI) in the real app (the real index.html in the real Capacitor shell) on an iOS simulator. The app's Debug
# build runs each scenario's steps from launch arguments (FPUI ShellProbe), and tests/tools/native-shell.py reads what it
# reports and decides.
#
#   ./tests/native-shell.sh                  # build as build 61 at least; the tab root on iOS 26.x and 27.x, the
#                                            # classic root on iOS 27.x
#   ./tests/native-shell.sh --os 27          # the runtimes (any installed major: 26, 27, and 17 or 18, where the root is
#                                            # classic by the OS; "26 27" by default)
#   ./tests/native-shell.sh --root tabs      # one root (tabs | classic | both, the default); the classic pass runs on
#                                            # iOS 27.x only, whatever --os says (plan D-T5)
#   ./tests/native-shell.sh --phone <udid>   # one simulator (both roots on it unless --root says)
#   ./tests/native-shell.sh --no-build       # reuse this tree's last build (another tree's is refused)
#   ./tests/native-shell.sh --no-build=any   # reuse the last build whatever tree it came from (its identity first)
#   ./tests/native-shell.sh --only chat,wckill
#   ./tests/native-shell.sh --keep-data      # install over the phone's container instead of a fresh one
#   ./tests/native-shell.sh --list           # every scenario in run order, the modules' included (no build)
#
# Scenarios (build 60's nine, under both roots): smoke (-fpSmoke's ping, the root the launch built, hello, the flag's
# bar, About's rows), chat (classic: presented .overFullScreen over the page; tab root: pushed on the NATIVE Coach tab's
# stack; a message, the model switch, a forwarded confirm and Undo toast, the screen marker, Back, the rooms'
# appearance), focus (a focused web field, then the chat up and down by the page, Back and the edge pan or navPop: no
# keyboard comes back, the document not scrolled; interactivePop on with Back, off in setup), wckill (WebContent killed
# with the chat up: taken over and resynced on the new boot, the Coach tab NATIVE throughout, nothing resent, the open
# confirm stale), marker (a planted crash marker brings back the web Coach once; on the tab root the hub's marker too),
# policy (screens.coach "off" at once; on the tab root screens.coachHome too), breaker (three timeouts turn it off for
# the page build), counters (the web view out of its window; on the tab root a stray selection), inactive (no marker
# while the app is away). Then every scenario of tests/tools/shellscen/*.py, by rank. Shots land in
# screenshots/out/native-shell/ as <runtime>-<root>-<scenario>-...png: look at them.
#
# The simulator is named by UDID (never "booted"); the default is the phone of the first paired iPhone + Watch on the
# runtime, as test-native.sh picks it, else the runtime's first iPhone. Each pass replaces the app's data (the app
# uninstalled and installed: plan delta 16.7), seeds its own key, programme and conversation, and checks the root its
# launches build before any scenario runs.
#
# One runner uses the paired simulators at a time: the run takes ~/Library/Caches/FPKit/sim.lock first
# (tests/tools/simlock.sh: it waits as long as a live holder holds, says whose lock it waits for, and breaks one whose
# holder is gone, or one naming no holder once it is 2 hours old), and builds inside that hold. The build is
# tests/tools/fp-build.sh's: ~/Library/Caches/FPKit/<checkout>/dd-shell, signed to run locally, build-id.txt beside the
# app, the scene rule (tests/tools/scene-plist.sh) checked on the app every run.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=screenshots/out/native-shell
OSES="26 27"; ROOT=both; PHONE=""; NOBUILD=""; ONLY=""; KEEP=""; LIST=""
while [ $# -gt 0 ]; do
  case "$1" in
    --os) OSES="$2"; shift 2 ;;
    --root) ROOT="$2"; shift 2 ;;
    --phone) PHONE="$2"; shift 2 ;;
    --no-build|--no-build=any) NOBUILD="$1"; shift ;;
    --only) ONLY="$2"; shift 2 ;;
    --keep-data) KEEP=1; shift ;;
    --list) LIST=1; shift ;;
    *) echo "unknown option $1"; exit 2 ;;
  esac
done
case "$ROOT" in tabs|classic|both) ;; *) echo "--root takes tabs, classic or both"; exit 2 ;; esac
for os in $OSES; do case "$os" in ''|*[!0-9]*) echo "--os takes majors (\"26 27\"): $os"; exit 2 ;; esac; done
if [ -n "$LIST" ]; then exec python3 tests/tools/native-shell.py --list; fi
# A module that does not load, or an --only that names nothing known, stops here: before the lock and the build.
python3 tests/tools/native-shell.py --list > /dev/null || { python3 tests/tools/native-shell.py --list; exit 2; }
if [ -n "$ONLY" ]; then
  python3 - "$ONLY" <<'PY' || exit 2
import subprocess, sys
known = [l.split()[0] for l in subprocess.run(['python3', 'tests/tools/native-shell.py', '--list'], capture_output=True, text=True).stdout.splitlines() if l.strip()]
bad = [n for n in sys.argv[1].split(',') if n.strip() and n.strip() not in known]
if bad:
    print('unknown scenario(s): %s (known: %s)' % (', '.join(bad), ', '.join(known)))
    sys.exit(1)
PY
fi
mkdir -p "$OUT"

. tests/tools/simlock.sh
simlock native-shell
# Build 61 at least (FPStore gives a new store minReader 60, and the verdicts and breaker records a container kept from
# build 60's runs must not apply), signed to run locally (FP_BUILD_SIGN=local: the App Group's container, which the share
# hook writes into, plan delta 17.7); --no-build refuses another tree's build and one signed otherwise.
DD=$(FP_BUILD_SIGN=local tests/tools/fp-build.sh shell $NOBUILD)
APP="$DD/Build/Products/Debug-iphonesimulator/App.app"
SHELL_BUILD=$(plutil -extract CFBundleVersion raw -o - "$APP/Info.plist")

phone_for(){  # phone_for <major>: the first active paired iPhone + Watch on that runtime, else its first iPhone
  python3 - "$1" <<'PY'
import json, re, subprocess, sys
want = 'iOS-' + sys.argv[1] + '-'
devs = json.loads(subprocess.run(['xcrun', 'simctl', 'list', '-j', 'devices'], capture_output=True, text=True).stdout)['devices']
rt = {u['udid']: r for r, ds in devs.items() for u in ds}
pairs = subprocess.run(['xcrun', 'simctl', 'list', 'pairs'], capture_output=True, text=True).stdout
active = False
for line in pairs.splitlines():
    if re.match(r'^\S', line):
        active = '(active' in line
    m = re.search(r'Phone: .*\((\w{8}-\w{4}-\w{4}-\w{4}-\w{12})\)', line)
    if m and active and want in rt.get(m.group(1), '') + '-':
        print(m.group(1)); sys.exit()
for r, ds in sorted(devs.items(), reverse=True):
    if want in r + '-':
        for u in ds:
            if u['name'].startswith('iPhone') and u.get('isAvailable', True):
                print(u['udid']); sys.exit()
PY
}

# The paired phones are the lock holder's (20-order 1.5): each pass gets the machine to itself, the other paired phones
# shut down first (a booted iOS 27 phone costs about 200 processes and its share of the memory), and at the end the run
# shuts down the phones it booted itself.
paired_phones(){
  xcrun simctl list pairs | sed -nE 's/.*Phone: .*\(([0-9A-F-]{36})\) \(([A-Za-z ]+)\).*/\1 \2/p'
}
BOOTED_BEFORE=$(paired_phones | awk '$2 == "Booted" {print $1}')
others_down(){  # others_down <udid>: every other booted paired phone shut down
  local u st
  while read -r u st; do
    if [ "$u" != "$1" ] && [ "$st" = Booted ]; then
      echo "   (the paired phone $u shut down: this pass runs on $1)"
      xcrun simctl shutdown "$u" >/dev/null 2>&1 || true
    fi
  done < <(paired_phones)
}
end_down(){  # the phones this run booted, shut down again
  local u st
  while read -r u st; do
    if [ "$st" = Booted ] && ! printf '%s\n' "$BOOTED_BEFORE" | grep -qx "$u"; then
      xcrun simctl shutdown "$u" >/dev/null 2>&1 || true
      echo "   (the paired phone $u this run booted: shut down)"
    fi
  done < <(paired_phones)
}

RC=0
run_on(){  # run_on <udid> <tabs|classic>
  others_down "$1"
  local args=(--phone "$1" --app "$APP" --shell "$SHELL_BUILD" --out "$OUT" --root "$2")
  [ -n "$ONLY" ] && args+=(--only "$ONLY")
  [ -n "$KEEP" ] && args+=(--keep-data)
  python3 tests/tools/native-shell.py "${args[@]}" || RC=1
}
if [ -n "$PHONE" ]; then
  [ "$ROOT" = classic ] || run_on "$PHONE" tabs
  [ "$ROOT" = tabs ] || run_on "$PHONE" classic
else
  if [ "$ROOT" != classic ]; then
    for os in $OSES; do
      P=$(phone_for "$os")
      [ -n "$P" ] || { echo "FAIL: no iPhone simulator on iOS $os"; RC=1; continue; }
      run_on "$P" tabs
    done
  fi
  if [ "$ROOT" != tabs ]; then   # the classic pass: iOS 27.x only, whatever --os says (D-T5: the owner's OS)
    P=$(phone_for 27)
    if [ -n "$P" ]; then run_on "$P" classic; else echo "FAIL: no iPhone simulator on iOS 27 for the classic pass"; RC=1; fi
  fi
fi
end_down
ANY=""; [ "$NOBUILD" = --no-build=any ] && ANY=" (--no-build=any: the build's identity is at the top)"
[ "$RC" = 0 ] && echo "native-shell: all scenarios passed$ANY" || echo "native-shell: FAILED (see FAIL lines above)$ANY"
exit $RC
