#!/usr/bin/env python3
"""The native shell scenarios (plan tasks C5 and T16): the TrovoShell plugin, ScreenHost, PageLink and build 61's tab
root in the real app, on an iOS simulator.

tests/native-shell.sh builds the app (Debug, as build 61 at least, through tests/tools/fp-build.sh into
~/Library/Caches/FPKit/<checkout>/dd-shell, holding the paired simulators' sim.lock) and calls this once per phone and
root. Every scenario drives the real index.html in the real Capacitor shell through the app's own launch arguments
(FPUI's ShellProbe, Debug builds only: `-fpShellProbe <steps>`); the app acts and reports, this decides.

  native-shell.py --phone UDID --app App.app [--root tabs|classic] [--only a,b] [--out DIR] [--keep-data|--no-install]
  native-shell.py --list         # every scenario, the modules' included, in the order a run takes them
  native-shell.py --self-test    # the module loader on scratch modules (no simulator)

Two roots (plan T16 item 2, D-T5). `--root tabs` (the default) launches as the tools always have, `-fpOffline` alone
(the compiled policy: every piece on, whatever copy the container stores), so an iOS 26+ phone builds the tab root: the
native tab bar, the native Coach tab, the chat pushed on its stack. `--root classic` writes the policy offs (plan
13-tests-release.md section 6: `coachHome` and `tabs` off) into the app's container as fp-policy-offs.json and adds
`-fpPolicyFile fp-policy-offs.json -fpPolicyEvery 0` to every launch (every launch is then due, and a file source is read
at once, before the root is decided), which gives build 60's look on 61's binary: the page's own tab bar and the chat
presented over the page, what the owner's first launches show (contract 10.4, 10.6). An iOS 17 or 18 phone builds the
classic root either way (the OS). Each pass starts from a fresh container (delta 16.7: the app uninstalled and installed
again, so nothing an earlier run left, a decline, a verdict, a switch, a stored policy, decides the root), seeds it (the
probe's key, a starter programme, a short conversation, Heavyweight) and checks the root its launches build before any
scenario runs. `--keep-data` installs over the container instead (a tab pass then turns a decline, a verdict, a trip or
the bar's switch back on through TrovoShell if the root comes up classic); `--no-install` keeps the installed app too.

Scenarios (build 60's nine and teardown, under both roots; decision.md section 9, plan tasks C5 and T16):
  smoke    a -fpSmoke launch logs "fp: ping ok v1" (that launch's process); the launch built this pass's root; hello
           negotiates v1 with the coach on the classic root, the three pieces on the tab root (the flag's bar 83 high
           over the window's inset, its first tab); bootDone; Settings > About's Native tab bar and Native Coach rows as
           the root leaves them (the classic root by policy: "Off by the policy file" and "On . the iPhone's own chat
           screen"); the share hook writes its file into the App Group's container (the page's own reads held off)
  chat     classic: the native chat presented .overFullScreen over the page; tab root: Coach selected, the chat pushed
           on the NATIVE Coach stack (host stack, not modal; the root's coach {mode native, pushed, depth 2}), the web
           view in the Coach slot, in its window, hidden and hidden from VoiceOver, the bar shown; both: the room's
           appearance, a message, the model switch, a forwarded confirm and Undo toast, the screen marker, Back (on the
           tab root to the hub: its marker, the page still covered on view home), no visibilitychange; Lime is dark on a
           light phone and Heavyweight light on a dark phone (on the tab root the bar too, as its style and as the shot
           draws it: the mean luminance of its frame)
  focus    a focused web field, then the chat put up and taken down (classic: by the page, by Back, by the edge pan;
           tab root: by the page, by Back, by navPop): no keyboard comes back, nothing is focused, the document is not
           scrolled; an edge pan let go early leaves the chat up; on the tab root interactivePop is on for a chat with
           Back and off in setup
  wckill   a WebContent kill with the chat up: the new document takes it over (on the tab root coachHome and the chat,
           the Coach tab NATIVE throughout, no WEB frame), the shell resyncs on its boot without resending (the send in
           flight ends as gone, its words back in the composer), and the open confirm closes as stale
  marker   a planted crash marker (presenting coach@...; on the tab root presenting coachHome@... too) brings back the
           web Coach, once: the verdict stays for this shell and page build; Settings > About says why and lists the
           shell's counters; its Try again (on 61's page: coachHome, then coach) brings the native Coach back next launch
  policy   the policy file's screens.coach "off" takes the native chat down at once (on the tab root the Coach tab turns
           WEB, coachHome going by needs, the bar staying) and About says so; "on" again from the next document; on the
           tab root screens.coachHome "off" too
  breaker  intents timing out three times in a row (classic: pings; tab root: coach.* intents, which count for the chat
           alone) turn the chat off for the page build (on the tab root the Coach tab WEB, coachHome by needs, the bar
           staying); About says it is paused; Try again brings it back
  counters the web view taken out of its window with the chat up (the fault the shell counts, never by design): the
           leave-window counts (active and any state) and the hidden page go up, About's sheet lists them; on the tab
           root a stray selection (selectedIndex behind the funnel) is counted and redirected, and both 61 sheets list
           it; from then on nothing leaves the window or hides the page again (the stray's redirect, About's tab moves)
  inactive the app sent to the background right after launch, so the page presents the chat (on the tab root the Coach
           stack) while it is not active: no screen marker while it is away, no verdict at the next launch
  teardown the scene torn down and connected again with the chat up (sceneCycle: the App's replay of SceneDelegate's
           teardown and connection, which UIKit never makes on an iPhone): a new root of the pass's kind in a new window
           around a new web view, and 5 s later the web view, the root and the window it replaced all let go
           (ShellProbe's replaced; delta 17.10, 20-order 9 item 35), the teardown's moves no leave-window fault, the new
           document negotiating the root's pieces again

Modules (plan T16 item 1, D-T5; 20-order 9 item 8). Every tests/tools/shellscen/*.py but _*.py is loaded with importlib
and exports SCENARIOS = [(name, function, rank, backgrounds[, marks]), ...]. `function(c)` runs the scenario on the
context below. `rank` orders the modules' scenarios after the base ones (lower first; ties by file name, then by place).
`backgrounds` says the scenario sends the app to the background (its states may hold visibilitychange events). `marks`
is optional: True or False is `leaves` alone (as before), or a dict {'leaves': bool, 'roots': 'tabs' | 'classic' |
'both'} with either key left out (roots may also be a list of 'tabs' and 'classic'). `leaves` says the scenario takes
the web view out of its window on purpose (its states are exempt from the window aggregate, and from the visibility
aggregate once it has left: counters). `roots` names the roots it runs under, both by default: a tab-root-only row is
{'roots': 'tabs'} (N15's coachtab and intakeway, T17-T20's). A pass on another root skips it, says so as a fact and
never counts it as run; a pass with nothing of --only to run on its root says so and ends before it boots or installs
anything (exit 0). `--only` takes any name; a module that does not load, a malformed row or a name taken twice stops
the run before any launch (exit 2). A module reaches the helpers with `import native_shell as shell` (this file
registers itself under that name before it loads them): shell_probe, state, js, wait, mark (cap, transient), intent,
step, shot, sim_lock_held, plant and clear_runner_markers, appearance, drawn_bar, the readers (page, shellst, screens,
coach, home, root, rcoach, rweb, rbar, stack, fp, shown, replaced, intents, page_events, kb_shown, markers,
screen_markers, unsettled, marker_state, verdicts), the About steps and readers (about, about_of, about_words) and the
seed's strings. The context c carries c.sim (Sim, from native-store.py), c.rep (check, fact), c.opts, c.page (the page
build), c.root ('tabs' or 'classic': what this pass's launches build), c.tabs (c.root == 'tabs'), c.os ('27.0'),
c.os_major and c.shell (the binary's build).

Aggregates (plan T16 item 3), over every state of every launch of a pass: leftWindow and leftWindowAny 0 (but in the
scenarios that leave), visEvents empty (but in the scenarios that background, and in those that leave once they have
left: a state whose leftWindowAny is above 0), no fellBack with why no-hello in any launch (maps/lessons.md:82), every
launch run to its end (no probe timed out), every shot taken while the app held still at its mark. Marker checks read
the screen markers (presenting.*) and the state byte of section.tabs.marker and model.<screen>.marker, which rest at 0
between sections (contract 10.2): describe()'s markers lists every .marker file, so a non-empty list is no verdict.
Before a launch that reads verdicts (plant, inactive) what the runner's own terminate left goes, so that launch reads
only what the scenario planted: a screen marker the previous launch's last state listed with its screen up is removed
(a fact); any other screen marker, and a section or model marker left at 1 (sections last milliseconds: one left open at
rest turns any kill into a crash verdict), is a failed check naming the file and that launch, and goes all the same (a
fact instead when that launch timed out: the runner ended it wherever it was).

Shots: a mark holds the app still until its shot is on disk. The probe logs the mark, holds MARK_HOLD ms, then waits in
the page (a js step) for a go file the runner writes into the probe's folder once `simctl io screenshot` has returned
(the page reads it through Capacitor's own file URL, convertFileSrc); the runner takes the shot as soon as it reads the
mark. However long a screenshot takes on a loaded machine (5 to 16 s at a 1-minute load of 200, where a fixed hold of
1.5 s and then 3.5 s let a shot show the next step), the app does not move during it. A shot held still only when the
page's wait saw the go file and went on after the shot ended (its js event's wall time, the host's clock, which the
simulator's app runs on, at or after the shot's end); else it is late (the cap of SHOT_CAP ms at most, no page to wait
in, a go file seen too early) and fails the shots check, but for a `transient` mark, whose subject has a shorter life
of its own (a toast: 2.2 s, an Undo toast 6 s; its cap stays under that life so the steps after it still find it),
which is reported instead. The marks of one launch need labels distinct as file names (the go file and the PNG are
named by them): two that are not stop the launch before it starts. Each shot is named
<runtime>-<root>-<scenario>-<launch>-<label>.png in --out, and a scenario's older shots of the same runtime and root go
first, so a run on another runtime never overwrites them.

Exit 1 when any check fails, 2 on bad arguments or a module that does not load.
"""
import argparse
import glob
import importlib.util
import json
import os
import re
import signal
import struct
import subprocess
import sys
import tempfile
import time
import traceback
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('native_store', os.path.join(HERE, 'native-store.py'))
ns = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ns)   # its Sim, Events, read_log and Report (nothing runs on import)
# The modules import this file by this name (its own has a hyphen). A tool that loads this file with importlib and does
# not register it first (probe-selftest.py) finds no entry under its spec's name, and needs none: only main() loads the
# modules.
if __name__ in sys.modules:
    sys.modules.setdefault('native_shell', sys.modules[__name__])

Sim, Events, read_log, Report = ns.Sim, ns.Events, ns.read_log, ns.Report
SCEN_DIR = os.path.join(HERE, 'shellscen')
API_KEY = 'sk-ant-probe-not-a-key'
OVER_FULL_SCREEN = 5          # UIModalPresentationStyle.overFullScreen
LIGHT, DARK = 1, 2            # UIUserInterfaceStyle
TAB_IDS = ('log', 'progress', 'coach', 'settings')   # the page's FP_TAB_IDS: the tabs a flag's tabs.selected may name
BAR_H, BAR_SAFE = 83, (34, 0)  # the tab root's bar (delta 14.1): 83 on every iPhone, safe = the window's inset
MARK_HOLD = 250               # the probe's own hold at a mark (ms), before it waits for the runner's shot of it
SHOT_CAP = 60000              # the longest a mark waits for its shot (ms): past it the probe goes on, and the shot is late
ROOTS = ('tabs', 'classic')   # the roots a pass builds, and a scenario row's `roots` names
# The bar as a shot draws it: the mean luminance (0-255) of its frame, as measured on the chat's shots (64cba89,
# 655eb6a), (the room's look, the fault's): Lime's dark glass over the dark Coach stack 35 on iOS 27.0, H9f1's light
# glass over it 128-129 on iOS 26.5; Heavyweight's light bar over paper 239 on both runtimes, the phone light or dark,
# and iOS 26.5's dark glass over paper on a phone set to dark 162 (H9f1's too). Each bound keeps at least a third of the
# gap between the two on either side (the self-test holds it), so a fault a shade off still fails.
BAR_LOOKS = {'dark': (35, 128), 'light': (239, 162)}
DARK_BAR_MAX, LIGHT_BAR_MIN = 80, 200
OFFS_FILE = 'fp-policy-offs.json'
GROUP = 'group.app.kt.trainer'   # the App Group (a build signed to run locally has its container)
# Plan 13-tests-release.md section 6's offs (T7): build 61 builds the classic root, build 60 is unchanged.
OFFS = {'v': 1, 'store': {'facade': 'on', 'repair': 'off'}, 'screens': {'coach': 'on', 'coachHome': 'off', 'tabs': 'off'}}
OFFS_ARGS = ['-fpPolicyFile', OFFS_FILE, '-fpPolicyEvery', '0']
# What Settings > About's rows say under build 61's binary (contract 10.5, the page's _fpTabsState and _fpCoachState).
TABS_ON = 'On · the iPhone’s own tab bar'
POLICY_LINE = 'Off by the policy file'
TABS_POLICY = POLICY_LINE
TABS_OS = 'Off: needs iOS 26 or later'
COACH_TAB_ON = 'On · the iPhone’s own Coach tab'
CHAT_ON = 'On · the iPhone’s own chat screen'
CRASH_LINE = 'Off: the app closed with it open'
PAUSED_LINE = 'Paused: calls kept failing'
BACK_LINE = 'Back from the next launch'


def is_num(v, allowed):
    """v is a number (never a bool) equal to one of allowed."""
    return type(v) in (int, float) and v in allowed


def marker_state(line):
    """The state byte of a short-section marker line (contract 10.2: the marker line, a newline, then 1 inside a section
    and 0 outside), None for a line with none (a screen's presenting marker)."""
    head, nl, tail = (line or '').rpartition('\n')
    return tail if nl and len(tail) == 1 else None


# ── the pass: what every launch of one phone and root shares ────────────────────────────────────────────────────────

class Pass:
    """One phone and one root: where shots go and their names' prefix (runtime and root), the launch arguments the root
    asks for, the scenario running now, and what the aggregates read (a record per state, every fellBack, every shot)."""

    def __init__(self, sim=None, out=None, prefix='', root='tabs', args=()):
        self.sim, self.out, self.prefix, self.root, self.args = sim, out, prefix, root, list(args)
        self.scenario = 'setup'
        self.runs = 0
        self.records = []
        self.fellbacks = []
        self.shots = []
        self.launches = []
        self.last = None   # the newest launch: {scenario, tag, timedOut, state: its last state event or None}


PASS = Pass()


class LogTail:
    """The probe's log read as it grows: complete lines only, each byte read once."""

    def __init__(self, path):
        self.path, self.pos, self.buf, self.ev = path, 0, b'', Events()

    def read(self):
        try:
            with open(self.path, 'rb') as f:
                f.seek(self.pos)
                data = f.read()
        except FileNotFoundError:
            return self.ev
        self.pos += len(data)
        self.buf += data
        *lines, self.buf = self.buf.split(b'\n')
        for line in lines:
            line = line.strip()
            if line:
                try:
                    self.ev.append(json.loads(line.decode('utf-8', 'surrogatepass')))
                except ValueError:
                    pass
        return self.ev


def _slug(s):
    return re.sub(r'[^A-Za-z0-9._-]+', '-', str(s)).strip('-') or 'x'


def launch_args(tag, args, verdicts):
    """The probe's arguments, -fpOffline, -fpIgnoreMarker unless the launch reads verdicts, the pass's root arguments
    (none when the scenario names its own policy file: its JSON then carries what the root needs), the scenario's."""
    extra = [] if '-fpPolicyFile' in args else list(PASS.args)
    return ['-fpShellProbe', tag + '.json', '-fpShellProbeLog', tag + '.jsonl', '-fpOffline',
            *([] if verdicts else ['-fpIgnoreMarker']), *extra, *args]


def shot(sim, label, tag=None, mark_event=None, hold=None):
    """A screenshot now, as <runtime>-<root>-<scenario>[-<launch>]-<label>.png in the pass's folder. Taken for a mark
    (its event), it records when it started after the mark and when it ended (`end`, epoch ms); judge_shots then says
    whether the app held still until it ended (the mark's go file seen by the page after that). Called with a `hold` of
    its own (ms), it is late when it ends past it."""
    if not PASS.out:
        return None
    name = '-'.join(_slug(x) for x in (PASS.prefix, PASS.scenario, tag, label) if x) + '.png'
    path = os.path.join(PASS.out, name)
    if os.path.exists(path):
        os.remove(path)
    t0 = time.time()
    sim.screenshot(path)
    t1 = time.time()
    rec = {'scenario': PASS.scenario, 'tag': tag, 'file': name, 'path': path, 'label': label, 'ms': int((t1 - t0) * 1000),
           'end': int(t1 * 1000), 'ok': os.path.exists(path)}
    if mark_event is not None and mark_event.get('wall') is not None:
        rec['started'] = int(t0 * 1000 - mark_event['wall'])
        if hold is not None:
            rec['late'] = t1 * 1000 > mark_event['wall'] + hold
            rec['hold'] = hold
    PASS.shots.append(rec)
    return rec


def shoot_mark(sim, mark_event, tag, pdir, meta):
    """A mark's shot, and only then its go file: the page's wait for it lets the app go on once the shot is on disk.
    Returns the shot's record (None with no shots folder; the go file is written all the same)."""
    label = mark_event.get('label')
    rec = shot(sim, label, tag=tag, mark_event=mark_event)
    if rec is not None:
        rec['transient'] = bool((meta.get(label) or {}).get('transient'))
    with open(go_path(pdir, tag, label), 'w') as f:
        f.write('go\n')
    return rec


def judge_shots(recs, ev):
    """Whether the app held still for each mark's whole shot: the page's wait for the go file (its 'shot-wait' js event)
    said ok, and said it at a wall time at or after the shot's end (the host's clock, which the simulator's app runs
    on): the go file is written once the shot is on disk, so a page that went on earlier saw a go file too early. Else
    the shot is late, and `why` says what the wait said, with both times."""
    for rec in recs:
        e = ev.first('js', label='shot-wait ' + rec['label']) or {}
        res = e.get('result')
        w = res if isinstance(res, dict) else {}
        rec['waited'] = w.get('waited')
        wall, end = e.get('wall'), rec.get('end')
        if not e:
            rec['late'], rec['why'] = True, 'the page never answered the wait'
        elif not isinstance(res, dict):
            rec['late'], rec['why'] = True, 'the wait answered %r' % (res,)
        elif w.get('ok') is not True:
            rec['late'], rec['why'] = True, w.get('error') or 'the cap (%s ms), last %s' % (w.get('waited'), w.get('last'))
        elif not isinstance(wall, (int, float)) or not isinstance(end, (int, float)) or wall < end:
            rec['late'] = True
            rec['why'] = 'the page went on at %s, before the shot ended at %s (its go file seen too early)' % (wall, end)
        else:
            rec['late'] = False
            rec.pop('why', None)
    return recs


