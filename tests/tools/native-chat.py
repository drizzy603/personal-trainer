#!/usr/bin/env python3
"""The live native Coach chat in the real app (plan task C7), the coach half of test-native.sh.

test-native.sh builds and installs the app (Debug, as build 60) and calls this on the phone of the paired iPhone + Watch.
Every scenario drives the real index.html in the real Capacitor shell through the app's own launch arguments (FPUI's
ShellProbe, Debug builds only: `-fpShellProbe <steps>`, `-devNav coach/chat`, `-devTheme <room>`, `-fpApiBase`); the
app acts and reports, this decides, and every screen worth a look is shot by name into --out.

  native-chat.py --phone UDID --out DIR [--shell 60] [--only prepare,smoke,keys,live,combos,restore]

Scenarios (decision.md section 9, task C7), in this order:
  prepare  what the container holds, kept to put back at the end (every localStorage value); a key for the chat if it
           has none (the native chat needs one, as the web chat does); the native composer empty
  smoke    a -fpSmoke launch logs "fp: ping ok v1" (subsystem app.kt.trainer)
  keys     the keyboard sequences a simulator can drive (its software keyboard on for them): the native composer takes
           the keys and sits above them; typed words reach the composer's store; Back with the keys up takes them down
           with the chat, none come back and nothing scrolled; the words are still in the composer when the chat opens
           again and after a relaunch (fpDraft.coach); a web field's keys go down when the chat covers it, and the
           page's own dismiss with the native keys up leaves no keyboard
  live     a real coach turn on a stand-in for the Messages API (tests/tools/coach-stub.py on this Mac's loopback,
           -fpApiBase): a question typed in the native composer and sent with its Send shows at once (the echo) and
           gives way to the page's message, Thinking while the stand-in takes its time; its tool call changes the
           programme, the reply shows its words, a tool pill and PLAN CHANGES with Undo and Keep changes; Undo asks (the
           page's confirm, forwarded), restores the previous programme and the card goes; a second turn's Keep changes
           keeps the change and the card goes; Send while scrolled up to the top brings the conversation to its end, as
           the web chat's Send does (the owner's message and the reply in view); a reader who scrolls up while a reply
           is on its way keeps their place when it lands; a third leaves its card for the shots. Presses go through the
           controls' own accessibility actions (the probe turns the runtime on), so Send, Undo, Restore and Keep are the
           buttons'
  combos   coach/chat by launch argument in both rooms x the phone's appearance (simctl ui appearance light|dark) x its
           text size (simctl ui content_size large|extra-extra-large), on the live turns: the chat is native and over
           the page, in its room whatever the phone says (Heavyweight light, Lime dark), at the phone's text size; the
           phone's settings go back
  restore  what prepare kept goes back (only the values that changed), the page reloads on it, the composer is empty
Exit 1 when any check fails.
"""
import argparse
import importlib.util
import json
import os
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, file))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


nsh = _load('native_shell', 'native-shell.py')            # its probe helpers (and native-store.py's Sim, Report)
stubs = _load('coach_stub', 'coach-stub.py')
Sim, Events, read_log, Report = nsh.Sim, nsh.Events, nsh.read_log, nsh.Report
state, js, wait, mark = nsh.state, nsh.js, nsh.wait, nsh.mark
page, shellst, screens, coach = nsh.page, nsh.shellst, nsh.screens, nsh.coach
OVER_FULL_SCREEN, LIGHT, DARK = 5, 1, 2
PROBE_KEY = 'sk-ant-probe-not-a-key'
SIZES = {'large': 'UICTContentSizeCategoryL', 'extra-extra-large': 'UICTContentSizeCategoryXXL'}
ROOMS = {'heavyweight': LIGHT, 'dark': DARK}
RUNS = [0]


