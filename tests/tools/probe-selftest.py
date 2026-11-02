#!/usr/bin/env python3
"""The probe's self-test (plan 13-tests-release.md T15; contract 15.3 as delta 14.2 and 17 changed it): every step of
ShellProbe that the shell scenarios lean on, and every report they read, proven in the real app on the paired iPhone of
an iOS 26+ runtime before any scenario trusts them.

  probe-selftest.py --phone UDID --app App.app [--no-install] [--only a,b] [--out DIR]

One probe launch per step (FPUI ShellProbe, Debug builds only: `-fpShellProbe <steps>`, `-fpOffline`, `-fpIgnoreMarker`),
on the bundled page under test. Each step's event must be in the log and well formed (its fields there, with their
types, and the step doing what it says: a tap that selects, a pop that pops), and each step's error form an error event
that does nothing (never a fallback that would pass falsely). Every state must carry the reports of contract 15.3 with
their types: `shell.root` (RootTabController's describe(), or {kind: classic}), each screen's `host`, `leftWindow` and
`leftWindowAny`, the top screen's first text input as `input {kind, focused, hasText, ...}` (never its text), `replaced`,
and the page's tabs-mode fields (tabsMode, fpTabsClass, tabsDisplay, vars, zoom, lastOpen, visitFrom, awayFrom,
screenChild, phScreen, seqSeen, fpTab, sheetsOpen, holds). Every event of a kind the probe logs must carry its fields:
`funnel` runs, `screenChanged` (a why in contract 8.1's words; ScreenHost's own with no run), page messages with the
shell's receipt time (`selectTab`, `sheets`, `setSwitch` among them), `intent` records (never an argument), `trovoOpen`,
`ping`, `fellBack` (contract 10.3's words). A canary typed into the native key field, and saved by CONNECT, must appear
nowhere in any probe log of the run, read after the app ended (contract 5 K4), and no `type`, `draft` or `share` event
may carry the words it was given, nor any field beyond its own. The shell's own counters (hidden, leftAny, leftWindow, markers, trips, strays) move
only where a step moves them.

Launches, in this order (`--only` picks among them; prepare and restore always run):
  prepare        what the container holds, kept to put back (every localStorage value but the key's, which is never
                 read: only whether there is one); a key (the probe's) and a programme (the starter) when there are none;
                 the native chat's device switch on. The tab root must come up: a page build the shell remembers as
                 declining tabs (or a crash verdict or breaker trip) is turned back on through TrovoShell reset, About's
                 Try again, and launched once more. The shell's folder (Application Support/FPShell) and its UserDefaults
                 copies (fp.shell.switches, fp.shell.breakers, fp.shell.counters: read when the folder's file does not)
                 are kept first
  tapTab         taps on two bar items (each one tap run, its screen change under its own run, the page hearing it),
                 a tab that is not a tab (an error, no run); the first frame's run logged once at the root's adoption
  retapTab       the selected tab again: one run, `again`
  stray          `selectedIndex` set behind the funnel: counted and redirected (a stray run); a tab that is not a tab
  waitTab        met for the selected tab, not met (in its time) for another
  pageEvents     the page's own paths: switchTab (a `selectTab` page event and a `page` run) and a sheet opened and
                 closed (two `sheets` events, the bar hidden between them); a tap on the hidden bar (an error, no run)
  pressHub       `press {where: hub}`: a label no control has (an error event); Disconnect (the page's confirm, forwarded:
                 under it a tap on the bar and a press on the hub are errors that do nothing; Cancel keeps the key); then
                 Open Chat (the chat pushed)
  navPop         the pushed chat's finished interactive pop (the hub on top again); with nothing pushed, an error
  back           `back` on the pushed chat; then Back pressed by its name: exactly one control has it
  setup          Build My Programme on the hub (the programme set aside inside the page; setup's first turn to a closed
                 loopback port): setup's chat has no control named Back (the press's matches 0, only the model's
                 fallback, which the page refuses in setup) and one Cancel, which ends setup; the programme put back
  edgeBack       an edge pan let go early (the chat stays), then one carried through (it pops)
  waitCoach      met (up), not met in its time (down)
  typeComposer   `nativeFocus` and `type` into the composer (through the keys), then into its draft once it gave the
                 keys back; never the words in a step's event
  openURL        the App's openURL hook (trovo://start: a deepLink run to Log and a `trovoOpen` event), a URL with no
                 scheme (an error), the generic `hook` step and a hook the App never set (an error)
  openURLOnActive  armed, the app sent to the background (Settings, once the hook is armed) and brought back once its page
                 went hidden: opened as the scene came forward
  fpOpenURL      a share left in the legacy slot, then -fpOpenURL trovo://share (H9's cold link): read at scene connect,
                 the first frame on Coach, no _trovoOpen; the page's boot read of the parked link takes the photo and the
                 comment (before its own +2.5 s check could)
  share          the share hook as the build can take it (no App Group container: an error that writes nothing, read back
                 through trovo://share; a build signed to run locally: the file), then the legacy slot on purpose with a
                 JPEG file beside the steps (`jpeg`), read by trovo://share
  ping           `blockPage` while a tap's tabs.select waits: its timeout held, confirmed by a ping (`ping` event, done),
                 no fallback
  sceneCycle     the scene's connection replayed twice (the step, then the generic `hook` step): a new web view in a
                 new window each time, the next phase on the new page, the old page, root and window let go, a key window
  sceneDestroy   UIKit's own request to destroy the scene's session: refused on an iPhone, nothing replaced
  classic        the tab bar's device switch off (`setSwitch`: a page event, the scene falls back now), a launch on the
                 classic root ({kind: classic}, the chat in the overlay, every tab-root step an error event), the switch
                 on again and the tab root back at the next launch
  typeKey        the connect screen (the probe's key taken away inside the page): with the programme set aside the same
                 way, the starter link pressed (coachHome.openStarter: the starter over Log, announced) and the programme
                 put back; then `type` before the field holds the keys (an error event, nothing typed), `nativeFocus`,
                 the canary (contract 5 K8: sk-ant-test- and 16 random characters) typed, the field's spoken label,
                 CONNECT pressed: the page saves it (API key saved; its key check goes to a closed loopback port, so the
                 canary never leaves the Mac); the probe's key then over it. A phone holding a key that is not the
                 probe's fails this launch and types nothing: the key would live only in the page's memory meanwhile
  restore        every localStorage value put back (and the key as it was), the native composer empty, read back in the
                 next launch (never a reload: a page reloaded under the tab root counts as hidden in use); then the
                 shell's folder and UserDefaults copies as found, a launch that reads them back (switches, every screen's
                 word, the counters' totals), and both put back once more

Exit 0 when every check passes; 1 when any fails, each failure naming what is missing or wrong; 2 on bad arguments, an
OS below 26 (no tab root), or --no-install with another app installed than --app.

The run holds the paired simulators (~/Library/Caches/FPKit/sim.lock, tests/tools/simlock.sh), unless this run's caller
already does (an agent's `fplock sim.lock`, a tool around it). Build the app first: `tests/tools/fp-build.sh selftest`
prints the folder it built into (the app is Build/Products/Debug-iphonesimulator/App.app in it). The probe logs are
copied into --out (default screenshots/out/probe-selftest/<runtime>); the steps files are removed from the app's
container at the end (one held the canary).
"""
import argparse
import hashlib
import importlib.util
import json
import math
import os
import plistlib
import secrets
import shutil
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
BID = 'app.kt.trainer'
GROUP = 'group.app.kt.trainer'
TABS = ('log', 'progress', 'coach', 'settings')
PROBE_KEY = 'sk-ant-probe-not-a-key'    # the tools' stand-in key (native-shell.py's API_KEY): no real key is ever read
CANARY_PREFIX = 'sk-ant-test-'          # contract 5 K8's test canary: this prefix and 16 random characters
KEY_LABEL = 'Anthropic API Key'         # the connect screen's field, as VoiceOver reads it (contract 6.2: connect.label)
STARTER_LABEL = 'No key? Build a starter plan instead \u2192'   # the connect screen's starter link (connect.starter.label)
# The page's coach calls (the key check, setup's first turn) go to a closed port on this Mac (-fpApiBase): nothing the
# run types or sends leaves it (D-T8).
LOOPBACK = 'http://127.0.0.1:9'
PHOTO = 'selftest-photo.jpg'            # the share hook's `jpeg` file, beside the steps files
# The shell's own UserDefaults copies (ShellSwitches, the breaker book, ShellCounters): read when the file beside them
# does not, so they are put back as found too.
SHELL_PREFS = ('fp.shell.switches', 'fp.shell.breakers', 'fp.shell.counters')
RUNS = [0]


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, file))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


nsh = _load('native_shell', 'native-shell.py')    # its Sim, Events, read_log and Report (native-store.py's)
Sim, Events, read_log, Report = nsh.Sim, nsh.Events, nsh.read_log, nsh.Report


# ── steps ────────────────────────────────────────────────────────────────────────────────────────────────────────────

def state(label, a11y=False):
    s = {'op': 'state', 'label': label}
    if a11y:
        s['a11y'] = True
    return s


def js(label, src, **args):
    return {'op': 'js', 'label': label, 'src': src, 'args': args}


def wait(ms):
    return {'op': 'wait', 'ms': ms}


def step(op, **kw):
    s = {'op': op}
    s.update(kw)
    return s


DONE = {'op': 'done'}


# ── the reports' shapes ──────────────────────────────────────────────────────────────────────────────────────────────
# A spec is a type word ('int', 'num', 'bool', 'str', 'list', 'dict', 'null', 'any'; joined by '|'), a dict (an object
# whose every key must be there, each checked against its own spec), a one-item list (a list of that), or a function
# (None when the value is right, else what is wrong). shape() answers every problem as "path: what".

def _is(word, v):
    return {'int': lambda: type(v) is int, 'num': lambda: type(v) in (int, float), 'bool': lambda: type(v) is bool,
            'str': lambda: type(v) is str, 'list': lambda: type(v) is list, 'dict': lambda: type(v) is dict,
            'null': lambda: v is None, 'any': lambda: True}[word]()


def _kind(v):
    return {bool: 'bool', int: 'int', float: 'num', str: 'str', list: 'list', dict: 'dict'}.get(type(v), 'null' if v is None else type(v).__name__)


def shape(v, spec, path='', out=None):
    out = [] if out is None else out
    if callable(spec):
        why = spec(v)
        if why:
            out.append('%s: %s' % (path or '.', why))
    elif isinstance(spec, str):
        if not any(_is(w, v) for w in spec.split('|')):
            out.append('%s: %s expected, got %s %s' % (path or '.', spec, _kind(v), json.dumps(v)[:60]))
    elif isinstance(spec, list):
        if type(v) is not list:
            out.append('%s: list expected, got %s' % (path or '.', _kind(v)))
        else:
            for i, x in enumerate(v):
                shape(x, spec[0], '%s[%d]' % (path, i), out)
    elif isinstance(spec, dict):
        if type(v) is not dict:
            out.append('%s: object expected, got %s %s' % (path or '.', _kind(v), json.dumps(v)[:60]))
        else:
            for k, sub in spec.items():
                if k not in v:
                    out.append('%s.%s: missing' % (path, k))
                else:
                    shape(v[k], sub, '%s.%s' % (path, k), out)
    return out


def oneof(*vals):
    def f(v):
        return None if v in vals else 'one of %s expected, got %s' % ('/'.join(str(x) for x in vals), json.dumps(v)[:60])
    return f


def maybe(spec):
    """null, or spec."""
    def f(v):
        if v is None:
            return None
        p = shape(v, spec)
        return '; '.join(p) if p else None
    return f


def run_ok(v):
    p = shape(v, RUN)
    if not p and v.get('t1', 0) < v.get('t0', 0):
        p.append('t1 before t0')
    if not p and v.get('moved') is False and v.get('again') is not True:
        p.append('a run that did not move says again: true')
    if not p and v.get('source') == 'page' and 'intent' not in v:
        p.append('a page run names its intent (null for none)')
    if not p and v.get('source') == 'deepLink' and type(v.get('share')) is not bool:
        p.append('a deepLink run says share')
    return '; '.join(p) if p else None


TAB = oneof(*TABS)
TAB_OR_NULL = oneof(None, *TABS)
RECT = {'x': 'num', 'y': 'num', 'w': 'num', 'h': 'num'}
RUN = {'source': oneof('tap', 'page', 'deepLink', 'initial', 'stray', 'fallback'), 'from': TAB_OR_NULL, 'to': TAB,
       'seq': 'int', 'moved': 'bool', 't0': 'num', 't1': 'num'}
# contract 10.3's fixed words for a fallback (FPCore FellBackWhy)
FELL_BACK_WHY = oneof('page', 'refused', 'no-hello', 'failures', 'policy', 'switch')
ROOT_TABS = {
    'kind': oneof('tabs'), 'fellBack': maybe({'why': FELL_BACK_WHY, 'at': 'num'}), 'selected': TAB, 'seq': 'int', 'firstRoom': 'str',
    'web': {'slot': 'str', 'inWindow': 'bool', 'hidden': 'bool', 'a11yHidden': 'bool', 'frame': RECT, 'safeBottom': 'num'},
    'bar': {'hidden': 'bool', 'h': 'int', 'safe': 'int', 'rev': 'int', 'frame': RECT, 'slotInset': 'num', 'tint': 'str',
            'style': 'str', 'containerStyle': 'str|null', 'minimize': 'str'},
    'coach': {'mode': oneof('waiting', 'native', 'web'), 'root': 'str', 'pushed': 'bool', 'depth': 'int', 'interactivePop': 'bool',
              'held': 'bool'},
    'sheetsOpen': 'bool', 'strays': 'int', 'runs': [run_ok],
}


def root_ok(v):
    if type(v) is dict and v.get('kind') == 'classic':
        return None if set(v) == {'kind'} else 'a classic root says {kind: classic} alone, got %s' % sorted(v)
    p = shape(v, ROOT_TABS)
    if not p and len(v['runs']) > 50:
        p.append('runs: the last 50 at most, got %d' % len(v['runs']))
    return '; '.join(p) if p else None


def screens_entries_ok(v):
    if type(v) is not dict:
        return 'object expected'
    bad = ['%s.host: %s' % (k, json.dumps(x.get('host')) if type(x) is dict else 'no object') for k, x in v.items()
           if type(x) is not dict or x.get('host') not in ('overlay', 'stack')]
    return '; '.join(bad) if bad else None