# A mark's wait for its shot (shell_probe adds it after every mark): the page fetches the go file the runner writes once
# the shot is on disk, through Capacitor's file URL (the app's own container: the simulator's app runs on the host's
# files), until it is there or `cap` ms have gone by. The app moves nothing meanwhile.
SHOT_WAIT_JS = r"""
var C = window.Capacitor;
if (!C || typeof C.convertFileSrc !== 'function') return { ok: false, error: 'no Capacitor.convertFileSrc' };
var url = C.convertFileSrc(args.path), t0 = Date.now(), polls = 0, last = null;
while (Date.now() - t0 < args.cap) {
  polls++;
  try { var r = await fetch(url, { cache: 'no-store' }); if (r.ok) return { ok: true, waited: Date.now() - t0, polls: polls }; last = 'status ' + r.status; }
  catch (e) { last = String((e && e.message) || e); }
  await new Promise(function (res) { setTimeout(res, 120); });
}
return { ok: false, waited: Date.now() - t0, polls: polls, last: last };
"""


def go_path(pdir, tag, label):
    """The go file of a mark: the runner writes it once the mark's shot is on disk."""
    return os.path.join(pdir, '%s.go.%s' % (tag, _slug(label)))


def with_shot_waits(phases, pdir, tag):
    """The phases with a wait for its shot after every mark (SHOT_WAIT_JS), and each mark's own settings by label. The
    go file and the PNG are named by the label's slug, so two marks of one launch whose labels make the same file name
    (one label twice, or 'a b' and 'a-b') are refused (ValueError): the second would be released by the first's go file
    and never shot."""
    out, meta, slugs = [], {}, {}
    for ph in phases:
        for s in ph:
            if s.get('op') == 'mark' and s.get('label'):
                k = _slug(s['label'])
                if k in slugs:
                    raise ValueError('launch %s: the marks %r and %r share the file name %s (their go file and their shot)'
                                     % (tag, slugs[k], s['label'], k))
                slugs[k] = s['label']
    for ph in phases:
        steps = []
        for s in ph:
            steps.append(s)
            if s.get('op') == 'mark' and s.get('label'):
                meta[s['label']] = s
                steps.append(js('shot-wait ' + s['label'], SHOT_WAIT_JS, path=go_path(pdir, tag, s['label']),
                                cap=int(s.get('cap') or SHOT_CAP)))
        out.append(steps)
    return out, meta


def clear_shots(scenario):
    """The scenario's older shots of this runtime and root (a run on another runtime or root keeps its own)."""
    if PASS.out:
        for p in glob.glob(os.path.join(PASS.out, '%s-%s-*.png' % (_slug(PASS.prefix), _slug(scenario)))):
            os.remove(p)


def _record(tag, ev):
    PASS.launches.append((PASS.scenario, tag, ev.timedOut))
    sts = ev.all('state')
    for e in sts:
        sh = shellst(e)
        PASS.records.append({'scenario': PASS.scenario, 'tag': tag, 'label': e.get('label'),
                             'leftWindow': sh.get('leftWindow'), 'leftWindowAny': sh.get('leftWindowAny'),
                             'visEvents': page(e).get('visEvents'), 'fellBack': root(e).get('fellBack')})
    for e in ev.all('fellBack'):
        PASS.fellbacks.append((PASS.scenario, tag, e.get('why')))
    PASS.last = {'scenario': PASS.scenario, 'tag': tag, 'timedOut': ev.timedOut, 'state': sts[-1] if sts else None}


def shell_probe(sim, name, phases, args=(), timeout=90, verdicts=False, during=None, until='done', out=None, end='terminate'):
    """One launch running `phases` (ShellProbe), with this pass's launch arguments. Every launch is offline (the bundled
    page under test) and, unless `verdicts`, ignores a crash marker the runner's own simctl terminate may have left with
    a screen up. Each `mark` gets its shot as soon as it is read (out=False: none). `during(events)` runs at every read;
    `until` is an event name or a function of the events read so far; `end` 'terminate' (simctl) or 'kill' (SIGKILL,
    as jetsam's). Each mark holds the app until its shot is on disk (with_shot_waits, shoot_mark, judge_shots), and the
    time a shot takes is added to `timeout`. Returns the events, with pid, tag and timedOut."""
    PASS.runs += 1
    tag = '%02d-%s' % (PASS.runs, name)
    pdir = sim.path('Documents', 'fp-probe')
    os.makedirs(pdir, exist_ok=True)
    for p in glob.glob(os.path.join(pdir, '*.go.*')):   # an earlier pass's go files (--keep-data) would release a mark at once
        os.remove(p)
    shots_on = out is not False and bool(PASS.out)
    meta = {}
    if shots_on:
        phases, meta = with_shot_waits(phases, pdir, tag)
    with open(os.path.join(pdir, tag + '.json'), 'w') as f:
        json.dump({'phases': phases}, f)
    logp = os.path.join(pdir, tag + '.jsonl')
    if os.path.exists(logp):
        os.remove(logp)
    met_fn = until if callable(until) else (lambda ev: bool(ev.first(until)))
    sim.terminate()
    pid = sim.launch(launch_args(tag, list(args), verdicts))
    tail, seen, shot_done, met, recs = LogTail(logp), 0, set(), False, []
    t_end = time.time() + timeout
    while time.time() < t_end:
        time.sleep(0.1)
        ev = tail.read()
        for e in ev[seen:]:
            label = e.get('label')
            if e.get('ev') == 'mark' and label and label not in shot_done:
                shot_done.add(label)
                if shots_on:
                    rec = shoot_mark(sim, e, tag, pdir, meta)
                    if rec is not None:
                        recs.append(rec)
                        t_end += rec['ms'] / 1000.0   # the app held still while it was taken
        seen = len(ev)
        if during:
            during(ev)
        if met_fn(ev):
            met = True
            break
    ev = tail.read()
    ev.pid, ev.tag, ev.timedOut = pid, tag, not met
    judge_shots(recs, ev)   # held still for the whole shot: the page went on only after it was on disk
    if end == 'kill' and pid:
        try:
            os.kill(pid, signal.SIGKILL)   # as jetsam ends an app in the background
        except ProcessLookupError:
            pass
        time.sleep(1.0)
    else:
        sim.terminate()
    _record(tag, ev)
    return ev


def step(op, **kw):
    s = {'op': op}
    s.update(kw)
    return s


def state(label):
    return {'op': 'state', 'label': label}


def js(label, src, **args):
    return {'op': 'js', 'label': label, 'src': src, 'args': args}


def wait(ms):
    return {'op': 'wait', 'ms': ms}


def mark(label, hold=MARK_HOLD, cap=SHOT_CAP, transient=False):
    """A shot of this moment: the app holds still until the runner's shot of it is on disk, `cap` ms at most. A
    `transient` mark shows something with a shorter life of its own (a toast); its cap stays under that life, and a
    shot that ended past it is reported, not failed (it may show the screen without the toast)."""
    return {'op': 'mark', 'label': label, 'hold': hold, 'cap': cap, 'transient': transient}


def intent(label, name, **args):
    return {'op': 'intent', 'label': label, 'name': name, 'args': args}


def booted(udid):
    """Whether the simulator is booted now."""
    out = subprocess.run(['xcrun', 'simctl', 'list', '-j', 'devices'], capture_output=True, text=True).stdout
    try:
        return any(d.get('udid') == udid and d.get('state') == 'Booted' for ds in json.loads(out)['devices'].values() for d in ds)
    except ValueError:
        return False


def load1():
    try:
        return float(subprocess.run(['sysctl', '-n', 'vm.loadavg'], capture_output=True, text=True).stdout.split()[1])
    except (IndexError, ValueError):
        return 0.0


def settle(least=60, most=240, calm=40):
    """A phone this run booted: its first boot's daemons run for minutes (a 1-minute load of 200 and more on this Mac,
    simctl calls timing out), so the scenarios wait at least `least` s, then until the load is under `calm` or `most` s
    have gone by."""
    t0 = time.time()
    while time.time() - t0 < most:
        if time.time() - t0 >= least and load1() < calm:
            break
        time.sleep(5)
    print('   the phone was shut down: %.0f s for its first boot to settle (1-minute load now %.0f)' % (time.time() - t0, load1()), flush=True)


def sim_lock_holder():
    """The paired simulators' lock (tests/tools/simlock.sh, the session's fplock): its folder and its holder's pid."""
    root_dir = os.environ.get('FP_LOCKS_ROOT') or os.path.expanduser('~/Library/Caches/FPKit')
    d = os.environ.get('FP_SIM_LOCK') or os.path.join(root_dir, 'sim.lock')
    pid = None
    for name, pick in (('owner', lambda t: t.split()[0]), ('pid', lambda t: t.strip())):
        try:
            with open(os.path.join(d, name)) as f:
                pid = int(pick(f.read()))
            break
        except (OSError, ValueError, IndexError):
            continue
    return d, pid


def sim_lock_held():
    """Whether this process or one of its ancestors holds sim.lock (a tool inside a hold counts it as its own)."""
    _, pid = sim_lock_holder()
    if not pid:
        return False
    p = os.getpid()
    for _ in range(64):
        if p == pid:
            return True
        if p <= 1:
            return False
        out = subprocess.run(['ps', '-o', 'ppid=', '-p', str(p)], capture_output=True, text=True).stdout.strip()
        if not out:
            return False
        p = int(out)
    return False


# ── what a shot draws ────────────────────────────────────────────────────────────────────────────────────────────────

def appearance(sim, value=None):
    """The phone's appearance (simctl ui): read it ('light' or 'dark'), or set it to `value` (RuntimeError when simctl
    refuses). What simctl reads back is what it stored, not what apps see: a launch proves that itself (SCHEME_JS)."""
    if value is None:
        return sim.sh('xcrun', 'simctl', 'ui', sim.udid, 'appearance', check=False).strip()
    sim.sh('xcrun', 'simctl', 'ui', sim.udid, 'appearance', value)
    return value


# What the app sees of the phone's appearance: the page's prefers-color-scheme. The web view keeps the phone's style on
# both roots (delta 16.1: the room's style goes on the bar, its container and the native screens, never on the window,
# the root, a slot or the web view), hidden under a native screen too. simctl's read-back does not show it: on a phone
# whose cfprefsd was stopped since its boot, `simctl ui appearance dark` is stored and read back while every launch
# stays light, until SpringBoard starts again (T21's review, 2026-11-09: a run's "phone dark" launches were light ones).
SCHEME_JS = "return { dark: window.matchMedia('(prefers-color-scheme: dark)').matches };"


def sees(ev, label='scheme'):
    """The phone's appearance as the launch's page saw it (its js step `label`, running SCHEME_JS): 'dark', 'light', or
    None when the step did not answer."""
    r = (ev.first('js', label=label) or {}).get('result')
    dark = r.get('dark') if isinstance(r, dict) else None
    return ('dark' if dark else 'light') if isinstance(dark, bool) else None


def png_bmp(png):
    """A PNG's pixels as an uncompressed BMP's bytes (sips, macOS's own image tool, converts it), or None."""
    with tempfile.TemporaryDirectory() as d:
        bmp = os.path.join(d, 'shot.bmp')
        r = subprocess.run(['sips', '-s', 'format', 'bmp', png, '--out', bmp], capture_output=True, text=True)
        if r.returncode != 0 or not os.path.isfile(bmp):
            return None
        with open(bmp, 'rb') as f:
            return f.read()


def bmp_size(data):
    """(width, height) in pixels of a BMP's bytes."""
    w, h = struct.unpack_from('<ii', data, 18)
    return w, abs(h)


def bmp_luma(data, rect, step=2):
    """The mean luminance (0-255: Rec. 709's weights on the sRGB bytes) of the pixels of `rect` (x0, y0, x1, y1 in
    pixels, clipped to the image), every `step`-th row and column, of an uncompressed 24- or 32-bit BMP (rows top-down
    or bottom-up, channels by its masks); None when the rect holds no pixel or the BMP is of another kind."""
    if data[:2] != b'BM':
        return None
    off = struct.unpack_from('<I', data, 10)[0]
    w, h, _, bpp, comp = struct.unpack_from('<iiHHI', data, 18)
    if bpp not in (24, 32) or comp not in (0, 3, 6):
        return None
    masks = struct.unpack_from('<III', data, 54) if comp in (3, 6) else (0xff0000, 0xff00, 0xff)
    chans = []
    for m, wt in zip(masks, (0.2126, 0.7152, 0.0722)):
        if not m:
            return None
        sh = (m & -m).bit_length() - 1
        chans.append((m, sh, wt * 255.0 / (m >> sh)))
    top_down, rows = h < 0, abs(h)
    bpx, stride = bpp // 8, ((w * bpp + 31) // 32) * 4
    x0, y0, x1, y1 = max(0, int(rect[0])), max(0, int(rect[1])), min(w, int(rect[2])), min(rows, int(rect[3]))
    total, n = 0.0, 0
    for y in range(y0, y1, step):
        base = off + (y if top_down else rows - 1 - y) * stride
        for x in range(x0, x1, step):
            p = base + x * bpx
            v = int.from_bytes(data[p:p + bpx], 'little')
            total += sum(((v & m) >> sh) * k for m, sh, k in chans)
            n += 1
    return total / n if n else None


def drawn_bar(e, tag, label):
    """The tab bar as a shot draws it, not as the root asks for it: the mean luminance (0-255) of the bar's frame
    (describe().root.bar.frame, in points) in the shot of mark `label` of launch `tag`, the frame scaled by the shot's
    width over the window's (the right edge of the web view's frame or the bar's, which both span it). Returns (luma,
    what was read) or (None, why not)."""
    rec = next((x for x in PASS.shots if x.get('tag') == tag and x.get('label') == label), None)
    if not rec or not rec.get('ok'):
        return None, 'no shot of the mark %r in launch %s' % (label, tag)
    fr, wf = rbar(e).get('frame') or {}, rweb(e).get('frame') or {}
    win = max((wf.get('x') or 0) + (wf.get('w') or 0), (fr.get('x') or 0) + (fr.get('w') or 0))
    if not fr.get('h') or not win:
        return None, 'no bar frame in the state (bar %s, web %s)' % (fr, wf)
    data = png_bmp(rec['path'])
    if not data:
        return None, 'sips could not read %s' % rec['file']
    pw, _ = bmp_size(data)
    k = pw / float(win)
    if not 1 <= k <= 4:
        return None, 'the shot is %d px wide for a window of %s points' % (pw, win)
    rect = (fr['x'] * k, fr['y'] * k, (fr['x'] + fr['w']) * k, (fr['y'] + fr['h']) * k)
    luma = bmp_luma(data, rect)
    info = {'shot': rec['file'], 'frame': fr, 'scale': round(k, 3), 'px': [int(v) for v in rect]}
    if luma is None:
        return None, dict(info, why='no pixel read')
    return round(luma, 1), dict(info, luma=round(luma, 1))


# ── the page's side ──────────────────────────────────────────────────────────────────────────────────────────────────

# The coach answers at once (no network): every chat turn gets one short reply.
STUB_JS = r"""
if (!window.__fpStub) {
  window.__fpStub = true; window.__fpTurns = 0;
  var real = window.fetch;
  window.fetch = function (u, o) {
    if (String((u && u.url) || u).indexOf('anthropic') < 0) return real.apply(this, arguments);
    var body = JSON.parse(o.body); if (body.tools) window.__fpTurns++;
    var text = body.tools ? 'Probe reply ' + window.__fpTurns + '.' : '{"message":"ok","actions":[]}';
    return Promise.resolve(new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant',
      content: [{ type: 'text', text: text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }),
      { status: 200, headers: { 'content-type': 'application/json' } }));
  };
}
return { turns: window.__fpTurns };
"""

# The pass's starting point: the probe's key (the chat needs one), a starter programme (the hub's own route, Today's
# card), a short conversation, Heavyweight, the native chat's device switch on, nothing left of setup or a hand-over.
SEED_JS = r"""
localStorage.setItem('kt_apikey', args.key);
localStorage.setItem('kt_theme', 'heavyweight');
localStorage.setItem('kt_coach_model', 'claude-sonnet-5-5');
['kt_native_off', 'kt_intake', 'kt_coach_handover'].forEach(function (k) { localStorage.removeItem(k); });
var now = Date.now();
localStorage.setItem('kt_coach_msgs', JSON.stringify([
  { role: 'user', content: 'How did my week go?', at: now - 120000 },
  { role: 'assistant', content: 'A strong week: every session done, squat up 5 lb.', at: now - 110000 }]));
var programme = false;
if (typeof getCustomRoutine === 'function' && !getCustomRoutine()) {
  setCustomRoutine(buildStarterRoutine({goal: 'muscle', days: 3, runs: 0, equip: 'full', exp: 1})); _startProgramme(); programme = true; }
return { ok: true, programme: programme, build: (typeof APP_BUILD !== 'undefined') ? APP_BUILD : null };
"""

# The page's own reads of a pending share (checkPendingShare: the boot's +2.5 s, a return's +0.6 s, one at a time by
# _shareBusy) held off for the rest of the launch: one under way is let finish, then _shareBusy stays set, so a share
# the probe's hook writes stays on disk for the runner (a late boot read would otherwise take it into the composer).
SHARE_HOLD_JS = r"""
for (var i = 0; i < 100 && window._shareBusy; i++) await new Promise(function (r) { setTimeout(r, 100); });
var busy = !!window._shareBusy;
if (!busy) window._shareBusy = true;
return { held: !busy && window._shareBusy === true, at: Math.round(performance.now()) };
"""

# About's Try again for the bar and the Coach (TrovoShell reset: a decline, crash verdicts and a breaker's trip go) and
# the bar's device switch on: the tab root from the next launch (a --keep-data tab pass that found the classic root).
ROOT_BACK_JS = r"""
var P = _fpPlugin(); if (!P) return { error: 'no TrovoShell' };
var out = {};
function say(k, p) { return Promise.resolve(p).then(function () { out[k] = 'ok'; }, function (e) { out[k] = 'refused: ' + String(e && e.message || e); }); }
await say('tabs', P.reset({screen: 'tabs'}));
await say('coachHome', P.reset({screen: 'coachHome'}));
await say('coach', P.reset({screen: 'coach'}));
if (typeof P.setSwitch === 'function') await say('switch', P.setSwitch({screen: 'tabs', on: true}));
return out;
"""


def page(e):
    return (e or {}).get('page') or {}


def shellst(e):
    return (e or {}).get('shell') or {}


def screens(e):
    return shellst(e).get('screens') or {}


def coach(e):
    return (screens(e).get('screens') or {}).get('coach') or {}


def home(e):
    return (screens(e).get('screens') or {}).get('coachHome') or {}


def root(e):
    return shellst(e).get('root') or {}


def rcoach(e):
    return root(e).get('coach') or {}


def rweb(e):
    return root(e).get('web') or {}


def rbar(e):
    return root(e).get('bar') or {}


def stack(e):
    return screens(e).get('stack') or {}


def fp(e):
    return page(e).get('fp') or {}


def replaced(e):
    """What a scene's teardown let go of, as a state after it reads it: {by, webView, root, window} (alive), {} before any.
    A scene is torn down by `sceneCycle` (H11's replay of StoreProbe.sceneReplay): UIKit refuses `sceneDestroy` for
    this one-scene iPhone app on both runtimes (delta 17.10), so a release check rests on sceneCycle's `replaced`, read
    in the states that follow it, never in the replay's own turn."""
    return (e or {}).get('replaced') or {}


def shown(e):
    return fp(e).get('shown') or {}


def status_screens(e):
    return (shellst(e).get('status') or {}).get('screens') or {}


def intents(ev, name=None, boot=None):
    """The last record of every intent (by seq), with `asked`: the probe time of its first record."""
    last, asked = {}, {}
    for e in ev.all('intent'):
        last[e['seq']] = e
        asked.setdefault(e['seq'], e.get('t'))
    rows = [dict(last[k], asked=asked[k]) for k in sorted(last)]
    return [r for r in rows if (name is None or r.get('name') == name) and (boot is None or r.get('boot') == boot)]


