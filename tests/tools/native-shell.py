#!/usr/bin/env python3
"""The native shell scenarios (plan task C5): the TrovoShell plugin, ScreenHost and PageLink in the real app, in an iOS
simulator.

tests/native-shell.sh builds the app (as build 60, Debug) and calls this. Every scenario drives the real index.html in
the real Capacitor shell through the app's own launch arguments (FPUI's ShellProbe, Debug builds only: `-fpShellProbe
<steps>`); the app acts and reports, this decides. Shots of what the owner would see go to --out.

  native-shell.py --phone UDID --app App.app [--only a,b] [--out DIR]

Scenarios (decision.md section 9, task C5's acceptance, and what C5 promises besides):
  smoke    a -fpSmoke launch logs "fp: ping ok v1" (subsystem app.kt.trainer); hello negotiates v1 with the coach
  chat     the page presents the native chat (.overFullScreen, the web view in its window and hidden from VoiceOver,
           the room's appearance); a model push and intents round-trip (a message sent and answered, the model
           switch, a forwarded confirm answered, an Undo toast's Undo); the owner's Back; no visibilitychange while
           the chat is up; Lime is dark
  focus    a focused web field, then present and dismiss the chat (by the page, by Back, by the edge pan): no keyboard
           comes back and the document is not scrolled; an edge pan let go early leaves the chat up
  wckill   a WebContent kill with the chat up: the new document takes the chat over and the shell resyncs on its boot
           without resending (the send in flight ends as gone, its words back in the composer), and the open confirm
           closes as stale (answered after the reload: stale)
  marker   a planted crash marker brings back the web chat, once: the verdict stays for this shell and page build, no
           second verdict, and the owner's clear (-fpClearVerdicts) brings the native chat back
  policy   the policy file's screens.coach "off" takes the native chat down at once (the web chat for the rest of the
           document); "on" again from the next document
  breaker  three intents that time out turn the chat off for the page build (screens.off "failures"); the next launch
           does not offer it; -fpClearBreaker brings it back

Exit 1 when any check fails.
"""
import argparse
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('native_store', os.path.join(HERE, 'native-store.py'))
ns = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ns)   # its Sim, Events, read_log and Report (nothing runs on import)

Sim, Events, read_log, Report = ns.Sim, ns.Events, ns.read_log, ns.Report
API_KEY = 'sk-ant-probe-not-a-key'
RUNS = [0]
OVER_FULL_SCREEN = 5          # UIModalPresentationStyle.overFullScreen
LIGHT, DARK = 1, 2            # UIUserInterfaceStyle


def shell_probe(sim, name, phases, args=(), timeout=90, verdicts=False, during=None, until='done', out=None):
    """One launch running `phases` (ShellProbe). Every launch is offline (the bundled page under test) and, unless
    `verdicts`, ignores a crash marker the runner's own simctl terminate may have left with a screen up. `mark` events
    get a screenshot in `out` named <tag>-<label>.png."""
    RUNS[0] += 1
    tag = '%02d-%s' % (RUNS[0], name)
    pdir = sim.path('Documents', 'fp-probe')
    os.makedirs(pdir, exist_ok=True)
    with open(os.path.join(pdir, tag + '.json'), 'w') as f:
        json.dump({'phases': phases}, f)
    logp = os.path.join(pdir, tag + '.jsonl')
    if os.path.exists(logp):
        os.remove(logp)
    sim.terminate()
    marker = [] if verdicts else ['-fpIgnoreMarker']
    pid = sim.launch(['-fpShellProbe', tag + '.json', '-fpShellProbeLog', tag + '.jsonl', '-fpOffline', *marker, *args])
    t_end = time.time() + timeout
    ev = Events()
    shot = set()
    while time.time() < t_end:
        time.sleep(0.25)
        ev = read_log(logp)
        for e in ev.all('mark'):
            label = e.get('label')
            if out and label and label not in shot:
                shot.add(label)
                time.sleep(0.6)   # the frame after the mark (a transition settles)
                sim.screenshot(os.path.join(out, '%s-%s.png' % (tag, label)))
        if during:
            during(ev)
        if ev.first(until):
            break
    ev = read_log(logp)
    ev.pid = pid
    ev.tag = tag
    ev.timedOut = not ev.first(until)
    sim.terminate()
    return ev