STACK = {'selected': 'bool', 'native': 'bool', 'held': 'bool', 'depth': 'int', 'top': 'str|null', 'interactivePop': 'bool',
         'contentPop': 'bool|null', 'inWindow': 'bool', 'waiting': 'str|null', 'waitHeldByUIKit': 'bool',
         'homeRoute': 'str|null', 'homeRev': 'int|null', 'connecting': 'bool', 'keyField': oneof('empty', 'typed'),
         'homeGround': 'dict|null'}
SCREENS = {'up': ['str'], 'screens': screens_entries_ok, 'mode': oneof('stack', 'overlay'), 'stack': maybe(STACK),
           'latched': 'list', 'webViewInWindow': 'bool', 'markers': ['str'], 'overlay': 'dict', 'coach': 'dict', 'home': 'dict',
           'transitions': ['str']}
SHELL = {'bound': oneof(True), 'phase': 'str', 'boot': 'str|null', 'pageBuild': 'str|null', 'negotiated': ['str'], 'live': ['str'],
         'documents': 'int', 'bootDones': 'int', 'pending': 'int', 'book': 'dict', 'screens': SCREENS, 'markersFound': 'list',
         'leftWindow': 'int', 'leftWindowAny': 'int', 'gate': ['str'], 'status': 'dict', 'root': root_ok}
INPUT = {'kind': oneof('composer', 'key'), 'focused': 'bool', 'hasText': 'bool', 'inWindow': 'bool', 'field': 'str',
         'a11yOn': 'bool', 'a11yLabel': 'str|null'}
PAGE = {
    'vis': 'str', 'visEvents': 'list|null', 'flag': 'dict|null', 'active': 'str|null', 'scrollY': 'num', 'innerHeight': 'num',
    'fp': {'hello': 'dict|null', 'shown': 'dict|null', 'covered': 'bool', 'v': 'int', 'boot': 'str|null'},
    'tab': 'str|null', 'view': 'str|null', 'ph': 'bool', 'webChat': 'bool', 'msgs': 'int',
    'tabsMode': 'bool', 'tabsLeft': 'bool', 'tabsWhy': 'str', 'fpTabsClass': 'bool', 'tabsDisplay': 'str|null',
    'vars': {'barUp': 'num|null', 'barH': 'num|null', 'safeB': 'num|null', 'clear': 'num|null', 'sheetB': 'num|null'},
    'zoom': 'num', 'lastOpen': 'num|null', 'visitFrom': 'num|null', 'awayFrom': 'num|null', 'screenChild': 'bool',
    'phScreen': 'str|null', 'seqSeen': 'int', 'coachMode': 'str|null', 'sheetsOpen': 'int|null', 'holds': 'int', 'fpTab': 'str|null',
}
STATE = {'label': 'any', 'page': PAGE, 'shell': SHELL, 'keyboard': 'list', 'firstResponder': 'str', 'webResponder': 'bool',
         'webScrollY': 'num', 'input': maybe(INPUT), 'replaced': maybe({'by': 'str', 'webView': 'bool', 'root': 'bool', 'window': 'bool'}),
         'keyWindow': 'str'}


# every event's own fields (ShellProbe.event)
COMMON = {'ev': 'str', 't': 'int', 'wall': 'int', 'appState': oneof(0, 1, 2)}


def _alt(ok_spec, err_spec, ok=lambda e: 'error' not in e):
    """One shape when the event says it acted (`ok`), another for its error form."""
    def f(e):
        p = shape(e, ok_spec if ok(e) else err_spec)
        return '; '.join(p) if p else None
    return f


def _all(*fs):
    def f(e):
        p = [x for x in (g(e) for g in fs) if x]
        return '; '.join(p) if p else None
    return f


def _only(*keys):
    """No field beyond the event's common ones and `keys` (a record that must never carry an argument)."""
    allowed = set(COMMON) | set(keys)

    def f(e):
        extra = sorted(k for k in e if k not in allowed)
        return 'carries %s beyond its record' % ', '.join(extra) if extra else None
    return f


def screen_changed_ok(e):
    """A VoiceOver screen change (ShellProbe's header): the tab root's (`by: root`) says why in contract 8.1's words, with
    the funnel run that made it (`run`: always one; `hold`: the run that entered the tab, if any; `mode`, `fallback`:
    none); ScreenHost's own (`by: screens`, why `screens`) has no run (delta 17.11: seq null)."""
    p = shape(e, {'by': oneof('root', 'screens'), 'seq': 'int|null', 'why': 'str', 'target': oneof('web', 'native', 'none'),
                  'rootSeq': 'int|null', 'selected': 'str|null', 'coachMode': 'str|null'})
    if not p and e['by'] == 'root':
        p = shape(e, {'why': oneof('run', 'hold', 'mode', 'fallback')})
        if not p and e['why'] == 'run' and type(e['seq']) is not int:
            p.append('.seq: a run\'s own screen change names its run')
        if not p and e['why'] in ('mode', 'fallback') and e['seq'] is not None:
            p.append('.seq: no run makes a %s screen change, got %s' % (e['why'], e['seq']))
    elif not p:
        p = shape(e, {'why': oneof('screens'), 'seq': 'null'})
    return '; '.join(p) if p else None


TAPPED = {'tab': 'str', 'activated': 'bool', 'copies': 'int', 'selected': TAB, 'seq': 'int', 'runs': [run_ok], 'strays': 'int'}
EVENTS = {
    'probe': {'steps': 'str', 'phases': 'int', 'pid': 'int', 'args': ['str']},
    'launch': {'shell': 'str', 'markersFound': 'list', 'ignored': 'bool', 'book': 'dict'},
    'installed': {'leftWindow': 'int', 'leftWindowAny': 'int'},
    'bootDone': {'page': 'str'},
    'bootDoneTimeout': {'seconds': 'num'},
    'phase': {'index': 'int', 'steps': 'int'},
    'document': {'n': 'int', 'effects': ['str']},
    'funnel': lambda e: run_ok(e) or (None if type(e.get('atAdopt', False)) is bool else 'atAdopt: bool expected'),
    'screenChanged': screen_changed_ok,
    'page': _all(lambda e: '; '.join(shape(e, {'method': 'str', 'recvT': 'int', 'recvWall': 'int'})) or None,
                 lambda e: '; '.join(shape(e, PAGE_METHODS.get(e.get('method'), {}))) or None),
    'pageRefused': {'method': 'str', 'recvT': 'int', 'recvWall': 'int', 'refused': 'str'},
    # PageLink's records: names, keys and outcomes, never an argument (delta 17.12, contract 5 K4)
    'intent': _all(lambda e: '; '.join(shape(e, {'seq': 'int', 'name': 'str', 'boot': 'str', 'key': 'str|null', 'sent': 'bool',
                                                  'outcome': 'str|null', 'ms': 'num|null'})) or None,
                   _only('seq', 'name', 'boot', 'key', 'sent', 'outcome', 'ms')),
    'trovoOpen': _alt({'url': 'str', 'handled': 'bool|null'}, {'url': 'str', 'error': 'str'}),
    'ping': {'confirming': oneof(True), 'outcome': 'str'},
    'fellBack': {'why': FELL_BACK_WHY},
    'state': STATE,
    'js': {'label': 'any', 'result': 'any'},
    'keyboard': {'kb': 'str', 'h': 'num'},
    'mark': {'label': 'any'},
    'tapTab': _alt(TAPPED, {'tab': 'any', 'activated': oneof(False), 'error': 'str'}, ok=lambda e: e.get('activated') is True),
    'retapTab': _alt(TAPPED, {'tab': 'any', 'activated': oneof(False), 'error': 'str'}, ok=lambda e: e.get('activated') is True),
    'stray': _alt({'tab': 'str', 'counted': 'int', 'strays': 'int', 'selected': TAB, 'seq': 'int', 'runs': [run_ok]},
                  {'tab': 'str', 'error': 'str'}),
    'waitTab': {'tab': 'str', 'met': 'bool', 'ms': 'int', 'selected': 'str|null'},
    'navPop': _alt({'started': oneof(True), 'depthBefore': 'int|null'}, {'started': oneof(False), 'error': 'str'},
                   ok=lambda e: e.get('started') is True),
    'press': lambda e: '; '.join(shape(e, {'pressed': 'bool', 'label': 'any'})
                                 + (shape(e, {'where': oneof('hub'), 'matches': 'int', 'control': 'str'}) if e.get('where') == 'hub' else [])
                                 + (shape(e, {'via': oneof('accessibility', 'model')}) if e.get('pressed')
                                    else shape(e, {'why': 'str'}))) or None,
    'type': _all(_alt({'length': 'int', 'kind': oneof('composer', 'key'), 'via': oneof('keys', 'draft')}, {'length': 'int', 'error': 'str'}),
                 _only('length', 'kind', 'via', 'error')),      # the words' length, never the words (contract 5 K4)
    'draft': _all(lambda e: '; '.join(shape(e, {'length': 'int|null'})) or None, _only('length')),
    'nativeFocus': {'ok': 'bool', 'kind': 'str|null', 'field': 'str|null'},
    'resign': {'ok': 'bool'},
    'openURL': _alt({'ran': oneof(True), 'url': 'str', 'opened': 'bool'}, {'ran': 'bool', 'error': 'str'}),
    'openURLOnActive': _alt({'url': 'str', 'fired': oneof(True), 'opened': 'bool'}, {'ran': 'bool', 'url': 'str', 'armed': oneof(True)},
                            ok=lambda e: 'fired' in e),
    'share': _all(_alt({'ran': oneof(True), 'jpeg': oneof('drawn', 'file'), 'bytes': 'int', 'stored': oneof('file', 'defaults'),
                        'legacy': 'bool', 'commentLength': 'int'}, {'ran': 'bool', 'error': 'str'}),
                  _only('ran', 'jpeg', 'bytes', 'stored', 'legacy', 'commentLength', 'error')),
    'sceneCycle': _alt({'ran': oneof(True), 'root': oneof('tabs', 'classic'), 'newWebView': 'bool', 'newWindow': 'bool'},
                       {'error': 'str'}),
    'sceneDestroy': _alt({'session': 'str'}, {'error': 'str'}),
    'sceneDestroyRefused': {'error': 'str'},
    'sceneDestroyNoAnswer': {'ms': 'int'},
    'hook': _alt({'name': 'str', 'ran': oneof(True)}, {'name': 'str', 'ran': 'bool', 'error': 'str'}),
    'back': {},
    'edgeBack': {'started': 'bool', 'progress': 'num', 'finish': 'bool'},
    'waitCoach': {'label': 'any', 'until': 'str', 'met': 'bool', 'ms': 'int'},
    'blockPage': {'ms': 'int'},
    'axBundles': {'loaded': ['str']},
    'intent-step': {'label': 'any'},
    'done': {},
    'unknownStep': lambda e: 'a step the probe does not know: %s' % e.get('op'),
}
# The fields a page message's event adds for its method (ShellProbe.pageMessage).
PAGE_METHODS = {
    'selectTab': {'tab': 'str', 'intent': 'str|null'},
    'sheets': {'open': 'bool'},
    'setSwitch': {'screen': 'str', 'on': 'bool'},
    'hello': {'boot': 'str|null', 'page': 'str', 'screens': ['str'], 'v': 'int'},
    'model': {'screen': 'str', 'rev': 'int'},
    'present': {'screen': 'str'},
    'dismiss': {'screen': 'str'},
    'bootDone': {'page': 'str'},
    'status': {'refresh': 'bool'},
    'reset': {'screen': 'str'},
    'visibility': {'state': 'str'},
    'toast': {'text': 'str'},
    'confirm': {'id': 'str', 'title': 'str'},
}


def event_problems(e):
    p = shape(e, COMMON)
    spec = EVENTS.get(e.get('ev'))
    if spec is not None:
        p += shape(e, spec)
    return p


# ── one launch ───────────────────────────────────────────────────────────────────────────────────────────────────────

class Ctx:
    def __init__(self, sim, rep, opts, out):
        self.sim, self.rep, self.opts, self.out = sim, rep, opts, out
        self.logs = []          # (tag, raw text) of every launch, for the canary scan
        self.tags = []          # every launch's steps file, removed at the end
        self.states = []        # (scenario, state event) of every launch
        self.away = set()       # scenarios that send the app to the background on purpose
        self.key_kind = None    # 'none', 'probe' or 'other': the key the run found (never its value)
        self.snap = None
        self.canary = CANARY_PREFIX + secrets.token_hex(8)
        self.share_text = 'Probe photo ' + secrets.token_hex(4)
        self.cold_text = 'Probe cold share ' + secrets.token_hex(4)
        self.words = ('Probe typed ' + secrets.token_hex(4), ' and more ' + secrets.token_hex(3))
        self.group = None       # whether the build has the App Group container (a build signed to run locally)
        self.extra = []         # files the run put in the container beside the steps files (the share's JPEG), removed at the end

    def check(self, scen, name, ok, detail=''):
        """A check; its detail (what was there instead) is printed only when it fails."""
        return self.rep.check(scen, name, ok, '' if ok else detail)

    def launch(self, scen, name, phases, args=(), timeout=150, during=None, until='done'):
        """One probe launch running `phases` (offline: the bundled page; markers ignored: the run ends each launch with
        simctl terminate, which can land with a screen up). A launch whose page never sent bootDone within the probe's
        30 s runs its phase on no page: launched once more. Every line of the log is checked here, and each known event's
        fields."""
        ev = None
        for attempt in (1, 2):
            ev = self._launch(name, phases, args, timeout, during, until)
            if not ev.first('bootDoneTimeout'):
                break
            self.rep.fact(scen, 'no bootDone within 30 s at launch %s (attempt %d): launched again' % (ev.tag, attempt))
        self.well_formed(scen, ev)
        for e in ev.all('state'):
            self.states.append((scen, e))
        return ev

    def _launch(self, name, phases, args, timeout, during, until):
        RUNS[0] += 1
        tag = 'selftest-%02d-%s' % (RUNS[0], name)
        pdir = self.sim.path('Documents', 'fp-probe')
        os.makedirs(pdir, exist_ok=True)
        with open(os.path.join(pdir, tag + '.json'), 'w') as f:
            json.dump({'phases': phases}, f)
        self.tags.append(tag)
        logp = os.path.join(pdir, tag + '.jsonl')
        if os.path.exists(logp):
            os.remove(logp)
        self.sim.terminate()
        pid = self.sim.launch(['-fpShellProbe', tag + '.json', '-fpShellProbeLog', tag + '.jsonl', '-fpOffline', '-fpIgnoreMarker', *args])
        t_end = time.time() + timeout
        ev = Events()
        while time.time() < t_end:
            time.sleep(0.25)
            ev = read_log(logp)
            if during:
                during(ev)
            if ev.first(until):
                break
        # the app ended first, then the log read whole: what it wrote after `done` (a late intent record, page event or
        # funnel run) is checked, scanned for the canary and copied too
        self.sim.terminate()
        ev = read_log(logp)
        raw = ''
        if os.path.exists(logp):
            with open(logp, encoding='utf-8', errors='replace') as f:
                raw = f.read()
        ev.pid, ev.tag, ev.timedOut, ev.raw = pid, tag, not ev.first(until), raw
        self.logs.append((tag, raw))
        with open(os.path.join(self.out, tag + '.jsonl'), 'w', encoding='utf-8') as f:
            f.write(raw)
        return ev

    def well_formed(self, scen, ev):
        lines = [l for l in ev.raw.splitlines() if l.strip()]
        bad, shapes = [], []
        for i, l in enumerate(lines):
            try:
                e = json.loads(l)
            except ValueError:
                bad.append('line %d is not JSON: %s' % (i + 1, l[:100]))
                continue
            if type(e) is not dict:
                bad.append('line %d is not a JSON object: %s' % (i + 1, l[:100]))
                continue
            for p in event_problems(e):
                shapes.append('%s (line %d, t %s): %s' % (e.get('ev'), i + 1, e.get('t'), p))
        why = bad[:3] or (['timed out; last events: %s' % [e.get('ev') for e in ev][-8:]] if ev.timedOut else '')
        self.check(scen, '%s: the log ran to done, every line a JSON event (%d lines)' % (ev.tag, len(lines)),
                   lines and not bad and not ev.timedOut, why)
        kinds = sorted({e.get('ev') for e in ev})
        self.check(scen, '%s: every event carries its fields with their types (%s)' % (ev.tag, ', '.join(kinds)), not shapes, shapes[:6])