def page_events(ev, method=None, after=None):
    """The page's messages (method), after a probe time."""
    return [x for x in ev.all('page') if (method is None or x.get('method') == method) and (after is None or x.get('t', 0) > after)]


def kb_shown(e):
    return [k for k in (e or {}).get('keyboard') or [] if k.get('ev') in ('willShow', 'didShow')]


def markers(e):
    return screens(e).get('markers') or []


def screen_markers(e):
    """The screens' crash markers in describe()'s list ("presenting <screen>@<page> shell <n>")."""
    return [l for l in markers(e) if l.startswith('presenting ')]


def unsettled(e):
    """Short-section and model markers not resting at 0 (one at 1 is a crash verdict at the next launch)."""
    return [l for l in markers(e) if not l.startswith('presenting ') and marker_state(l) != '0']


def names_screen(lines, screen, c):
    return any(l.startswith('presenting %s@' % screen) and l.endswith('shell %s' % c.shell) for l in lines)


def verdicts(e, c, piece='coach'):
    """A piece's crash verdicts in the book for this page and shell build (another build's are not this run's)."""
    return [d for d in (shellst(e).get('book') or {}).get('disabled') or []
            if d.get('piece') == piece and d.get('page') == c.page and d.get('shell') == c.shell]


def trip_of(e, piece):
    return (((shellst(e).get('book') or {}).get('screens') or {}).get(piece) or {}).get('trip')


# Settings > About: a row scrolled into view, a sheet ('chat': the Native Coach one, 'tabs': the Native tab bar one, '':
# none), and everything the two rows and an open sheet say once the shell's status is in.
ABOUT_JS = r"""
switchTab('settings');
if (typeof closeNativeChatSheet === 'function') closeNativeChatSheet();
if (typeof closeNativeTabsSheet === 'function') closeNativeTabsSheet();
var row = document.getElementById(args.sheet === 'tabs' ? 'fp-tabs-row' : 'fp-chat-row') || document.getElementById('fp-chat-row');
if (row) row.scrollIntoView({block: 'center'});
if (args.sheet === 'chat') openNativeChatSheet();
if (args.sheet === 'tabs' && typeof openNativeTabsSheet === 'function') openNativeTabsSheet();
return true;
"""
ABOUT_READ_JS = r"""
for (var i = 0; i < 50 && !(window._fpChat && _fpChat.st); i++) await new Promise(function (r) { setTimeout(r, 100); });
await new Promise(function (r) { setTimeout(r, 400); });
var t = function (id) { var el = document.getElementById(id); return el ? el.innerText.replace(/\s+/g, ' ').trim() : null; };
return { row: t('fp-chat-row'), sub: t('fp-chat-sub'), sheet: t('fpChatBody'),
  tabsRow: t('fp-tabs-row'), tabsSub: t('fp-tabs-sub'), tabsSheet: t('fpTabsBody'),
  retry: !!document.getElementById('fp-chat-retry'), tabsRetry: !!document.getElementById('fp-tabs-retry'),
  status: (window._fpChat && _fpChat.st) || null, off: (window._fp && _fp.off) || null,
  b61: typeof _fpBinary === 'function' && _fpBinary('coachHome') };
"""
# About's Try again: the 61 sheet's #fp-chat-retry row (resets coachHome, then coach), else 60's _fpChatRetry.
RETRY_JS = r"""
var b = document.getElementById('fp-chat-retry');
if (b) { b.click(); return { clicked: true }; }
_fpChatRetry(); return { clicked: false };
"""


def about(sheet='chat', label='about'):
    """Steps: Settings > About, a sheet opened ('chat', 'tabs' or ''), then both rows and the sheet read (js label)."""
    return [js('open ' + label, ABOUT_JS, sheet=sheet), wait(1200), js(label, ABOUT_READ_JS)]


def about_of(ev, label='about'):
    return (ev.first('js', label=label) or {}).get('result') or {}


def about_words(ab):
    """The words of the page's About: build 61's under a binary with coachHome (contract 10.5), else build 60's."""
    if ab.get('b61'):
        return {'title': 'Native Coach', 'retry': 'Try the native Coach again', 'resets': ['coachHome', 'coach']}
    return {'title': 'Native Coach chat', 'retry': 'Try the native chat again', 'resets': ['coach']}


def ab_screen(ab, piece):
    return ((ab.get('status') or {}).get('screens') or {}).get(piece) or {}


class Ctx:
    def __init__(self, sim, rep, opts, root_kind='tabs', osv='?', major=0):
        self.sim = sim
        self.rep = rep
        self.opts = opts
        self.root = root_kind
        self.tabs = root_kind == 'tabs'
        self.os = osv
        self.os_major = major
        self.shell = opts.shell
        self.page = None


def ensure_page(c):
    if not c.page:
        ev = shell_probe(c.sim, 'page', [[state('page')]])
        c.page = shellst(ev.state('page')).get('pageBuild')


# ── the pass's setup ─────────────────────────────────────────────────────────────────────────────────────────────────

def prepare(c):
    """A fresh container (or the phone's, --keep-data/--no-install), the classic pass's offs file, the seed, then the
    root the pass's launches build. False when it is not the root the scenarios need (nothing then runs)."""
    s = 'setup'
    if not c.opts.no_install:
        if not c.opts.keep_data:
            c.sim.uninstall()   # delta 16.7: nothing an earlier run left decides the root
        c.sim.install(c.opts.app)
    if PASS.args:
        with open(c.sim.path(OFFS_FILE), 'w') as f:
            json.dump(OFFS, f)
    ev = shell_probe(c.sim, 'seed', [[wait(1500), js('seed', SEED_JS, key=API_KEY), state('seeded')]], timeout=120)
    seed = (ev.first('js', label='seed') or {}).get('result') or {}
    e = ev.state('seeded')
    c.page = shellst(e).get('pageBuild')
    c.rep.check(s, 'the pass\'s seed is written (the probe\'s key, a short conversation, Heavyweight%s)' % (
        ', a starter programme' if seed.get('programme') else ''), seed.get('ok'), (seed, ev.timedOut))
    kind = root(e).get('kind')
    if kind != c.root and c.tabs and (c.opts.keep_data or c.opts.no_install):
        st = status_screens(e)
        ev = shell_probe(c.sim, 'root-back', [[wait(800), js('back', ROOT_BACK_JS), wait(600)]])
        c.rep.fact(s, 'the kept container built the %s root (%s): reset through TrovoShell (%s)' % (
            kind, {k: (v or {}).get('off') for k, v in st.items()}, (ev.first('js', label='back') or {}).get('result')))
        ev = shell_probe(c.sim, 'root-again', [[wait(800), state('again')]])
        e = ev.state('again')
        kind = root(e).get('kind')
    c.rep.check(s, 'the pass\'s launches build the %s root (%s)' % (c.root, 'the policy offs file' if PASS.args else
                'iOS %s' % c.os if not c.tabs else '-fpOffline: the compiled policy'), kind == c.root,
                {'root': root(e).get('kind'), 'fellBack': root(e).get('fellBack'),
                 'screens': {k: {x: (v or {}).get(x) for x in ('on', 'off', 'why')} for k, v in status_screens(e).items()}})
    c.rep.fact(s, 'shell %s, page %s, %s root on iOS %s' % (c.shell, c.page, kind, c.os))
    return kind == c.root


# ── build 60's scenarios, under both roots ───────────────────────────────────────────────────────────────────────────

def scen_smoke(c):
    s = 'smoke'
    t0 = time.time()
    ev = shell_probe(c.sim, 'smoke', [[state('smoke')]], args=['-fpSmoke'])
    e = ev.state('smoke')
    c.page = shellst(e).get('pageBuild') or c.page
    # this launch's process only: a pass on the other root on the same phone (or an earlier run) logs the same line
    pred = 'subsystem == "app.kt.trainer" AND eventMessage CONTAINS "fp: ping"'
    if ev.pid:
        pred += ' AND processID == %d' % ev.pid
    out = c.sim.sh('xcrun', 'simctl', 'spawn', c.sim.udid, 'log', 'show', '--last', '%dm' % (int((time.time() - t0) / 60) + 2),
                   '--predicate', pred, '--style', 'compact', check=False)
    lines = [l for l in out.splitlines() if 'fp: ping' in l]
    ok = [l for l in out.splitlines() if 'fp: ping ok v1' in l and 'app.kt.trainer:shell' in l]
    c.rep.check(s, 'a -fpSmoke launch logs "fp: ping ok v1" (subsystem app.kt.trainer, that launch\'s process: pid %s)' % ev.pid,
                bool(ok) and bool(ev.pid), (ok or lines or ['no line'])[-1].strip()[:160])
    p, sh = page(e), shellst(e)
    # The screens compiled into the binary (FPCore ShellContract.binaryScreens): build 60 the chat alone, build 61 the
    # chat, the native Coach tab's home and the tab root (20-order 9 item 11). The root decides what is offered and
    # negotiated: the classic root offers the chat alone, as build 60 did; the tab root all three.
    binary = ['coach'] if int(c.shell) < 61 else ['coach', 'coachHome', 'tabs']
    kind = root(e).get('kind')
    c.rep.check(s, 'the launch built the %s root (describe().root.kind)' % c.root, kind == c.root, root(e) if kind != c.root else kind)
    hello = sorted((fp(e).get('hello') or {}).get('screens') or [])
    flag = p.get('flag') or {}
    want = ['coach', 'coachHome', 'tabs'] if c.tabs else ['coach']
    c.rep.check(s, 'hello negotiates v1 with %s (the page and the link agree)' % ', '.join(want), fp(e).get('v') == 1
                and hello == want and sh.get('phase') == 'linked' and sorted(sh.get('negotiated') or []) == want,
                '%s / %s %s' % (fp(e).get('hello'), sh.get('phase'), sh.get('negotiated')))
    tabs = flag.get('tabs') or {}
    bar = tabs.get('bar') or {}
    if c.tabs:
        # The tab root's own checks, one per cause (contract 2.1's canonical flag, delta 14.1's bar): the root is live,
        # its first bar is 83 high over the window's inset (34 or 0), and the flag names the tab the first frame shows.
        fell = root(e).get('fellBack')
        c.rep.check(s, 'the tab root is live (describe().root.fellBack is null)', fell is None, fell)
        offered = sorted(flag.get('screens') or []) == want
        what = 'the flag offers the three pieces and names the binary\'s screens'
        c.rep.check(s, 'the flag\'s first bar is %d high (delta 14.1: every iPhone the tab root runs on)' % BAR_H, is_num(bar.get('h'), (BAR_H,)), bar)
        c.rep.check(s, 'the flag\'s first bar sits over the window\'s bottom inset (safe 34 or 0)', is_num(bar.get('safe'), BAR_SAFE), bar)
        c.rep.check(s, 'the flag names the first frame\'s tab (tabs.selected: log, progress, coach or settings)', tabs.get('selected') in TAB_IDS, tabs.get('selected'))
        c.rep.check(s, 'the page is in tabs mode under the shell\'s bar (html.fp-tabs, its own #tabs hidden)', p.get('tabsMode')
                    and p.get('fpTabsClass') and p.get('tabsDisplay') == 'none', {k: p.get(k) for k in ('tabsMode', 'fpTabsClass', 'tabsDisplay', 'tabsWhy')})
    else:
        offered = flag.get('screens') == ['coach'] and 'tabs' not in flag
        what = 'the flag offers the coach (ScreenGate when the web view was set up) and names the binary\'s screens'
        c.rep.check(s, 'the page keeps its own tab bar (no tabs mode, #tabs shown)', not p.get('tabsMode') and not p.get('fpTabsClass')
                    and p.get('tabsDisplay') not in (None, 'none'), {k: p.get(k) for k in ('tabsMode', 'fpTabsClass', 'tabsDisplay')})
    c.rep.check(s, what, offered and flag.get('v') == 1 and sorted(flag.get('binary') or []) == binary, flag)
    c.rep.check(s, 'the page booted with the bridge (bootDone through TrovoShell)', sh.get('bootDones', 0) >= 1, sh.get('bootDones'))
    gc = c.sim.sh('xcrun', 'simctl', 'get_app_container', c.sim.udid, ns.BID, GROUP, check=False).strip()
    c.rep.check(s, 'the build carries the App Group\'s container (signed to run locally, FP_BUILD_SIGN=local: the share hook writes '
                'its file there, delta 17.7)', bool(gc) and os.path.isdir(gc), gc or 'none: an unsigned build')
    c.rep.fact(s, 'shell %s, page %s, root %s' % (c.shell, c.page, kind))
    if int(c.shell) < 61:
        return
    # Settings > About under build 61's binary (contract 10.5): the Native tab bar row says why the root is what it is,
    # and the Native Coach row reads the piece that hosts the Coach (_fpCoachHost).
    # Then the share hook (delta 17.7: T18's share scenarios need this build's App Group container), once the page's own
    # reads of a pending share are held off for the rest of the launch (SHARE_HOLD_JS), so the file is the runner's to read.
    ev = shell_probe(c.sim, 'smoke-about', [[wait(1000), *about(sheet='', label='about'), mark('about'), js('share hold', SHARE_HOLD_JS),
                                             {'op': 'share', 'comment': ''}, wait(300)]])
    ab = about_of(ev)
    if c.tabs:
        want_t, want_c, why = TABS_ON, COACH_TAB_ON, 'the tab root live'
    elif c.os_major and c.os_major < 26:
        want_t, want_c, why = TABS_OS, CHAT_ON, 'iOS %s' % c.os
    else:
        want_t, want_c, why = TABS_POLICY, CHAT_ON, 'the classic root by policy: ScreenGate reads the policy before needs'
    c.rep.check(s, 'Settings > About > Native tab bar says "%s" (%s)' % (want_t, why), ab.get('tabsSub') == want_t,
                {'row': ab.get('tabsRow'), 'tabs': ab_screen(ab, 'tabs'), 'fellBack': (ab.get('status') or {}).get('fellBack')})
    c.rep.check(s, 'Settings > About > %s says "%s"' % (about_words(ab)['title'], want_c), ab.get('sub') == want_c
                and about_words(ab)['title'] in (ab.get('row') or ''), {'row': ab.get('row'), 'coach': ab_screen(ab, 'coach'), 'coachHome': ab_screen(ab, 'coachHome')})
    # The share hook writes its JPEG into the group's container (stored file), never the base64 slot; the file goes again
    # at once, so no later launch's page picks a share up. (The comment it leaves, '', reads as no comment: TrovoShare's
    # getPendingShare answers '' for a missing one, and a share writes its own.)
    se = ev.first('share') or {}
    hold = (ev.first('js', label='share hold') or {}).get('result') or {}
    jpg = os.path.join(gc, 'pendingShare.jpg') if gc else ''
    there = bool(jpg) and os.path.isfile(jpg)
    c.rep.check(s, 'the share hook writes pendingShare.jpg into the App Group\'s container (stored file, delta 17.7; the page\'s own reads held off)',
                hold.get('held') is True and se.get('ran') is True and se.get('stored') == 'file' and se.get('legacy') is False and there,
                {k: se.get(k) for k in ('ran', 'stored', 'legacy', 'jpeg', 'bytes', 'error')} | {'file': there, 'hold': hold})
    if there:
        os.remove(jpg)


