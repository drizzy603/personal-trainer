// 120: writes through the shipped facade (plan task S4), whatever STORE says. WebKit is always written first and
// a native answer other than ok never reaches the page; the gap note is written op by op exactly as
// tests/tools/ktstore-vectors.js noteAfter() builds it (the vectors FPStore's Swift tests read); a `full` on a
// repeated delete, then a relaunch, rewrites nothing; the watch drain re-sends kt_sessions to the store before it
// clears the wrist's queue, and never keeps a saved entry; a finish WebKit lost goes back through the page's own
// Storage sheet (a TrovoStore plugin over the mock) in one Put back, the draft's removal with it; and with the shell's
// flag a draft whose workout is already filed is dropped at boot, so it is never resumed and filed twice.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { boot, assert, run, SEED } = require('../lib/harness');
const { NOTE_OPS, noteAfter, noteSteps } = require('../tools/ktstore-vectors');

// One case at a time: each starts its own browser and some relaunch it.
let _chain = Promise.resolve();
function serial(name, fn) {
  const prev = _chain;
  let done;
  _chain = new Promise((r) => { done = r; });
  run(name, async () => { await prev; try { await fn(); } finally { done(); } });
}
const start = (opts) => boot(Object.assign({ store: 'shadow' }, opts || {}));
const ev = (app, fn, arg) => app.page.evaluate(fn, arg);
const check = (app) => ev(app, () => __ktMock.check());