# ── what the reports say ─────────────────────────────────────────────────────────────────────────────────────────────

def page(e):
    return (e or {}).get('page') or {}


def shellst(e):
    return (e or {}).get('shell') or {}


def root(e):
    return shellst(e).get('root') or {}


def scr(e):
    return shellst(e).get('screens') or {}


def stack(e):
    return scr(e).get('stack') or {}


def chat(e):
    return (scr(e).get('screens') or {}).get('coach') or {}


def first(ev, name, **kw):
    return ev.first(name, **kw) or {}


def runs_after(ev, e0):
    """The funnel events logged after event e0 (by the probe's clock)."""
    t = (e0 or {}).get('t', -1)
    return [e for e in ev.all('funnel') if e.get('t', -1) >= t and not e.get('atAdopt')]


def intents(ev, name=None):
    last = {}
    for e in ev.all('intent'):
        last[e['seq']] = e
    return [last[k] for k in sorted(last) if name is None or last[k].get('name') == name]


def tab_root_up(e):
    return root(e).get('kind') == 'tabs' and root(e).get('fellBack') is None


def short(o, keys):
    return {k: (o or {}).get(k) for k in keys}


# ── page scripts ─────────────────────────────────────────────────────────────────────────────────────────────────────
# Values cross between the page and this script as base64 of their UTF-16LE code units (native-chat.py's U16): a value can
# hold half an emoji, which JSON in Foundation refuses. The key's value never crosses at all.
U16 = r"""
function u16(s) { var bin = []; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); bin.push(String.fromCharCode(c & 255, c >> 8)); } return btoa(bin.join('')); }
function unU16(b) { var bin = atob(b), parts = [], chunk = [];
  for (var i = 0; i + 1 < bin.length; i += 2) { chunk.push(bin.charCodeAt(i) | (bin.charCodeAt(i + 1) << 8)); if (chunk.length === 8192) { parts.push(String.fromCharCode.apply(null, chunk)); chunk = []; } }
  parts.push(String.fromCharCode.apply(null, chunk)); return parts.join(''); }
function kept(k) { return k !== 'kt_apikey' && k !== 'kt_last_open' && k !== 'kt_wch_log' && k.indexOf('kt__store') !== 0; }
"""

# The prepare pattern (native-chat.py's scen_prepare): what the container holds, kept to put back; a key and a programme
# when there are none; the native chat's device switch on. kt_last_open (the visit stamp), kt_wch_log (the watch bridge's
# breadcrumbs: every boot adds one) and the native copy's own kt__store keys are the app's to move (spec 128 leaves the
# first two out too); the key is never read out, only whether it is the probe's.
SNAP_JS = U16 + r"""
var o = {}, keys = [];
for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
keys.forEach(function (k) { if (kept(k)) o[u16(k)] = u16(localStorage.getItem(k)); });
var key = localStorage.getItem('kt_apikey');
var keyKind = key === null ? 'none' : (key === args.probeKey ? 'probe' : 'other');
if (key === null) localStorage.setItem('kt_apikey', args.probeKey);
var programme = false;
if (!getCustomRoutine()) { setCustomRoutine(buildStarterRoutine({goal: 'muscle', days: 3, runs: 0, equip: 'full', exp: 1})); _startProgramme(); programme = true; }
var nativeOff = localStorage.getItem('kt_native_off') !== null;
localStorage.removeItem('kt_native_off');
render();
return { snap: o, keyKind: keyKind, programme: programme, nativeOff: nativeOff, values: Object.keys(o).length,
  build: (typeof APP_BUILD !== 'undefined') ? APP_BUILD : null, theme: localStorage.getItem('kt_theme') };
"""

# About's Try again for the bar and the hub (TrovoShell reset: a decline, crash verdicts and breaker records go) and the
# bar's device switch on: the tab root from the next launch. Each answer's own words come back.
RETRY_JS = r"""
var P = _fpPlugin(); if (!P) return { error: 'no TrovoShell' };
var out = {};
function say(k, p) { return Promise.resolve(p).then(function (s) { out[k] = s && s.screens ? s.screens[k === 'switch' ? 'tabs' : k] || 'ok' : 'ok'; },
  function (e) { out[k] = 'refused: ' + String(e && e.message || e); }); }
await say('tabs', P.reset({screen: 'tabs'}));
await say('coachHome', P.reset({screen: 'coachHome'}));
await say('switch', P.setSwitch({screen: 'tabs', on: true}));
return out;
"""

RESTORE_JS = U16 + r"""
var snap = {}, now = [], changed = [], removed = [];
Object.keys(args.snap).forEach(function (k) { snap[unU16(k)] = unU16(args.snap[k]); });
for (var i = 0; i < localStorage.length; i++) now.push(localStorage.key(i));
now.forEach(function (k) { if (kept(k) && !Object.prototype.hasOwnProperty.call(snap, k)) { localStorage.removeItem(k); removed.push(k); } });
Object.keys(snap).forEach(function (k) { if (kept(k) && localStorage.getItem(k) !== snap[k]) { localStorage.setItem(k, snap[k]); changed.push(k); } });
var key = localStorage.getItem('kt_apikey'), keyNow;
if (args.keyKind === 'none') { localStorage.removeItem('kt_apikey'); keyNow = 'none'; }
else if (args.keyKind === 'probe') { if (key !== args.probeKey) localStorage.setItem('kt_apikey', args.probeKey); keyNow = 'probe'; }
else keyNow = key === null ? 'missing' : (key === args.probeKey ? 'probe' : 'other');
return { changed: changed, removed: removed, key: keyNow };
"""

SAME_JS = U16 + r"""
var diff = [], n = 0;
Object.keys(args.snap).forEach(function (k) { var key = unU16(k); n++; if (localStorage.getItem(key) !== unU16(args.snap[k])) diff.push(key); });
for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (kept(k) && !args.snap[u16(k)]) diff.push(k + ' (added)'); }
var key = localStorage.getItem('kt_apikey');
return { diff: diff, compared: n, key: key === null ? 'none' : (key === args.probeKey ? 'probe' : 'other') };
"""

# The connect screen inside one document: the probe's key taken away (typeKey runs only while the phone holds the probe's
# key or none: a key that is not the probe's would live in nothing but the page's memory until it was put back), the
# page's own render pushes the hub's connect model.
KEY_ASIDE_JS = r"""
var had = localStorage.getItem('kt_apikey') !== null;
localStorage.removeItem('kt_apikey');
render();
return { had: had };
"""
# What the connect screen saved, never the key: whether there is one, its first 12 characters (the canary's prefix, or
# the probe key's) and its length.
SAVED_JS = r"""
var k = localStorage.getItem('kt_apikey');
return { saved: k !== null, prefix: k ? k.slice(0, 12) : null, length: k ? k.length : 0 };
"""
# The page's two composers and the shared photo, by size only.
COMPOSER_JS = r"""
var i = document.getElementById('coach-input');
return { web: i ? i.value.length : null, photo: (typeof pendingImage !== 'undefined' && pendingImage) ? pendingImage.data.length : 0 };
"""
CLEAR_JS = r"""
if (typeof pendingImage !== 'undefined') pendingImage = null;
var i = document.getElementById('coach-input'); if (i) _fillComposer('');
render();
return true;
"""
# The connect screen's starter link shows only with no programme: the programme set aside the same way (page memory),
# then put back as it was, the starter overlay closed.
NO_PROGRAMME_JS = r"""
window.__fpProbeRoutine = localStorage.getItem('kt_routine');
lsDel('kt_routine');
render();
return { had: window.__fpProbeRoutine !== null, now: !!getCustomRoutine() };
"""
STARTER_JS = r"""
return { overlay: !!document.getElementById('starterOverlay'), tab: (typeof currentTab !== 'undefined') ? currentTab : null };
"""
PROGRAMME_BACK_JS = r"""
if (typeof closeStarterIntake === 'function') closeStarterIntake();
// the stored text as it was; the page's read cache forgets the key as lsDel does
if (window.__fpProbeRoutine) { localStorage.setItem('kt_routine', window.__fpProbeRoutine); delete _lsCache['kt_routine']; _todayActMemo = null; }
window.__fpProbeRoutine = null;
render();
return { back: !!getCustomRoutine(), overlay: !!document.getElementById('starterOverlay') };
"""
# The probe's key again, over what the connect screen saved (restore takes it away again when the phone had none).
KEY_BACK_JS = r"""
localStorage.setItem('kt_apikey', args.probeKey);
render();
return { back: localStorage.getItem('kt_apikey') === args.probeKey };
"""


# ── the launches ─────────────────────────────────────────────────────────────────────────────────────────────────────

def scen_prepare(c):
    s = 'prepare'
    ev = c.launch(s, 'prepare', [[wait(600), js('snap', SNAP_JS, probeKey=PROBE_KEY), wait(800), state('prepared'), DONE]])
    r = first(ev, 'js', label='snap').get('result') or {}
    c.snap, c.key_kind = r.get('snap'), r.get('keyKind')
    c.check(s, 'what the container holds is kept to put back (%s values; the key\'s never read)' % r.get('values'),
            isinstance(c.snap, dict) and c.key_kind in ('none', 'probe', 'other'), {k: r.get(k) for k in ('values', 'keyKind', 'error')})
    c.rep.fact(s, 'page %s, room %s; key %s%s; %s; the native chat\'s device switch %s' % (
        r.get('build'), r.get('theme'), c.key_kind, ' (the probe\'s added)' if c.key_kind == 'none' else '',
        'a starter programme added' if r.get('programme') else 'its own programme', 'turned on' if r.get('nativeOff') else 'on'))
    e = ev.state('prepared')
    if tab_root_up(e):
        return True
    st = (shellst(e).get('status') or {}).get('screens') or {}
    c.rep.fact(s, 'the root is %s (tabs %s, coachHome %s): About\'s Try again (TrovoShell reset) and the bar\'s switch on, then '
                  'launched again' % (root(e).get('kind'), json.dumps(st.get('tabs')), json.dumps(st.get('coachHome'))))
    ev = c.launch(s, 'retry', [[wait(600), js('retry', RETRY_JS), DONE]])
    c.rep.fact(s, 'Try again answered: %s' % json.dumps(first(ev, 'js', label='retry').get('result')))
    ev = c.launch(s, 'root', [[wait(800), state('root'), DONE]])
    e = ev.state('root')
    st = (shellst(e).get('status') or {}).get('screens') or {}
    return c.check(s, 'the tab root is up (the steps under test need it)', tab_root_up(e),
                   {'root': short(root(e), ('kind', 'fellBack')), 'tabs': st.get('tabs'), 'coachHome': st.get('coachHome')})