def scen_chat(c):
    s = 'chat'
    steps = [
        js('stub', STUB_JS), wait(1200), state('up'), mark('chat'),
        {'op': 'send', 'text': 'Probe question one', 'nonce': 'probe-n1'}, wait(3000), state('sent'), mark('answered'),
        intent('model', 'coach.model', model='claude-haiku-4-5-20251001'), wait(900), state('model'),
        js('confirm', "_ktConfirm({title: 'Probe confirm?', body: 'From the shell scenarios', confirmLabel: 'Yes', "
                      "onConfirm: function () { localStorage.setItem('kt_probe_confirmed', String(Date.now())); }}); return true;"),
        wait(800), state('confirm open'), mark('confirm'),
        {'op': 'confirm', 'yes': True}, wait(700),
        js('confirmed', "return localStorage.getItem('kt_probe_confirmed');"), state('confirm answered'),
        js('toast', "showUndoToast('Probe removed', function () { localStorage.setItem('kt_probe_undo', String(Date.now())); }); return true;"),
        wait(500), state('toast'), mark('toast', cap=3500, transient=True), {'op': 'undo'}, wait(600),
        js('undone', "return localStorage.getItem('kt_probe_undo');"),
        intent('model back', 'coach.model', model='claude-sonnet-5-5'), wait(600),
        {'op': 'back'}, wait(1800), state('back'), mark('home'),
    ]
    ev = shell_probe(c.sim, 'chat', [steps], args=['-devNav', 'coach/chat'], timeout=150)
    up, sent, model, conf, ans, toast, back = (ev.state(x) for x in ('up', 'sent', 'model', 'confirm open', 'confirm answered', 'toast', 'back'))
    cu, pu = coach(up), page(up)
    if c.tabs:
        rc, rw, rb = rcoach(up), rweb(up), rbar(up)
        c.rep.check(s, 'the page\'s chat is pushed on the native Coach tab\'s stack (host stack, not modal), on the page\'s model',
                    cu.get('presented') and cu.get('host') == 'stack' and cu.get('modal') is False and cu.get('rev', 0) > 0
                    and cu.get('boot') == fp(up).get('boot') and cu.get('messages', 0) >= 2,
                    {k: cu.get(k) for k in ('presented', 'host', 'modal', 'rev', 'boot', 'messages')})
        c.rep.check(s, 'Coach selected and NATIVE, the chat pushed over the hub (root coach {mode native, pushed, depth 2})',
                    root(up).get('selected') == 'coach' and rc.get('mode') == 'native' and rc.get('pushed') is True
                    and rc.get('depth') == 2 and rc.get('root') not in (None, 'waiting') and 'coachHome' in (screens(up).get('up') or []),
                    {'selected': root(up).get('selected'), 'coach': rc, 'up': screens(up).get('up')})
        c.rep.check(s, 'the web view sits in the Coach slot, in its window, hidden and hidden from VoiceOver; the bar is shown',
                    rw.get('slot') == 'coach' and rw.get('inWindow') is True and rw.get('hidden') is True and rw.get('a11yHidden') is True
                    and screens(up).get('webViewInWindow') is True and screens(up).get('webViewA11yHidden') is True
                    and rb.get('hidden') is False and rb.get('h') == BAR_H, {'web': rw, 'bar': {k: rb.get(k) for k in ('hidden', 'h', 'safe')}})
        c.rep.check(s, 'the page under it: placeholder, no web chat, covered, both pieces shown', pu.get('ph') and not pu.get('webChat')
                    and shown(up).get('coach') and shown(up).get('coachHome') and fp(up).get('covered') and pu.get('coachMode') == 'native',
                    {k: pu.get(k) for k in ('ph', 'phScreen', 'webChat', 'tab', 'view', 'coachMode')} | {'shown': shown(up)})
        c.rep.check(s, 'Heavyweight\'s chat and bar take the room\'s style, light (on a dark phone: chat-dark-phone below)', cu.get('interfaceStyle') == LIGHT
                    and rb.get('style') == 'light', '%s / bar %s' % (cu.get('interfaceStyle'), rb.get('style')))
        c.rep.check(s, 'one Coach-tab marker, the chat\'s, while it is on top of the stack', names_screen(screen_markers(up), 'coach', c)
                    and not names_screen(screen_markers(up), 'coachHome', c), screen_markers(up))
    else:
        c.rep.check(s, 'the page presents the native chat over itself (.overFullScreen), on the page\'s model', cu.get('presented') and cu.get('style') == OVER_FULL_SCREEN
                    and cu.get('rev', 0) > 0 and cu.get('boot') == fp(up).get('boot') and cu.get('messages', 0) >= 2, cu)
        c.rep.check(s, 'the web view stays in its window and is hidden from VoiceOver; the chat is modal', screens(up).get('webViewInWindow') is True
                    and screens(up).get('webViewA11yHidden') is True and cu.get('modal') is True, {k: screens(up).get(k) for k in ('webViewInWindow', 'webViewA11yHidden')})
        c.rep.check(s, 'the page under it: placeholder, no web chat, covered', pu.get('ph') and not pu.get('webChat') and shown(up).get('coach')
                    and fp(up).get('covered'), {k: pu.get(k) for k in ('ph', 'webChat', 'tab', 'view')})
        c.rep.check(s, 'Heavyweight\'s chat takes the room\'s style, light (overrideUserInterfaceStyle; on a dark phone: chat-dark-phone below)',
                    cu.get('interfaceStyle') == LIGHT, cu.get('interfaceStyle'))
        c.rep.check(s, 'the crash marker names the chat while it is up', names_screen(screen_markers(up), 'coach', c), screen_markers(up))
    ps = page(sent)
    texts = ps.get('texts') or []
    c.rep.check(s, 'a message sent from the native composer reaches the page once and its answer comes back in a model', sum(1 for t in texts if t == 'user:Probe question one') == 1
                and any(t.startswith('assistant:Probe reply') for t in texts) and coach(sent).get('last') == 'coach' and coach(sent).get('rev', 0) > cu.get('rev', 0),
                {'texts': texts[-3:], 'native': {k: coach(sent).get(k) for k in ('rev', 'messages', 'last', 'loading')}})
    snd = [r for r in intents(ev, 'coach.send') if r.get('key') == 'probe-n1']
    c.rep.check(s, 'coach.send went once, by nonce, and was done', len(snd) == 1 and snd[0].get('outcome') == 'done', snd)
    mi = ev.first('intent-step', label='model') or {}
    c.rep.check(s, 'the model switch round-trips (coach.model; the next model says Haiku)', mi.get('outcome') == 'done' and page(model).get('model') == 'claude-haiku-4-5-20251001'
                and 'Haiku' in str(coach(model).get('modelLabel')), '%s / %s / %s' % (mi.get('outcome'), page(model).get('model'), coach(model).get('modelLabel')))
    ov = screens(conf).get('overlay') or {}
    c.rep.check(s, 'a page confirm while covered is forwarded to the toast window (key, in the room)', ov.get('confirm') and ov.get('key') is True and ov.get('interfaceStyle') == LIGHT, ov)
    confirmed = (ev.first('js', label='confirmed') or {}).get('result')
    c.rep.check(s, 'answering it runs the page\'s own confirm (confirm {id, yes})', bool(confirmed) and not (screens(ans).get('overlay') or {}).get('confirm'), confirmed)
    ot = screens(toast).get('overlay') or {}
    undone = (ev.first('js', label='undone') or {}).get('result')
    c.rep.check(s, 'an Undo toast is forwarded and its Undo runs the page\'s (toast.undo)', ot.get('toast') == 'Probe removed' and ot.get('toastUndo') and bool(undone), '%s / %s' % (ot, undone))
    sb, pb = screens(back), page(back)
    cov = intents(ev, 'shell.covered')
    if c.tabs:
        c.rep.check(s, 'Back pops the chat to the hub: the Coach tab still NATIVE, the page on view home and still covered',
                    sb.get('up') == ['coachHome'] and sb.get('latched') == [] and 'back coach' in (sb.get('transitions') or [])
                    and rcoach(back).get('mode') == 'native' and rcoach(back).get('pushed') is False and rcoach(back).get('depth') == 1
                    and pb.get('tab') == 'coach' and pb.get('view') == 'home' and not shown(back).get('coach') and shown(back).get('coachHome')
                    and fp(back).get('covered') and rweb(back).get('hidden') is True and sb.get('webViewA11yHidden') is True,
                    {'up': sb.get('up'), 'latched': sb.get('latched'), 'coach': rcoach(back), 'tab': pb.get('tab'), 'view': pb.get('view'),
                     'shown': shown(back), 'covered': fp(back).get('covered'), 'transitions': (sb.get('transitions') or [])[-3:]})
        t_toast = (toast or {}).get('t', 0)
        late = [r for r in cov if (r.get('asked') or 0) > t_toast]
        c.rep.check(s, 'shell.covered went on as the Coach tab turned native (done) and nothing uncovered the page at the pop',
                    len(cov) >= 1 and all(r.get('outcome') == 'done' for r in cov) and not late, {'covered': cov, 'after the toast': late})
        c.rep.check(s, 'the hub\'s marker takes over at the pop (presenting coachHome@...); every section and model marker rests at 0',
                    names_screen(screen_markers(back), 'coachHome', c) and not names_screen(screen_markers(back), 'coach', c) and not unsettled(back),
                    markers(back))
    else:
        c.rep.check(s, 'Back takes the chat down at once; the page goes to the Coach home and is uncovered', sb.get('up') == [] and sb.get('latched') == []
                    and pb.get('tab') == 'coach' and pb.get('view') == 'home' and not shown(back).get('coach') and not fp(back).get('covered')
                    and sb.get('webViewA11yHidden') is False and 'back coach' in (sb.get('transitions') or []),
                    {'up': sb.get('up'), 'latched': sb.get('latched'), 'tab': pb.get('tab'), 'view': pb.get('view'), 'transitions': sb.get('transitions')})
        c.rep.check(s, 'shell.covered went on before and off after (both done)', len(cov) >= 2 and all(r.get('outcome') == 'done' for r in cov), [r.get('outcome') for r in cov])
        # describe()'s markers lists every .marker file in FPShell: the screens' crash markers ("presenting <screen>@...",
        # one file while the screen is up) and a 61 binary's short-section markers (section.tabs, model.<screen>: the
        # line, then 1 inside a section and 0 outside, contract 10.2). At rest after Back: no screen marker, and every
        # section and model marker at 0 (one left at 1 is a crash verdict at the next launch).
        c.rep.check(s, 'the marker is gone with the chat, and every section and model marker rests at 0', not screen_markers(back) and not unsettled(back), markers(back))
    vis = [page(e).get('visEvents') for e in ev.all('state')]
    c.rep.check(s, 'no visibilitychange in the page while the chat was up (present to Back)', all(v == [] for v in vis) and all(page(e).get('vis') == 'visible' for e in ev.all('state')), vis)
    fails = [r for r in intents(ev) if r.get('outcome') not in ('done', None)]
    c.rep.check(s, 'every intent answered (no timeout, no failure)', not fails, fails[:4])
    # Lime on a light phone (the run's phones are light): the chat and its toast window are dark, and on the tab root the
    # bar as the root asks for it (its style and its container's) and as the shot draws it (the band of its frame)
    phone = appearance(c.sim)
    ev = shell_probe(c.sim, 'chat-lime', [[wait(1000), js('scheme', SCHEME_JS), state('lime'), mark('lime'),
                                            js('toast', "showToast('Probe saved'); return true;"), wait(300), state('lime toast'), mark('lime-toast', cap=1500, transient=True)]],
                     args=['-devNav', 'coach/chat', '-devTheme', 'dark'])
    lime, lt = ev.state('lime'), ev.state('lime toast')
    phone_seen = sees(ev)   # the phone as this launch's page saw it (simctl's read-back is only what it stored)
    olt = screens(lt).get('overlay') or {}
    dark = coach(lime).get('interfaceStyle') == DARK and olt.get('interfaceStyle') == DARK and olt.get('toast') == 'Probe saved'
    if c.tabs:
        c.rep.check(s, 'Lime\'s pushed chat, its bar and the toast window ask for dark (the room\'s style; the phone %s)' % (phone_seen or '?'),
                    dark and coach(lime).get('host') == 'stack' and rbar(lime).get('style') == 'dark' and rbar(lime).get('containerStyle') in ('dark', None),
                    '%s / bar %s, container %s / %s' % (coach(lime).get('interfaceStyle'), rbar(lime).get('style'), rbar(lime).get('containerStyle'), olt))
        luma, seen = drawn_bar(lime, ev.tag, 'lime')
        c.rep.check(s, 'Lime\'s bar draws dark over the dark Coach stack (the mean luminance of its frame in the shot under %d of 255)'
                    % DARK_BAR_MAX, luma is not None and luma < DARK_BAR_MAX, seen)
    else:
        c.rep.check(s, 'Lime\'s chat and its toast window are dark (overrideUserInterfaceStyle from paper; the phone %s)' % (phone_seen or '?'), dark,
                    '%s / %s' % (coach(lime).get('interfaceStyle'), olt))
    # Heavyweight on a phone set to dark: the room's light all the same (the chat, and on the tab root the bar as asked
    # and as drawn); the phone's own appearance put back after
    appearance(c.sim, 'dark')
    try:
        stored = appearance(c.sim)
        ev = shell_probe(c.sim, 'chat-dark-phone', [[wait(1000), js('scheme', SCHEME_JS), state('dark phone'), mark('dark-phone')]],
                         args=['-devNav', 'coach/chat'])
    finally:
        appearance(c.sim, phone if phone in ('light', 'dark') else 'light')
    dp = ev.state('dark phone')
    cd = coach(dp)
    c.rep.check(s, 'the phone set to dark is dark to the app (the page\'s prefers-color-scheme, not simctl\'s read-back): the checks '
                   'below ran on a dark phone', sees(ev) == 'dark', {'page': sees(ev), 'simctl': stored})
    if c.tabs:
        c.rep.check(s, 'Heavyweight on a phone set to dark: the pushed chat and the bar still ask for light (the room\'s style, not the phone\'s)',
                    cd.get('presented') and cd.get('host') == 'stack' and cd.get('interfaceStyle') == LIGHT and rbar(dp).get('style') == 'light'
                    and rbar(dp).get('containerStyle') in ('light', None),
                    '%s / bar %s, container %s' % (cd.get('interfaceStyle'), rbar(dp).get('style'), rbar(dp).get('containerStyle')))
        luma, seen = drawn_bar(dp, ev.tag, 'dark-phone')
        c.rep.check(s, 'Heavyweight\'s bar draws light on a phone set to dark (the mean luminance of its frame in the shot over %d of 255)'
                    % LIGHT_BAR_MIN, luma is not None and luma > LIGHT_BAR_MIN, seen)
    else:
        c.rep.check(s, 'Heavyweight on a phone set to dark: the chat stays light (overrideUserInterfaceStyle, the room\'s)',
                    cd.get('presented') and cd.get('interfaceStyle') == LIGHT, {k: cd.get(k) for k in ('presented', 'interfaceStyle', 'style')})


FIELD_JS = r"""
var f = document.getElementById('fp-probe-field');
if (!f) { f = document.createElement('input'); f.id = 'fp-probe-field'; f.type = 'text';
  f.setAttribute('style', 'position:fixed;top:' + (window.innerHeight - 250) + 'px;left:20px;width:220px;height:44px;font-size:16px;z-index:2147483000');
  document.body.appendChild(f); }
f.focus();
return { active: document.activeElement === f };
"""
OPEN_JS = "switchTab('coach'); coachView = 'chat'; render(); return { tab: currentTab, view: coachView };"
# Setup's chat without a turn (the probe's own: the header's Cancel in Back's place, no edge pan), and back out of it.
SETUP_ON_JS = "_setIntakeMode(true); switchTab('coach'); coachView = 'chat'; render(); return { intake: intakeMode };"
SETUP_OFF_JS = "_setIntakeMode(false); render(); return { intake: intakeMode };"
CLEANUP_JS = ("var f = document.getElementById('fp-probe-field'); if (f) f.remove(); _setIntakeMode(false); "
              "localStorage.removeItem('kt_intake'); switchTab('log'); return true;")


def scen_focus(c):
    s = 'focus'
    if c.tabs:
        # The field sits on Log (a web tab): the Coach tab is the shell's while NATIVE, its web view hidden.
        ways = (('after page dismiss', "the page's dismiss (switchTab: another tab)"), ('after back', 'Back'), ('after navpop', 'navPop'))
        steps = [
            js('route', "switchTab('log'); return true;"), wait(700),
            {'op': 'webResponder'}, js('focus 1', FIELD_JS), wait(1600), state('focused'), mark('keys'),
            js('open 1', OPEN_JS), wait(2000), state('covered'), mark('covered'),
            js('page dismiss', "switchTab('log'); return true;"), wait(2600), state('after page dismiss'), mark('after-page-dismiss'),
            {'op': 'webResponder'}, js('focus 2', FIELD_JS), wait(1600), state('focused 2'), js('open 2', OPEN_JS), wait(2000),
            state('chat with back'), mark('before-back'),
            {'op': 'back'}, wait(2600), state('after back'), mark('after-back'),
            js('to log', "switchTab('log'); return true;"), wait(900),
            {'op': 'webResponder'}, js('focus 3', FIELD_JS), wait(1600), state('focused 3'), js('open 3', OPEN_JS), wait(2000), mark('before-navpop'),
            {'op': 'navPop'}, wait(2600), state('after navpop'), mark('after-navpop'),
            js('open 4', OPEN_JS), wait(2000), {'op': 'edgeBack', 'progress': 0.15, 'finish': False}, wait(1500), state('edge let go'),
            js('setup', SETUP_ON_JS), wait(1800), state('setup'), mark('setup'),
            js('setup off', SETUP_OFF_JS), wait(800),
            js('cleanup', CLEANUP_JS), wait(1200), state('end'),
        ]
    else:
        ways = (('after page dismiss', "the page's dismiss"), ('after back', 'Back'), ('after edge', 'the edge pan'))
        steps = [
            js('route', "switchTab('log'); return true;"), wait(400),
            {'op': 'webResponder'}, js('focus 1', FIELD_JS), wait(1600), state('focused'), mark('keys'),
            js('open 1', OPEN_JS), wait(1800), state('covered'), mark('covered'),
            js('page dismiss', "switchTab('log'); return true;"), wait(2600), state('after page dismiss'), mark('after-page-dismiss'),
            {'op': 'webResponder'}, js('focus 2', FIELD_JS), wait(1600), state('focused 2'), js('open 2', OPEN_JS), wait(1800), mark('before-back'),
            {'op': 'back'}, wait(2600), state('after back'), mark('after-back'),
            {'op': 'webResponder'}, js('focus 3', FIELD_JS), wait(1600), state('focused 3'), js('open 3', OPEN_JS), wait(1800), mark('before-edge'),
            {'op': 'edgeBack', 'progress': 0.6, 'finish': True}, wait(2600), state('after edge'), mark('after-edge'),
            js('open 4', OPEN_JS), wait(1800), {'op': 'edgeBack', 'progress': 0.15, 'finish': False}, wait(1500), state('edge let go'),
            js('cleanup', CLEANUP_JS), wait(1200), state('end'),
        ]
    # The simulator counts a hardware keyboard as attached and keeps the software keyboard down for it (UIKit's
    # automatic minimization): off for this scenario only, so a focused field raises the keys a phone would show.
    pref = ('com.apple.keyboard.preferences', 'AutomaticMinimizationEnabled')
    was = c.sim.sh('xcrun', 'simctl', 'spawn', c.sim.udid, 'defaults', 'read', *pref, check=False).strip()
    c.sim.sh('xcrun', 'simctl', 'spawn', c.sim.udid, 'defaults', 'write', *pref, '-bool', 'NO')
    try:
        ev = shell_probe(c.sim, 'focus', [steps], timeout=200)
    finally:
        if was in ('0', '1'):
            c.sim.sh('xcrun', 'simctl', 'spawn', c.sim.udid, 'defaults', 'write', *pref, '-bool', 'YES' if was == '1' else 'NO')
        else:
            c.sim.sh('xcrun', 'simctl', 'spawn', c.sim.udid, 'defaults', 'delete', *pref, check=False)
    cv = ev.state('covered')
    fs = [ev.state(x) for x in ('focused', 'focused 2', 'focused 3')]
    c.rep.check(s, 'a tap into the page, then a focused web field, raises the keyboard (the simulator\'s software keyboard), each time',
                all(bool(kb_shown(e)) and page(e).get('active') == 'INPUT#fp-probe-field' and e.get('webResponder') for e in fs if e) and all(fs),
                [{'kb': [k.get('ev') for k in (e or {}).get('keyboard') or []], 'active': page(e).get('active'), 'web': (e or {}).get('webResponder')} for e in fs])
    c.rep.check(s, 'the field sits where the keys cover it, so WebKit scrolls the document to show it (the path the page\'s guard undoes)',
                all(e and (e.get('webScrollY') or 0) > 0 and (page(e).get('scrollY') or 0) > 0 for e in fs),
                [{'webScrollY': (e or {}).get('webScrollY'), 'scrollY': page(e).get('scrollY')} for e in fs])
    c.rep.check(s, 'putting the chat up blurs the page\'s field and the keys go down%s' % (' (pushed on the NATIVE Coach tab)' if c.tabs else ''),
                coach(cv).get('presented') and page(cv).get('active') != 'INPUT#fp-probe-field'
                and any(k.get('ev') == 'didHide' for k in (cv or {}).get('keyboard') or []) and (not c.tabs or coach(cv).get('host') == 'stack'),
                {'active': page(cv).get('active'), 'kb': [k.get('ev') for k in (cv or {}).get('keyboard') or []], 'host': coach(cv).get('host')})
    for label, how in ways:
        e = ev.state(label)
        p = page(e)
        down = 'coach' not in (screens(e).get('up') or []) if c.tabs else screens(e).get('up') == []
        c.rep.check(s, '%s: no keyboard comes back and nothing is focused' % how, e is not None and not kb_shown(e) and p.get('active') in ('BODY', None)
                    and down, {'kb': [k.get('ev') for k in (e or {}).get('keyboard') or []], 'active': p.get('active'),
                               'firstResponder': (e or {}).get('firstResponder'), 'up': screens(e).get('up')})
        c.rep.check(s, '%s: the document is not scrolled' % how, p.get('scrollY') == 0 and p.get('scrollTop') == 0 and (e or {}).get('webScrollY') == 0
                    and ((p.get('vv') or {}).get('top') or 0) == 0, {k: p.get(k) for k in ('scrollY', 'scrollTop', 'vv')} | {'webScrollY': (e or {}).get('webScrollY')})
    lg = ev.state('edge let go')
    if c.tabs:
        pd = ev.state('after page dismiss')
        c.rep.check(s, 'the page\'s dismiss takes the chat off the Coach stack and the shell follows the page to Log', root(pd).get('selected') == 'log'
                    and page(pd).get('tab') == 'log' and rweb(pd).get('slot') == 'log' and rweb(pd).get('hidden') is False and rcoach(pd).get('pushed') is False,
                    {'selected': root(pd).get('selected'), 'tab': page(pd).get('tab'), 'web': rweb(pd), 'coach': rcoach(pd)})
        npp = ev.state('after navpop')
        c.rep.check(s, 'navPop pops the chat to the hub through the latch, and the page hears Back', (ev.first('navPop') or {}).get('started') is True
                    and rcoach(npp).get('pushed') is False and page(npp).get('view') == 'home'
                    and any(t in ('edge back coach', 'back coach') for t in (screens(npp).get('transitions') or [])[-2:]),
                    {'navPop': ev.first('navPop'), 'coach': rcoach(npp), 'view': page(npp).get('view'), 'transitions': (screens(npp).get('transitions') or [])[-3:]})
        c.rep.check(s, 'an edge pan let go early leaves the chat pushed (no Back sent for it)', coach(lg).get('presented') and rcoach(lg).get('pushed') is True
                    and 'edge back cancelled coach' in (screens(lg).get('transitions') or []) and len(intents(ev, 'coach.back')) == 2,
                    {'transitions': (screens(lg).get('transitions') or [])[-3:], 'backs': len(intents(ev, 'coach.back'))})
        cb, su = ev.state('chat with back'), ev.state('setup')
        c.rep.check(s, 'interactivePop is on for a chat with Back and off in setup (Cancel in Back\'s place)',
                    rcoach(cb).get('interactivePop') is True and rcoach(su).get('pushed') is True and rcoach(su).get('interactivePop') is False
                    and ((ev.first('js', label='setup') or {}).get('result') or {}).get('intake') is True,
                    {'with back': rcoach(cb).get('interactivePop'), 'setup': {k: rcoach(su).get(k) for k in ('pushed', 'interactivePop')},
                     'intake': (ev.first('js', label='setup') or {}).get('result')})
    else:
        edge = ev.state('after edge')
        c.rep.check(s, 'the edge pan takes the chat down and the page hears Back', 'edge back coach' in (screens(edge).get('transitions') or [])
                    and page(edge).get('view') == 'home', screens(edge).get('transitions'))
        c.rep.check(s, 'an edge pan let go early leaves the chat up (no Back sent)', coach(lg).get('presented') and 'edge back cancelled coach' in (screens(lg).get('transitions') or [])
                    and len(intents(ev, 'coach.back')) == 2, {'transitions': screens(lg).get('transitions'), 'backs': len(intents(ev, 'coach.back'))})
    vis = [page(e).get('visEvents') for e in ev.all('state')]
    c.rep.check(s, 'no visibilitychange in the page through every present and dismiss', all(v == [] for v in vis), vis)