serial('a native full, busy, err or no answer is invisible to the page; the gap note names the key and the post lands', async () => {
  const app = await start();
  try {
    for (const answer of ['full', 'busy', 'err', null]) {
      const out = await ev(app, (answer) => {
        const st = __ktStoreState, real = __ktMock.realStorage();
        __ktMock.device({ hold: true });
        __ktMock.fail({ op: 'w', key: 'kt_bw', answer: answer, times: 1 });
        const fails0 = _lsFailCount, fb0 = st.fallbacks, posts0 = __ktMock.posts.length;
        const bw = getBodyWeights().slice();
        bw.unshift({ id: Date.now(), date: todayISO(), weight: 181.5 });
        const t0 = performance.now();
        const ok = lsSet('kt_bw', bw);
        const ms = performance.now() - t0;
        const value = real.getItem('kt_bw');
        const note = JSON.parse(real.getItem('kt__store_gap'));
        const post = __ktMock.posts[__ktMock.posts.length - 1];
        const r = {
          ok, ms, fails: _lsFailCount - fails0, fallbacks: st.fallbacks - fb0, posts: __ktMock.posts.length - posts0,
          reads: getBodyWeights()[0].weight, wk: value === JSON.stringify(bw), storeHad: __ktMock.values().kt_bw === value,
          toast: (document.getElementById('toast') || {}).textContent || '', acked: st.acked('kt_bw'),
          noteKey: note && note.k.kt_bw === __ktMock.H(value), noteStamp: note && note.s.kt_bw === st.boot + ':' + st.seq,
          postHead: post && post.head === 'w ' + st.boot + ':' + st.seq, counted: answer == null ? st.none : st[answer],
        };
        r.results = __ktMock.deliver();
        r.landed = __ktMock.values().kt_bw === value;
        __ktMock.device({ hold: false });
        return r;
      }, answer);
      const a = String(answer);
      assert(out.ok === true && out.fails === 0 && out.reads === 181.5 && out.wk, a + ': lsSet returns true, the page reads its write: ' + JSON.stringify(out));
      assert(!/Couldn.t save/.test(out.toast), a + ': no save-failure toast: ' + out.toast);
      assert(out.fallbacks === 1 && out.posts === 1 && out.postHead && out.counted >= 1, a + ': one fallback and one async post with (boot, seq): ' + JSON.stringify(out));
      assert(!out.storeHad && !out.acked, a + ': the store missed it, and acked() says so');
      assert(out.noteKey && out.noteStamp, a + ': the gap note names the key, WebKit\'s hash after the op and the op\'s stamp');
      assert(JSON.stringify(out.results) === '["applied"]' && out.landed, a + ': the post lands: ' + JSON.stringify(out.results));
    }
    // A later ok write is acked again, and a post older than it never overwrites it.
    const later = await ev(app, () => {
      const st = __ktStoreState;
      __ktMock.device({ hold: true });
      __ktMock.fail({ op: 'w', key: 'kt_bw_goal', answer: 'full', times: 1 });
      localStorage.setItem('kt_bw_goal', '170');
      const acked1 = st.acked('kt_bw_goal');
      localStorage.setItem('kt_bw_goal', '168');
      const acked2 = st.acked('kt_bw_goal');
      const res = __ktMock.deliver();
      __ktMock.device({ hold: false });
      return { acked1, acked2, res, store: __ktMock.values().kt_bw_goal };
    });
    assert(!later.acked1 && later.acked2 && JSON.stringify(later.res) === '["stale"]' && later.store === '168', 'acked after a later ok write; the older post is stale: ' + JSON.stringify(later));
    // WebKit itself failing still reaches the page (lsSet's false and rollback), and nothing is sent.
    const wkFull = await ev(app, () => {
      const orig = Storage.prototype.setItem, n0 = __ktMock.log.length;
      Storage.prototype.setItem = function (k, v) { if (k === 'kt_5k_goal') { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, k, v); };
      let ok;
      try { ok = lsSet('kt_5k_goal', 1400); } finally { Storage.prototype.setItem = orig; }
      return { ok, sent: __ktMock.log.slice(n0).filter((e) => e.payload && e.payload.indexOf('kt_5k_goal') >= 0).length, wk: localStorage.getItem('kt_5k_goal'), store: __ktMock.values().kt_5k_goal, cache: lsGet('kt_5k_goal') };
    });
    assert(wkFull.ok === false && wkFull.sent === 0 && wkFull.wk === wkFull.store && String(wkFull.cache) === wkFull.wk, 'WebKit first: its failure is the page\'s, nothing mirrored: ' + JSON.stringify(wkFull));
    assert((await check(app)).ok, 'store == WebKit == page reads');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

serial('the gap note, op by op, is exactly what ktstore-vectors.js noteAfter() builds (the vectors FPStore\'s Swift tests read)', async () => {
  // A bare document with only the shell's scripts, so its first op is seq 1, at boot 7 as the vectors are made.
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('**/*', (route) => (route.request().url().startsWith('http://ktstore.test/')
      ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>facade</title>' }) : route.abort()));
    const root = path.resolve(__dirname, '..', '..');
    await page.addInitScript({ content: fs.readFileSync(path.join(__dirname, '..', 'lib', 'ktstore-mock.js'), 'utf8') });
    await page.addInitScript({ content: fs.readFileSync(path.join(root, 'ios/App/FPKit/Sources/FPStore/Resources/ktstore.js'), 'utf8') });
    await page.addInitScript({ content: 'window.__ktMock && window.__ktMock._afterFacade();' });
    await page.goto('http://ktstore.test/');
    await page.evaluate(() => __ktMock.setBoot(6));
    await page.reload();
    const out = await page.evaluate((OPS) => {
      const real = __ktMock.realStorage(), notes = [];
      __ktMock.device({ hold: true });
      __ktMock.fail({ answer: null, times: OPS.length });   // no mirror is answered
      const boot = __ktStoreState.boot, seq0 = __ktStoreState.seq;
      OPS.forEach((op, i) => {
        Date.now = () => 1760140001000 + i;
        if (op[0] === 'w') localStorage.setItem(op[1], op[2]); else if (op[0] === 'd') localStorage.removeItem(op[1]); else localStorage.clear();
        notes.push(real.getItem('kt__store_gap'));
      });
      const heads = __ktMock.posts.map((p) => p.head);
      const results = __ktMock.deliver();
      return { boot, seq0, notes, heads, results, check: __ktMock.check(), none: __ktStoreState.none };
    }, NOTE_OPS);
    assert(out.boot === 7 && out.seq0 === 0, 'boot 7, no op before: ' + out.boot + ' ' + out.seq0);
    out.notes.forEach((n, i) => assert(n === noteSteps[i].note, 'step ' + (i + 1) + ' (' + noteSteps[i].op + '): ' + n + ' vs ' + noteSteps[i].note));
    // and noteAfter() itself, from the facade's own previous note
    let prev = null;
    NOTE_OPS.forEach((op, i) => { const want = noteAfter(prev, op, 7, i + 1, 1760140001000 + i); assert(out.notes[i] === want, 'noteAfter step ' + (i + 1)); prev = want; });
    assert(JSON.stringify(out.heads) === JSON.stringify(['w 7:1', 'd 7:2', 'w 7:3', 'c 7:4', 'w 7:5', 'w 7:6', 'd 7:7']), 'one post per op, with (boot, seq): ' + out.heads);
    assert(out.results.every((r) => r === 'applied') && out.none === 7, 'every post applies in order: ' + out.results);
    assert(out.check.ok, 'then the store equals WebKit: ' + JSON.stringify(out.check));
  } finally { await browser.close(); }
});

// A finished session, deleted, brought back with Undo and deleted again: the second delete writes the same
// kt_sessions as the first. Its mirror is answered full and the post dies with the app.
async function reDelete(app) {
  return ev(app, () => {
    const s = getSessions().slice();
    const id = Date.now();
    s.unshift({ id, date: todayISO(), type: 'Push', week: currentWeek, exercises: [{ name: 'Barbell Bench Press', isMain: true, sets: 1, reps: [5], weight: 185, weightLog: [185], rpe: 8 }], prs: [] });
    lsSet('kt_sessions', s);
    deleteSession(id);
    const afterDelete = localStorage.getItem('kt_sessions');
    _toastUndo();
    const afterUndo = localStorage.getItem('kt_sessions');
    __ktMock.device({ hold: true });
    __ktMock.fail({ op: 'w', key: 'kt_sessions', answer: 'full', times: 1 });
    deleteSession(id);
    return { id, afterDelete, afterUndo, again: localStorage.getItem('kt_sessions'), store: __ktMock.values().kt_sessions, held: __ktMock.posts.length };
  });
}

serial('a full on the re-delete, then a relaunch: the gap note says why, the deletion stays, nothing is rewritten', async () => {
  const app = await start();
  try {
    await ev(app, () => __ktMock.device({ seed: false }));
    await app.reload();
    const r = await reDelete(app);
    assert(r.again === r.afterDelete && r.store === r.afterUndo && r.afterUndo !== r.afterDelete, 'the same kt_sessions twice; the store still holds the Undo: ' + JSON.stringify({ same: r.again === r.afterDelete, store: r.store === r.afterUndo }));
    await ev(app, () => __ktMock.device({ hold: false }));
    await app.reload();   // the held post is lost with the app
    const out = await ev(app, (id) => {
      const h = __ktMock.log.filter((e) => e.head === 'hello')[0], a = JSON.parse(h.answer);
      const before = __ktMock.wkBefore, after = __ktMock.wkAfter;
      const wrote = Object.keys(Object.assign({}, before, after)).filter((k) => before[k] !== after[k]);
      return { rule: a.rule, label: a.label, need: a.need, wrote, wk: localStorage.getItem('kt_sessions'), store: __ktMock.values().kt_sessions,
        gone: !getSessions().some((s) => s.id === id), conflicts: __ktMock.conflicts().filter((c) => c.key === 'kt_sessions').length,
        wouldRepair: __ktMock.status().lastHello.wouldRepair, note: localStorage.getItem('kt__store_gap') };
    }, r.id);
    assert(out.rule === 5 && out.label === 'gap' && JSON.stringify(out.need) === '["kt_sessions"]', 'rule 5: the note explains it: ' + JSON.stringify(out));
    assert(JSON.stringify(out.wrote) === '["kt__store_gap"]', 'nothing rewritten in WebKit (only the facade\'s own note dropped): ' + out.wrote);
    assert(out.wk === r.afterDelete && out.store === r.afterDelete && out.gone, 'the deletion stays deleted in both copies and on screen');
    assert(out.conflicts === 0 && out.wouldRepair.length === 0 && out.note === null, 'a missed write\'s stale value is not offered back: ' + JSON.stringify(out));
    assert((await check(app)).ok, 'store == WebKit');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

serial('the same re-delete with its gap note lost too: miscounted at worst, and still nothing is rewritten', async () => {
  const app = await start();
  try {
    await ev(app, () => __ktMock.device({ seed: false }));
    await app.reload();
    const r = await reDelete(app);
    await ev(app, () => { __ktMock.device({ hold: false }); __ktMock.next({ plant: { kt__store_gap: null } }); });
    await app.reload();
    const out = await ev(app, (id) => {
      const a = JSON.parse(__ktMock.log.filter((e) => e.head === 'hello')[0].answer);
      const before = __ktMock.wkBefore, after = __ktMock.wkAfter;
      const c = __ktMock.conflicts().filter((x) => x.key === 'kt_sessions')[0];
      return { rule: a.rule, wrote: Object.keys(Object.assign({}, before, after)).filter((k) => before[k] !== after[k]), wk: localStorage.getItem('kt_sessions'),
        store: __ktMock.values().kt_sessions, gone: !getSessions().some((s) => s.id === id), why: c && c.why, kept: c ? __ktMock.conflictValue(c.id) : null };
    }, r.id);
    // The residual decision.md names: without its note the missed write cannot be told from a loss (lag, or
    // unexplained once the departure stamp landed after it). Build 60 only counts it, and Put back names the
    // value it would bring back.
    assert((out.rule === 6 || out.rule === 7) && (out.why === 'lag' || out.why === 'unexplained') && out.kept === r.afterUndo, 'counted, the Undo\'s value kept for Put back: ' + JSON.stringify({ rule: out.rule, why: out.why }));
    assert(out.wrote.length === 0 && out.wk === r.afterDelete && out.store === r.afterDelete && out.gone, 'observe mode: WebKit untouched, the session stays deleted: ' + JSON.stringify(out.wrote));
    assert((await check(app)).ok, 'store == WebKit');
  } finally { await app.close(); }
});

const todayLocal = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const wristPayload = () => JSON.stringify({ dayName: 'Push', slot: 'Push', startedAt: todayLocal() + 'T09:00:00', loggedAt: todayLocal() + 'T10:00:00',
  exercises: [{ name: 'Barbell Bench Press', reps: [8, 8, 8], weight: 145 }] });
// Runs one drain. fail: the store answers full to every write of kt_sessions (the save, and the page's own
// re-save of its working-weight stamp); recover: it takes writes again by the time the drain re-sends. Reports
// what the store held when the wrist's queue was cleared.
const DRAIN = ({ fail, recover }) => {
  const tw = window.Capacitor.Plugins.TrovoWatch, real = window.__ktMock ? __ktMock.realStorage() : localStorage;
  const seen = [], st = window.__ktStoreState;
  const orig = tw.clearPendingSessions;
  tw.clearPendingSessions = (a) => { seen.push({ n: (a && a.sessions || []).length, store: window.__ktMock ? __ktMock.values().kt_sessions || null : null, wk: real.getItem('kt_sessions') }); return orig(a); };
  let resent = 0, origRemirror = null;
  if (st) {
    origRemirror = st.remirror;
    st.remirror = function (k) { resent++; if (recover) __ktMock.clearFails(); return origRemirror.call(st, k); };
  }
  if (window.__ktMock) { __ktMock.device({ hold: true }); if (fail) __ktMock.fail({ op: 'w', key: 'kt_sessions', answer: 'full', times: 99 }); }
  const log0 = window.__ktMock ? __ktMock.log.length : 0;
  window.__mock.pending = [window.__payload];
  return drainWatchSessions().then(() => {
    const ops = window.__ktMock ? __ktMock.log.slice(log0).filter((e) => e.head.charAt(0) === 'w' && e.payload.indexOf('"kt_sessions"') === 0).map((e) => e.answer) : [];
    tw.clearPendingSessions = orig;
    if (st) st.remirror = origRemirror;
    if (window.__ktMock) { __ktMock.clearFails(); __ktMock.device({ hold: false }); }
    const saved = getSessions().filter((s) => s.note === 'From Apple Watch');
    return { seen, ops, resent, saved: saved.length, pending: window.__mock.pending.length, wk: real.getItem('kt_sessions'),
      note: window.__ktMock ? JSON.parse(real.getItem('kt__store_gap') || 'null') : null, log: localStorage.getItem('kt_wch_log') || '',
      state: typeof window.__ktStoreState };
  });
};

serial('the watch drain re-sends kt_sessions before it clears the wrist\'s queue, and never keeps a saved entry', async () => {
  const app = await start({ native: true, seed: { kt_sessions: '[]' } });
  try {
    await ev(app, (p) => { window.__payload = p; }, wristPayload());
    // Every page write of the log is answered full; the re-send is taken: the store has the session when the queue clears.
    const a = await ev(app, DRAIN, { fail: true, recover: true });
    const aFull = a.ops.slice(0, -1);
    assert(a.resent === 1 && aFull.length >= 1 && aFull.every((x) => x === 'full') && a.ops[a.ops.length - 1] === 'ok', 'the saves, then one re-send: ' + JSON.stringify(a.ops));
    assert(a.seen.length === 1 && a.seen[0].n === 1 && a.seen[0].store === a.seen[0].wk && a.seen[0].wk === a.wk, 'the store held the drained session before clearPendingSessions: ' + JSON.stringify(a.seen.map((s) => [s.n, s.store === s.wk])));
    assert(a.saved === 1 && a.pending === 0 && /store copy re-sent/.test(a.log), 'saved, cleared, logged: ' + JSON.stringify({ saved: a.saved, pending: a.pending }));
    await ev(app, () => __ktMock.dropPosts());
    // The store still cannot take it: the queue is cleared all the same (a kept entry brings back a deleted session).
    await ev(app, () => lsSet('kt_sessions', []));
    const b = await ev(app, DRAIN, { fail: true, recover: false });
    assert(b.resent === 1 && b.ops.length >= 2 && b.ops.every((x) => x === 'full'), 'one re-send, no more: ' + JSON.stringify(b.ops));
    assert(b.seen.length === 1 && b.seen[0].n === 1 && b.pending === 0 && b.saved === 1, 'never keeps a saved entry: ' + JSON.stringify({ seen: b.seen.length, pending: b.pending, saved: b.saved }));
    const hashNow = await ev(app, () => __ktMock.H(__ktMock.realStorage().getItem('kt_sessions')));
    assert(b.seen[0].store !== b.wk && b.note && b.note.k.kt_sessions === hashNow && /store copy still missing/.test(b.log),
      'the store missed it, and the gap note says so for the next start: ' + JSON.stringify(b.note));
    await ev(app, () => __ktMock.deliver());
    // The store took the saves: nothing re-sent.
    await ev(app, () => lsSet('kt_sessions', []));
    const c = await ev(app, DRAIN, { fail: false });
    assert(c.resent === 0 && c.ops.length >= 1 && c.ops.every((x) => x === 'ok') && c.pending === 0 && c.saved === 1, 'acked: nothing re-sent: ' + JSON.stringify(c));
    assert((await check(app)).ok, 'store == WebKit');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

serial('without the shell flag the drain is the drain it was: no store, the queue cleared after the save', async () => {
  const app = await boot({ native: true, store: 'classic', seed: { kt_sessions: '[]' } });
  try {
    await ev(app, (p) => { window.__payload = p; }, wristPayload());
    const out = await ev(app, DRAIN, { fail: false });
    assert(out.state === 'undefined' && out.resent === 0 && out.saved === 1 && out.pending === 0 && out.seen.length === 1 && out.seen[0].n === 1, 'classic drain: ' + JSON.stringify(out));
    assert(!/store copy/.test(out.log), 'no store line in the watch log');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

// The shell's flag and a TrovoStore plugin over the mock, as StoreAttach serves Settings > About > Storage: status
// with the losses resolved, conflicts, Put back previewed or staged (the shell then reloads; specs reload themselves).
function storageShell() {
  return '(' + function () {
    var P = window.Capacitor && window.Capacitor.Plugins, M = window.__ktMock;
    window.__FP_SHELL = { v: 1, min: 1, shell: '60', screens: [] };
    window.__pb = [];
    if (!P || !M) return;
    P.TrovoStore = {
      status: function () {
        var st = window.__ktStoreState || {};
        return Promise.resolve({ shell: '60', facade: st.mode === 'shadow' ? 'attached' : 'off', why: st.why || null, document: { attached: st.mode === 'shadow' },
          deviceSwitchOn: true, counters: {}, crashVerdicts: [], breakerTrips: 0, store: M.status(true), testKill: false });
      },
      conflicts: function (o) { return Promise.resolve({ rows: M.conflicts((o && o.limit) || 100) }); },
      putBack: function (o) {
        window.__pb.push(o);
        var intent = { conflicts: (o.conflicts || []).slice() }, plan = o.preview ? M.previewPutBack(intent) : M.stagePutBack(intent);
        return Promise.resolve({ items: plan.items, count: plan.count, staged: !o.preview && plan.count > 0 });
      },
      setSwitch: function (o) { return Promise.resolve({ on: !!o.on }); },
      exportCopy: function () { return Promise.resolve({ shared: false }); },
    };
  } + ')();';
}
// The local calendar day n days from today, as the page's todayISO() spells it (node and the browser share a zone).
function addDaysISO(n) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
// A Push workout under way (two sets, its draft flushed), then finished: WebKit as it was before the finish, and the
// workout's startedAt.
const FINISH = () => {
  openDeckRunner('Push');
  runnerCompleteSet(); runnerCompleteSet();
  _flushRunnerDraft();
  const before = __ktMock.wk(), startedAt = runnerSession.startedAt;
  runnerFinishSession();
  const s = getSessions().filter((x) => Number(x.startedAt) === startedAt);
  return { before, startedAt, filed: s.length, draft: localStorage.getItem('kt_runner_draft') };
};

serial('a finish WebKit lost: one Put back of everything that start lost brings it all back in one reload, the draft\'s removal with it', async () => {
  const app = await start({ native: true, init: storageShell() });
  try {
    await ev(app, () => __ktMock.device({ seed: false }));
    await app.reload();
    const f = await ev(app, FINISH);
    assert(f.filed === 1 && f.draft === null && /kt_runner_draft/.test(Object.keys(f.before).join(' ')), 'filed once, the draft removed: ' + JSON.stringify({ filed: f.filed, draft: f.draft }));
    await app.page.waitForTimeout(150);
    // A hard kill right after the finish: WebKit lost it all, the copy kept it (rule 6).
    await ev(app, (J) => __ktMock.next({ restore: J }), f.before);
    await app.reload();
    const lost = await ev(app, (t) => ({ rule: __ktStoreState.rule, losses: __ktMock.status(true).losses, banner: !!(runnerResumePending && runnerSession),
      filed: getSessions().filter((x) => Number(x.startedAt) === t).length }), f.startedAt);
    assert(lost.rule === 6 && lost.filed === 0 && lost.banner, 'WebKit lost the finish, the draft is offered as it holds it: ' + JSON.stringify({ rule: lost.rule, filed: lost.filed, banner: lost.banner }));
    assert(lost.losses.length === 1, 'one loss: ' + JSON.stringify(lost.losses));
    const items = {}; lost.losses[0].items.forEach((it) => { items[it.key] = it; });
    assert(items.kt_sessions && items.kt_sessions.added === 1 && items.kt_runner_draft && items.kt_runner_draft.removes === true,
      'the workout and the draft\'s removal are in it: ' + JSON.stringify(lost.losses[0].items));
    await ev(app, () => switchTab('settings'));
    await app.page.waitForFunction(() => /this iPhone lost · Put back/.test((document.getElementById('fp-store-sub') || {}).textContent || ''), null, { timeout: 3000 });
    // Storage: one Put back for the start, previewed, asked, staged as one intent.
    await ev(app, () => openStorageSheet());
    await app.page.waitForFunction(() => document.querySelectorAll('#fpStoreBody button[data-boot]').length === 1, null, { timeout: 3000 });
    await ev(app, () => document.querySelector('#fpStoreBody button[data-boot]').click());
    await app.page.waitForFunction(() => !!document.querySelector('.kt-close-sheet'), null, { timeout: 3000 });
    const ask = await ev(app, () => ({ title: document.querySelector('.kt-close-sheet-ttl').textContent, body: document.querySelector('.kt-close-sheet-sub').textContent }));
    assert(ask.title === 'Put back everything this start lost?' && /Workouts \(\+1 record: [A-Z][a-z]{2} \d{1,2} Push\)/.test(ask.body) && /deletes Workout in progress/.test(ask.body),
      'the question names the workout that comes back and the draft it deletes: ' + JSON.stringify(ask));
    assert(!/kt_/.test(ask.body), 'in the owner\'s words, the app\'s own settings counted: ' + ask.body);
    await ev(app, () => document.querySelector('.kt-close-sheet [id$="ok"]').click());
    await app.page.waitForFunction(() => __pb.length === 2, null, { timeout: 3000 });
    const pb = await ev(app, (ids) => ({ calls: __pb, ids }), lost.losses[0].ids);
    assert(JSON.stringify(pb.calls[1].conflicts) === JSON.stringify(pb.ids) && !pb.calls[1].preview, 'staged every id of the start at once: ' + JSON.stringify(pb));
    await app.reload();   // the shell reloads the page
    const back = await ev(app, (t) => ({ putBack: __ktStoreState.putBack, filed: getSessions().filter((x) => Number(x.startedAt) === t).length,
      wk: __ktMock.realStorage().getItem('kt_runner_draft'), store: __ktMock.values().kt_runner_draft, banner: !!(runnerResumePending && runnerSession),
      losses: __ktMock.status(true).losses }), f.startedAt);
    assert(back.putBack >= 2 && back.filed === 1 && back.wk === null && back.store === undefined && !back.banner, 'the workout is back once, the draft is gone: ' + JSON.stringify(back));
    assert(back.losses.length === 0, 'nothing left to put back: ' + JSON.stringify(back.losses));
    await ev(app, () => switchTab('settings'));
    await app.page.waitForFunction(() => /^In step/.test((document.getElementById('fp-store-sub') || {}).textContent || ''), null, { timeout: 3000 });
    assert((await check(app)).ok, 'store == WebKit');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

serial('a draft whose workout is already filed is dropped at boot with the shell\'s flag, so Resume never files it twice; without the flag, as on next', async () => {
  // The state a lost draft removal leaves (a kill between the finish's save and the removal, a Put back of the workout
  // alone, the test quit on a finish): the workout filed, its draft still in WebKit.
  const T = Date.now() - 40 * 60000;
  const ex = { name: 'Bench Press', sets: 3, reps: 5, weight: 185 };
  const filed = { id: T + 30 * 60000, date: addDaysISO(0), type: 'Push', label: 'Push', week: 1, startedAt: T, note: '', prs: [],
    exercises: [{ name: 'Bench Press', isMain: true, ss: false, sets: 3, reps: [5, 5, 5], weight: 185, weightLog: [185, 185, 185], rpe: 8, rpeLog: [8, 8, 8] }] };
  const draft = { date: addDaysISO(0), savedAt: Date.now() - 10 * 60000, session: { type: 'Push', dayName: 'Push', exercises: [ex], startedAt: T, week: 1 },
    exIdx: 0, completed: { 'Bench Press': 3 }, weights: { 'Bench Press': 185 }, reps: { 'Bench Press': 5 }, repsLog: { 'Bench Press': [5, 5, 5] },
    weightsLog: { 'Bench Press': [185, 185, 185] }, rpe: {}, rpeLog: {}, sessionDate: null };
  const seed = { kt_sessions: JSON.stringify([filed].concat(JSON.parse(SEED.kt_sessions))), kt_runner_draft: JSON.stringify(draft) };
  const state = (app) => ev(app, (T) => ({ pending: !!(runnerResumePending && runnerSession), banner: /WORKOUT IN PROGRESS/.test(document.getElementById('screen').textContent),
    draft: localStorage.getItem('kt_runner_draft'), filed: getSessions().filter((x) => Number(x.startedAt) === T).length }), T);
  // Without the flag (the browser, the PWA, every shell before 60): next's behaviour, the draft offered.
  let app = await boot({ store: 'classic', seed });
  try {
    const s = await state(app);
    assert(s.pending && s.banner && s.draft !== null && s.filed === 1, 'inert without the flag: ' + JSON.stringify(s));
  } finally { await app.close(); }
  // With the flag: dropped at boot, no Resume, Start begins a new workout, and a round is not held for it.
  app = await boot({ store: 'classic', seed, init: 'window.__FP_SHELL = {v:1, min:1, shell:"60", screens:[]};' });
  try {
    const s = await state(app);
    assert(!s.pending && !s.banner && s.draft === null && s.filed === 1, 'the filed workout\'s draft is dropped: ' + JSON.stringify(s));
    const more = await ev(app, (d) => {
      localStorage.setItem('kt_runner_draft', JSON.stringify(d));   // the same draft back (a later restore)
      const held = _roundWaitsForWorkout();
      const restored = _restoreRunnerDraft();
      return { held, restored, draft: localStorage.getItem('kt_runner_draft') };
    }, draft);
    assert(!more.held && !more.restored && more.draft === null, 'no round held for it, never restored: ' + JSON.stringify(more));
    // A draft of a workout not filed is still offered.
    const other = await ev(app, (d) => { d.session.startedAt += 1; localStorage.setItem('kt_runner_draft', JSON.stringify(d)); return { held: _roundWaitsForWorkout(), restored: _restoreRunnerDraft() }; }, draft);
    assert(other.held && other.restored, 'a draft of an unfiled workout is restored as before: ' + JSON.stringify(other));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }

  // The review's case on the store: a finish WebKit lost, then a Put back of the workout alone.
  app = await start({ native: true, init: storageShell() });
  try {
    await ev(app, () => __ktMock.device({ seed: false }));
    await app.reload();
    const f = await ev(app, FINISH);
    await app.page.waitForTimeout(150);
    await ev(app, (J) => __ktMock.next({ restore: J }), f.before);
    await app.reload();
    const id = await ev(app, () => __ktMock.conflicts().filter((c) => c.key === 'kt_sessions' && c.why === 'lag')[0].id);
    await ev(app, (id) => __ktMock.stagePutBack({ conflicts: [id] }), id);
    await app.reload();
    const s = await ev(app, (t) => ({ pending: !!(runnerResumePending && runnerSession), wk: __ktMock.realStorage().getItem('kt_runner_draft'),
      store: __ktMock.values().kt_runner_draft, filed: getSessions().filter((x) => Number(x.startedAt) === t).length,
      open: (__ktMock.status(true).losses[0] || { items: [] }).items.map((it) => it.key) }), f.startedAt);
    assert(s.filed === 1 && !s.pending && s.wk === null && s.store === undefined, 'the workout back once, its draft dropped from both copies: ' + JSON.stringify(s));
    assert(s.open.indexOf('kt_runner_draft') < 0 && s.open.indexOf('kt_sessions') < 0, 'the loss no longer holds them: ' + JSON.stringify(s.open));
    // Start opens a new workout instead of resuming the filed one.
    await ev(app, () => { switchTab('log'); startTodaySession(); });
    await app.page.waitForTimeout(200);
    const after = await ev(app, (t) => ({ resumed: !!(runnerOpen && runnerSession && runnerSession.startedAt === t), filed: getSessions().filter((x) => Number(x.startedAt) === t).length }), f.startedAt);
    assert(!after.resumed && after.filed === 1, 'never resumed, filed once: ' + JSON.stringify(after));
    assert((await check(app)).ok, 'store == WebKit');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