def scen_tapTab(c):
    s = 'tapTab'
    # a pause after each tap: a web tab's screen change is posted once the page has drawn it, and a newer run before that
    # takes the announcement over (VoiceOver hears the tab it ends on)
    ev = c.launch(s, 'tapTab', [[wait(800), state('start'), step('tapTab', tab='settings'), step('waitTab', tab='settings', ms=3000),
                                 wait(900), step('tapTab', tab='progress'), step('waitTab', tab='progress', ms=3000), wait(700), state('after'),
                                 step('tapTab', tab='nope'), wait(600), state('after nope'), DONE]])
    taps = ev.all('tapTab')
    good = [t for t in taps if t.get('tab') in ('settings', 'progress')]
    c.check(s, 'tapTab on two bar items: each activated by one tap run (UIKit\'s path: a finger on the item\'s control)',
            len(good) == 2 and all(t.get('activated') is True and len(t.get('runs') or []) == 1 and t['runs'][0].get('source') == 'tap'
                                   and t['runs'][0].get('to') == t.get('tab') and t.get('selected') == t.get('tab') and t.get('copies', 0) >= 1
                                   for t in good), [short(t, ('tab', 'activated', 'selected', 'copies', 'runs', 'error')) for t in good])
    c.check(s, 'tapTab moves the selection when it names another tab (again false), and the run carries seq, t0 and t1',
            any(t.get('again') is False and t['runs'][0].get('moved') is True for t in good if t.get('runs')), [t.get('again') for t in good])
    a = ev.state('after')
    c.check(s, 'the root and the page both say progress after it (selected, the page\'s currentTab, its seq seen)',
            root(a).get('selected') == 'progress' and page(a).get('tab') == 'progress' and page(a).get('seqSeen') == root(a).get('seq'),
            {'root': root(a).get('selected'), 'page': page(a).get('tab'), 'seqSeen': page(a).get('seqSeen'), 'seq': root(a).get('seq')})
    bad, an = first(ev, 'tapTab', tab='nope'), ev.state('after nope')
    c.check(s, 'tapTab on a tab that is not one: an error event, nothing tapped (no run, never a fallback to selectedIndex)',
            bad.get('activated') is False and str(bad.get('error', '')).startswith('no tab nope') and not runs_after(ev, bad)
            and root(an).get('seq') == root(a).get('seq') and root(an).get('selected') == 'progress',
            {'event': bad, 'runs after': runs_after(ev, bad), 'seq': (root(a).get('seq'), root(an).get('seq'))})
    fun = [e for e in ev.all('funnel') if e.get('source') == 'tap']
    c.check(s, 'a funnel event for each tap run, the same run the step reports', sorted(e.get('seq') for e in fun)
            == sorted(t['runs'][0].get('seq') for t in good if t.get('runs')), {'funnel': [short(e, ('seq', 'to')) for e in fun]})
    moved = [t['runs'][0]['seq'] for t in good if t.get('runs') and t['runs'][0].get('moved')]
    sc = [e for e in ev.all('screenChanged') if e.get('by') == 'root' and e.get('seq') in moved]
    c.check(s, 'each tap that moved posts its screen change under its own run (screenChanged by root, why run, the web view)',
            moved and {e.get('seq') for e in sc} == set(moved) and all(e.get('why') == 'run' and e.get('target') == 'web' for e in sc),
            [short(e, ('seq', 'why', 'target', 'selected')) for e in ev.all('screenChanged')])
    sel = intents(ev, 'tabs.select')
    c.check(s, 'the page hears each run once (one tabs.select a tap, done)', len(sel) == len(good) and all(r.get('outcome') == 'done' for r in sel),
            [short(r, ('seq', 'outcome', 'ms')) for r in sel])
    adopt = [e for e in ev.all('funnel') if e.get('atAdopt')]
    c.check(s, 'the runs made before the root was adopted are logged once, marked atAdopt (the first frame\'s initial run)',
            any(e.get('source') == 'initial' for e in adopt), [short(e, ('source', 'to', 'seq')) for e in adopt])


def scen_retapTab(c):
    s = 'retapTab'
    ev = c.launch(s, 'retapTab', [[wait(800), step('tapTab', tab='settings'), step('waitTab', tab='settings', ms=3000), wait(500),
                                   step('retapTab'), wait(600), state('after'), DONE]])
    rt = first(ev, 'retapTab')
    c.check(s, 'retapTab: the selected tab tapped again, one run that did not move (again)', rt.get('activated') is True
            and rt.get('again') is True and rt.get('tab') == 'settings' and len(rt.get('runs') or []) == 1
            and rt['runs'][0].get('moved') is False and rt['runs'][0].get('source') == 'tap', rt)
    a = ev.state('after')
    c.check(s, 'still on settings, the seq moved on by the re-tap', root(a).get('selected') == 'settings' and root(a).get('seq') == rt.get('seq'),
            short(root(a), ('selected', 'seq')))


def scen_stray(c):
    s = 'stray'
    ev = c.launch(s, 'stray', [[wait(800), step('tapTab', tab='log'), step('waitTab', tab='log', ms=3000), wait(400), state('before'),
                                step('stray', tab='progress'), step('waitTab', tab='progress', ms=3000), wait(500), state('after'),
                                step('stray', tab='nope'), DONE]])
    b, a = ev.state('before'), ev.state('after')
    st = first(ev, 'stray', tab='progress')
    c.check(s, 'stray: selectedIndex set behind the funnel is counted and redirected (one stray run to progress)',
            st.get('counted') == 1 and st.get('strays') == root(b).get('strays', -9) + 1 and len(st.get('runs') or []) == 1
            and st['runs'][0].get('source') == 'stray' and st['runs'][0].get('to') == 'progress' and st.get('selected') == 'progress', st)
    c.check(s, 'after it: the root counts the stray and the page shows progress', root(a).get('strays') == root(b).get('strays', -9) + 1
            and root(a).get('selected') == 'progress' and page(a).get('tab') == 'progress',
            {'before': root(b).get('strays'), 'after': root(a).get('strays'), 'page': page(a).get('tab')})
    bad = first(ev, 'stray', tab='nope')
    c.check(s, 'stray on a tab that is not one: an error event', str(bad.get('error', '')).startswith('no tab nope'), bad)


def scen_waitTab(c):
    s = 'waitTab'
    ev = c.launch(s, 'waitTab', [[wait(800), step('tapTab', tab='settings'), step('waitTab', tab='settings', ms=3000),
                                  step('waitTab', tab='log', ms=400), DONE]])
    w = ev.all('waitTab')
    c.check(s, 'waitTab: met for the selected tab, within its time', len(w) == 2 and w[0].get('met') is True and w[0].get('selected') == 'settings'
            and w[0].get('ms', 9e9) <= 3000, w[:1])
    c.check(s, 'waitTab: not met for another tab, at its deadline, naming the selection', len(w) == 2 and w[1].get('met') is False
            and w[1].get('ms', 0) >= 400 and w[1].get('selected') == 'settings', w[1:])


def scen_pageEvents(c):
    s = 'pageEvents'
    ev = c.launch(s, 'pageEvents', [[wait(800), step('tapTab', tab='log'), step('waitTab', tab='log', ms=3000), wait(500),
                                     js('select', "switchTab('progress'); return true;"), step('waitTab', tab='progress', ms=3000), wait(600),
                                     state('selected'), js('sheet', "openThemeSheet(); return true;"), wait(1200), state('sheet open'),
                                     step('tapTab', tab='log'), wait(600), state('tapped under the sheet'),
                                     js('close', "closeThemeSheet(); return true;"), wait(1200), state('sheet closed'), DONE]])
    sel = [e for e in ev.all('page') if e.get('method') == 'selectTab']
    c.check(s, 'the page\'s switchTab sends selectTab, logged as a page event with the shell\'s receipt time (recvT, recvWall)',
            any(e.get('tab') == 'progress' for e in sel), [short(e, ('tab', 'intent', 'recvT', 'recvWall')) for e in sel])
    pr = [e for e in ev.all('funnel') if e.get('source') == 'page' and e.get('to') == 'progress']
    c.check(s, 'its funnel run says page (with its intent)', len(pr) == 1 and 'intent' in pr[0], pr)
    sh = [e for e in ev.all('page') if e.get('method') == 'sheets']
    opens = [e.get('open') for e in sh]
    c.check(s, 'a sheet opened and closed: sheets {open: true} then {open: false}, each with its receipt time', True in opens and False in opens
            and opens.index(True) < len(opens) - 1 - opens[::-1].index(False), [short(e, ('open', 'recvT', 'recvWall')) for e in sh])
    so, sc = ev.state('sheet open'), ev.state('sheet closed')
    c.check(s, 'the reports follow it: the bar hidden and the root\'s sheetsOpen while it is open, the page counting the sheet; back after',
            (root(so).get('bar') or {}).get('hidden') is True and root(so).get('sheetsOpen') is True and (page(so).get('sheetsOpen') or 0) >= 1
            and (root(sc).get('bar') or {}).get('hidden') is False and root(sc).get('sheetsOpen') is False and page(sc).get('sheetsOpen') == 0,
            {'open': [(root(so).get('bar') or {}).get('hidden'), root(so).get('sheetsOpen'), page(so).get('sheetsOpen'), page(so).get('holds')],
             'closed': [(root(sc).get('bar') or {}).get('hidden'), root(sc).get('sheetsOpen'), page(sc).get('sheetsOpen'), page(sc).get('holds')]})
    # delta 17.4: no finger can tap a bar a sheet has hidden, so the step taps nothing (the lookup found the item: the
    # refusal is the hit test's, not the tab id's); the launch's first tapTab (log, before the sheet) is not this one
    ut = ev.state('tapped under the sheet')
    hb = next((e for e in ev.all('tapTab') if e.get('tab') == 'log' and e.get('t', -1) >= (so or {}).get('t', 9e9)), {})
    between = [e for e in runs_after(ev, ev.first('state', label='sheet open')) if e.get('t', 9e9) <= (ut or {}).get('t', -1)]
    c.check(s, 'tapTab while a sheet hides the bar: an error event (the bar is hidden), no run, the selection and seq unchanged',
            hb.get('activated') is False and str(hb.get('error', '')).startswith('the bar is hidden') and (hb.get('copies') or 0) >= 1
            and not between and root(ut).get('selected') == 'progress' and root(ut).get('seq') == root(so).get('seq'),
            {'event': hb, 'runs': between, 'selected': root(ut).get('selected'), 'seq': (root(so).get('seq'), root(ut).get('seq'))})


def scen_pressHub(c):
    s = 'pressHub'
    # Disconnect asks first: the page forwards its confirm, which fills the screen from the shell's window over the bar and
    # the hub (delta 17.4, 17.13): neither a tap on the bar nor a press on the hub gets through it; Cancel keeps the key
    ev = c.launch(s, 'pressHub', [[wait(1500), state('hub'), step('press', label='No Such Control', where='hub'),
                                   step('press', label='Disconnect', where='hub'), step('waitCoach', label='confirm', until='confirm', ms=5000),
                                   wait(500), state('confirm'), step('tapTab', tab='log'), step('press', label='Open Chat', where='hub'),
                                   wait(300), state('under the confirm'), step('press', label='Cancel', where='overlay'), wait(1200),
                                   state('cancelled'),
                                   step('press', label='Open Chat', where='hub'), step('waitCoach', label='up', until='up', ms=6000),
                                   wait(1200), state('chat'), DONE]], args=['-devNav', 'coach'])
    h = ev.state('hub')
    home = (scr(h).get('screens') or {}).get('coachHome') or {}
    c.check(s, 'the native hub is up: the Coach tab NATIVE at the stack\'s root, its screen hosted in the stack',
            root(h).get('selected') == 'coach' and (root(h).get('coach') or {}).get('mode') == 'native' and stack(h).get('top') == 'coachHome'
            and stack(h).get('homeRoute') == 'hub' and home.get('host') == 'stack',
            {'coach': root(h).get('coach'), 'top': stack(h).get('top'), 'homeRoute': stack(h).get('homeRoute'), 'coachHome': home})
    ps = ev.all('press')
    bad = next((p for p in ps if p.get('control') == 'No Such Control'), {})
    c.check(s, 'press {where: hub} on a label no control has: an error event (error and why alike), nothing pressed',
            bad.get('pressed') is False and bad.get('matches') == 0 and bad.get('error') == bad.get('why')
            and str(bad.get('error', '')).startswith('no control named'), bad)
    dc = next((p for p in ps if p.get('control') == 'Disconnect'), {})
    asked = [r for r in intents(ev, 'coachHome.disconnect')]
    conf = [e for e in ev.all('page') if e.get('method') == 'confirm']
    c.check(s, 'press {where: hub} on Disconnect: pressed through its element; the page took coachHome.disconnect and forwarded its confirm',
            dc.get('pressed') is True and dc.get('via') == 'accessibility' and dc.get('matches') == 1 and len(asked) == 1
            and asked[0].get('outcome') == 'done' and (first(ev, 'waitCoach', label='confirm').get('met') is True) and len(conf) == 1,
            {'press': dc, 'disconnect': asked, 'confirm': [short(e, ('id', 'title')) for e in conf], 'wait': first(ev, 'waitCoach', label='confirm')})
    cf, uc = ev.state('confirm'), ev.state('under the confirm')
    tb = first(ev, 'tapTab', tab='log')
    between = [e for e in runs_after(ev, cf) if e.get('t', 9e9) <= (uc or {}).get('t', -1)]
    c.check(s, 'tapTab under the shell\'s confirm: an error event (a finger lands on the confirm over the bar), no run, Coach still selected',
            tb.get('activated') is False and str(tb.get('error', '')).startswith("a finger on log lands on the shell's confirm")
            and not between and root(uc).get('selected') == 'coach' and root(uc).get('seq') == root(cf).get('seq'),
            {'event': tb, 'runs': between, 'selected': root(uc).get('selected')})
    oc = [p for p in ps if p.get('control') == 'Open Chat']
    hp = oc[0] if oc else {}
    c.check(s, 'press {where: hub} under the shell\'s confirm: an error event, nothing pressed (the hub is covered)',
            len(oc) == 2 and hp.get('pressed') is False and hp.get('error') == "the hub is covered: the shell's confirm is open"
            and not [r for r in intents(ev, 'coachHome.openChat') if r.get('t', 9e9) < (uc or {}).get('t', -1)], hp)
    cn, ca = next((p for p in ps if p.get('control') == 'Cancel'), {}), ev.state('cancelled')
    c.check(s, 'press {label: Cancel, where: overlay}: the confirm answered no, the key kept (the hub, not the connect screen)',
            cn.get('pressed') is True and stack(ca).get('homeRoute') == 'hub' and root(ca).get('selected') == 'coach',
            {'press': cn, 'route': stack(ca).get('homeRoute')})
    ok = oc[-1] if oc else {}
    c.check(s, 'press {where: hub} on Open Chat: pressed through its accessibility element, one match', ok.get('pressed') is True
            and ok.get('via') == 'accessibility' and ok.get('matches') == 1 and ok.get('where') == 'hub', ok)
    oc = intents(ev, 'coachHome.openChat')
    ch = ev.state('chat')
    c.check(s, 'the page took coachHome.openChat once and the chat is pushed over the hub (host stack)', len(oc) == 1
            and oc[0].get('outcome') == 'done' and chat(ch).get('host') == 'stack' and (root(ch).get('coach') or {}).get('depth') == 2,
            {'openChat': oc, 'chat': short(chat(ch), ('host', 'presented')), 'coach': root(ch).get('coach')})