def scen_wckill(c):
    s = 'wckill'
    steps1 = [
        js('stub', STUB_JS), wait(1000),
        js('confirm', "_ktConfirm({title: 'Probe stale?', body: 'Asked before the kill', confirmLabel: 'Yes', "
                      "onConfirm: function () { localStorage.setItem('kt_probe_stale_yes', '1'); }}); return true;"),
        wait(800), state('before kill'), mark('before-kill'),
        {'op': 'blockPage', 'ms': 6000}, wait(150),
        {'op': 'send', 'text': 'Probe never resent', 'nonce': 'probe-resend-1'}, wait(400),
        {'op': 'killWebContent'},
    ]
    steps2 = [
        state('new document'), wait(1200), state('after kill'), mark('after-kill'),
        intent('stale confirm', 'confirm', id='@lastConfirm', yes=True), wait(300),
        js('stale yes', "return localStorage.getItem('kt_probe_stale_yes');"),
        js('stub', STUB_JS), {'op': 'send', 'text': 'Probe after the kill', 'nonce': 'probe-after-1'}, wait(3000), state('after send'),
        {'op': 'draft', 'text': ''},   # the composer keeps its words across launches (fpDraft.coach): leave it empty
    ]
    ev = shell_probe(c.sim, 'wckill', [steps1, steps2], args=['-devNav', 'coach/chat'], timeout=170)
    b, a, s2 = ev.state('before kill'), ev.state('after kill'), ev.state('after send')
    boot0, boot1 = coach(b).get('boot'), fp(a).get('boot')
    t_kill = (ev.first('killWebContent') or {}).get('t', 0)
    c.rep.check(s, 'the kill started a new document (a new boot) with the chat up all along', boot0 and boot1 and boot0 != boot1 and shellst(a).get('documents', 0) >= 2
                and coach(a).get('presented') and not any(t.startswith(('dismiss coach', 'back coach')) for t in screens(a).get('transitions') or []),
                {'boot0': boot0, 'boot1': boot1, 'documents': shellst(a).get('documents'), 'transitions': screens(a).get('transitions')})
    pa = page(a)
    presents = page_events(ev, 'present', after=(b or {}).get('t', 0))
    if c.tabs:
        sts = ev.all('state')
        modes = [(e.get('label'), rcoach(e).get('mode'), rweb(e).get('slot'), rweb(e).get('hidden')) for e in sts]
        flips = [x for x in ev.all('screenChanged') if x.get('why') == 'mode' and x.get('t', 0) > t_kill]
        c.rep.check(s, 'the Coach tab stays NATIVE through the new document\'s start: every state NATIVE with the web view hidden in its slot, '
                    'no mode change (no WEB frame, no 3 s net)', all(m == 'native' and slot == 'coach' and hid is True for _, m, slot, hid in modes) and not flips,
                    {'states': modes, 'mode changes': flips})
        logs = [x.get('text') or '' for x in page_events(ev, 'log', after=t_kill)]
        took = [x for x in ('coachHome', 'coach') if any('%s taken over from the document before' % x in t for t in logs)]
        c.rep.check(s, 'the new document took coachHome and the chat over (hello\'s up, no present sent): shown, covered, on the chat, its placeholder',
                    took == ['coachHome', 'coach'] and not presents and shown(a).get('coachHome') and shown(a).get('coach') and fp(a).get('covered')
                    and pa.get('tab') == 'coach' and pa.get('view') == 'chat' and pa.get('ph'),
                    {'took': took, 'presents': presents, 'shown': shown(a)} | {k: pa.get(k) for k in ('tab', 'view', 'ph', 'coachMode')})
        snaps = {n: [r.get('outcome') for r in intents(ev, n, boot=boot1)] for n in ('shell.covered', 'coachHome.snapshot', 'coach.snapshot')}
        c.rep.check(s, 'the shell resynced on the new boot (shell.covered, coachHome.snapshot, coach.snapshot, each done) and the chat shows that boot\'s model',
                    all(v and v[-1] == 'done' for v in snaps.values()) and coach(a).get('boot') == boot1,
                    {'resync': snaps, 'nativeBoot': coach(a).get('boot')})
    else:
        c.rep.check(s, 'the new document took the chat over (no present: shown, covered, on the coach chat, its placeholder)', shown(a).get('coach')
                    and fp(a).get('covered') and pa.get('tab') == 'coach' and pa.get('view') == 'chat' and pa.get('ph') and not presents,
                    {k: pa.get(k) for k in ('tab', 'view', 'ph')} | {'fp': pa.get('fp')})
        snap = intents(ev, 'coach.snapshot', boot=boot1)
        c.rep.check(s, 'the shell resynced on the new boot (coach.snapshot, done) and the chat shows that boot\'s model', snap and snap[-1].get('outcome') == 'done'
                    and coach(a).get('boot') == boot1, {'snapshot': snap, 'nativeBoot': coach(a).get('boot')})
    sends = [r for r in intents(ev, 'coach.send') if r.get('key') == 'probe-resend-1']
    c.rep.check(s, 'the send in flight at the kill ended as gone and was never sent again (one record, the old boot)', len(sends) == 1 and sends[0].get('boot') == boot0
                and sends[0].get('outcome') == 'gone', sends)
    texts = pa.get('texts') or []
    cs = screens(a).get('coach') or {}
    c.rep.check(s, 'the page never got it (no resend), and its words are back in the composer, with a word to the owner', not any('Probe never resent' in t for t in texts)
                and screens(a).get('restored') == ['Probe never resent'] and cs.get('draft') == 'Probe never resent' and len(cs.get('toasts') or []) == 1,
                {'texts': texts[-3:], 'restored': screens(a).get('restored'), 'draft': cs.get('draft'), 'toasts': cs.get('toasts')})
    ov_b, ov_a = screens(b).get('overlay') or {}, screens(a).get('overlay') or {}
    c.rep.check(s, 'the confirm open at the kill closed as stale', ov_b.get('confirm') and not ov_a.get('confirm'), '%s -> %s' % (ov_b.get('confirm'), ov_a.get('confirm')))
    st = ev.first('intent-step', label='stale confirm') or {}
    c.rep.check(s, 'answered after the reload, the new page refuses it as stale and runs nothing', st.get('outcome') == 'refused stale'
                and not (ev.first('js', label='stale yes') or {}).get('result'), st.get('outcome'))
    old = [r for r in intents(ev) if r.get('boot') == boot0 and r.get('outcome') not in ('done', 'gone')]
    c.rep.check(s, 'nothing of the old document counted as a failure', not old and not (shellst(a).get('book') or {}).get('screens'), old[:3])
    t2 = page(s2).get('texts') or []
    c.rep.check(s, 'the chat works on the new boot: a message sent now is answered', sum(1 for t in t2 if t == 'user:Probe after the kill') == 1
                and any(t.startswith('assistant:Probe reply') for t in t2), t2[-3:])
    vis = [page(e).get('visEvents') for e in ev.all('state')]
    c.rep.check(s, 'no visibilitychange in either document while the chat was up', all(v == [] for v in vis), vis)


def clear_runner_markers(c, s, folder):
    """What the previous launch left in FPShell, gone before a launch that reads verdicts, so that launch reads only
    what the scenario plants. The runner ends every launch with simctl terminate, and one it ends with a native screen
    up leaves that screen's marker (presenting.<screen>.marker): that is the runner's own leftover when the launch's last
    state listed the file with its screen up (removed, a fact). Anything else is a failed check naming the file and the
    launch: a screen marker that state did not list with its screen up, or a section or model marker at 1 (contract 10.2:
    sections last milliseconds, so one left open at rest turns any kill into a crash verdict). Those go too (a marker at 1
    put to 0), so the verdict launch still reads only what is planted. When the previous launch timed out (the runner
    ended it wherever it was) its leftovers are facts. Returns [(file, 'runner' | 'unexplained' | 'timed out', what)]."""
    last = PASS.last or {}
    st = last.get('state')
    listed = set(markers(st)) if st else set()
    up = set(screens(st).get('up') or []) if st else set()
    who = ('launch %s (%s)' % (last.get('tag'), last.get('scenario'))) if last else 'no launch of this pass yet'
    found = []
    for p in sorted(glob.glob(os.path.join(folder, '*.marker'))):
        base = os.path.basename(p)
        with open(p, 'rb') as f:
            data = f.read()
        line = data.decode('utf-8', 'replace').strip()
        if base.startswith('presenting.'):
            screen = base[len('presenting.'):-len('.marker')]
            os.remove(p)
            if line in listed and screen in up:
                kind, what = 'runner', '%s (%s): removed, its screen up at the last state' % (base, line)
            else:
                kind = 'timed out' if last.get('timedOut') else 'unexplained'
                what = '%s (%s): removed; the last state %s' % (base, line, 'listed it, its screen not up' if line in listed
                                                                  else 'did not list it')
        elif data.endswith(b'\n1'):
            with open(p, 'wb') as f:
                f.write(data[:-1] + b'0')
            kind = 'timed out' if last.get('timedOut') else 'unexplained'
            what = '%s at 1 (%s): a section held open at rest, put to 0' % (base, line.replace('\n', ' '))
        else:
            continue
        found.append((base, kind, what))
    ran = [w for _, k, w in found if k == 'runner']
    timed = [w for _, k, w in found if k == 'timed out']
    bad = [w for _, k, w in found if k == 'unexplained']
    if ran:
        c.rep.fact(s, 'the runner\'s terminate of %s had left: %s' % (who, '; '.join(ran)))
    if timed:
        c.rep.fact(s, '%s timed out, so the runner ended it wherever it was; it had left: %s' % (who, '; '.join(timed)))
    c.rep.check(s, 'the launch before a verdict launch left no marker but its own screen\'s (%s)' % who, not bad, bad)
    return found


def plant(c, screen, s='marker'):
    """A screen's crash marker, as a death on screen leaves it (60's file and line), for this page and shell build: the
    only marker the next launch finds."""
    folder = c.sim.path('Library', 'Application Support', 'FPShell')
    os.makedirs(folder, exist_ok=True)
    line = 'presenting %s@%s shell %s' % (screen, c.page, c.shell)
    c.sim.terminate()
    clear_runner_markers(c, s, folder)
    path = os.path.join(folder, 'presenting.%s.marker' % screen)
    with open(path, 'w') as f:
        f.write(line + '\n')
    return path, line


def scen_marker(c):
    s = 'marker'
    ensure_page(c)
    # the tab root: the chat's marker (the chat pushed when the app died), then the hub's (the hub on top); the pair is
    # joint (contract 2.2, D3): either verdict turns the other piece off by needs
    for screen, route in [('coach', 'coach/chat')] + ([('coachHome', 'coach')] if c.tabs else []):
        marker_round(c, s, screen, route)


def marker_round(c, s, screen, route):
    path, line = plant(c, screen)
    other = 'coachHome' if screen == 'coach' else 'coach'
    who = 'the chat\'s' if screen == 'coach' else 'the hub\'s'
    ev = shell_probe(c.sim, 'marker-%s' % screen, [[wait(1000), state('marker'), mark('web-coach'), *about(), mark('about')]],
                     args=['-devNav', route], verdicts=True)
    launch, e = ev.first('launch') or {}, ev.state('marker')
    p = page(e)
    vs = verdicts(e, c, screen)
    c.rep.check(s, 'a planted marker (%s) is found at launch and gives one verdict for this shell and page build' % who,
                launch.get('markersFound') == [line] and len(vs) == 1, '%s / %s' % (launch.get('markersFound'), vs))
    if c.tabs:
        st = status_screens(e)
        flag = p.get('flag') or {}
        c.rep.check(s, '%s verdict turns %s off and %s off by needs (joint): only tabs offered and negotiated' % (who, screen, other),
                    flag.get('screens') == ['tabs'] and (fp(e).get('hello') or {}).get('screens') == ['tabs'] and shellst(e).get('negotiated') == ['tabs']
                    and (st.get(screen) or {}).get('off') == 'crash' and (st.get(other) or {}).get('off') == 'needs',
                    {'flag': flag.get('screens'), 'hello': fp(e).get('hello'), 'negotiated': shellst(e).get('negotiated'),
                     screen: (st.get(screen) or {}).get('off'), other: (st.get(other) or {}).get('off')})
        web_ok = p.get('webChat') if screen == 'coach' else (p.get('view') == 'home' and p.get('screenChild'))
        c.rep.check(s, 'the Coach tab is WEB under the glass bar: the page draws its own %s, the web view shown in the Coach slot' % (
                    'chat' if screen == 'coach' else 'Coach home'),
                    root(e).get('kind') == 'tabs' and root(e).get('fellBack') is None and rcoach(e).get('mode') == 'web'
                    and rweb(e).get('slot') == 'coach' and rweb(e).get('hidden') is False and rbar(e).get('hidden') is False
                    and p.get('coachMode') == 'web' and web_ok and not p.get('ph') and screens(e).get('up') == []
                    and not page_events(ev, 'present'),
                    {'coach': rcoach(e), 'web': rweb(e), 'bar': rbar(e).get('hidden')} | {k: p.get(k) for k in ('coachMode', 'webChat', 'ph', 'tab', 'view')})
    else:
        c.rep.check(s, 'the web chat is back: no coach in the flag or the hello, the page draws its own', (p.get('flag') or {}).get('screens') == []
                    and (fp(e).get('hello') or {}).get('screens') == [] and p.get('webChat') and not p.get('ph') and screens(e).get('up') == []
                    and not page_events(ev, 'present'), {k: p.get(k) for k in ('flag', 'webChat', 'ph', 'tab', 'view')})
    c.rep.check(s, 'the marker was read once and removed', not os.path.exists(path), None)
    ab = about_of(ev)
    w = about_words(ab)
    st = ab_screen(ab, screen)
    c.rep.check(s, 'Settings > About keeps the %s row and says why it is off (the app closed with it open)' % w['title'],
                w['title'] in (ab.get('row') or '') and ab.get('sub') == CRASH_LINE and st.get('off') == 'crash' and st.get('canReset') is True,
                {'row': ab.get('row'), 'status': st})
    mk = ((ab.get('status') or {}).get('counters') or {}).get('markers') or {}
    c.rep.check(s, 'its sheet offers "%s" and lists the shell\'s counters (this launch\'s marker counted)' % w['retry'],
                w['retry'] in (ab.get('sheet') or '') and 'Crash markers' in (ab.get('sheet') or '') and 'Left its window while open' in (ab.get('sheet') or '')
                and mk.get('launch') == 1 and mk.get('found') == [line] and (ab.get('retry') or not ab.get('b61')),
                {'sheet': (ab.get('sheet') or '')[:400], 'markers': mk, 'retry row': ab.get('retry')})
    ev = shell_probe(c.sim, 'marker-%s-2' % screen, [[wait(1000), state('again')]], args=['-devNav', route], verdicts=True)
    launch, e = ev.first('launch') or {}, ev.state('again')
    web = rcoach(e).get('mode') == 'web' if c.tabs else page(e).get('webChat')
    c.rep.check(s, 'it acts once: no marker next launch, no second verdict, still the web Coach for this pair', launch.get('markersFound') == []
                and len(verdicts(e, c, screen)) == 1 and web, '%s / %d verdicts / web %s' % (launch.get('markersFound'), len(verdicts(e, c, screen)), web))
    # the owner's Try again (Settings > About), not a Debug argument
    ev = shell_probe(c.sim, 'marker-%s-retry' % screen, [[wait(1000), *about(label='before'), js('retry', RETRY_JS), wait(1500),
                                                          js('after', ABOUT_READ_JS), state('retried'), mark('retried')]], verdicts=True)
    resets = [x.get('screen') for x in page_events(ev, 'reset')]
    before, after = about_of(ev, 'before'), about_of(ev, 'after')
    w = about_words(before)
    clicked = ((ev.first('js', label='retry') or {}).get('result') or {}).get('clicked')
    c.rep.check(s, '"%s" asks the shell to reset %s; the verdict goes and the row says it is back from the next launch' % (w['retry'], ', then '.join(w['resets'])),
                resets == w['resets'] and (clicked or not before.get('b61')) and not verdicts(ev.state('retried'), c, screen)
                and after.get('sub') == BACK_LINE, {'resets': resets, 'clicked': clicked, 'row': after.get('sub')})
    ev = shell_probe(c.sim, 'marker-%s-cleared' % screen, [[wait(1500), state('cleared'), mark('native-again')]], args=['-devNav', route], verdicts=True)
    e = ev.state('cleared')
    if c.tabs:
        back_ok = rcoach(e).get('mode') == 'native' and 'coachHome' in (screens(e).get('up') or []) and not verdicts(e, c, screen) \
            and (coach(e).get('presented') and coach(e).get('host') == 'stack' if screen == 'coach' else home(e).get('presented'))
        c.rep.check(s, 'the next launch brings the native Coach tab back (%s)' % ('the chat pushed' if screen == 'coach' else 'the hub'), back_ok,
                    {'coach': rcoach(e), 'up': screens(e).get('up'), 'verdicts': verdicts(e, c, screen)})
    else:
        c.rep.check(s, 'the next launch brings the native chat back', coach(e).get('presented') and not page(e).get('webChat') and not verdicts(e, c, screen), coach(e))


def policy_json(c, **screens_off):
    """The policy file's JSON for this pass: the classic pass keeps its offs (coachHome, tabs) in every file it writes."""
    o = {'v': 1, 'screens': {}}
    if not c.tabs:
        o = json.loads(json.dumps(OFFS))
    for k, v in screens_off.items():
        o['screens'][k] = v
    return json.dumps(o, separators=(',', ':'))


