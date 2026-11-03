#!/bin/bash
# Checks fpkit-sim.py's choice by dry runs (FPKIT_SIM_JSON, FPKIT_SIM_SDK) on listings shaped as `xcrun simctl list
# --json` prints them: the runtimes and devices of GitHub's two images as their readmes of 2026-10-26 list them (xcode-27:
# iOS 27.0 and 27.1, no iPhone 17 Pro made; macos-26: iOS 26.2, 26.4.1 and 26.5), with build numbers and udids made up,
# and the slips around them. Exit 0 = every check passed, 1 = one failed.
# Usage: bash .github/scripts/fpkit-sim-test.sh [SCRIPT]   (SCRIPT: the fpkit-sim.py to check, the one beside this file
#                                                           by default)
here=$(cd "$(dirname "$0")" && pwd)
script=${1:-$here/fpkit-sim.py}
tmp=$(mktemp -d) || exit 2
trap 'rm -rf "$tmp"' EXIT
checks=0
failures=0
P17=com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro
RT=com.apple.CoreSimulator.SimRuntime

python3 - "$tmp" <<'EOF' || exit 2
import json, sys
d = sys.argv[1]
P17 = "com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro"
DUO = "com.apple.CoreSimulator.SimDeviceType.iPhone-Duo"
P18 = "com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro"
ALL = [(P17, "iPhone 17 Pro"), (DUO, "iPhone Duo"), (P18, "iPhone 18 Pro")]
TYPES = [{"name": n, "identifier": t, "productFamily": "iPhone"} for t, n in ALL]

def rt(os_, version, build, supports, available=True):
    return {"identifier": "com.apple.CoreSimulator.SimRuntime.%s-%s" % (os_, version.replace(".", "-")),
            "name": "%s %s" % (os_, version), "version": version, "buildversion": build, "isAvailable": available,
            "supportedDeviceTypes": [{"identifier": t, "name": n} for t, n in supports]}

def dev(name, udid, t):
    return {"name": name, "udid": udid, "deviceTypeIdentifier": t, "isAvailable": True, "state": "Shutdown"}

listings = {
    # xcode-27: no iPhone 17 Pro made on either runtime, an iPhone Duo alone on 27.1.
    "x27": {"devicetypes": TYPES,
            "runtimes": [rt("iOS", "27.0", "24A434", ALL), rt("iOS", "27.1", "24B83", ALL),
                         rt("watchOS", "27.0", "24R362", [])],
            "devices": {"com.apple.CoreSimulator.SimRuntime.iOS-27-0": [dev("iPhone 18 Pro", "27-0-P18", P18)],
                        "com.apple.CoreSimulator.SimRuntime.iOS-27-1": [dev("iPhone Duo", "27-1-DUO", DUO)]}},
    # macos-26: an iPhone 17 Pro the image made on 26.5, beside a renamed one (someone's, never borrowed) that sorts
    # first; on 26.4.1 a renamed one alone.
    "m26": {"devicetypes": TYPES,
            "runtimes": [rt("iOS", "26.2", "23C54", ALL), rt("iOS", "26.4.1", "23E254a", ALL),
                         rt("iOS", "26.5", "23F77", ALL)],
            "devices": {"com.apple.CoreSimulator.SimRuntime.iOS-26-5": [dev("FP-ci26-ci-265", "0000-MINE", P17),
                                                                       dev("iPhone 17 Pro", "26-5-P17", P17)],
                        "com.apple.CoreSimulator.SimRuntime.iOS-26-4-1": [dev("FP-someone-264", "0000-THEIRS", P17)]}},
    # A named runtime that does not run the model, and one that is not available.
    "odd": {"devicetypes": TYPES,
            "runtimes": [rt("iOS", "27.0", "24A434", [(DUO, "iPhone Duo")]), rt("iOS", "27.1", "24B83", ALL, False)],
            "devices": {}},
}
for name, data in listings.items():
    with open("%s/%s.json" % (d, name), "w") as f:
        json.dump(data, f)
EOF

# sim LISTING SDK ARGS...: a dry run of the script; sets out (stdout), err (stderr) and code.
sim() {
  local listing=$1 sdk=$2
  shift 2
  out=$(FPKIT_SIM_JSON="$tmp/$listing.json" FPKIT_SIM_SDK="$sdk" python3 "$script" "$@" 2> "$tmp/err")
  code=$?
  err=$(cat "$tmp/err")
}

ok() { checks=$((checks + 1)); }
bad() { checks=$((checks + 1)); failures=$((failures + 1)); echo "FAIL: $1"; }

