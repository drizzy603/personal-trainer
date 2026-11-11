#!/usr/bin/env python3
"""The live native Coach in the real app (plan tasks C7 and T21), the coach half of test-native.sh.

test-native.sh builds and installs the app (Debug, as build 61 at least, through tests/tools/fp-build.sh into
~/Library/Caches/FPKit/<checkout>/dd-native, holding the paired simulators' sim.lock) and calls this on the phone of the
paired iPhone + Watch. Every scenario drives the real index.html in the real Capacitor shell through the app's own
launch arguments (FPUI's ShellProbe, Debug builds only: `-fpShellProbe <steps>`, `-devNav <route>`, `-devTheme <room>`,
`-fpApiBase`); the app acts and reports, this decides, and every screen worth a look is shot by name into --out.

  native-chat.py --phone UDID --out DIR [--shell 61] [--root tabs|classic] [--only keys,live,connect,combos,...]
  native-chat.py --self-test

Two roots (plan T21, as native-shell.py's T16). `--root tabs` (the default) launches as test-native.sh's routes do,
`-fpOffline` alone (the compiled policy: every piece on), so an iOS 26+ phone builds the tab root: the native tab bar,
the native Coach tab's hub, and the chat pushed on the Coach tab's stack (ScreenHost's `host: stack`). `--root classic`
writes the policy offs (plan 13-tests-release.md section 6: coachHome and tabs off) into the app's container as
fp-policy-offs.json and adds `-fpPolicyFile fp-policy-offs.json -fpPolicyEvery 0` to every launch: build 60's look on
61's binary, the page's own tab bar and the chat presented over the page (.overFullScreen), the only root where that
style is asserted. An iOS 17 or 18 phone builds the classic root either way. The run keeps the container test-native.sh
installed over: prepare checks the root its launches build, and a tab pass that finds the classic one (a decline, a
crash verdict, a breaker's trip, the bar's switch off: plan delta 16.7) turns it back on through TrovoShell (About's Try
again: reset tabs, coachHome and coach, the bar's switch on) and launches again. The shell's folder (Application
Support/FPShell) and its UserDefaults copies (the policy fetch's too: a launch with -fpPolicyFile rewrites fp.policy)
are kept before the first launch and put back after the last, as probe-selftest.py does (its helpers), with the offs
file a classic pass wrote. The copies are read and written through the simulator's cfprefsd (`defaults` spawned with
the app's container as its home), which is never stopped: after a stop the phone's appearance no longer reaches apps
until SpringBoard starts again, so `combos` would run its "phone dark" half on a light phone (it did, until T21's
review). Ctrl-C or a SIGTERM ends the scenarios where they are: restore and the put-back still run (exit 143 after a
SIGTERM).

Scenarios, in this order (prepare and restore always run; --only picks among the others):
  prepare  what the container holds, kept to put back at the end (every localStorage value but the key's, which is never
           read: only whether there is one, and whether it is the probe's); the probe's key when there is none, a
           starter programme when there is none, the native chat's device switch on, the native composer empty; then
           the root the run's launches build
  smoke    a -fpSmoke launch logs "fp: ping ok v1" (that launch's process); the link negotiated the root's pieces (the
           chat alone on the classic root; the chat, the Coach tab and the tab bar on the tab root)
  keys     the keyboard sequences a simulator can drive (its software keyboard on for them, the phone at Large): the
           native composer takes the keys and sits above them; typed words reach the composer's store; Back with the
           keys up takes them down with the chat (on the tab root it is a pop to the hub), none come back and nothing
           scrolled; the words are still in the composer when the chat opens again and after a relaunch
           (fpDraft.coach); a web field's keys go down when the chat covers it (on the tab root: when the Coach tab is
           selected), and the page's own dismiss with the native keys up leaves no keyboard; the page's pending photo
           (a square drawn in the page, as a share leaves one) reaches the native composer, and its preview, measured
           in the shots, is at most 140 pt tall with the keys down and at most 96 pt with them up (N5's cap, the web's
           kb-open rule for .coach-img-preview)
  live     a real coach turn on a stand-in for the Messages API (tests/tools/coach-stub.py on this Mac's loopback,
           -fpApiBase): a question typed in the native composer and sent with its Send shows at once (the echo) and
           gives way to the page's message, Thinking while the stand-in takes its time; its tool call changes the
           programme, the reply shows its words, a tool pill and PLAN CHANGES with Undo and Keep changes; Undo asks (the
           page's confirm, forwarded), restores the previous programme and the card goes; a second turn's Keep changes
           keeps the change and the card goes; Send while scrolled up to the top brings the conversation to its end, as
           the web chat's Send does; Stop while scrolled up too; a reader who scrolls up while a reply is on its way
           keeps their place when it lands; a third leaves its card for the shots. Through the turn the chat stays
           where the root puts it (the tab root: pushed on the Coach stack, Coach selected, the bar visible). Presses go
           through the controls' own accessibility actions (the probe turns the runtime on), so Send, Undo, Restore and
           Keep are the buttons'
  connect  (the tab root's native connect screen) the key taken out inside the page (prepare kept whether there was
           one; restore puts it back), the connect screen shot in Heavyweight, an invalid key typed into its field and
           CONNECT pressed: the page refuses it (coachHome.setKey refused invalid) with its toast, forwarded; then the
           connect screen shot in Lime, the probe's key typed and CONNECT pressed on the stand-in: the page saves it,
           says so, its key check goes to the stand-in and comes back verified, and the Coach tab shows the hub. Both
           screens draw their room's ground; neither key's text is in any probe log of the two launches (contract 5
           K4). A phone holding a key that is not the probe's fails this scenario and nothing is touched
  combos   each room x the phone's appearance (simctl ui appearance light|dark) x its text size (simctl ui content_size
           large|extra-extra-large), on the live turns, three launches by route: coach/chat (the chat native, pushed
           on the NATIVE Coach stack, Coach selected, the bar visible; drawn in its room whatever the phone says; at the
           phone's text size), coach (the native hub at the stack's root, its ground drawn in its room) and log/workout
           (a web tab under the glass bar, the page in its room); on each the bar asks for the room's look, and over
           the chat and the hub, where the room's own ground lies under the glass, it draws it (the mean luminance of
           its frame in the shot: Lime dark, Heavyweight light; over a web tab the glass shows the page's own cards
           through it, so the look asked is what is checked there). On the classic root:
           coach/chat presented .overFullScreen, coach and log/workout the page's own under its own tab bar. Every
           launch proves the phone's appearance from the app (the page's prefers-color-scheme against the combo's:
           simctl reads its own setting back even on a phone whose apps never get it). Where the page itself is on
           screen (log/workout on either root, coach on the classic one) its shot draws no band behind the status
           bar: down the bar's height the page's side margin reads as it does just under it (from iOS 27.0 UIKit's
           top scroll edge effect drew the web view's paper there on a dark phone, a grey haze over Lime, until
           ShellWebView hid it). Shots coach-chat-*, coach-home-*, tabs-log-*; the phone's settings go back
  textoff  the phone at extra-extra-large and the app's Larger Text turned off with the chat up: the empty composer is as
           tall as at Large (the chat is pinned to Large, its field too), and the phone's setting goes back
  restore  what prepare kept goes back (only the values that changed), the key as it was, the composer empty, read back
           in the next launch (never a reload: a page reloaded under the tab root counts as hidden in use)

Aggregates, over every state of every launch: the web view never left its window (leftWindow and leftWindowAny 0) and
the page saw no visibilitychange; on the tab root no fallback (no fellBack event, none in any state); every launch ran
to its end; every shot is on disk, one of its scenario's, and was taken while the app held still at its mark.

Shots: a mark holds the app still until its shot is on disk (native-shell.py's go files: the page waits for the go file
the runner writes once `simctl io screenshot` has returned), so a loaded machine cannot shoot the next step; a shot the
app did not hold still for fails the shots check, but for a transient mark (a toast), which is reported; a shot that
left no file fails it too. Each shot is <label>.png in --out on the tab root, classic-<label>.png on the classic root. A
scenario's older shots of the root are removed before it runs (SHOTS, by name: test-native.sh's route shots share the
folder), so a mark the run never reached leaves no earlier run's PNG to be read as its own.

--self-test (no simulator): the run's own judging on made-up records (a missing, late or misnamed shot, a state that
reports no visibilitychange list, the bar's container unreported, a launch on another phone appearance than its
combo's) and made-up shots (a band behind the status bar, lighter or darker, a shade over the bound and under it; a
shot or a screen width that cannot be read), which shots a scenario clears, the copies' keep and put-back on a stand-in
for the daemon, how a run ends (a scenario that breaks, a SIGTERM), and the app's hash against fp-build.sh's own
pipeline.

Exit 1 when any check fails, 2 on bad arguments, when the paired simulators' lock is not this run's or when the app's
container or preferences cannot be read (nothing run), 143 after a SIGTERM (restore and the put-back ran first).
"""
import argparse
import fnmatch
import glob
import hashlib
import importlib.util
import json
import os
import plistlib
import re
import shutil
import signal
import struct
import subprocess
import sys
import tempfile
import time
import traceback
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, file):
    """A sibling tool as a module, registered under `name` before it runs (importlib's recipe: a file that looks itself
    up in sys.modules, as native-shell.py does, finds itself)."""
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, file))
    mod = importlib.util.module_from_spec(spec)
    sys.modules.setdefault(name, mod)
    spec.loader.exec_module(mod)
    return mod


nsh = _load('native_shell', 'native-shell.py')            # its probe helpers and readers (and native-store.py's Sim, Report)
stubs = _load('coach_stub', 'coach-stub.py')
ps = _load('probe_selftest', 'probe-selftest.py')         # the prepare and restore scripts, the shell's state kept and put back
Sim, Events, read_log, Report = nsh.Sim, nsh.Events, nsh.read_log, nsh.Report
state, js, wait, mark = nsh.state, nsh.js, nsh.wait, nsh.mark
page, shellst, screens, coach = nsh.page, nsh.shellst, nsh.screens, nsh.coach
root, rcoach, rweb, rbar, stack, fp, home = nsh.root, nsh.rcoach, nsh.rweb, nsh.rbar, nsh.stack, nsh.fp, nsh.home
OVER_FULL_SCREEN, LIGHT, DARK = nsh.OVER_FULL_SCREEN, nsh.LIGHT, nsh.DARK
PROBE_KEY = ps.PROBE_KEY                       # 'sk-ant-probe-not-a-key': no real key is ever read
LOOPBACK = ps.LOOPBACK                         # a closed port on this Mac: a launch with no stand-in sends nothing out
BAD_KEY = 'not-an-anthropic-key'               # no sk-ant- prefix: the page's invalid key
KEY_BAD = 'Invalid key — Anthropic keys start with sk-ant-'   # the page's _KEY_BAD toast
KEY_SAVED, KEY_VERIFIED = 'API key saved', 'Key verified ✓'
SIZES = {'large': 'UICTContentSizeCategoryL', 'extra-extra-large': 'UICTContentSizeCategoryXXL'}
ROOMS = {'heavyweight': LIGHT, 'dark': DARK}
LOOK = {'heavyweight': 'light', 'dark': 'dark'}   # the bar's and the Coach tab's look per room


def combo_names():
    """Every combo of `combos`: (room, the room's style, the phone's appearance, its text size, the size's category, the
    tail of its three shots' names)."""
    for room, style in ROOMS.items():
        for appearance in ('light', 'dark'):
            for size, category in SIZES.items():
                yield room, style, appearance, size, category, '%s-%s-%s' % (
                    'lime' if room == 'dark' else room, appearance, 'xxl' if size != 'large' else 'l')


# Each scenario's shots by name (fnmatch patterns; the root's prefix goes in front): its older ones are removed before it
# runs, and every shot it takes must be one of them. test-native.sh's route shots share the folder (coach-chat.png,
# coach-chat-2-dark.png), so the combos' are named whole.
COMBO_SHOTS = ('coach-chat-', 'coach-home-', 'tabs-log-')
SHOTS = {'keys': ('keys-*',), 'live': ('live-*',), 'connect': ('connect-*',), 'textoff': ('textoff-*',),
         'combos': tuple(head + tail for *_x, tail in combo_names() for head in COMBO_SHOTS)}
# N5: the pending photo's tallest, in points at the Large text size (CoachComposer's imageCap: the web's 140 px, 96 under
# kb-open); a square photo is drawn at the cap exactly.
PHOTO_CAP_DOWN, PHOTO_CAP_UP = 140, 96
# The ground of the native Coach tab's screens (the hub, the connect screen) as a shot draws it: a strip down the left
# edge, where no row, card or title reaches (Heavyweight's paper about 245 of 255, Lime's dark ground under 30). The
# bounds are the bar's (native-shell.py's DARK_BAR_MAX, LIGHT_BAR_MIN).
GROUND_X, GROUND_TOP = (2, 12), 140
# The strip behind the status bar where the page itself is on screen (the web tabs; the classic root's Coach home), as a
# shot draws it. From iOS 27.0 UIKit gives a scroll view that reaches under the status bar a top edge effect, and on a
# dark phone the effect replays the scroll view's background over the content through a fading mask: the web view's is
# Capacitor's one paper colour in every room, so Lime drew a grey band behind the clock (the haze of 2026-11-10; the
# shell's web view now hides the effect, ShellWebView). What is read: the page's side margin (STRIP_X points in from
# the left edge: clear of the 4 px mark every simulator shot carries in its corner, and no clock, island or row reaches
# it), slice by slice (STRIP_SLICE points) down STRIP_ROWS, each against the same margin just under the status bar
# (UNDER_ROWS: the band was gone by 57 pt under a 62 pt status bar). Read this way in the shots from before the hide
# (T21's runs: iOS 27.0 on both roots, iOS 26.5 on the tab root; 32 shots of these routes), the 26 without a band
# differ by at most STRIP_CLEAN either way and the 6 of Lime on a dark phone on iOS 27.0 by +101.6; in the
# investigation's frames, Heavyweight on a dark phone under a sheet's scrim +64.1, and a Lime-coloured scroll
# background under Heavyweight, a fix that was tried, -107.1 (STRIP_BANDS). STRIP_MAX is at least ten times the first
# and at most a tenth of the faintest band (the self-test holds it), so a band a shade of those still fails.
STRIP_X, STRIP_ROWS, STRIP_SLICE, UNDER_ROWS = (3, 15), (0, 60), 2, (63, 69)
STRIP_CLEAN, STRIP_BANDS, STRIP_MAX = 0.4, (101.6, 64.1, -107.1), 6
RUNS = [0]


def room_name(room):
    return 'Lime' if room == 'dark' else 'Heavyweight'


# ── the launches ─────────────────────────────────────────────────────────────────────────────────────────────────────

class Ctx:
    def __init__(self, sim, rep, opts, kind, osv):
        self.sim, self.rep, self.opts = sim, rep, opts
        self.root = kind
        self.tabs = kind == 'tabs'
        self.os = osv
        self.prefix = '' if self.tabs else 'classic-'
        self.root_args = list(nsh.OFFS_ARGS) if opts.root == 'classic' else []
        self.snap = None
        self.key_kind = None
        self.scen = 'setup'
        self.states = []      # (scenario, tag, state event) of every launch
        self.launches = []    # (scenario, tag, timed out)
        self.fellbacks = []   # (scenario, tag, why): the tab root's fellBack events
        self.shots = []
        self.logs = {}        # tag -> the probe log's path

    def check(self, scen, name, ok, detail=''):
        return self.rep.check(scen, name, ok, detail)