def scen_policy(c):
    s = 'policy'
    c.sim.terminate()
    base = policy_json(c)
    with open(c.sim.path('fp-policy.json'), 'w') as f:   # the launch reads this file: the defaults (coach on)
        f.write(base)
    hook = lambda text: {'op': 'hook', 'name': 'policy', 'json': text}
    steps1 = [wait(1000), state('native'), hook(policy_json(c, coach='off')), wait(2200), state('off'), mark('policy-off'),
              *about(label='policy about'), mark('policy-about'), js('back to chat', OPEN_JS), wait(600),
              hook(base), wait(1000), state('on again'), {'op': 'reload'}]
    steps2 = [wait(1500), state('next document')]
    phases = [steps1, steps2]
    if c.tabs:
        steps2 += [mark('next-document'), hook(policy_json(c, coachHome='off')), wait(2200), state('home off'), mark('home-off'),
                   *about(sheet='', label='home about'), js('to coach', "switchTab('coach'); return true;"), wait(600),
                   hook(base), wait(1000), state('home on again'), {'op': 'reload'}]
        phases.append([wait(1500), state('third document')])
    ev = shell_probe(c.sim, 'policy', phases, args=['-devNav', 'coach/chat', '-fpPolicyFile', 'fp-policy.json', '-fpPolicyEvery', '0'], timeout=180)
    n, off, on, nd = ev.state('native'), ev.state('off'), ev.state('on again'), ev.state('next document')
    c.rep.check(s, 'the native chat is up under the defaults%s' % (' (pushed on the NATIVE Coach tab)' if c.tabs else ''),
                coach(n).get('presented') and (not c.tabs or rcoach(n).get('mode') == 'native'), coach(n))
    so = intents(ev, 'screens.off')
    off_fp = fp(off).get('off') or {}
    if c.tabs:
        c.rep.check(s, 'screens.coach "off" takes the Coach tab WEB at once: the chat withdrawn, coachHome off by needs, the web chat, the bar unchanged',
                    screens(off).get('up') == [] and off_fp.get('coach') == 'withdrawn' and off_fp.get('coachHome') == 'needs' and page(off).get('webChat')
                    and rcoach(off).get('mode') == 'web' and rweb(off).get('hidden') is False and rbar(off).get('hidden') is False and rbar(off).get('h') == BAR_H
                    and root(off).get('fellBack') is None and root(off).get('selected') == 'coach' and so and all(r.get('outcome') == 'done' for r in so),
                    {'up': screens(off).get('up'), 'off': off_fp, 'webChat': page(off).get('webChat'), 'coach': rcoach(off),
                     'bar': {k: rbar(off).get(k) for k in ('hidden', 'h')}, 'screens.off': [r.get('outcome') for r in so]})
    else:
        c.rep.check(s, 'screens.coach "off" takes it down at once: screens.off "withdrawn", the web chat for the rest of the document', screens(off).get('up') == []
                    and off_fp.get('coach') == 'withdrawn' and page(off).get('webChat') and so and so[-1].get('outcome') == 'done',
                    {'up': screens(off).get('up'), 'off': off_fp, 'webChat': page(off).get('webChat'), 'screens.off': so})
    ab = about_of(ev, 'policy about')
    w = about_words(ab)
    c.rep.check(s, 'Settings > About says the policy file has it off (nothing to reset)', ab.get('sub') == POLICY_LINE
                and ab_screen(ab, 'coach').get('off') == 'policy' and w['retry'] not in (ab.get('sheet') or ''),
                {'row': ab.get('row'), 'coach': ab_screen(ab, 'coach'), 'sheet': (ab.get('sheet') or '')[:200]})
    c.rep.check(s, '"on" again changes nothing in this document', page(on).get('webChat') and screens(on).get('up') == []
                and (not c.tabs or rcoach(on).get('mode') == 'web'), screens(on).get('up'))
    want = ['coach', 'coachHome', 'tabs'] if c.tabs else ['coach']
    c.rep.check(s, 'the next document negotiates %s again' % ', '.join(want), sorted(shellst(nd).get('negotiated') or []) == want
                and sorted((fp(nd).get('hello') or {}).get('screens') or []) == want and (not c.tabs or rcoach(nd).get('mode') == 'native'),
                {'negotiated': shellst(nd).get('negotiated'), 'coach': rcoach(nd)})
    if c.tabs:
        ho, hon, td = ev.state('home off'), ev.state('home on again'), ev.state('third document')
        hf = fp(ho).get('off') or {}
        c.rep.check(s, 'screens.coachHome "off" takes the Coach tab WEB at once (the web Coach home), the bar unchanged',
                    screens(ho).get('up') == [] and hf.get('coachHome') == 'withdrawn' and rcoach(ho).get('mode') == 'web'
                    and page(ho).get('coachMode') == 'web' and not page(ho).get('ph') and rbar(ho).get('hidden') is False
                    and root(ho).get('fellBack') is None, {'up': screens(ho).get('up'), 'off': hf, 'coach': rcoach(ho), 'ph': page(ho).get('ph')})
        hab = about_of(ev, 'home about')
        c.rep.check(s, 'Settings > About > Native Coach says the policy file has the Coach tab off', hab.get('sub') == POLICY_LINE
                    and ab_screen(hab, 'coachHome').get('off') == 'policy', {'row': hab.get('row'), 'coachHome': ab_screen(hab, 'coachHome')})
        c.rep.check(s, '"on" again changes nothing in this document; the next one has the native Coach tab again', rcoach(hon).get('mode') == 'web'
                    and sorted(shellst(td).get('negotiated') or []) == want and rcoach(td).get('mode') == 'native' and home(td).get('presented'),
                    {'on again': rcoach(hon).get('mode'), 'next': {'negotiated': shellst(td).get('negotiated'), 'coach': rcoach(td)}})


def scen_breaker(c):
    s = 'breaker'
    if c.tabs:
        # a piece's own intents count for that piece alone; a ping counts for every live piece, the bar included
        # (LinkState.intentFinished), so three coach.* timeouts trip the chat and leave the root standing
        calls = [intent('call %d' % i, 'coach.model', model='claude-sonnet-5-5') for i in (1, 2, 3)]
    else:
        calls = [intent('call %d' % i, 'ping') for i in (1, 2, 3)]
    steps = [wait(1000), state('native'), {'op': 'blockPage', 'ms': 9000}, wait(150), *calls, wait(6000), state('tripped'), mark('tripped')]
    ev = shell_probe(c.sim, 'breaker', [steps], args=['-devNav', 'coach/chat'], timeout=130)
    t = ev.state('tripped')
    outs = [(ev.first('intent-step', label='call %d' % i) or {}).get('outcome') for i in (1, 2, 3)]
    trip = (((shellst(t).get('book') or {}).get('screens') or {}).get('coach') or {})
    c.rep.check(s, 'three %s timing out in a row trip the chat for this page build' % ('coach.* intents' if c.tabs else 'intents'), outs == ['failed timeout'] * 3
                and (trip.get('trip') or {}).get('reason') == 'failures' and trip.get('pageBuild') == c.page, '%s / %s' % (outs, trip.get('trip')))
    off = fp(t).get('off') or {}
    if c.tabs:
        c.rep.check(s, 'the Coach tab turns WEB (the chat off "failures", coachHome by needs), the bar unchanged and its breaker untripped',
                    screens(t).get('up') == [] and page(t).get('webChat') and off.get('coach') == 'failures' and off.get('coachHome') == 'needs'
                    and rcoach(t).get('mode') == 'web' and rbar(t).get('hidden') is False and root(t).get('fellBack') is None and not trip_of(t, 'tabs'),
                    {'up': screens(t).get('up'), 'off': off, 'coach': rcoach(t), 'tabs trip': trip_of(t, 'tabs')})
    else:
        c.rep.check(s, 'the chat goes down and the page shows its own (screens.off "failures")', screens(t).get('up') == [] and page(t).get('webChat')
                    and off.get('coach') == 'failures', {'up': screens(t).get('up'), 'off': off})
    ev = shell_probe(c.sim, 'breaker-next', [[wait(1000), state('next launch'), *about(label='breaker about'), mark('breaker-about'),
                                              js('retry', RETRY_JS), wait(1500), js('after', ABOUT_READ_JS)]],
                     args=['-devNav', 'coach/chat'])
    e = ev.state('next launch')
    want = ['tabs'] if c.tabs else []
    c.rep.check(s, 'the next launch of this page build offers no native chat%s (flag and hello)' % (' and no native Coach tab' if c.tabs else ''),
                (page(e).get('flag') or {}).get('screens') == want and (fp(e).get('hello') or {}).get('screens') == want and page(e).get('webChat')
                and (not c.tabs or rcoach(e).get('mode') == 'web'), {'flag': (page(e).get('flag') or {}).get('screens'), 'coach': rcoach(e)})
    ab = about_of(ev, 'breaker about')
    st = ab_screen(ab, 'coach')
    trips = ((ab.get('status') or {}).get('counters') or {}).get('trips') or {}
    c.rep.check(s, 'Settings > About says it is paused (calls kept failing) and counts the trip', ab.get('sub') == PAUSED_LINE
                and st.get('off') == 'breaker' and st.get('trip') == 'failures' and (trips.get('total') or 0) >= 1, {'row': ab.get('row'), 'status': st, 'trips': trips})
    after = about_of(ev, 'after')
    w = about_words(ab)
    resets = [x.get('screen') for x in page_events(ev, 'reset')]
    c.rep.check(s, '"%s" clears the trip for the next launch' % w['retry'], after.get('sub') == BACK_LINE and resets == w['resets'],
                {'row': after.get('sub'), 'resets': resets})
    ev = shell_probe(c.sim, 'breaker-clear', [[wait(1500), state('cleared')]], args=['-devNav', 'coach/chat'])
    e = ev.state('cleared')
    c.rep.check(s, 'the next launch brings the native chat back', coach(e).get('presented') and not trip_of(e, 'coach')
                and (not c.tabs or (coach(e).get('host') == 'stack' and rcoach(e).get('mode') == 'native')), coach(e))


def scen_counters(c):
    """The fault Settings > About counts: the web view out of its window with the chat up and the app active; on the tab
    root also a stray selection (selectedIndex set behind the funnel)."""
    s = 'counters'
    steps = [wait(1200), state('before'), {'op': 'hideWeb'}, wait(1500), state('out'), {'op': 'showWeb'}, wait(1500), state('back'), mark('counters-chat')]
    if c.tabs:
        steps += [{'op': 'stray', 'tab': 'progress'}, wait(1500), state('stray'), mark('stray'),
                  *about(label='chat sheet'), mark('chat-sheet'), js('open tabs sheet', ABOUT_JS, sheet='tabs'), wait(1200),
                  js('tabs sheet', ABOUT_READ_JS), mark('tabs-sheet'), state('end')]
    else:
        steps += [*about(label='chat sheet'), mark('counters-about'), state('end')]
    ev = shell_probe(c.sim, 'counters', [steps], args=['-devNav', 'coach/chat'], timeout=150)
    b, back = ev.state('before'), ev.state('back')
    c0 = ((shellst(b).get('status') or {}).get('counters') or {})
    c1 = ((shellst(back).get('status') or {}).get('counters') or {})
    hw = ev.first('hideWeb') or {}
    c.rep.check(s, 'the web view went out of its window with the chat up (the probe), and came back', hw.get('window') is False and coach(b).get('presented')
                and (ev.first('showWeb') or {}).get('window') is True, {'hide': hw, 'show': ev.first('showWeb')})
    lw0, lw1 = c0.get('leftWindow') or {}, c1.get('leftWindow') or {}
    la0, la1 = c0.get('leftAny') or {}, c1.get('leftAny') or {}
    c.rep.check(s, 'the leave-window counts go up, this launch and in all (while active, and in any state)', lw0.get('launch') == 0 and lw1.get('launch') == 1
                and (lw1.get('total') or 0) == (lw0.get('total') or 0) + 1 and shellst(back).get('leftWindow') == 1
                and shellst(back).get('leftWindowAny') == 1 and la1.get('launch') == 1 and (la1.get('total') or 0) == (la0.get('total') or 0) + 1,
                {'before': lw0, 'after': lw1, 'any': [la0, la1], 'leftWindowAny': shellst(back).get('leftWindowAny')})
    vis = page(back).get('visEvents') or []
    reports = page_events(ev, 'visibility')
    h0, h1 = c0.get('hidden') or {}, c1.get('hidden') or {}
    c.rep.check(s, 'the page went hidden under the chat and said so; the shell counted it (this launch and in all)',
                any(str(v).startswith('hidden@') for v in vis) and any(r.get('state') == 'hidden' for r in reports)
                and h1.get('launch') == 1 and (h1.get('total') or 0) == (h0.get('total') or 0) + 1, {'vis': vis, 'reports': reports, 'before': h0, 'after': h1})
    ab = about_of(ev, 'chat sheet')
    c.rep.check(s, 'Settings > About\'s sheet lists them', 'Left its window while open' in (ab.get('sheet') or '') and '1 this launch' in (ab.get('sheet') or ''),
                (ab.get('sheet') or '')[:500])
    # The scenario is exempt from the window aggregates, so it pins its own counts: after the probe's one leave nothing
    # takes the web view out of its window or hides the page again (on the tab root the stray's redirect through the
    # funnel, and About's tab moves, keep it in the window: contract 8.1 step 3, I1).
    later = [(x, ev.state(x)) for x in (('stray', 'end') if c.tabs else ('end',))]
    c.rep.check(s, 'from Back on nothing more leaves the window or hides the page (%s: leftWindow and leftWindowAny still 1, the '
                'page\'s visibility events as at Back)' % ', '.join(x for x, _ in later),
                all(e is not None and shellst(e).get('leftWindow') == 1 and shellst(e).get('leftWindowAny') == 1
                    and page(e).get('visEvents') == page(back).get('visEvents') for _, e in later),
                {x: {'leftWindow': shellst(e).get('leftWindow'), 'leftWindowAny': shellst(e).get('leftWindowAny'),
                     'visEvents': page(e).get('visEvents')} for x, e in later} | {'back': page(back).get('visEvents')})
    if c.tabs:
        sy = ev.state('stray')
        st_ev = ev.first('stray') or {}
        runs = [r for r in ev.all('funnel') if r.get('source') == 'stray']
        c.rep.check(s, 'a stray selection is counted (strays 1) and redirected through the funnel: one run, source stray, on Progress',
                    st_ev.get('counted') == 1 and root(sy).get('strays') == 1 and len(runs) == 1 and runs[0].get('to') == 'progress'
                    and root(sy).get('selected') == 'progress' and page(sy).get('tab') == 'progress' and rweb(sy).get('slot') == 'progress',
                    {'stray': {k: st_ev.get(k) for k in ('counted', 'strays', 'selected')}, 'runs': runs,
                     'selected': root(sy).get('selected'), 'tab': page(sy).get('tab'), 'slot': rweb(sy).get('slot')})
        tb = about_of(ev, 'tabs sheet')
        sc = ((ab.get('status') or {}).get('counters') or {}).get('strays') or {}
        c.rep.check(s, 'both 61 sheets (Native Coach, Native tab bar) list "Tab changes outside the funnel", 1 this launch',
                    'Tab changes outside the funnel' in (ab.get('sheet') or '') and 'Tab changes outside the funnel' in (tb.get('tabsSheet') or '')
                    and sc.get('launch') == 1, {'strays': sc, 'chat sheet': (ab.get('sheet') or '')[-300:], 'tabs sheet': (tb.get('tabsSheet') or '')[-300:]})
    c.rep.fact(s, 'counters now: left its window %s/%s, in any state %s/%s, hidden %s/%s (this launch / in all)' % (
        lw1.get('launch'), lw1.get('total'), la1.get('launch'), la1.get('total'), h1.get('launch'), h1.get('total')))


def scen_inactive(c):
    """Review 4 (platform low): a present made while the app was not active wrote the crash marker, and willResignActive,
    the only removal, had already gone by, so a background kill (jetsam) read as a crash at the next launch. On the tab
    root the same for the Coach stack (contract 10.2: its marker only while the app is active and Coach NATIVE)."""
    s = 'inactive'
    ensure_page(c)
    folder = c.sim.path('Library', 'Application Support', 'FPShell')
    names = ['presenting.coach.marker'] + (['presenting.coachHome.marker'] if c.tabs else [])
    c.sim.terminate()
    os.makedirs(folder, exist_ok=True)
    clear_runner_markers(c, s, folder)   # what the kill below leaves is the scenario's subject; nothing from before it
    seen = {}

    def away(ev):
        seen.setdefault('t0', time.time())
        if 'away' not in seen and time.time() - seen['t0'] >= 0.2:
            seen['away'] = True
            c.sim.open_app('com.apple.Preferences')   # the app leaves the screen before its page presents the chat

    def presented(ev):
        if not any(x.get('screen') == 'coach' for x in page_events(ev, 'present')):
            return False
        seen.setdefault('p', time.time())
        if time.time() - seen['p'] < 2.0:
            return False
        seen['disk'] = {n: open(os.path.join(folder, n)).read().strip() for n in names if os.path.exists(os.path.join(folder, n))}
        return True

    ev = shell_probe(c.sim, 'inactive', [[wait(600), state('away'), {'op': 'done'}]], args=['-devNav', 'coach/chat'],
                     timeout=30, during=away, until=presented, end='kill')
    presents = [x for x in page_events(ev, 'present') if x.get('screen') == 'coach']
    c.rep.check(s, 'the page presented the chat while the app was not active (sent to the background right after launch)',
                bool(presents) and presents[0].get('appState') in (1, 2), [(p.get('screen'), p.get('appState'), p.get('t')) for p in page_events(ev, 'present')])
    c.rep.check(s, 'no screen marker while the app was away (only a death on screen leaves one)', 'disk' in seen and not seen['disk'], seen.get('disk'))
    ev2 = shell_probe(c.sim, 'inactive-next', [[wait(1500), state('next')]], args=['-devNav', 'coach/chat'], verdicts=True)
    launch, e = ev2.first('launch') or {}, ev2.state('next')
    vs = verdicts(e, c, 'coach') + verdicts(e, c, 'coachHome')
    c.rep.check(s, 'the next launch finds no marker and records no verdict: the native chat is up%s' % (' on the NATIVE Coach tab' if c.tabs else ''),
                launch.get('markersFound') == [] and not vs and coach(e).get('presented') and (not c.tabs or rcoach(e).get('mode') == 'native'),
                {'markersFound': launch.get('markersFound'), 'verdicts': vs})
    if vs:   # leave no verdict behind for the scenarios after this one
        shell_probe(c.sim, 'inactive-clear', [[js('retry', "_fpChatRetry(); return true;"), wait(1200)]], verdicts=True)