# chose WHAT UDID NAME: the run picked that simulator (exit 0, the two output lines exactly).
chose() {
  if [ "$code" = 0 ] && [ "$out" = "$(printf 'udid=%s\nname=%s' "$2" "$3")" ]; then ok; else
    bad "$1: exit $code, out [$(printf '%s' "$out" | tr '\n' '|')], wanted udid=$2 name=$3 (err: $(printf '%s' "$err" | tr '\n' '|'))"
  fi
}
# refused WHAT CODE TEXT: the run exited CODE with TEXT in its annotation.
refused() {
  if [ "$code" = "$2" ] && printf '%s\n' "$out" | grep -qF -- "::error title=fpkit-ios simulator::$3"; then ok; else
    bad "$1: exit $code, out [$(printf '%s' "$out" | tr '\n' '|')], wanted exit $2 and '$3'"
  fi
}
# said WHAT TEXT / unsaid WHAT TEXT: the last run's stderr holds TEXT / does not.
said() { printf '%s\n' "$err" | grep -qF -- "$2" && ok || bad "$1: no '$2' in stderr [$(printf '%s' "$err" | tr '\n' '|')]"; }
unsaid() { printf '%s\n' "$err" | grep -qF -- "$2" && bad "$1: '$2' in stderr" || ok; }

# The iOS 27 parts name 27.0: never 27.1, though the image has it and it runs the model.
sim x27 27.1 27.0
chose "27.0 on xcode-27" new "iPhone 17 Pro, iOS 27.0 (24A434)"
said "27.0 on xcode-27 makes its iPhone 17 Pro" "would run: xcrun simctl create iPhone 17 Pro $P17 $RT.iOS-27-0"
said "27.0 on xcode-27 names the runtime it left out" "left out iOS 27.1: the part names iOS 27.0"
sim x27 27.1 27.1
chose "27.1 on xcode-27" new "iPhone 17 Pro, iOS 27.1 (24B83)"
unsaid "27.1 on xcode-27 leaves nothing out" "left out"
sim x27 27.1 27
chose "27 (any 27.x) on xcode-27 takes the newest" new "iPhone 17 Pro, iOS 27.1 (24B83)"
sim x27 27.1 27.2
refused "27.2, newer than the SDK" 1 "no available iOS 27.2 runtime at or below the SDK's 27.1"
sim x27 26.5 27.0
refused "27.0 under SDK 26.5" 1 "no available iOS 27.0 runtime at or below the SDK's 26.5"
sim x27 27.1 26.5
refused "26.5 on xcode-27" 1 "no available iOS 26.5 runtime at or below the SDK's 27.1"

# The iOS 26 parts name 26.5: the image's own iPhone 17 Pro, never a renamed one.
sim m26 26.5 26.5
chose "26.5 on macos-26" 26-5-P17 "iPhone 17 Pro, iOS 26.5 (23F77)"
said "26.5 on macos-26 found its device" "found here"
sim m26 26.5 26.4
chose "26.4 takes 26.4.1 and borrows no renamed device" new "iPhone 17 Pro, iOS 26.4.1 (23E254a)"
said "26.4 makes its own iPhone 17 Pro" "would run: xcrun simctl create iPhone 17 Pro $P17 $RT.iOS-26-4-1"
said "26.4 names the runtime it left out" "left out iOS 26.5: the part names iOS 26.4"
sim m26 26.5 26
chose "26 (any 26.x) on macos-26 takes the newest" 26-5-P17 "iPhone 17 Pro, iOS 26.5 (23F77)"
sim m26 26.4 26.5
refused "26.5 under SDK 26.4" 1 "no available iOS 26.5 runtime at or below the SDK's 26.4"
sim m26 26.5 26.3
refused "26.3, which the image lacks" 1 "no available iOS 26.3 runtime"

# A named runtime that does not run the model, or is not available, is never swapped for another.
sim odd 27.1 27.0
refused "27.0 without the model" 1 "no iOS 27.0 runtime here runs the iPhone 17 Pro (27.0)"
sim odd 27.1 27.1
refused "27.1 not available" 1 "no available iOS 27.1 runtime"
sim x27 27.1 27.0 "iPhone 16"
refused "a model this Xcode lacks" 1 "this Xcode has no iPhone 16 device type"

# Usage errors.
sim x27 27.1
refused "no runtime" 2 "usage: fpkit-sim.py RUNTIME [MODEL]"
for a in 27.0.1 27. .0 x 27,0 "27.0 "; do
  sim x27 27.1 "$a"
  refused "runtime '$a'" 2 "usage: fpkit-sim.py RUNTIME [MODEL]"
done

echo "fpkit-sim-test: $checks checks, $failures failed"
[ "$failures" -eq 0 ]
