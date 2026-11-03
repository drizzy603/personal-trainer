#!/usr/bin/env python3
"""The iPhone the fpkit-ios tests run on (ios-build.yml).

An iPhone 17 Pro, the model of every local FPKit run, on the iOS runtime a part names: MAJOR.MINOR (the matrix's `ios`)
takes that release's newest patch (26.4 takes 26.4.1) and never a newer release, so CI runs the runtime the Mac's gates
run; MAJOR alone takes the newest MAJOR.x. Either way the selected Xcode's iOS Simulator SDK must cover the runtime and
the runtime must run the model; the device is made with simctl when that runtime has none named after the model. Never
another model: an image's devices change with every Xcode, and a runtime can come with a new kind alone (on the
xcode-27 image of 2026-10-26, iOS 27.0 has no iPhone 17 Pro and iOS 27.1 only an iPhone Duo), whose screen the tests
were never written against.

Prints `udid=<udid>` and `name=<model>, iOS <version> (<build>)` on stdout, the step's outputs and nothing else; what it
chose, any newer runtime of that major it left out and any it passed over go to stderr.

Usage: fpkit-sim.py RUNTIME [MODEL]   RUNTIME: MAJOR.MINOR (27.0) or MAJOR (27)
  FPKIT_SIM_JSON=<file>   read `xcrun simctl list --json` from <file> and make nothing (the simctl line it would run goes
                          to stderr, the udid is `new`): a dry run against a saved listing, FPKIT_SIM_SDK=<version> the SDK's.
Exit 0 = chosen; 1 = no such runtime, model or SDK here (a GitHub error annotation on stdout); 2 = a usage error.
Its own test: .github/scripts/fpkit-sim-test.sh.
"""
import json
import os
import re
import subprocess
import sys


def die(msg, code=1):
    print("::error title=fpkit-ios simulator::" + msg)
    sys.exit(code)


def ver(s):
    return tuple(int(p) for p in s.split("."))


def main():
    if len(sys.argv) not in (2, 3) or not re.fullmatch(r"[0-9]+(\.[0-9]+)?", sys.argv[1]):
        die("usage: fpkit-sim.py RUNTIME [MODEL]  (RUNTIME: MAJOR.MINOR, as 27.0, or MAJOR)", 2)
    want = ver(sys.argv[1])
    model = sys.argv[2] if len(sys.argv) == 3 else "iPhone 17 Pro"
    source = os.environ.get("FPKIT_SIM_JSON")
    if source:
        with open(source) as f:
            data = json.load(f)
        sdk = os.environ.get("FPKIT_SIM_SDK", "")
    else:
        data = json.loads(subprocess.check_output(["xcrun", "simctl", "list", "--json"]))
        sdk = subprocess.check_output(["xcrun", "--sdk", "iphonesimulator", "--show-sdk-version"], text=True).strip()
    if not sdk:
        die("no iOS Simulator SDK version")

    types = {t["name"]: t["identifier"] for t in data.get("devicetypes", [])}
    if model not in types:
        die("this Xcode has no %s device type" % model)
    type_id = types[model]

    # The release asked for (any patch of MAJOR.MINOR; any MAJOR.x for MAJOR), one the SDK covers: its major.minor at or
    # below the SDK's (26.4.1 runs under SDK 26.4).
    asked = sys.argv[1] if len(want) == 2 else "%d.x" % want[0]
    runtimes, newer = [], []
    for r in data.get("runtimes", []):
        if ".iOS-" not in r.get("identifier", "") or not r.get("isAvailable", False):
            continue
        v = ver(r["version"])
        if v[:len(want)] == want and v[:2] <= ver(sdk)[:2]:
            runtimes.append((v, r))
        elif v[0] == want[0] and v[:2] > want[:2]:
            newer.append(r["version"])
    if not runtimes:
        have = sorted(r["version"] for r in data.get("runtimes", []) if ".iOS-" in r.get("identifier", ""))
        die("no available iOS %s runtime at or below the SDK's %s (iOS runtimes here: %s)"
            % (asked, sdk, ", ".join(have) or "none"))
    runtimes.sort(key=lambda vr: vr[0], reverse=True)
    for n in sorted(newer, key=ver):
        print("left out iOS %s: the part names iOS %s" % (n, asked), file=sys.stderr)

    # The newest that runs the model (a runtime that lists no device types is taken at its word).
    runtime, passed = None, []
    for v, r in runtimes:
        supported = [t["identifier"] for t in r.get("supportedDeviceTypes", [])]
        if not supported or type_id in supported:
            runtime = r
            break
        passed.append(r["version"])
    if runtime is None:
        die("no iOS %s runtime here runs the %s (%s)" % (asked, model, ", ".join(passed)))
    for p in passed:
        print("passed over iOS %s: it does not run the %s" % (p, model), file=sys.stderr)

    # Only a device named after the model, as an image makes them: a renamed one belongs to someone (on a Mac, another
    # task's simulator) and is never borrowed.
    devices = [d for d in data.get("devices", {}).get(runtime["identifier"], [])
               if d.get("isAvailable", True) and d.get("deviceTypeIdentifier") == type_id and d.get("name") == model]
    devices.sort(key=lambda d: d["udid"])
    if devices:
        udid, how = devices[0]["udid"], "found here"
    else:
        cmd = ["xcrun", "simctl", "create", model, type_id, runtime["identifier"]]
        if source:
            print("would run: %s" % " ".join(cmd), file=sys.stderr)
            udid = "new"
        else:
            udid = subprocess.check_output(cmd, text=True).strip()
        how = "made here"
    name = "%s, iOS %s (%s)" % (model, runtime["version"], runtime.get("buildversion", "?"))
    print("simulator: %s, %s, SDK %s" % (name, how, sdk), file=sys.stderr)
    print("udid=" + udid)
    print("name=" + name)


main()
