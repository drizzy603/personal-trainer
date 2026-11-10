#!/usr/bin/env python3
"""The selected Coach tab under the glass bar, read from the app's own pixels (plan 11-shell.md H9 fix-1, What (3);
contract 6.1, delta 16.1 and 16.3).

iOS 26.x draws the glass tab bar's platter and items in the style it reads from what lies under the bar, iOS 27 in its
container's (FPUI TabBarLook). FPKit's test host draws no window (it has no window scene), so TabBarGroundTests checks
what 26.x reads there and this reads what it draws: the real app on an iOS 26+ simulator, every Coach screen the shell
owns and the Coach tab WEB over the page, in each room and each phone appearance. The selected Coach item (its glyph
and its title) must stand at least --min to 1 (default 3: WCAG 1.4.11's contrast for a UI component) against the
capsule it sits on and against the platter.

  tab-glass.py --phone UDID --app App.app [--no-install] [--rooms lime,heavyweight] [--looks light,dark]
               [--only waiting,connect,hub,chat,toast,web,webafter,hubagain,chatagain] [--out DIR] [--min 3]

Four launches per room and phone appearance (FPUI ShellProbe, Debug builds only: -fpShellProbe, -fpOffline,
-fpIgnoreMarker, -devNav coach, -devTheme; the page's coach calls go to a closed loopback port, -fpApiBase):
  waiting  the Coach tab's WAITING ground (contract 1.4: from the scene's start until the page declares coachHome, at
           most 3 s after its hello's answer), held for a launch of its own: the first launch stages a page that never
           says hello through the app's own TrovoOta.stage (build 29991231-1, never confirmed), the next launch serves it
           and the tab root waits on the WAITING ground (the hello deadline is 15 s; the launch ends long before), and the
           launch after it serves the bundle again (TrovoOta's breaker: a staged page never confirmed is wiped). Its
           frames are shot one after another until three of them, HOLD_S apart at least, show WAITING, or for BURST_S at
           most; a frame is WAITING when nothing but the room's ground is drawn between the status bar and the bar and
           the bar is drawn (a tab that is not selected stands out of the platter: the selected one is what the run
           judges, so it is never asked). The WAITING ground must hold to the last frame, and that frame is read (the
           first WAITING frame is reported: the glass may still be settling in it). A failed hold keeps every frame
  connect  the connect screen (the key taken away inside the page)
  hub      the hub (the probe's key, never a real one, put in inside the page)
  chat     the chat pushed over the hub (coachHome.openChat, the hub's own intent)
  toast    the pushed chat with the page's toast forwarded over it
  web      the Coach tab WEB (the third launch, a policy file turning screens.coachHome off): the page's own Coach
           screen under the bar, the room's page as the owner sees it there
and the fourth, a round trip inside one scene (the owner's own switch, About's Native Coach, flipped off and on again
as the page flips it: toggleNativeChat):
  webafter   the Coach tab turned WEB in a scene that showed the hub: the page's Coach screen under the bar while the
             hidden stack still holds the hub, the stack's ground out of the view tree
  hubagain   the hub again, the switch put back: NATIVE once more, the ground back under the stack
  chatagain  the chat pushed over that hub: its conversation ends above its composer, so the stack's ground alone lies
             under the bar there
Each shot is read only for the state it claims: the probe's state just before it must show Coach selected, the bar
shown, the tab's mode (NATIVE or WEB), its root (connect or hub), the chat pushed or not and the toast up. The fourth
launch's shots also need the hub NATIVE before the switch went off, the tab WEB while it was off, and the switch off
and back as the page answers.

The reading: the bar's frame from the root's describe() (points; the shot's scale from its width), the platter inside it
by PLATTERS (21 pt in from each side and 62 pt tall from the bar's top: the iPhone 17 Pro's 402 x 83 pt bar, run on iOS
26.4.1, 26.5 and 27.0, and the Pro Max's 440 x 83 pt bar, read in frames of the paired phones on 26.5 and 27.0; a bar of
another size has no numbers here and ends the run, exit 2, before anything is misread), the Coach item's quarter of it
(its middle 60% across, 70% down). The capsule is that region's median colour, the item its 97th percentile of contrast
with the capsule, the platter the median of the whole platter; contrast is WCAG's, (L1 + 0.05) / (L2 + 0.05) of sRGB
relative luminance. The other items' numbers and the platter's luminance are reported, never judged: the glass has more
than one look that passes (on iOS 26.x the phone's glass turned to the room's ground over the stack's ground alone, the
room's own over the hub and over the room's page).

The app's data on the phone is replaced (uninstalled, installed) unless --no-install, which runs the app the phone holds
and needs it to be --app's (its executables' hashes). Either way the run changes that data and puts nothing back: the
Coach key is taken away, the owner's Native Coach switch is flipped off and on again (kt_native_off ends unset) and a
page is staged through TrovoOta and thrown out by its breaker, so never point it at a phone whose data is wanted. The
phone's appearance is put back as found. The run holds the paired simulators' lock
(~/Library/Caches/FPKit/sim.lock, tests/tools/simlock.sh) unless its caller already does. Build the app first:
tests/tools/fp-build.sh glass. Frames, a contact sheet (sheet.png) and results.json go to --out (default
screenshots/out/tab-glass/<runtime>).

Exit 0 when every check passes; 1 when any fails, each failure saying what; 2 on bad arguments, a phone below iOS 26, a
bar PLATTERS has no numbers for, an app that is not --app's under --no-install, or no Pillow.
"""
import argparse
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('native_store', os.path.join(HERE, 'native-store.py'))
ns = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ns)   # its Sim, Events, read_log and Report (nothing runs on import)
Sim, read_log, Report = ns.Sim, ns.read_log, ns.Report