def scen_navPop(c):
    s = 'navPop'
    ev = c.launch(s, 'navPop', [[step('waitCoach', label='up', until='up', ms=8000), wait(1500), state('pushed'), step('navPop'),
                                 step('waitCoach', label='down', until='down', ms=5000), wait(1000), state('popped'), step('navPop'), DONE]],
                  args=['-devNav', 'coach/chat'])
    p, q = ev.state('pushed'), ev.state('popped')
    co = root(p).get('coach') or {}
    c.check(s, 'the chat pushed over the hub: depth 2, pushed, the chat\'s host the stack, iOS 26\'s content pop off while attached',
            co.get('mode') == 'native' and co.get('pushed') is True and co.get('depth') == 2 and chat(p).get('host') == 'stack'
            and stack(p).get('contentPop') is False, {'coach': co, 'host': chat(p).get('host'), 'contentPop': stack(p).get('contentPop')})
    n = ev.all('navPop')
    c.check(s, 'navPop: the finished interactive pop began through the latch (from depth 2)', len(n) == 2 and n[0].get('started') is True
            and n[0].get('depthBefore') == 2, n[:1])
    c.check(s, 'the hub on top again, the chat down, the page heard coach.back', (root(q).get('coach') or {}).get('depth') == 1
            and stack(q).get('top') == 'coachHome' and 'coach' not in (scr(q).get('up') or [])
            and [r.get('outcome') for r in intents(ev, 'coach.back')] == ['done'],
            {'coach': root(q).get('coach'), 'top': stack(q).get('top'), 'up': scr(q).get('up'), 'back': intents(ev, 'coach.back')})
    c.check(s, 'navPop with nothing pushed: an error event (no pop)', len(n) == 2 and n[1].get('started') is False and 'error' in n[1], n[1:])


def scen_back(c):
    s = 'back'
    ev = c.launch(s, 'back', [[step('waitCoach', label='up', until='up', ms=8000), wait(1200), state('pushed'), step('back'),
                               step('waitCoach', label='down', until='down', ms=5000), wait(800), state('back'),
                               step('press', label='Open Chat', where='hub'), step('waitCoach', label='up again', until='up', ms=6000),
                               wait(1200), step('press', label='Back'), step('waitCoach', label='down again', until='down', ms=5000),
                               wait(600), state('back2'), DONE]], args=['-devNav', 'coach/chat'])
    b = ev.state('back')
    c.check(s, 'back: the pushed chat\'s Back; the chat down, the hub on top, coach.back done', ev.first('back') is not None
            and 'coach' not in (scr(b).get('up') or []) and stack(b).get('top') == 'coachHome' and (root(b).get('coach') or {}).get('depth') == 1
            and (intents(ev, 'coach.back') or [{}])[0].get('outcome') == 'done',
            {'up': scr(b).get('up'), 'top': stack(b).get('top'), 'back': intents(ev, 'coach.back')})
    pb = next((p for p in ev.all('press') if p.get('label') == 'Back' or p.get('control') == 'Back'), {})
    c.check(s, 'the pushed chat has exactly one control named Back, pressed through it', pb.get('pressed') is True
            and pb.get('via') == 'accessibility' and pb.get('matches') == 1, pb)
    c.check(s, 'the chat down again after it', 'coach' not in (scr(ev.state('back2')).get('up') or []), scr(ev.state('back2')).get('up'))


def scen_setup(c):
    s = 'setup'
    # The hub's Build My Programme (the programme set aside inside the page, as typeKey's starter step does): setup's chat
    # pushed with Cancel and no Back (T15 item 1, "none in setup"); its first turn goes to the closed loopback port. Over
    # an earlier chat the page asks first (Start). `press {label: Back}` falls back to the chat model's Back when no
    # control has the name, so the proof is its matches (0) and its via (model, never accessibility); the page refuses
    # that coach.back in setup (intake) and the shell puts the chat up again. Cancel then asks to stop setup (Stop setup).
    ev = c.launch(s, 'setup', [[wait(1500), js('no programme', NO_PROGRAMME_JS), wait(1500), state('hub'),
                                step('press', label='Build My Programme', where='hub'), step('waitCoach', label='ask', until='confirm', ms=2500),
                                step('press', label='Start', where='overlay'), step('waitCoach', label='up', until='up', ms=8000),
                                step('waitCoach', label='settled', until='idle', ms=10000), wait(1000),
                                js('intake', "return { intake: intakeMode };"), state('setup'),
                                step('press', label='Back'), wait(1500), step('waitCoach', label='up again', until='up', ms=6000), wait(800),
                                state('after back'), step('press', label='Cancel'), step('waitCoach', label='stop?', until='confirm', ms=5000),
                                step('press', label='Stop setup', where='overlay'), wait(1500), js('ended', "return { intake: intakeMode };"),
                                state('stopped'), js('programme back', PROGRAMME_BACK_JS), wait(800), DONE]],
                  args=['-devNav', 'coach', '-fpApiBase', LOOPBACK], timeout=200)
    h = ev.state('hub')
    c.check(s, 'with no programme the hub offers Build My Programme (the hub route, the programme set aside)',
            stack(h).get('homeRoute') == 'hub' and (first(ev, 'js', label='no programme').get('result') or {}).get('now') is False,
            {'route': stack(h).get('homeRoute'), 'js': first(ev, 'js', label='no programme').get('result')})
    ps = ev.all('press')
    bp = next((p for p in ps if p.get('control') == 'Build My Programme'), {})
    si = intents(ev, 'coachHome.startIntake')
    st = ev.state('setup')
    c.check(s, 'press {where: hub} on Build My Programme: the page took coachHome.startIntake; setup\'s chat pushed over the hub',
            bp.get('pressed') is True and bp.get('via') == 'accessibility' and len(si) == 1 and si[0].get('outcome') == 'done'
            and (first(ev, 'js', label='intake').get('result') or {}).get('intake') is True and 'coach' in (scr(st).get('up') or [])
            and chat(st).get('host') == 'stack',
            {'press': bp, 'startIntake': si, 'intake': first(ev, 'js', label='intake').get('result'), 'up': scr(st).get('up')})
    back = next((p for p in ps if p.get('label') == 'Back' or p.get('control') == 'Back'), {})
    c.check(s, 'setup\'s chat has no control named Back: the press found none (matches 0) and only the model\'s fallback went (via model)',
            back.get('matches') == 0 and back.get('via') == 'model', back)
    cb = intents(ev, 'coach.back')
    ab = ev.state('after back')
    c.check(s, 'the page refused that Back in setup (coach.back: intake) and the chat is up again, still in setup',
            len(cb) == 1 and 'intake' in str(cb[0].get('outcome')) and 'coach' in (scr(ab).get('up') or [])
            and first(ev, 'waitCoach', label='up again').get('met') is True,
            {'coach.back': cb, 'up': scr(ab).get('up'), 'wait': first(ev, 'waitCoach', label='up again')})
    cn = next((p for p in ps if p.get('control') == 'Cancel'), {})
    stop = next((p for p in ps if p.get('control') == 'Stop setup'), {})
    c.check(s, 'setup\'s Cancel: one control of that name, pressed through it; the page asked to stop setup and the answer ended it',
            cn.get('pressed') is True and cn.get('via') == 'accessibility' and cn.get('matches') == 1
            and [r.get('outcome') for r in intents(ev, 'coach.cancelIntake')] == ['done'] and stop.get('pressed') is True
            and (first(ev, 'js', label='ended').get('result') or {}).get('intake') is False,
            {'cancel': cn, 'cancelIntake': intents(ev, 'coach.cancelIntake'), 'stop': stop, 'ended': first(ev, 'js', label='ended').get('result')})
    pb = first(ev, 'js', label='programme back').get('result') or {}
    c.check(s, 'the programme put back inside the page', pb.get('back') is True, pb)


def scen_edgeBack(c):
    s = 'edgeBack'
    ev = c.launch(s, 'edgeBack', [[step('waitCoach', label='up', until='up', ms=8000), wait(1200),
                                   step('edgeBack', progress=0.3, finish=False), wait(1200), state('held'),
                                   step('edgeBack', progress=0.8, finish=True), step('waitCoach', label='down', until='down', ms=5000),
                                   wait(800), state('popped'), DONE]], args=['-devNav', 'coach/chat'])
    e = ev.all('edgeBack')
    h, p = ev.state('held'), ev.state('popped')
    c.check(s, 'edgeBack let go early: started, the chat stays pushed', len(e) == 2 and e[0].get('started') is True and e[0].get('finish') is False
            and (root(h).get('coach') or {}).get('depth') == 2 and 'coach' in (scr(h).get('up') or []), {'event': e[:1], 'coach': root(h).get('coach')})
    c.check(s, 'edgeBack carried through: started, the chat popped to the hub', len(e) == 2 and e[1].get('started') is True
            and e[1].get('finish') is True and (root(p).get('coach') or {}).get('depth') == 1 and 'coach' not in (scr(p).get('up') or []),
            {'event': e[1:], 'coach': root(p).get('coach')})


def scen_waitCoach(c):
    s = 'waitCoach'
    ev = c.launch(s, 'waitCoach', [[step('waitCoach', label='up', until='up', ms=8000), step('waitCoach', label='down', until='down', ms=400),
                                    step('waitCoach', label='idle', until='idle', ms=4000), DONE]], args=['-devNav', 'coach/chat'])
    w = {e.get('label'): e for e in ev.all('waitCoach')}
    c.check(s, 'waitCoach up: met (the pushed chat)', (w.get('up') or {}).get('met') is True, w.get('up'))
    c.check(s, 'waitCoach down: not met within its 400 ms, the time it waited said', (w.get('down') or {}).get('met') is False
            and (w.get('down') or {}).get('ms', 0) >= 400, w.get('down'))
    c.check(s, 'waitCoach idle: met (no reply in flight)', (w.get('idle') or {}).get('met') is True, w.get('idle'))


def scen_typeComposer(c):
    s = 'typeComposer'
    w1, w2 = c.words
    ev = c.launch(s, 'typeComposer', [[step('waitCoach', label='up', until='up', ms=8000), wait(1200), step('nativeFocus'), wait(900),
                                       step('type', text=w1), wait(500), state('typed'), step('resign'), wait(700),
                                       step('type', text=w2), wait(300), state('drafted'), step('draft', text=''), wait(300),
                                       state('cleared'), DONE]], args=['-devNav', 'coach/chat'])
    nf = first(ev, 'nativeFocus')
    c.check(s, 'nativeFocus: the composer takes the keys (kind composer)', nf.get('ok') is True and nf.get('kind') == 'composer', nf)
    ty = ev.all('type')
    c.check(s, 'type through the keys while the composer holds them: kind composer, via keys, its length only', len(ty) == 2
            and ty[0].get('via') == 'keys' and ty[0].get('kind') == 'composer' and ty[0].get('length') == len(w1), ty[:1])
    t = ev.state('typed')
    inp = t.get('input') or {}
    c.check(s, 'the state\'s input: the composer, focused, holding text, in its window; never its text', inp.get('kind') == 'composer'
            and inp.get('focused') is True and inp.get('hasText') is True and inp.get('inWindow') is True and w1 not in json.dumps(inp), inp)
    c.check(s, 'the words reached the composer\'s store (its draft, where build 60\'s tools read it)', chat(t).get('draft') == w1, chat(t).get('draft'))
    c.check(s, 'type once the composer gave the keys back: into its draft (via draft), its length only', len(ty) == 2
            and ty[1].get('via') == 'draft' and ty[1].get('length') == len(w2) and chat(ev.state('drafted')).get('draft') == w1 + w2, ty[1:])
    c.check(s, 'draft \'\': the composer empty again', chat(ev.state('cleared')).get('draft') == '', chat(ev.state('cleared')).get('draft'))
    leak = [e.get('ev') for e in ev if e.get('ev') in ('type', 'draft', 'nativeFocus', 'resign') and any(w.strip() in json.dumps(e) for w in c.words)]
    c.check(s, 'no type, draft, nativeFocus or resign event carries the words', not leak, leak)


def scen_openURL(c):
    s = 'openURL'
    ev = c.launch(s, 'openURL', [[wait(800), step('tapTab', tab='progress'), step('waitTab', tab='progress', ms=3000), wait(400),
                                  step('openURL', url='trovo://start'), step('waitTab', tab='log', ms=4000), wait(800), state('opened'),
                                  step('openURL', url='no scheme here'), step('hook', name='openURL', url='trovo://start'), wait(800),
                                  step('hook', name='nope'), DONE]])
    ou = ev.all('openURL')
    c.check(s, 'openURL trovo://start: the App\'s hook opened it through the App delegate', len(ou) == 2 and ou[0].get('url') == 'trovo://start'
            and ou[0].get('opened') is True and ou[0].get('ran') is True, ou[:1])
    # the open runs the funnel inside the hook's own call, so its run is logged just before the step's event
    dl = [e for e in runs_after(ev, first(ev, 'waitTab', tab='progress')) if e.get('source') == 'deepLink']
    c.check(s, 'its funnel run: deepLink to Log (share false)', bool(dl) and dl[0].get('to') == 'log' and dl[0].get('share') is False
            and dl[0].get('t', 9e9) <= (ou[0].get('t', -1) if ou else -1), dl[:2])
    to = ev.all('trovoOpen')
    c.check(s, 'a trovoOpen event once the page\'s _trovoOpen returned (handled), with the root then', bool(to) and to[0].get('url') == 'trovo://start'
            and to[0].get('handled') is True and type(to[0].get('root')) is dict and to[0]['root'].get('selected') == 'log', to[:1])
    c.check(s, 'the root and the page on Log', root(ev.state('opened')).get('selected') == 'log' and page(ev.state('opened')).get('tab') == 'log',
            (root(ev.state('opened')).get('selected'), page(ev.state('opened')).get('tab')))
    c.check(s, 'openURL with no scheme: an error event, nothing opened', len(ou) == 2 and ou[1].get('error') == 'no url with a scheme', ou[1:])
    hk = ev.all('hook')
    c.check(s, 'the generic hook step runs the App\'s hook by name (openURL)', len(hk) == 2 and hk[0].get('name') == 'openURL'
            and hk[0].get('ran') is True and hk[0].get('opened') is True, hk[:1])
    c.check(s, 'a hook the App never set: an error event', len(hk) == 2 and hk[1].get('ran') is False
            and str(hk[1].get('error', '')).startswith('the App set no nope hook'), hk[1:])


