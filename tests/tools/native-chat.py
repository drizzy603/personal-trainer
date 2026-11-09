#!/usr/bin/env python3
"""The live native Coach in the real app (plan tasks C7 and T21), the coach half of test-native.sh.

test-native.sh builds and installs the app (Debug, as build 61 at least, through tests/tools/fp-build.sh into
~/Library/Caches/FPKit/<checkout>/dd-native, holding the paired simulators' sim.lock) and calls this on the phone of the
paired iPhone + Watch. Every scenario drives the real index.html in the real Capacitor shell through the app's own
launch arguments (FPUI's ShellProbe, Debug builds only: `-fpShellProbe <steps>`, `-devNav <route>`, `-devTheme <room>`,
`-fpApiBase`); the app acts and reports, this decides, and every screen worth a look is shot by name into --out.

  native-chat.py --phone UDID --out DIR [--shell 61] [--root tabs|classic] [--only keys,live,connect,combos,...]

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
Support/FPShell) and its UserDefaults copies are kept before the first launch and put back after the last, as
probe-selftest.py does (its helpers), with the offs file a classic pass wrote. The put-back stops the simulator's
cfprefsd around its edit, and launchd holds back a daemon it started less than 10 s ago: the run ends only once the
daemon answers again (prefs_back), so the launch that follows the run (test-native.sh's clean relaunch and its boot
shot) does not wait at its first preferences read.

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
           coach/chat presented .overFullScreen, coach and log/workout the page's own under its own tab bar. Shots
           coach-chat-*, coach-home-*, tabs-log-*; the phone's settings go back
  textoff  the phone at extra-extra-large and the app's Larger Text turned off with the chat up: the empty composer is as
           tall as at Large (the chat is pinned to Large, its field too), and the phone's setting goes back
  restore  what prepare kept goes back (only the values that changed), the key as it was, the composer empty, read back
           in the next launch (never a reload: a page reloaded under the tab root counts as hidden in use)

Aggregates, over every state of every launch: the web view never left its window (leftWindow and leftWindowAny 0) and
the page saw no visibilitychange; on the tab root no fallback (no fellBack event, none in any state); every launch ran
to its end; every shot was taken while the app held still at its mark.

Shots: a mark holds the app still until its shot is on disk (native-shell.py's go files: the page waits for the go file
the runner writes once `simctl io screenshot` has returned), so a loaded machine cannot shoot the next step; a shot the
app did not hold still for fails the shots check, but for a transient mark (a toast), which is reported. Each shot is
<label>.png in --out on the tab root, classic-<label>.png on the classic root.

Exit 1 when any check fails, 2 on bad arguments or when the paired simulators' lock is not this run's.
"""
import argparse
import glob
import importlib.util
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import time

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
# N5: the pending photo's tallest, in points at the Large text size (CoachComposer's imageCap: the web's 140 px, 96 under
# kb-open); a square photo is drawn at the cap exactly.
PHOTO_CAP_DOWN, PHOTO_CAP_UP = 140, 96
# The ground of the native Coach tab's screens (the hub, the connect screen) as a shot draws it: a strip down the left
# edge, where no row, card or title reaches (Heavyweight's paper about 245 of 255, Lime's dark ground under 30). The
# bounds are the bar's (native-shell.py's DARK_BAR_MAX, LIGHT_BAR_MIN).
GROUND_X, GROUND_TOP = (2, 12), 140
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
            rb.get('style') == want and rb.get('containerStyle') in (want, None), short(rb, ('style', 'containerStyle', 'hidden')))
    if drawn:
        luma, seen = nsh.drawn_bar(e, tag, label)
        c.check(s, '%s: the bar draws %s in the shot (the mean luminance of its frame %s of 255; on iOS 26.5 the glass the other '
                   'way is H9f1)' % (combo, want, bound(want)), looks(luma, want), seen)


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
# The room the page paints (-devTheme paints one for the launch and never saves it).
ROOM_JS = "return { room: document.documentElement.getAttribute('data-room'), saved: localStorage.getItem('kt_theme') };"
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
        for room, style in ROOMS.items():
            for appearance in ('light', 'dark'):
                for size, category in SIZES.items():
                    nsh.appearance(sim, appearance)
                    sim.sh('xcrun', 'simctl', 'ui', sim.udid, 'content_size', size)
                    tail = '%s-%s-%s' % ('lime' if room == 'dark' else room, appearance, 'xxl' if size != 'large' else 'l')
                    combo = '%s, phone %s, %s' % (room_name(room), appearance, size)
                    combo_chat(c, s, room, style, category, 'coach-chat-' + tail, combo)
                    combo_hub(c, s, room, 'coach-home-' + tail, combo)
                    combo_log(c, s, room, 'tabs-log-' + tail, combo)
    finally:
        nsh.appearance(sim, was_app if was_app in ('light', 'dark') else 'light')
        if was_size and was_size not in ('unknown', 'unsupported'):
            sim.sh('xcrun', 'simctl', 'ui', sim.udid, 'content_size', was_size, check=False)
    c.rep.fact(s, 'the phone is back to %s, %s' % (was_app, was_size))