def state(label):
    return {'op': 'state', 'label': label}


def js(label, src, **args):
    return {'op': 'js', 'label': label, 'src': src, 'args': args}


def wait(ms):
    return {'op': 'wait', 'ms': ms}


def mark(label):
    return {'op': 'mark', 'label': label}


def intent(label, name, **args):
    return {'op': 'intent', 'label': label, 'name': name, 'args': args}


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

# The scenarios' own starting point: a key (the chat needs one), a short conversation, Heavyweight.
SEED_JS = r"""
localStorage.setItem('kt_apikey', args.key);
localStorage.setItem('kt_theme', 'heavyweight');
localStorage.setItem('kt_coach_model', 'claude-sonnet-5-5');
localStorage.removeItem('kt_native_off');
var now = Date.now();
localStorage.setItem('kt_coach_msgs', JSON.stringify([
  { role: 'user', content: 'How did my week go?', at: now - 120000 },
  { role: 'assistant', content: 'A strong week: every session done, squat up 5 lb.', at: now - 110000 }]));
return { ok: true };
"""


def page(e):
    return (e or {}).get('page') or {}


def shellst(e):
    return (e or {}).get('shell') or {}


def screens(e):
    return shellst(e).get('screens') or {}


def coach(e):
    return (screens(e).get('screens') or {}).get('coach') or {}


def intents(ev, name=None, boot=None):
    """The last record of every intent (by seq)."""
    last = {}
    for e in ev.all('intent'):
        last[e['seq']] = e
    rows = [last[k] for k in sorted(last)]
    return [r for r in rows if (name is None or r.get('name') == name) and (boot is None or r.get('boot') == boot)]


def kb_shown(e):
    return [k for k in (e or {}).get('keyboard') or [] if k.get('ev') in ('willShow', 'didShow')]


class Ctx:
    def __init__(self, sim, rep, opts):
        self.sim = sim
        self.rep = rep
        self.opts = opts
        self.page = None
        self.left = []   # (scenario, ShellWebView's leave-window count) at every state


def note(c, scen, ev):
    for e in ev.all('state'):
        c.left.append((scen, shellst(e).get('leftWindow')))


def scen_smoke(c):
    s = 'smoke'
    ev = shell_probe(c.sim, 'seed', [[js('seed', SEED_JS, key=API_KEY), state('seeded')]])
    c.rep.check(s, 'the scenario seed is written (a key, a short conversation, Heavyweight)', ((ev.first('js', label='seed') or {}).get('result') or {}).get('ok'), ev.timedOut)
    t0 = time.time()
    ev = shell_probe(c.sim, 'smoke', [[state('smoke')]], args=['-fpSmoke'])
    e = ev.state('smoke')
    c.page = shellst(e).get('pageBuild')
    out = c.sim.sh('xcrun', 'simctl', 'spawn', c.sim.udid, 'log', 'show', '--last', '%dm' % (int((time.time() - t0) / 60) + 2),
                   '--predicate', 'subsystem == "app.kt.trainer" AND eventMessage CONTAINS "fp: ping"', '--style', 'compact', check=False)
    lines = [l for l in out.splitlines() if 'fp: ping' in l]
    ok = [l for l in out.splitlines() if 'fp: ping ok v1' in l and 'app.kt.trainer:shell' in l]
    c.rep.check(s, 'a -fpSmoke launch logs "fp: ping ok v1" (subsystem app.kt.trainer)', bool(ok), (ok or lines or ['no line'])[-1].strip()[:160])
    p, sh = page(e), shellst(e)
    c.rep.check(s, 'hello negotiates v1 with the coach (the page and the link agree)', p.get('fp', {}).get('v') == 1
                and (p.get('fp', {}).get('hello') or {}).get('screens') == ['coach'] and sh.get('phase') == 'linked' and sh.get('negotiated') == ['coach'],
                '%s / %s %s' % (p.get('fp', {}).get('hello'), sh.get('phase'), sh.get('negotiated')))
    flag = p.get('flag') or {}
    c.rep.check(s, 'the flag offers the coach (ScreenGate when the web view was set up)', flag.get('screens') == ['coach'] and flag.get('v') == 1, flag)
    c.rep.check(s, 'the page booted with the bridge (bootDone through TrovoShell)', sh.get('bootDones', 0) >= 1, sh.get('bootDones'))
    c.rep.fact(s, 'shell %s, page %s' % (c.opts.shell, c.page))
    note(c, s, ev)