def probe(sim, name, phases, args=(), timeout=90, out=None, until='done'):
    """One launch running `phases` (ShellProbe), offline (the bundled page under test) and with -fpIgnoreMarker (the tools
    end the app with simctl terminate, which can land with the chat up). Each `mark` gets a shot, out/<label>.png."""
    RUNS[0] += 1
    tag = 'chat-%02d-%s' % (RUNS[0], name)
    pdir = sim.path('Documents', 'fp-probe')
    os.makedirs(pdir, exist_ok=True)
    with open(os.path.join(pdir, tag + '.json'), 'w') as f:
        json.dump({'phases': phases}, f)
    logp = os.path.join(pdir, tag + '.jsonl')
    if os.path.exists(logp):
        os.remove(logp)
    sim.terminate()
    pid = sim.launch(['-fpShellProbe', tag + '.json', '-fpShellProbeLog', tag + '.jsonl', '-fpOffline', '-fpIgnoreMarker', *args])
    t_end = time.time() + timeout
    ev, shot = Events(), set()
    while time.time() < t_end:
        time.sleep(0.25)
        ev = read_log(logp)
        for e in ev.all('mark'):
            label = e.get('label')
            if out and label and label not in shot:
                shot.add(label)
                time.sleep(0.6)   # the frame after the mark (a transition settles)
                sim.screenshot(os.path.join(out, label + '.png'))
                print('  shot: %s/%s.png' % (out, label), flush=True)
        if ev.first(until):
            break
    ev = read_log(logp)
    ev.pid, ev.tag, ev.timedOut = pid, tag, not ev.first(until)
    sim.terminate()
    return ev


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


class Ctx:
    def __init__(self, sim, rep, opts):
        self.sim, self.rep, self.opts = sim, rep, opts
        self.snap = None
        self.left = []

    def note(self, scen, ev):
        for e in ev.all('state'):
            self.left.append((scen, shellst(e).get('leftWindow'), page(e).get('visEvents')))

    def check(self, scen, name, ok, detail=''):
        return self.rep.check(scen, name, ok, detail)


# Values cross between the page and this script as base64 of their UTF-16LE code units: a value can hold half an emoji (a
# lone surrogate, as native-store's scenarios write on purpose), which JSON in Foundation refuses, so the probe's own JSON
# never carries one.
U16 = r"""
function u16(s) { var bin = []; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); bin.push(String.fromCharCode(c & 255, c >> 8)); } return btoa(bin.join('')); }
function unU16(b) { var bin = atob(b), parts = [], chunk = [];
  for (var i = 0; i + 1 < bin.length; i += 2) { chunk.push(bin.charCodeAt(i) | (bin.charCodeAt(i + 1) << 8)); if (chunk.length === 8192) { parts.push(String.fromCharCode.apply(null, chunk)); chunk = []; } }
  parts.push(String.fromCharCode.apply(null, chunk)); return parts.join(''); }
"""

SNAP_JS = U16 + r"""
var o = {}, keys = [];
for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
keys.forEach(function (k) { o[u16(k)] = u16(localStorage.getItem(k)); });
var hadKey = !!localStorage.getItem('kt_apikey');
if (!hadKey) localStorage.setItem('kt_apikey', args.key);
localStorage.removeItem('kt_native_off');
return { snap: o, hadKey: hadKey, theme: localStorage.getItem('kt_theme'), build: (typeof APP_BUILD !== 'undefined') ? APP_BUILD : null,
  msgs: (typeof coachMessages !== 'undefined') ? coachMessages.length : -1, unit: (typeof _uW === 'function') ? _uW() : null };
"""


def scen_prepare(c):
    s = 'prepare'
    ev = probe(c.sim, 'prepare', [[js('snap', SNAP_JS, key=PROBE_KEY), {'op': 'draft', 'text': ''}, state('prepared')]])
    r = (ev.first('js', label='snap') or {}).get('result') or {}
    c.snap = r.get('snap')
    c.check(s, 'what the container holds is kept to put back at the end (%d values)' % len(c.snap or {}), isinstance(c.snap, dict) and len(c.snap) > 0, ev.timedOut)
    c.rep.fact(s, 'page %s, room %s, unit %s, %s messages in the chat, %s' % (r.get('build'), r.get('theme'), r.get('unit'), r.get('msgs'),
                                                                               'its own key' if r.get('hadKey') else 'a probe key added (the chat needs one)'))
    c.check(s, 'the native composer starts empty', store(ev.state('prepared')).get('draft') == '', store(ev.state('prepared')).get('draft'))