def combo_chat(c, s, room, style, category, name, combo):
    ev = probe(c, name, [[wait_coach('up'), wait(900), state('chat'), mark(name)]], args=['-devNav', 'coach/chat', '-devTheme', room])
    e = ev.state('chat')
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


def combo_hub(c, s, room, name, combo):
    how = {'home': True} if c.tabs else {'web': True}
    ev = probe(c, name, [[js('hub', WAIT_JS, tab='coach', ms=10000, **how), wait(900), state('hub'), js('room', ROOM_JS), mark(name)]],
               args=['-devNav', 'coach', '-devTheme', room])
    e, w, rm = ev.state('hub'), result(ev, 'hub'), result(ev, 'room')
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
    c.check(s, '%s: the page paints its room (data-room %s)' % (combo, room), rm.get('room') == room, rm)


def combo_log(c, s, room, name, combo):
    ev = probe(c, name, [[js('log', WAIT_JS, tab='log', ms=10000), wait(900), state('log'), js('room', ROOM_JS), mark(name)]],
               args=['-devNav', 'log/workout', '-devTheme', room])
    e, w, rm = ev.state('log'), result(ev, 'log'), result(ev, 'room')
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
    c.check(s, 'the native composer is empty', store(ev.state('restored')).get('draft') in ('', None), store(ev.state('restored')).get('draft'))


# ── the shell's own state, kept and put back ────────────────────────────────────────────────────────────────────────