def scen_teardown(c):
    """Delta 17.10, 20-order 9 item 35: a scene's teardown lets go of what the scene held. UIKit refuses to destroy the
    only scene of an iPhone app (sceneDestroy), so the teardown is the App's replay (sceneCycle: SceneDelegate's teardown,
    then its connection on the same window scene), made here with the chat up, where the most holds the page: on the tab
    root the Coach stack (the hub, the chat pushed on it, ScreenHost's stack), on the classic root the chat presented
    over the page. ShellProbe holds the old web view, root and window weakly; every state after the replay says which
    are still alive (`replaced`), and 5 s after it none may be. The teardown's own moves of the web view are no
    leave-window fault (ShellWebView.sceneEnding): this scenario does not leave, so the window aggregate covers it."""
    s = 'teardown'
    want = ['coach', 'coachHome', 'tabs'] if c.tabs else ['coach']
    ev = shell_probe(c.sim, 'teardown', [[wait(1200), state('up'), mark('before'), {'op': 'sceneCycle'}],
                                         [wait(1500), state('1.5 s'), wait(3500), state('5 s'), mark('after')]],
                     args=['-devNav', 'coach/chat'], timeout=120)
    up, e1, e5 = ev.state('up'), ev.state('1.5 s'), ev.state('5 s')
    cu = coach(up)
    if c.tabs:
        c.rep.check(s, 'before the teardown the chat is pushed on the NATIVE Coach stack over the hub', cu.get('presented') and cu.get('host') == 'stack'
                    and rcoach(up).get('mode') == 'native' and rcoach(up).get('pushed') is True and 'coachHome' in (screens(up).get('up') or []),
                    {'coach': {k: cu.get(k) for k in ('presented', 'host')}, 'root coach': rcoach(up), 'up': screens(up).get('up')})
    else:
        c.rep.check(s, 'before the teardown the chat is presented over the page (.overFullScreen)', cu.get('presented') and cu.get('style') == OVER_FULL_SCREEN,
                    {k: cu.get(k) for k in ('presented', 'style', 'modal')})
    cyc = ev.first('sceneCycle') or {}
    c.rep.check(s, 'the replay (the App\'s sceneCycle hook) built the %s root in a new window around a new web view' % c.root,
                cyc.get('ran') is True and cyc.get('root') == c.root and cyc.get('newWebView') is True and cyc.get('newWindow') is True
                and not cyc.get('error'), {k: cyc.get(k) for k in ('ran', 'root', 'newWebView', 'newWindow', 'error') if k in cyc})
    after = round(((e5 or {}).get('wall', 0) - cyc.get('wall', 0)) / 1000.0, 1) if e5 and cyc.get('wall') else None
    r1, r5 = replaced(e1), replaced(e5)
    c.rep.fact(s, 'what the teardown had let go %s s after it: %s' % (
        round(((e1 or {}).get('wall', 0) - cyc.get('wall', 0)) / 1000.0, 1) if e1 and cyc.get('wall') else None, r1 or None))
    c.rep.check(s, '%s s after the teardown the web view, the root and the window it replaced are all gone (replaced: none alive)' % after,
                r5.get('by') == 'sceneCycle' and r5.get('webView') is False and r5.get('root') is False and r5.get('window') is False
                and after is not None and after >= 5, {'replaced': r5 or None, 'after': after})
    p5 = page(e5)
    c.rep.check(s, 'the new document is a new boot on the %s root and negotiates %s again' % (c.root, ', '.join(want)),
                bool(fp(e5).get('boot')) and fp(e5).get('boot') != fp(up).get('boot') and root(e5).get('kind') == c.root
                and (not c.tabs or root(e5).get('fellBack') is None) and sorted(shellst(e5).get('negotiated') or []) == want
                and sorted((fp(e5).get('hello') or {}).get('screens') or []) == want,
                {'boot': [fp(up).get('boot'), fp(e5).get('boot')], 'root': {k: root(e5).get(k) for k in ('kind', 'fellBack')},
                 'negotiated': shellst(e5).get('negotiated'), 'hello': fp(e5).get('hello')})
    c.rep.fact(s, 'after the teardown: tab %s, view %s, screens up %s, markers %s' % (
        p5.get('tab'), p5.get('view'), screens(e5).get('up'), markers(e5)))


# ── the scenarios: build 60's nine, then the modules' ────────────────────────────────────────────────────────────────

class Entry:
    def __init__(self, name, fn, rank, backgrounds, leaves, source, roots=ROOTS):
        self.name, self.fn, self.rank, self.backgrounds, self.leaves, self.source = name, fn, rank, backgrounds, leaves, source
        self.roots = frozenset(roots)


# (name, backgrounds, leaves): build 60's nine (native-shell.py:677 before T16) in their order, then teardown (delta
# 17.10); every one under both roots
BASE = [('smoke', False, False), ('chat', False, False), ('focus', False, False), ('wckill', False, False),
        ('marker', False, False), ('policy', False, False), ('breaker', False, False), ('counters', False, True),
        ('inactive', True, False), ('teardown', False, False)]
NAME_RE = re.compile(r'^[a-z][A-Za-z0-9_-]*$')
MARKS_HELP = "True, False or a dict {'leaves': bool, 'roots': 'tabs' | 'classic' | 'both'} (a tab-root-only row: {'roots': 'tabs'})"


def roots_of(v):
    """A row's `roots` as the set of roots it names: 'both' (or the key left out) is both, 'tabs' or 'classic' one, a
    non-empty list or tuple of them those; None for anything else."""
    if v == 'both':
        return frozenset(ROOTS)
    if isinstance(v, str):
        v = (v,)
    if isinstance(v, (list, tuple)) and v and all(isinstance(x, str) and x in ROOTS for x in v):
        return frozenset(v)
    return None


def roots_word(e):
    """How --list and a skip name a scenario's roots."""
    if e.roots == frozenset(ROOTS):
        return 'both roots'
    return 'the %s root only' % ('tab' if e.roots == frozenset(['tabs']) else 'classic')


def for_root(entries, root):
    """The scenarios a pass on `root` runs, and the ones it skips (their `roots` leave it out), each in ALL's order."""
    return [e for e in entries if root in e.roots], [e for e in entries if root not in e.roots]


def list_line(e):
    """A scenario's line in --list: its name first (native-shell.sh's --only check reads that word), where it comes
    from, its rank, and its marks."""
    flags = [x for x, on in (('backgrounds', e.backgrounds), ('leaves', e.leaves)) if on]
    if e.roots != frozenset(ROOTS):
        flags.append(roots_word(e))
    return '%-12s %s%s%s' % (e.name, e.source, '' if e.rank is None else ' rank %s' % e.rank, ' (%s)' % ', '.join(flags) if flags else '')


def load_modules(folder):
    """Every <folder>/*.py but _*.py, in file-name order: their scenarios (Entry) in load order, and what went wrong."""
    entries, errors = [], []
    for path in sorted(glob.glob(os.path.join(folder, '*.py'))):
        base = os.path.basename(path)
        if base.startswith('_'):
            continue
        modname = 'shellscen_' + re.sub(r'\W', '_', base[:-3])
        try:
            spec = importlib.util.spec_from_file_location(modname, path)
            mod = importlib.util.module_from_spec(spec)
            sys.modules[modname] = mod
            spec.loader.exec_module(mod)
        except BaseException as e:   # a module's own exit or error stops nothing but its load
            errors.append('%s: does not load (%s)' % (base, repr(e)[:200]))
            continue
        rows = getattr(mod, 'SCENARIOS', None)
        if not isinstance(rows, (list, tuple)) or not rows:
            errors.append('%s: no SCENARIOS list of (name, function, rank, backgrounds[, marks])' % base)
            continue
        for i, row in enumerate(rows):
            where = '%s SCENARIOS[%d]' % (base, i)
            if not isinstance(row, (list, tuple)) or len(row) not in (4, 5):
                errors.append('%s: not (name, function, rank, backgrounds[, marks]): %r' % (where, row))
                continue
            name, fn, rank, bg = row[:4]
            marks = row[4] if len(row) == 5 else False
            leaves, roots = False, frozenset(ROOTS)
            bad = []
            if not isinstance(name, str) or not NAME_RE.match(name):
                bad.append('name %r (a lower-case letter, then letters, digits, - or _)' % (name,))
            if not callable(fn):
                bad.append('function %r is not callable' % (fn,))
            if type(rank) not in (int, float):
                bad.append('rank %r is not a number' % (rank,))
            if type(bg) is not bool:
                bad.append('backgrounds %r is not True or False' % (bg,))
            if type(marks) is bool:
                leaves = marks
            elif isinstance(marks, dict):
                unknown = sorted((k for k in marks if k not in ('leaves', 'roots')), key=repr)
                if unknown:
                    bad.append('marks key%s %s unknown (leaves, roots)' % ('s' if len(unknown) > 1 else '', ', '.join(map(repr, unknown))))
                leaves = marks.get('leaves', False)
                if type(leaves) is not bool:
                    bad.append('leaves %r is not True or False' % (leaves,))
                roots = roots_of(marks.get('roots', 'both'))
                if roots is None:
                    bad.append('roots %r is not tabs, classic, both or a list of tabs and classic' % (marks.get('roots'),))
            else:
                bad.append('marks %r is not %s' % (marks, MARKS_HELP))
            if bad:
                errors.append('%s: %s' % (where, '; '.join(bad)))
                continue
            entries.append(Entry(name, fn, rank, bg, leaves, '%s:%d' % (base, i), roots))
    return entries, errors


def registry(folder=SCEN_DIR):
    """ALL: the base ten (build 60's nine, teardown) in their order, then the modules' by rank (ties by file name, then
    by place); and the errors (a module that does not load, a malformed row, a name taken twice)."""
    base = [Entry(n, globals()['scen_' + n], None, bg, lv, 'native-shell.py') for n, bg, lv in BASE]
    mods, errors = load_modules(folder)
    ranked = [m for _, m in sorted(enumerate(mods), key=lambda p: (p[1].rank, p[0]))]
    out, seen = [], {}
    for e in base + ranked:
        if e.name in seen:
            errors.append('%s: the name %s is %s\'s already' % (e.source, e.name, seen[e.name]))
            continue
        seen[e.name] = e.source
        out.append(e)
    return out, errors


def select(entries, only):
    """The scenarios `--only` names (any, the modules' included), in ALL's order; all of them for none."""
    names = [x.strip() for x in (only or '').split(',') if x.strip()]
    known = {e.name for e in entries}
    unknown = [n for n in names if n not in known]
    if unknown:
        raise ValueError('unknown scenario%s %s (known: %s)' % ('s' if len(unknown) > 1 else '', ', '.join(unknown), ', '.join(e.name for e in entries)))
    return [e for e in entries if not names or e.name in names]