BID = 'app.kt.trainer'
TABS = ('log', 'progress', 'coach', 'settings')     # the bar's order (ShellTabs.ids)
ROOMS = {'lime': ('dark', (0x0b, 0x0b, 0x0c)), 'heavyweight': ('heavyweight', (0xf7, 0xf5, 0xef))}   # -devTheme, bg
LOOKS = ('light', 'dark')
AGAIN = ('webafter', 'hubagain', 'chatagain')        # the fourth launch's states, in its order
STATES = ('waiting', 'connect', 'hub', 'chat', 'toast', 'web') + AGAIN
# The bar's size -> the platter's inset from each side and its height, points: the iPhone 17 Pro's bar and the Pro Max's
# (iPhone 17 Pro Max, iPhone 18 Pro Max), each measured from the platter's edges in a frame over Lime's dark ground.
PLATTERS = {(402, 83): (21.0, 62.0), (440, 83): (21.0, 62.0)}
PROBE_KEY = 'sk-ant-probe-not-a-key'                # never a real key; the page's coach calls go to LOOPBACK
LOOPBACK = 'http://127.0.0.1:9'
TOAST = 'Probe saved'
WEB_POLICY = 'fp-tab-glass-web.json'
BURST_S, HOLD_S = 12.0, 1.5
HOLD_BUILD = '29991231-1'                           # newer than any bundle: TrovoOta serves it once
HOLD_HTML = ('<!doctype html><html><head><meta charset="utf-8"><meta name="build" content="%s"><title>WAITING hold</title>'
             '</head><body style="background:#808080"><!-- tab-glass.py: a page that never says hello, so the Coach tab '
             'stays WAITING. %s --></body></html>' % (HOLD_BUILD, 'x' * 10240))   # TrovoOta.stage takes 10,000 characters up

NOKEY_JS = "var had = localStorage.getItem('kt_apikey') !== null; localStorage.removeItem('kt_apikey'); render(); return { had: had };"
KEY_JS = "localStorage.setItem('kt_apikey', args.key); render(); return true;"
TOAST_JS = "showToast(args.text); return true;"
STAGE_JS = ("var p = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.TrovoOta;"
            "if (!p) return { error: 'no TrovoOta' };"
            "try { await p.stage({ html: args.html, build: args.build }); return { staged: args.build }; }"
            "catch (e) { return { error: String(e && e.message || e) }; }")
# The owner's own switch (Settings > About > Native Coach) as the page flips it: kt_native_off set or cleared, and the
# Coach tab out of the shell's hands or back in them at once (the tab root and its bar stay either way).
SWITCH_JS = ("toggleNativeChat(); return { off: localStorage.getItem('kt_native_off') !== null, "
             "tabs: document.documentElement.classList.contains('fp-tabs') };")