def scen_combos(c):
    s = 'combos'
    sim = c.sim
    was_app = sim.sh('xcrun', 'simctl', 'ui', sim.udid, 'appearance', check=False).strip()
    was_size = sim.sh('xcrun', 'simctl', 'ui', sim.udid, 'content_size', check=False).strip()
    try:
        for room, style in ROOMS.items():
            for appearance in ('light', 'dark'):
                for size, category in SIZES.items():
                    sim.sh('xcrun', 'simctl', 'ui', sim.udid, 'appearance', appearance)
                    sim.sh('xcrun', 'simctl', 'ui', sim.udid, 'content_size', size)
                    name = 'coach-chat-%s-%s-%s' % ('lime' if room == 'dark' else room, appearance, 'xxl' if size != 'large' else 'l')
                    ev = probe(sim, name, [[wait_coach('up'), wait(900), state('chat'), mark(name)]],
                               args=['-devNav', 'coach/chat', '-devTheme', room], out=c.opts.out)
                    e = ev.state('chat')
                    cu, p = coach(e), page(e)
                    combo = '%s, phone %s, %s' % ('Lime' if room == 'dark' else 'Heavyweight', appearance, size)
                    c.check(s, '%s: the chat is native, over the page (.overFullScreen), on the page\'s model' % combo,
                            cu.get('presented') and cu.get('style') == OVER_FULL_SCREEN and cu.get('room') == room and cu.get('messages', 0) > 0
                            and p.get('ph') and not p.get('webChat') and (p.get('fp') or {}).get('covered'),
                            {k: cu.get(k) for k in ('presented', 'style', 'room', 'messages')} | {'ph': p.get('ph'), 'webChat': p.get('webChat')})
                    c.check(s, '%s: drawn in its room, not the phone\'s appearance' % combo,
                            cu.get('interfaceStyle') == style and cu.get('drawnStyle') == style, (cu.get('interfaceStyle'), cu.get('drawnStyle')))
                    c.check(s, '%s: at the phone\'s text size' % combo, cu.get('contentSize') == category, cu.get('contentSize'))
                    c.note(s, ev)
    finally:
        if was_app in ('light', 'dark'):
            sim.sh('xcrun', 'simctl', 'ui', sim.udid, 'appearance', was_app, check=False)
        if was_size and was_size not in ('unknown', 'unsupported'):
            sim.sh('xcrun', 'simctl', 'ui', sim.udid, 'content_size', was_size, check=False)
    c.rep.fact(s, 'the phone is back to %s, %s' % (was_app, was_size))


def scen_smoke(c):
    s = 'smoke'
    t0 = time.time()
    ev = probe(c.sim, 'smoke', [[state('smoke')]], args=['-fpSmoke'])
    out = c.sim.sh('xcrun', 'simctl', 'spawn', c.sim.udid, 'log', 'show', '--last', '%dm' % (int((time.time() - t0) / 60) + 2),
                   '--predicate', 'subsystem == "app.kt.trainer" AND eventMessage CONTAINS "fp: ping"', '--style', 'compact', check=False)
    ok = [l for l in out.splitlines() if 'fp: ping ok v1' in l]
    c.check(s, 'a -fpSmoke launch logs "fp: ping ok v1" (subsystem app.kt.trainer)', bool(ok), (ok or ['no line'])[-1].strip()[:160])
    c.check(s, 'the link formed with the coach negotiated', shellst(ev.state('smoke')).get('negotiated') == ['coach'], shellst(ev.state('smoke')).get('phase'))