def aggregates(c, run):
    """Plan T16 item 3 over every state of every launch of this pass (the pass's setup included); `run` is what ran."""
    leaves = {e.name for e in run if e.leaves}
    bg = {e.name for e in run if e.backgrounds}
    lw = [(r['scenario'], r['tag'], r['label'], r['leftWindow'], r['leftWindowAny']) for r in PASS.records
          if r['scenario'] not in leaves and ((r['leftWindow'] or 0) != 0 or (r['leftWindowAny'] or 0) != 0)]
    c.rep.check('window', 'the web view never left its window, the app active or not: leftWindow and leftWindowAny 0 in every state%s'
                % (' (but %s, on purpose)' % ', '.join(sorted(leaves)) if leaves else ''), not lw, lw[:6])
    # a scenario that leaves on purpose is exempt only once it has left (its state's leftWindowAny above 0)
    vis = [(r['scenario'], r['tag'], r['label'], r['visEvents']) for r in PASS.records
           if r['scenario'] not in bg and not (r['scenario'] in leaves and (r['leftWindowAny'] or 0) > 0) and r['visEvents'] != []]
    but = ['%s (in the background)' % n for n in sorted(bg)] + ['%s (once it has left the window)' % n for n in sorted(leaves - bg)]
    c.rep.check('window', 'no visibilitychange in any state of a scenario that keeps the app in front%s'
                % (' (but %s)' % ', '.join(but) if but else ''), not vis, vis[:6])
    nh = [f for f in PASS.fellbacks if f[2] == 'no-hello'] + [(r['scenario'], r['tag'], 'state ' + str(r['label'])) for r in PASS.records
                                                              if (r['fellBack'] or {}).get('why') == 'no-hello']
    c.rep.check('window', 'no fallback for want of a hello in any launch (fellBack why no-hello)', not nh, nh[:6])
    to = [(sc, tag) for sc, tag, timed in PASS.launches if timed]
    c.rep.check('launches', 'every launch ran its steps to the end (%d launches, no probe timed out)' % len(PASS.launches), not to, to[:6])
    late = [(x['file'], x.get('started'), x.get('ms'), x.get('why')) for x in PASS.shots
            if (x.get('late') and not x.get('transient')) or not x['ok']]
    c.rep.check('shots', 'every shot was taken while the app held still at its mark (%d shots, none late or missing)' % len(PASS.shots),
                not late, late[:6])
    tr = [(x['file'], x.get('ms'), x.get('why')) for x in PASS.shots if x.get('late') and x.get('transient') and x['ok']]
    if tr:
        c.rep.fact('shots', '%d transient shot%s ended past %s cap (they may show the screen without their toast): %s' % (
            len(tr), '' if len(tr) == 1 else 's', 'its' if len(tr) == 1 else 'their', tr))
    if PASS.shots:
        ms = sorted(x.get('ms') or 0 for x in PASS.shots)
        c.rep.fact('shots', 'a screenshot took %d ms at the median, %d ms at the most' % (ms[len(ms) // 2], ms[-1]))


def self_test():
    """No simulator: the loader on scratch modules (ALL's order, the rows' marks, the roots, --only, every refusal), a
    mark's shot and go file and how a shot is judged, the aggregates on a pass's records, what the runner's leftovers
    give before a verdict launch, and the drawn bar's luminance read from a PNG (sips)."""
    global PASS
    bad, n = [], [0]

    def case(what, ok, detail=''):
        n[0] += 1
        print('%s  %s%s' % ('ok  ' if ok else 'FAIL', what, (' -- %s' % (detail,)) if not ok and detail != '' else ''))
        if not ok:
            bad.append(what)

    def write(d, name, text):
        with open(os.path.join(d, name), 'w') as f:
            f.write(text)

    base = [b[0] for b in BASE]
    both = frozenset(ROOTS)
    with tempfile.TemporaryDirectory() as d:
        entries, errors = registry(d)
        case('an empty folder: ALL is the base ten in order (build 60\'s nine, teardown), each under both roots',
             [e.name for e in entries] == base and len(base) == 10 and base[-1] == 'teardown' and not errors
             and all(e.roots == both for e in entries), (entries, errors))
        entries, errors = registry(os.path.join(d, 'missing'))
        case('a missing folder is no error (ALL is the base ten)', [e.name for e in entries] == base and not errors, errors)
        write(d, 'b_links.py', 'import native_shell as shell\nSTEP = shell.wait(5)\n'
                               'def gamma(c):\n    return shell.state("g")\n'
                               'SCENARIOS = [("gamma", gamma, 10, False)]\n')
        write(d, 'a_tabs.py', 'def alpha(c):\n    pass\n\ndef beta(c):\n    pass\n\n'
                              'SCENARIOS = [("alpha", alpha, 20, False), ("beta", beta, 10, True, True)]\n')
        write(d, 'c_roots.py', 'def f(c):\n    pass\n\n'
                               'SCENARIOS = [("coachtab", f, 30, False, {"roots": "tabs"}), ("intakeway", f, 31, False, {"roots": ("tabs",)}),\n'
                               '             ("oldlook", f, 32, False, {"roots": "classic", "leaves": True}), ("anyroot", f, 33, True, {}),\n'
                               '             ("listed", f, 34, False, {"roots": ["classic", "tabs"]}), ("bothword", f, 35, False, {"roots": "both", "leaves": False})]\n')
        write(d, '_helpers.py', 'raise SystemExit("a _ file is never loaded")\n')
        entries, errors = registry(d)
        names = [e.name for e in entries]
        mods = ['beta', 'gamma', 'alpha', 'coachtab', 'intakeway', 'oldlook', 'anyroot', 'listed', 'bothword']
        case('modules come after the base ten, by rank, ties by file name then by place', names == base + mods, names)
        byname = {e.name: e for e in entries}
        case('backgrounds and leaves are read (marks True: leaves; four items: leaves False)', byname['beta'].backgrounds is True
             and byname['beta'].leaves is True and byname['alpha'].leaves is False and byname['gamma'].backgrounds is False,
             {k: (byname[k].backgrounds, byname[k].leaves) for k in ('alpha', 'beta', 'gamma')})
        case('marks as a dict: roots tabs, (tabs,), classic with leaves, {} and both and a list of both: both roots',
             byname['coachtab'].roots == frozenset(['tabs']) and byname['intakeway'].roots == frozenset(['tabs'])
             and byname['oldlook'].roots == frozenset(['classic']) and byname['oldlook'].leaves is True
             and byname['anyroot'].roots == both and byname['anyroot'].backgrounds is True and byname['anyroot'].leaves is False
             and byname['listed'].roots == both and byname['bothword'].roots == both and byname['alpha'].roots == both,
             {k: (sorted(byname[k].roots), byname[k].leaves) for k in mods})
        case('a _ file is skipped', not errors and not any('helpers' in e.source for e in entries), errors)
        mod = sys.modules.get('shellscen_b_links')
        case('a module reaches the helpers through import native_shell', mod is not None and mod.STEP == {'op': 'wait', 'ms': 5}
             and byname['gamma'].fn(None) == {'op': 'state', 'label': 'g'}, getattr(mod, 'STEP', None))
        case('--only takes a module\'s name and the base\'s, in ALL\'s order', [e.name for e in select(entries, 'gamma,smoke,beta')] == ['smoke', 'beta', 'gamma'])
        case('--only with nothing named is every scenario', [e.name for e in select(entries, '')] == names)
        try:
            select(entries, 'smoke,nope')
            case('--only refuses an unknown name', False, 'accepted')
        except ValueError as e:
            case('--only refuses an unknown name, naming it and the known ones', 'nope' in str(e) and 'gamma' in str(e), str(e))
        on_tabs, off_tabs = for_root(entries, 'tabs')
        on_classic, off_classic = for_root(entries, 'classic')
        case('the tab pass runs the base ten and every row but the classic-only one, which it skips',
             [e.name for e in on_tabs] == [x for x in names if x != 'oldlook'] and [e.name for e in off_tabs] == ['oldlook'],
             ([e.name for e in on_tabs], [e.name for e in off_tabs]))
        case('the classic pass skips the tab-root-only rows (coachtab, intakeway) and runs the rest, the base ten included',
             [e.name for e in on_classic] == [x for x in names if x not in ('coachtab', 'intakeway')]
             and [e.name for e in off_classic] == ['coachtab', 'intakeway'], ([e.name for e in on_classic], [e.name for e in off_classic]))
        sel = select(entries, 'coachtab,intakeway')
        case('an --only of tab-root-only rows leaves the classic pass nothing to run (it ends before it installs anything)',
             for_root(sel, 'classic')[0] == [] and [e.name for e in for_root(sel, 'tabs')[0]] == ['coachtab', 'intakeway'])
        lines = {e.name: list_line(e) for e in entries}
        case('--list names each row first and says its roots when not both',
             lines['coachtab'].split()[0] == 'coachtab' and 'the tab root only' in lines['coachtab'] and 'rank 30' in lines['coachtab']
             and 'the classic root only' in lines['oldlook'] and 'leaves' in lines['oldlook'] and 'root only' not in lines['smoke']
             and 'root only' not in lines['listed'] and lines['beta'].endswith('(backgrounds, leaves)'), lines)
    with tempfile.TemporaryDirectory() as d:
        write(d, 'c_none.py', 'X = 1\n')
        write(d, 'd_short.py', 'SCENARIOS = [("short", print, 1)]\n')
        write(d, 'e_dupe.py', 'SCENARIOS = [("chat", print, 1, False)]\n')
        write(d, 'f_broken.py', 'import no_such_module_anywhere\n')
        write(d, 'g_name.py', 'SCENARIOS = [("Bad name", print, 1, False)]\n')
        write(d, 'h_types.py', 'SCENARIOS = [("typed", "not callable", True, 1, "x")]\n')
        write(d, 'i_exit.py', 'raise SystemExit(3)\n')
        write(d, 'j_twice.py', 'SCENARIOS = [("twice", print, 1, False), ("twice", print, 2, False)]\n')
        write(d, 'k_roots.py', 'SCENARIOS = [("rootword", print, 1, False, "tabs"), ("rootbad", print, 1, False, {"roots": "both-ways"}),\n'
                               '             ("rootnone", print, 1, False, {"roots": []}), ("rootmix", print, 1, False, {"roots": ["tabs", "web"]}),\n'
                               '             ("rootkey", print, 1, False, {"root": "tabs", "leaves": 1}), ("rootseq", print, 1, False, ("tabs",))]\n')
        entries, errors = registry(d)
        text = '\n'.join(errors)
        for f, what in (('c_none.py', 'no SCENARIOS list'), ('d_short.py', 'not (name, function'), ('e_dupe.py', 'the name chat is'),
                        ('f_broken.py', 'does not load'), ('g_name.py', 'name \'Bad name\''), ('i_exit.py', 'does not load'),
                        ('j_twice.py', 'the name twice is')):
            case('a refusal names %s: %s' % (f, what), any(l.startswith(f) and what in l for l in errors), text)
        h = [l for l in errors if l.startswith('h_types.py')]
        case('a row\'s every wrong type is named (function, rank, backgrounds, marks)', len(h) == 1 and all(
            w in h[0] for w in ('not callable', 'rank True', 'backgrounds 1', 'marks \'x\'')), h)
        k = {l.split(']')[0]: l for l in errors if l.startswith('k_roots.py')}
        want = {'[0': ("marks 'tabs' is not", "{'roots': 'tabs'}"), '[1': ("roots 'both-ways'",), '[2': ('roots []',),
                '[3': ("roots ['tabs', 'web']",), '[4': ("marks key 'root' unknown", 'leaves 1 is not'), '[5': ("marks ('tabs',) is not",)}
        got = {key[-2:]: line for key, line in k.items()}
        case('a malformed roots or marks is refused, saying what a tab-root-only row writes (a bare root name, an unknown root, '
             'an empty list, an unknown key, a tuple)', len(k) == 6 and all(all(w in got.get(i, '') for w in ws) for i, ws in want.items()), k)
        case('a refused row adds no scenario; the base ten keep their own', [e.name for e in entries] == base + ['twice'], [e.name for e in entries])

    # ── a mark's shot, its go file, and how a shot is judged ──
    phases = [[state('a'), mark('one'), wait(5)], [mark('two cap', cap=1500, transient=True)]]
    got, meta = with_shot_waits(phases, '/p', '07-x')
    w1, w2 = got[0][2], got[1][1]
    case('every mark is followed by its shot wait (the go file by tag and label, the mark\'s cap)', [s['op'] for s in got[0]] == ['state', 'mark', 'js', 'wait']
         and w1['label'] == 'shot-wait one' and w1['args'] == {'path': '/p/07-x.go.one', 'cap': SHOT_CAP} and w1['src'] == SHOT_WAIT_JS
         and w2['args'] == {'path': '/p/07-x.go.two-cap', 'cap': 1500} and meta['two cap']['transient'] is True and got[0][1]['hold'] == MARK_HOLD, got)
    case('the phases given are left as they were', [s['op'] for s in phases[0]] == ['state', 'mark', 'wait'], phases)
    for dup in ([[mark('two cap')], [mark('two-cap')]], [[mark('one'), wait(1), mark('one')]]):
        try:
            with_shot_waits(dup, '/p', '08-y')
            case('two marks of one launch with one file name are refused', False, dup)
        except ValueError as e:
            case('two marks of one launch with one file name are refused, naming both (%s)' % str(e).split(': ', 1)[1][:40],
                 '08-y' in str(e) and str(e).count("'") >= 4, str(e))

    class Rep:
        def __init__(self):
            self.facts, self.rows = [], []

        def fact(self, s, text):
            self.facts.append((s, text))

        def check(self, s, name, ok, detail=''):
            self.rows.append((s, name, bool(ok), detail))
            return ok

        def failed(self, word):
            return [r for r in self.rows if word in r[1] and not r[2]]

    saved = PASS
    try:
        with tempfile.TemporaryDirectory() as d:
            PASS = Pass(None, os.path.join(d, 'out'), '27.0-tabs', 'tabs')
            os.makedirs(PASS.out)
            PASS.scenario = 'chat'
            pdir = os.path.join(d, 'probe')
            os.makedirs(pdir)

            class FakeSim:
                seen = []

                def screenshot(self, path):
                    self.seen.append(os.path.exists(go_path(pdir, '04-chat', 'one')))
                    time.sleep(0.02)
                    with open(path, 'wb') as f:
                        f.write(b'png')

            t_mark = int(time.time() * 1000)
            rec = shoot_mark(FakeSim(), {'ev': 'mark', 'label': 'one', 'wall': t_mark}, '04-chat', pdir, {'one': mark('one')})
            case('a mark\'s go file is written only once its shot is on disk (none while it was taken)', FakeSim.seen == [False]
                 and os.path.isfile(go_path(pdir, '04-chat', 'one')) and rec['ok'] and rec['tag'] == '04-chat'
                 and rec['file'] == '27.0-tabs-chat-04-chat-one.png' and rec['end'] >= t_mark and rec['transient'] is False,
                 (FakeSim.seen, rec))

            def wait_ev(label, wall, **res):
                return Events([{'ev': 'js', 'label': 'shot-wait ' + label, 'wall': wall, 'result': res}])

            end = 1000000
            cases = (
                ('the page went on after the shot ended: held still', wait_ev('a', end + 40, ok=True, waited=500), False, None),
                ('the page went on at the very end: held still', wait_ev('a', end, ok=True, waited=500), False, None),
                ('the page went on before the shot ended (a go file seen too early): late, both times named',
                 wait_ev('a', end - 300, ok=True, waited=100), True, 'before the shot ended at %d' % end),
                ('the wait hit its cap: late', wait_ev('a', end + 60000, ok=False, waited=60000, last='status 404'), True, 'the cap (60000 ms)'),
                ('no Capacitor to wait in: late, its error named', wait_ev('a', end + 5, ok=False, error='no Capacitor.convertFileSrc'), True, 'no Capacitor'),
                ('the page never answered the wait: late', Events([]), True, 'never answered'),
            )
            for what, ev, late, why in cases:
                r = judge_shots([{'label': 'a', 'end': end}], ev)[0]
                case('judge_shots: %s' % what, r['late'] is late and (why is None and 'why' not in r or why is not None and why in (r.get('why') or '')), r)

            # the aggregates on a pass's records, launches and shots
            PASS = Pass(None, None, '27.0-tabs', 'tabs')
            run = [Entry('chat', None, None, False, False, 'x'), Entry('counters', None, None, False, True, 'x'),
                   Entry('inactive', None, None, True, False, 'x')]
            rec_of = lambda sc, label, lw, vis: {'scenario': sc, 'tag': '01-' + sc, 'label': label, 'leftWindow': lw, 'leftWindowAny': lw,
                                                 'visEvents': vis, 'fellBack': None}
            PASS.records = [rec_of('chat', 'up', 0, []), rec_of('counters', 'before', 0, []), rec_of('counters', 'out', 1, ['hidden@5']),
                            rec_of('inactive', 'away', 0, ['hidden@9'])]
            PASS.launches = [('chat', '01-chat', False), ('counters', '02-counters', False)]
            PASS.shots = [{'file': 'a.png', 'ok': True, 'late': False, 'transient': False},
                          {'file': 'b.png', 'ok': True, 'late': True, 'transient': True, 'why': 'the cap'}]
            cx = type('C', (), {})()
            cx.rep = Rep()
            aggregates(cx, run)
            case('the aggregates pass a clean pass: a counters state after its leave and a backgrounded one exempt, a late '
                 'transient shot a fact', not [r for r in cx.rep.rows if not r[2]] and any('transient' in f[1] for f in cx.rep.facts),
                 [r for r in cx.rep.rows if not r[2]] or cx.rep.facts)
            PASS.records.append(rec_of('counters', 'early', 0, ['hidden@1']))
            PASS.records.append(rec_of('chat', 'later', 1, []))
            PASS.launches.append(('chat', '03-chat-lime', True))
            PASS.shots.append({'file': 'c.png', 'ok': True, 'late': True, 'transient': False, 'why': 'too early'})
            cx.rep = Rep()
            aggregates(cx, run)
            case('the aggregates fail a leave outside a leaves scenario, a counters state hidden before its leave, a timed-out '
                 'launch, a late shot that is not transient',
                 len(cx.rep.failed('never left its window')) == 1 and len(cx.rep.failed('visibilitychange')) == 1
                 and len(cx.rep.failed('ran its steps to the end')) == 1 and len(cx.rep.failed('held still')) == 1
                 and 'early' in str(cx.rep.failed('visibilitychange')[0][3]) and '03-chat-lime' in str(cx.rep.failed('to the end')[0][3])
                 and 'c.png' in str(cx.rep.failed('held still')[0][3]), cx.rep.rows)

            # what the runner's terminate leaves before a verdict launch
            def fpshell(files):
                f = tempfile.mkdtemp(dir=d)
                for name, data in files.items():
                    with open(os.path.join(f, name), 'wb') as fh:
                        fh.write(data)
                return f

            files = {'presenting.coach.marker': b'presenting coach@p shell 61\n', 'presenting.coachHome.marker': b'presenting coachHome@p shell 61\n',
                     'section.tabs.marker': b'tabs@p shell 61\n1', 'model.coachHome.marker': b'coachHome@p shell 61\n0', 'notes.txt': b'x'}
            last_state = {'shell': {'screens': {'markers': ['presenting coach@p shell 61', 'tabs@p shell 61\n0'], 'up': ['coachHome', 'coach']}}}
            for timed in (False, True):
                PASS.last = {'scenario': 'wckill', 'tag': '05-wckill', 'timedOut': timed, 'state': last_state}
                folder = fpshell(files)
                cx.rep = Rep()
                found = clear_runner_markers(cx, 'marker', folder)
                left = {x: open(os.path.join(folder, x), 'rb').read() for x in sorted(os.listdir(folder))}
                kinds = {f: k for f, k, _ in found}
                gone = left == {'model.coachHome.marker': b'coachHome@p shell 61\n0', 'notes.txt': b'x', 'section.tabs.marker': b'tabs@p shell 61\n0'}
                if not timed:
                    fails = [r for r in cx.rep.rows if not r[2]]
                    case('the runner\'s leftovers: the screen marker the last state listed with its screen up removed as a fact; one '
                         'it did not list, and a section left at 1, a failed check naming both files and the launch (each gone or put to 0)',
                         gone and kinds == {'presenting.coach.marker': 'runner', 'presenting.coachHome.marker': 'unexplained',
                                            'section.tabs.marker': 'unexplained'} and len(fails) == 1
                         and all(w in str(fails[0]) for w in ('presenting.coachHome.marker', 'section.tabs.marker', '05-wckill'))
                         and len(cx.rep.facts) == 1 and 'presenting.coach.marker' in cx.rep.facts[0][1], (left, found, cx.rep.rows, cx.rep.facts))
                else:
                    case('after a launch that timed out the same leftovers are facts (the runner ended it wherever it was), the check passes',
                         gone and kinds['presenting.coachHome.marker'] == 'timed out' and kinds['section.tabs.marker'] == 'timed out'
                         and not [r for r in cx.rep.rows if not r[2]] and len(cx.rep.rows) == 1 and len(cx.rep.facts) == 2, (found, cx.rep.rows))
            PASS.last = {'scenario': 'counters', 'tag': '09-counters', 'timedOut': False,
                         'state': {'shell': {'screens': {'markers': ['presenting coach@p shell 61'], 'up': []}}}}
            folder = fpshell({'presenting.coach.marker': b'presenting coach@p shell 61\n'})
            cx.rep = Rep()
            found = clear_runner_markers(cx, 'inactive', folder)
            case('a screen marker listed while its screen was not up is no leftover of the runner\'s: a failed check',
                 [k for _, k, _ in found] == ['unexplained'] and [r[2] for r in cx.rep.rows] == [False] and not os.listdir(folder), (found, cx.rep.rows))

            # the drawn bar: a band of a shot's pixels, read back through sips
            png = os.path.join(d, 'bar.png')
            w, h = 40, 90
            raw = b''.join(b'\x00' + bytes((240, 240, 240) if y < 60 else (20, 20, 20)) * w for y in range(h))

            def chunk(t, data):
                return struct.pack('>I', len(data)) + t + data + struct.pack('>I', zlib.crc32(t + data) & 0xffffffff)

            with open(png, 'wb') as f:
                f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
                        + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
            data = png_bmp(png)
            if not data:
                case('sips turns a PNG into a BMP (the drawn bar\'s reader)', False, 'sips gave nothing')
            else:
                dark_l, light_l, mixed = bmp_luma(data, (0, 60, 40, 90)), bmp_luma(data, (0, 0, 40, 60)), bmp_luma(data, (0, 50, 40, 70))
                case('a band\'s mean luminance is read from the shot\'s rows, top to bottom (dark 20, light 240, half each 130)',
                     bmp_size(data) == (w, h) and abs(dark_l - 20) < 1 and abs(light_l - 240) < 1 and abs(mixed - 130) < 1, (dark_l, light_l, mixed))
                PASS.shots = [{'tag': '06-chat-lime', 'label': 'lime', 'ok': True, 'path': png, 'file': 'bar.png'}]
                st = {'shell': {'root': {'bar': {'frame': {'x': 0, 'y': 30, 'w': 20, 'h': 15}}, 'web': {'frame': {'x': 0, 'y': 0, 'w': 20, 'h': 45}}}}}
                luma, seen = drawn_bar(st, '06-chat-lime', 'lime')
                miss, why = drawn_bar(st, '06-chat-lime', 'toast')
                case('drawn_bar reads the bar\'s frame in points at the shot\'s scale (20 points over 40 px: the dark band)',
                     luma is not None and abs(luma - 20) < 1 and seen.get('scale') == 2.0 and seen.get('px') == [0, 60, 40, 90]
                     and miss is None and 'no shot' in why, (luma, seen, why))
            (good_d, bad_d), (good_l, bad_l) = BAR_LOOKS['dark'], BAR_LOOKS['light']
            case('the drawn bar\'s bounds keep a third of the measured gap on either side (dark %s between %s and %s, light %s '
                 'between %s and %s)' % (DARK_BAR_MAX, good_d, bad_d, LIGHT_BAR_MIN, bad_l, good_l),
                 good_d + (bad_d - good_d) / 3.0 <= DARK_BAR_MAX <= bad_d - (bad_d - good_d) / 3.0
                 and bad_l + (good_l - bad_l) / 3.0 <= LIGHT_BAR_MIN <= good_l - (good_l - bad_l) / 3.0, (DARK_BAR_MAX, LIGHT_BAR_MIN))
    finally:
        PASS = saved
    if bad:
        print('native-shell self-test: %d of %d cases wrong' % (len(bad), n[0]))
        return 1
    print('native-shell self-test: %d cases, every verdict as expected' % n[0])
    return 0


def main():
    ap = argparse.ArgumentParser(description='The native shell scenarios on one simulator and one root.')
    ap.add_argument('--phone')
    ap.add_argument('--app')
    ap.add_argument('--shell', default='61')
    ap.add_argument('--only', default='')
    ap.add_argument('--root', choices=('tabs', 'classic'), default='tabs')
    ap.add_argument('--keep-data', action='store_true', help='install over the container (no fresh one)')
    ap.add_argument('--no-install', action='store_true', help='keep the installed app and its container')
    ap.add_argument('--out', default=tempfile.gettempdir())
    ap.add_argument('--list', action='store_true')
    ap.add_argument('--self-test', action='store_true')
    opts = ap.parse_args()
    if opts.self_test:
        sys.exit(self_test())
    entries, errors = registry()
    if errors:
        for l in errors:
            print('FAIL: tests/tools/shellscen/%s' % l)
        print('native-shell: a module does not load: nothing runs')
        sys.exit(2)
    if opts.list:
        for e in entries:
            print(list_line(e))
        sys.exit(0)
    if not opts.phone or not opts.app:
        ap.error('--phone and --app are needed (or --list, --self-test)')
    try:
        run = select(entries, opts.only)
    except ValueError as e:
        print('native-shell: %s' % e)
        sys.exit(2)
    if not sim_lock_held():
        d, pid = sim_lock_holder()
        print('native-shell: the paired simulators\' lock (%s) is not this run\'s (holder pid %s): run tests/native-shell.sh, '
              'which takes it, or take it around this run' % (d, pid))
        sys.exit(2)
    os.makedirs(opts.out, exist_ok=True)
    sim = Sim(opts.phone)
    rt, name = sim.runtime()   # simctl's list: no boot needed
    osv = rt.replace('iOS-', '').replace('-', '.')
    major = int(osv.split('.')[0]) if osv.split('.')[0].isdigit() else 0
    kind = 'classic' if (opts.root == 'classic' or (major and major < 26)) else 'tabs'
    here, skipped = for_root(run, kind)
    head = '== native shell scenarios on %s (%s, %s): the %s root%s' % (name, rt, opts.phone, kind,
                                                                         ' by the policy offs file' if opts.root == 'classic' else '')
    if not here:
        print('%s: nothing to run on it (%s), so the pass ends here, before any boot or install' % (
            head, ', '.join('%s: %s' % (e.name, roots_word(e)) for e in skipped)), flush=True)
        sys.exit(0)
    cold = not booted(opts.phone)
    sim.boot()
    if cold:
        settle()
    global PASS
    PASS = Pass(sim, opts.out, '%s-%s' % (osv, kind), kind, OFFS_ARGS if opts.root == 'classic' else [])
    rep = Report('%s %s, the %s root' % (name, rt, kind))
    print(head, flush=True)
    c = Ctx(sim, rep, opts, kind, osv, major)
    t0 = time.time()
    PASS.scenario = 'setup'
    if skipped:
        rep.fact('setup', 'not run on the %s root (never counted as run): %s' % (
            kind, ', '.join('%s (%s)' % (e.name, roots_word(e)) for e in skipped)))
    try:
        ready = prepare(c)
    except Exception as e:
        traceback.print_exc()
        ready = rep.check('setup', 'ran to the end', False, repr(e)[:300])
    if ready:
        for e in here:
            PASS.scenario = e.name
            clear_shots(e.name)
            print('-- %s' % e.name, flush=True)
            try:
                e.fn(c)
            except Exception as ex:  # a scenario that breaks is a failure; the next still runs
                traceback.print_exc()
                rep.check(e.name, 'ran to the end', False, repr(ex)[:300])
        PASS.scenario = 'end'
        aggregates(c, here)
    else:
        rep.check('setup', 'the scenarios run only on the root they are written for: none ran', False, c.root)
    print('== %s: %d checks, %d failed, %.0f s' % (rep.label, len(rep.rows), len(rep.failed), time.time() - t0), flush=True)
    for scen, nm, ok, detail in rep.failed:
        print('   FAILED [%s] %s -- %s' % (scen, nm, detail))
    sys.exit(1 if rep.failed else 0)


if __name__ == '__main__':
    main()