def scen_chat(c):
    s = 'chat'
    steps = [
        js('stub', STUB_JS), wait(900), state('up'), mark('chat'),
        {'op': 'send', 'text': 'Probe question one', 'nonce': 'probe-n1'}, wait(3000), state('sent'), mark('answered'),
        intent('model', 'coach.model', model='claude-haiku-4-5-20251001'), wait(900), state('model'),
        js('confirm', "_ktConfirm({title: 'Probe confirm?', body: 'From the shell scenarios', confirmLabel: 'Yes', "
                      "onConfirm: function () { localStorage.setItem('kt_probe_confirmed', String(Date.now())); }}); return true;"),
        wait(800), state('confirm open'), mark('confirm'),
        {'op': 'confirm', 'yes': True}, wait(700),
        js('confirmed', "return localStorage.getItem('kt_probe_confirmed');"), state('confirm answered'),
        js('toast', "showUndoToast('Probe removed', function () { localStorage.setItem('kt_probe_undo', String(Date.now())); }); return true;"),
        wait(500), state('toast'), mark('toast'), {'op': 'undo'}, wait(600),
        js('undone', "return localStorage.getItem('kt_probe_undo');"),
        intent('model back', 'coach.model', model='claude-sonnet-5-5'), wait(600),
        {'op': 'back'}, wait(1800), state('back'), mark('home'),
    ]
    ev = shell_probe(c.sim, 'chat', [steps], args=['-devNav', 'coach/chat'], out=c.opts.out, timeout=120)
    up, sent, model, conf, ans, toast, back = (ev.state(x) for x in ('up', 'sent', 'model', 'confirm open', 'confirm answered', 'toast', 'back'))
    cu, pu = coach(up), page(up)
    c.rep.check(s, 'the page presents the native chat over itself (.overFullScreen), on the page\'s model', cu.get('presented') and cu.get('style') == OVER_FULL_SCREEN
                and cu.get('rev', 0) > 0 and cu.get('boot') == pu.get('fp', {}).get('boot') and cu.get('messages', 0) >= 2, cu)
    c.rep.check(s, 'the web view stays in its window and is hidden from VoiceOver; the chat is modal', screens(up).get('webViewInWindow') is True
                and screens(up).get('webViewA11yHidden') is True and cu.get('modal') is True, {k: screens(up).get(k) for k in ('webViewInWindow', 'webViewA11yHidden')})
    c.rep.check(s, 'the page under it: placeholder, no web chat, covered', pu.get('ph') and not pu.get('webChat') and (pu.get('fp', {}).get('shown') or {}).get('coach')
                and pu.get('fp', {}).get('covered'), {k: pu.get(k) for k in ('ph', 'webChat', 'tab', 'view')})
    c.rep.check(s, 'Heavyweight\'s chat is light whatever the phone says (overrideUserInterfaceStyle)', cu.get('interfaceStyle') == LIGHT, cu.get('interfaceStyle'))
    c.rep.check(s, 'the crash marker names the chat while it is up', any(l.startswith('presenting coach@') and l.endswith('shell %s' % c.opts.shell) for l in screens(up).get('markers') or []),
                screens(up).get('markers'))
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
    c.rep.check(s, 'Back takes the chat down at once; the page goes to the Coach home and is uncovered', sb.get('up') == [] and sb.get('latched') == []
                and pb.get('tab') == 'coach' and pb.get('view') == 'home' and not (pb.get('fp', {}).get('shown') or {}).get('coach') and not pb.get('fp', {}).get('covered')
                and sb.get('webViewA11yHidden') is False and 'back coach' in (sb.get('transitions') or []),
                {'up': sb.get('up'), 'latched': sb.get('latched'), 'tab': pb.get('tab'), 'view': pb.get('view'), 'transitions': sb.get('transitions')})
    cov = [r.get('outcome') for r in intents(ev, 'shell.covered')]
    c.rep.check(s, 'shell.covered went on before and off after (both done)', len(cov) >= 2 and all(o == 'done' for o in cov), cov)
    c.rep.check(s, 'the marker is gone with the chat', not sb.get('markers'), sb.get('markers'))
    vis = [page(e).get('visEvents') for e in ev.all('state')]
    c.rep.check(s, 'no visibilitychange in the page while the chat was up (present to Back)', all(v == [] for v in vis) and all(page(e).get('vis') == 'visible' for e in ev.all('state')), vis)
    c.rep.check(s, 'the web view never left its window', all((shellst(e).get('leftWindow') or 0) == 0 for e in ev.all('state')), [shellst(e).get('leftWindow') for e in ev.all('state')])
    fails = [r for r in intents(ev) if r.get('outcome') not in ('done', None)]
    c.rep.check(s, 'every intent answered (no timeout, no failure)', not fails, fails[:4])
    note(c, s, ev)
    # Lime: the chat and its toast window are dark
    ev = shell_probe(c.sim, 'chat-lime', [[wait(600), state('lime'), mark('lime'),
                                            js('toast', "showToast('Probe saved'); return true;"), wait(300), state('lime toast'), mark('lime-toast')]],
                     args=['-devNav', 'coach/chat', '-devTheme', 'dark'], out=c.opts.out)
    lime, lt = ev.state('lime'), ev.state('lime toast')
    c.rep.check(s, 'Lime\'s chat and its toast window are dark (overrideUserInterfaceStyle from paper)', coach(lime).get('interfaceStyle') == DARK
                and (screens(lt).get('overlay') or {}).get('interfaceStyle') == DARK and (screens(lt).get('overlay') or {}).get('toast') == 'Probe saved',
                '%s / %s' % (coach(lime).get('interfaceStyle'), screens(lt).get('overlay')))
    note(c, s, ev)