def shoot(c, e, tag, pdir, meta):
    """A mark's shot, <prefix><label>.png in --out, then its go file (the page's wait lets the app go on once the shot is
    on disk). Its record goes into native-shell.py's pass too, where drawn_bar finds it by launch and label."""
    label = e.get('label')
    name = c.prefix + nsh._slug(label) + '.png'
    path = os.path.join(c.opts.out, name)
    if os.path.exists(path):
        os.remove(path)
    t0 = time.time()
    c.sim.screenshot(path)
    t1 = time.time()
    rec = {'scenario': c.scen, 'tag': tag, 'file': name, 'path': path, 'label': label, 'ms': int((t1 - t0) * 1000),
           'end': int(t1 * 1000), 'ok': os.path.exists(path), 'transient': bool((meta.get(label) or {}).get('transient'))}
    with open(nsh.go_path(pdir, tag, label), 'w') as f:
        f.write('go\n')
    nsh.PASS.shots.append(rec)
    print('  shot: %s' % path, flush=True)
    return rec


def shot_named(c, rec):
    """Whether a shot is one of its scenario's (SHOTS), under this root's prefix."""
    return any(fnmatch.fnmatchcase(rec.get('file') or '', c.prefix + pat + '.png') for pat in SHOTS.get(rec.get('scenario'), ()))


def clear_shots(c, scen):
    """The scenario's older shots of this root in --out, removed before it runs (as native-shell.py's clear_shots): a mark
    the run never reaches then leaves no earlier run's PNG to be read as this run's. Another root's shots, another
    scenario's and test-native.sh's route shots stay. Returns how many went."""
    gone = 0
    for pat in SHOTS.get(scen, ()):
        for p in glob.glob(os.path.join(glob.escape(c.opts.out), c.prefix + pat + '.png')):
            os.remove(p)
            gone += 1
    return gone


def probe(c, name, phases, args=(), timeout=90, until='done'):
    """One launch running `phases` (ShellProbe), offline (the bundled page under test), with -fpIgnoreMarker (the tools end
    the app with simctl terminate, which can land with a native screen up), the root's arguments, and -fpApiBase on a
    closed loopback port unless the launch names its own stand-in. Each mark holds the app until its shot is on disk;
    the time a shot takes is added to `timeout`. Returns the events, with pid, tag and timedOut."""
    sim = c.sim
    RUNS[0] += 1
    tag = 'chat-%02d-%s' % (RUNS[0], name)
    pdir = sim.path('Documents', 'fp-probe')
    os.makedirs(pdir, exist_ok=True)
    for p in glob.glob(os.path.join(pdir, '*.go.*')):   # an earlier run's go files would release a mark at once
        os.remove(p)
    phases, meta = nsh.with_shot_waits(phases, pdir, tag)
    with open(os.path.join(pdir, tag + '.json'), 'w') as f:
        json.dump({'phases': phases}, f)
    logp = os.path.join(pdir, tag + '.jsonl')
    if os.path.exists(logp):
        os.remove(logp)
    args = list(args)
    if '-fpApiBase' not in args:
        args += ['-fpApiBase', LOOPBACK]
    sim.terminate()
    pid = sim.launch(['-fpShellProbe', tag + '.json', '-fpShellProbeLog', tag + '.jsonl', '-fpOffline', '-fpIgnoreMarker',
                      *c.root_args, *args])
    tail, seen, done, recs, met = nsh.LogTail(logp), 0, set(), [], False
    t_end = time.time() + timeout
    while time.time() < t_end:
        time.sleep(0.1)
        ev = tail.read()
        for e in ev[seen:]:
            label = e.get('label')
            if e.get('ev') == 'mark' and label and label not in done:
                done.add(label)
                rec = shoot(c, e, tag, pdir, meta)
                recs.append(rec)
                t_end += rec['ms'] / 1000.0   # the app held still while it was taken
        seen = len(ev)
        if ev.first(until):
            met = True
            break
    ev = tail.read()
    ev.pid, ev.tag, ev.timedOut = pid, tag, not met
    nsh.judge_shots(recs, ev)
    sim.terminate()
    c.shots.extend(recs)
    c.launches.append((c.scen, tag, ev.timedOut))
    c.logs[tag] = logp
    for e in ev.all('state'):
        c.states.append((c.scen, tag, e))
    for e in ev.all('fellBack'):
        c.fellbacks.append((c.scen, tag, e.get('why')))
    if ev.timedOut:
        print('  launch %s timed out (%d events)' % (tag, len(ev)), flush=True)
    return ev


def shot_of(c, tag, label):
    return next((r for r in c.shots if r.get('tag') == tag and r.get('label') == label), None)


def result(ev, label):
    r = (ev.first('js', label=label) or {}).get('result')
    return r if isinstance(r, dict) else {}


def wait_coach(until, ms=8000, label=None):
    return {'op': 'waitCoach', 'until': until, 'ms': ms, 'label': label or until}


def press(label=None, ledger=None, where=None):
    s = {'op': 'press'}
    if label:
        s['label'] = label
    if ledger:
        s['ledger'] = ledger
    if where:
        s['where'] = where
    return s


def store(e):
    return screens(e).get('coach') or {}


def up_list(e):
    return screens(e).get('up') or []


def kb(e):
    return [k.get('ev') for k in (e or {}).get('keyboard') or []]


def kb_up(e):
    return [k for k in (e or {}).get('keyboard') or [] if k.get('ev') in ('willShow', 'didShow') and (k.get('h') or 0) > 0]


def rect(s):
    """'{{x, y}, {w, h}}' -> (x, y, w, h)."""
    try:
        nums = [float(x) for x in s.replace('{', ' ').replace('}', ' ').replace(',', ' ').split()]
        return tuple(nums[:4]) if len(nums) >= 4 else None
    except (AttributeError, ValueError):
        return None


def short(o, keys):
    return {k: (o or {}).get(k) for k in keys}


# ── what a shot draws ────────────────────────────────────────────────────────────────────────────────────────────────