FIELD_JS = nsh.FIELD_JS
OPEN_JS = nsh.OPEN_JS
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


def scen_keys(c):
    s = 'keys'
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
    ]
    pref = ('com.apple.keyboard.preferences', 'AutomaticMinimizationEnabled')
    was = c.sim.sh('xcrun', 'simctl', 'spawn', c.sim.udid, 'defaults', 'read', *pref, check=False).strip()
    c.sim.sh('xcrun', 'simctl', 'spawn', c.sim.udid, 'defaults', 'write', *pref, '-bool', 'NO')
    try:
        ev = probe(c.sim, 'keys', [phase], args=['-devNav', 'coach/chat'], out=c.opts.out, timeout=150)
        relaunch = probe(c.sim, 'keys-relaunch', [[wait_coach('up'), wait(900), state('relaunched'), mark('keys-9-draft-after-relaunch'),
                                                   {'op': 'draft', 'text': ''}, state('cleared')]], args=['-devNav', 'coach/chat'], out=c.opts.out)
    finally:
        if was in ('0', '1'):
            c.sim.sh('xcrun', 'simctl', 'spawn', c.sim.udid, 'defaults', 'write', *pref, '-bool', 'YES' if was == '1' else 'NO')
        else:
            c.sim.sh('xcrun', 'simctl', 'spawn', c.sim.udid, 'defaults', 'delete', *pref, check=False)
    up, typed, back, again = ev.state('keys up'), ev.state('typed'), ev.state('after back'), ev.state('again')
    shown = kb_up(up)
    kbd = rect('{{0, %s}, {0, %s}}' % (shown[-1].get('y'), shown[-1].get('h'))) if shown else None
    comp = rect(coach(up).get('composerFrame') or '')
    c.check(s, 'the native composer takes the keys (the simulator\'s software keyboard)', bool(shown) and coach(up).get('composerFocused'),
            {'kb': kb(up), 'focused': coach(up).get('composerFocused')})
    c.check(s, 'the composer sits above the keys', bool(kbd and comp) and comp[1] + comp[3] <= kbd[1] + 1,
            {'composer': coach(up).get('composerFrame'), 'keysTop': kbd and kbd[1]})
    sb, sk = coach(ev.state('up')).get('scroll') or {}, coach(up).get('scroll') or {}
    pad = (ev.first('js', label='pad') or {}).get('result') or {}
    c.check(s, 'the newest message stays in view above the composer when the keys come up (the chat was at its end; %s messages)' % pad.get('total'),
            sb.get('fromEnd') is not None and sb.get('fromEnd') < 4 and sk.get('fromEnd') is not None and sk.get('fromEnd') < 4,
            {'before keys': sb, 'keys up': sk})
    c.check(s, 'typed words reach the composer\'s store', store(typed).get('draft') == TYPED and (ev.first('type') or {}).get('via') == 'keys',
            (store(typed).get('draft'), (ev.first('type') or {}).get('via')))
    pb = page(back)
    c.check(s, 'Back with the keys up: the chat and the keys go down, none come back, nothing focused or scrolled',
            screens(back).get('up') == [] and 'didHide' in kb(back) and not kb_up(back) and pb.get('active') in ('BODY', None)
            and pb.get('scrollY') == 0 and (back or {}).get('webScrollY') == 0 and pb.get('view') == 'home',
            {'up': screens(back).get('up'), 'kb': kb(back), 'active': pb.get('active'), 'scrollY': pb.get('scrollY'), 'view': pb.get('view')})
    bp = ev.first('press', label='Back') or {}
    c.rep.fact(s, 'Back pressed through %s' % (bp.get('via') or '?'))
    c.check(s, 'the chat opens again with the words still in the composer (kept across presents)',
            coach(again).get('presented') and store(again).get('draft') == TYPED, store(again).get('draft'))
    wk, cv = ev.state('web keys'), ev.state('covered')
    c.check(s, 'a web field takes the keys, and they go down when the chat covers the page (the field blurred)',
            bool(kb_up(wk)) and page(wk).get('active') == 'INPUT#fp-probe-field' and coach(cv).get('presented')
            and page(cv).get('active') != 'INPUT#fp-probe-field' and 'didHide' in kb(cv),
            {'web': kb(wk), 'activeBefore': page(wk).get('active'), 'covered': kb(cv), 'activeAfter': page(cv).get('active')})
    n2, pd = ev.state('native keys 2'), ev.state('after page dismiss')
    c.check(s, 'the page\'s own dismiss with the native keys up: no keyboard after, nothing focused or scrolled',
            bool(kb_up(n2)) and screens(pd).get('up') == [] and not kb_up(pd) and page(pd).get('active') in ('BODY', None)
            and page(pd).get('scrollY') == 0 and (pd or {}).get('webScrollY') == 0,
            {'native': kb(n2), 'after': kb(pd), 'active': page(pd).get('active'), 'scrollY': page(pd).get('scrollY')})
    rl = relaunch.state('relaunched')
    c.check(s, 'after a relaunch the words are still in the composer (fpDraft.coach)', coach(rl).get('presented') and store(rl).get('draft') == TYPED,
            store(rl).get('draft'))
    c.check(s, 'the composer is emptied again', store(relaunch.state('cleared')).get('draft') == '', store(relaunch.state('cleared')).get('draft'))
    c.note(s, ev)
    c.note(s, relaunch)


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
    ev0 = probe(c.sim, 'live-lift', [[js('lift', LIFT_JS)]])
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
        ev = probe(c.sim, 'live', [phase], args=['-devNav', 'coach/chat', '-fpApiBase', stub.base], out=c.opts.out, timeout=180)
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
    pad = (ev.first('js', label='pad') or {}).get('result') or {}
    c.rep.fact(s, 'the conversation holds %s messages for the scroll checks (%s older ones put in front, taken back by restore)' % (pad.get('total'), pad.get('padded')))
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
    a1 = (ev.first('js', label='after turn 1') or {}).get('result') or {}
    c.check(s, 'the tool changed the programme', a1.get('shown') == new and a1.get('backup'), a1)
    uc = ev.state('undo confirm')
    pc = [e for e in ev.all('page') if e.get('method') == 'confirm']
    c.check(s, 'Undo asks first: the page\'s confirm, forwarded to the native window', bool(pc) and pc[-1].get('title') == 'Restore previous programme?'
            and (screens(uc).get('overlay') or {}).get('confirm') and coach(uc).get('presented'), (pc[-1:] if pc else None, screens(uc).get('overlay')))
    ud = ev.state('undone')
    au = (ev.first('js', label='after undo') or {}).get('result') or {}
    toasts = [e.get('text') for e in ev.all('page') if e.get('method') == 'toast']
    c.check(s, 'Restore puts the previous programme back, the page says so, and the card goes', au.get('shown') == lift['shown']
            and 'Previous programme restored' in toasts and not any(m.get('ledger') for m in store(ud).get('tail') or []),
            {'load': au.get('shown'), 'toasts': toasts, 'tail': [bool(m.get('ledger')) for m in store(ud).get('tail') or []]})
    r2 = ev.state('reply 2')
    l2 = ((store(r2).get('tail') or [{}])[-1]).get('ledger') or {}
    a2 = (ev.first('js', label='after turn 2') or {}).get('result') or {}
    c.check(s, 'a second turn changes it again, with its own card', a2.get('shown') == new and l2.get('actions') == ['Undo', 'Keep changes']
            and final2 in (((store(r2).get('tail') or [{}])[-1]).get('text') or ''), {'load': a2.get('shown'), 'ledger': l2})
    kp = ev.state('kept')
    ak = (ev.first('js', label='after keep') or {}).get('result') or {}
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
    c.note(s, ev)