SWITCH_MS = 4500                                    # past the switch's own toast and the tab's change of hands


# ── the probe ────────────────────────────────────────────────────────────────────────────────────────────────────────

def state(label):
    return {'op': 'state', 'label': label}


def js(label, src, **args):
    return {'op': 'js', 'label': label, 'src': src, 'args': args}


def wait(ms):
    return {'op': 'wait', 'ms': ms}


def mark(label):
    return {'op': 'mark', 'label': label, 'hold': 1800}


def intent(label, name):
    return {'op': 'intent', 'label': label, 'name': name, 'args': {}}


RUNS = [0]


def probe(sim, name, phases, args, shots, timeout=120):
    """One launch running `phases`: every `mark` gets a shot at shots(label), 0.6 s after it (the frame settles)."""
    RUNS[0] += 1
    tag = 'tg%02d-%s' % (RUNS[0], name)
    pdir = sim.path('Documents', 'fp-probe')
    os.makedirs(pdir, exist_ok=True)
    with open(os.path.join(pdir, tag + '.json'), 'w') as f:
        json.dump({'phases': phases}, f)
    logp = os.path.join(pdir, tag + '.jsonl')
    if os.path.exists(logp):
        os.remove(logp)
    sim.terminate()
    t0 = time.time()
    sim.launch(['-fpShellProbe', tag + '.json', '-fpShellProbeLog', tag + '.jsonl', '-fpOffline', '-fpIgnoreMarker',
                '-fpApiBase', LOOPBACK, *args])
    shot = set()
    ev = read_log(logp)
    while time.time() - t0 < timeout:
        time.sleep(0.25)
        ev = read_log(logp)
        for e in ev.all('mark'):
            label = e.get('label')
            if label and label not in shot:
                shot.add(label)
                time.sleep(0.6)
                sim.screenshot(shots(label))
        if ev.first('done'):
            break
    ev = read_log(logp)
    ev.timedOut = not ev.first('done')
    sim.terminate()
    return ev


def held(sim, theme, path, bar, bg):
    """The launch that serves the staged page that never says hello: its frames shot one after another until the WAITING
    ground has shown in three of them across HOLD_S, or for BURST_S at most (the hello deadline is 15 s), returned as
    [(seconds after launch, path, WAITING or not)]."""
    sim.terminate()
    t0 = time.time()
    sim.launch(['-devNav', 'coach', '-devTheme', theme, '-fpOffline', '-fpIgnoreMarker'])
    frames = []
    while time.time() - t0 < BURST_S:
        p = path(len(frames))
        a = time.time()
        sim.screenshot(p)
        if not os.path.exists(p):
            continue
        frames.append((round((a + time.time()) / 2 - t0, 2), p, waiting_frame(p, bar, bg)))
        w = [f for f in frames if f[2]]
        if len(w) >= 3 and w[-1][0] - w[0][0] >= HOLD_S and frames[-1][2]:
            break
    sim.terminate()
    return frames


def root_of(e):
    return ((e or {}).get('shell') or {}).get('root') or {}


def overlay_of(e):
    return (((e or {}).get('shell') or {}).get('screens') or {}).get('overlay') or {}


# ── the pixels ───────────────────────────────────────────────────────────────────────────────────────────────────────

def lum(p):
    def c(v):
        v /= 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * c(p[0]) + 0.7152 * c(p[1]) + 0.0722 * c(p[2])


def ratio(a, b):
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


def hexc(p):
    return '#%02x%02x%02x' % tuple(p[:3])


class UnknownBar(Exception):
    """A bar the reading has no numbers for."""


def platter(bar):
    """The platter's inset from each side of the bar and its height, by the bar's size."""
    got = PLATTERS.get((int(round(bar['w'])), int(round(bar['h']))))
    if not got:
        raise UnknownBar('no platter numbers for a %g x %g pt bar (known: %s): measure this phone\'s platter in a frame '
                         'and add it to PLATTERS' % (bar['w'], bar['h'], ', '.join('%d x %d' % k for k in sorted(PLATTERS))))
    return got