FIELD_JS = r"""
var f = document.getElementById('fp-probe-field');
if (!f) { f = document.createElement('input'); f.id = 'fp-probe-field'; f.type = 'text';
  f.setAttribute('style', 'position:fixed;top:' + (window.innerHeight - 250) + 'px;left:20px;width:220px;height:44px;font-size:16px;z-index:2147483000');
  document.body.appendChild(f); }
f.focus();
return { active: document.activeElement === f };
"""
OPEN_JS = "switchTab('coach'); coachView = 'chat'; render(); return { tab: currentTab, view: coachView };"


def scen_focus(c):
    s = 'focus'
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
        js('cleanup', "var f = document.getElementById('fp-probe-field'); if (f) f.remove(); switchTab('log'); return true;"), wait(1200), state('end'),
    ]
    # The simulator counts a hardware keyboard as attached and keeps the software keyboard down for it (UIKit's
    # automatic minimization): off for this scenario only, so a focused field raises the keys a phone would show.
    pref = ('com.apple.keyboard.preferences', 'AutomaticMinimizationEnabled')
    was = c.sim.sh('xcrun', 'simctl', 'spawn', c.sim.udid, 'defaults', 'read', *pref, check=False).strip()
    c.sim.sh('xcrun', 'simctl', 'spawn', c.sim.udid, 'defaults', 'write', *pref, '-bool', 'NO')
    try:
        ev = shell_probe(c.sim, 'focus', [steps], out=c.opts.out, timeout=150)
    finally:
        if was in ('0', '1'):
            c.sim.sh('xcrun', 'simctl', 'spawn', c.sim.udid, 'defaults', 'write', *pref, '-bool', 'YES' if was == '1' else 'NO')
        else:
            c.sim.sh('xcrun', 'simctl', 'spawn', c.sim.udid, 'defaults', 'delete', *pref, check=False)
    f, cv = ev.state('focused'), ev.state('covered')
    fs = [ev.state(x) for x in ('focused', 'focused 2', 'focused 3')]
    c.rep.check(s, 'a tap into the page, then a focused web field, raises the keyboard (the simulator\'s software keyboard), each time',
                all(bool(kb_shown(e)) and page(e).get('active') == 'INPUT#fp-probe-field' and e.get('webResponder') for e in fs if e) and all(fs),
                [{'kb': [k.get('ev') for k in (e or {}).get('keyboard') or []], 'active': page(e).get('active'), 'web': (e or {}).get('webResponder')} for e in fs])
    c.rep.check(s, 'the field sits where the keys cover it, so WebKit scrolls the document to show it (the path the page\'s guard undoes)',
                all(e and (e.get('webScrollY') or 0) > 0 and (page(e).get('scrollY') or 0) > 0 for e in fs),
                [{'webScrollY': (e or {}).get('webScrollY'), 'scrollY': page(e).get('scrollY')} for e in fs])
    c.rep.check(s, 'presenting the chat blurs the page\'s field and the keys go down', coach(cv).get('presented') and page(cv).get('active') != 'INPUT#fp-probe-field'
                and any(k.get('ev') == 'didHide' for k in (cv or {}).get('keyboard') or []), {'active': page(cv).get('active'), 'kb': [k.get('ev') for k in (cv or {}).get('keyboard') or []]})
    for label, how in (('after page dismiss', "the page's dismiss"), ('after back', 'Back'), ('after edge', 'the edge pan')):
        e = ev.state(label)
        p = page(e)
        c.rep.check(s, '%s: no keyboard comes back and nothing is focused' % how, e is not None and not kb_shown(e) and p.get('active') in ('BODY', None)
                    and screens(e).get('up') == [], {'kb': [k.get('ev') for k in (e or {}).get('keyboard') or []], 'active': p.get('active'),
                                                     'firstResponder': (e or {}).get('firstResponder'), 'up': screens(e).get('up')})
        c.rep.check(s, '%s: the document is not scrolled' % how, p.get('scrollY') == 0 and p.get('scrollTop') == 0 and (e or {}).get('webScrollY') == 0
                    and ((p.get('vv') or {}).get('top') or 0) == 0, {k: p.get(k) for k in ('scrollY', 'scrollTop', 'vv')} | {'webScrollY': (e or {}).get('webScrollY')})
    edge = ev.state('after edge')
    c.rep.check(s, 'the edge pan takes the chat down and the page hears Back', 'edge back coach' in (screens(edge).get('transitions') or [])
                and page(edge).get('view') == 'home', screens(edge).get('transitions'))
    lg = ev.state('edge let go')
    c.rep.check(s, 'an edge pan let go early leaves the chat up (no Back sent)', coach(lg).get('presented') and 'edge back cancelled coach' in (screens(lg).get('transitions') or [])
                and len(intents(ev, 'coach.back')) == 2, {'transitions': screens(lg).get('transitions'), 'backs': len(intents(ev, 'coach.back'))})
    vis = [page(e).get('visEvents') for e in ev.all('state')]
    c.rep.check(s, 'no visibilitychange in the page through every present and dismiss', all(v == [] for v in vis), vis)
    note(c, s, ev)