def bmp_px(data):
    """A pixel reader over an uncompressed 24- or 32-bit BMP's bytes (rows top-down or bottom-up, channels by its masks):
    (width, height, rgb(x, y)), or None for a BMP of another kind."""
    if not data or data[:2] != b'BM':
        return None
    off = struct.unpack_from('<I', data, 10)[0]
    w, h, _, bpp, comp = struct.unpack_from('<iiHHI', data, 18)
    if bpp not in (24, 32) or comp not in (0, 3, 6):
        return None
    masks = struct.unpack_from('<III', data, 54) if comp in (3, 6) else (0xff0000, 0xff00, 0xff)
    if not all(masks):
        return None
    chans = [(m, (m & -m).bit_length() - 1) for m in masks]
    rows, top_down = abs(h), h < 0
    bpx, stride = bpp // 8, ((w * bpp + 31) // 32) * 4

    def rgb(x, y):
        p = off + (y if top_down else rows - 1 - y) * stride + x * bpx
        v = int.from_bytes(data[p:p + bpx], 'little')
        return tuple(((v & m) >> sh) * 255 // (m >> sh) for m, sh in chans)
    return w, rows, rgb


def magenta(rgb):
    """The pending photo's colour as a shot draws it (sRGB #ff00ff, or its Display P3 values about 234, 51, 247)."""
    r, g, b = rgb
    return r > 190 and b > 190 and g < 110


def photo_box(path, k):
    """The pending photo (a magenta square) as the shot at `path` draws it, in points (k: the shot's pixels per point):
    the longest run of magenta down the screen's middle column (or 20 pt either side) and across the run's middle row.
    None when no magenta is drawn."""
    data = nsh.png_bmp(path) if path and os.path.isfile(path) else None
    px = bmp_px(data)
    if not px or not k:
        return None
    w, h, rgb = px
    best = (0, 0, 0)
    for x in (w // 2, max(0, w // 2 - int(20 * k)), min(w - 1, w // 2 + int(20 * k))):
        run = start = 0
        for y in range(h):
            if magenta(rgb(x, y)):
                if not run:
                    start = y
                run += 1
                if run > best[0]:
                    best = (run, start, x)
            else:
                run = 0
    n, y0, x = best
    if not n:
        return None
    ym, run, across = y0 + n // 2, 0, 0
    for xx in range(w):
        if magenta(rgb(xx, ym)):
            run += 1
            across = max(across, run)
        else:
            run = 0
    return {'h': round(n / k, 1), 'w': round(across / k, 1), 'top': round(y0 / k, 1), 'px': {'x': x, 'y': y0, 'h': n, 'w': across}}


def window_scale(e, rec):
    """The shot's pixels per point: its width over the window's (the right edge of the web view's frame or the bar's)."""
    fr, wf = rbar(e).get('frame') or {}, rweb(e).get('frame') or {}
    win = max((wf.get('x') or 0) + (wf.get('w') or 0), (fr.get('x') or 0) + (fr.get('w') or 0))
    data = nsh.png_bmp(rec['path']) if rec and rec.get('ok') else None
    if not data or not win:
        return None, None
    pw, _ = nsh.bmp_size(data)
    k = pw / float(win)
    return (k if 1 <= k <= 4 else None), data


def ground(e, rec):
    """The ground a native Coach-tab screen draws (the hub, the connect screen) in the shot `rec`: the mean luminance of a
    strip down the screen's left edge (GROUND_X points in), from GROUND_TOP points down to 12 above the bar. Returns
    (luma, what was read) or (None, why not)."""
    k, data = window_scale(e, rec)
    fr = rbar(e).get('frame') or {}
    if not k or not fr.get('y'):
        return None, 'no shot or no frames (%s; bar %s)' % ((rec or {}).get('file'), fr)
    r = (GROUND_X[0] * k, GROUND_TOP * k, GROUND_X[1] * k, (fr['y'] - 12) * k)
    luma = nsh.bmp_luma(data, r)
    info = {'shot': rec['file'], 'px': [int(v) for v in r], 'scale': round(k, 3)}
    return (None, dict(info, why='no pixel read')) if luma is None else (round(luma, 1), dict(info, luma=round(luma, 1)))


def strip_band(rec, width):
    """The band behind the status bar in the shot `rec`, if it draws one (`width`: the screen's in points, as the page
    reports it): the largest difference, lighter (+) or darker (-), between a STRIP_SLICE-point slice of the page's side
    margin down the status bar (STRIP_X, STRIP_ROWS) and the same margin just under it (UNDER_ROWS), in mean luminance
    of 255. Returns (difference, what was read) or (None, why not)."""
    if not rec or not rec.get('ok'):
        return None, 'no shot (%s)' % ((rec or {}).get('file'),)
    data = nsh.png_bmp(rec['path']) if os.path.isfile(rec.get('path') or '') else None
    if not data:
        return None, 'the shot %s could not be read' % rec.get('file')
    pw, ph = nsh.bmp_size(data)
    k = pw / float(width) if isinstance(width, (int, float)) and not isinstance(width, bool) and width > 0 else None
    if not k or not 1 <= k <= 4 or ph < UNDER_ROWS[1] * k:
        return None, 'the shot is %d x %d px for a screen %s points wide' % (pw, ph, width)
    x0, x1 = STRIP_X[0] * k, STRIP_X[1] * k
    under = nsh.bmp_luma(data, (x0, UNDER_ROWS[0] * k, x1, UNDER_ROWS[1] * k))
    worst = None
    for pt in range(STRIP_ROWS[0], STRIP_ROWS[1], STRIP_SLICE):
        luma = nsh.bmp_luma(data, (x0, pt * k, x1, (pt + STRIP_SLICE) * k))
        if luma is None or under is None:
            return None, {'shot': rec.get('file'), 'scale': round(k, 3), 'why': 'no pixel read'}
        if worst is None or abs(luma - under) > abs(worst[0]):
            worst = (luma - under, pt, luma)
    return round(worst[0], 1), {'shot': rec.get('file'), 'scale': round(k, 3), 'under': round(under, 1),
                               'slice': '%d-%d pt' % (worst[1], worst[1] + STRIP_SLICE), 'luma': round(worst[2], 1),
                               'difference': round(worst[0], 1)}


def no_band(c, s, combo, ev, label, rm):
    """Where the page itself is on screen: no band behind the status bar in the launch's shot of mark `label` (`rm`: its
    ROOM_JS answer, which carries the screen's width). A shot or a width that cannot be read fails: unread is not "no
    band"."""
    delta, seen = strip_band(shot_of(c, ev.tag, label), rm.get('w'))
    c.check(s, '%s: no band behind the status bar: down its height the page\'s margin reads as it does just under it (within %d of 255)' % (
        combo, STRIP_MAX), delta is not None and abs(delta) <= STRIP_MAX, seen)


def looks(luma, look):
    """Whether a mean luminance reads as the look: dark under DARK_BAR_MAX, light over LIGHT_BAR_MIN."""
    if luma is None:
        return False
    return luma < nsh.DARK_BAR_MAX if look == 'dark' else luma > nsh.LIGHT_BAR_MIN


def bound(look):
    return 'under %d' % nsh.DARK_BAR_MAX if look == 'dark' else 'over %d' % nsh.LIGHT_BAR_MIN


def bar_look(c, s, combo, e, tag, label, room, drawn=True):
    """The tab root's bar in the room's look, as the root asks for it (its style and its container's) and, with `drawn`,
    as the shot draws it (the mean luminance of its frame: native-shell.py's drawn_bar). The drawn look is judged only
    over a native Coach-tab screen, where the room's own ground lies under the glass: over a web tab the glass shows the
    page's content through it, and a blue or lime card under the bar moves its mean luminance across either bound with
    the bar itself in the room's look (iOS 27.0, extra-extra-large Log: Heavyweight 192.5, Lime 80.1)."""
    want = LOOK[room]
    rb = rbar(e)
    c.check(s, '%s: the bar asks for the room\'s look (%s), whatever the phone says' % (combo, want),
            rb.get('style') == want and rb.get('containerStyle') == want, short(rb, ('style', 'containerStyle', 'hidden')))
    if drawn:
        luma, seen = nsh.drawn_bar(e, tag, label)
        c.check(s, '%s: the bar draws %s in the shot (the mean luminance of its frame %s of 255)' % (combo, want, bound(want)),
                looks(luma, want), seen)


# ── the page's side ──────────────────────────────────────────────────────────────────────────────────────────────────

FIELD_JS = nsh.FIELD_JS
OPEN_JS = nsh.OPEN_JS
# Until the page shows what a launch's route asks for: `tab` selected in the page, and the Coach tab handed to the shell
# (`home`: the native hub or connect screen, _fp.shown.coachHome) or the page's own Coach home (`web`); `ms` at most.
WAIT_JS = r"""
var t0 = Date.now();
function met() {
  if (typeof currentTab === 'undefined' || currentTab !== args.tab) return false;
  if (args.home) return !!(window._fp && _fp.shown && _fp.shown.coachHome);
  if (args.web) return typeof coachView !== 'undefined' && coachView === 'home';
  return true;
}
while (Date.now() - t0 < args.ms) {
  if (met()) return { met: true, ms: Date.now() - t0 };
  await new Promise(function (r) { setTimeout(r, 100); });
}
return { met: false, ms: Date.now() - t0, tab: (typeof currentTab !== 'undefined') ? currentTab : null,
  view: (typeof coachView !== 'undefined') ? coachView : null, shown: (window._fp && _fp.shown) || null };
"""
# The room the page paints (-devTheme paints one for the launch and never saves it), and the screen's width in points (a
# shot's pixels per point are its width over it, as for the pending photo).
ROOM_JS = "return { room: document.documentElement.getAttribute('data-room'), saved: localStorage.getItem('kt_theme'), w: screen.width };"
TYPED = 'Draft kept across presents and launches'
# The keys check needs a chat longer than the space left above the keys and shorter than the screen (review 4: six
# messages showed the newest cut under the composer once the keys came up): older ones go in front up to six.
PAD6_JS = r"""
var n = coachMessages.length, k = Math.max(0, 6 - n), add = [], t0 = Date.now() - 2 * 86400000;
for (var i = 0; i < k; i++) {
  var q = Math.floor(i / 2) + 1, user = (k - i) % 2 === 0;
  add.push(user ? { role: 'user', at: t0 + i * 60000, content: 'Earlier question ' + q + ': should I deload next week?' }
    : { role: 'assistant', at: t0 + i * 60000, content: 'Earlier answer ' + q + ': not yet; your bar speed held this week, so keep the plan and check again on Sunday.' });
}
if (add.length) { coachMessages = add.concat(coachMessages); saveCoachHistory(); render(); }
return { padded: add.length, total: coachMessages.length };
"""
# A photo waiting to be sent, as a share leaves one (checkPendingShare): a magenta square drawn in the page, then the chat
# opened on it. The native chat fetches it by its key (coach.image) and draws it in its composer.
PHOTO_JS = r"""
var cv = document.createElement('canvas'); cv.width = 480; cv.height = 480;
var g = cv.getContext('2d'); g.fillStyle = '#ff00ff'; g.fillRect(0, 0, 480, 480);
var url = cv.toDataURL('image/jpeg', 0.92), comma = url.indexOf(',');
pendingImage = { data: url.slice(comma + 1), mediaType: 'image/jpeg', previewUrl: url };
switchTab('coach', { intent: 'chat' }); coachView = 'chat'; render();
return { key: _fpImgKey(), bytes: url.length - comma - 1, w: screen.width, tab: currentTab, view: coachView };
"""
PHOTO_OFF_JS = "clearPendingImage(); return { gone: !pendingImage };"


def scen_prepare(c):
    """What the container holds, kept to put back (probe-selftest.py's SNAP_JS: never the key's value), then the root the
    run's launches build. False when it is not the root asked for (nothing else then runs)."""
    s = 'prepare'
    ev = probe(c, 'prepare', [[wait(600), js('snap', ps.SNAP_JS, probeKey=PROBE_KEY), {'op': 'draft', 'text': ''}, wait(800),
                               js('more', "return { msgs: coachMessages.length, unit: _uW() };"), state('prepared')]])
    r, more = result(ev, 'snap'), result(ev, 'more')
    c.snap, c.key_kind = r.get('snap'), r.get('keyKind')
    c.check(s, 'what the container holds is kept to put back (%s values; the key\'s never read)' % r.get('values'),
            isinstance(c.snap, dict) and c.key_kind in ('none', 'probe', 'other'), {k: r.get(k) for k in ('values', 'keyKind', 'error')} | {'timedOut': ev.timedOut})
    c.rep.fact(s, 'page %s, room %s, unit %s, %s messages in the chat; key %s%s; %s; the native chat\'s device switch %s' % (
        r.get('build'), r.get('theme'), more.get('unit'), more.get('msgs'), c.key_kind,
        ' (the probe\'s added: the chat needs one)' if c.key_kind == 'none' else '',
        'a starter programme added' if r.get('programme') else 'its own programme', 'turned on' if r.get('nativeOff') else 'on'))
    e = ev.state('prepared')
    c.check(s, 'the native composer starts empty', store(e).get('draft') == '', store(e).get('draft'))
    if c.tabs and not (root(e).get('kind') == 'tabs' and root(e).get('fellBack') is None):
        st = (shellst(e).get('status') or {}).get('screens') or {}
        c.rep.fact(s, 'the kept container built the %s root (fellBack %s; tabs %s, coachHome %s, coach %s): About\'s Try again '
                      '(TrovoShell reset) and the bar\'s switch on, then launched again' % (
                          root(e).get('kind'), root(e).get('fellBack'), json.dumps(st.get('tabs')), json.dumps(st.get('coachHome')),
                          json.dumps(st.get('coach'))))
        ev = probe(c, 'root-back', [[wait(800), js('back', nsh.ROOT_BACK_JS), wait(600)]])
        c.rep.fact(s, 'Try again answered: %s' % json.dumps(result(ev, 'back')))
        ev = probe(c, 'root-again', [[wait(800), state('again')]])
        e = ev.state('again')
    kind, fell = root(e).get('kind'), root(e).get('fellBack')
    ok = kind == c.root and (fell is None or not c.tabs)
    st = (shellst(e).get('status') or {}).get('screens') or {}
    return c.check(s, 'the run\'s launches build the %s root (%s)' % (c.root, 'the policy offs file' if c.root_args else
                   ('-fpOffline: the compiled policy' if c.tabs else 'iOS %s' % c.os)), ok,
                   {'root': kind, 'fellBack': fell, 'screens': {k: short(v, ('on', 'off', 'why')) for k, v in st.items()}})


def scen_smoke(c):
    s = 'smoke'
    t0 = time.time()
    ev = probe(c, 'smoke', [[state('smoke')]], args=['-fpSmoke'])
    # this launch's process only: an earlier launch (test-native.sh's routes, another run) logs the same line
    pred = 'subsystem == "app.kt.trainer" AND eventMessage CONTAINS "fp: ping"'
    if ev.pid:
        pred += ' AND processID == %d' % ev.pid
    out = c.sim.sh('xcrun', 'simctl', 'spawn', c.sim.udid, 'log', 'show', '--last', '%dm' % (int((time.time() - t0) / 60) + 2),
                   '--predicate', pred, '--style', 'compact', check=False)
    ok = [l for l in out.splitlines() if 'fp: ping ok v1' in l]
    c.check(s, 'a -fpSmoke launch logs "fp: ping ok v1" (subsystem app.kt.trainer, that launch\'s process: pid %s)' % ev.pid,
            bool(ok) and bool(ev.pid), (ok or ['no line'])[-1].strip()[:160])
    e = ev.state('smoke')
    want = ['coach', 'coachHome', 'tabs'] if c.tabs else ['coach']
    c.check(s, 'the link formed with %s negotiated (the %s root\'s pieces)' % (', '.join(want), c.root),
            shellst(e).get('phase') == 'linked' and sorted(shellst(e).get('negotiated') or []) == want,
            {'phase': shellst(e).get('phase'), 'negotiated': shellst(e).get('negotiated')})


def scen_keys(c):
    s = 'keys'
    sim = c.sim
    phase = [
        wait_coach('up'), js('pad', PAD6_JS), wait(900), state('up'),
        {'op': 'nativeFocus'}, wait(1500), state('keys up'), mark('keys-1-native-up'),
        {'op': 'type', 'text': TYPED}, wait(700), state('typed'), mark('keys-2-typed'),
        press('Back'), wait(2400), state('after back'), mark('keys-3-after-back'),
        js('open', OPEN_JS), wait_coach('up', 4000), wait(1200), state('again'), mark('keys-4-draft-kept'),
        js('to log', "switchTab('log'); return true;"), wait_coach('down', 4000), wait(800),
        {'op': 'webResponder'}, js('web field', FIELD_JS), wait(1600), state('web keys'), mark('keys-5-web-field-keys'),
        js('open 2', OPEN_JS), wait_coach('up', 4000), wait(1600), state('covered'), mark('keys-6-web-field-covered'),
        {'op': 'nativeFocus'}, wait(1500), state('native keys 2'), mark('keys-7-native-keys-again'),
        js('page dismiss', "switchTab('log'); return true;"), wait_coach('down', 4000), wait(2200),
        js('cleanup', "var f = document.getElementById('fp-probe-field'); if (f) f.remove(); return true;"), wait(300),
        state('after page dismiss'), mark('keys-8-after-page-dismiss'),
        # N5: the page's pending photo in the native composer, its preview capped lower while the keys are up
        js('photo', PHOTO_JS), wait_coach('up', 4000), wait(2000), state('photo'), mark('keys-9-photo'),
        {'op': 'nativeFocus'}, wait(1500), state('photo keys'), mark('keys-10-photo-keys-up'),
        {'op': 'resign'}, wait(800), js('photo off', PHOTO_OFF_JS), wait(800), state('photo gone'),
    ]
    # The simulator counts a hardware keyboard as attached and keeps the software keyboard down for it (UIKit's automatic
    # minimization): off for this scenario only. The phone at Large: the photo's caps are in points at that size.
    pref = ('com.apple.keyboard.preferences', 'AutomaticMinimizationEnabled')
    was = sim.sh('xcrun', 'simctl', 'spawn', sim.udid, 'defaults', 'read', *pref, check=False).strip()
    was_size = sim.sh('xcrun', 'simctl', 'ui', sim.udid, 'content_size', check=False).strip()
    sim.sh('xcrun', 'simctl', 'spawn', sim.udid, 'defaults', 'write', *pref, '-bool', 'NO')
    sim.sh('xcrun', 'simctl', 'ui', sim.udid, 'content_size', 'large', check=False)
    try:
        ev = probe(c, 'keys', [phase], args=['-devNav', 'coach/chat'], timeout=200)
        relaunch = probe(c, 'keys-relaunch', [[wait_coach('up'), wait(900), state('relaunched'), mark('keys-11-draft-after-relaunch'),
                                               {'op': 'draft', 'text': ''}, state('cleared')]], args=['-devNav', 'coach/chat'])
    finally:
        if was in ('0', '1'):
            sim.sh('xcrun', 'simctl', 'spawn', sim.udid, 'defaults', 'write', *pref, '-bool', 'YES' if was == '1' else 'NO')
        else:
            sim.sh('xcrun', 'simctl', 'spawn', sim.udid, 'defaults', 'delete', *pref, check=False)
        if was_size and was_size not in ('unknown', 'unsupported'):
            sim.sh('xcrun', 'simctl', 'ui', sim.udid, 'content_size', was_size, check=False)
    st0, up, typed, back, again = ev.state('up'), ev.state('keys up'), ev.state('typed'), ev.state('after back'), ev.state('again')
    if c.tabs:
        c.check(s, 'the chat is pushed on the NATIVE Coach stack (host stack), Coach selected, the bar visible',
                coach(st0).get('host') == 'stack' and root(st0).get('selected') == 'coach' and rcoach(st0).get('pushed') is True
                and rbar(st0).get('hidden') is False, {'host': coach(st0).get('host'), 'selected': root(st0).get('selected'),
                                                       'coach': rcoach(st0), 'bar': short(rbar(st0), ('hidden', 'h'))})
    shown_kb = kb_up(up)
    kbd = rect('{{0, %s}, {0, %s}}' % (shown_kb[-1].get('y'), shown_kb[-1].get('h'))) if shown_kb else None
    comp = rect(coach(up).get('composerFrame') or '')
    c.check(s, 'the native composer takes the keys (the simulator\'s software keyboard)', bool(shown_kb) and coach(up).get('composerFocused'),
            {'kb': kb(up), 'focused': coach(up).get('composerFocused')})
    c.check(s, 'the composer sits above the keys', bool(kbd and comp) and comp[1] + comp[3] <= kbd[1] + 1,
            {'composer': coach(up).get('composerFrame'), 'keysTop': kbd and kbd[1]})
    sb, sk = coach(st0).get('scroll') or {}, coach(up).get('scroll') or {}
    pad = result(ev, 'pad')
    c.check(s, 'the newest message stays in view above the composer when the keys come up (the chat was at its end; %s messages)' % pad.get('total'),
            sb.get('fromEnd') is not None and sb.get('fromEnd') < 4 and sk.get('fromEnd') is not None and sk.get('fromEnd') < 4,
            {'before keys': sb, 'keys up': sk})
    c.check(s, 'typed words reach the composer\'s store', store(typed).get('draft') == TYPED and (ev.first('type') or {}).get('via') == 'keys',
            (store(typed).get('draft'), (ev.first('type') or {}).get('via')))
    pb = page(back)
    still = pb.get('active') in ('BODY', None) and pb.get('scrollY') == 0 and (back or {}).get('webScrollY') == 0 and pb.get('view') == 'home'
    keys_gone = 'didHide' in kb(back) and not kb_up(back)
    if c.tabs:
        c.check(s, 'Back with the keys up is a pop: the chat comes off the Coach stack to the hub, the keys go down, none come back, '
                   'nothing focused or scrolled', 'coach' not in up_list(back) and 'coachHome' in up_list(back) and rcoach(back).get('pushed') is False
                and rcoach(back).get('depth') == 1 and rcoach(back).get('mode') == 'native' and root(back).get('selected') == 'coach' and keys_gone and still,
                {'up': up_list(back), 'coach': short(rcoach(back), ('mode', 'pushed', 'depth')), 'selected': root(back).get('selected'), 'kb': kb(back),
                 'active': pb.get('active'), 'scrollY': pb.get('scrollY'), 'view': pb.get('view')})
    else:
        c.check(s, 'Back with the keys up: the chat and the keys go down, none come back, nothing focused or scrolled',
                up_list(back) == [] and keys_gone and still,
                {'up': up_list(back), 'kb': kb(back), 'active': pb.get('active'), 'scrollY': pb.get('scrollY'), 'view': pb.get('view')})
    bp = ev.first('press', label='Back') or {}
    c.rep.fact(s, 'Back pressed through %s' % (bp.get('via') or '?'))
    c.check(s, 'the chat opens again with the words still in the composer (kept across presents)',
            coach(again).get('presented') and store(again).get('draft') == TYPED, store(again).get('draft'))
    wk, cv = ev.state('web keys'), ev.state('covered')
    if c.tabs:
        c.check(s, 'a web field on Log takes the keys, and they go down when the Coach tab is selected (the field blurred, the chat pushed)',
                bool(kb_up(wk)) and page(wk).get('active') == 'INPUT#fp-probe-field' and root(wk).get('selected') == 'log'
                and root(cv).get('selected') == 'coach' and coach(cv).get('presented') and page(cv).get('active') != 'INPUT#fp-probe-field'
                and 'didHide' in kb(cv), {'web': kb(wk), 'activeBefore': page(wk).get('active'), 'selected': [root(wk).get('selected'), root(cv).get('selected')],
                                          'covered': kb(cv), 'activeAfter': page(cv).get('active')})
    else:
        c.check(s, 'a web field takes the keys, and they go down when the chat covers the page (the field blurred)',
                bool(kb_up(wk)) and page(wk).get('active') == 'INPUT#fp-probe-field' and coach(cv).get('presented')
                and page(cv).get('active') != 'INPUT#fp-probe-field' and 'didHide' in kb(cv),
                {'web': kb(wk), 'activeBefore': page(wk).get('active'), 'covered': kb(cv), 'activeAfter': page(cv).get('active')})
    n2, pd = ev.state('native keys 2'), ev.state('after page dismiss')
    down = ('coach' not in up_list(pd) and root(pd).get('selected') == 'log') if c.tabs else up_list(pd) == []
    c.check(s, 'the page\'s own dismiss with the native keys up: no keyboard after, nothing focused or scrolled%s' % (' (Log selected)' if c.tabs else ''),
            bool(kb_up(n2)) and down and not kb_up(pd) and page(pd).get('active') in ('BODY', None)
            and page(pd).get('scrollY') == 0 and (pd or {}).get('webScrollY') == 0,
            {'native': kb(n2), 'after': kb(pd), 'up': up_list(pd), 'selected': root(pd).get('selected'), 'active': page(pd).get('active'),
             'scrollY': page(pd).get('scrollY')})
    # the pending photo, measured in the shots (a square is drawn at the cap exactly)
    ph, p1, p2 = result(ev, 'photo'), ev.state('photo'), ev.state('photo keys')
    c.check(s, 'the page\'s pending photo reaches the native composer (fetched by its key, coach.image)',
            bool(ph.get('key')) and ph.get('key') in (store(p1).get('images') or []) and coach(p1).get('presented'),
            {'photo': short(ph, ('key', 'bytes', 'w', 'tab', 'view')), 'images': store(p1).get('images')})
    r1, r2 = shot_of(c, ev.tag, 'keys-9-photo'), shot_of(c, ev.tag, 'keys-10-photo-keys-up')
    k = None
    if r1 and r1.get('ok') and ph.get('w'):
        d = nsh.png_bmp(r1['path'])
        k = nsh.bmp_size(d)[0] / float(ph['w']) if d else None
    b1 = photo_box(r1 and r1.get('path'), k)
    b2 = photo_box(r2 and r2.get('path'), k)
    c.check(s, 'with the keys down the photo\'s preview is drawn at its cap, %d pt tall (N5, the web\'s .coach-img-preview)' % PHOTO_CAP_DOWN,
            bool(b1) and PHOTO_CAP_DOWN - 6 <= b1['h'] <= PHOTO_CAP_DOWN + 0.5, {'box': b1, 'scale': k and round(k, 3)})
    c.check(s, 'with the keys up it is capped at %d pt (N5, the web\'s kb-open rule): the keys up and the photo still drawn' % PHOTO_CAP_UP,
            bool(kb_up(p2)) and bool(b2) and PHOTO_CAP_UP - 6 <= b2['h'] <= PHOTO_CAP_UP + 0.5,
            {'box': b2, 'kb': kb(p2), 'composer': coach(p2).get('composerFrame')})
    rl = relaunch.state('relaunched')
    c.check(s, 'after a relaunch the words are still in the composer (fpDraft.coach)', coach(rl).get('presented') and store(rl).get('draft') == TYPED,
            store(rl).get('draft'))
    c.check(s, 'the composer is emptied again', store(relaunch.state('cleared')).get('draft') == '', store(relaunch.state('cleared')).get('draft'))


LIFT_JS = r"""
var r = getCustomRoutine(); if (!r || !r.weeks) return null;
var wi = Math.min(Math.max(currentWeek, 1), r.weeks.length) - 1, wk = r.weeks[wi], days = Object.keys(wk);
for (var j = 0; j < days.length; j++) {
  var arr = wk[days[j]]; if (!Array.isArray(arr)) continue;
  for (var i = 0; i < arr.length; i++) {
    var ex = arr[i], w = parseFloat(ex && ex.weight);
    if (ex && ex.name && w > 0) return { name: String(ex.name), lb: w, shown: wDisp(w), unit: _uW(), week: currentWeek, day: days[j] };
  }
}
return null;
"""

LOAD_JS = r"""
var r = getCustomRoutine(), wk = r && r.weeks[Math.min(Math.max(currentWeek, 1), r.weeks.length) - 1], out = null;
if (wk) Object.keys(wk).forEach(function (d) { (Array.isArray(wk[d]) ? wk[d] : []).forEach(function (ex) {
  if (out === null && ex && ex.name === args.name) out = parseFloat(ex.weight); }); });
return { lb: out, shown: out === null ? null : wDisp(out), backup: !!localStorage.getItem('kt_routine_backup'),
  last: (function () { var m = coachMessages[coachMessages.length - 1]; return m ? { role: m.role, text: String(typeof m.content === 'string' ? m.content : '').slice(0, 120),
    tools: (m._tools || []).map(function (t) { return t.name; }), seen: !!m._ledgerSeen } : null; })() };
"""


# The scroll checks need a conversation longer than the screen: older messages go in front of what the container holds
# (restore puts the conversation back as it was found).
PAD_JS = r"""
var n = coachMessages.length, k = Math.max(0, 26 - n);
if (k % 2) k++;
var add = [], t0 = Date.now() - 3 * 86400000;
for (var i = 0; i < k; i++) {
  var q = Math.floor(i / 2) + 1;
  add.push(i % 2 === 0 ? { role: 'user', at: t0 + i * 60000, content: 'Earlier question ' + q + ': how should I pace my sets this week?' }
    : { role: 'assistant', at: t0 + i * 60000, content: 'Earlier answer ' + q + ': keep two reps in reserve on the main lifts, and rest two to three minutes between heavy sets so the last one moves as well as the first.' });
}
if (add.length) { coachMessages = add.concat(coachMessages); saveCoachHistory(); render(); }
return { padded: add.length, total: coachMessages.length };
"""


def scen_live(c):
    s = 'live'
    ev0 = probe(c, 'live-lift', [[js('lift', LIFT_JS)]])
    lift = (ev0.first('js', label='lift') or {}).get('result')
    if not c.check(s, 'the programme has a weighted lift this week for the stand-in to change', isinstance(lift, dict) and lift.get('name'), lift):
        return
    step = 2.5 if lift['unit'] == 'kg' else 5
    new, new3 = lift['shown'] + step, lift['shown'] + 2 * step
    newtxt, new3txt = '%g' % new, '%g' % new3
    q1, q2 = 'Add %g %s to my %s, please' % (step, lift['unit'], lift['name']), 'Put my %s up again' % lift['name']
    q3 = 'One more plate on my %s?' % lift['name']
    q4, final4 = 'Scroll check: is my week on track?', 'Scroll check answered: your week is on track.'
    q5 = 'Stop check: what should I eat after training?'
    final1 = 'Done: %s is %s %s from this week on.' % (lift['name'], newtxt, lift['unit'])
    final2 = 'Done again: %s is %s %s from this week on.' % (lift['name'], newtxt, lift['unit'])
    final3 = '%s is %s %s from this week on. Keep it if the bar moved well; Undo puts %s back.' % (lift['name'], new3txt, lift['unit'], newtxt)
    tool = {'name': 'set_exercise_weight', 'input': {'name': lift['name'], 'weight': new}}
    tool3 = {'name': 'set_exercise_weight', 'input': {'name': lift['name'], 'weight': new3}}
    stub = stubs.CoachStub({'turns': [{'match': q1, 'text': 'On it.', 'tool': tool, 'final': final1, 'delay': 2.5},
                                      {'match': q2, 'text': 'Again.', 'tool': tool, 'final': final2},
                                      {'match': q4, 'final': final4, 'delay': 1.5},
                                      {'match': q3, 'text': 'Another plate.', 'tool': tool3, 'final': final3, 'delay': 2.5},
                                      {'match': q5, 'final': 'Stop check answered (never shown: the owner stops it).', 'delay': 8}]})
    stub.start()
    c.rep.fact(s, 'stand-in on %s; %s at %g %s, to %s' % (stub.base, lift['name'], lift['shown'], lift['unit'], newtxt))
    # The page takes a send within milliseconds, too soon to see the echo: for the first send only, its coach.send waits
    # 1.4 s in the page (under the link's 2 s), so the shot shows the owner's bubble before the page has the message.
    slow = ("var f = window.FPScreens.call; window.__fpCall = f; window.FPScreens.call = function (n, a) { if (n !== 'coach.send') "
            "return f.call(window.FPScreens, n, a); return new Promise(function (r) { setTimeout(function () { r(f.call(window.FPScreens, n, a)); }, 1400); }); }; return true;")
    unslow = "if (window.__fpCall) { window.FPScreens.call = window.__fpCall; delete window.__fpCall; } return true;"
    phase = [
        wait_coach('up'), js('pad', PAD_JS), wait(900), state('live up'), mark('live-1-chat'),
        js('slow send', slow),
        {'op': 'nativeFocus'}, wait(600), {'op': 'type', 'text': q1}, wait(500), state('typed'),
        press('Send message'), state('echo'), mark('live-2-echo-before-the-page-has-it'),
        wait_coach('loading', 6000, 'thinking'), state('thinking'), mark('live-3-thinking'),
        js('unslow', unslow),
        wait_coach('ledger', 20000, 'reply'), wait(800), {'op': 'resign'}, wait(900), state('reply'), mark('live-4-reply-pill-plan-changes'),
        js('after turn 1', LOAD_JS, name=lift['name']),
        press(ledger='undo'), wait_coach('confirm', 5000), wait(600), state('undo confirm'), mark('live-5-undo-confirm'),
        press('Restore', where='overlay'), wait_coach('noLedger', 5000), wait(400), state('undone'), mark('live-6-undone'),
        js('after undo', LOAD_JS, name=lift['name']),
        {'op': 'draft', 'text': q2}, wait(500), press('Send message'),
        wait_coach('ledger', 20000, 'reply 2'), wait(900), state('reply 2'), mark('live-7-second-reply'),
        js('after turn 2', LOAD_JS, name=lift['name']),
        press(ledger='keep'), wait_coach('noLedger', 5000), wait(700), state('kept'), mark('live-8-kept'),
        js('after keep', LOAD_JS, name=lift['name']),
        # review 4: the owner's own Send while scrolled up brings the end into view, as the web chat's Send scrolls to its end
        {'op': 'resign'}, wait(500), {'op': 'scroll', 'to': 'top'}, wait(900), state('scrolled up'), mark('live-9-scrolled-up'),
        {'op': 'draft', 'text': q4}, wait(500), press('Send message'), wait(1200), state('sent scrolled up'), mark('live-10-sent-while-scrolled-up'),
        wait_coach('reply', 20000, 'reply 4'), wait(900), state('reply 4'), mark('live-11-scroll-check-reply'),
        # and the owner's Stop while scrolled up brings it to its end too (the web's Stop scrolls to the end): the question
        # and the note that says it stopped. Stop waits out the page's first half second of a turn (_coachJustSent).
        {'op': 'draft', 'text': q5}, wait(500), press('Send message'), wait_coach('loading', 6000, 'thinking 5'), wait(900),
        {'op': 'scroll', 'to': 'top'}, wait(700), state('up before stop'),
        press('Stop the reply'), wait_coach('idle', 6000, 'stopped'), wait(1200), state('stopped scrolled up'), mark('live-12-stopped-while-scrolled-up'),
        # a third change left on its card: the combos draw the chat with it (restore takes it back). A reader who scrolls up
        # while its reply is on its way keeps their place when it lands.
        {'op': 'draft', 'text': q3}, wait(500), press('Send message'), wait_coach('loading', 6000, 'thinking 3'), wait(300),
        {'op': 'scroll', 'to': 'top'}, wait(600), state('up while thinking'),
        wait_coach('ledger', 20000, 'reply 3'), wait(900), state('reply 3'),
    ]
    try:
        ev = probe(c, 'live', [phase], args=['-devNav', 'coach/chat', '-fpApiBase', stub.base], timeout=180)
    finally:
        stub.stop()
    reqs = stub.requests
    chat = [r for r in reqs if r.get('tools')]
    c.rep.fact(s, 'the stand-in answered %d request(s): %s' % (len(reqs), ', '.join('%s %s' % (r.get('kind'), r.get('status')) for r in reqs)))
    turn1 = [r for r in chat if (r.get('question') or '').startswith(q1)]
    c.check(s, 'the page asked the stand-in as it asks Anthropic (the key, the API version, tools), and ran its tool call through',
            [r.get('kind') for r in turn1] == ['question', 'tool_result'] and all(r.get('key') and r.get('version') == '2023-06-01' and r.get('status') == 200 for r in turn1)
            and not any(x.get('error') for x in (turn1[-1].get('results') or [])) if len(turn1) == 2 else False,
            [(r.get('kind'), r.get('status'), r.get('results')) for r in turn1])
    pad = result(ev, 'pad')
    c.rep.fact(s, 'the conversation holds %s messages for the scroll checks (%s older ones put in front, taken back by restore)' % (pad.get('total'), pad.get('padded')))
    sts = ev.all('state')
    if c.tabs:
        bad = [e.get('label') for e in sts if not (coach(e).get('presented') and coach(e).get('host') == 'stack' and rcoach(e).get('pushed') is True
                                                  and root(e).get('selected') == 'coach' and rbar(e).get('hidden') is False)]
        c.check(s, 'through the turn the chat stays pushed on the Coach stack (host stack), Coach selected, the bar visible (%d states)' % len(sts),
                bool(sts) and not bad, bad)
    else:
        bad = [e.get('label') for e in sts if not (coach(e).get('presented') and coach(e).get('style') == OVER_FULL_SCREEN)]
        c.check(s, 'through the turn the chat stays presented over the page (.overFullScreen) (%d states)' % len(sts), bool(sts) and not bad, bad)
    t1, ech, rep = ev.state('typed'), ev.state('echo'), ev.state('reply')
    c.check(s, 'the question typed in the native composer is in its store', store(t1).get('draft') == q1, store(t1).get('draft'))
    sp = [e for e in ev.all('press') if e.get('control') == 'Send message']
    c.check(s, 'every Send went through the chat\'s own Send button (its accessibility action, as a tap), never the probe\'s fallback',
            len(sp) == 5 and all(e.get('via') == 'accessibility' for e in sp), [e.get('via') for e in sp])
    c.rep.fact(s, 'Send pressed through %s; Undo through %s; Restore through %s; Keep through %s' % (
        sp[0].get('via') if sp else '?', (ev.first('press', control='Undo') or {}).get('via'), (ev.first('press', control='Restore') or {}).get('via'),
        (ev.first('press', control='Keep changes') or {}).get('via')))
    events = ' | '.join(store(rep).get('events') or [])
    sent = [r for r in nsh.intents(ev, 'coach.send')]
    c.check(s, 'each Send sent its message once (coach.send by its own nonce, done) and emptied the composer', len(sent) == 5
            and all(r.get('outcome') == 'done' for r in sent) and len({r.get('key') for r in sent}) == 5 and store(ech).get('draft') == '',
            [(r.get('key'), r.get('outcome'), r.get('ms')) for r in sent])
    nonce1 = sent[0].get('key') if sent else None
    et = (store(ech).get('tail') or [{}])[-1]
    c.check(s, 'the owner\'s message shows at once, before the page has it (the echo, on its way)', [e.get('phase') for e in store(ech).get('echoes') or []] == ['sending']
            and et.get('id') == 'echo-%s' % nonce1 and et.get('role') == 'user' and et.get('text') == q1 and not store(ech).get('loading'),
            {'echoes': store(ech).get('echoes'), 'last': et})
    th = ev.state('thinking')
    tt = (store(th).get('tail') or [{}])[-1]
    c.check(s, 'then the page\'s own message takes its place, and Thinking shows while the coach answers', store(th).get('loading') is True
            and store(th).get('echoes') == [] and tt.get('role') == 'user' and tt.get('text') == q1 and not tt.get('id', '').startswith('echo-'),
            {'loading': store(th).get('loading'), 'last': tt})
    c.check(s, 'the echo was replaced by the page\'s message, never put back',
            bool(nonce1) and ('echo %s shown' % nonce1) in events and ('echo %s replaced by the page\'s message' % nonce1) in events
            and store(rep).get('echoes') == [] and store(rep).get('restored') == [], events[-400:])
    tail = store(rep).get('tail') or []
    last = tail[-1] if tail else {}
    prev = tail[-2] if len(tail) > 1 else {}
    led = last.get('ledger') or {}
    c.check(s, 'the reply shows the stand-in\'s words, under the owner\'s question', last.get('role') == 'assistant' and final1 in (last.get('text') or '')
            and prev.get('role') == 'user' and prev.get('text') == q1, [(m.get('role'), m.get('text')) for m in tail[-2:]])
    c.check(s, 'a tool pill says what changed', any(lift['name'] in p and newtxt in p for p in last.get('pills') or []), last.get('pills'))
    c.check(s, 'PLAN CHANGES names the lift, old to new, with Undo and Keep changes', led.get('head', '').startswith('PLAN CHANGES')
            and led.get('canUndo') and led.get('actions') == ['Undo', 'Keep changes']
            and any(r[0] == lift['name'] and newtxt in r[1] for r in led.get('rows') or []), led)
    a1 = result(ev, 'after turn 1')
    c.check(s, 'the tool changed the programme', a1.get('shown') == new and a1.get('backup'), a1)
    uc = ev.state('undo confirm')
    pc = [e for e in ev.all('page') if e.get('method') == 'confirm']
    c.check(s, 'Undo asks first: the page\'s confirm, forwarded to the native window', bool(pc) and pc[-1].get('title') == 'Restore previous programme?'
            and (screens(uc).get('overlay') or {}).get('confirm') and coach(uc).get('presented'), (pc[-1:] if pc else None, screens(uc).get('overlay')))
    ud = ev.state('undone')
    au = result(ev, 'after undo')
    toasts = [e.get('text') for e in ev.all('page') if e.get('method') == 'toast']
    c.check(s, 'Restore puts the previous programme back, the page says so, and the card goes', au.get('shown') == lift['shown']
            and 'Previous programme restored' in toasts and not any(m.get('ledger') for m in store(ud).get('tail') or []),
            {'load': au.get('shown'), 'toasts': toasts, 'tail': [bool(m.get('ledger')) for m in store(ud).get('tail') or []]})
    r2 = ev.state('reply 2')
    l2 = ((store(r2).get('tail') or [{}])[-1]).get('ledger') or {}
    a2 = result(ev, 'after turn 2')
    c.check(s, 'a second turn changes it again, with its own card', a2.get('shown') == new and l2.get('actions') == ['Undo', 'Keep changes']
            and final2 in (((store(r2).get('tail') or [{}])[-1]).get('text') or ''), {'load': a2.get('shown'), 'ledger': l2})
    kp = ev.state('kept')
    ak = result(ev, 'after keep')
    c.check(s, 'Keep changes keeps the change and the card goes', ak.get('shown') == new and (ak.get('last') or {}).get('seen')
            and not any(m.get('ledger') for m in store(kp).get('tail') or []), {'load': ak.get('shown'), 'last': ak.get('last')})

    def scroll(label):
        return coach(ev.state(label)).get('scroll') or {}
    up, sent_up, r4 = scroll('scrolled up'), scroll('sent scrolled up'), scroll('reply 4')
    c.check(s, 'scrolled to the top, the conversation\'s end is far out of view', (up.get('fromEnd') or 0) > 300, up)
    t4 = store(ev.state('sent scrolled up')).get('tail') or []
    c.check(s, 'Send while scrolled up brings the conversation to its end: the owner\'s message is in view (the web\'s Send scrolls to the end)',
            sent_up.get('fromEnd') is not None and sent_up.get('fromEnd') < 24 and any(m.get('role') == 'user' and m.get('text') == q4 for m in t4),
            {'scroll': sent_up, 'tail': [(m.get('role'), m.get('text')) for m in t4[-2:]]})
    c.check(s, 'and its reply lands in view under the question', r4.get('fromEnd') is not None and r4.get('fromEnd') < (r4.get('visible') or 0)
            and final4 in (((store(ev.state('reply 4')).get('tail') or [{}])[-1]).get('text') or ''), r4)
    ub, stp = scroll('up before stop'), scroll('stopped scrolled up')
    t5 = store(ev.state('stopped scrolled up')).get('tail') or []
    stops = [r for r in nsh.intents(ev, 'coach.stop')]
    stp_press = ev.first('press', control='Stop the reply') or {}
    c.check(s, 'Stop while scrolled up brings the conversation to its end too: the question and the note that says it stopped are in view '
            '(the web\'s Stop scrolls to the end)', (ub.get('fromEnd') or 0) > 300 and stp.get('fromEnd') is not None and stp.get('fromEnd') < 24
            and stp_press.get('via') == 'accessibility' and [r.get('outcome') for r in stops] == ['done']
            and len(t5) > 1 and t5[-1].get('role') == 'assistant' and (t5[-1].get('text') or '').startswith('Stopped') and t5[-2].get('text') == q5,
            {'before': ub, 'after': stp, 'via': stp_press.get('via'), 'stop': [(r.get('outcome'), r.get('ms')) for r in stops],
             'tail': [(m.get('role'), m.get('text')) for m in t5[-2:]]})
    wt, r3s = scroll('up while thinking'), scroll('reply 3')
    c.check(s, 'a reader who scrolls up while the reply is on its way keeps their place when it lands', (wt.get('fromEnd') or 0) > 300
            and wt.get('offset') is not None and r3s.get('offset') is not None and abs(r3s['offset'] - wt['offset']) < 30, {'waiting': wt, 'landed': r3s})
    r3 = ev.state('reply 3')
    l3 = ((store(r3).get('tail') or [{}])[-1]).get('ledger') or {}
    c.check(s, 'a third change waits on its card for the shots (from what Keep kept)', l3.get('canUndo')
            and any(r[0] == lift['name'] and r[1].startswith(newtxt) and new3txt in r[1] for r in l3.get('rows') or []), l3)
    fails = [r for r in nsh.intents(ev) if r.get('outcome') not in ('done', None) and r.get('name') != 'coach.draftTaken']
    c.check(s, 'every intent answered (no timeout, no failure, nothing refused)', not fails, fails[:4])
    c.check(s, 'nothing went back in the composer and no "not sent" toast', not store(r3).get('restored') and not store(r3).get('toasts'),
            (store(r3).get('restored'), store(r3).get('toasts')))


# The key out of the container, inside the page (the page's own render then pushes the connect screen's model), and what
# the connect screen saved: whether there is a key and whether it is the probe's, never the key.
KEY_ASIDE_JS = ps.KEY_ASIDE_JS
SAVED_JS = r"""
var k = localStorage.getItem('kt_apikey');
return { saved: k !== null, probe: k === args.probeKey };
"""


def scen_connect(c):
    s = 'connect'
    if not c.tabs:
        c.rep.fact(s, 'not run on the classic root: the native connect screen is the native Coach tab\'s (the classic root keeps '
                      'the page\'s own Coach tab)')
        return
    if c.key_kind not in ('none', 'probe'):
        # the connect screen needs the key gone; a key that is not the probe's would live only in the page's memory
        # meanwhile, and a crash or a timeout would lose it for good: nothing is touched
        c.check(s, 'the phone holds a key that is not the probe\'s: connect takes nothing out and types nothing (remove the key, '
                   'or run on a phone with the probe\'s key or none)', False, 'key: %s' % c.key_kind)
        return
    stub = stubs.CoachStub({'default': 'Stand-in reply.'})
    stub.start()
    try:
        hw = probe(c, 'connect-heavyweight', [[
            js('hub', WAIT_JS, tab='coach', home=True, ms=10000), wait(900), state('hub'),
            js('aside', KEY_ASIDE_JS), wait(2000), state('connect'), mark('connect-1-heavyweight'),
            {'op': 'nativeFocus'}, wait(900), {'op': 'type', 'text': BAD_KEY}, wait(500), state('typed bad'),
            {'op': 'resign'}, wait(500),
            press('CONNECT', where='hub'), wait_coach('toast', 5000, 'invalid toast'), wait(200), state('invalid'),
            mark('connect-2-invalid-key-toast', cap=1500, transient=True),
            wait(2600), js('kept', SAVED_JS, probeKey=PROBE_KEY), state('still connect')]],
            args=['-devNav', 'coach', '-devTheme', 'heavyweight', '-fpApiBase', stub.base], timeout=150)
        lime = probe(c, 'connect-lime', [[
            js('hub', WAIT_JS, tab='coach', home=True, ms=10000), wait(1200), state('connect'), mark('connect-3-lime'),
            {'op': 'nativeFocus'}, wait(900), {'op': 'type', 'text': PROBE_KEY}, wait(500), state('typed'),
            {'op': 'resign'}, wait(500),
            press('CONNECT', where='hub'), wait_coach('toast', 5000, 'saved toast'), wait(2200),
            js('saved', SAVED_JS, probeKey=PROBE_KEY), state('saved'), mark('connect-4-hub-after-connect')]],
            args=['-devNav', 'coach', '-devTheme', 'dark', '-fpApiBase', stub.base], timeout=150)
    finally:
        stub.stop()
    # Heavyweight: the connect screen, then an invalid key refused with the page's toast
    cn = hw.state('connect')
    inp = (cn or {}).get('input') or {}
    c.check(s, 'with the key out the Coach tab shows the native connect screen: its route connect, the key field the top screen\'s '
               'first input (kind key), empty', result(hw, 'aside').get('had') is True and stack(cn).get('homeRoute') == 'connect'
            and stack(cn).get('keyField') == 'empty' and rcoach(cn).get('root') == 'connect' and root(cn).get('selected') == 'coach'
            and inp.get('kind') == 'key' and inp.get('hasText') is False,
            {'aside': result(hw, 'aside'), 'route': stack(cn).get('homeRoute'), 'root': rcoach(cn).get('root'), 'input': inp})
    luma, seen = ground(cn, shot_of(c, hw.tag, 'connect-1-heavyweight'))
    c.check(s, 'Heavyweight\'s connect screen draws its paper ground (the left edge strip\'s mean luminance %s of 255)' % bound('light'),
            looks(luma, 'light'), seen)
    ty = hw.first('type') or {}
    c.check(s, 'an invalid key typed into the key field through the keys (kind key, its length only)', ty.get('kind') == 'key'
            and ty.get('via') == 'keys' and ty.get('length') == len(BAD_KEY) and stack(hw.state('typed bad')).get('keyField') == 'typed',
            {'type': ty, 'keyField': stack(hw.state('typed bad')).get('keyField')})
    pk = hw.first('press', control='CONNECT') or {}
    sk = nsh.intents(hw, 'coachHome.setKey')
    toasts = [e.get('text') for e in hw.all('page') if e.get('method') == 'toast' and e.get('t', -1) >= pk.get('t', 9e9)]
    iv = hw.state('invalid')
    c.check(s, 'CONNECT on an invalid key: pressed through its element, the page refuses it (coachHome.setKey refused invalid) and '
               'says why, its toast forwarded over the Coach tab', pk.get('pressed') is True and pk.get('via') == 'accessibility'
            and len(sk) == 1 and sk[0].get('outcome') == 'refused invalid' and KEY_BAD in toasts
            and (screens(iv).get('overlay') or {}).get('toast') == KEY_BAD,
            {'press': short(pk, ('pressed', 'via', 'matches', 'error')), 'setKey': [short(r, ('outcome', 'ms')) for r in sk], 'toasts': toasts,
             'overlay': screens(iv).get('overlay')})
    sc = hw.state('still connect')
    c.check(s, 'nothing saved: no key, the connect screen still up with the words in its field',
            result(hw, 'kept').get('saved') is False and stack(sc).get('homeRoute') == 'connect' and stack(sc).get('keyField') == 'typed',
            {'kept': result(hw, 'kept'), 'route': stack(sc).get('homeRoute'), 'keyField': stack(sc).get('keyField')})
    # Lime: the connect screen from the launch, then the probe's key saved on the stand-in and the hub
    cl = lime.state('connect')
    c.check(s, 'the next launch opens on the connect screen, its key field new and empty',
            stack(cl).get('homeRoute') == 'connect' and stack(cl).get('keyField') == 'empty' and ((cl or {}).get('input') or {}).get('hasText') is False,
            {'route': stack(cl).get('homeRoute'), 'keyField': stack(cl).get('keyField'), 'input': (cl or {}).get('input')})
    luma, seen = ground(cl, shot_of(c, lime.tag, 'connect-3-lime'))
    c.check(s, 'Lime\'s connect screen draws its dark ground (the left edge strip\'s mean luminance %s of 255)' % bound('dark'),
            looks(luma, 'dark'), seen)
    ty = lime.first('type') or {}
    pk = lime.first('press', control='CONNECT') or {}
    sk = nsh.intents(lime, 'coachHome.setKey')
    toasts = [e.get('text') for e in lime.all('page') if e.get('method') == 'toast' and e.get('t', -1) >= pk.get('t', 9e9)]
    c.check(s, 'the probe\'s key typed (through the keys, kind key) and CONNECT pressed: the page saves it (coachHome.setKey done) and '
               'says so', ty.get('via') == 'keys' and ty.get('kind') == 'key' and ty.get('length') == len(PROBE_KEY) and pk.get('pressed') is True
            and pk.get('via') == 'accessibility' and len(sk) == 1 and sk[0].get('outcome') == 'done' and KEY_SAVED in toasts,
            {'type': ty, 'press': short(pk, ('pressed', 'via', 'matches', 'error')), 'setKey': [short(r, ('outcome', 'ms')) for r in sk], 'toasts': toasts})
    wall = pk.get('wall') or 0
    pings = [r for r in stub.requests if r.get('kind') == 'one-shot' and r.get('t', 0) * 1000 >= wall - 50]
    c.check(s, 'its key check went to the stand-in with the key, and came back verified', any(r.get('key') and r.get('status') == 200 for r in pings)
            and KEY_VERIFIED in toasts, {'one-shots after the press': [short(r, ('model', 'key', 'status')) for r in pings], 'toasts': toasts})
    sv, sd = result(lime, 'saved'), lime.state('saved')
    c.check(s, 'kt_apikey holds the probe\'s key (never read out); the Coach tab shows the hub, its key field gone',
            sv.get('saved') is True and sv.get('probe') is True and stack(sd).get('homeRoute') == 'hub' and stack(sd).get('keyField') == 'empty'
            and rcoach(sd).get('root') == 'hub' and rcoach(sd).get('mode') == 'native',
            {'saved': sv, 'route': stack(sd).get('homeRoute'), 'keyField': stack(sd).get('keyField'), 'coach': short(rcoach(sd), ('mode', 'root'))})
    leaks = []
    for ev in (hw, lime):
        try:
            with open(c.logs[ev.tag], encoding='utf-8', errors='surrogatepass') as f:
                raw = f.read()
        except OSError as e:
            leaks.append('%s: unread (%s)' % (ev.tag, e))
            continue
        leaks += ['%s: %s' % (ev.tag, what) for what, text in (('the invalid key', BAD_KEY), ('the probe\'s key', PROBE_KEY)) if text in raw]
    c.check(s, 'neither key typed into the key field is in the probe logs of the two launches (contract 5 K4)', not leaks, leaks)


def scen_combos(c):
    s = 'combos'
    sim = c.sim
    was_app = nsh.appearance(sim)
    was_size = sim.sh('xcrun', 'simctl', 'ui', sim.udid, 'content_size', check=False).strip()
    try:
        for room, style, appearance, size, category, tail in combo_names():
            nsh.appearance(sim, appearance)
            sim.sh('xcrun', 'simctl', 'ui', sim.udid, 'content_size', size)
            combo = '%s, phone %s, %s' % (room_name(room), appearance, size)
            combo_chat(c, s, room, style, category, appearance, 'coach-chat-' + tail, combo + ', coach/chat')
            combo_hub(c, s, room, appearance, 'coach-home-' + tail, combo + ', coach')
            combo_log(c, s, room, appearance, 'tabs-log-' + tail, combo + ', log/workout')
    finally:
        try:
            nsh.appearance(sim, was_app if was_app in ('light', 'dark') else 'light')
        finally:
            if was_size and was_size not in ('unknown', 'unsupported'):
                sim.sh('xcrun', 'simctl', 'ui', sim.udid, 'content_size', was_size, check=False)
    c.rep.fact(s, 'the phone is back to %s, %s' % (was_app, was_size))


def sees_phone(c, s, combo, ev, appearance):
    """The launch ran on the phone its combo names: the appearance the app saw (the page's prefers-color-scheme,
    nsh.SCHEME_JS), which simctl's read-back of its own setting does not show."""
    got, stored = nsh.sees(ev), nsh.appearance(c.sim)
    detail = {'page': got, 'simctl': stored}
    if got in ('light', 'dark') and got != appearance and stored == appearance:
        detail['why'] = ('simctl stored the setting and the app did not get it, as on a phone whose cfprefsd was stopped since '
                         'its boot: restart SpringBoard (simctl spawn <udid> launchctl stop com.apple.SpringBoard) or reboot it')
    c.check(s, '%s: the app sees the phone %s (the page\'s prefers-color-scheme)' % (combo, appearance), got == appearance, detail)


def combo_chat(c, s, room, style, category, appearance, name, combo):
    ev = probe(c, name, [[wait_coach('up'), wait(900), state('chat'), js('scheme', nsh.SCHEME_JS), mark(name)]],
               args=['-devNav', 'coach/chat', '-devTheme', room])
    e = ev.state('chat')
    sees_phone(c, s, combo, ev, appearance)
    cu, p = coach(e), page(e)
    model = cu.get('room') == room and cu.get('messages', 0) > 0 and p.get('ph') and not p.get('webChat') and fp(e).get('covered')
    seen = short(cu, ('presented', 'host', 'modal', 'style', 'room', 'messages')) | {'ph': p.get('ph'), 'webChat': p.get('webChat')}
    if c.tabs:
        rc, rb = rcoach(e), rbar(e)
        c.check(s, '%s: the chat is native, pushed on the NATIVE Coach stack (host stack, not modal), Coach selected, on the page\'s model' % combo,
                cu.get('presented') and cu.get('host') == 'stack' and cu.get('modal') is False and root(e).get('selected') == 'coach'
                and rc.get('mode') == 'native' and rc.get('pushed') is True and model, seen | {'selected': root(e).get('selected'), 'coach': rc})
        c.check(s, '%s: the bar is visible over the chat' % combo, rb.get('hidden') is False and rb.get('h') == nsh.BAR_H, short(rb, ('hidden', 'h', 'safe')))
    else:
        c.check(s, '%s: the chat is native, over the page (.overFullScreen), on the page\'s model' % combo,
                cu.get('presented') and cu.get('style') == OVER_FULL_SCREEN and model, seen)
    c.check(s, '%s: the chat drawn in its room, not the phone\'s appearance' % combo,
            cu.get('interfaceStyle') == style and cu.get('drawnStyle') == style, (cu.get('interfaceStyle'), cu.get('drawnStyle')))
    c.check(s, '%s: the chat at the phone\'s text size' % combo, cu.get('contentSize') == category, cu.get('contentSize'))
    if c.tabs:
        bar_look(c, s, combo, e, ev.tag, name, room)


def combo_hub(c, s, room, appearance, name, combo):
    how = {'home': True} if c.tabs else {'web': True}
    ev = probe(c, name, [[js('hub', WAIT_JS, tab='coach', ms=10000, **how), wait(900), state('hub'), js('room', ROOM_JS),
                          js('scheme', nsh.SCHEME_JS), mark(name)]], args=['-devNav', 'coach', '-devTheme', room])
    e, w, rm = ev.state('hub'), result(ev, 'hub'), result(ev, 'room')
    sees_phone(c, s, combo, ev, appearance)
    p = page(e)
    if c.tabs:
        rc, rw, rb, hub = rcoach(e), rweb(e), rbar(e), home(e)
        c.check(s, '%s: the Coach tab is NATIVE on its hub: Coach selected, the hub at the stack\'s root, nothing pushed' % combo,
                w.get('met') is True and root(e).get('selected') == 'coach' and rc.get('mode') == 'native' and rc.get('root') == 'hub'
                and rc.get('pushed') is False and rc.get('depth') == 1 and hub.get('presented') and hub.get('inWindow') and hub.get('route') == 'hub'
                and 'coach' not in up_list(e), {'wait': w, 'selected': root(e).get('selected'), 'coach': rc, 'coachHome': hub, 'up': up_list(e),
                                                'rows': (screens(e).get('home') or {}).get('rows')})
        c.check(s, '%s: the web view sits in the Coach slot, in its window and hidden, the page covered; the bar visible' % combo,
                rw.get('slot') == 'coach' and rw.get('inWindow') is True and rw.get('hidden') is True and fp(e).get('covered')
                and rb.get('hidden') is False and rb.get('h') == nsh.BAR_H, {'web': short(rw, ('slot', 'inWindow', 'hidden')),
                                                                          'covered': fp(e).get('covered'), 'bar': short(rb, ('hidden', 'h'))})
        luma, seen = ground(e, shot_of(c, ev.tag, name))
        c.check(s, '%s: the hub draws its room\'s ground, whatever the phone says (the left edge strip\'s mean luminance %s of 255)' % (
            combo, bound(LOOK[room])), looks(luma, LOOK[room]), seen)
        bar_look(c, s, combo, e, ev.tag, name, room)
    else:
        c.check(s, '%s: the page\'s own Coach home under its own tab bar (no native screen up)' % combo, w.get('met') is True
                and p.get('tab') == 'coach' and p.get('view') == 'home' and up_list(e) == [] and p.get('tabsDisplay') not in (None, 'none'),
                {'wait': w, 'tab': p.get('tab'), 'view': p.get('view'), 'up': up_list(e), 'tabsDisplay': p.get('tabsDisplay')})
        no_band(c, s, combo, ev, name, rm)
    c.check(s, '%s: the page paints its room (data-room %s)' % (combo, room), rm.get('room') == room, rm)


def combo_log(c, s, room, appearance, name, combo):
    ev = probe(c, name, [[js('log', WAIT_JS, tab='log', ms=10000), wait(900), state('log'), js('room', ROOM_JS),
                          js('scheme', nsh.SCHEME_JS), mark(name)]], args=['-devNav', 'log/workout', '-devTheme', room])
    e, w, rm = ev.state('log'), result(ev, 'log'), result(ev, 'room')
    sees_phone(c, s, combo, ev, appearance)
    p = page(e)
    if c.tabs:
        rw, rb = rweb(e), rbar(e)
        c.check(s, '%s: Log selected, the page in the Log slot shown under the glass bar (tabs mode, its own bar hidden), no chat up' % combo,
                w.get('met') is True and root(e).get('selected') == 'log' and p.get('tab') == 'log' and rw.get('slot') == 'log'
                and rw.get('inWindow') is True and rw.get('hidden') is False and rb.get('hidden') is False and rb.get('h') == nsh.BAR_H
                and 'coach' not in up_list(e) and p.get('tabsMode') and p.get('tabsDisplay') == 'none',
                {'wait': w, 'selected': root(e).get('selected'), 'tab': p.get('tab'), 'web': short(rw, ('slot', 'inWindow', 'hidden')),
                 'bar': short(rb, ('hidden', 'h')), 'up': up_list(e), 'tabsMode': p.get('tabsMode'), 'tabsDisplay': p.get('tabsDisplay')})
        bar_look(c, s, combo, e, ev.tag, name, room, drawn=False)
    else:
        c.check(s, '%s: Log under the page\'s own tab bar (no native screen up)' % combo, w.get('met') is True and p.get('tab') == 'log'
                and up_list(e) == [] and p.get('tabsDisplay') not in (None, 'none'),
                {'wait': w, 'tab': p.get('tab'), 'up': up_list(e), 'tabsDisplay': p.get('tabsDisplay')})
    c.check(s, '%s: the page paints its room (data-room %s)' % (combo, room), rm.get('room') == room, rm)
    no_band(c, s, combo, ev, name, rm)


def scen_textoff(c):
    """Review 4 (chat low): with a large system text size, turning the app's Larger Text off (kt_dyn_type '0') while the
    chat is up pinned the chat to Large but not its field: the empty composer kept the phone's size (22 pt against 18
    at Large), its placeholder riding high until a key."""
    s = 'textoff'
    sim = c.sim
    was_size = sim.sh('xcrun', 'simctl', 'ui', sim.udid, 'content_size', check=False).strip()
    on = "localStorage.removeItem('kt_dyn_type'); render(); return localStorage.getItem('kt_dyn_type');"
    off = "localStorage.setItem('kt_dyn_type', '0'); render(); return localStorage.getItem('kt_dyn_type');"
    try:
        sim.sh('xcrun', 'simctl', 'ui', sim.udid, 'content_size', 'large')
        ev = probe(c, 'textoff-l', [[wait_coach('up'), {'op': 'draft', 'text': ''}, js('on', on), wait(1200), state('large')]],
                   args=['-devNav', 'coach/chat'])
        large = rect(coach(ev.state('large')).get('composerFrame') or '')
        sim.sh('xcrun', 'simctl', 'ui', sim.udid, 'content_size', 'extra-extra-large')
        ev = probe(c, 'textoff-xxl', [[wait_coach('up'), {'op': 'draft', 'text': ''}, js('on', on), wait(1200), state('xxl on'),
                                       js('off', off), wait(1500), state('xxl off'), mark('textoff-xxl-off'), js('on again', on), wait(600)]],
                   args=['-devNav', 'coach/chat'])
        xon, xoff = ev.state('xxl on'), ev.state('xxl off')
    finally:
        if was_size and was_size not in ('unknown', 'unsupported'):
            sim.sh('xcrun', 'simctl', 'ui', sim.udid, 'content_size', was_size, check=False)
    hon = rect(coach(xon).get('composerFrame') or '')
    hoff = rect(coach(xoff).get('composerFrame') or '')
    got = {'large': large and large[3], 'xxl on': hon and hon[3], 'xxl off': hoff and hoff[3],
           'dynTypeOn': (coach(xon).get('dynTypeOn'), coach(xoff).get('dynTypeOn'))}
    c.check(s, 'Larger Text turned off with the chat up at extra-extra-large: the empty composer is as tall as at Large (its field pinned too)',
            bool(large and hoff) and abs(hoff[3] - large[3]) < 0.5 and coach(xoff).get('dynTypeOn') is False, got)
    c.rep.fact(s, 'the phone is back to %s' % was_size)


def scen_restore(c):
    """probe-selftest.py's restore: two launches, never a reload (a page reloaded under the tab root goes hidden in use,
    which the shell counts as a fault); WebKit is given time to write the values down before the app ends, and the next
    launch reads what the first put back."""
    s = 'restore'
    if not isinstance(c.snap, dict):
        c.check(s, 'something to put back', False, 'prepare kept nothing')
        return
    ev = probe(c, 'restore', [[wait(600), js('restore', ps.RESTORE_JS, snap=c.snap, keyKind=c.key_kind, probeKey=PROBE_KEY),
                               {'op': 'draft', 'text': ''}, wait(2500)]])
    r = result(ev, 'restore')
    ev = probe(c, 'restored', [[wait(900), js('same', ps.SAME_JS, snap=c.snap, probeKey=PROBE_KEY), state('restored')]])
    same = result(ev, 'same')
    c.rep.fact(s, 'put back %d value(s), removed %d: %s' % (len(r.get('changed') or []), len(r.get('removed') or []),
                                                         ', '.join(sorted((r.get('changed') or []) + (r.get('removed') or [])))[:300]))
    c.check(s, 'every localStorage value as the run found it (read in the next launch), the key as it was (%s)' % c.key_kind,
            same.get('diff') == [] and same.get('key') == c.key_kind, same)
    c.check(s, 'the native composer is empty', store(ev.state('restored')).get('draft') == '', store(ev.state('restored')).get('draft'))


# ── the shell's own state, kept and put back ────────────────────────────────────────────────────────────────────────

def keep_shell(c):
    """Before the first launch: the shell's folder and its UserDefaults copies (probe-selftest.py's helpers: read through
    the simulator's cfprefsd and held to the container's plist, RuntimeError when the two differ), and the offs file's
    place in the container (a classic pass writes it)."""
    sim = c.sim
    sim.terminate()
    kept = {'tmp': tempfile.mkdtemp(prefix='native-chat-'), 'folder': None, 'offs': None}
    try:
        if os.path.isdir(ps.shell_folder(sim)):
            kept['folder'] = os.path.join(kept['tmp'], 'FPShell')
            shutil.copytree(ps.shell_folder(sim), kept['folder'])
        kept['prefs'] = ps.read_shell_prefs(sim)
    except BaseException:
        shutil.rmtree(kept['tmp'], ignore_errors=True)
        raise
    offs = sim.path(nsh.OFFS_FILE)
    if os.path.exists(offs):
        with open(offs, 'rb') as f:
            kept['offs'] = f.read()
    if c.root_args:
        with open(offs, 'w') as f:
            json.dump(nsh.OFFS, f)
    c.rep.fact('setup', 'the shell\'s folder (%s) and UserDefaults copies (%s; through the simulator\'s cfprefsd, the container\'s plist '
                        'saying the same) kept to put back%s' % (
        ', '.join(sorted(os.listdir(kept['folder']))) if kept['folder'] else 'none yet',
        ', '.join('%s %s' % (k, 'absent' if v is None else '%d bytes' % len(v)) for k, v in kept['prefs'].items()),
        '; the policy offs written as %s' % nsh.OFFS_FILE if c.root_args else ''))
    return kept


def tree_bytes(folder):
    """Every file of a folder by its relative path, with its bytes (None for no folder)."""
    if not folder or not os.path.isdir(folder):
        return None
    out = {}
    for dp, _dn, fn in os.walk(folder):
        for f in fn:
            p = os.path.join(dp, f)
            with open(p, 'rb') as fh:
                out[os.path.relpath(p, folder)] = fh.read()
    return out


def put_back_shell(c, kept):
    """After the last launch: the shell's folder and copies as found (a decline, a verdict, a switch, the counters, the
    policy fetch's state, the markers the run's own terminations left), the offs file as found; all read back, the
    copies as the app's next launch reads them (through the daemon, the container's plist saying the same)."""
    sim = c.sim
    try:
        ps.put_back_shell(sim, kept['folder'])
        try:
            ps.put_back_shell_prefs(sim, kept['prefs'])
            now, err = ps.read_shell_prefs(sim), None
        except RuntimeError as e:
            now, err = {}, str(e)[:300]
        offs = sim.path(nsh.OFFS_FILE)
        if kept['offs'] is None:
            if os.path.exists(offs):
                os.remove(offs)
        else:
            with open(offs, 'wb') as f:
                f.write(kept['offs'])
        was, live = tree_bytes(kept['folder']), tree_bytes(ps.shell_folder(sim))
        diff = ([err] if err else []) + sorted(k for k in ps.SHELL_PREFS if now.get(k) != kept['prefs'].get(k))
        diff += ['FPShell/%s' % f for f in sorted(set(was or {}) | set(live or {})) if (was or {}).get(f) != (live or {}).get(f)]
        if (was is None) != (live is None):
            diff.append('FPShell (%s)' % ('there' if live is not None else 'gone'))
        c.check('restore', 'the shell\'s folder and UserDefaults copies (%s) put back as found, the offs file too' % ', '.join(ps.SHELL_PREFS),
                not diff and (os.path.exists(offs) == (kept['offs'] is not None)), diff)
    finally:
        shutil.rmtree(kept['tmp'], ignore_errors=True)


# ── the run's own checks ─────────────────────────────────────────────────────────────────────────────────────────────

def aggregates(c):
    rows = [(sc, e.get('label'), shellst(e).get('leftWindow'), shellst(e).get('leftWindowAny'), page(e).get('visEvents')) for sc, _t, e in c.states]
    c.check('window', 'the web view never left its window (leftWindow and leftWindowAny 0 in every state, %d states)' % len(rows),
            bool(rows) and all(a == 0 and b == 0 for _, _l, a, b, _v in rows), sorted({sc for sc, _l, a, b, _v in rows if a != 0 or b != 0}))
    c.check('window', 'the page saw no visibilitychange in any state (every state reports its list, empty)',
            bool(rows) and all(v == [] for *_x, v in rows), sorted({'%s: %s' % (sc, l) for sc, l, _a, _b, v in rows if v != []})[:8])
    if c.tabs:
        fell = c.fellbacks + [(sc, t, (root(e).get('fellBack') or {}).get('why')) for sc, t, e in c.states if root(e).get('fellBack')]
        c.check('root', 'the tab root never fell back (no fellBack event and none in any state; no-hello above all)', not fell, fell[:5])
    out = [(sc, t) for sc, t, x in c.launches if x]
    c.check('launches', 'every launch ran to its end (no probe timed out; %d launches)' % len(c.launches), not out, out)
    missing = [r for r in c.shots if not r.get('ok')]
    late = [r for r in c.shots if r.get('ok') and r.get('late') and not r.get('transient')]
    stray = [r for r in c.shots if not shot_named(c, r)]
    bad = ([(r.get('file'), 'no file written') for r in missing] + [(r.get('file'), r.get('why')) for r in late]
           + [(r.get('file'), 'not one of the shots SHOTS names for %s' % r.get('scenario')) for r in stray])
    c.check('shots', 'every shot is on disk, one of its scenario\'s, and was taken while the app held still at its mark (%d shots, none '
                     'missing, late or misnamed)' % len(c.shots), not bad, bad[:6])
    gone = [r for r in c.shots if r.get('ok') and r.get('late') and r.get('transient')]
    if gone:
        c.rep.fact('shots', 'transient marks shot after their cap (their subject may be gone): %s' % ', '.join(r.get('file') for r in gone))
    ms = sorted(r.get('ms') or 0 for r in c.shots)
    if ms:
        c.rep.fact('shots', '%d shots, median %d ms, longest %d ms' % (len(ms), ms[len(ms) // 2], ms[-1]))


ALL = ['prepare', 'smoke', 'keys', 'live', 'connect', 'combos', 'textoff', 'restore']


def app_hash(app):
    """tests/tools/fp-build.sh's fingerprint of an app bundle (app_print: build-id.txt's `app`): the first 16 hex digits of
    the SHA-256 of `shasum -a 256`'s lines for every file of the bundle, by path in byte order (find . -type f: a link
    is no file and none is followed)."""
    rows = []
    for dp, _dn, fn in os.walk(app):
        for f in fn:
            p = os.path.join(dp, f)
            if os.path.islink(p) or not os.path.isfile(p):
                continue
            with open(p, 'rb') as fh:
                rows.append((('./' + os.path.relpath(p, app)).encode('utf-8', 'surrogateescape'), hashlib.sha256(fh.read()).hexdigest()))
    rows.sort()
    return hashlib.sha256(b''.join(h.encode() + b'  ' + rel + b'\n' for rel, h in rows)).hexdigest()[:16]


def app_identity(sim):
    """The app on the phone, so that a run by hand says what it ran: its build number, its bundled page's stamp, and its
    fingerprint as fp-build.sh stamps a build (the build-id.txt beside a build names this as `app`, with the tree the
    build came from)."""
    app = sim.sh('xcrun', 'simctl', 'get_app_container', sim.udid, ps.BID, 'app').strip()
    build = stamp = None
    try:
        with open(os.path.join(app, 'Info.plist'), 'rb') as f:
            build = plistlib.load(f).get('CFBundleVersion')
        with open(os.path.join(app, 'public', 'index.html'), 'rb') as f:
            m = re.search(rb'<meta name="build" content="([^"]+)"', f.read(8192))
        stamp = m.group(1).decode('ascii', 'replace') if m else None
    except (OSError, ValueError):
        pass
    return {'build': build, 'page': stamp, 'app': app_hash(app)}


def _term(_sig, _frame):
    """A SIGTERM as Ctrl-C: the scenarios end where they are, run()'s finally does restore and the put-back, exit 143."""
    print('native-chat: SIGTERM: restore and the shell\'s state put back, then exit 143', flush=True)
    raise SystemExit(143)


def run(c, kept, only):
    """prepare, then the scenarios --only names (all of them without it); and whatever ends them (the last one's end, a
    scenario that breaks, Ctrl-C, a SIGTERM), restore and then the shell's state put back."""
    rep = c.rep
    try:
        c.scen = 'prepare'
        print('-- prepare', flush=True)
        try:
            ready = scen_prepare(c)
        except Exception as e:  # a launch that breaks is a failure; restore still runs
            traceback.print_exc()
            ready = rep.check('prepare', 'ran to the end', False, repr(e)[:300])
        if not ready:
            rep.check('prepare', 'the scenarios run only on the root they are written for: none ran', False, c.root)
        for scen in ALL[1:-1]:
            if not ready or (only and scen not in only):
                continue
            c.scen = scen
            print('-- %s' % scen, flush=True)
            try:
                clear_shots(c, scen)
                globals()['scen_' + scen](c)
            except Exception as e:  # a scenario that breaks is a failure; the next still runs
                traceback.print_exc()
                rep.check(scen, 'ran to the end', False, repr(e)[:300])
    finally:
        try:
            c.scen = 'restore'
            print('-- restore', flush=True)
            try:
                scen_restore(c)
            except Exception as e:
                traceback.print_exc()
                rep.check('restore', 'ran to the end', False, repr(e)[:300])
        finally:
            c.scen = 'end'
            put_back_shell(c, kept)


def self_test():
    """No simulator: how the run judges itself, on made-up records (a shot that left no file, a late one, a transient late
    one, a misnamed one; a state without its visibilitychange list or its window counts; the bar's container
    unreported; a launch on another phone appearance than its combo's) and made-up shots (a band behind the status bar),
    which shots a scenario clears, the copies' keep and put-back on a stand-in for the daemon's `defaults`, how a run
    ends (a scenario that breaks, a SIGTERM), and the app's fingerprint against fp-build.sh's own pipeline."""
    bad, n = [], [0]

    def case(what, ok, detail=''):
        n[0] += 1
        print('%s  %s%s' % ('ok  ' if ok else 'FAIL', what, (' -- %s' % (detail,)) if not ok and detail != '' else ''))
        if not ok:
            bad.append(what)

    class Rep:
        def __init__(self):
            self.rows, self.facts = [], []

        def check(self, scen, name, ok, detail=''):
            self.rows.append((scen, name, bool(ok), detail))
            return ok

        def fact(self, scen, text):
            self.facts.append((scen, text))

    class FakeSim:
        udid = 'self-test'

        def __init__(self, stored='dark', home=None):
            self.stored, self.home = stored, home

        def sh(self, *_a, **_k):      # simctl ui <udid> appearance
            return self.stored + '\n'

        def container(self):
            return self.home

        def path(self, *p):
            return os.path.join(self.home, *p)

    nowhere = os.path.join(tempfile.gettempdir(), 'native-chat-self-test', 'no-such-folder')   # a made-up run's --out: nothing is there

    def ctx(kind='tabs', out=None, sim=None):
        return Ctx(sim or FakeSim(), Rep(), argparse.Namespace(root=kind, out=out or nowhere), kind, '27.0')

    def verdict(c, part):
        got = [ok for _s, nm, ok, _d in c.rep.rows if part in nm]
        return got[-1] if got else None

    def st(vis=(), left=0, anyl=0, style='dark', cstyle='dark'):
        return {'ev': 'state', 'label': 's', 'page': {'visEvents': None if vis is None else list(vis)},
                'shell': {'leftWindow': left, 'leftWindowAny': anyl,
                          'root': {'kind': 'tabs', 'fellBack': None, 'bar': {'style': style, 'containerStyle': cstyle, 'hidden': False}}}}

    def shot(scen, file, ok=True, late=False, transient=False):
        return {'scenario': scen, 'tag': 't', 'file': file, 'label': file[:-4], 'ok': ok, 'late': late, 'transient': transient,
                'ms': 100, 'why': 'the cap' if late else None}

    def judged(states=None, shots=None, kind='tabs'):
        c = ctx(kind)
        c.states = [('keys', 't', e) for e in ([st()] if states is None else states)]
        c.launches = [('keys', 't', False)]
        c.shots = [shot('keys', c.prefix + 'keys-1-native-up.png')] if shots is None else shots
        aggregates(c)
        return c

    # the aggregates
    c = judged()
    case('a clean run passes its five aggregates', len(c.rep.rows) == 5 and all(ok for _s, _n, ok, _d in c.rep.rows), c.rep.rows)
    c = judged(shots=[shot('keys', 'keys-1-native-up.png', ok=False)])
    case('a shot that left no file fails the shots check, by name', verdict(c, 'every shot') is False
         and ('keys-1-native-up.png', 'no file written') in c.rep.rows[-1][3], c.rep.rows[-1])
    c = judged(shots=[shot('keys', 'keys-1-native-up.png', late=True)])
    case('a shot the app did not hold still for fails it', verdict(c, 'every shot') is False, c.rep.rows[-1])
    c = judged(shots=[shot('connect', 'connect-2-invalid-key-toast.png', late=True, transient=True)])
    case('a transient mark shot late is reported, not failed', verdict(c, 'every shot') is True and any('transient' in t for _s, t in c.rep.facts),
         (c.rep.rows[-1], c.rep.facts))
    c = judged(shots=[shot('connect', 'connect-2-invalid-key-toast.png', ok=False, late=True, transient=True)])
    case('a transient mark that left no file fails all the same', verdict(c, 'every shot') is False, c.rep.rows[-1])
    c = judged(shots=[shot('combos', 'coach-chat.png')])
    case('a shot that is not one of its scenario\'s fails (coach-chat.png is test-native.sh\'s route shot, not a combo\'s)',
         verdict(c, 'every shot') is False, c.rep.rows[-1])
    c = judged(shots=[shot('combos', 'classic-coach-chat-lime-dark-l.png')], kind='classic')
    case('the classic root\'s shots carry its prefix (four aggregates there: no fallback check)', verdict(c, 'every shot') is True
         and len(c.rep.rows) == 4, c.rep.rows)
    c = judged(shots=[shot('combos', 'coach-chat-lime-dark-l.png')], kind='classic')
    case('a classic pass\'s shot without the prefix fails', verdict(c, 'every shot') is False, c.rep.rows[-1])
    c = judged(states=[st(), st(vis=None)])
    case('a state that reports no visibilitychange list fails (unreported is not "none seen")', verdict(c, 'visibilitychange') is False
         and verdict(c, 'never left its window') is True, c.rep.rows[:2])
    c = judged(states=[st(vis=['hidden'])])
    case('a visibilitychange seen fails', verdict(c, 'visibilitychange') is False, c.rep.rows[1])
    c = judged(states=[st(left=None), st()])
    case('a state that reports no leftWindow count fails, its scenario named', verdict(c, 'never left its window') is False
         and c.rep.rows[0][3] == ['keys'], c.rep.rows[0])
    c = judged(states=[])
    case('a run with no state fails both window checks', verdict(c, 'never left its window') is False and verdict(c, 'visibilitychange') is False,
         c.rep.rows[:2])

    # the bar's look as asked
    def look(style, cstyle, room='dark'):
        c = ctx()
        bar_look(c, 'combos', 'x', st(style=style, cstyle=cstyle), 't', 'l', room, drawn=False)
        return verdict(c, 'asks for the room')
    case('the bar and its container in the room\'s look pass', look('dark', 'dark') is True and look('light', 'light', 'heavyweight') is True)
    case('the bar\'s container unreported fails (unreported is not the room\'s look)', look('dark', None) is False)
    case('the bar\'s container in another look fails', look('dark', 'light') is False and look('dark', 'unspecified') is False)

    # the phone's appearance as the app saw it
    def seen(dark, want, stored):
        ev = Events([{'ev': 'js', 'label': 'scheme', 'result': None if dark is None else {'dark': dark}}])
        c = ctx(sim=FakeSim(stored))
        sees_phone(c, 'combos', 'x', ev, want)
        return verdict(c, 'the app sees the phone'), c.rep.rows[-1][3]
    case('a launch whose page sees the phone as its combo names it passes', seen(True, 'dark', 'dark')[0] is True and seen(False, 'light', 'light')[0] is True)
    v, d = seen(False, 'dark', 'dark')
    case('a launch whose page sees light while simctl reads dark fails, and says how to get the phone back', v is False
         and 'SpringBoard' in str(d.get('why')), d)
    case('a launch whose page sees dark on a combo that names light fails', seen(True, 'light', 'light')[0] is False)
    v, d = seen(None, 'dark', 'dark')
    case('a launch whose page did not answer fails, with no guess at why', v is False and 'why' not in d, d)

    # the strip behind the status bar, read in made-up shots (through sips, as a run's)
    with tempfile.TemporaryDirectory() as d:
        def frame(name, ground, band=0.0, k=3, dot=False, tall=80):
            """A shot at `k` pixels per point, 20 points wide and `tall` high: `ground` everywhere, or under a band `band`
            lighter (darker when negative) at the top row and gone by 57 pt, as the haze was drawn; `dot`: the 4 px
            black mark every simulator shot carries in its top left corner."""
            w, h = 20 * k, tall * k
            rows = []
            for y in range(h):
                v = max(0, min(255, int(round(ground + band * max(0.0, 1 - (y / float(k)) / 57.0)))))
                row = bytearray(bytes((v, v, v)) * w)
                if dot and y < 4:
                    row[:12] = bytes(12)
                rows.append(b'\x00' + bytes(row))

            def chunk(t, data):
                return struct.pack('>I', len(data)) + t + data + struct.pack('>I', zlib.crc32(t + data) & 0xffffffff)
            path = os.path.join(d, name + '.png')
            with open(path, 'wb') as f:
                f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
                        + chunk(b'IDAT', zlib.compress(b''.join(rows))) + chunk(b'IEND', b''))
            return {'scenario': 'combos', 'tag': 't', 'label': name, 'file': name + '.png', 'path': path, 'ok': True}

        def band(rec, w=20, label=None):
            c = ctx()
            c.shots = [rec] if rec else []
            ev = Events([])
            ev.tag = 't'
            no_band(c, 'combos', 'x', ev, label or rec['label'], {'w': w})
            seen = c.rep.rows[-1][3]
            return verdict(c, 'no band behind the status bar'), seen, (seen.get('difference') if isinstance(seen, dict) else None)

        v, seen, diff = band(frame('lime', 11))
        case('a shot whose margin behind the status bar is the page\'s ground has no band (difference 0)', v is True and diff == 0, seen)
        v, seen, diff = band(frame('haze', 11, band=STRIP_BANDS[0]))
        case('the haze as it was drawn (Lime\'s ground under a band %s lighter at the top, gone by 57 pt) fails, read in the top slice' % STRIP_BANDS[0],
             v is False and seen.get('slice') == '0-2 pt' and STRIP_BANDS[0] - 3 < diff <= STRIP_BANDS[0], seen)
        v, seen, diff = band(frame('scrim', 98, band=STRIP_BANDS[1]))
        case('the fainter band under a sheet\'s scrim fails', v is False and STRIP_BANDS[1] - 3 < diff <= STRIP_BANDS[1], seen)
        v, seen, diff = band(frame('dark', 245, band=STRIP_BANDS[2]))
        case('a darker band fails too (a dark scroll background under Heavyweight\'s paper)', v is False and STRIP_BANDS[2] <= diff < STRIP_BANDS[2] + 3, seen)
        over, under = band(frame('over', 11, band=STRIP_MAX + 2)), band(frame('under', 11, band=STRIP_MAX - 2))
        case('a band a shade over the bound fails, one a shade under it passes', over[0] is False and under[0] is True, (over[1], under[1]))
        v, seen, diff = band(frame('two', 11, band=STRIP_BANDS[0], k=2))
        case('a shot at 2 pixels per point is read at its own scale', v is False and seen.get('scale') == 2.0 and seen.get('slice') == '0-2 pt', seen)
        v, seen, diff = band(frame('dot', 245, dot=True))
        case('the 4 px mark in a simulator shot\'s top left corner is no band (the margin is read clear of it)', v is True and diff == 0, seen)
        v, seen, diff = band(dict(frame('gone', 11), ok=False))
        case('a shot that left no file fails: unread is not "no band"', v is False and 'no shot' in str(seen), seen)
        v, seen, diff = band(None, label='never')
        case('a mark that was never shot fails', v is False and 'no shot' in str(seen), seen)
        v, seen, diff = band(frame('nowidth', 11), w=None)
        case('a page that reported no screen width fails', v is False, seen)
        v, seen, diff = band(frame('wide', 11), w=2)
        case('a shot whose scale makes no sense for the width reported fails', v is False, seen)
        v, seen, diff = band(frame('short', 11, tall=40))
        case('a shot too short to reach under the status bar fails', v is False, seen)
    case('the band\'s bound keeps its distance: at least ten times the largest reading without a band, at most a tenth of the faintest band seen',
         10 * STRIP_CLEAN <= STRIP_MAX <= min(abs(b) for b in STRIP_BANDS) / 10.0, (STRIP_CLEAN, STRIP_MAX, STRIP_BANDS))

    # the shots a scenario clears
    with tempfile.TemporaryDirectory() as d:
        names = ['keys-1-native-up.png', 'classic-keys-1-native-up.png', 'live-4-reply-pill-plan-changes.png', 'coach-chat-lime-dark-l.png',
                 'coach-home-heavyweight-light-xxl.png', 'tabs-log-lime-light-l.png', 'classic-tabs-log-lime-light-l.png',
                 'coach-chat.png', 'coach-chat-2-dark.png', 'coach.png', 'boot.png', 'textoff-xxl-off.png', 'connect-3-lime.png']
        for f in names:
            open(os.path.join(d, f), 'w').close()
        ct, cc = ctx('tabs', d), ctx('classic', d)
        k = clear_shots(ct, 'combos')
        left = sorted(os.listdir(d))
        case('combos clears its own shots of the tab root and nothing else (test-native.sh\'s coach-chat.png and coach-chat-2-dark.png stay)',
             k == 3 and left == sorted(set(names) - {'coach-chat-lime-dark-l.png', 'coach-home-heavyweight-light-xxl.png', 'tabs-log-lime-light-l.png'}),
             (k, left))
        k = clear_shots(cc, 'combos') + clear_shots(cc, 'keys')
        left = sorted(os.listdir(d))
        case('the classic root clears only classic- shots', k == 2 and 'keys-1-native-up.png' in left and not [f for f in left if f.startswith('classic-')],
             (k, left))
        k = sum(clear_shots(ct, sc) for sc in ('keys', 'live', 'connect', 'textoff', 'prepare', 'smoke', 'restore'))
        left = sorted(os.listdir(d))
        case('keys, live, connect and textoff clear theirs; a scenario with no shots clears nothing',
             k == 4 and left == ['boot.png', 'coach-chat-2-dark.png', 'coach-chat.png', 'coach.png'], (k, left))
    case('SHOTS names the 24 combos shots whole, no pattern', len(SHOTS['combos']) == 24 and 'coach-chat-heavyweight-light-l' in SHOTS['combos']
         and 'tabs-log-lime-dark-xxl' in SHOTS['combos'] and not any('*' in p for p in SHOTS['combos']), SHOTS['combos'])

    # the shell's copies, kept and put back through a stand-in for the daemon's defaults
    with tempfile.TemporaryDirectory() as d:
        sim = FakeSim(home=d)
        os.makedirs(os.path.join(d, 'Library', 'Preferences'))
        plist = os.path.join(d, 'Library', 'Preferences', ps.BID + '.plist')
        held = {'fp.shell.counters': b'{"a":1}', 'fp.policy': b'{"p":2}', 'other': 'kept'}
        calls = []

        def flush():
            with open(plist, 'wb') as f:
                plistlib.dump(held, f)

        def fake_defaults(_sim, *args):
            calls.append(args)
            if args[0] == 'export':
                return plistlib.dumps(held)
            if args[0] == 'write':
                held[args[2]] = bytes.fromhex(args[4])
            elif args[0] == 'delete':
                held.pop(args[2], None)
            flush()
            return b''
        real = ps.prefs_defaults
        ps.prefs_defaults = fake_defaults
        try:
            flush()
            found = ps.read_shell_prefs(sim, most=0)
            case('the copies are read through the daemon: an absent one None, the policy fetch\'s among them',
                 found == {'fp.shell.switches': None, 'fp.shell.breakers': None, 'fp.shell.counters': b'{"a":1}', 'fp.policy': b'{"p":2}'}, found)
            held.update({'fp.shell.switches': b'{"tabs":false}', 'fp.policy': b'{"p":3}'})
            del held['fp.shell.counters']
            flush()
            del calls[:]
            ps.put_back_shell_prefs(sim, found)
            writes = sorted(a[:3] for a in calls if a[0] != 'export')
            case('the put-back writes only what differs: a copy the run added is deleted, a changed and a removed one written as Data',
                 writes == [('delete', ps.BID, 'fp.shell.switches'), ('write', ps.BID, 'fp.policy'), ('write', ps.BID, 'fp.shell.counters')]
                 and ps.read_shell_prefs(sim, most=0) == found and held.get('other') == 'kept', writes)
            del calls[:]
            ps.put_back_shell_prefs(sim, found)
            case('a put-back with nothing to change writes nothing', [a for a in calls if a[0] != 'export'] == [], calls)
            with open(plist, 'wb') as f:
                plistlib.dump({'fp.policy': b'another file'}, f)
            try:
                ps.read_shell_prefs(sim, most=0)
                case('a daemon whose answer is not the container\'s plist is refused', False, 'accepted')
            except RuntimeError as e:
                case('a daemon whose answer is not the container\'s plist is refused, the copies that differ named',
                     'fp.policy' in str(e) and 'fp.shell.counters' in str(e), str(e))
            flush()
            try:
                ps.put_back_shell_prefs(sim, dict(found, **{'fp.policy': 'a string'}))
                case('a copy found as something other than Data is refused', False, 'written')
            except RuntimeError as e:
                case('a copy found as something other than Data is refused, never written as text', 'fp.policy' in str(e), str(e))
        finally:
            ps.prefs_defaults = real

    # how a run ends
    g = globals()
    saved = {k: g[k] for k in ('scen_prepare', 'scen_smoke', 'scen_keys', 'scen_live', 'scen_connect', 'scen_combos', 'scen_textoff',
                               'scen_restore', 'put_back_shell')}
    order = []

    def fake(name, then=None):
        def f(c, *_a):
            order.append(name)
            if then:
                raise then
            return True
        return f
    try:
        for k in saved:
            g[k] = fake(k.replace('scen_', ''))
        g['put_back_shell'] = fake('put back')
        with open(os.devnull, 'w') as null:
            out, sys.stdout = sys.stdout, null
            try:
                c = ctx()
                run(c, {}, ['smoke', 'live'])
                a = list(order)
                del order[:]
                g['scen_live'] = fake('live', ValueError('broke'))
                c2 = ctx()
                err, sys.stderr = sys.stderr, null
                try:
                    run(c2, {}, [])
                finally:
                    sys.stderr = err
                b = list(order)
                del order[:]
                g['scen_live'] = fake('live', SystemExit(143))
                code = None
                try:
                    run(ctx(), {}, [])
                except SystemExit as e:
                    code = e.code
                t = list(order)
                del order[:]
                g['scen_prepare'] = lambda c: order.append('prepare') or False
                c4 = ctx()
                run(c4, {}, [])
                np = list(order)
            finally:
                sys.stdout = out
        case('--only runs prepare, the scenarios it names in ALL\'s order, restore, then the put-back', a == ['prepare', 'smoke', 'live', 'restore', 'put back'], a)
        case('a scenario that breaks is a failed check; the next ones, restore and the put-back still run',
             b == ['prepare', 'smoke', 'keys', 'live', 'connect', 'combos', 'textoff', 'restore', 'put back']
             and [(s_, nm) for s_, nm, ok, _d in c2.rep.rows if not ok] == [('live', 'ran to the end')], (b, c2.rep.rows))
        case('a SIGTERM inside a scenario ends the scenarios there; restore and the put-back run, then the exit (143)',
             t == ['prepare', 'smoke', 'keys', 'live', 'restore', 'put back'] and code == 143, (t, code))
        case('a root that is not the one asked for runs no scenario, and still restores and puts back',
             np == ['prepare', 'restore', 'put back'] and any('none ran' in nm for _s, nm, ok, _d in c4.rep.rows if not ok), (np, c4.rep.rows))
    finally:
        g.update(saved)
    try:
        with open(os.devnull, 'w') as null:
            out, sys.stdout = sys.stdout, null
            try:
                _term(signal.SIGTERM, None)
            finally:
                sys.stdout = out
        case('the SIGTERM handler raises SystemExit 143', False, 'returned')
    except SystemExit as e:
        case('the SIGTERM handler raises SystemExit 143 (run()\'s finally blocks then do restore and the put-back)', e.code == 143, e.code)

    # the app's fingerprint
    with tempfile.TemporaryDirectory() as d:
        os.makedirs(os.path.join(d, 'public'))
        for rel, text in (('App', 'binary'), ('public/index.html', '<meta name="build" content="20260101-1"/>'), ('Z', 'z'), ('a b', 'space'), ('_x', '')):
            with open(os.path.join(d, rel), 'w') as f:
                f.write(text)
        os.symlink('App', os.path.join(d, 'link'))
        with open(os.path.join(HERE, 'fp-build.sh')) as f:
            pipes = [l.strip() for l in f if 'sort -z' in l and 'shasum' in l]
        want = subprocess.run(['bash', '-c', pipes[0], 'bash', d], capture_output=True, text=True).stdout.strip() if len(pipes) == 1 else ''
        case('the app\'s fingerprint is fp-build.sh\'s (its app_print line run on a scratch bundle: every file by path in byte order, no link)',
             len(want) == 16 and app_hash(d) == want, (app_hash(d), want, pipes))
    if bad:
        print('native-chat self-test: %d of %d cases wrong' % (len(bad), n[0]))
        return 1
    print('native-chat self-test: %d cases, every verdict as expected' % n[0])
    return 0


def main():
    ap = argparse.ArgumentParser(description='The live native Coach on one simulator and one root (test-native.sh\'s coach half).')
    ap.add_argument('--phone')
    ap.add_argument('--shell', default='61')
    ap.add_argument('--root', choices=('tabs', 'classic'), default='tabs')
    ap.add_argument('--only', default='', help='a comma list of %s (prepare and restore always run)' % ', '.join(ALL[1:-1]))
    ap.add_argument('--out', default=tempfile.gettempdir())
    ap.add_argument('--self-test', action='store_true', help='the run\'s own judging on made-up records (no simulator)')
    opts = ap.parse_args()
    if opts.self_test:
        sys.exit(self_test())
    if not opts.phone:
        ap.error('--phone is needed (or --self-test)')
    only = [x for x in opts.only.split(',') if x]
    bad = [x for x in only if x not in ALL]
    if bad:
        print('native-chat: no scenario %s (there are %s)' % (', '.join(bad), ', '.join(ALL)))
        sys.exit(2)
    if not nsh.sim_lock_held():
        d, pid = nsh.sim_lock_holder()
        print('native-chat: the paired simulators\' lock (%s) is not this run\'s (holder pid %s): run test-native.sh, which takes '
              'it, or take it around this run' % (d, pid))
        sys.exit(2)
    os.makedirs(opts.out, exist_ok=True)
    sim = Sim(opts.phone)
    rt, name = sim.runtime()
    osv = rt.replace('iOS-', '').replace('-', '.')
    major = int(osv.split('.')[0]) if osv.split('.')[0].isdigit() else 0
    kind = 'classic' if (opts.root == 'classic' or (major and major < 26)) else 'tabs'
    cold = not nsh.booted(opts.phone)
    sim.boot()
    if cold:
        nsh.settle()
    rep = Report('%s %s, the %s root' % (name, rt, kind))
    print('== the live native chat on %s (%s, %s): the %s root%s, shell %s' % (
        name, rt, opts.phone, kind, ' by the policy offs file' if opts.root == 'classic' else '', opts.shell), flush=True)
    c = Ctx(sim, rep, opts, kind, osv)
    t0 = time.time()
    signal.signal(signal.SIGTERM, _term)
    try:
        ident = app_identity(sim)
        rep.fact('setup', 'the app on the phone: build %s, page %s, fingerprint %s (fp-build.sh\'s: a build\'s build-id.txt names it as '
                          '`app`, with the tree the build came from)' % (ident['build'], ident['page'], ident['app']))
        kept = keep_shell(c)
    except RuntimeError as e:   # simctl's get_app_container (no app installed), or the preferences not the container's
        print('native-chat: nothing run on %s: %s (the app must be installed, and its preferences reachable through the simulator\'s '
              'cfprefsd)' % (opts.phone, e))
        sys.exit(2)
    run(c, kept, only)
    aggregates(c)
    print('== %s: %d checks, %d failed, %.0f s' % (rep.label, len(rep.rows), len(rep.failed), time.time() - t0), flush=True)
    for scen, nm, ok, detail in rep.failed:
        print('   FAILED [%s] %s -- %s' % (scen, nm, json.dumps(detail, default=str)[:600] if detail not in ('', None) else ''))
    sys.exit(1 if rep.failed else 0)


if __name__ == '__main__':
    main()