def scen_openURLOnActive(c):
    s = 'openURLOnActive'
    c.away.add(s)
    # The trip follows the log, not the host's clock (a loaded Mac can take seconds to switch apps): Settings comes up once
    # the hook is armed; the app is brought back once its page has gone hidden (the page's visibility message, sent as
    # the app leaves the screen), or after 30 s without it; the phase waits up to 60 s for the link's tab.
    trip = {'stage': 'arming', 'at': 0.0, 'hidden': None}

    def away(ev):
        now = time.time()
        if trip['stage'] == 'arming' and ev.first('openURLOnActive', armed=True):
            c.sim.open_app('com.apple.Preferences')     # the app leaves the screen
            trip.update(stage='leaving', at=now)
        elif trip['stage'] == 'leaving':
            hidden = any(e.get('method') == 'visibility' and e.get('state') == 'hidden' for e in ev.all('page'))
            if hidden or now - trip['at'] > 30:
                trip.update(stage='back', hidden=hidden)
                c.sim.sh('xcrun', 'simctl', 'launch', c.sim.udid, BID, check=False)   # and comes back, as a widget's link brings it
    ev = c.launch(s, 'openURLOnActive', [[wait(800), step('tapTab', tab='progress'), step('waitTab', tab='progress', ms=3000), wait(300),
                                          step('openURLOnActive', url='trovo://start'), step('waitTab', tab='log', ms=60000), wait(800),
                                          state('back'), DONE]], during=away, timeout=200)
    armed, fired = first(ev, 'openURLOnActive', armed=True), first(ev, 'openURLOnActive', fired=True)
    c.rep.fact(s, 'the trip: %s' % ('the page went hidden, then the app was brought back' if trip['hidden']
                                     else 'brought back after 30 s with no hidden page seen' if trip['stage'] == 'back' else 'never armed'))
    c.check(s, 'openURLOnActive: armed for the next foreground', armed.get('url') == 'trovo://start' and armed.get('ran') is True, armed)
    c.check(s, 'fired as the scene came forward, opened through the App delegate', fired.get('opened') is True
            and fired.get('url') == 'trovo://start', fired or 'no fired event (the app never came back?)')
    dl = [e for e in runs_after(ev, armed) if e.get('source') == 'deepLink']
    c.check(s, 'the link\'s funnel run: deepLink to Log, at the return (none while it was armed)', bool(fired) and [e.get('to') for e in dl] == ['log']
            and dl[0].get('t', -1) <= fired.get('t', -1), {'runs': dl, 'fired at': fired.get('t')})


def scen_fpOpenURL(c):
    s = 'fpOpenURL'
    # A share waits in the legacy slot first (written once the page's own +2.5 s boot read has passed, so nothing reads it
    # in that launch); then a cold launch with -fpOpenURL trovo://share. Contract 9: the first frame's tab, the parked
    # link, no _trovoOpen. The page's boot read (TrovoWidget.consumeDeepLink at +0.4 s, then the share read after hello)
    # takes the photo and the comment before its own +2.5 s check could have: the share's selectTab {coach, chat} reaching
    # the shell less than 2.5 s after the page's script began says the parked link did it.
    pre = c.launch(s, 'fpOpenURL-share', [[wait(3200), step('share', comment=c.cold_text, legacy=True), DONE]])
    sh = first(pre, 'share')
    c.check(s, 'a share waits in the legacy slot (the photo drawn, nothing read it in that launch)', sh.get('stored') == 'defaults'
            and sh.get('jpeg') == 'drawn' and not [e for e in pre.all('page') if e.get('method') == 'selectTab'], sh)
    ev = c.launch(s, 'fpOpenURL', [[wait(1200), state('cold'), wait(3500), js('composer', COMPOSER_JS), state('read'),
                                    step('draft', text=''), js('clear', CLEAR_JS), DONE]], args=['-fpOpenURL', 'trovo://share'])
    first_run = [e for e in ev.all('funnel') if e.get('atAdopt') and e.get('source') == 'initial']
    k = ev.state('cold')
    c.check(s, '-fpOpenURL trovo://share is read at scene connect as a connection URL: the first frame on Coach (a cold share)',
            [e.get('to') for e in first_run] == ['coach'] and root(k).get('selected') == 'coach' and page(k).get('tab') == 'coach',
            {'initial': first_run, 'root': root(k).get('selected'), 'page': page(k).get('tab')})
    c.check(s, 'a cold link is parked for the page\'s boot read: no _trovoOpen evaluated (no trovoOpen event)', not ev.all('trovoOpen'),
            ev.all('trovoOpen'))
    got, rd = first(ev, 'js', label='composer').get('result') or {}, ev.state('read')
    c.check(s, 'the page\'s boot read took the parked link: the shared photo in hand, the comment in a composer',
            (got.get('photo') or 0) > 1000 and (chat(rd).get('draft') == c.cold_text or got.get('web') == len(c.cold_text)),
            {'composer': got, 'native draft length': len(chat(rd).get('draft') or '')})
    # The page's own check is set 2.5 s ahead (setTimeout) after its script stamped _visitFrom (Date.now(), earlier in the
    # same script): a read by that check reaches the shell no sooner than visitFrom + 2500 on the wall clock the shell's
    # receipt (recvWall) shares. A selectTab {coach, chat} received before that came from the parked link's read. No
    # visibilitychange in the launch (_arrive would move visitFrom). Load can only push the parked read past the bound
    # (a failure to rerun), never a +2.5 s read under it.
    vf = page(k).get('visitFrom')
    took = next((e for e in ev.all('page') if e.get('method') == 'selectTab' and e.get('tab') == 'coach' and e.get('intent') == 'chat'), {})
    lead = took.get('recvWall', 9e15) - vf if type(vf) in (int, float) else None
    c.check(s, 'it read the share through the parked link, not the page\'s +2.5 s check: its selectTab {coach, chat} reached the shell less '
               'than 2.5 s after the page\'s script began (visitFrom; under heavy load rerun)',
            bool(took) and lead is not None and lead < 2500 and not page(k).get('visEvents') and not page(rd).get('visEvents'),
            {'visitFrom': vf, 'selectTab recvWall': took.get('recvWall'), 'lead ms': lead,
             'visEvents': [page(k).get('visEvents'), page(rd).get('visEvents')]})