def scen_wckill(c):
    s = 'wckill'
    steps1 = [
        js('stub', STUB_JS), wait(800),
        js('confirm', "_ktConfirm({title: 'Probe stale?', body: 'Asked before the kill', confirmLabel: 'Yes', "
                      "onConfirm: function () { localStorage.setItem('kt_probe_stale_yes', '1'); }}); return true;"),
        wait(800), state('before kill'), mark('before-kill'),
        {'op': 'blockPage', 'ms': 6000}, wait(150),
        {'op': 'send', 'text': 'Probe never resent', 'nonce': 'probe-resend-1'}, wait(400),
        {'op': 'killWebContent'},
    ]
    steps2 = [
        wait(1200), state('after kill'), mark('after-kill'),
        intent('stale confirm', 'confirm', id='@lastConfirm', yes=True), wait(300),
        js('stale yes', "return localStorage.getItem('kt_probe_stale_yes');"),
        js('stub', STUB_JS), {'op': 'send', 'text': 'Probe after the kill', 'nonce': 'probe-after-1'}, wait(3000), state('after send'),
        {'op': 'draft', 'text': ''},   # the composer keeps its words across launches (fpDraft.coach): leave it empty
    ]
    ev = shell_probe(c.sim, 'wckill', [steps1, steps2], args=['-devNav', 'coach/chat'], out=c.opts.out, timeout=150)
    b, a, s2 = ev.state('before kill'), ev.state('after kill'), ev.state('after send')
    boot0, boot1 = coach(b).get('boot'), page(a).get('fp', {}).get('boot')
    c.rep.check(s, 'the kill started a new document (a new boot) with the chat up all along', boot0 and boot1 and boot0 != boot1 and shellst(a).get('documents', 0) >= 2
                and coach(a).get('presented') and not any(t.startswith(('dismiss coach', 'back coach')) for t in screens(a).get('transitions') or []),
                {'boot0': boot0, 'boot1': boot1, 'documents': shellst(a).get('documents'), 'transitions': screens(a).get('transitions')})
    pa = page(a)
    c.rep.check(s, 'the new document took the chat over (no present: shown, covered, on the coach chat, its placeholder)', (pa.get('fp', {}).get('shown') or {}).get('coach')
                and pa.get('fp', {}).get('covered') and pa.get('tab') == 'coach' and pa.get('view') == 'chat' and pa.get('ph')
                and not any(e.get('method') == 'present' for e in ev.all('page') if e.get('t', 0) > (b or {}).get('t', 0)),
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
    note(c, s, ev)


def scen_marker(c):
    s = 'marker'
    if not c.page:
        ev = shell_probe(c.sim, 'page', [[state('page')]])
        c.page = shellst(ev.state('page')).get('pageBuild')
    folder = c.sim.path('Library', 'Application Support', 'FPShell')
    os.makedirs(folder, exist_ok=True)
    line = 'presenting coach@%s shell %s' % (c.page, c.opts.shell)
    c.sim.terminate()
    with open(os.path.join(folder, 'presenting.coach.marker'), 'w') as f:
        f.write(line + '\n')
    ev = shell_probe(c.sim, 'marker-1', [[wait(600), state('marker'), mark('web-chat')]], args=['-devNav', 'coach/chat'], verdicts=True, out=c.opts.out)
    launch, e = ev.first('launch') or {}, ev.state('marker')
    p, sh = page(e), shellst(e)
    verdicts = [d for d in (sh.get('book') or {}).get('disabled') or [] if d.get('piece') == 'coach']
    c.rep.check(s, 'a planted marker is found at launch and gives a verdict for this shell and page build', launch.get('markersFound') == [line]
                and len(verdicts) == 1 and verdicts[0].get('page') == c.page and verdicts[0].get('shell') == c.opts.shell, '%s / %s' % (launch.get('markersFound'), verdicts))
    c.rep.check(s, 'the web chat is back: no coach in the flag or the hello, the page draws its own', (p.get('flag') or {}).get('screens') == []
                and (p.get('fp', {}).get('hello') or {}).get('screens') == [] and p.get('webChat') and not p.get('ph') and screens(e).get('up') == []
                and not any(x.get('method') == 'present' for x in ev.all('page')), {k: p.get(k) for k in ('flag', 'webChat', 'ph', 'tab', 'view')})
    c.rep.check(s, 'the marker was read once and removed', not os.path.exists(os.path.join(folder, 'presenting.coach.marker')), None)
    ev = shell_probe(c.sim, 'marker-2', [[wait(600), state('again')]], args=['-devNav', 'coach/chat'], verdicts=True)
    launch, e = ev.first('launch') or {}, ev.state('again')
    verdicts = [d for d in (shellst(e).get('book') or {}).get('disabled') or [] if d.get('piece') == 'coach']
    c.rep.check(s, 'it acts once: no marker next launch, no second verdict, still the web chat for this pair', launch.get('markersFound') == [] and len(verdicts) == 1
                and page(e).get('webChat'), '%s / %d verdicts' % (launch.get('markersFound'), len(verdicts)))
    ev = shell_probe(c.sim, 'marker-cleared', [[wait(900), state('cleared'), mark('native-again')]], args=['-devNav', 'coach/chat', '-fpClearVerdicts'], verdicts=True, out=c.opts.out)
    e = ev.state('cleared')
    c.rep.check(s, 'the owner\'s clear brings the native chat back', coach(e).get('presented') and not page(e).get('webChat')
                and not [d for d in (shellst(e).get('book') or {}).get('disabled') or [] if d.get('piece') == 'coach'], coach(e))
    note(c, s, ev)


def scen_policy(c):
    s = 'policy'
    c.sim.terminate()
    with open(c.sim.path('fp-policy.json'), 'w') as f:   # the launch reads this file: the defaults (coach on)
        f.write('{"v":1}')
    steps1 = [wait(800), state('native'), {'op': 'hook', 'name': 'policy', 'json': '{"v":1,"screens":{"coach":"off"}}'}, wait(2200), state('off'), mark('policy-off'),
              {'op': 'hook', 'name': 'policy', 'json': '{"v":1}'}, wait(800), state('on again'), {'op': 'reload'}]
    steps2 = [wait(800), state('next document')]
    ev = shell_probe(c.sim, 'policy', [steps1, steps2], args=['-devNav', 'coach/chat', '-fpPolicyFile', 'fp-policy.json', '-fpPolicyEvery', '0'],
                     out=c.opts.out, timeout=120)
    n, off, on, nd = ev.state('native'), ev.state('off'), ev.state('on again'), ev.state('next document')
    c.rep.check(s, 'the native chat is up under the defaults', coach(n).get('presented'), coach(n))
    so = [r for r in intents(ev, 'screens.off')]
    c.rep.check(s, 'screens.coach "off" takes it down at once: screens.off "withdrawn", the web chat for the rest of the document', screens(off).get('up') == []
                and (page(off).get('fp', {}).get('off') or {}).get('coach') == 'withdrawn' and page(off).get('webChat') and so and so[-1].get('outcome') == 'done',
                {'up': screens(off).get('up'), 'off': page(off).get('fp', {}).get('off'), 'webChat': page(off).get('webChat'), 'screens.off': so})
    c.rep.check(s, '"on" again changes nothing in this document', page(on).get('webChat') and screens(on).get('up') == [], screens(on).get('up'))
    c.rep.check(s, 'the next document negotiates the coach again', shellst(nd).get('negotiated') == ['coach'] and (page(nd).get('fp', {}).get('hello') or {}).get('screens') == ['coach'],
                shellst(nd).get('negotiated'))
    note(c, s, ev)


def scen_breaker(c):
    s = 'breaker'
    steps = [wait(800), state('native'), {'op': 'blockPage', 'ms': 9000}, wait(150),
             intent('ping 1', 'ping'), intent('ping 2', 'ping'), intent('ping 3', 'ping'), wait(6000), state('tripped'), mark('tripped')]
    ev = shell_probe(c.sim, 'breaker', [steps], args=['-devNav', 'coach/chat'], out=c.opts.out, timeout=120)
    t = ev.state('tripped')
    pings = [ev.first('intent-step', label='ping %d' % i) or {} for i in (1, 2, 3)]
    trip = ((shellst(t).get('book') or {}).get('screens') or {}).get('coach') or {}
    c.rep.check(s, 'three intents timing out in a row trip the chat for this page build', [p.get('outcome') for p in pings] == ['failed timeout'] * 3
                and (trip.get('trip') or {}).get('reason') == 'failures' and trip.get('pageBuild') == c.page, '%s / %s' % ([p.get('outcome') for p in pings], trip.get('trip')))
    c.rep.check(s, 'the chat goes down and the page shows its own (screens.off "failures")', screens(t).get('up') == [] and page(t).get('webChat')
                and (page(t).get('fp', {}).get('off') or {}).get('coach') == 'failures', {'up': screens(t).get('up'), 'off': page(t).get('fp', {}).get('off')})
    ev = shell_probe(c.sim, 'breaker-next', [[wait(600), state('next launch')]], args=['-devNav', 'coach/chat'])
    e = ev.state('next launch')
    c.rep.check(s, 'the next launch of this page build offers no native chat (flag and hello)', (page(e).get('flag') or {}).get('screens') == []
                and (page(e).get('fp', {}).get('hello') or {}).get('screens') == [] and page(e).get('webChat'), page(e).get('flag'))
    ev = shell_probe(c.sim, 'breaker-clear', [[wait(900), state('cleared')]], args=['-devNav', 'coach/chat', '-fpClearBreaker'])
    e = ev.state('cleared')
    c.rep.check(s, '-fpClearBreaker brings it back', coach(e).get('presented'), coach(e))
    note(c, s, ev)


ALL = ['smoke', 'chat', 'focus', 'wckill', 'marker', 'policy', 'breaker']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--phone', required=True)
    ap.add_argument('--app', required=True)
    ap.add_argument('--shell', default='60')
    ap.add_argument('--only', default='')
    ap.add_argument('--no-install', action='store_true')
    ap.add_argument('--out', default=tempfile.gettempdir())
    opts = ap.parse_args()
    os.makedirs(opts.out, exist_ok=True)
    sim = Sim(opts.phone)
    sim.boot()
    rt, name = sim.runtime()
    rep = Report('%s %s' % (name, rt))
    print('== native shell scenarios on %s (%s, %s)' % (name, rt, opts.phone), flush=True)
    if not opts.no_install:
        sim.install(opts.app)   # an update install: the phone's data stays (the seed scenario writes what the rest need)
    c = Ctx(sim, rep, opts)
    run = [x for x in opts.only.split(',') if x] or ALL
    if 'smoke' not in run:
        ev = shell_probe(sim, 'seed', [[js('seed', SEED_JS, key=API_KEY), state('seeded')]])
        c.page = shellst(ev.state('seeded')).get('pageBuild')
    t0 = time.time()
    for scen in ALL:
        if scen not in run:
            continue
        print('-- %s' % scen, flush=True)
        try:
            globals()['scen_' + scen](c)
        except Exception as e:  # a scenario that breaks is a failure; the next still runs
            import traceback
            traceback.print_exc()
            rep.check(scen, 'ran to the end', False, repr(e)[:300])
    rep.check('window', 'the web view never left its window while the app was active (every state check)', all((n or 0) == 0 for _, n in c.left),
              sorted({s for s, n in c.left if n}))
    print('== %s: %d checks, %d failed, %.0f s' % (rep.label, len(rep.rows), len(rep.failed), time.time() - t0), flush=True)
    for scen, nm, ok, detail in rep.failed:
        print('   FAILED [%s] %s -- %s' % (scen, nm, detail))
    sys.exit(1 if rep.failed else 0)


if __name__ == '__main__':
    main()