RESTORE_JS = U16 + r"""
var snap = {}, now = [], changed = [], removed = [];
Object.keys(args.snap).forEach(function (k) { snap[unU16(k)] = unU16(args.snap[k]); });
for (var i = 0; i < localStorage.length; i++) now.push(localStorage.key(i));
now.forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(snap, k)) { localStorage.removeItem(k); removed.push(k); } });
Object.keys(snap).forEach(function (k) { if (localStorage.getItem(k) !== snap[k]) { localStorage.setItem(k, snap[k]); changed.push(k); } });
return { changed: changed, removed: removed };
"""

SAME_JS = U16 + r"""
var keys = ['kt_coach_msgs', 'kt_routine', 'kt_routine_backup', 'kt_routine_backup_scope', 'kt_weights', 'kt_apikey', 'kt_theme',
  'kt_native_off', 'kt_coach_model', 'kt_unit_w'], diff = [];
keys.forEach(function (k) { var b = args.snap[u16(k)], v = b === undefined ? null : unU16(b); if (localStorage.getItem(k) !== v) diff.push(k); });
return { diff: diff, msgs: coachMessages.length };
"""


def scen_restore(c):
    s = 'restore'
    if not isinstance(c.snap, dict):
        c.check(s, 'something to put back', False, 'prepare kept nothing')
        return
    ev = probe(c.sim, 'restore', [[js('restore', RESTORE_JS, snap=c.snap), {'op': 'draft', 'text': ''}, {'op': 'reload'}],
                                  [wait(900), js('same', SAME_JS, snap=c.snap), state('restored')]])
    r = (ev.first('js', label='restore') or {}).get('result') or {}
    same = (ev.first('js', label='same') or {}).get('result') or {}
    c.rep.fact(s, 'put back %d value(s), removed %d: %s' % (len(r.get('changed') or []), len(r.get('removed') or []),
                                                         ', '.join(sorted((r.get('changed') or []) + (r.get('removed') or [])))[:300]))
    c.check(s, 'the chat, the programme, the weights, the key and the room are as the run found them (after a reload)', same.get('diff') == [], same)
    c.check(s, 'the native composer is empty', store(ev.state('restored')).get('draft') == '', store(ev.state('restored')).get('draft'))