def scen_share(c):
    s = 'share'
    gc = c.sim.sh('xcrun', 'simctl', 'get_app_container', c.sim.udid, BID, GROUP, check=False).strip()
    c.group = bool(gc) and os.path.isdir(gc)
    c.rep.fact(s, 'this build has %s (%s)' % ('the App Group container' if c.group else 'no App Group container',
                                               'signed to run locally' if c.group else 'CODE_SIGNING_ALLOWED=NO: the share hook must refuse'))
    # the `jpeg` argument's file: a real JPEG beside the steps files (the app icon, through sips), removed at the end
    photo, size = c.sim.path('Documents', 'fp-probe', PHOTO), 0
    os.makedirs(os.path.dirname(photo), exist_ok=True)
    icon = os.path.join(REPO, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png')
    c.sim.sh('sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', icon, '--out', photo, check=False)
    c.extra.append(photo)
    if os.path.exists(photo):
        size = os.path.getsize(photo)
    c.check(s, 'a JPEG for the hook\'s jpeg argument beside the steps files (%d bytes)' % size, size > 1000, photo)
    phase = [wait(800), step('share', comment=c.share_text)]
    if c.group:
        phase += [step('openURL', url='trovo://share'), wait(3500), state('shared file'), js('composer file', COMPOSER_JS),
                  step('draft', text=''), js('clear file', CLEAR_JS)]
    else:
        # the refused write is read back: trovo://share must find nothing (no photo, no comment, both composers empty)
        phase += [step('openURL', url='trovo://share'), wait(3500), js('composer refused', COMPOSER_JS), state('refused read')]
    phase += [step('share', comment=c.share_text, legacy=True, jpeg=PHOTO), step('openURL', url='trovo://share'), wait(3500), state('shared'),
              js('composer', COMPOSER_JS), step('draft', text=''), js('clear', CLEAR_JS), DONE]
    ev = c.launch(s, 'share', [phase])
    sh = ev.all('share')
    one = sh[0] if sh else {}
    if c.group:
        c.check(s, 'share (a build with the App Group): pendingShare.jpg written as the extension writes it (stored file)',
                one.get('stored') == 'file' and one.get('legacy') is False and one.get('commentLength') == len(c.share_text), one)
    else:
        c.check(s, 'share with no App Group container: an error event that writes nothing (stored none), never the legacy slot unasked',
                one.get('ran') is True and one.get('stored') == 'none' and 'error' in one, one)
        got, rr = first(ev, 'js', label='composer refused').get('result') or {}, ev.state('refused read')
        c.check(s, 'read back, the refused share left nothing: trovo://share read no photo and no comment (both composers empty)',
                got.get('photo') == 0 and got.get('web') in (0, None) and (chat(rr).get('draft') or '') == '',
                {'composer': got, 'native draft length': len(chat(rr).get('draft') or '')})
    leg = sh[1] if len(sh) > 1 else {}
    c.check(s, 'share {legacy: true, jpeg: <file>}: the base64 slot on purpose (stored defaults), the file\'s bytes, the comment\'s length only',
            leg.get('stored') == 'defaults' and leg.get('legacy') is True and leg.get('jpeg') == 'file' and leg.get('bytes') == size
            and size > 0 and leg.get('commentLength') == len(c.share_text), {'event': leg, 'file': size})
    c.check(s, 'no share event carries the comment', not [e for e in sh if c.share_text in json.dumps(e)], None)
    to = [e for e in ev.all('trovoOpen') if e.get('url') == 'trovo://share']
    c.check(s, 'trovo://share: a trovoOpen event (handled) and a deepLink run that says share', bool(to) and to[-1].get('handled') is True
            and any(e.get('source') == 'deepLink' and e.get('share') is True for e in ev.all('funnel')), {'trovoOpen': to[-1:]})
    got = first(ev, 'js', label='composer').get('result') or {}
    st = ev.state('shared')
    c.check(s, 'the page read the shared file and comment (TrovoShare\'s read): the file\'s photo in hand (its base64), the comment in a composer',
            got.get('photo') == 4 * math.ceil(size / 3) and size > 0
            and (chat(st).get('draft') == c.share_text or got.get('web') == len(c.share_text)),
            {'composer': got, 'want photo': 4 * math.ceil(size / 3), 'native draft length': len(chat(st).get('draft') or '')})


def scen_ping(c):
    s = 'ping'
    # tabs.select times out at 2 s and is held; its confirming ping goes next and has 2 s of its own: a page busy for 3 s
    # answers it (busy past 4 s, the ping times out too and the held timeout counts as a failure)
    ev = c.launch(s, 'ping', [[wait(800), step('tapTab', tab='progress'), step('waitTab', tab='progress', ms=3000), wait(500),
                               step('blockPage', ms=3000), step('tapTab', tab='settings'), wait(7000), state('free'), DONE]])
    bp = first(ev, 'blockPage')
    c.check(s, 'blockPage: the page\'s main thread busy for its ms', bp.get('ms') == 3000, bp)
    tp = first(ev, 'tapTab', tab='settings')
    c.check(s, 'a tap while the page is busy still runs the funnel natively', tp.get('activated') is True, tp)
    pg = ev.all('ping')
    sel = [r for r in intents(ev, 'tabs.select') if r.get('seq') and tp]
    c.check(s, 'the held timeout of tabs.select is confirmed by a ping, answered once the page is free (ping event, done)',
            any(p.get('confirming') is True and p.get('outcome') == 'done' for p in pg), {'ping': pg, 'tabs.select': [short(r, ('seq', 'outcome', 'ms')) for r in sel]})
    f = ev.state('free')
    c.check(s, 'a busy page trips nothing: no fallback, root and page on settings once it is free', not ev.all('fellBack')
            and root(f).get('fellBack') is None and root(f).get('selected') == 'settings' and page(f).get('tab') == 'settings',
            {'fellBack': ev.all('fellBack'), 'root': root(f).get('selected'), 'page': page(f).get('tab')})


def scen_sceneCycle(c):
    s = 'sceneCycle'
    ev = c.launch(s, 'sceneCycle', [
        [wait(800), state('before'), step('tapTab', tab='progress'), step('waitTab', tab='progress', ms=3000), step('sceneCycle')],
        [wait(1500), state('after'), step('tapTab', tab='settings'), step('waitTab', tab='settings', ms=3000), wait(400), state('cycled'),
         step('hook', name='sceneCycle')],
        [wait(1500), state('after hook'), DONE]], timeout=200)
    b, a, cy, ah = ev.state('before'), ev.state('after'), ev.state('cycled'), ev.state('after hook')
    c.check(s, 'before any teardown, replaced is null', b and 'replaced' in b and b.get('replaced') is None, (b or {}).get('replaced'))
    sc = ev.all('sceneCycle')
    c.check(s, 'sceneCycle: the App\'s replay; the new root a tab root, a new web view in a new window', len(sc) == 2
            and all(e.get('ran') is True and e.get('root') == 'tabs' and e.get('newWebView') is True and e.get('newWindow') is True for e in sc), sc)
    gone = {'by': 'sceneCycle', 'webView': False, 'root': False, 'window': False}
    c.check(s, 'the next phase ran on the new page, and the old page, root and window went (replaced)', a and a.get('replaced') == gone
            and root(a).get('kind') == 'tabs' and shellst(a).get('documents') == 1, {'replaced': (a or {}).get('replaced'), 'root': short(root(a), ('kind', 'seq'))})
    c.check(s, 'the new root takes taps', root(cy).get('selected') == 'settings', root(cy).get('selected'))
    # the old window let go (replaced.window false), so the scene's key window after a replay is the new one: SceneDelegate
    # made it key and visible (the state names the key window's type; nil when the scene has none)
    kw = {lb: (e or {}).get('keyWindow') for lb, e in (('before', b), ('after', a), ('cycled', cy), ('after hook', ah))}
    c.check(s, 'the scene has a key window, a UIWindow, before and after each replay', all(v == 'Optional(UIWindow)' for v in kw.values()), kw)
    c.check(s, 'the generic hook step replays it too (the phase ended there; replaced again, all let go)', ah and ah.get('replaced') == gone,
            (ah or {}).get('replaced'))
    c.check(s, 'three documents, three bootDones (one per page)', len(ev.all('bootDone')) == 3, len(ev.all('bootDone')))


def scen_sceneDestroy(c):
    s = 'sceneDestroy'
    ev = c.launch(s, 'sceneDestroy', [[wait(800), step('sceneDestroy'), wait(4000), state('asked'), DONE]])
    sd, sr, na = first(ev, 'sceneDestroy'), first(ev, 'sceneDestroyRefused'), first(ev, 'sceneDestroyNoAnswer')
    a = ev.state('asked')
    c.check(s, 'sceneDestroy: UIKit refuses it for this app (one scene on an iPhone); the phase goes on, nothing replaced',
            bool(sd.get('session')) and 'error' in sr and 'late' not in sr and not na and a and a.get('replaced') is None,
            {'asked': sd, 'refused': sr, 'noAnswer': na, 'replaced': (a or {}).get('replaced')})


def scen_classic(c):
    s = 'classic'
    off = r"""var P = _fpPlugin(); return Promise.resolve(P.setSwitch({screen: 'tabs', on: false})).then(function (st) {
      return { ok: true, root: st && st.root, tabs: st && st.screens && st.screens.tabs }; }, function (e) { return { error: String(e && e.message || e) }; });"""
    on = off.replace('on: false', 'on: true')
    ev = c.launch(s, 'switchOff', [[wait(800), step('tapTab', tab='progress'), step('waitTab', tab='progress', ms=3000), state('tabs'),
                                    js('off', off), wait(1500), state('fell back'), DONE]])
    sw = [e for e in ev.all('page') if e.get('method') == 'setSwitch']
    c.check(s, 'the page\'s setSwitch (the bar\'s device switch off): a page event with the shell\'s receipt time', len(sw) == 1
            and sw[0].get('screen') == 'tabs' and sw[0].get('on') is False, [short(e, ('screen', 'on', 'recvT', 'recvWall')) for e in sw])
    fb, f = ev.all('fellBack'), ev.state('fell back')
    c.check(s, 'off acts at once: a fellBack event (switch), the root\'s fellBack set, its kind still tabs, the page\'s own bar',
            [e.get('why') for e in fb] == ['switch'] and root(f).get('kind') == 'tabs' and (root(f).get('fellBack') or {}).get('why') == 'switch'
            and page(f).get('tabsMode') is False, {'events': fb, 'root': short(root(f), ('kind', 'fellBack')), 'tabsMode': page(f).get('tabsMode')})
    ev = c.launch(s, 'classic', [[step('waitCoach', label='up', until='up', ms=8000), wait(1200), state('classic'),
                                  step('press', label='Open Chat', where='hub'), step('tapTab', tab='log'), step('retapTab'),
                                  step('stray', tab='log'), step('navPop'), step('back'), step('waitCoach', label='down', until='down', ms=5000),
                                  js('on', on), DONE]], args=['-devNav', 'coach/chat'])
    k = ev.state('classic')
    c.check(s, 'the next launch builds the classic root: describe().root is {kind: classic}', root(k) == {'kind': 'classic'}, root(k))
    c.check(s, 'the chat in 60\'s overlay there (its host overlay, .overFullScreen), the page in classic mode', chat(k).get('host') == 'overlay'
            and chat(k).get('overFullScreen') is True and scr(k).get('mode') == 'overlay' and page(k).get('tabsMode') is False,
            {'chat': short(chat(k), ('host', 'overFullScreen', 'presented')), 'mode': scr(k).get('mode'), 'tabsMode': page(k).get('tabsMode')})
    ph = first(ev, 'press', where='hub')
    c.check(s, 'press {where: hub} under the classic root: an error event', ph.get('pressed') is False
            and ph.get('error') == "no hub: no tab root (the scene's root is classic)", ph)
    errs = {n: first(ev, n) for n in ('tapTab', 'retapTab', 'stray')}
    c.check(s, 'tapTab, retapTab and stray under the classic root: error events, nothing tapped',
            all(str(e.get('error', '')).startswith('no tab root') and e.get('activated', False) is False for e in errs.values()), errs)
    nv = first(ev, 'navPop')
    c.check(s, 'navPop with no Coach stack: an error event', nv.get('started') is False and 'no Coach stack' in str(nv.get('error')), nv)
    c.check(s, 'back on 60\'s overlay chat takes it down', first(ev, 'waitCoach', label='down').get('met') is True, first(ev, 'waitCoach', label='down'))
    ev = c.launch(s, 'tabsAgain', [[wait(800), state('again'), DONE]])
    c.check(s, 'the switch on again: the tab root back at the next launch', tab_root_up(ev.state('again')), short(root(ev.state('again')), ('kind', 'fellBack')))


def scen_typeKey(c):
    s = 'typeKey'
    if c.key_kind == 'other':
        # the connect screen needs the key gone and a canary saved in its place; a key that is not the probe's would live
        # only in the page's memory meanwhile, and a crash or a timeout would lose it for good: nothing is touched
        c.check(s, 'the phone holds a key that is not the probe\'s: typeKey sets nothing aside and types no canary (remove the '
                   'key, or run on a phone with the probe\'s key or none)', False, 'key: other')
        return
    can = c.canary
    # The connect screen (the key taken away inside the page): its starter link first (it shows only with no programme),
    # then the canary (contract 5 K8: sk-ant-test- and 16 random characters) typed into the key field and saved by
    # CONNECT, the key check sent to a closed loopback port (-fpApiBase), so the canary never leaves the Mac; the probe's
    # key then over it again (restore takes it away when the phone had none).
    ev = c.launch(s, 'typeKey', [[wait(1500), state('hub'), js('aside', KEY_ASIDE_JS), wait(2000), state('connect'),
                                  js('no programme', NO_PROGRAMME_JS), wait(1500), state('starter link'),
                                  step('press', label=STARTER_LABEL, where='hub'), wait(1500), js('starter', STARTER_JS), state('starter'),
                                  js('programme back', PROGRAMME_BACK_JS), wait(800),
                                  js('to coach', "switchTab('coach'); return true;"), step('waitTab', tab='coach', ms=3000), wait(1500),
                                  state('connect again'),
                                  step('type', text=can), wait(300), state('untyped'), step('nativeFocus'), wait(900),
                                  step('type', text=can), wait(500), state('typed', a11y=True), step('resign'), wait(500),
                                  step('press', label='CONNECT', where='hub'), step('waitCoach', label='toast', until='toast', ms=5000),
                                  wait(1500), js('saved', SAVED_JS), state('saved'),
                                  js('back', KEY_BACK_JS, probeKey=PROBE_KEY), wait(2000), state('hub again'), DONE]],
                  args=['-devNav', 'coach', '-fpApiBase', LOOPBACK], timeout=200)
    cn = ev.state('connect')
    inp = (cn or {}).get('input') or {}
    c.check(s, 'the connect screen: the hub\'s route connect, its key field the top screen\'s first input (kind key), empty',
            stack(cn).get('homeRoute') == 'connect' and stack(cn).get('keyField') == 'empty' and inp.get('kind') == 'key'
            and inp.get('hasText') is False, {'route': stack(cn).get('homeRoute'), 'input': inp})
    sl = ev.state('starter link')
    c.check(s, 'with no programme the connect screen draws its starter link', (first(ev, 'js', label='no programme').get('result') or {}).get('now') is False
            and stack(sl).get('homeRoute') == 'connect' and scr(sl).get('home', {}).get('starter') is True,
            {'route': stack(sl).get('homeRoute'), 'home': short(scr(sl).get('home'), ('route', 'connect', 'starter'))})
    pst = first(ev, 'press', control=STARTER_LABEL)
    op = intents(ev, 'coachHome.openStarter')
    st = first(ev, 'js', label='starter').get('result') or {}
    after = [e for e in ev.all('page') if pst.get('t', 9e9) <= e.get('t', -1) <= first(ev, 'js', label='starter').get('t', 9e9)]
    c.check(s, 'press {where: hub} on the starter link: through its element, one match; the page took coachHome.openStarter',
            pst.get('pressed') is True and pst.get('via') == 'accessibility' and pst.get('matches') == 1 and len(op) == 1
            and op[0].get('outcome') == 'done', {'press': pst, 'openStarter': op})
    c.check(s, 'the starter opened over Log: a selectTab page event (log) and a sheets {open: true} event after the press, the overlay up',
            any(e.get('method') == 'selectTab' and e.get('tab') == 'log' for e in after) and any(e.get('method') == 'sheets' and e.get('open') is True for e in after)
            and st.get('overlay') is True and st.get('tab') == 'log' and root(ev.state('starter')).get('selected') == 'log',
            {'page events': [short(e, ('method', 'tab', 'open')) for e in after][:6], 'page': st, 'root': root(ev.state('starter')).get('selected')})
    pb = first(ev, 'js', label='programme back').get('result') or {}
    ca = ev.state('connect again')
    c.check(s, 'the programme put back inside the page, the starter closed; back on Coach, the connect screen again',
            pb.get('back') is True and pb.get('overlay') is False and root(ca).get('selected') == 'coach'
            and stack(ca).get('homeRoute') == 'connect' and stack(ca).get('keyField') == 'empty',
            {'programme': pb, 'selected': root(ca).get('selected'), 'route': stack(ca).get('homeRoute')})
    ty = ev.all('type')
    c.check(s, 'type before the key field holds the keys: an error event, nothing typed (never a draft)', len(ty) == 2
            and ty[0].get('kind') == 'key' and str(ty[0].get('error', '')).startswith('the key field does not hold the keys')
            and 'via' not in ty[0] and ((ev.state('untyped') or {}).get('input') or {}).get('hasText') is False
            and stack(ev.state('untyped')).get('keyField') == 'empty', ty[:1])
    nf = first(ev, 'nativeFocus')
    c.check(s, 'nativeFocus: the key field takes the keys (kind key)', nf.get('ok') is True and nf.get('kind') == 'key', nf)
    c.check(s, 'type into the key field through the keys: kind key, via keys, its length only', len(ty) == 2 and ty[1].get('via') == 'keys'
            and ty[1].get('kind') == 'key' and ty[1].get('length') == len(can), ty[1:])
    t = ev.state('typed')
    ti = (t or {}).get('input') or {}
    c.check(s, 'the state\'s input: the key field, focused, holding text, its spoken label "%s" (accessibility on); never its text' % KEY_LABEL,
            ti.get('kind') == 'key' and ti.get('focused') is True and ti.get('hasText') is True and ti.get('a11yOn') is True
            and ti.get('a11yLabel') == KEY_LABEL and stack(t).get('keyField') == 'typed', ti)
    pk = first(ev, 'press', control='CONNECT')
    sk = intents(ev, 'coachHome.setKey')
    toasts = [e.get('text') for e in ev.all('page') if e.get('method') == 'toast' and e.get('t', -1) >= pk.get('t', 9e9)]
    c.check(s, 'CONNECT pressed through its element; the page saved the canary (coachHome.setKey done) and said so (API key saved)',
            pk.get('pressed') is True and pk.get('via') == 'accessibility' and len(sk) == 1 and sk[0].get('outcome') == 'done'
            and 'API key saved' in toasts and first(ev, 'waitCoach', label='toast').get('met') is True,
            {'press': pk, 'setKey': sk, 'toasts': toasts})
    sv, sd = first(ev, 'js', label='saved').get('result') or {}, ev.state('saved')
    c.check(s, 'kt_apikey holds the canary (its prefix and length; the key never read out); the hub, its key field empty again',
            sv.get('saved') is True and sv.get('prefix') == CANARY_PREFIX and sv.get('length') == len(can)
            and stack(sd).get('homeRoute') == 'hub' and stack(sd).get('keyField') == 'empty',
            {'saved': sv, 'route': stack(sd).get('homeRoute'), 'keyField': stack(sd).get('keyField')})
    back = first(ev, 'js', label='back').get('result') or {}
    c.check(s, 'the probe\'s key over the canary; the hub again', back.get('back') is True and stack(ev.state('hub again')).get('homeRoute') == 'hub',
            {'key': back, 'route': stack(ev.state('hub again')).get('homeRoute')})


def scen_restore(c):
    s = 'restore'
    if not isinstance(c.snap, dict):
        c.check(s, 'something to put back', False, 'prepare kept nothing')
        return
    # two launches, never a reload: a page reloaded under the tab root goes hidden in use, which the shell counts as a
    # fault (its `hidden` counter); WebKit is given time to write the values down before the app ends, and the next
    # launch reads what the first put back
    ev = c.launch(s, 'restore', [[wait(600), js('restore', RESTORE_JS, snap=c.snap, keyKind=c.key_kind, probeKey=PROBE_KEY),
                                  step('draft', text=''), wait(2500), DONE]])
    r = first(ev, 'js', label='restore').get('result') or {}
    ev = c.launch(s, 'restored', [[wait(900), js('same', SAME_JS, snap=c.snap, probeKey=PROBE_KEY), state('restored'), DONE]])
    same = first(ev, 'js', label='same').get('result') or {}
    c.rep.fact(s, 'put back %d value(s), removed %d: %s' % (len(r.get('changed') or []), len(r.get('removed') or []),
                                                         ', '.join(sorted((r.get('changed') or []) + (r.get('removed') or [])))[:300]))
    c.check(s, 'every localStorage value as the run found it (read in the next launch), the key as it was (%s)' % c.key_kind,
            same.get('diff') == [] and same.get('key') == ('none' if c.key_kind == 'none' else ('probe' if c.key_kind == 'probe' else 'other')),
            same)
    c.check(s, 'the native composer is empty', chat(ev.state('restored')).get('draft') in ('', None), chat(ev.state('restored')).get('draft'))


ORDER = ['tapTab', 'retapTab', 'stray', 'waitTab', 'pageEvents', 'pressHub', 'navPop', 'back', 'setup', 'edgeBack', 'waitCoach', 'typeComposer',
         'openURL', 'openURLOnActive', 'fpOpenURL', 'share', 'ping', 'sceneCycle', 'sceneDestroy', 'classic', 'typeKey']


# ── the run's own checks ─────────────────────────────────────────────────────────────────────────────────────────────

def canary_scan(c):
    """Contract 5 K4: the canary typed into the key field, and saved by CONNECT, is in no probe log of the run, whole or in
    any 8 characters of its random part."""
    rand = c.canary[len(CANARY_PREFIX):]
    pieces = {rand[i:i + 8] for i in range(len(rand) - 7)}
    hits = []
    for tag, raw in c.logs:
        if c.canary in raw:
            hits.append('%s: the whole canary' % tag)
        hits += ['%s: %s' % (tag, p) for p in sorted(pieces) if p in raw]
    def events(raw):
        for l in raw.splitlines():
            try:
                yield json.loads(l)
            except ValueError:
                continue
    typed = any(type(e) is dict and e.get('ev') == 'type' and e.get('kind') == 'key' and e.get('via') == 'keys'
                for _, raw in c.logs for e in events(raw))
    c.check('canary', 'the canary was typed into the key field (else the scan below proves nothing)', typed, None)
    c.check('canary', 'the canary typed into the key field is in no probe log of the run (%d logs, whole or any 8 of its characters)' % len(c.logs),
            not hits, hits[:5])


def aggregates(c):
    rows = [(s, shellst(e).get('leftWindow'), shellst(e).get('leftWindowAny')) for s, e in c.states]
    c.check('window', 'no state saw the web view leave its window (leftWindow and leftWindowAny 0, %d states)' % len(rows),
            rows and all(a == 0 and b == 0 for _, a, b in rows), sorted({s for s, a, b in rows if a or b}))
    vis = [(s, page(e).get('visEvents')) for s, e in c.states if s not in c.away]
    c.check('window', 'no visibilitychange in any state outside the background trip', all(v in ([], None) for _, v in vis),
            sorted({s for s, v in vis if v}))
    sp = [p for s, e in c.states for p in shape(e, STATE, 'state')]
    tabs = [(s, e) for s, e in c.states if root(e).get('kind') == 'tabs' and root(e).get('fellBack') is None]
    mode = [s for s, e in tabs if not (page(e).get('tabsMode') is True and page(e).get('fpTabsClass') is True
                                       and (page(e).get('vars') or {}).get('barUp') and page(e).get('tabsDisplay') == 'none')]
    c.check('reports', 'under a live tab root every state says tabs mode (tabsMode, html.fp-tabs, #tabs hidden, --fp-bar-up set)',
            tabs and not mode, sorted(set(mode)))
    c.check('reports', 'every state of the run carries contract 15.3\'s reports with their types (%d states)' % len(c.states), not sp, sp[:6])
    # The shell's counters (About's, kept across launches) see what one document's visEvents cannot: a page that went
    # hidden in use and was replaced, a web view that left its window in an earlier document. State to state, in run
    # order, each moves only where a step moves it: strays by one at the stray launch; hidden and leftAny on the
    # background trip.
    moved, prev = [], None
    for s, e in c.states:
        cur = counter_totals(e)
        for k in COUNTERS if prev else ():
            if cur[k] != prev[k]:
                ok = (k == 'strays' and s == 'stray' and cur[k] == prev[k] + 1) or (k in ('hidden', 'leftAny') and s in c.away)
                if not ok:
                    moved.append('%s (%s): %s %s -> %s' % (s, e.get('label'), k, prev[k], cur[k]))
        prev = cur
    c.check('window', 'the shell\'s fault counters (%s) moved only where a step moves them (%d states)' % (', '.join(COUNTERS), len(c.states)),
            c.states and not moved, moved[:6])


COUNTERS = ('hidden', 'leftAny', 'leftWindow', 'markers', 'trips', 'strays')


def counter_totals(e):
    cs = ((shellst(e).get('status') or {}).get('counters') or {})
    return {k: (cs.get(k) or {}).get('total', 0) for k in COUNTERS}


def shell_folder(sim):
    return sim.path('Library', 'Application Support', 'FPShell')


def put_back_shell(sim, saved):
    """The shell's folder as the run found it (the app ended): the decline, switches, policy copy and markers it held."""
    sim.terminate()
    live = shell_folder(sim)
    if os.path.isdir(live):
        shutil.rmtree(live)
    if saved is not None:
        shutil.copytree(saved, live)


# The shell's UserDefaults copies (ShellSwitches, the breaker book, ShellCounters) live in the app's preferences plist,
# which the simulator's cfprefsd caches and writes later. Stopping it (launchd starts it again at the next use) makes it
# write what it holds and keep no copy: the plist is then what the app last wrote, and an edit is what the app reads next.

def prefs_path(sim):
    return sim.path('Library', 'Preferences', BID + '.plist')


def prefs_settle(sim):
    sim.sh('xcrun', 'simctl', 'spawn', sim.udid, 'launchctl', 'stop', 'com.apple.cfprefsd.xpc.daemon', check=False)
    time.sleep(1.0)


def read_shell_prefs(sim):
    """The three copies as the app last wrote them (the app ended): key -> bytes, None when absent."""
    prefs_settle(sim)
    d = {}
    if os.path.exists(prefs_path(sim)):
        with open(prefs_path(sim), 'rb') as f:
            d = plistlib.load(f)
    return {k: d.get(k) for k in SHELL_PREFS}


def put_back_shell_prefs(sim, found):
    """The three copies as found (the app ended), every other key of the plist left as the run left it (the store's own
    copies follow its database, which the run did not put back)."""
    prefs_settle(sim)
    p = prefs_path(sim)
    d, fmt, mode = {}, plistlib.FMT_BINARY, 0o600
    if os.path.exists(p):
        with open(p, 'rb') as f:
            raw = f.read()
        fmt = plistlib.FMT_XML if raw.lstrip().startswith(b'<') else plistlib.FMT_BINARY
        d = plistlib.loads(raw)
        mode = os.stat(p).st_mode & 0o777
    if all(d.get(k) == found[k] for k in SHELL_PREFS):
        return
    for k in SHELL_PREFS:
        if found[k] is None:
            d.pop(k, None)
        else:
            d[k] = found[k]
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p + '.selftest', 'wb') as f:
        plistlib.dump(d, f, fmt=fmt)
    os.chmod(p + '.selftest', mode)
    os.replace(p + '.selftest', p)
    prefs_settle(sim)


