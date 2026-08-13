#!/usr/bin/env python3
# Regenerate the App Store screenshots (1320x2868 · iPhone 17 Pro Max).
# Fresh app container -> inject store-seed.json into the WKWebView's
# localstorage sqlite (UTF-16LE ItemTable) -> drive each screen via the
# kt_dev_nav boot hook -> capture into screenshots/out/.
#
# One-time prep, from the repo root:
#   npm run build:web && npx cap copy ios
#   xcodebuild build -project ios/App/App.xcodeproj -scheme App \
#     -configuration Debug -destination 'generic/platform=iOS Simulator' \
#     -derivedDataPath /tmp/supero-dd
#   node screenshots/make-seed.js
# Then:
#   python3 screenshots/shoot.py              # all ten
#   python3 screenshots/shoot.py log coach    # just these
#
# Gotchas baked in (learned the hard way):
#   - `simctl io screenshot` may not be allowed to write into the repo dir
#     (sandboxed shells) — capture to a temp dir, then copy.
#   - kt_cached_html/kt_cached_build/kt_last_seen_build are deleted at seed
#     time so the OTA swap can't race the kt_dev_nav hook.
#   - make-seed.js forces "today" to a Pull day; shoot the set the same day
#     the seed was generated or the hero shot won't say "pull day."
import json, sqlite3, subprocess, sys, time, glob, os, tempfile, shutil

DEVICE_NAME = "iPhone 17 Pro Max"   # 6.9" — ASC wants 1320x2868
BUNDLE = "app.kt.trainer"
APP = "/tmp/supero-dd/Build/Products/Debug-iphonesimulator/App.app"
HERE = os.path.dirname(os.path.abspath(__file__))
SEED = os.path.join(HERE, "out", "store-seed.json")
OUT = os.environ.get("SUPERO_SHOT_OUT", os.path.join(HERE, "out"))

SHOTS = [
    ("log",          "log/workout"),
    ("log-run",      "log/run"),
    ("log-body",     "log/body"),
    ("log-sport",    "log/sport"),
    ("progress",     "progress"),
    ("coach",        "coach/chat"),
    ("settings",     "settings"),
    ("programme",    "modal/programme"),
    ("how-it-works", "overlay/how"),
    ("privacy",      "overlay/privacy"),
]

def run(*args, check=True):
    r = subprocess.run(args, capture_output=True, text=True)
    if check and r.returncode != 0:
        sys.exit(f"FAIL {' '.join(args)}\n{r.stdout}\n{r.stderr}")
    return r

def find_udid():
    r = run("xcrun", "simctl", "list", "devices", "available", "-j")
    for devs in json.loads(r.stdout)["devices"].values():
        for d in devs:
            if d["name"] == DEVICE_NAME:
                return d["udid"]
    sys.exit(f"no available simulator named {DEVICE_NAME}")

def db_path(udid):
    r = run("xcrun", "simctl", "get_app_container", udid, BUNDLE, "data")
    base = r.stdout.strip()
    for pat in (
        base + "/Library/WebKit/WebsiteData/Default/*/*/LocalStorage/localstorage.sqlite3",
        base + "/Library/WebKit/" + BUNDLE + "/WebsiteData/Default/*/*/LocalStorage/localstorage.sqlite3",
    ):
        hits = glob.glob(pat)
        if hits:
            return hits[0]
    return None

def put(db, key, value):
    db.execute("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)",
               (key, value.encode("utf-16-le")))

def main():
    picks = sys.argv[1:]
    shots = [s for s in SHOTS if not picks or s[0] in picks]
    if not shots:
        sys.exit(f"no matching shots in {picks} — names: {[s[0] for s in SHOTS]}")
    if not os.path.isfile(SEED):
        sys.exit("no store-seed.json — run `node screenshots/make-seed.js` first")
    if not os.path.isdir(APP):
        sys.exit(f"no built app at {APP} — see the prep steps in this file's header")
    seed = json.load(open(SEED))
    udid = find_udid()
    run("xcrun", "simctl", "bootstatus", udid, "-b")
    run("xcrun", "simctl", "terminate", udid, BUNDLE, check=False)
    run("xcrun", "simctl", "uninstall", udid, BUNDLE, check=False)
    run("xcrun", "simctl", "privacy", udid, "reset", "all", BUNDLE, check=False)
    run("xcrun", "simctl", "status_bar", udid, "override",
        "--time", "9:41", "--batteryState", "charged", "--batteryLevel", "100",
        "--wifiBars", "3", "--cellularBars", "4")
    run("xcrun", "simctl", "install", udid, APP)
    # First launch creates the localstorage db, then we take over.
    run("xcrun", "simctl", "launch", udid, BUNDLE)
    time.sleep(6)
    run("xcrun", "simctl", "terminate", udid, BUNDLE, check=False)
    time.sleep(1)
    path = db_path(udid)
    if not path or not os.path.getsize(path):
        sys.exit("no localstorage db found after first launch")
    con = sqlite3.connect(path)
    for k, v in seed.items():
        put(con, k, v)
    for stale in ("kt_cached_html", "kt_cached_build", "kt_last_seen_build"):
        con.execute("DELETE FROM ItemTable WHERE key=?", (stale,))
    con.commit(); con.close()
    os.makedirs(OUT, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="supero-shots-")
    for name, route in shots:
        con = sqlite3.connect(path)
        put(con, "kt_dev_nav", route)
        con.commit(); con.close()
        run("xcrun", "simctl", "launch", udid, BUNDLE)
        time.sleep(5)
        cap = os.path.join(tmp, name + ".png")
        run("xcrun", "simctl", "io", udid, "screenshot", cap)
        shutil.copyfile(cap, os.path.join(OUT, name + ".png"))
        print("shot:", name)
        run("xcrun", "simctl", "terminate", udid, BUNDLE, check=False)
        time.sleep(1)
    run("xcrun", "simctl", "status_bar", udid, "clear")
    shutil.rmtree(tmp, ignore_errors=True)
    print(f"DONE — {len(shots)} PNG(s) in {OUT}. Eyeball every one before uploading.")

if __name__ == "__main__":
    main()