def read_bar(path, bar):
    """The platter and its four items in a shot, from the bar's frame in points."""
    inset, tall = platter(bar)
    im = Image.open(path).convert('RGB')
    s = im.size[0] / float(bar['x'] * 2 + bar['w'])          # the bar spans the window: its width is the window's
    x0, x1, y0 = bar['x'] + inset, bar['x'] + bar['w'] - inset, bar['y']
    y1 = y0 + tall
    q = (x1 - x0) / 4.0
    allpx = [im.getpixel((int(x * s), int(y * s))) for y in range(int(y0) + 2, int(y1) - 2, 2)
             for x in range(int(x0) + 4, int(x1) - 4, 2)]
    pl = sorted(lum(p) for p in allpx)[len(allpx) // 2]
    items = {}
    for k, tab in enumerate(TABS):
        rx0, rx1 = x0 + k * q + q * 0.2, x0 + (k + 1) * q - q * 0.2
        ry0, ry1 = y0 + tall * 0.15, y1 - tall * 0.15
        px = [im.getpixel((x, y)) for y in range(int(ry0 * s), int(ry1 * s)) for x in range(int(rx0 * s), int(rx1 * s))]
        ls = sorted((lum(p), p) for p in px)
        cap = ls[len(ls) // 2]
        r = sorted((ratio(l, cap[0]), l, p) for l, p in ls)
        top = r[int(len(r) * 0.97)]
        items[tab] = {'capsule': hexc(cap[1]), 'item': hexc(top[2]), 'onCapsule': round(top[0], 2),
                      'onPlatter': round(ratio(top[1], pl), 2)}
    return {'platterL': round(pl, 3), 'items': items}


def waiting_frame(path, bar, bg):
    """Whether a frame shows the WAITING ground: between the status bar and the bar nothing but the room's ground (every
    sample within 10/255 of it), and the bar drawn: a tab that is not selected stands out of the platter (its region
    not flat). The selected one is never asked: it is what the run judges, and without the ground it all but vanished."""
    im = Image.open(path).convert('RGB')
    W, H = im.size
    s = W / float(bar['x'] * 2 + bar['w'])
    for y in range(int(70 * s), int((bar['y'] - 8) * s), int(6 * s)):
        for x in range(int(8 * s), W - int(8 * s), int(6 * s)):
            p = im.getpixel((x, y))
            if max(abs(p[i] - bg[i]) for i in range(3)) > 10:
                return False
    try:
        items = read_bar(path, bar)['items']
    except (IndexError, ValueError):
        return False
    return any(items[t]['onCapsule'] > 1.5 for t in TABS if t != 'coach')


def sheet(out, rows, path):
    """A contact sheet: each row a room and appearance, each tile the bottom 40% of a state's frame, labelled."""
    tiles = []
    for label, cells in rows:
        row = []
        for st, p, verdict in cells:
            if not p or not os.path.exists(p):
                continue
            im = Image.open(p).convert('RGB')
            W, H = im.size
            t = im.crop((0, int(H * 0.6), W, H)).resize((W // 4, int(H * 0.4) // 4))
            d = ImageDraw.Draw(t)
            d.rectangle((0, 0, t.size[0], 13), fill=(0, 120, 0) if verdict else (200, 0, 0))
            d.text((3, 1), '%s %s' % (label, st), fill=(255, 255, 255))
            row.append(t)
        if row:
            tiles.append(row)
    if not tiles:
        return
    tw, th = tiles[0][0].size
    cols = max(len(r) for r in tiles)
    out_im = Image.new('RGB', (cols * (tw + 4), len(tiles) * (th + 4)), (128, 128, 128))
    for j, r in enumerate(tiles):
        for i, t in enumerate(r):
            out_im.paste(t, (i * (tw + 4), j * (th + 4)))
    out_im.save(path)


# ── the run ──────────────────────────────────────────────────────────────────────────────────────────────────────────

def bin_hashes(app):
    out = {}
    for rel in ('App', 'App.debug.dylib'):
        p = os.path.join(app, rel)
        if os.path.exists(p):
            with open(p, 'rb') as f:
                out[rel] = hashlib.sha256(f.read()).hexdigest()[:16]
    return out


def appearance(sim, look=None):
    if look:
        sim.sh('xcrun', 'simctl', 'ui', sim.udid, 'appearance', look)
        return look
    return sim.sh('xcrun', 'simctl', 'ui', sim.udid, 'appearance', check=False).strip()


def judge(rep, scen, what, path, bar, minimum, results, key):
    """Reads the Coach item in a shot and records the verdict."""
    r = read_bar(path, bar)
    c = r['items']['coach']
    ok = c['onCapsule'] >= minimum and c['onPlatter'] >= minimum
    others = ', '.join('%s %.2f' % (t, r['items'][t]['onCapsule']) for t in TABS if t != 'coach')
    rep.check(scen, '%s: the selected Coach item %s stands %.2f:1 on its capsule %s and %.2f:1 on the platter (L %.3f), '
              'at least %g:1 (the others on theirs: %s)' % (what, c['item'], c['onCapsule'], c['capsule'], c['onPlatter'],
                                                           r['platterL'], minimum, others), ok, os.path.basename(path))
    results[key] = dict(r, shot=os.path.basename(path), ok=ok, bar=bar)
    return ok


def run_combo(sim, rep, opts, room, look, only, results, cells):
    theme, bg = ROOMS[room]
    scen = '%s/%s' % (room, look)
    pre = os.path.join(opts.out, '%s-%s' % (room, look))
    appearance(sim, look)
    native = [s for s in ('waiting', 'connect', 'hub', 'chat', 'toast') if s in only]
    if native:
        steps = [js('no key', NOKEY_JS), wait(1500), state('connect'), mark('connect')]
        if {'hub', 'chat', 'toast'} & set(only):
            steps += [js('key', KEY_JS, key=PROBE_KEY), wait(1500), state('hub'), mark('hub')]
        if {'chat', 'toast'} & set(only):
            steps += [intent('open chat', 'coachHome.openChat'), {'op': 'waitCoach', 'label': 'chat up', 'until': 'up', 'ms': 8000},
                      wait(1200), state('chat'), mark('chat')]
        if 'toast' in only:
            steps += [js('toast', TOAST_JS, text=TOAST), wait(300), state('toast'), mark('toast'), wait(2500)]
        steps += [js('key away', NOKEY_JS), wait(300)]
        if 'waiting' in only:
            steps += [js('stage', STAGE_JS, html=HOLD_HTML, build=HOLD_BUILD)]
        ev = probe(sim, '%s-%s' % (room, look), [steps], ['-devNav', 'coach', '-devTheme', theme],
                   lambda label: '%s-%s.png' % (pre, label))
        bar = (root_of(ev.state('connect')).get('bar') or {}).get('frame')
        if not bar:
            rep.check(scen, 'the probe launch reached the connect screen and reported the bar', False,
                      {'timedOut': ev.timedOut, 'states': [e.get('label') for e in ev.all('state')]})
            return
        expect = {
            'connect': lambda r, o: r.get('coach', {}).get('mode') == 'native' and r.get('coach', {}).get('root') == 'connect'
            and not r.get('coach', {}).get('pushed'),
            'hub': lambda r, o: r.get('coach', {}).get('mode') == 'native' and r.get('coach', {}).get('root') == 'hub'
            and not r.get('coach', {}).get('pushed'),
            'chat': lambda r, o: r.get('coach', {}).get('mode') == 'native' and r.get('coach', {}).get('pushed') is True,
            'toast': lambda r, o: r.get('coach', {}).get('pushed') is True and o.get('toast') == TOAST,
        }
        for st in ('connect', 'hub', 'chat', 'toast'):
            if st not in only:
                continue
            e = ev.state(st)
            r, o = root_of(e), overlay_of(e)
            p = '%s-%s.png' % (pre, st)
            seen = r.get('selected') == 'coach' and (r.get('bar') or {}).get('hidden') is False and expect[st](r, o)
            if not rep.check(scen, '%s: the shot\'s state (Coach selected, the bar shown, %s)' % (st, {
                    'connect': 'NATIVE on the connect screen', 'hub': 'NATIVE on the hub', 'chat': 'the chat pushed',
                    'toast': 'the chat pushed, the page\'s toast up'}[st]),
                    seen and os.path.exists(p), {'selected': r.get('selected'), 'bar': (r.get('bar') or {}).get('hidden'),
                                                 'coach': r.get('coach'), 'toast': o.get('toast'), 'shot': os.path.exists(p)}):
                cells.append((st, p if os.path.exists(p) else None, False))
                continue
            ok = judge(rep, scen, st, p, (r.get('bar') or {}).get('frame'), opts.min, results, '%s/%s' % (scen, st))
            cells.append((st, p, ok))
        if 'waiting' in only:
            staged = (ev.last('js', label='stage') or {}).get('result') or {}
            if not rep.check(scen, 'the WAITING hold staged (TrovoOta.stage: a page that never says hello, build %s)' % HOLD_BUILD,
                             isinstance(staged, dict) and staged.get('staged') == HOLD_BUILD, staged):
                cells.append(('waiting', None, False))
                return
            frames = held(sim, theme, lambda i: '%s-held-%02d.png' % (pre, i), bar, bg)
            waiting = [(t, p) for t, p, w in frames if w]
            ok = rep.check(scen, 'WAITING held: the room\'s ground alone above the bar in three frames %.1f s apart at least, '
                           'to the last frame' % HOLD_S, len(waiting) >= 3 and waiting[-1][0] - waiting[0][0] >= HOLD_S
                           and frames[-1][2], '%d of %d frames in %.1f s, WAITING at %s s' % (
                               len(waiting), len(frames), frames[-1][0] if frames else 0, ', '.join('%.2f' % t for t, _ in waiting)))
            if ok:
                for t, p, w in frames:
                    if not w:
                        os.remove(p)
            if waiting:
                t, p = waiting[0]
                c = read_bar(p, bar)['items']['coach']
                rep.fact(scen, 'WAITING\'s first frame (%.2f s): the Coach item %.2f:1 on its capsule, %.2f:1 on the platter (%s)'
                         % (t, c['onCapsule'], c['onPlatter'], os.path.basename(p)))
                last = '%s-waiting.png' % pre
                os.replace(waiting[-1][1], last)
                ok = judge(rep, scen, 'WAITING (its last frame, %.2f s after launch)' % waiting[-1][0], last, bar, opts.min,
                           results, '%s/waiting' % scen) and ok
                cells.insert(0, ('waiting', last, ok))
            else:
                cells.insert(0, ('waiting', None, False))
    if 'web' in only:
        with open(sim.path(WEB_POLICY), 'w') as f:
            f.write('{"v":1,"screens":{"coachHome":"off"}}')
        ev = probe(sim, '%s-%s-web' % (room, look), [[wait(2500), state('web'), mark('web')]],
                   ['-devNav', 'coach', '-devTheme', theme, '-fpPolicyFile', WEB_POLICY, '-fpPolicyEvery', '0'],
                   lambda label: '%s-%s.png' % (pre, label))
        os.remove(sim.path(WEB_POLICY))
        r = root_of(ev.state('web'))
        p = '%s-web.png' % pre
        seen = r.get('selected') == 'coach' and (r.get('bar') or {}).get('hidden') is False and \
            (r.get('coach') or {}).get('mode') == 'web' and (r.get('web') or {}).get('slot') == 'coach'
        if not rep.check(scen, 'web: the shot\'s state (Coach selected, the bar shown, the tab WEB with the page in it)',
                         seen and os.path.exists(p), {'selected': r.get('selected'), 'bar': (r.get('bar') or {}).get('hidden'),
                                                      'coach': r.get('coach'), 'web': r.get('web'), 'fellBack': r.get('fellBack'),
                                                      'shot': os.path.exists(p)}):
            cells.append(('web', p if os.path.exists(p) else None, False))
        else:
            ok = judge(rep, scen, 'web (the page\'s Coach screen)', p, r['bar']['frame'], opts.min, results, '%s/web' % scen)
            cells.append(('web', p, ok))
    if set(AGAIN) & set(only):
        run_again(sim, rep, opts, room, look, only, results, cells)


def run_again(sim, rep, opts, room, look, only, results, cells):
    """The fourth launch, a round trip inside one scene: the hub, the owner's switch off (the Coach tab WEB), the
    switch back (the hub again) and the chat pushed over it. The switch always goes back, whatever `only` asks for."""
    theme, _ = ROOMS[room]
    scen = '%s/%s' % (room, look)
    pre = os.path.join(opts.out, '%s-%s' % (room, look))
    steps = [js('no key', NOKEY_JS), wait(1500), js('key', KEY_JS, key=PROBE_KEY), wait(1500), state('before'),
             js('native off', SWITCH_JS), wait(SWITCH_MS), state('webafter')]
    if 'webafter' in only:
        steps += [mark('webafter')]
    steps += [js('native on', SWITCH_JS), wait(SWITCH_MS), state('hubagain')]
    if 'hubagain' in only:
        steps += [mark('hubagain')]
    if 'chatagain' in only:
        steps += [intent('open chat', 'coachHome.openChat'),
                  {'op': 'waitCoach', 'label': 'chat up', 'until': 'up', 'ms': 8000}, wait(1200), state('chatagain'),
                  mark('chatagain')]
    steps += [js('key away', NOKEY_JS), wait(300)]
    ev = probe(sim, '%s-%s-again' % (room, look), [steps], ['-devNav', 'coach', '-devTheme', theme],
               lambda label: '%s-%s.png' % (pre, label))
    off = (ev.last('js', label='native off') or {}).get('result')
    on = (ev.last('js', label='native on') or {}).get('result')
    before = root_of(ev.state('before')).get('coach') or {}
    between = root_of(ev.state('webafter'))
    went = before.get('mode') == 'native' and before.get('root') == 'hub' and not before.get('pushed') \
        and isinstance(off, dict) and off.get('off') is True
    turned = went and (between.get('coach') or {}).get('mode') == 'web' \
        and (between.get('web') or {}).get('slot') == 'coach'
    back = turned and isinstance(on, dict) and on.get('off') is False
    expect = {   # the state's own Coach tab as it must read, then the check's words and the reading's name
        'webafter': (lambda c: turned, 'the tab WEB with the page in it, in a scene that showed the NATIVE hub until '
                     'the owner\'s switch went off', 'webafter (the page\'s Coach screen over the hidden stack)'),
        'hubagain': (lambda c: back and c.get('mode') == 'native' and c.get('root') == 'hub' and not c.get('pushed'),
                     'NATIVE on the hub again, the switch put back after the tab was WEB',
                     'hubagain (the hub after the tab was WEB)'),
        'chatagain': (lambda c: back and c.get('mode') == 'native' and c.get('pushed') is True,
                      'the chat pushed over that hub', 'chatagain (the chat pushed after the tab was WEB)'),
    }
    for st in AGAIN:
        if st not in only:
            continue
        r = root_of(ev.state(st))
        frame = (r.get('bar') or {}).get('frame')
        p = '%s-%s.png' % (pre, st)
        holds, says, what = expect[st]
        seen = r.get('selected') == 'coach' and (r.get('bar') or {}).get('hidden') is False and bool(frame) \
            and bool(holds(r.get('coach') or {}))
        if not rep.check(scen, '%s: the shot\'s state (Coach selected, the bar shown, %s)' % (st, says),
                         seen and os.path.exists(p),
                         {'selected': r.get('selected'), 'bar': (r.get('bar') or {}).get('hidden'),
                          'coach': r.get('coach'), 'web': r.get('web'), 'before': before, 'off': off, 'on': on,
                          'fellBack': r.get('fellBack'), 'timedOut': ev.timedOut, 'shot': os.path.exists(p)}):
            cells.append((st, p if os.path.exists(p) else None, False))
            continue
        ok = judge(rep, scen, what, p, frame, opts.min, results, '%s/%s' % (scen, st))
        cells.append((st, p, ok))


def hold_sim_lock():
    """Re-runs this script under tests/tools/simlock.sh's hold of the paired simulators (a hold of this run's caller
    counts: simlock takes it as held)."""
    if os.environ.get('FP_TAB_GLASS_LOCKED') == '1':
        return
    env = dict(os.environ, FP_TAB_GLASS_LOCKED='1')
    script = '. "$1"; shift; simlock tab-glass; "$@"'
    os.execvpe('bash', ['bash', '-c', script, 'bash', os.path.join(HERE, 'simlock.sh'), sys.executable, os.path.abspath(__file__),
                        *sys.argv[1:]], env)


def main():
    ap = argparse.ArgumentParser(description='The selected Coach tab under the glass bar, from the app\'s pixels (H9 fix-1).')
    ap.add_argument('--phone', required=True, help='the simulator\'s UDID (an iPhone of an iOS 26+ runtime)')
    ap.add_argument('--app', required=True, help='the Debug App.app (tests/tools/fp-build.sh glass builds one)')
    ap.add_argument('--no-install', action='store_true', help='run the app the phone holds: it must be --app\'s')
    ap.add_argument('--rooms', default='lime,heavyweight', help='rooms, comma separated (lime, heavyweight)')
    ap.add_argument('--looks', default='light,dark', help='phone appearances, comma separated (light, dark)')
    ap.add_argument('--only', default=','.join(STATES), help='states, comma separated (%s)' % ', '.join(STATES))
    ap.add_argument('--out', default='', help='where the frames go (default screenshots/out/tab-glass/<runtime>)')
    ap.add_argument('--min', type=float, default=3.0, help='the least contrast the selected item may have (default 3)')
    opts = ap.parse_args()
    rooms = [x for x in opts.rooms.split(',') if x]
    looks = [x for x in opts.looks.split(',') if x]
    only = [x for x in opts.only.split(',') if x]
    for name, got, known in (('room', rooms, ROOMS), ('appearance', looks, LOOKS), ('state', only, STATES)):
        bad = [x for x in got if x not in known]
        if bad or not got:
            ap.error('unknown or no %s: %s (known: %s)' % (name, ', '.join(bad) or '-', ', '.join(known)))
    if not os.path.isdir(opts.app) or not os.path.exists(os.path.join(opts.app, 'Info.plist')):
        ap.error('no app at %s' % opts.app)
    if opts.min <= 1:
        ap.error('--min must be above 1')
    hold_sim_lock()
    sim = Sim(opts.phone)
    sim.boot()
    rt, name = sim.runtime()
    try:
        major = int(rt.split('-')[1])
    except (IndexError, ValueError):
        major = 0
    if major < 26:
        print('FAIL: %s runs %s: the tab root needs iOS 26 or later' % (name, rt))
        sys.exit(2)
    opts.out = os.path.abspath(opts.out or os.path.join(HERE, '..', '..', 'screenshots', 'out', 'tab-glass', rt))
    os.makedirs(opts.out, exist_ok=True)
    if opts.no_install:
        try:
            have = sim.sh('xcrun', 'simctl', 'get_app_container', sim.udid, BID).strip()
        except RuntimeError:
            have = ''
        if not have or bin_hashes(have) != bin_hashes(opts.app):
            print('FAIL: --no-install, but the app on %s is not %s' % (name, opts.app))
            sys.exit(2)
    else:
        sim.uninstall()
        sim.install(opts.app)
    found = appearance(sim)
    rep = Report('tab-glass')
    results, rows = {}, []
    print('tab-glass on %s (%s), %s, min %g:1, out %s' % (name, rt, opts.app, opts.min, opts.out), flush=True)
    unknown = None
    try:
        for room in rooms:
            for look in looks:
                cells = []
                run_combo(sim, rep, opts, room, look, only, results, cells)
                rows.append(('%s/%s' % (room, look), cells))
    except UnknownBar as e:
        unknown = e
    finally:
        sim.terminate()
        if found in LOOKS:
            appearance(sim, found)
    if unknown:
        print('FAIL: %s' % unknown)
        sys.exit(2)
    sheet(opts.out, rows, os.path.join(opts.out, 'sheet.png'))
    with open(os.path.join(opts.out, 'results.json'), 'w') as f:
        json.dump({'runtime': rt, 'phone': name, 'app': os.path.abspath(opts.app), 'min': opts.min, 'results': results,
                   'failed': [list(r) for r in rep.failed]}, f, indent=1)
    n = len(rep.rows)
    print('\n%d of %d checks passed on %s (%s); frames and sheet.png in %s' % (n - len(rep.failed), n, name, rt, opts.out))
    for r in rep.failed:
        print('FAILED [%s] %s' % (r[0], r[1]))
    sys.exit(1 if rep.failed else 0)


if __name__ == '__main__':
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print('FAIL: tab-glass.py reads the frames with Pillow (python3 -m pip install --user pillow)')
        sys.exit(2)
    main()