def found_totals(found):
    try:
        cs = json.loads(found['fp.shell.counters'] or b'{}')
    except ValueError:
        cs = {}
    return {k: (cs.get(k) or {}).get('total', 0) for k in COUNTERS}


def screens_word(e):
    st = (shellst(e).get('status') or {}).get('screens') or {}
    return {k: short(v, ('on', 'off', 'why', 'canReset', 'trip')) for k, v in st.items()}


def check_put_back(c, saved, found):
    """What the run changed in the shell's own state, put back and proven: the folder and the three copies as found, then
    one launch that reads them (the switches and every screen's word as the run's first state had them, the counters'
    totals as found), then both put back once more (that launch leaves its crash markers) and the copies read back."""
    sim, s = c.sim, 'restore'
    put_back_shell(sim, saved)
    put_back_shell_prefs(sim, found)
    if c.states:
        start = c.states[0][1]
        ev = c._launch('asFound', [[wait(1200), state('as found'), DONE]], (), 90, None, 'done')
        e = ev.state('as found')
        got = {'switches': (shellst(e).get('status') or {}).get('switches'), 'screens': screens_word(e), 'counters': counter_totals(e)}
        want = {'switches': (shellst(start).get('status') or {}).get('switches'), 'screens': screens_word(start), 'counters': found_totals(found)}
        c.check(s, 'the next launch reads the shell\'s state as the run found it: its switches and every screen\'s word as at the run\'s '
                   'start, the counters\' totals as found', e and got == want, {'got': got, 'want': want})
    put_back_shell(sim, saved)
    put_back_shell_prefs(sim, found)
    now = read_shell_prefs(sim)
    c.check(s, 'the shell\'s UserDefaults copies (%s) as found' % ', '.join(SHELL_PREFS), now == found,
            sorted(k for k in SHELL_PREFS if now.get(k) != found.get(k)))


def app_print(app):
    """What --no-install compares: the build number and the hashes of the executables and the bundled page."""
    out = {}
    for rel in ('App', 'App.debug.dylib', 'public/index.html', 'Info.plist'):
        p = os.path.join(app, rel)
        if os.path.exists(p):
            with open(p, 'rb') as f:
                out[rel] = hashlib.sha256(f.read()).hexdigest()[:16]
    return out


def hold_sim_lock():
    """Re-runs this script under tests/tools/simlock.sh's hold of the paired simulators (a hold of this run's caller
    counts: simlock takes it as held)."""
    if os.environ.get('FP_SELFTEST_LOCKED') == '1':
        return
    env = dict(os.environ, FP_SELFTEST_LOCKED='1')
    script = '. "$1"; shift; simlock probe-selftest; "$@"'
    os.execvpe('bash', ['bash', '-c', script, 'bash', os.path.join(HERE, 'simlock.sh'), sys.executable, os.path.abspath(__file__),
                        *sys.argv[1:]], env)


def main():
    ap = argparse.ArgumentParser(description='The probe\'s self-test (T15): ShellProbe\'s steps and reports in the real app.')
    ap.add_argument('--phone', required=True, help='the simulator\'s UDID (an iPhone of an iOS 26+ runtime: the paired one)')
    ap.add_argument('--app', required=True, help='the Debug App.app to install (tests/tools/fp-build.sh selftest builds one)')
    ap.add_argument('--no-install', action='store_true', help='run the app the phone holds: it must be --app\'s')
    ap.add_argument('--only', default='', help='launches to run, comma separated (%s); prepare and restore always run' % ','.join(ORDER))
    ap.add_argument('--out', default='', help='where the probe logs are copied (default screenshots/out/probe-selftest/<runtime>)')
    opts = ap.parse_args()
    only = [x for x in opts.only.split(',') if x]
    unknown = [x for x in only if x not in ORDER]
    if unknown:
        ap.error('unknown launch(es): %s (known: %s)' % (', '.join(unknown), ', '.join(ORDER)))
    if not os.path.isdir(opts.app) or not os.path.exists(os.path.join(opts.app, 'Info.plist')):
        ap.error('no app at %s' % opts.app)
    hold_sim_lock()
    sim = Sim(opts.phone)
    sim.boot()
    rt, name = sim.runtime()
    try:
        major = int(rt.split('-')[1])
    except (IndexError, ValueError):
        major = 0
    if major < 26:
        print('probe-selftest: %s runs %s: the tab root (and so most of the probe\'s steps) needs iOS 26 or later' % (name, rt))
        sys.exit(2)
    out = opts.out or os.path.join(REPO, 'screenshots', 'out', 'probe-selftest', rt)
    os.makedirs(out, exist_ok=True)
    if opts.no_install:
        try:
            have = sim.sh('xcrun', 'simctl', 'get_app_container', opts.phone, BID).strip()
        except RuntimeError:
            have = ''
        mine, theirs = app_print(opts.app), app_print(have) if have else {}
        if not have or mine != theirs:
            diff = sorted(k for k in set(mine) | set(theirs) if mine.get(k) != theirs.get(k)) or ['no app installed']
            print('probe-selftest: --no-install: the app on %s is not %s (%s differ): run without --no-install' % (opts.phone, opts.app, ', '.join(diff)))
            sys.exit(2)
    else:
        sim.install(opts.app)
    rep = Report('%s %s' % (name, rt))
    print('== the probe\'s self-test on %s (%s, %s), app %s' % (name, rt, opts.phone, opts.app), flush=True)
    c = Ctx(sim, rep, opts, out)
    t0 = time.time()
    sim.terminate()
    pdir = sim.path('Documents', 'fp-probe')
    old = [f for f in (os.listdir(pdir) if os.path.isdir(pdir) else []) if f.startswith('selftest-')]
    for f in old:   # an earlier run's steps and logs: this run's logs are the only ones of their name
        os.remove(os.path.join(pdir, f))
    saved = None
    tmp = tempfile.mkdtemp(prefix='probe-selftest-')
    if os.path.isdir(shell_folder(sim)):
        saved = os.path.join(tmp, 'FPShell')
        shutil.copytree(shell_folder(sim), saved)
    rep.fact('prepare', 'the shell\'s folder kept to put back (%s)' % (', '.join(sorted(os.listdir(saved))) if saved else 'none yet'))
    found = read_shell_prefs(sim)
    rep.fact('prepare', 'the shell\'s UserDefaults copies kept to put back (%s)' % ', '.join(
        '%s %s' % (k, 'absent' if v is None else '%d bytes' % len(v)) for k, v in found.items()))
    up = False
    try:
        try:
            up = scen_prepare(c)
        except Exception as e:  # noqa: BLE001 -- a launch that breaks is a failure; restore still runs
            import traceback
            traceback.print_exc()
            rep.check('prepare', 'ran to the end', False, repr(e)[:300])
        if up:
            for scen in ORDER:
                if only and scen not in only:
                    continue
                print('-- %s' % scen, flush=True)
                try:
                    globals()['scen_' + scen](c)
                except Exception as e:  # noqa: BLE001
                    import traceback
                    traceback.print_exc()
                    rep.check(scen, 'ran to the end', False, repr(e)[:300])
        print('-- restore', flush=True)
        try:
            scen_restore(c)
        except Exception as e:  # noqa: BLE001
            import traceback
            traceback.print_exc()
            rep.check('restore', 'ran to the end', False, repr(e)[:300])
    finally:
        try:
            check_put_back(c, saved, found)
        except Exception as e:  # noqa: BLE001 -- the folder and the copies still go back
            import traceback
            traceback.print_exc()
            rep.check('restore', 'the shell\'s state put back and read back', False, repr(e)[:300])
            put_back_shell(sim, saved)
            put_back_shell_prefs(sim, found)
        shutil.rmtree(tmp, ignore_errors=True)
        pdir = sim.path('Documents', 'fp-probe')
        for p in [os.path.join(pdir, tag + '.json') for tag in c.tags] + c.extra:
            if os.path.exists(p):
                os.remove(p)
    rep.fact('restore', 'the shell\'s folder and UserDefaults copies put back as found; the steps files and the share\'s JPEG removed '
                        '(the logs stay, and are copied to %s)' % out)
    if up and (not only or 'typeKey' in only) and c.key_kind != 'other':
        canary_scan(c)
    if up:
        aggregates(c)
    print('== %s: %d checks, %d failed, %.0f s' % (rep.label, len(rep.rows), len(rep.failed), time.time() - t0), flush=True)
    for scen, nm, ok, detail in rep.failed:
        print('   FAILED [%s] %s -- %s' % (scen, nm, json.dumps(detail, default=str)[:600] if detail not in ('', None) else ''))
    sys.exit(1 if rep.failed else 0)


if __name__ == '__main__':
    main()
