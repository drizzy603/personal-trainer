#!/usr/bin/env python3
"""The native store scenarios (plan task S5): FPStore attached to the real app, in an iOS simulator.

tests/native-store.sh builds the app (as build 60, Debug) and calls this. Every scenario drives the real index.html in
the real Capacitor shell through the app's own launch arguments (FPHost's StoreProbe, Debug builds only), so nothing
writes WebKit's file behind the facade except the scenarios that are about exactly that (WebKit wiped). The host reads
the two SQLite files itself (WebKit's localstorage.sqlite3 and FPStore's store.sqlite, copied first) and decides; the
app only acts and reports.

  native-store.py --phone UDID --app App.app [--app59 App59.app] [--only a,b] [--sweep N]

Exit 1 when any check fails. Output: one PASS/FAIL line per check, then the facts the report needs.
"""
import argparse
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time

BID = 'app.kt.trainer'
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RESERVED = ('kt_apikey',)
API_KEY = 'sk-ant-probe-not-a-key'
LOG_KEYS = ('kt_sessions', 'kt_runs', 'kt_sports', 'kt_bw', 'kt_measurements')


def H(s):
    """The facade's hash (len:fnv1a32:djb2 over UTF-16 code units), over a str that may hold lone surrogates."""
    if s is None:
        return None
    u = s.encode('utf-16-le', 'surrogatepass')
    a, b = 0x811c9dc5, 5381
    for i in range(0, len(u), 2):
        c = u[i] | (u[i + 1] << 8)
        a = ((a ^ c) * 0x01000193) & 0xffffffff
        b = (b * 33 + c) & 0xffffffff
    return '%d:%x:%x' % (len(u) // 2, a, b)


def reserved(k):
    return k in RESERVED or k.startswith('kt__store')


# ── the simulator ─────────────────────────────────────────────────────────────────────────────────────────────────

class Sim:
    def __init__(self, udid, verbose=False):
        self.udid = udid
        self.verbose = verbose
        self._container = None

    def sh(self, *a, check=True, timeout=180):
        r = subprocess.run(a, capture_output=True, text=True, timeout=timeout)
        if check and r.returncode != 0:
            raise RuntimeError('%s: %s' % (' '.join(a[:4]), (r.stderr or r.stdout).strip()[:400]))
        return r.stdout

    def boot(self):
        self.sh('xcrun', 'simctl', 'boot', self.udid, check=False)
        self.sh('xcrun', 'simctl', 'bootstatus', self.udid, '-b', timeout=300)

    def runtime(self):
        out = self.sh('xcrun', 'simctl', 'list', 'devices', '-j')
        for rt, devs in json.loads(out)['devices'].items():
            for d in devs:
                if d['udid'] == self.udid:
                    return rt.split('SimRuntime.')[-1], d['name']
        return '?', '?'

    def install(self, app):
        self.terminate()
        self.sh('xcrun', 'simctl', 'install', self.udid, app, timeout=300)
        self._container = None

    def uninstall(self):
        self.terminate()
        self.sh('xcrun', 'simctl', 'uninstall', self.udid, BID, check=False)
        self._container = None

    def terminate(self):
        self.sh('xcrun', 'simctl', 'terminate', self.udid, BID, check=False)
        time.sleep(0.8)

    def launch(self, args=()):
        out = self.sh('xcrun', 'simctl', 'launch', self.udid, BID, *args)
        m = re.search(r':\s*(\d+)', out)
        return int(m.group(1)) if m else None

    def open_app(self, bid):
        self.sh('xcrun', 'simctl', 'launch', self.udid, bid, check=False)

    def container(self):
        if not self._container:
            self._container = self.sh('xcrun', 'simctl', 'get_app_container', self.udid, BID, 'data').strip()
        return self._container

    def path(self, *p):
        return os.path.join(self.container(), *p)

    @staticmethod
    def alive(pid):
        try:
            os.kill(pid, 0)
            return True
        except ProcessLookupError:
            return False
        except PermissionError:
            return True

    def screenshot(self, path):
        self.sh('xcrun', 'simctl', 'io', self.udid, 'screenshot', path, check=False)


# ── the probe (FPHost StoreProbe) ─────────────────────────────────────────────────────────────────────────────────

class Events(list):
    def all(self, ev):
        return [e for e in self if e.get('ev') == ev]

    def first(self, ev, **match):
        for e in self:
            if e.get('ev') == ev and all(e.get(k) == v for k, v in match.items()):
                return e
        return None

    def last(self, ev, **match):
        for e in reversed(self):
            if e.get('ev') == ev and all(e.get(k) == v for k, v in match.items()):
                return e
        return None

    def state(self, label):
        return self.last('state', label=label)


RUNS = [0]


def read_log(path):
    out = Events()
    if not os.path.exists(path):
        return out
    with open(path, encoding='utf-8', errors='surrogatepass') as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    out.append(json.loads(line))
                except ValueError:
                    pass
    return out


def probe(sim, name, phases, args=(), until='done', timeout=90, terminate=True, during=None):
    """One launch running `phases`. Returns its events. `during(events)` is called while waiting (host actions)."""
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
    pid = sim.launch(['-fpProbe', tag + '.json', '-fpProbeLog', tag + '.jsonl', '-fpOffline', *args])
    t_end = time.time() + timeout
    ev = Events()
    while time.time() < t_end:
        time.sleep(0.25)
        ev = read_log(logp)
        if during:
            during(ev)
        if ev.first(until) or (until != 'sigkill' and ev.first('sigkill')):
            break
    ev = read_log(logp)
    ev.pid = pid
    ev.tag = tag
    ev.timedOut = not ev.first(until)
    if terminate and until != 'sigkill':
        sim.terminate()
    return ev


# ── the two files ─────────────────────────────────────────────────────────────────────────────────────────────────

def _copy_sqlite(path):
    d = tempfile.mkdtemp(prefix='fpns-')
    dst = os.path.join(d, os.path.basename(path))
    for ext in ('', '-wal', '-shm'):
        if os.path.exists(path + ext):
            shutil.copyfile(path + ext, dst + ext)
    return d, dst


def _u16(blob):
    if blob is None:
        return None
    if isinstance(blob, str):
        return blob
    return bytes(blob).decode('utf-16-le', 'surrogatepass')


def webkit_file(sim):
    root = sim.path('Library', 'WebKit')
    for dp, _dn, fn in os.walk(root):
        if 'localstorage.sqlite3' in fn:
            return os.path.join(dp, 'localstorage.sqlite3')
    return None


def webkit_values(sim):
    """WebKit's localStorage for the app's origin, as the page sees it (None: no file)."""
    p = webkit_file(sim)
    if not p:
        return None
    d, cp = _copy_sqlite(p)
    try:
        db = sqlite3.connect(cp)
        rows = db.execute('SELECT key, value FROM ItemTable').fetchall()
        db.close()
        return {k: _u16(v) for k, v in rows}
    finally:
        shutil.rmtree(d, ignore_errors=True)


def store_file(sim):
    return sim.path('Library', 'Application Support', 'FPStore', 'store.sqlite')


def store_read(sim):
    """FPStore's kv (live values; tombstones as None), conflicts and meta, read from a copy."""
    p = store_file(sim)
    if not os.path.exists(p):
        return None
    d, cp = _copy_sqlite(p)
    try:
        db = sqlite3.connect(cp)
        kv = {k: (_u16(v) if v is not None else None) for k, v, enc in db.execute('SELECT k, v, enc FROM kv') if enc == 'u16'}
        conflicts = [dict(zip(('id', 'k', 'why', 'h', 'hnew'), r))
                     for r in db.execute('SELECT id, k, why, h, hnew FROM conflicts ORDER BY id')]
        meta = dict(db.execute('SELECT k, v FROM meta').fetchall())
        journal = db.execute('SELECT COUNT(*) FROM journal').fetchone()[0]
        db.close()
        return {'kv': kv, 'conflicts': conflicts, 'meta': meta, 'journal': journal}
    finally:
        shutil.rmtree(d, ignore_errors=True)


def live(kv):
    return {k: v for k, v in kv.items() if v is not None}


def drift(webkit, store_kv):
    """Keys where WebKit and the store differ (reserved keys aside)."""
    w = {k: v for k, v in (webkit or {}).items() if not reserved(k)}
    s = live(store_kv or {})
    return sorted(k for k in set(w) | set(s) if w.get(k) != s.get(k))


def files_hold(dirpath, needle):
    """Every file under dirpath whose bytes hold needle (UTF-8 or UTF-16LE)."""
    hits = []
    if not os.path.isdir(dirpath):
        return hits
    pats = [needle.encode('utf-8'), needle.encode('utf-16-le')]
    for dp, _dn, fn in os.walk(dirpath):
        for f in fn:
            try:
                data = open(os.path.join(dp, f), 'rb').read()
            except OSError:
                continue
            if any(p in data for p in pats):
                hits.append(os.path.relpath(os.path.join(dp, f), dirpath))
    return hits


# ── report ────────────────────────────────────────────────────────────────────────────────────────────────────────

class Report:
    def __init__(self, label):
        self.label = label
        self.rows = []
        self.facts = []

    def check(self, scen, name, ok, detail=''):
        self.rows.append((scen, name, bool(ok), detail))
        print('%s  [%s] %s%s' % ('PASS' if ok else 'FAIL', scen, name, (' -- ' + str(detail)) if detail else ''), flush=True)
        return ok

    def fact(self, scen, text):
        self.facts.append((scen, text))
        print('      [%s] %s' % (scen, text), flush=True)

    @property
    def failed(self):
        return [r for r in self.rows if not r[2]]


# ── the page's side of a step ─────────────────────────────────────────────────────────────────────────────────────

def state(label):
    return {'op': 'state', 'label': label}


def js(label, src, **args):
    return {'op': 'js', 'label': label, 'src': src, 'args': args}


SEED_JS = r"""
var seed = args.seed, n = 0;
Object.keys(seed).forEach(function (k) { localStorage.setItem(k, seed[k]); n++; });
var msgs = [];
for (var i = 0; i < 60; i++) msgs.push({ role: i % 2 ? 'assistant' : 'user', at: 1791000000000 + i * 60000,
  content: 'Message ' + i + ' 💪 ' + new Array(521).join('x') + (i === 7 ? ' half \ud83d' : '') });
localStorage.setItem('kt_coach_msgs', JSON.stringify(msgs)); n++;
localStorage.setItem('kt_probe_half', 'half \ud83d then   and a NUL \u0000 end'); n++;
var st = window.__ktStoreState || null;
return { wrote: n, mode: st ? st.mode : null, fallbacks: st ? st.fallbacks : null };
"""


def seed_values():
    with open(os.path.join(REPO, 'tests', 'seed-dump.json')) as f:
        s = json.load(f)
    routine = s['kt_routine']
    s.update({
        'kt_routine_next': '{"startsOn":"2026-10-19","at":1791700000000}',
        'kt_round_intro': '{"cycle":2,"top":"Bench","until":"2026-10-25"}',
        'kt_hk_imported': '["11111111-AAAA-4000-8000-000000000001","22222222-BBBB-4000-8000-000000000002"]',
        'kt_hk_last_sync': '1791600000000',
        'kt_routine_backup': routine,
        'kt_routine_archive': '[' + routine + ']',
        'kt_theme': 'heavyweight',
        'kt_user_name': 'Probe',
        'kt_apikey': API_KEY,
    })
    return s


def burst_js():
    return r"""
var st = window.__ktStoreState, acked = [], not = [], t = performance.now(), fb0 = st ? st.fallbacks : 0;
for (var i = 0; i < args.n; i++) {
  var k = 'kt_probe_b' + i, v = args.tag + ':' + i + ':' + new Array(args.chars + 1).join('y');
  localStorage.setItem(k, v);
  if (st && st.acked(k)) acked.push(i); else not.push(i);
}
return { acked: acked.length, not: not, ms: performance.now() - t, seq: st ? st.seq : null, boot: st ? st.boot : null,
         fallbacks: st ? st.fallbacks - fb0 : null };
"""


BURST_CHARS = [4000]   # each burst value's filler (--burst-chars)


# ── scenarios ─────────────────────────────────────────────────────────────────────────────────────────────────────

class Ctx:
    def __init__(self, sim, rep, opts):
        self.sim = sim
        self.rep = rep
        self.opts = opts
        self.boot_ms = []      # (scenario, bootMs, WebKit's first storage read in ms) from every attached launch
        self.cap_http = []     # (scenario, bool)
        self.alerts = []       # (scenario, bool)
        self.page = None       # the bundled page build

    def note_state(self, scen, ev):
        for e in ev.all('state'):
            j = e.get('js') or {}
            st = j.get('st') or {}
            if st.get('mode') == 'shadow' and st.get('bootMs') is not None:
                self.boot_ms.append((scen, float(st['bootMs']), j.get('wkMs')))
            if 'capHttp' in j:
                self.cap_http.append((scen, bool(j['capHttp'])))
            self.alerts.append((scen, bool(e.get('alert'))))
            prox = (e.get('status') or {}).get('proxy') or {}
            if prox.get('kt1Refused'):
                self.rep.check(scen, 'no KT1 prompt refused in the main frame', False, prox)

    def in_step(self, scen, label, ev, what='in step'):
        """The state step `label`: page == WebKit == store (reserved keys aside)."""
        e = ev.state(label)
        if not e:
            return self.rep.check(scen, '%s: state "%s" logged' % (what, label), False, 'no state event (timed out: %s)' % ev.timedOut)
        j = e.get('js') or {}
        page, wk, store = j.get('page') or {}, j.get('webkit') or {}, e.get('store') or {}
        pw = sorted(k for k in set(page) | set(wk) if page.get(k) != wk.get(k))
        ws = sorted(k for k in set(wk) | set(store) if not reserved(k) and wk.get(k) != store.get(k))
        return self.rep.check(scen, '%s (%s): page == WebKit == store' % (what, label), not pw and not ws,
                              'page/WebKit %s, WebKit/store %s, %d keys' % (pw or '-', ws or '-', len(wk)))

    def hello(self, ev, document=1):
        hs = [h for h in ev.all('hello') if h.get('document') == document]
        return hs[-1] if hs else None


def scen_fresh(c):
    """A fresh install of the app under test: the first launch on an empty WebKit attaches and migrates nothing."""
    s = 'fresh'
    c.sim.uninstall()
    c.sim.install(c.opts.app)
    ev = probe(c.sim, 'fresh-boot', [[state('fresh')]])
    h = c.hello(ev)
    c.rep.check(s, 'first launch on an empty WebKit attaches (migrate of nothing)',
                h and h.get('attached') and '"label":"migrate"' in h.get('answer', ''), h and h.get('answer'))
    launch = ev.first('launch') or {}
    c.page = launch.get('page')
    c.rep.fact(s, 'shell %s, page %s, store %s' % (launch.get('shell'), launch.get('page'), launch.get('storeState')))
    c.note_state(s, ev)


def scen_migration(c):
    """First launch of 60 over data an older build wrote: one put, a migrate snapshot, kv exact."""
    s = 'migration'
    seed = seed_values()
    if c.opts.app59:
        c.sim.uninstall()
        c.sim.install(c.opts.app59)
        ok = drill59(c, 'seed', SEED_JS, seed=seed)
        c.rep.check(s, 'build 59 wrote the seed (no facade)', ok and ok.get('wrote', 0) >= len(seed), ok)
        c.sim.install(c.opts.app)
        origin = 'build 59 (%s)' % c.opts.app59
    else:
        c.sim.uninstall()
        c.sim.install(c.opts.app)
        ev = probe(c.sim, 'migration-seed', [[js('seed', SEED_JS, seed=seed)]], args=['-fpStoreSwitch', 'off'])
        r = (ev.last('js') or {}).get('result') or {}
        c.rep.check(s, 'a facade-less launch wrote the seed', r.get('mode') == 'off' and r.get('wrote', 0) >= len(seed), r)
        origin = 'a launch with the Native copy switch off'
    before = webkit_values(c.sim) or {}
    ev = probe(c.sim, 'migration', [[state('migrated'), {'op': 'status'}]], args=['-fpStoreSwitch', 'on'])
    h = c.hello(ev) or {}
    ans = h.get('answer', '')
    need = len(json.loads(ans).get('need', [])) if ans.startswith('{') else -1
    want = len([k for k in before if not reserved(k)])
    c.rep.check(s, 'hello: rule 4 "migrate", every WebKit key asked for (kt_apikey never)', '"label":"migrate"' in ans and need == want
                and 'kt_apikey' not in ans and want >= len(seed), 'need %d of %d WebKit keys (less kt_apikey); %s' % (need, want, ans[:120]))
    st = ((ev.state('migrated') or {}).get('js') or {}).get('st') or {}
    c.rep.check(s, 'the put landed (facade in shadow, need = %s)' % st.get('need'), st.get('mode') == 'shadow' and st.get('need', 0) > 0, st.get('why'))
    c.in_step(s, 'migrated', ev, 'after migration')
    c.note_state(s, ev)
    c.sim.terminate()
    # Byte for byte, from the two files: every value the older build wrote (the page also writes its own breadcrumbs as
    # it leaves, kt_wch_log and the like, after the state check: those are compared there, by hash).
    st_db, wk = store_read(c.sim), webkit_values(c.sim)
    migrated = [k for k in wk if not reserved(k) and (k in seed or k in ('kt_coach_msgs', 'kt_probe_half'))]
    exact = [k for k in migrated if st_db['kv'].get(k) != wk[k]]
    c.rep.check(s, 'every value is in the store in its exact UTF-16 (lone surrogate, U+2028, NUL incl.)', not exact and len(migrated) >= len(seed)
                and st_db['kv'].get('kt_probe_half') == wk.get('kt_probe_half') and '\ud83d' in (wk.get('kt_probe_half') or ''),
                'mismatch %s' % exact if exact else '%d values, %d chars' % (len(migrated), sum(len(wk[k]) for k in migrated)))
    snaps = sorted(os.listdir(c.sim.path('Library', 'Application Support', 'FPStore', 'snaps')))
    c.rep.check(s, 'a migrate snapshot was written', any('migrate' in n for n in snaps), snaps)
    hits = files_hold(c.sim.path('Library', 'Application Support', 'FPStore'), API_KEY)
    c.rep.check(s, 'kt_apikey never reaches the store, its journal, conflicts or snapshots', not hits and wk.get('kt_apikey') == API_KEY, hits or 'WebKit keeps it')
    c.rep.fact(s, 'migrated from %s: %d keys, facade boot %.1f ms (includes the put)' % (origin, need, float(st.get('bootMs') or -1)))


def scen_hidden(c):
    """A write while the web view is out of the window (what a native screen in front of it will do), long enough for
    WebKit to hide the document, as the store-first probe did. (Out and back within a few milliseconds, iOS 27's WebKit
    can kill the WebContent process over a layer-tree commit it calls invalid; the page then reloads, which is the
    WebContent kill scenario, not this one.)"""
    s = 'hidden'
    ev = probe(c.sim, 'hidden', [[
        {'op': 'hide'},
        {'op': 'wait', 'ms': 1500},
        js('write', "localStorage.setItem('kt_probe_hidden', 'hidden-' + Date.now()); var st = __ktStoreState;"
                    " return {acked: st.acked('kt_probe_hidden'), fallbacks: st.fallbacks, vis: document.visibilityState};"),
        {'op': 'wait', 'ms': 2000},
        {'op': 'show'},
        {'op': 'wait', 'ms': 1500},
        state('after hidden write')]])
    hide = ev.first('hide') or {}
    r = (ev.first('js', label='write') or {}).get('result') or {}
    c.rep.check(s, 'the web view was out of the window', hide.get('window') is False, hide)
    c.rep.check(s, 'a write while out of the window is mirrored (acked, no fallback)', r.get('acked') is True and r.get('fallbacks') == 0, r)
    c.rep.check(s, 'the same document all along (no reload while out of the window)', len(ev.all('hello')) == 1, '%d hellos' % len(ev.all('hello')))
    c.rep.fact(s, 'the document was "%s" during the write' % r.get('vis'))
    c.in_step(s, 'after hidden write', ev)
    c.note_state(s, ev)


def scen_background(c):
    s = 'background'
    acted = {}

    def during(ev):
        if ev.first('waitState', state='background') is None and ev.first('phase') and 'bg' not in acted:
            acted['bg'] = time.time()
            time.sleep(1.0)
            c.sim.open_app('com.apple.Preferences')
        if ev.first('waitState', state='background') and 'fg' not in acted:
            acted['fg'] = time.time()
            time.sleep(4.0)
            c.sim.sh('xcrun', 'simctl', 'launch', c.sim.udid, BID, check=False)

    ev = probe(c.sim, 'background', [[
        state('before'),
        {'op': 'waitState', 'state': 'background', 'timeoutMs': 30000},
        {'op': 'waitState', 'state': 'active', 'timeoutMs': 40000},
        {'op': 'wait', 'ms': 1200},
        state('after return')]], timeout=150, during=during)
    bg = ev.first('background') or {}
    c.rep.check(s, 'checkpoint when the app went to the background', bg.get('checkpoint') is True, bg)
    answered = ev.all('answeredInBackground')
    c.rep.check(s, 'the page\'s departure writes were answered while not active', any(a.get('answer') == 'ok' for a in answered),
                ['%s %s -> %s (app state %s)' % (a.get('op'), a.get('key'), a.get('answer'), a.get('appState')) for a in answered][:6])
    st = ((ev.state('after return') or {}).get('js') or {}).get('st') or {}
    c.rep.check(s, 'no fallbacks across background and return', st.get('fallbacks') == 0, st)
    c.in_step(s, 'after return', ev)
    c.note_state(s, ev)
    c.sim.open_app(BID)


def scen_wckill(c):
    s = 'wckill'
    ev = probe(c.sim, 'wckill', [
        [js('marker', "localStorage.setItem('kt_probe_wc', 'before-kill-' + Date.now()); return {acked: __ktStoreState.acked('kt_probe_wc'), boot: __ktStoreState.boot};"),
         {'op': 'killWebContent'}],
        [state('after reload')]], timeout=150)
    r = (ev.first('js', label='marker') or {}).get('result') or {}
    h1, h2 = c.hello(ev, 1) or {}, c.hello(ev, 2) or {}
    c.rep.check(s, 'marker acked before the kill', r.get('acked') is True, r)
    c.rep.check(s, 'the reloaded document attached again with a new boot', h2.get('attached') and len(ev.all('bootDone')) >= 2,
                'hello 1 %s / hello 2 %s' % (h1.get('answer', '')[:70], h2.get('answer', '')[:70]))
    st = ((ev.state('after reload') or {}).get('js') or {}).get('st') or {}
    c.rep.check(s, 'the new document saw WebKit and the store in step (rule 0)', st.get('rule') == 0 and st.get('boot', 0) > r.get('boot', 0),
                'rule %s label %s boot %s -> %s' % (st.get('rule'), st.get('label'), r.get('boot'), st.get('boot')))
    c.in_step(s, 'after reload', ev)
    c.note_state(s, ev)


def scen_nofacade(c):
    s = 'nofacade'
    tag = 'nofacade-%d' % int(time.time())
    ev = probe(c.sim, 'nofacade-off', [[js('write', "localStorage.setItem('kt_probe_nf', args.tag); var st = window.__ktStoreState;"
                                                   " return {mode: st && st.mode, why: st && st.why};", tag=tag)]],
               args=['-fpStoreSwitch', 'off'])
    h = c.hello(ev) or {}
    r = (ev.first('js') or {}).get('result') or {}
    c.rep.check(s, 'with the switch off the facade attaches nothing', h.get('gate') == 'device switch' and r.get('mode') == 'off', r)
    ev = probe(c.sim, 'nofacade-on', [[state('adopted'), {'op': 'conflicts'}]], args=['-fpStoreSwitch', 'on'])
    h = c.hello(ev) or {}
    last = h.get('lastHello') or {}
    adopted = (last.get('adopted') or {}).get('older build', [])
    c.rep.check(s, 'the next facade launch adopts what WebKit took meanwhile (rule 4, older build)',
                last.get('rule') == 4 and 'kt_probe_nf' in adopted and 'kt_last_open' in adopted, last)
    c.in_step(s, 'adopted', ev)
    c.note_state(s, ev)


def scen_nowk(c):
    s = 'nowk'
    before = store_read(c.sim)
    ev = probe(c.sim, 'nowk', [[state('nowk'), {'op': 'status'}]], args=['-fpNoWebKit'])
    h = c.hello(ev) or {}
    st = ((ev.state('nowk') or {}).get('js') or {}).get('st') or {}
    last = h.get('lastHello') or {}
    c.rep.check(s, 'hello nowk: the store reconciles nothing and the facade is off (rule 2)',
                last.get('rule') == 2 and st.get('mode') == 'off' and st.get('why') == 'webkit unreadable', '%s / %s' % (last, st.get('why')))
    after = store_read(c.sim)
    c.rep.check(s, 'the store is unchanged', live(before['kv']) == live(after['kv']), '%d keys' % len(live(after['kv'])))
    ev = probe(c.sim, 'nowk-next', [[state('next')]])
    st = ((ev.state('next') or {}).get('js') or {}).get('st') or {}
    c.rep.check(s, 'the next launch is in step (rule 0)', st.get('rule') == 0, st.get('label'))
    c.in_step(s, 'next', ev)


def scen_race(c):
    s = 'race'
    ev = probe(c.sim, 'race', [[{'op': 'race', 'seconds': 4, 'checkpoints': 24, 'snaps': 12}, {'op': 'wait', 'ms': 300}, state('after race')]], timeout=120)
    r = ev.first('race') or {}
    page, native = r.get('page') or {}, r.get('native') or {}
    c.rep.check(s, 'checkpoints and snapshots racing page writes: zero fallbacks',
                page.get('fallbacks') == 0 and page.get('writes', 0) > 200 and native.get('checkpointFailures') == 0 and native.get('snapFailures') == 0
                and native.get('checkpoints') == 24 and native.get('snaps') == 12,
                '%s writes (%s mirrored), %s fallbacks; %s checkpoints (max %.1f ms), %s snapshots (max %.1f ms); prompt max %s ms'
                % (page.get('writes'), page.get('mirrored'), page.get('fallbacks'), native.get('checkpoints'), native.get('maxCheckpointMs', 0),
                   native.get('snaps'), native.get('maxSnapMs', 0), page.get('maxMs')))
    c.in_step(s, 'after race', ev)
    c.note_state(s, ev)


def scen_policy(c):
    s = 'policy'
    on = '{"v":1,"store":{"facade":"on","repair":"off"},"screens":{"coach":"off"}}'
    off = '{"v":1,"store":{"facade":"off","repair":"off"},"screens":{"coach":"off"}}'
    with open(c.sim.path('Documents', 'fp-policy.json'), 'w') as f:
        f.write(on)
    args = ['-fpPolicyFile', 'Documents/fp-policy.json']
    ev = probe(c.sim, 'policy', [
        [state('policy on'), {'op': 'policy', 'file': 'Documents/fp-policy.json', 'json': off},
         js('write after the change', "localStorage.setItem('kt_probe_pol', 'p-' + Date.now()); return {acked: __ktStoreState.acked('kt_probe_pol'), mode: __ktStoreState.mode};"),
         {'op': 'reload'}],
        [state('after reload'), {'op': 'status'}]], args=args, timeout=150)
    h1, h2 = c.hello(ev, 1) or {}, c.hello(ev, 2) or {}
    pol = ev.first('policy') or {}
    r = (ev.first('js', label='write after the change') or {}).get('result') or {}
    st2 = ((ev.state('after reload') or {}).get('js') or {}).get('st') or {}
    c.rep.check(s, 'with facade "on" the document attaches', h1.get('attached') is True, h1.get('answer', '')[:80])
    c.rep.check(s, 'the fetch applied facade "off" (a local file, Debug launch argument)', pol.get('facade') == 'off', pol)
    c.rep.check(s, 'the document under way keeps its facade (writes still acked)', r.get('acked') is True and r.get('mode') == 'shadow', r)
    c.rep.check(s, 'facade "off" turns the facade off at the next document start', h2.get('gate') == 'policy' and st2.get('mode') == 'off'
                and st2.get('why') == 'store: policy', '%s / %s' % (h2, st2.get('why')))
    with open(c.sim.path('Documents', 'fp-policy.json'), 'w') as f:
        f.write(on)
    ev = probe(c.sim, 'policy-back', [[state('policy back on')]], args=args + ['-fpPolicyEvery', '0'])
    st = ((ev.state('policy back on') or {}).get('js') or {}).get('st') or {}
    c.rep.check(s, 'facade "on" again: the next launch attaches and adopts what the off document wrote',
                st.get('mode') == 'shadow' and st.get('rule') == 4, '%s %s' % (st.get('rule'), st.get('label')))
    c.in_step(s, 'policy back on', ev)
    # a bad file changes nothing
    with open(c.sim.path('Documents', 'fp-policy.json'), 'w') as f:
        f.write('<html>404</html>')
    ev = probe(c.sim, 'policy-bad', [[state('bad policy')]], args=args + ['-fpPolicyEvery', '0'])
    st = ((ev.state('bad policy') or {}).get('js') or {}).get('st') or {}
    stat = ((ev.state('bad policy') or {}).get('status') or {})
    c.rep.check(s, 'a bad file changes nothing (last good copy kept)', st.get('mode') == 'shadow' and 'bad file' in str(stat.get('policyResult')),
                stat.get('policyResult'))
    os.remove(c.sim.path('Documents', 'fp-policy.json'))


def scen_breaker(c):
    s = 'breaker'
    ev = probe(c.sim, 'breaker-armed', [[{'op': 'status'}]], args=['-fpIgnoreBootDone'])
    stat = (ev.first('status') or {}).get('status') or {}
    c.rep.check(s, 'a document that never sends bootDone leaves the breaker armed', stat.get('breakerArmed') is True, stat.get('breakerArmed'))
    trips = stat.get('breakerTrips', 0)
    ev = probe(c.sim, 'breaker-trip', [[state('tripped'), {'op': 'status'}]])
    h = c.hello(ev) or {}
    stat = (ev.first('status') or {}).get('status') or {}
    c.rep.check(s, 'the next launch runs without the facade, once', h.get('gate') == 'unfinished boot' and stat.get('skippingThisLaunch') is True
                and stat.get('breakerTrips') == trips + 1, '%s, trips %s -> %s' % (h.get('gate'), trips, stat.get('breakerTrips')))
    ev = probe(c.sim, 'breaker-back', [[state('back')]])
    st = ((ev.state('back') or {}).get('js') or {}).get('st') or {}
    c.rep.check(s, 'and the launch after attaches again (rule 4 adopts what the skipped launch wrote)', st.get('mode') == 'shadow' and st.get('rule') == 4,
                '%s %s' % (st.get('rule'), st.get('label')))
    c.in_step(s, 'back', ev)


def scen_marker(c):
    s = 'marker'
    c.sim.terminate()
    line = 'store@%s shell %s\n' % (c.page, c.opts.shell)
    mpath = c.sim.path('Library', 'Application Support', 'FPStore', 'store.marker')
    with open(mpath, 'wb') as f:
        f.write(line.encode() + b'1')
    ev = probe(c.sim, 'marker-1', [[state('marker'), {'op': 'status'}]])
    launch, h = ev.first('launch') or {}, c.hello(ev) or {}
    st = ((ev.state('marker') or {}).get('js') or {}).get('st') or {}
    stat = (ev.first('status') or {}).get('status') or {}
    verdicts = stat.get('crashVerdicts') or []
    c.rep.check(s, 'a planted marker is found at launch and turns the facade off', launch.get('markerFound') == line.strip() and h.get('gate') == 'crash marker'
                and st.get('mode') == 'off' and st.get('why') == 'store: crash marker', '%s / %s' % (launch.get('markerFound'), st.get('why')))
    c.rep.check(s, 'Storage says why (status: the verdict for this shell and page, the store closed)', len(verdicts) == 1 and stat.get('storeClosedWhy')
                and 'crash marker' in (verdicts[0].get('why') or ''), verdicts and verdicts[0].get('why'))
    with open(mpath, 'rb') as f:
        c.rep.check(s, 'the marker file is reset for this launch', f.read().endswith(b'0'), None)
    ev = probe(c.sim, 'marker-2', [[state('marker again'), {'op': 'status'}]])
    launch = ev.first('launch') or {}
    stat = (ev.first('status') or {}).get('status') or {}
    c.rep.check(s, 'the marker acts once: no new verdict next launch (still off for this shell+page pair)', launch.get('markerFound') is None
                and len(stat.get('crashVerdicts') or []) == 1 and (c.hello(ev) or {}).get('gate') == 'crash marker', launch.get('verdicts'))
    ev = probe(c.sim, 'marker-cleared', [[state('cleared')]], args=['-fpClearVerdicts'])
    st = ((ev.state('cleared') or {}).get('js') or {}).get('st') or {}
    c.rep.check(s, 'clearing the verdict (Storage\'s switch) brings the facade back', st.get('mode') == 'shadow', '%s %s' % (st.get('rule'), st.get('label')))
    c.in_step(s, 'cleared', ev)


def scen_proxy(c):
    s = 'proxy'
    ev = probe(c.sim, 'proxy-broken', [[state('no proxy')]], args=['-fpBreakProxy'])
    j = (ev.state('no proxy') or {}).get('js') or {}
    c.rep.check(s, 'no verified KTUIProxy: no flag, no facade, no KT1 prompt', ev.first('verifyFailed') and j.get('flag') == 'undefined'
                and j.get('st') is None and not ev.all('hello'), 'flag %s st %s' % (j.get('flag'), j.get('st')))
    c.rep.check(s, 'the page still boots on WebKit and CapacitorHttp is patched', j.get('rendered') and j.get('capHttp'), j.get('capHttp'))
    ev = probe(c.sim, 'proxy-back', [[state('proxy back'), {'op': 'status'}]])
    stat = (ev.first('status') or {}).get('status') or {}
    prox = stat.get('proxy') or {}
    c.rep.check(s, 'with the proxy: KT1 prompts answered, Capacitor\'s own prompts forwarded, none refused',
                prox.get('kt1Answered', 0) > 0 and prox.get('prompts', 0) >= 1 and prox.get('kt1Refused') == 0, prox)
    c.in_step(s, 'proxy back', ev)


def scen_scene(c):
    s = 'scene'
    acted = {}

    def during(ev):
        # Only when UIKit really destroyed the scene: bring the app back, which connects a new one.
        if ev.first('sceneDestroy') and not ev.first('sceneDestroyRefused') and not ev.first('sceneCycle') \
                and ev.first('bootDoneTimeout') is None and 'relaunch' not in acted and time.time() - ev_t0[0] > 3:
            acted['relaunch'] = time.time()
            c.sim.sh('xcrun', 'simctl', 'launch', c.sim.udid, BID, check=False)

    ev_t0 = [time.time()]
    ev = probe(c.sim, 'scene', [
        [state('scene 1'), {'op': 'sceneDestroy'}, {'op': 'sceneCycle'}],
        [{'op': 'wait', 'ms': 1500}, state('scene 2'), {'op': 'status'}]], timeout=150, during=during)
    refused = ev.first('sceneDestroyRefused')
    if refused:
        c.rep.fact(s, 'UIKit refuses a scene destruction here (%s); the scenario replays the reconnect in the process: '
                      'sceneDidDisconnect\'s call, sceneConnected, a new SuperoViewController from Main.storyboard in the window'
                      % refused.get('error', '')[:90])
    disc = ev.first('sceneDisconnected')
    det = ev.first('detached') or {}
    inst = [e for e in ev.all('installed')]
    stat = (ev.first('status') or {}).get('status') or {}
    c.rep.check(s, 'the scene disconnected and its page was detached', disc is not None and det.get('serial') == 1, '%s / %s' % (disc, det))
    c.rep.check(s, 'the new scene\'s web view bound the store (install #2) and attached', len(inst) >= 2 and inst[-1].get('serial') == 2
                and (c.hello(ev, 1) or {}).get('attached'), [i.get('serial') for i in inst])
    c.rep.check(s, 'one page at a time (the old web view released)', stat.get('pagesAlive') == 1 and stat.get('counters', {}).get('detached') == 1,
                'alive %s, detached %s' % (stat.get('pagesAlive'), stat.get('counters', {}).get('detached')))
    c.in_step(s, 'scene 2', ev)
    c.note_state(s, ev)


def scen_ota(c):
    s = 'ota'
    build = c.opts.ota_build
    src = open(os.path.join(REPO, 'index.html'), encoding='utf-8').read()
    html = re.sub(r'<meta name="build" content="[^"]+"/>', '<meta name="build" content="%s"/>' % build, src, count=1)
    with open(c.sim.path('Documents', 'fp-probe', 'ota.html'), 'w', encoding='utf-8') as f:
        f.write(html)
    ev = probe(c.sim, 'ota-stage', [[{'op': 'stageOta', 'build': build, 'html': 'ota.html'}]], timeout=120)
    r = (ev.first('stageOta') or {}).get('result') or {}
    c.rep.check(s, 'the page staged a test page through TrovoOta.stage', isinstance(r, dict) and r.get('staged') is True, r)
    ev = probe(c.sim, 'ota-served', [[state('served'), {'op': 'defaults', 'keys': ['otaAttempt', 'otaLiveBuild']}]])
    launch = ev.first('launch') or {}
    d = (ev.first('defaults') or {}).get('values') or {}
    st = ((ev.state('served') or {}).get('js') or {}).get('st') or {}
    c.rep.check(s, 'the next launch serves it (SuperoViewController.instanceDescriptor)', launch.get('page') == build, launch.get('page'))
    c.rep.check(s, 'the staged page boots with the facade attached', st.get('mode') == 'shadow', st.get('label'))
    c.rep.check(s, 'and confirms its first paint (otaAttempt cleared)', d.get('otaAttempt') is None and d.get('otaLiveBuild') == build, d)
    with open(c.sim.path('Library', 'Application Support', 'FPStore', 'store.marker'), 'rb') as f:
        head = f.read().split(b'\n')[0].decode()
    c.rep.check(s, 'the crash marker names the page being served', head == 'store@%s shell %s' % (build, c.opts.shell), head)
    c.note_state(s, ev)
    ev = probe(c.sim, 'ota-reset', [[js('reset', "await window.Capacitor.Plugins.TrovoOta.reset(); return true;")]])
    ev = probe(c.sim, 'ota-bundle', [[state('bundle again')]])
    c.rep.check(s, 'after TrovoOta.reset the bundle is served again', (ev.first('launch') or {}).get('page') == c.page, (ev.first('launch') or {}).get('page'))


def scen_wiped(c):
    s = 'wiped'
    c.sim.terminate()
    before = store_read(c.sim)
    wk = webkit_file(c.sim)
    shutil.rmtree(os.path.dirname(wk))
    ev = probe(c.sim, 'wiped', [[state('wiped'), {'op': 'status'}]])
    h = c.hello(ev) or {}
    last = h.get('lastHello') or {}
    st = ((ev.state('wiped') or {}).get('js') or {}).get('st') or {}
    stat = (ev.first('status') or {}).get('status') or {}
    offer = (stat.get('store') or {}).get('wipeOffer') or {}
    c.rep.check(s, 'WebKit wiped: rule 3, nothing adopted, the facade off for the document', last.get('rule') == 3 and st.get('mode') == 'off'
                and st.get('why') == 'store: wiped', '%s / %s' % (last.get('label'), st.get('why')))
    c.rep.check(s, 'a snapshot of the store first, offered for Put back', offer.get('snap') and offer.get('keys', 0) >= 10, offer)
    c.sim.terminate()
    after, wk_now = store_read(c.sim), webkit_values(c.sim) or {}
    c.rep.check(s, 'the store kept its whole set', live(before['kv']) == live(after['kv']), '%d keys' % len(live(after['kv'])))
    c.rep.check(s, 'the store wrote nothing into WebKit', 'kt_routine' not in wk_now and 'kt_coach_msgs' not in wk_now, sorted(wk_now)[:12])
    ev = probe(c.sim, 'wiped-follow', [[state('follow-up'), {'op': 'conflicts'}]])
    last = (c.hello(ev) or {}).get('lastHello') or {}
    rows = (ev.first('conflicts') or {}).get('rows') or []
    c.rep.check(s, 'the follow-up adopts the fresh page and keeps every given-up value ("wiped")', last.get('rule') == 4
                and sum(1 for r in rows if r.get('why') == 'wiped') >= 10, '%s; wiped conflicts %d' % (last.get('label'), sum(1 for r in rows if r.get('why') == 'wiped')))
    c.in_step(s, 'follow-up', ev)
    ev = probe(c.sim, 'wiped-putback', [[{'op': 'stagePutBack', 'snap': '@wipe'}, {'op': 'reload'}], [state('put back')]], timeout=150)
    pb = ev.first('stagePutBack') or {}
    st = ((ev.state('put back') or {}).get('js') or {}).get('st') or {}
    c.rep.check(s, 'Put back of the snapshot is staged and written at the next document start', st.get('putBack', 0) >= 5, '%s keys; %s' % (st.get('putBack'), pb.get('items', [])[:4]))
    c.in_step(s, 'put back', ev)
    c.sim.terminate()
    wk_back, st_back, seed = webkit_values(c.sim) or {}, store_read(c.sim), seed_values()
    # Keys the page does not rewrite at boot come back exactly; kt_routine and the logs are rewritten by the page's own
    # boot (ids, stamps) once they are back, and those writes are mirrored like any other.
    keys = ('kt_routine_next', 'kt_round_intro', 'kt_hk_imported', 'kt_user_name')
    back = [k for k in keys if wk_back.get(k) == seed[k] and st_back['kv'].get(k) == seed[k]]
    j = (ev.state('put back') or {}).get('js') or {}
    c.rep.check(s, 'both copies hold the put-back values and the page reads them', len(back) == len(keys) and j.get('routine') is True
                and isinstance(j.get('sessions'), int) and j['sessions'] > 0 and 'kt_routine' in wk_back,
                '%s; programme %s, %s sessions' % (back, j.get('routine'), j.get('sessions')))


PAGE_H = ("var H = function (s) { var a = 0x811c9dc5, b = 5381, i, c; for (i = 0; i < s.length; i++) { c = s.charCodeAt(i);"
          " a = Math.imul(a ^ c, 0x01000193) >>> 0; b = (Math.imul(b, 33) + c) >>> 0; } return s.length + ':' + a.toString(16) + ':' + b.toString(16); };")


def scen_storage(c):
    """Settings > About > Storage through the real TrovoStore plugin (plan task S6): the row, Put back of a value an older
    build replaced (staged, the page reloaded, both copies hold it), a value the copy held as none (an older build's new
    key) previewed as a removal with its start named, the status's losses, "Test: quit after next save" (the process ends
    right after the armed save, the next launch reports what its first start found), the Native copy switch across
    launches, the sheet and Export a copy's share sheet."""
    s = 'storage'
    def res(ev, label):
        e = ev.last('js', label=label)
        return (e or {}).get('result')
    # An older build changes a value behind the copy (rule 4 at the next start): WebKit's file written with the app closed.
    mark = str(int(time.time()))
    ev = probe(c.sim, 'storage-seed', [[js('seed', "localStorage.setItem('kt_probe_pb', 'A ' + args.mark); return localStorage.getItem('kt_probe_pb');", mark=mark)]])
    c.rep.check(s, 'the page saved the value an older build will change', res(ev, 'seed') == 'A ' + mark, res(ev, 'seed'))
    c.sim.terminate()
    db = sqlite3.connect(webkit_file(c.sim))
    # ...and creates one the copy never held (its Put back is a removal, and the plan says so).
    for k, v in (('kt_probe_pb', 'B ' + mark), ('kt_probe_new', 'N ' + mark), ('kt_last_open', str(1700000000000 + int(mark)))):
        db.execute('INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)', (k, v.encode('utf-16-le')))
    db.commit()
    db.close()
    ev = probe(c.sim, 'storage-putback', [
        [
            js('status', "var st = await Capacitor.Plugins.TrovoStore.status(); switchTab('settings'); await new Promise(function (r) { setTimeout(r, 800); });"
                         " return {facade: st.facade, testKill: st.testKill, testKillFn: typeof Capacitor.Plugins.TrovoStore.testKill, line: _fpStoreLine(st),"
                         " row: (document.getElementById('fp-store-sub') || {}).textContent || null, rule: st.store && st.store.lastHello && st.store.lastHello.rule};"),
            js('putback', PAGE_H + " var r = await Capacitor.Plugins.TrovoStore.conflicts({limit: 400});"
                          " var p = r.rows.filter(function (x) { return x.key === 'kt_probe_pb' && x.why === 'older build'; })[0];"
                          " if (!p) return {error: 'no older-build conflict for kt_probe_pb'};"
                          " var n = r.rows.filter(function (x) { return x.key === 'kt_probe_new' && x.why === 'older build'; })[0];"
                          " var removal = n ? await Capacitor.Plugins.TrovoStore.putBack({conflicts: [n.id], preview: true}) : null;"
                          " var st = await Capacitor.Plugins.TrovoStore.status();"
                          " var prev = await Capacitor.Plugins.TrovoStore.putBack({conflicts: [p.id], preview: true});"
                          " sessionStorage.setItem('fp_pb_pick', JSON.stringify(p));"
                          " var staged = await Capacitor.Plugins.TrovoStore.putBack({conflicts: [p.id]});"
                          " return {pick: p, none: n || null, removal: removal, losses: st.store ? st.store.losses : undefined, preview: prev, staged: staged};"),
        ],
        [
            js('after', PAGE_H + " var p = JSON.parse(sessionStorage.getItem('fp_pb_pick') || 'null'); var st = await Capacitor.Plugins.TrovoStore.status();"
                        " var v = localStorage.getItem('kt_probe_pb');"
                        " return {pick: p, now: v == null ? null : H(v), value: v, lastPutBack: st.store.lastPutBack, line: _fpStoreLine(st)};"),
            state('put back'),
            js('arm', "return await Capacitor.Plugins.TrovoStore.testKill({arm: true, keys: ['kt_probe_quit']});"),
            js('other', "localStorage.setItem('kt_probe_other', 'x' + Date.now()); return 'still here';"),
            js('save', "localStorage.setItem('kt_probe_quit', 'quit ' + Date.now()); return 'saved';"),
            {'op': 'wait', 'ms': 4000},
        ],
    ], timeout=25, terminate=False)
    st0 = res(ev, 'status') or {}
    c.rep.check(s, 'the row reads the plugin\'s status (the start took over the older build\'s change)', st0.get('facade') == 'attached'
                and st0.get('rule') == 4 and str(st0.get('line', '')).startswith('In step') and st0.get('row') == st0.get('line'), st0)
    c.rep.check(s, 'a Debug build offers "Test: quit after next save" (status and method)', st0.get('testKill') is True and st0.get('testKillFn') == 'function', st0)
    pb = res(ev, 'putback') or {}
    c.rep.check(s, 'Put back previews the value, then stages it', (pb.get('preview') or {}).get('count') == 1 and (pb.get('staged') or {}).get('staged') is True, pb)
    none, removal = pb.get('none') or {}, pb.get('removal') or {}
    ritem = (removal.get('items') or [{}])[0]
    c.rep.check(s, 'a value the copy held as none previews as a removal (removes), its row names its start (boot)',
                none.get('units') is None and isinstance(none.get('boot'), int) and none.get('boot') == (pb.get('pick') or {}).get('boot')
                and removal.get('count') == 1 and ritem.get('outcome') == 'put back' and ritem.get('removes') is True, [none, removal])
    losses = pb.get('losses')
    in_losses = sorted({it.get('key') for g in (losses or []) for it in (g.get('items') or [])} & {'kt_probe_pb', 'kt_probe_new'})
    c.rep.check(s, 'the status carries the losses still open, and an older build\'s changes are not among them',
                isinstance(losses, list) and not in_losses, '%s loss(es)%s' % (len(losses) if isinstance(losses, list) else losses,
                                                                              ', listing %s' % in_losses if in_losses else ''))
    af = res(ev, 'after') or {}
    c.rep.check(s, 'the plugin reloaded the page and the facade wrote the kept value into WebKit', af.get('value') == 'A ' + mark
                and (af.get('lastPutBack') or {}).get('items', [{}])[0].get('outcome') == 'put back', af)
    c.in_step(s, 'put back', ev)
    c.rep.check(s, 'the test arms; a save it does not wait for leaves the app running', res(ev, 'arm') == {'armed': True} and res(ev, 'other') == 'still here',
                [res(ev, 'arm'), res(ev, 'other')])
    dead = False
    for _ in range(40):
        if ev.pid and not Sim.alive(ev.pid):
            dead = True
            break
        time.sleep(0.25)
    c.rep.check(s, 'the armed save ends the app', dead, ev.pid)
    ev = probe(c.sim, 'storage-reopen', [[
        js('reopen', "var st = await Capacitor.Plugins.TrovoStore.status(); return {tq: st.testQuit, armed: st.testQuitArmed,"
                     " text: st.testQuit ? _fpTestQuitLine(st.testQuit) : null};"),
        js('off', "return await Capacitor.Plugins.TrovoStore.setSwitch({on: false});"),
    ]])
    ro = res(ev, 'reopen') or {}
    tq = ro.get('tq') or {}
    c.rep.check(s, 'the next launch reports the test quit and what its first start found', tq.get('key') == 'kt_probe_quit'
                and isinstance(tq.get('after'), dict) and ro.get('armed') is False, ro)
    c.rep.fact(s, ro.get('text') or '-')
    c.rep.check(s, 'the Native copy switch goes off', res(ev, 'off') == {'on': False}, res(ev, 'off'))
    ev = probe(c.sim, 'storage-off', [[
        js('off', "var st = await Capacitor.Plugins.TrovoStore.status(); return {facade: st.facade, line: _fpStoreLine(st), mode: window.__ktStoreState && window.__ktStoreState.mode};"),
        js('on', "return await Capacitor.Plugins.TrovoStore.setSwitch({on: true});"),
    ]])
    off = res(ev, 'off') or {}
    c.rep.check(s, 'switched off: the next start runs without the facade and the row says why', off.get('facade') == 'off' and off.get('mode') == 'off'
                and 'switched off' in str(off.get('line')), off)
    shots = {}
    out = c.opts.out or tempfile.gettempdir()

    def during(evs):
        for label, wait, name in (('sheet', 0.8, 'storage-sheet'), ('export', 3.0, 'storage-export')):
            if label not in shots and evs.last('js', label=label):
                time.sleep(wait)
                shots[label] = os.path.join(out, '%s-%s.png' % (name, c.sim.runtime()[0]))
                c.sim.screenshot(shots[label])
    ev = probe(c.sim, 'storage-on', [[
        js('on', "var st = await Capacitor.Plugins.TrovoStore.status(); return {facade: st.facade, line: _fpStoreLine(st), mode: window.__ktStoreState && window.__ktStoreState.mode};"),
        js('sheet', "switchTab('settings'); openStorageSheet(); await new Promise(function (r) { setTimeout(r, 1500); });"
                    " var sh = document.querySelector('#fpStoreOverlay .kt-sheet'); if (sh) sh.scrollTop = sh.scrollHeight;"
                    " return document.getElementById('fpStoreBody').textContent;"),
        {'op': 'wait', 'ms': 2500},
        js('export', "Capacitor.Plugins.TrovoStore.exportCopy().then(function (r) { window.__exp = r; }, function (e) { window.__exp = {error: String(e && e.message || e)}; });"
                     " return 'presented';"),
        {'op': 'wait', 'ms': 6000},
    ]], timeout=40, during=during)
    on = res(ev, 'on') or {}
    c.rep.check(s, 'switched on again: attached and in step at the next start', on.get('facade') == 'attached' and on.get('mode') == 'shadow'
                and str(on.get('line', '')).startswith('In step'), on)
    tail = str(res(ev, 'sheet'))
    c.rep.check(s, 'the sheet offers Put back, the switch, Export a copy and the test', all(t in tail for t in ('Put back', 'Native copy', 'Export a copy', 'Test: quit after next save')), tail[-200:])
    c.rep.check(s, 'the sheet says Remove for the value the copy held as none, and leaves the bookkeeping out', 'Remove' in tail
                and 'kt_probe_new' in tail and 'Last visit' not in tail and 'Not listed:' in tail, tail[-300:])
    c.rep.fact(s, 'shots: %s' % ', '.join(sorted(shots.values())))


def scen_sweep(c):
    """SIGKILLs 0-50 ms after a burst of 100 page writes: every acknowledged write is in the store, what WebKit lost is
    reported as would-repair with the right keys, and the store never writes WebKit. When none of the scheduled kills
    makes WebKit lose anything, more kills follow (0-30 ms after a bigger burst) until one does, so the loss path is
    shown on every run."""
    s = 'sweep'
    n = c.opts.sweep
    stats = {'lost_trials': 0, 'lost': 0, 'mid_op': 0, 'kills': 0}

    def trial(t, T, chars):
        tag = 'k%02d-%d' % (t, int(time.time() * 1000) % 100000)
        ev = probe(c.sim, 'kill-%02d' % t, [[js('burst', burst_js(), n=100, tag=tag, chars=chars), {'op': 'sigkill', 'afterMs': T}]],
                   until='sigkill', timeout=120)
        r = (ev.first('js', label='burst') or {}).get('result') or {}
        if not ev.first('sigkill'):
            return c.rep.check(s, 'kill %02d ran' % t, False, 'no sigkill event (%s)' % ev.tag)
        for _ in range(60):
            if not Sim.alive(ev.pid):
                break
            time.sleep(0.1)
        time.sleep(1.0)
        stats['kills'] += 1
        acked = r.get('acked', 0)
        st, wk = store_read(c.sim), webkit_values(c.sim) or {}
        value = lambda i: '%s:%d:%s' % (tag, i, 'y' * chars)
        missing = [i for i in range(100) if st['kv'].get('kt_probe_b%d' % i) != value(i)]
        store_live = live(st['kv'])
        lost = sorted(k for k in set(store_live) | set(wk) if not reserved(k) and store_live.get(k) != wk.get(k))
        ok = c.rep.check(s, 'kill %02d at +%d ms (%d-char values): all %d acknowledged writes are in the store' % (t, T, chars, acked),
                         acked == 100 and not missing and r.get('fallbacks') == 0,
                         'missing %s' % missing[:5] if missing else 'burst %.1f ms, WebKit lost %d' % (r.get('ms', 0), len(lost)))
        before = {k: v for k, v in wk.items() if not reserved(k)}
        rep = probe(c.sim, 'kill-%02d-report' % t, [[state('report')]], args=['-fpIgnoreMarker'])
        launch, h = rep.first('launch') or {}, c.hello(rep) or {}
        last = h.get('lastHello') or {}
        if launch.get('markerFound'):
            stats['mid_op'] += 1
        if lost:
            stats['lost_trials'] += 1
            stats['lost'] += len(lost)
            named = sorted(last.get('wouldRepair') or [])
            c.rep.check(s, 'kill %02d: WebKit lost %d writes; they show as would-repair (rule 6) with the right keys' % (t, len(lost)),
                        last.get('rule') == 6 and named == lost[:50], '%s, would repair %s' % (last.get('label'), named[:4]))
            # Storage's one Put back for that start: a loss naming every burst key WebKit lost (keys the report launch
            # wrote since, such as kt_last_open, are no longer the loss's to put back).
            losses = (((rep.state('report') or {}).get('status') or {}).get('store') or {}).get('losses') or []
            mine = [g for g in losses if g.get('boot') == last.get('boot')]
            burst = [k for k in lost if k.startswith('kt_probe_b')]
            items = sorted(it.get('key') for it in (mine[0].get('items') or [])) if mine else []
            c.rep.check(s, 'kill %02d: that start is one loss to put back, naming the %d burst keys WebKit lost' % (t, len(burst)),
                        len(mine) == 1 and mine[0].get('why') == 'lag' and set(burst) <= set(items)
                        and len(mine[0].get('ids') or []) == len(lost),
                        '%d loss(es) for boot %s, %d of %d keys open' % (len(mine), last.get('boot'), len(items), len(lost)))
        else:
            c.rep.check(s, 'kill %02d: WebKit kept everything; the next start is in step' % t, last.get('rule') == 0, last.get('label'))
        # The report launch's page writes its own keys (kt_last_open, ...); every burst key WebKit held before it, and
        # every key it had lost, must be as it was: the store never wrote WebKit.
        wk2 = webkit_values(c.sim) or {}
        keep = [k for k in before if k.startswith('kt_probe_b')] + [k for k in lost if k in before]
        c.rep.check(s, 'kill %02d: the store never wrote WebKit' % t, all(wk2.get(k) == before[k] for k in keep)
                    and not [k for k in lost if k not in before and k in wk2], '%d keys compared' % len(keep))
        c.in_step(s, 'report', rep, 'kill %02d report' % t)
        return ok

    for t in range(n):
        if not trial(t, round(t * 50 / max(n - 1, 1)), BURST_CHARS[0]):
            break
    scheduled = dict(stats)
    if stats['lost_trials'] == 0 and c.opts.sweep_extra > 0:
        for t in range(n, n + c.opts.sweep_extra):
            if not trial(t, (t * 7) % 31, 16000) or stats['lost_trials']:
                break
    c.rep.fact(s, '%d kills 0-50 ms after a 100-write burst: WebKit lost writes in %d (%d keys); %d more kills 0-30 ms after a '
                  '16000-char burst until a loss: %d lost writes in %d; %d kills landed inside a store operation (marker seen, '
                  'ignored for the report launch)' % (n, scheduled['lost_trials'], scheduled['lost'], stats['kills'] - scheduled['kills'],
                                                      stats['lost'] - scheduled['lost'], stats['lost_trials'] - scheduled['lost_trials'],
                                                      stats['mid_op']))


# ── the 59 <-> 60 drill ───────────────────────────────────────────────────────────────────────────────────────────

def drill59(c, name, src, **args):
    """Runs one drill step in build 59 (its Debug hook evaluates the file's JS once the page has painted)."""
    RUNS[0] += 1
    tag = '%02d-59-%s' % (RUNS[0], name)
    pdir = c.sim.path('Documents', 'fp-probe')
    os.makedirs(pdir, exist_ok=True)
    body = 'var args = %s;\n%s' % (json.dumps(args), src)
    with open(os.path.join(pdir, tag + '.js'), 'w') as f:
        f.write(body)
    logp = os.path.join(pdir, 'drill59.jsonl')
    if os.path.exists(logp):
        os.remove(logp)
    c.sim.terminate()
    c.sim.launch(['-fpDrill', tag + '.js'])
    for _ in range(240):
        time.sleep(0.25)
        ev = read_log(logp)
        if ev.first('done'):
            break
    c.sim.terminate()
    d = ev.first('drill') or {}
    return d.get('result')


CONFIRM_JS = r"""
var sheets = document.querySelectorAll('.kt-close-sheet'), s = sheets[sheets.length - 1], b = s && s.querySelector('button[id$="ok"]');
if (!b) return { error: 'no confirm sheet' };
b.click();
"""


def scen_drill(c):
    s = 'drill'
    if not c.opts.app59:
        c.rep.fact(s, 'skipped: no --downgrade build of 59')
        return
    seed = seed_values()
    rounds = [
        ('reset', 'Reset programme (and its Clear chat)', "resetCustomRoutine();" + CONFIRM_JS +
         " return { routine: hasCustomRoutine(), msgs: localStorage.getItem('kt_coach_msgs') };",
         ['kt_routine', 'kt_coach_msgs']),
        ('newprog', 'Start new programme', "startNewProgramme();" + CONFIRM_JS +
         " return { routine: hasCustomRoutine(), next: localStorage.getItem('kt_routine_next'), intro: localStorage.getItem('kt_round_intro') };",
         ['kt_routine', 'kt_routine_next', 'kt_round_intro', 'kt_coach_msgs']),
        ('sparse', 'a sparse REPLACE restore', "var d = buildBackupJSON(); var sp = { _manifest: d._manifest, kt_sessions: d.kt_sessions, kt_week: d.kt_week };"
         " var ok = _applyImportedData(sp); return { ok: ok, keys: Object.keys(sp) };",
         ['kt_routine', 'kt_runs', 'kt_bw', 'kt_coach_msgs', 'kt_hk_imported', 'kt_hk_last_sync', 'kt_routine_backup', 'kt_routine_archive']),
        # The iCloud copy is the auto-backup's JSON text after _sanitizeForICloud (which drops the Health ledger);
        # restoring it parses that file and applies it.
        ('icloud', 'a restore of the iCloud copy', "var c = JSON.parse(_sanitizeForICloud(JSON.stringify(buildBackupJSON())));"
         " var ok = _applyImportedData(c); return { ok: ok, hasHk: c.kt_hk_imported !== undefined };",
         ['kt_hk_imported', 'kt_hk_last_sync']),
    ]
    for key, what, src, gone in rounds:
        # 60: seed through the facade (the store holds every key)
        ev = probe(c.sim, 'drill-%s-seed' % key, [[js('seed', SEED_JS, seed=seed)]])
        r = (ev.first('js') or {}).get('result') or {}
        c.sim.terminate()
        st = store_read(c.sim)
        held = [k for k in gone if st['kv'].get(k) is not None]
        c.rep.check(s, '%s: 60 holds the keys first' % key, r.get('mode') == 'shadow' and len(held) == len(gone), held)
        # 59: the change, on WebKit alone
        c.sim.install(c.opts.app59)
        res = drill59(c, key, src)
        wk59 = webkit_values(c.sim) or {}
        deleted = [k for k in gone if k not in wk59]
        c.rep.check(s, '%s on 59 deleted %s' % (what, deleted), sorted(deleted) == sorted(gone), res)
        # 60 again: nothing comes back
        c.sim.install(c.opts.app)
        ev = probe(c.sim, 'drill-%s-back' % key, [[state('back on 60'), {'op': 'conflicts'}]])
        last = (c.hello(ev) or {}).get('lastHello') or {}
        c.sim.terminate()
        st, wk = store_read(c.sim), webkit_values(c.sim) or {}
        back = [k for k in gone if wk.get(k) is not None or st['kv'].get(k) is not None]
        tomb = [k for k in gone if k in st['kv'] and st['kv'][k] is None]
        older = (last.get('adopted') or {}).get('older build', [])
        c.rep.check(s, '%s: back on 60 the witness is unknown (rule 4) and the deletions are adopted' % key,
                    last.get('rule') == 4 and all(k in older for k in gone), '%s, adopted %d keys' % (last.get('label'), len(older)))
        c.rep.check(s, '%s: nothing comes back (WebKit and the store), tombstones kept' % key, not back and sorted(tomb) == sorted(gone), 'back %s, tombstones %s' % (back, tomb))
        given = [r for r in (ev.first('conflicts') or {}).get('rows') or [] if r.get('why') == 'older build' and r.get('key') in gone]
        c.rep.check(s, '%s: the values 59 deleted are kept for Put back ("older build")' % key, len({r['key'] for r in given}) == len(gone), [r['key'] for r in given][:8])
        c.in_step(s, 'back on 60', ev, '%s back on 60' % key)


# ── main ──────────────────────────────────────────────────────────────────────────────────────────────────────────

ALL = ['fresh', 'migration', 'hidden', 'background', 'wckill', 'nofacade', 'nowk', 'race', 'policy', 'breaker', 'marker',
       'proxy', 'scene', 'ota', 'wiped', 'storage', 'sweep', 'drill']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--phone', required=True)
    ap.add_argument('--app', required=True)
    ap.add_argument('--app59')
    ap.add_argument('--shell', default='60')
    ap.add_argument('--only', default='')
    ap.add_argument('--sweep', type=int, default=24)
    ap.add_argument('--burst-chars', type=int, default=4000)
    ap.add_argument('--sweep-extra', type=int, default=30)
    ap.add_argument('--ota-build', default='20261011-99')
    ap.add_argument('--out')
    opts = ap.parse_args()
    BURST_CHARS[0] = opts.burst_chars
    sim = Sim(opts.phone)
    sim.boot()
    rt, name = sim.runtime()
    rep = Report('%s %s' % (name, rt))
    print('== native store scenarios on %s (%s, %s)' % (name, rt, opts.phone), flush=True)
    c = Ctx(sim, rep, opts)
    only = [x for x in opts.only.split(',') if x]
    run = only or ALL
    if 'fresh' not in run and 'migration' not in run:
        # An update install of the app under test over what the phone holds (its data is kept).
        sim.install(opts.app)
        c.page = None
    t0 = time.time()
    for scen in ALL:
        if scen not in run:
            continue
        print('-- %s' % scen, flush=True)
        try:
            if c.page is None and scen not in ('fresh', 'migration'):
                ev = probe(sim, 'page', [[{'op': 'status'}]])
                c.page = (ev.first('launch') or {}).get('page')
            globals()['scen_' + scen](c)
        except Exception as e:  # a scenario that breaks is a failure, the next one still runs
            import traceback
            traceback.print_exc()
            rep.check(scen, 'ran to the end', False, repr(e)[:300])
    if c.boot_ms:
        # The facade's own boot (its manifest, hello, the put when the store asked for values, Put back), as the
        # store-first probe measured it; WebKit's load of the storage area at the document's first read happens just
        # before it (the probe's document-start read, a cost the page pays at its own first read without the facade).
        worst = max(c.boot_ms, key=lambda x: x[1])
        boots = sorted(b for _, b, _ in c.boot_ms)
        wks = sorted(w for _, _, w in c.boot_ms if isinstance(w, (int, float)))
        rep.check('boot', 'facade boot under 50 ms in every attached launch', worst[1] < 50,
                  'max %.1f ms (%s), median %.1f ms over %d launches; WebKit\'s own first storage read before it: max %s ms, median %s ms'
                  % (worst[1], worst[0], boots[len(boots) // 2], len(boots), '%.1f' % wks[-1] if wks else '-', '%.1f' % wks[len(wks) // 2] if wks else '-'))
    if c.cap_http:
        rep.check('capacitor', 'CapacitorHttp patched in every launch', all(v for _, v in c.cap_http), [s for s, v in c.cap_http if not v])
    if c.alerts:
        rep.check('alert', 'no alert on screen in any state check (no KT1 prompt shown as an alert)', not any(v for _, v in c.alerts), [s for s, v in c.alerts if v])
    sim.screenshot(os.path.join(opts.out or tempfile.gettempdir(), 'native-store-%s.png' % rt))
    print('== %s: %d checks, %d failed, %.0f s' % (rep.label, len(rep.rows), len(rep.failed), time.time() - t0), flush=True)
    for scen, name, ok, detail in rep.failed:
        print('   FAILED [%s] %s -- %s' % (scen, name, detail))
    sys.exit(1 if rep.failed else 0)


if __name__ == '__main__':
    main()