def keep_shell(c):
    """Before the first launch: the shell's folder and its UserDefaults copies (probe-selftest.py's helpers), and the offs
    file's place in the container (a classic pass writes it)."""
    sim = c.sim
    sim.terminate()
    kept = {'tmp': tempfile.mkdtemp(prefix='native-chat-'), 'folder': None, 'offs': None}
    if os.path.isdir(ps.shell_folder(sim)):
        kept['folder'] = os.path.join(kept['tmp'], 'FPShell')
        shutil.copytree(ps.shell_folder(sim), kept['folder'])
    kept['prefs'] = ps.read_shell_prefs(sim)
    offs = sim.path(nsh.OFFS_FILE)
    if os.path.exists(offs):
        with open(offs, 'rb') as f:
            kept['offs'] = f.read()
    if c.root_args:
        with open(offs, 'w') as f:
            json.dump(nsh.OFFS, f)
    c.rep.fact('setup', 'the shell\'s folder (%s) and UserDefaults copies (%s) kept to put back%s' % (
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


PREFS_BACK_MOST = 40


def prefs_back(sim, most=PREFS_BACK_MOST):
    """The simulator's preferences daemon answering again, after the put-back's stops: the seconds it took, None when it
    did not answer within `most`. The put-back stops cfprefsd three times within seconds (probe-selftest.py's
    prefs_settle: before its edit, after it, and for the read back); any process's read starts the daemon again in
    between, and launchd starts a daemon that ran under 10 s only once the 10 s are over (its throttle). Until then
    every process in the simulator waits at its first preferences read: a launch draws nothing of its own, on a black
    screen or its launch screen. test-native.sh's boot shot, 4 s after its clean relaunch, came out black (iOS 26.5,
    2026-11-09): the app's first log line came 8.5 s after its launch, and a read after a young daemon's stop
    measured 7.7 to 10.4 s. A read of the global domain from outside the app's container (nothing of the app's is
    read or written) waits for the daemon as the app would, and returns once it is back."""
    t0 = time.time()
    try:
        sim.sh('xcrun', 'simctl', 'spawn', sim.udid, 'defaults', 'read', '-g', 'AppleLocale', check=False, timeout=most)
    except subprocess.TimeoutExpired:
        return None
    return time.time() - t0


def put_back_shell(c, kept):
    """After the last launch: the shell's folder and copies as found (a decline, a verdict, a switch, the counters, the
    markers the run's own terminations left), the offs file as found; all read back."""
    sim = c.sim
    try:
        ps.put_back_shell(sim, kept['folder'])
        ps.put_back_shell_prefs(sim, kept['prefs'])
        offs = sim.path(nsh.OFFS_FILE)
        if kept['offs'] is None:
            if os.path.exists(offs):
                os.remove(offs)
        else:
            with open(offs, 'wb') as f:
                f.write(kept['offs'])
        now, was, live = ps.read_shell_prefs(sim), tree_bytes(kept['folder']), tree_bytes(ps.shell_folder(sim))
        diff = sorted(k for k in ps.SHELL_PREFS if now.get(k) != kept['prefs'].get(k))
        diff += ['FPShell/%s' % f for f in sorted(set(was or {}) | set(live or {})) if (was or {}).get(f) != (live or {}).get(f)]
        if (was is None) != (live is None):
            diff.append('FPShell (%s)' % ('there' if live is not None else 'gone'))
        c.check('restore', 'the shell\'s folder and UserDefaults copies (%s) put back as found, the offs file too' % ', '.join(ps.SHELL_PREFS),
                not diff and (os.path.exists(offs) == (kept['offs'] is not None)), diff)
    finally:
        shutil.rmtree(kept['tmp'], ignore_errors=True)
        took = prefs_back(sim)
        c.check('restore', 'the phone\'s preferences daemon answers again before the run hands the phone back (launchd holds back a '
                           'cfprefsd stopped young; a launch meanwhile waits at its first preferences read)', took is not None,
                'no answer in %d s' % PREFS_BACK_MOST if took is None else 'after %.1f s' % took)


# ── the run's own checks ─────────────────────────────────────────────────────────────────────────────────────────────

def aggregates(c):
    rows = [(sc, e.get('label'), shellst(e).get('leftWindow'), shellst(e).get('leftWindowAny'), page(e).get('visEvents')) for sc, _t, e in c.states]
    c.check('window', 'the web view never left its window (leftWindow and leftWindowAny 0 in every state, %d states)' % len(rows),
            bool(rows) and all(a == 0 and b == 0 for _, _l, a, b, _v in rows), sorted({sc for sc, _l, a, b, _v in rows if a or b}))
    c.check('window', 'the page saw no visibilitychange in any state', all(v in ([], None) for *_x, v in rows),
            sorted({sc for sc, _l, _a, _b, v in rows if v}))
    if c.tabs:
        fell = c.fellbacks + [(sc, t, (root(e).get('fellBack') or {}).get('why')) for sc, t, e in c.states if root(e).get('fellBack')]
        c.check('root', 'the tab root never fell back (no fellBack event and none in any state; no-hello above all)', not fell, fell[:5])
    out = [(sc, t) for sc, t, x in c.launches if x]
    c.check('launches', 'every launch ran to its end (no probe timed out; %d launches)' % len(c.launches), not out, out)
    late = [r for r in c.shots if r.get('late') and not r.get('transient')]
    c.check('shots', 'every shot taken while the app held still at its mark (%d shots)' % len(c.shots), not late,
            [(r.get('file'), r.get('why')) for r in late][:6])
    gone = [r for r in c.shots if r.get('late') and r.get('transient')]
    if gone:
        c.rep.fact('shots', 'transient marks shot after their cap (their subject may be gone): %s' % ', '.join(r.get('file') for r in gone))
    ms = sorted(r.get('ms') or 0 for r in c.shots)
    if ms:
        c.rep.fact('shots', '%d shots, median %d ms, longest %d ms' % (len(ms), ms[len(ms) // 2], ms[-1]))


ALL = ['prepare', 'smoke', 'keys', 'live', 'connect', 'combos', 'textoff', 'restore']


def main():
    ap = argparse.ArgumentParser(description='The live native Coach on one simulator and one root (test-native.sh\'s coach half).')
    ap.add_argument('--phone', required=True)
    ap.add_argument('--shell', default='61')
    ap.add_argument('--root', choices=('tabs', 'classic'), default='tabs')
    ap.add_argument('--only', default='', help='a comma list of %s (prepare and restore always run)' % ', '.join(ALL[1:-1]))
    ap.add_argument('--out', default=tempfile.gettempdir())
    opts = ap.parse_args()
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
    try:
        kept = keep_shell(c)
    except RuntimeError as e:   # simctl's get_app_container: the app is not installed
        print('native-chat: the app\'s container on %s is not readable (%s): install the app first' % (opts.phone, e))
        sys.exit(2)
    try:
        c.scen = 'prepare'
        print('-- prepare', flush=True)
        try:
            ready = scen_prepare(c)
        except Exception as e:  # a launch that breaks is a failure; restore still runs
            import traceback
            traceback.print_exc()
            ready = rep.check('prepare', 'ran to the end', False, repr(e)[:300])
        if not ready:
            rep.check('prepare', 'the scenarios run only on the root they are written for: none ran', False, c.root)
        for scen in ALL[1:]:
            if scen != 'restore' and (not ready or (only and scen not in only)):
                continue
            c.scen = scen
            print('-- %s' % scen, flush=True)
            try:
                globals()['scen_' + scen](c)
            except Exception as e:  # a scenario that breaks is a failure; the next still runs (restore above all)
                import traceback
                traceback.print_exc()
                rep.check(scen, 'ran to the end', False, repr(e)[:300])
    finally:
        c.scen = 'end'
        put_back_shell(c, kept)
    aggregates(c)
    print('== %s: %d checks, %d failed, %.0f s' % (rep.label, len(rep.rows), len(rep.failed), time.time() - t0), flush=True)
    for scen, nm, ok, detail in rep.failed:
        print('   FAILED [%s] %s -- %s' % (scen, nm, json.dumps(detail, default=str)[:600] if detail not in ('', None) else ''))
    sys.exit(1 if rep.failed else 0)


if __name__ == '__main__':
    main()
