#!/usr/bin/env bash
# Native store scenarios (plan task S5): FPStore attached to the real app (the real index.html in the real Capacitor
# shell) on the iOS simulators, scenario by scenario. The probe that proved the design (store-first probeS), promoted
# to the App target: the app's Debug build runs each scenario's steps from launch arguments (FPHost StoreProbe), and
# tests/tools/native-store.py reads WebKit's and the store's SQLite files and decides.
#
#   ./tests/native-store.sh                  # build as build 60, run every scenario on iOS 26.x and on 27.0
#   ./tests/native-store.sh --os 27          # one runtime (26 or 27)
#   ./tests/native-store.sh --phone <udid>   # one simulator
#   ./tests/native-store.sh --no-build       # reuse the last build
#   ./tests/native-store.sh --downgrade      # also build build 59 at its own commit and run the 59 <-> 60 drill
#   ./tests/native-store.sh --only race,wiped --sweep 30 --burst-chars 4000
#
# Scenarios: fresh install; migration (from build 59 with --downgrade, else from a facade-less launch); a write while
# the web view is out of the window; background and back (checkpoint); a WebContent kill; a launch without the facade,
# then adopt; WebKit unreadable; a checkpoint and snapshots racing page writes; the policy file (facade "off" at the
# next document start, a bad file changes nothing); the store breaker; a planted crash marker; no flag without a
# verified KTUIProxy; a scene disconnect and reconnect; an OTA page staged, served and confirmed; WebKit wiped and Put
# back; the SIGKILL sweep (24 kills 0-50 ms after a 100-write burst, then, when WebKit lost nothing in them, more kills
# after a bigger burst until it loses something, so the would-repair path is shown every run); the 59 <-> 60 drill
# (Reset programme with its Clear chat, Start new programme, a sparse restore, an iCloud-copy restore). Plus, over every
# launch: facade boot under 50 ms, CapacitorHttp still patched, never an alert.
#
# The simulators are named by UDID (never "booted"); the default for each runtime is the phone of its first paired
# iPhone + Watch, as test-native.sh picks it. Each run reinstalls the app on that phone (its data container is
# replaced; the app is left installed with the scenario seed). Only one agent uses the simulators at a time.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO=$PWD

BUILD=/tmp/supero-store-build
BUILD59=/tmp/supero-build59
OUT=screenshots/out/native-store
OSES="26 27"; PHONE=""; DO_BUILD=1; DOWNGRADE=0; ONLY=""; SWEEP=24; BURST=4000
while [ $# -gt 0 ]; do
  case "$1" in
    --os) OSES="$2"; shift 2 ;;
    --phone) PHONE="$2"; shift 2 ;;
    --no-build) DO_BUILD=0; shift ;;
    --downgrade) DOWNGRADE=1; shift ;;
    --only) ONLY="$2"; shift 2 ;;
    --sweep) SWEEP="$2"; shift 2 ;;
    --burst-chars) BURST="$2"; shift 2 ;;
    *) echo "unknown option $1"; exit 2 ;;
  esac
done
mkdir -p "$OUT"

# The shell under test is build 60 (FPStore writes minReader 60 into a new store, so a lower build number refuses its
# own store on the next launch): the project's number when it is 60 or more, else 60 for this build only.
PROJ=$(grep -m1 'CURRENT_PROJECT_VERSION = ' ios/App/App.xcodeproj/project.pbxproj | sed 's/[^0-9]//g')
SHELL_BUILD=$(( PROJ >= 60 ? PROJ : 60 ))
APP="$BUILD/Build/Products/Debug-iphonesimulator/App.app"
APP59="$BUILD59/Build/Products/Debug-iphonesimulator/App.app"

xbuild(){  # xbuild <ios/App dir> <derived data> [settings...]: fails loudly, keeps the whole log beside the products
  local dir="$1" dd="$2"; shift 2
  mkdir -p "$dd"
  if ( cd "$dir" && xcodebuild -project App.xcodeproj -scheme App -configuration Debug \
        -destination 'generic/platform=iOS Simulator' -derivedDataPath "$dd" build CODE_SIGNING_ALLOWED=NO "$@" ) \
        >"$dd/build.log" 2>&1 && grep -q '\*\* BUILD SUCCEEDED \*\*' "$dd/build.log"; then
    echo "   build succeeded ($dd/build.log)"
  else
    grep -E 'error:|BUILD FAILED' "$dd/build.log" | head -20
    echo "FAIL: the build failed (whole log: $dd/build.log)"; exit 1
  fi
}

if [ "$DO_BUILD" = 1 ]; then
  echo "── Refreshing www/ and building the App scheme as build $SHELL_BUILD (Debug, simulator)"
  npm run --silent build:web
  npx cap copy ios >/dev/null
  xbuild ios/App "$BUILD" CURRENT_PROJECT_VERSION="$SHELL_BUILD"
fi
[ -d "$APP" ] || { echo "FAIL: $APP missing (run without --no-build)"; exit 1; }
plutil -p "$APP/Info.plist" | grep -q 'UISceneDelegateClassName' || { echo "FAIL: the built app has no UISceneDelegateClassName"; exit 1; }