# combos after live: the shots draw the chat with the live turns and a card waiting (restore takes them back)
ALL = ['prepare', 'smoke', 'keys', 'live', 'combos', 'restore']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--phone', required=True)
    ap.add_argument('--shell', default='60')
    ap.add_argument('--only', default='')
    ap.add_argument('--out', default=tempfile.gettempdir())
    opts = ap.parse_args()
    os.makedirs(opts.out, exist_ok=True)
    sim = Sim(opts.phone)
    rt, name = sim.runtime()
    rep = Report('%s %s' % (name, rt))
    print('== the live native chat on %s (%s, %s)' % (name, rt, opts.phone), flush=True)
    c = Ctx(sim, rep, opts)
    run = [x for x in opts.only.split(',') if x] or ALL
    if 'restore' in run and 'prepare' not in run:
        run = ['prepare'] + run
    t0 = time.time()
    for scen in ALL:
        if scen not in run:
            continue
        print('-- %s' % scen, flush=True)
        try:
            globals()['scen_' + scen](c)
        except Exception as e:  # a scenario that breaks is a failure; the next still runs (restore above all)
            import traceback
            traceback.print_exc()
            rep.check(scen, 'ran to the end', False, repr(e)[:300])
    rep.check('window', 'the web view never left its window while the app was active, and the page saw no visibilitychange',
              all((n or 0) == 0 for _, n, _v in c.left) and all(v in ([], None) for _, _n, v in c.left),
              sorted({s for s, n, v in c.left if n or v}))
    print('== %s: %d checks, %d failed, %.0f s' % (rep.label, len(rep.rows), len(rep.failed), time.time() - t0), flush=True)
    for scen, nm, ok, detail in rep.failed:
        print('   FAILED [%s] %s -- %s' % (scen, nm, detail))
    sys.exit(1 if rep.failed else 0)


if __name__ == '__main__':
    main()