if [ "$DOWNGRADE" = 1 ]; then
  # Build 59 at the commit that set CURRENT_PROJECT_VERSION to 59, with one Debug-only hook added to its
  # AppDelegate (never part of any archive): it runs a drill file's JavaScript in the page once it has painted, the
  # way an owner's taps would. The page, the storage and the shell are otherwise build 59's.
  C59=$(git log --format=%H -S'CURRENT_PROJECT_VERSION = 59;' -- ios/App/App.xcodeproj/project.pbxproj | tail -1)
  [ -n "$C59" ] || { echo "FAIL: no commit sets CURRENT_PROJECT_VERSION = 59"; exit 1; }
  SRC59="$BUILD59/src"
  if [ ! -d "$APP59" ] || [ "$(cat "$BUILD59/commit" 2>/dev/null)" != "$C59" ]; then
    echo "── Building build 59 at ${C59:0:7} (simulator, Debug)"
    rm -rf "$SRC59"; mkdir -p "$SRC59"
    git archive "$C59" | tar -x -C "$SRC59"
    ln -s "$REPO/node_modules" "$SRC59/node_modules"
    python3 - "$SRC59/ios/App/App/AppDelegate.swift" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
s = s.replace('import UIKit\n', 'import UIKit\nimport WebKit\n', 1)
anchor = '        bridge?.registerPluginInstance(TrovoIconPlugin())\n'
assert anchor in s, 'anchor not found'
s = s.replace(anchor, anchor + '        #if DEBUG\n        FPDrill59.attach(self)\n        #endif\n', 1)
s += r'''

#if DEBUG
// tests/native-store.sh --downgrade only: `-fpDrill <file>` runs Documents/fp-probe/<file> (an async function body)
// in the page once it has painted, logs the JSON result to Documents/fp-probe/drill59.jsonl, and keeps the page's
// own update check offline so the drill runs on this build's bundled page.
enum FPDrill59 {
    static func attach(_ vc: CAPBridgeViewController) {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-fpDrill"), i + 1 < args.count, let wv = vc.webView else { return }
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("fp-probe")
        let src = (try? String(contentsOf: dir.appendingPathComponent(args[i + 1]), encoding: .utf8)) ?? "return {error: 'no drill file'};"
        let offline = "(function(){var f=window.fetch;window.fetch=function(u){var s=String((u&&u.url)||u);if(s.indexOf('https://drizzy603.github.io/')===0)return Promise.reject(new Error('offline'));return f.apply(this,arguments);};})();"
        wv.configuration.userContentController.addUserScript(WKUserScript(source: offline, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        func log(_ line: String) {
            let url = dir.appendingPathComponent("drill59.jsonl")
            if !FileManager.default.fileExists(atPath: url.path) { FileManager.default.createFile(atPath: url.path, contents: nil) }
            if let h = try? FileHandle(forWritingTo: url) { h.seekToEndOfFile(); h.write((line + "\n").data(using: .utf8)!); try? h.close() }
        }
        func attempt(_ n: Int) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                let ready = "typeof lsSet === 'function' && !!document.getElementById('screen') && !!document.getElementById('screen').firstElementChild"
                vc.webView?.evaluateJavaScript(ready) { r, _ in
                    guard (r as? Bool) == true else {
                        if n < 40 { attempt(n + 1) } else { log("{\"ev\":\"done\",\"error\":\"page never painted\"}") }
                        return
                    }
                    let body = "var __r = await (async function(){ " + src + "\n})(); return JSON.stringify(__r === undefined ? null : __r);"
                    vc.webView?.callAsyncJavaScript(body, arguments: [:], in: nil, in: .page) { res in
                        switch res {
                        case .success(let v): log("{\"ev\":\"drill\",\"result\":" + ((v as? String) ?? "null") + "}")
                        case .failure(let e): log("{\"ev\":\"drill\",\"result\":{\"error\":" + String(reflecting: "\(e)") + "}}")
                        }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { log("{\"ev\":\"done\"}") }
                    }
                }
            }
        }
        attempt(0)
    }
}
#endif
'''
open(p, 'w').write(s)
PY
    ( cd "$SRC59" && npm run --silent build:web && npx cap copy ios >/dev/null )
    xbuild "$SRC59/ios/App" "$BUILD59"
    echo "$C59" > "$BUILD59/commit"
  fi
  [ -d "$APP59" ] || { echo "FAIL: build 59 missing at $APP59"; exit 1; }
  echo "── build 59: $(plutil -p "$APP59/Info.plist" | grep CFBundleVersion | tr -d ' ') (${C59:0:7})"
fi

# The phone for a runtime: the first paired iPhone + Watch whose phone runs it (test-native.sh's pick), else the
# first iPhone on it.
phone_for(){  # phone_for <26|27>
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
  local args=(--phone "$1" --app "$APP" --shell "$SHELL_BUILD" --sweep "$SWEEP" --burst-chars "$BURST" --out "$OUT")
  [ "$DOWNGRADE" = 1 ] && args+=(--app59 "$APP59")
  [ -n "$ONLY" ] && args+=(--only "$ONLY")
  python3 tests/tools/native-store.py "${args[@]}" || RC=1
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
[ "$RC" = 0 ] && echo "native-store: all scenarios passed" || echo "native-store: FAILED (see FAIL lines above)"
exit $RC
