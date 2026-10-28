// fp-spec: self-shelled
// 130: deep links, the shared photo, the no-key draft and dev-nav under the native tab bar (plan task P9; contract 9,
// 12, D8, D24, D46; T11 e and T12's dev-nav case). Every boot names its shell; the coach API answers at once.
// - trovo://start under tabs: the shell's order (Log selected by deepLink, then _trovoOpen) and the reverse each end on
//   Log with today's session opened once and exactly one page selectTab {tab:'log'}; in the shell's order it selects
//   the selected tab (answered with it, the seq unchanged, nothing sent back). A cold start (the parked link taken at
//   +400 ms) the same.
// - trovo://share, warm, as the root does it (Coach selected by deepLink, then _trovoOpen): one getPendingShare at
//   once (the parked link taken first), the photo pending, one selectTab {tab:'coach', intent:'chat'} of the selected
//   tab, the chat presented on a model holding the photo's key with nothing in #screen but the placeholder, and 200 ms
//   on the model's composer.draft is the comment; the return path's +0.6 s check then finds nothing; a call while a
//   read is in flight never reaches the plugin; a share while the native chat is up keeps it up (no dismiss) and its
//   next model has the new photo. Under none and build 60's coach the deep link reads the share at once too.
// - Cold shares, on Playwright's clock, paused once the page is up (each window run with clock.runFor, so the page's
//   timers fire in order at their own times however busy the machine is; times count from hello's call and the link's
//   taking, and the checks read what the page recorded: each link's and read's time, and hello's state at its answer):
//   under tabs with Coach selected the parked link is read at +400 ms, the chat opens with the photo and the comment,
//   and the 2.5 s boot check finds nothing. Hello 1.5 s late, under build 60's coach and under tabs (the Coach tab
//   WAITING and covered at the link): the link taken before hello's answer, no read before it, one right after it, the
//   chat presented with the comment as composer.draft, coach.draftTaken clearing the web copy, the boot check finding
//   nothing; hello 3 s late: the boot check comes while the read waits and never reaches the plugin. A hello that never
//   answers (60): the read at 3 s of visible time, the photo and the comment in the web chat and the comment in
//   _fp.draft too; a stall (performance.now leaping ahead) counts 1 s at most; a page with FP_NATIVE false keeps the
//   comment in the web composer alone; hidden time does not count (tabs); a hello later than that bound (tabs, 5 s)
//   still puts the comment in the native composer. No bridge (none): the web composer alone, no _fp.draft.
//   The wait's other ends: a hello that throws (60) lets the share be read at the link (the web composer alone); under
//   tabs the failsafe leaving tabs mode (hello silent, 1 s of visible time, hidden until the link is taken in tabs
//   mode) lets it go then (timed from the show), before the 3 s bound; when the head's own way out came before the main
//   script ran (the parser held between them until it), the page boots out of tabs mode, the read goes at the link and
//   the 2.5 s boot check finds nothing.
// - No key: a share lands on the connect route with _fp.draft holding the comment; after Connect (coachHome.setKey
//   under tabs; setApiKey and render under build 60's coach) the chat is presented with that draft and the photo.
// - dev.nav under tabs (spec 121's case there; 121 unchanged): log/workout, progress, coach and settings, each with
//   the flag's selected on its head (contract 9's mapping), boot there and send one selectTab that moves nothing;
//   coach/chat declares the Coach tab and presents the chat; overlay/how, settings/storage-sheet and modal/routines,
//   with hello late, are announced (sheets {open:true}) before hello's answer; modal/* sends no selectTab; runner/rest
//   selects Log and is not announced (D8); a reload in the same launch routes nothing.
// Every native boot names its shell (the mark above): FP_SHELL_INERT runs skip this spec.
const { boot, assert, run, CANONICAL_61 } = require('../lib/harness');

// One case at a time: each starts its own browser.
let _chain = Promise.resolve();
function serial(name, fn) {
  const prev = _chain;
  let done;
  _chain = new Promise((r) => { done = r; });
  run(name, async () => { await prev; try { await fn(); } finally { done(); } });
}
const ev = (app, fn, arg) => app.page.evaluate(fn, arg);
const J = (x) => JSON.stringify(x);
const settle = (app, ms) => app.page.waitForTimeout(ms || 60);
const KEY = 'sk-ant-test';
const PHOTO = '/9j/4AAQSkZJRg==';
const WORDS = 'Form check on this one?';
// The tab root's flag with the shell's first frame on `selected` (contract 9's mapping for a link or a route).
const TABS = (selected, extra) => Object.assign(JSON.parse(CANONICAL_61.tabs), { tabs: { bar: { h: 83, safe: 34 }, selected } }, extra || {});

// In the page, before its scripts:
// - the coach API answering at once (as spec 123's), and __w(ms);
// - TrovoShare: the photo the extension left (__held), handed over once, as the plugin deletes what it returns; each
//   call recorded in __reads with the page's time (and Date.now()), whether hello had answered and whether it carried
//   a photo; __shareDelay holds the answer back (a read in flight);
// - TrovoWidget.consumeDeepLink: the parked link (__parked), taken once; a taking recorded in __links with the page's
//   time, tab, hello, and the Coach tab's mode and covered; __hideAtLink hides the page as it is taken (HIDDEN's
//   __vis); __stallAtLink (ms): that long after the link, performance.now jumps ten minutes ahead (a suspension no
//   visibilitychange reported) and __stallAt is the Date.now() of the jump;
// - __screens: each element #screen is given (class, and the placeholder's screen); __overviews: session overviews;
//   __state(): the page's share state at a moment (reads so far, _fp.draft, the web box, the photo, presents);
// - TrovoShell's hello, sheets and selectTab wrapped as the mock installs them (opts.init runs before it): __tap
//   records each call with the page's time, whether hello had answered and its answer, and for hello the time the page
//   got its answer (seen) and __state() then (before); __hello60 (ms; below 0: never) holds build 60's hello answer
//   back (the harness's own __fpShellHelloDelay and __fpShellHelloSilent are 61's only).
const INIT = `(() => {
  window.fetch = async (url, o) => {
    if (!String(url).includes('anthropic')) return new Response('', { status: 404 });
    const body = JSON.parse(o.body);
    return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', content: [{ type: 'text', text: body.tools ? 'On it.' : '{"message":"ok","actions":[]}' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  window.__w = (ms) => new Promise((r) => setTimeout(r, ms));
  const P = window.Capacitor.Plugins;
  window.__held = null; window.__reads = []; window.__shareDelay = 0;
  P.TrovoShare = Object.assign(P.TrovoShare || {}, { getPendingShare: () => {
    const r = window.__held; window.__held = null;
    window.__reads.push({ at: performance.now(), date: Date.now(), hello: !!(window._fp && _fp.hello), got: !!(r && r.imageBase64) });
    const v = r || {};
    return window.__shareDelay > 0 ? new Promise((res) => setTimeout(() => res(v), window.__shareDelay)) : Promise.resolve(v);
  } });
  window.__parked = ''; window.__links = [];
  P.TrovoWidget = Object.assign(P.TrovoWidget || {}, { consumeDeepLink: () => {
    const u = window.__parked; window.__parked = '';
    if (u) window.__links.push({ at: performance.now(), url: u, tab: window.currentTab, hello: !!(window._fp && _fp.hello),
      mode: typeof _fpCoachMode === 'function' ? _fpCoachMode() : null, covered: typeof _fpCovered === 'function' ? _fpCovered() : null });
    if (u && window.__hideAtLink) window.__vis = 'hidden';
    if (u && window.__stallAtLink) setTimeout(() => {
      window.__stallAt = Date.now();
      const pn = performance.now.bind(performance);
      performance.now = () => pn() + 600000;
    }, window.__stallAtLink);
    return Promise.resolve({ url: u });
  } });
  window.__screens = []; window.__overviews = 0;
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
    if (n.nodeType !== 1) return;
    if (m.target && m.target.id === 'screen') window.__screens.push(String(n.className || n.tagName) + (n.getAttribute('data-fp-screen') ? '/' + n.getAttribute('data-fp-screen') : ''));
    if (n.id === 'sessionOverviewOverlay') window.__overviews++;
  }))).observe(document, { childList: true, subtree: true });
  // the page's share state at a moment: reads so far, its draft, the web box, the photo, presents and dismisses
  window.__state = () => ({ reads: window.__reads.length,
    draft: window._fp && _fp.draft ? { text: _fp.draft.text, nonce: _fp.draft.nonce } : null,
    box: document.getElementById('coach-input') ? document.getElementById('coach-input').value : null,
    img: typeof pendingImage !== 'undefined' && !!pendingImage,
    ops: window.__fpShell ? __fpShell.calls.filter((c) => c[0] === 'present' || c[0] === 'dismiss').length : 0 });
  window.__tap = [];
  let ts;
  Object.defineProperty(P, 'TrovoShell', { configurable: true, enumerable: true, get: () => ts, set: (v) => {
    ts = v;
    if (!v || typeof v !== 'object') return;
    ['hello', 'sheets', 'selectTab'].forEach((name) => {
      let f;
      Object.defineProperty(v, name, { configurable: true, enumerable: true, get: () => f, set: (fn) => {
        f = function (a) {
          const e = { name, args: a === undefined ? null : JSON.parse(JSON.stringify(a)), at: performance.now(), hello: !!(window._fp && _fp.hello), answer: null };
          window.__tap.push(e);
          const p = fn.apply(this, arguments);
          const d = name === 'hello' ? window.__hello60 : undefined;
          // hello's answer as the page gets it (just before its handler runs): the time, and the page's state then
          const seen = () => { e.seen = performance.now(); e.before = window.__state(); };
          Promise.resolve(p).then((r) => { e.answer = r === undefined ? null : JSON.parse(JSON.stringify(r)); if (name === 'hello' && typeof d !== 'number') seen(); }, () => {});
          if (typeof d !== 'number') return p;
          return d < 0 ? new Promise(() => {}) : Promise.resolve(p).then((r) => new Promise((res) => setTimeout(() => { seen(); res(r); }, d)));
        };
      } });
    });
  } });
})();`;
const HIDDEN = 'window.__vis = "visible"; Object.defineProperty(document, "visibilityState", { configurable: true, get: function () { return window.__vis; } });';
// Today is a Push day, whatever the weekday: trovo://start opens its session overview.
const TODAY_PUSH = 'try { var _cr = JSON.parse(localStorage.getItem("kt_routine")); var _p = ["Rest", "Rest", "Rest", "Rest", "Rest", "Rest", "Rest"];'
  + ' _p[(new Date().getDay() + 6) % 7] = "Push"; _cr.weekPlan = _p; (_cr.weeks || []).forEach(function (w) { delete w.weekPlan; });'
  + ' localStorage.setItem("kt_routine", JSON.stringify(_cr)); } catch (e) {}';
// A cold share: the link parked and the photo with its comment waiting before the page runs.
const COLD_SHARE = 'window.__parked = "trovo://share"; window.__held = { imageBase64: "' + PHOTO + '", comment: "' + WORDS + '" };';
// A TrovoStore standing in for the shell's (Settings > About > Storage opens its sheet only with one), in step.
const STORE_PLUGIN = '(function () { var P = window.Capacitor && window.Capacitor.Plugins; if (!P) return; var now = Date.now();'
  + ' var st = { shell: "61", page: "20261014-1", facade: "attached", why: null, document: { at: now, attached: true, boot: 3, rule: 0,'
  + ' label: "in step", helloMs: 2.4, bootDone: true }, deviceSwitchOn: true, policyFacade: "on", policyRepair: "off", breakerArmed: false,'
  + ' breakerTrips: 0, skippingThisLaunch: false, crashVerdicts: [], markerFoundAtLaunch: null, storeClosedWhy: null,'
  + ' counters: { prompts: 1, promptMs: 1, promptMaxMs: 1, hellos: 1, posts: 0, postsApplied: 0, postsStale: 0 }, pagesAlive: 1,'
  + ' store: { state: "ready", build: 61, schema: 1, minReader: 60, keys: 24, bytes: 180224, tombstones: 0, unknownEnc: 0, boot: 3,'
  + ' conflicts: 0, lastHello: { at: now, boot: 3, rule: 0, label: "in step", adopted: {}, wouldRepair: [] },'
  + ' counts: { counts: { hellos: 1, inStep: 1 }, maxMs: {} }, wipeOffer: null, putBackStaged: false, putBackWaiting: 0, snaps: [],'
  + ' inStep: true }, testQuit: null, testQuitArmed: false, testKill: false };'
  + ' P.TrovoStore = { status: function () { return Promise.resolve(JSON.parse(JSON.stringify(st))); },'
  + ' conflicts: function () { return Promise.resolve({ rows: [] }); } }; })();';

// o.nokey: no API key saved; o.init: more page script, after INIT.
const pageBoot = (shell, o) => {
  o = Object.assign({}, o || {});
  const nokey = !!o.nokey; delete o.nokey;
  return boot(Object.assign({ native: true, shell }, o, { init: INIT + (o.init || ''),
    seed: Object.assign(nokey ? {} : { kt_apikey: KEY }, { kt_coach_msgs: '[]' }, o.seed || {}) }));
};
// Hello answered (under a flag) and the morning card's fetch done (it repaints Log a beat after the boot).
const ready = (app, flag) => app.page.waitForFunction((flag) => (!flag || (window._fp && _fp.hello)) && typeof coachCardLoading !== 'undefined'
  && !coachCardLoading, flag, { timeout: 15000 }).then(() => settle(app, 80));
// ready, and the boot's own share check (+2.5 s) has read (nothing), so it never lands inside a warm case's counts.
const readyChecked = (app, flag) => ready(app, flag).then(() => app.page.waitForFunction(() => window.__reads.length > 0 && !_shareBusy, null,
  { timeout: 15000 })).then(() => settle(app, 20));
// Playwright's clock (the boot passed clock). Installed, it runs in real time too, from before the page loads, so the
// page may boot at any time of it, and the cases count from what the page recorded (hello's call, the link's taking),
// never from an absolute time. pause(app) stops that run once the page is up (pauseAt a moment ahead, tried again if
// the page's time has passed it): from then on only runFor moves the page's time, timer by timer in order.
const pause = async (app) => {
  for (let k = 0; ; k++) {
    const t = await ev(app, () => Date.now());
    try { await app.page.clock.pauseAt(t + 200); return; } catch (e) { if (k >= 20 || !/past/.test(String(e && e.message))) throw e; }
  }
};
const runFor = (app, ms) => app.page.clock.runFor(ms);
// The page's time, then a run of its timers up to `at` of it (at least one tick: every timer already due has fired).
const runTo = async (app, at) => { const now = await ev(app, () => performance.now()); await runFor(app, Math.max(1, Math.ceil(at - now))); };
// hello as the page sent it and got its answer (INIT's record: at, seen, before). It goes in the boot's main script,
// after the boot's +2.5 s share check is set and before the parked link's +400 ms timer is.
const helloOf = (app) => ev(app, () => __tap.find((e) => e.name === 'hello') || null);
// The parked link as the page took it, the paused clock run 50 ms at a time until it is.
const linkOf = async (app) => {
  for (let k = 0; k < 200; k++) {
    const l = await ev(app, () => __links.slice());
    if (l.length) return l;
    await runFor(app, 50);
  }
  throw new Error('the parked link was never taken');
};
// What the shell was given from call i on: presents and dismisses in order, the chat's composer at each of its models,
// the composer the chat was presented on, the newest Coach tab model's route; and the page's drafts and photo.
const look = (app, i) => ev(app, (i) => {
  const calls = window.__fpShell ? __fpShell.calls.slice(i || 0) : [];
  let comp = null, home = null, onPresent = null;
  const ops = [];
  calls.forEach((c) => {
    if (c[0] === 'model' && c[1].screen === 'coach') comp = JSON.parse(c[1].json).composer;
    if (c[0] === 'model' && c[1].screen === 'coachHome') home = JSON.parse(c[1].json).route;
    if (c[0] === 'present' || c[0] === 'dismiss') { ops.push(c[0] + ' ' + c[1].screen); if (c[0] === 'present' && c[1].screen === 'coach') onPresent = comp; }
  });
  const box = document.getElementById('coach-input');
  return { ops, comp, onPresent, home, draft: _fp.draft, web: _coachDraft ? _coachDraft.v : null, box: box ? box.value : null,
    key: pendingImage ? pendingImage.key || null : null, img: !!pendingImage, photo: !!document.querySelector('#screen img[alt="Photo to send"]'),
    tab: currentTab, view: coachView, hello: !!_fp.hello, reads: __reads.slice(), links: __links.slice(), now: performance.now() };
}, i || 0);

// ── trovo://start ─────────────────────────────────────────────────────────────────────────────────────────────────
serial('trovo://start under tabs: the shell\'s order (Log selected by deepLink, then _trovoOpen) and the reverse each end on Log with today\'s session opened once and one page selectTab {tab:\'log\'} (in the shell\'s order of the selected tab: answered with it, the seq unchanged, nothing sent back); a cold start (the link taken at +400 ms) the same', async () => {
  const app = await pageBoot('tabs', { init: TODAY_PUSH });
  try {
    await ready(app, true);
    const one = (order) => ev(app, async (order) => {
      switchTab('progress'); await __w(60);
      const s = __fpShell.sent.length, t = __tap.length, ov = __overviews, seq0 = __fpShell.state().scene.seq;
      let handled, seq1;
      if (order === 'shell') { await __fpShell.select('log', 'deepLink'); seq1 = __fpShell.state().scene.seq; handled = _trovoOpen('trovo://start'); }
      else { handled = _trovoOpen('trovo://start'); await __w(0); seq1 = __fpShell.state().scene.seq; await __fpShell.select('log', 'deepLink'); }
      await __w(400);
      const sc = __fpShell.state().scene;
      const r = { handled, seq0, seq1, seq: sc.seq, scene: sc.selected, tab: currentTab, sub: logSubTab, opened: __overviews - ov,
        sel: __tap.slice(t).filter((e) => e.name === 'selectTab').map((e) => ({ args: e.args, answer: e.answer })),
        back: __fpShell.sent.slice(s).filter((m) => m[0] === 'tabs.select').map((m) => m[1]) };
      closeSessionOverview(); await __w(60);
      return r;
    }, order);
    const a = await one('shell');
    assert(a.handled === true && a.seq1 === a.seq0 + 1 && J(a.back) === J([{ tab: 'log', seq: a.seq1 }]),
      'the shell\'s order: the deep link\'s selection moves the shell once and is the one tabs.select: ' + J(a));
    assert(a.sel.length === 1 && J(a.sel[0].args) === J({ tab: 'log' }) && J(a.sel[0].answer) === J({ tab: 'log', seq: a.seq1 }) && a.seq === a.seq1,
      'the shell\'s order: one selectTab of the selected tab, answered with it and the seq unchanged: ' + J(a));
    assert(a.tab === 'log' && a.scene === 'log' && a.sub === 'workout' && a.opened === 1, 'the shell\'s order: on Log, today\'s session opened once: ' + J(a));
    const b = await one('reverse');
    assert(b.handled === true && b.sel.length === 1 && J(b.sel[0].args) === J({ tab: 'log' }) && J(b.sel[0].answer) === J({ tab: 'log', seq: b.seq0 + 1 }),
      'the reverse: one selectTab {tab:\'log\'}, which moves the shell: ' + J(b));
    assert(b.seq1 === b.seq0 + 1 && b.seq === b.seq1 && b.back.length === 0, 'the reverse: the deep link\'s selection of the selected tab moves and sends nothing: ' + J(b));
    assert(b.tab === 'log' && b.scene === 'log' && b.opened === 1, 'the reverse: on Log, today\'s session opened once: ' + J(b));
  } finally { await app.close(); }
  const cold = await pageBoot(TABS('log'), { init: TODAY_PUSH + 'window.__parked = "trovo://start";' });
  try {
    await cold.page.waitForFunction(() => window.__overviews > 0, null, { timeout: 15000 });
    await settle(cold, 300);
    const o = await ev(cold, () => ({ links: __links, opened: __overviews, tab: currentTab, seq: __fpShell.state().scene.seq,
      sel: __tap.filter((e) => e.name === 'selectTab').map((e) => ({ args: e.args, answer: e.answer })),
      back: __fpShell.sent.filter((m) => m[0] === 'tabs.select').length }));
    assert(o.links.length === 1 && o.links[0].url === 'trovo://start' && o.links[0].tab === 'log', 'cold: the parked link taken on Log: ' + J(o));
    assert(o.sel.length === 1 && J(o.sel[0].args) === J({ tab: 'log' }) && J(o.sel[0].answer) === J({ tab: 'log', seq: 0 }) && o.seq === 0 && o.back === 0,
      'cold: one selectTab of the selected tab, the seq unchanged, nothing sent back: ' + J(o));
    assert(o.tab === 'log' && o.opened === 1, 'cold: today\'s session opened once: ' + J(o));
  } finally { await cold.close(); }
});

// ── trovo://share, warm ───────────────────────────────────────────────────────────────────────────────────────────
serial('trovo://share, warm, as the root does it under tabs: one getPendingShare at once, one selectTab {tab:\'coach\', intent:\'chat\'} of the selected tab, the chat presented on a model holding the photo\'s key and #screen only the placeholder, the comment as composer.draft 200 ms on; the return path\'s check finds nothing; no second reader while one is in flight; a share over the chat keeps it up', async () => {
  const app = await pageBoot('tabs');
  try {
    await readyChecked(app, true);
    const i = await ev(app, () => __fpShell.calls.length);
    const o = await ev(app, async (a) => {
      const s = __fpShell.sent.length, t = __tap.length, sc = __screens.length, n0 = __reads.length;
      // the share extension's photo, and the link AppDelegate parks before it posts it (taken, so no later boot runs it
      // again)
      window.__held = { imageBase64: a.photo, comment: a.words }; window.__parked = 'trovo://share';
      await __fpShell.select('coach', 'deepLink');
      const seq1 = __fpShell.state().scene.seq, tab1 = currentTab;
      const handled = _trovoOpen('trovo://share');
      const consumed = window.__parked === '';
      await __w(0);
      const atOnce = { reads: __reads.length - n0, img: !!pendingImage };
      await __w(300);
      return { handled, consumed, seq1, tab1, atOnce, seq: __fpShell.state().scene.seq, screens: __screens.slice(sc),
        sel: __tap.slice(t).filter((e) => e.name === 'selectTab').map((e) => ({ args: e.args, answer: e.answer })),
        back: __fpShell.sent.slice(s).filter((m) => m[0] === 'tabs.select').map((m) => m[1]) };
    }, { photo: PHOTO, words: WORDS });
    const m = await look(app, i);
    assert(o.handled === true && o.consumed && o.tab1 === 'coach' && o.atOnce.reads === 1 && o.atOnce.img,
      'the parked link taken, one getPendingShare at once, the photo pending: ' + J(o));
    assert(o.sel.length === 1 && J(o.sel[0].args) === J({ tab: 'coach', intent: 'chat' }) && J(o.sel[0].answer) === J({ tab: 'coach', seq: o.seq1 }) && o.seq === o.seq1,
      'one selectTab {tab:\'coach\', intent:\'chat\'} of the selected tab, the seq unchanged: ' + J(o));
    assert(J(o.back) === J([{ tab: 'coach', seq: o.seq1 }]), 'the deep link\'s own tabs.select, nothing sent back after the page\'s: ' + J(o.back));
    assert(J(m.ops) === J(['present coach']) && m.onPresent && m.onPresent.image && m.onPresent.image.key === m.key && !!m.key,
      'the chat presented once, on a model holding the photo\'s key: ' + J(m));
    assert(o.screens.length > 0 && o.screens.every((x) => x === 'kt-fp-ph/coachHome'), 'no frame of the page\'s own: #screen held only the placeholder: ' + J(o.screens));
    assert(m.comp.draft && m.comp.draft.text === WORDS && m.draft && m.comp.draft.nonce === m.draft.nonce && m.tab === 'coach' && m.view === 'chat',
      'the comment is the model\'s composer.draft: ' + J(m));
    // the return path: the page back in the foreground reads again 0.6 s on and finds nothing
    const r = await ev(app, async () => {
      const n = __reads.length, k = __fpShell.calls.length, was = _fp.draft && _fp.draft.nonce;
      document.dispatchEvent(new Event('visibilitychange'));
      await __w(900);
      return { reads: __reads.slice(n), ops: __fpShell.calls.slice(k).filter((c) => c[0] === 'present' || c[0] === 'dismiss').length,
        nonce: _fp.draft && _fp.draft.nonce, was, img: !!pendingImage };
    });
    assert(r.reads.length === 1 && r.reads[0].got === false && r.ops === 0 && r.nonce === r.was && r.img, 'the return path\'s +0.6 s check reads nothing: ' + J(r));
    // one reader at a time: a call while a read is in flight never reaches the plugin; a share over the native chat
    // keeps it up (no dismiss, no second present) and the next model has the new photo
    const k = await ev(app, () => __fpShell.calls.length);
    const f = await ev(app, async (photo) => {
      const n = __reads.length, key0 = pendingImage && pendingImage.key;
      window.__shareDelay = 300; window.__held = { imageBase64: photo };
      checkPendingShare(); checkPendingShare();
      await __w(0);
      const during = { reads: __reads.length - n, busy: _shareBusy };
      checkPendingShare();
      await __w(600);
      window.__shareDelay = 0;
      return { during, reads: __reads.length - n, busy: _shareBusy, key0, shown: !!_fp.shown.coach };
    }, PHOTO.replace('==', 'AA'));
    const g = await look(app, k);
    assert(f.during.reads === 1 && f.during.busy === true && f.reads === 1 && f.busy === false, 'no second reader while a read is in flight: ' + J(f));
    assert(g.ops.length === 0 && f.shown && g.comp && g.comp.image && g.comp.image.key === g.key && g.key !== f.key0,
      'a share over the native chat keeps it up and its next model has the new photo: ' + J([f, g]));
  } finally { await app.close(); }
});

serial('trovo://share under none and build 60\'s coach: the deep link reads the share at once too (the web chat or 60\'s overlay chat, with the photo and the comment)', async () => {
  for (const shell of ['none', 'coach']) {
    const app = await pageBoot(shell);
    try {
      await readyChecked(app, shell !== 'none');
      const i = await ev(app, () => (window.__fpShell ? __fpShell.calls.length : 0));
      const o = await ev(app, async (a) => {
        const n0 = __reads.length;
        window.__held = { imageBase64: a.photo, comment: a.words }; window.__parked = 'trovo://share';
        const handled = _trovoOpen('trovo://share');
        const consumed = window.__parked === '';
        await __w(0);
        const atOnce = __reads.length - n0;
        await __w(300);
        return { handled, consumed, atOnce, reads: __reads.slice(n0) };
      }, { photo: PHOTO, words: WORDS });
      const m = await look(app, i);
      assert(o.handled === true && o.consumed && o.atOnce === 1 && o.reads.length === 1 && o.reads[0].got && m.img && m.tab === 'coach' && m.view === 'chat',
        shell + ': the parked link taken, read at once, the photo in the chat: ' + J([o, m]));
      if (shell === 'none') {
        assert(m.photo && m.box === WORDS && m.draft === null && m.ops.length === 0, 'none: the web chat shows the photo and the comment, no _fp.draft: ' + J(m));
      } else {
        assert(J(m.ops) === J(['present coach']) && m.onPresent.image && m.onPresent.image.key === m.key && m.comp.draft && m.comp.draft.text === WORDS,
          'coach: 60\'s chat presented with the photo, the comment its composer.draft: ' + J(m));
      }
    } finally { await app.close(); }
  }
});

// ── Cold shares ───────────────────────────────────────────────────────────────────────────────────────────────────
serial('a cold share under tabs, Coach selected: the parked link is read at +400 ms, the chat opens with the photo and the comment, and the 2.5 s boot check finds nothing', async () => {
  const app = await pageBoot(TABS('coach'), { clock: { time: Date.now() }, init: COLD_SHARE });
  try {
    await pause(app);
    const h = await helloOf(app);
    await runTo(app, h.at + 3100);
    await runFor(app, 100);
    const m = await look(app, 0);
    assert(m.links.length === 1 && m.links[0].url === 'trovo://share' && m.links[0].tab === 'coach', 'the parked link taken on Coach: ' + J(m.links));
    assert(m.reads.length === 2 && m.reads[0].got && m.reads[0].hello && m.reads[0].at - m.links[0].at < 500 && m.reads[1].got === false
      && m.reads[1].at - m.links[0].at > 1500, 'read at the link, then the boot check finds nothing: ' + J(m.reads));
    assert(J(m.ops) === J(['present coachHome', 'present coach']) && m.onPresent.image && m.onPresent.image.key === m.key && m.comp.draft && m.comp.draft.text === WORDS
      && m.tab === 'coach' && m.view === 'chat', 'the Coach tab, then the chat with the photo and the comment: ' + J(m));
  } finally { await app.close(); }
});

// The cold share before hello's answer (contract 9, D46), on the clock: no read before the answer, the chat it opens
// is the negotiated one, the comment its composer.draft; coach.draftTaken clears the web copy. Hello 3 s late answers
// after the boot check (+2.5 s, scheduled before hello is sent) and before the read's 3 s bound (from the link at
// +400 ms).
for (const [shell, late] of [['coach', 1500], ['tabs', 1500], ['coach', 3000], ['tabs', 3000]]) {
  serial('a cold share before hello under ' + (shell === 'coach' ? 'build 60\'s coach' : 'tabs') + ', hello ' + late + ' ms late: the link taken before hello\'s answer, no read before it, one right after it, the chat presented with the comment as composer.draft, coach.draftTaken clears the web copy; the boot check ' + (late < 2500 ? 'finds nothing' : 'comes while the read waits and never reaches the plugin'), async () => {
    const tabs = shell === 'tabs';
    const app = await pageBoot(tabs ? TABS('coach') : 'coach', { clock: { time: Date.now() },
      init: COLD_SHARE + (tabs ? 'window.__fpShellHelloDelay = ' + late + ';' : 'window.__hello60 = ' + late + ';') });
    try {
      await pause(app);
      const h0 = await helloOf(app);
      await runTo(app, h0.at + Math.max(late, 2500) + 600);   // hello's answer, the read and the boot check all past
      await runFor(app, 100);
      const m = await look(app, 0);
      const h = await helloOf(app);
      assert(h && typeof h.seen === 'number' && h.seen - h.at >= late - 1 && h.before.reads === 0 && h.before.ops === 0,
        'hello answered ' + late + ' ms after it went, with no read and nothing native before: ' + J(h));
      assert(m.links.length === 1 && m.links[0].url === 'trovo://share' && !m.links[0].hello && m.links[0].at < h.seen,
        'the link taken before hello\'s answer: ' + J([m.links, h.seen]));
      if (tabs) assert(m.links[0].tab === 'coach' && m.links[0].mode === 'waiting' && m.links[0].covered === true, 'the Coach tab WAITING and covered at the link: ' + J(m.links));
      assert(m.reads.length >= 1 && m.reads.every((r) => r.hello) && m.reads[0].got && m.reads[0].at >= h.seen && m.reads[0].at - h.seen < 500
        && m.reads[0].at - m.links[0].at < 2999, 'the photo read right after hello\'s answer (not at the bound): ' + J([m.reads, h.seen, m.links]));
      if (late < 2500) assert(m.reads.length === 2 && m.reads[1].got === false && m.reads[1].at > m.reads[0].at, 'the boot check finds nothing: ' + J(m.reads));
      else assert(m.reads.length === 1, 'the boot check came while the read waited, and never reached the plugin: ' + J(m.reads));
      assert(J(m.ops) === J(tabs ? ['present coachHome', 'present coach'] : ['present coach']) && m.onPresent.image && m.onPresent.image.key === m.key
        && m.comp.draft && m.comp.draft.text === WORDS && m.draft && m.draft.nonce === m.comp.draft.nonce && m.web === WORDS,
        'the chat presented with the photo, the comment its composer.draft (the web copy kept): ' + J(m));
      const t = await ev(app, (nonce) => __fpShell.call('coach.draftTaken', { nonce }), m.draft.nonce);
      await runFor(app, 50);
      const n = await look(app, 0);
      assert(t.ok === true && n.draft === null && n.web === '' && n.comp.draft === null, 'coach.draftTaken spends the words, the web copy cleared: ' + J([t, n]));
    } finally { await app.close(); }
  });
}

serial('a hello that never answers (build 60\'s coach) lets the read through at 3 s of visible time: the photo and the comment in the web chat, the comment in _fp.draft too; a stall counts 1 s at most; with FP_NATIVE false the web composer alone; under tabs hidden time does not count; a hello later than the bound (tabs, 5 s) still puts the comment in the native composer; with no bridge (none) the web composer alone', async () => {
  // build 60's coach, hello never answering
  let app = await pageBoot('coach', { clock: { time: Date.now() }, init: COLD_SHARE + 'window.__hello60 = -1;' });
  try {
    await pause(app);
    const l = await linkOf(app);
    assert(l.length === 1 && !l[0].hello, 'the link taken, hello still out: ' + J(l));
    await runTo(app, l[0].at + 3100);
    await runFor(app, 300);
    const b = await look(app, 0);
    assert(b.reads.length === 1 && b.reads[0].got && !b.reads[0].hello && b.reads[0].at - l[0].at >= 2999,
      'no read before 3 s of visible time, one at it: ' + J([b.reads, l]));
    assert(b.tab === 'coach' && b.view === 'chat' && b.photo && b.box === WORDS && b.draft && b.draft.text === WORDS && b.ops.length === 0,
      'nothing stranded: the photo and the comment in the web chat, the comment in _fp.draft too: ' + J(b));
  } finally { await app.close(); }
  // the same with a stall 500 ms into the wait (performance.now ten minutes ahead between two of its ticks): it counts
  // 1 s at most, so the read comes 1.5 s of the clock's time after it (Date.now(), which the stall leaves alone), not
  // at once, nor 2.5 s on as if the stall counted nothing
  app = await pageBoot('coach', { clock: { time: Date.now() }, init: COLD_SHARE + 'window.__hello60 = -1; window.__stallAtLink = 500;' });
  try {
    await pause(app);
    await linkOf(app);
    await runFor(app, 3000);   // performance.now runs ten minutes ahead from the stall on, so no runTo from here
    const b = await look(app, 0);
    const at = await ev(app, () => window.__stallAt);
    assert(typeof at === 'number' && b.links.length === 1 && b.reads.length >= 1 && b.reads[0].got && !b.reads[0].hello
      && b.reads.slice(1).every((r) => r.got === false) && b.reads[0].date - at >= 1400 && b.reads[0].date - at < 2400,
      'a stall counts 1 s at most: the read 1.5 s after it: ' + J([b.reads, at]));
  } finally { await app.close(); }
  // a page with FP_NATIVE false (an OTA with no native screen: its hello names none), hello never answering: the read
  // at the bound, and the comment in the web composer alone (no native chat can come for it)
  app = await pageBoot('coach', { clock: { time: Date.now() }, html: (s) => s.replace('var FP_NATIVE=true,', 'var FP_NATIVE=false,'),
    init: COLD_SHARE + 'window.__hello60 = -1;' });
  try {
    await pause(app);
    const l = await linkOf(app);
    await runTo(app, l[0].at + 3100);
    await runFor(app, 300);
    const b = await look(app, 0);
    const h = await helloOf(app);
    const off = await ev(app, () => FP_NATIVE === false);
    assert(off && h && J(h.args.screens) === '[]' && b.reads.length === 1 && b.reads[0].got && b.reads[0].at - l[0].at >= 2999,
      'FP_NATIVE false: hello names no screen, the read at the bound: ' + J([off, h, b.reads]));
    assert(b.tab === 'coach' && b.view === 'chat' && b.photo && b.box === WORDS && b.draft === null, 'the comment in the web composer alone: ' + J(b));
  } finally { await app.close(); }
  // tabs, hello never answering (the failsafe kept out of the way), the page hidden as the link is taken, for 1.5 s
  app = await pageBoot(TABS('coach'), { clock: { time: Date.now() },
    init: HIDDEN + COLD_SHARE + 'window.__hideAtLink = true; window.__fpShellHelloSilent = true; window.__fpTabsFailsafeMs = 1e9;' });
  try {
    await pause(app);
    const l = await linkOf(app);
    assert(l.length === 1 && !l[0].hello && l[0].covered === true, 'the link taken under the WAITING Coach tab: ' + J(l));
    await runTo(app, l[0].at + 1500);
    const shown = await ev(app, () => { window.__vis = 'visible'; return performance.now(); });
    await runTo(app, shown + 3100);
    await runFor(app, 300);
    const b = await look(app, 0);
    assert(b.reads.length === 1 && b.reads[0].at - shown >= 2999 && b.reads[0].at - l[0].at >= 4499,
      'hidden time does not count: the read 3 s of visible time after the show: ' + J([b.reads, l, shown]));
    assert(b.draft && b.draft.text === WORDS && b.box === WORDS && b.img, 'both drafts and the photo: ' + J(b));
  } finally { await app.close(); }
  // tabs, hello 5 s late: the read at the bound, then the answer: the chat opens with the photo and the comment
  app = await pageBoot(TABS('coach'), { clock: { time: Date.now() }, init: COLD_SHARE + 'window.__fpShellHelloDelay = 5000;' });
  try {
    await pause(app);
    const h0 = await helloOf(app);
    await runTo(app, h0.at + 5600);
    await runFor(app, 200);
    const b = await look(app, 0);
    const h = await helloOf(app);
    const a = h && h.before;
    assert(h && typeof h.seen === 'number' && b.links.length === 1 && b.reads.length === 1 && !b.reads[0].hello && b.reads[0].at - b.links[0].at >= 2999
      && b.reads[0].at < h.seen, 'the read at the bound, before hello\'s answer: ' + J([b.links, b.reads, h]));
    assert(a.reads === 1 && a.draft && a.draft.text === WORDS && a.box === WORDS && a.img && a.ops === 0,
      'at hello\'s answer: the photo and the comment in both drafts, nothing native yet: ' + J(a));
    assert(b.hello && J(b.ops) === J(['present coachHome', 'present coach']) && b.onPresent.image && b.onPresent.image.key === b.key
      && b.comp.draft && b.comp.draft.text === WORDS && b.comp.draft.nonce === a.draft.nonce, 'after hello: the chat with the photo, the comment its composer.draft: ' + J(b));
    const t = await ev(app, (nonce) => __fpShell.call('coach.draftTaken', { nonce }), b.draft.nonce);
    await runFor(app, 50);
    const c = await look(app, 0);
    assert(t.ok === true && c.draft === null && c.web === '', 'coach.draftTaken spends the words, the web copy cleared: ' + J([t, c]));
  } finally { await app.close(); }
  // none: no bridge, so no wait and no page draft
  app = await pageBoot('none', { init: COLD_SHARE });
  try {
    await app.page.waitForFunction(() => window.__reads.length > 0, null, { timeout: 15000 });
    await settle(app, 400);
    const m = await look(app, 0);
    assert(m.reads.length >= 1 && m.reads[0].got && m.tab === 'coach' && m.view === 'chat' && m.photo && m.box === WORDS && m.draft === null,
      'none: the web chat with the photo, the comment in the web composer alone: ' + J(m));
  } finally { await app.close(); }
});

// The page lane gate's probe, made deterministic (spec 122's PF case holds the parser the same way): a parser-blocking
// script right after the head script's end, from a server of the case's own that answers it only when the page asks
// (GET /release), which the page does once the head's way out has been seen (window.__fpTabsTold and exactly one dismiss
// tabs recorded). The event loop, and with it the head's failsafe, runs while the main script waits, for as long as that
// takes and never for a set time; a hold nothing released is answered after 15 s as 'timeout' (the case fails on it).
// The poll asks by XMLHttpRequest (INIT's fetch answers only the coach API) and stops once, with the setInterval and
// clearInterval it started with (an init script runs before Playwright's clock is installed, so its own timers are the
// page's real ones, while a clearInterval called later would be the clock's). The case closes the hold in a finally of
// its own, after the boot's close() even when that throws (any page error under the 61 flag, a store drift); the server
// and the valve are unref'd as well, so a hold left open can never keep the spec's process alive.
const http = require('http');
async function parserHold() {
  const held = [], st = { released: null };
  const answer = (res) => { res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); res.end('window.__heldScript = true;'); };
  const release = (why) => { if (!st.released) st.released = why; held.splice(0).forEach(answer); };
  const srv = http.createServer((req, res) => {
    const p = req.url.split('?')[0];
    if (p === '/hold.js') { if (st.released) answer(res); else held.push(res); return; }
    if (p === '/release') { release('page'); res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }); res.end(); return; }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  srv.unref();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const valve = setTimeout(() => release('timeout'), 15000);
  valve.unref();
  return {
    st,
    html: (src) => {
      const end = '</script>\n<title>', at = src.indexOf(end);
      if (at < 0 || src.indexOf(end, at + 1) >= 0) throw new Error('spec 130: not one end of the head script');
      return src.slice(0, at + 9) + '\n<script src="' + base + '/hold.js"></script>' + src.slice(at + 9);
    },
    init: '(function () { var si = window.setInterval, ci = window.clearInterval, done = false, t = si(function () { var s = window.__fpShell;'
      + ' if (done || window.__fpTabsTold !== true || !s) return;'
      + ' if (s.calls.filter(function (c) { return c[0] === "dismiss" && c[1] && c[1].screen === "tabs"; }).length !== 1) return;'
      + ' done = true; ci(t); window.__holdSeen = { fp: typeof window._fp, render: typeof window.render };'
      + ' var x = new XMLHttpRequest(); x.open("GET", "' + base + '/release", true); x.send(); }, 10); })();',
    close: () => { clearTimeout(valve); release('closed'); try { srv.closeAllConnections(); } catch (e) {} srv.close(); },
  };
}

// The wait's other two ends (contract 9, D46): hello failed, or the page left tabs mode.
serial('the read waits no longer once hello has failed or the page has left tabs mode: a hello that throws (build 60\'s coach) lets the parked share be read at the link, the comment in the web composer alone; under tabs, hello silent, the failsafe at 1 s of visible time leaves tabs mode and the read goes then, long before its 3 s bound, the comment in both drafts; when the head\'s own way out came before the main script ran (the parser held between them until it), the page boots out of tabs mode and the read goes at the link, the comment in both drafts', async () => {
  let app = await pageBoot('coach', { init: COLD_SHARE + 'window.__fpShellThrow = ["hello"];' });
  try {
    await app.page.waitForFunction(() => window.__reads.length > 0, null, { timeout: 15000 });
    await settle(app, 400);
    const m = await look(app, 0);
    assert(m.links.length === 1 && m.reads.length >= 1 && m.reads[0].got && !m.hello && m.reads[0].at - m.links[0].at < 500,
      'hello failed: the share read at the link: ' + J(m));
    assert(m.tab === 'coach' && m.view === 'chat' && m.photo && m.box === WORDS && m.draft === null,
      'the web chat with the photo, the comment in the web composer alone (hello failed: no native chat to come): ' + J(m));
  } finally { await app.close(); }
  // Hidden (HIDDEN's __vis) until the parked link has been taken in tabs mode, so the failsafe counts no time before
  // that: visible from the start, a parser held short of the main script for 1 s of visible time let the head's own
  // way out come first (seen at the page lane's gate: why 'off'); that timing is the next boot's. The failsafe and the
  // read's 3 s bound both count visible time, which starts at the show, so the read is timed from the show, never from
  // the link: the stretch between the two is however late boot() came back and the pause landed (Playwright's clock
  // runs in real time until then). The window runs past the boot's +2.5 s check (set just before hello is sent), which
  // finds nothing, or, when the pause landed late, came while the read waited and never reached the plugin; either way
  // the reader is free at the end.
  app = await pageBoot(TABS('coach'), { clock: { time: Date.now() },
    init: HIDDEN + 'window.__vis = "hidden";' + COLD_SHARE + 'window.__fpShellHelloSilent = true; window.__fpTabsFailsafeMs = 1000;' });
  try {
    await pause(app);
    const l = await linkOf(app);
    const pre = await ev(app, () => ({ mode: _fp.tabs.mode, asked: _fp.tabs.asked, hello: !!_fp.hello, reads: __reads.length,
      dismiss: __fpShell.calls.filter((c) => c[0] === 'dismiss' && c[1] && c[1].screen === 'tabs').length }));
    assert(pre.mode && pre.asked && !pre.hello && pre.reads === 0 && pre.dismiss === 0 && l.length === 1 && l[0].mode === 'waiting' && l[0].covered === true,
      'hidden: in tabs mode with its hello out, the link taken under the WAITING Coach tab, nothing read yet: ' + J([pre, l]));
    const shown = await ev(app, () => { window.__vis = 'visible'; return performance.now(); });
    const h0 = await helloOf(app);
    await runTo(app, Math.max(shown + 1600, h0.at + 2600));
    await runFor(app, 300);
    const m = await look(app, 0);
    const t = await ev(app, () => ({ left: _fp.tabs.left, why: _fp.tabs.why, busy: _shareBusy }));
    assert(t.left && t.why === 'no-hello', 'the failsafe left tabs mode: ' + J(t));
    assert(m.links.length === 1 && m.links[0].covered === true && m.reads.length >= 1 && m.reads[0].got && !m.reads[0].hello
      && m.reads[0].at - shown >= 999 && m.reads[0].at - shown < 2000 && m.reads.slice(1).every((r) => r.got === false) && t.busy === false,
      'the read at the leave (1 s of visible time after the show), long before its 3 s bound (a later check finds nothing, the reader free): '
      + J([m.links, m.reads, shown, h0.at, t.busy]));
    assert(m.tab === 'coach' && m.view === 'chat' && m.photo && m.box === WORDS && m.draft && m.draft.text === WORDS,
      'the web chat with the photo, the comment in both drafts (hello still out): ' + J(m));
  } finally { await app.close(); }
  // The same boot with the head's way out first: the parser held after the head script until the failsafe (1 s of
  // visible time, no hello yet) has left. The page then boots out of tabs mode as one that left at boot (told, no-hello,
  // its hello naming coach alone), so the read waits for no hello and goes at the link, the comment in both drafts.
  // The window runs past the boot's +2.5 s check (set just before hello is sent) wherever the pause landed: the read at
  // the link waited for nothing, so the reader is free long before that check, which reads and finds nothing.
  const hold = await parserHold();
  app = null;
  try {
    app = await pageBoot(TABS('coach'), { clock: { time: Date.now() }, html: hold.html,
      init: COLD_SHARE + hold.init + 'window.__fpShellHelloSilent = true; window.__fpTabsFailsafeMs = 1000;' });
    await pause(app);
    const l = await linkOf(app);
    const h0 = await helloOf(app);
    await runTo(app, Math.max(l[0].at + 600, h0.at + 2600));
    await runFor(app, 100);
    const m = await look(app, 0);
    const h = await helloOf(app);
    const t = await ev(app, () => ({ mode: _fp.tabs.mode, left: _fp.tabs.left, why: _fp.tabs.why, told: _fp.tabs.told, asked: _fp.tabs.asked,
      dismiss: __fpShell.calls.filter((c) => c[0] === 'dismiss' && c[1] && c[1].screen === 'tabs').length, seen: window.__holdSeen || null }));
    assert(hold.st.released === 'page' && t.seen && t.seen.fp === 'undefined' && t.seen.render === 'undefined',
      'the head\'s way out came while the parser held the main script (released at the page\'s word): ' + J([hold.st, t.seen]));
    assert(!t.mode && t.left && t.why === 'no-hello' && t.told && t.asked === false && t.dismiss === 1 && h && J(h.args.screens) === '["coach"]' && !h.answer,
      'out of tabs mode from the boot, told, one dismiss tabs, its hello naming coach alone (still out): ' + J([t, h]));
    assert(l.length === 1 && l[0].tab === 'coach' && l[0].mode === null && l[0].covered === false && m.reads.length === 2 && m.reads[0].got && !m.reads[0].hello
      && m.reads[0].at - l[0].at < 500 && m.reads[1].got === false,
      'the link taken out of tabs mode on Coach, and the share read at it (no wait for hello); the boot check then finds nothing, and no other read: ' + J([l, m.reads]));
    assert(m.tab === 'coach' && m.view === 'chat' && m.photo && m.box === WORDS && m.draft && m.draft.text === WORDS,
      'the web chat with the photo, the comment in both drafts (hello still out): ' + J(m));
  } finally { try { if (app) await app.close(); } finally { hold.close(); } }
});

// ── No key ────────────────────────────────────────────────────────────────────────────────────────────────────────
serial('no key: a share lands on the connect route with _fp.draft holding the comment; after Connect (coachHome.setKey under tabs; setApiKey and render under build 60\'s coach) the chat is presented with that draft and the photo', async () => {
  for (const shell of ['tabs', 'coach']) {
    const app = await pageBoot(shell, { nokey: true });
    try {
      await readyChecked(app, true);
      const i = await ev(app, () => __fpShell.calls.length);
      await ev(app, async (a) => {
        window.__held = { imageBase64: a.photo, comment: a.words };
        if (window.__fpShell.flag.tabs) await __fpShell.select('coach', 'deepLink');
        _trovoOpen('trovo://share');
        await __w(400);
      }, { photo: PHOTO, words: WORDS });
      const a = await look(app, i);
      assert(a.tab === 'coach' && a.img && a.draft && a.draft.text === WORDS && a.ops.length === 0, shell + ': no chat yet, the comment kept as _fp.draft: ' + J(a));
      // the newest Coach tab model of the document (one goes only when it changed: the share changes no route)
      if (shell === 'tabs') { const h = await look(app, 0); assert(h.home === 'connect', 'tabs: the Coach tab\'s model on the connect route: ' + J(h)); }
      else assert(!!(await ev(app, () => document.getElementById('coach-key-input'))), 'coach: the web connect screen: ' + J(a));
      const k = await ev(app, async (tabs) => {
        const r = tabs ? await __fpShell.call('coachHome.setKey', { secret: 'sk-ant-test-connect' }) : (setApiKey('sk-ant-test-connect'), render(), { ok: true });
        await __w(100);
        return r;
      }, shell === 'tabs');
      const b = await look(app, i);
      assert(k.ok === true && J(b.ops) === J(['present coach']) && b.onPresent.image && b.onPresent.image.key === b.key
        && b.onPresent.draft && b.onPresent.draft.text === WORDS && b.onPresent.draft.nonce === a.draft.nonce,
        shell + ': after Connect the chat is presented with the draft and the photo: ' + J([k, b]));
      const img = await ev(app, (key) => __fpShell.call('coach.image', { key }), b.key);
      assert(img.ok === true && img.data === PHOTO, shell + ': the native composer fetches the photo: ' + J(img));
    } finally { await app.close(); }
  }
});

// ── dev.nav under tabs ────────────────────────────────────────────────────────────────────────────────────────────
// dev.nav's route in the flag, the flag's selected on its head (contract 9's mapping).
const navBoot = (route, selected, o) => pageBoot(TABS(selected, { dev: { nav: route } }), o);
const navLook = (app) => ev(app, () => ({ sel: __tap.filter((e) => e.name === 'selectTab').map((e) => ({ args: e.args, answer: e.answer, hello: e.hello })),
  sheets: __tap.filter((e) => e.name === 'sheets').map((e) => ({ open: e.args.open, hello: e.hello })), seq: __fpShell.state().scene.seq,
  scene: __fpShell.state().scene.selected, tab: currentTab, sub: logSubTab, view: coachView,
  ops: __fpShell.calls.filter((c) => c[0] === 'present' || c[0] === 'dismiss').map((c) => c[0] + ' ' + c[1].screen),
  back: __fpShell.sent.filter((m) => m[0] === 'tabs.select').length, hello: !!_fp.hello }));

serial('dev.nav under tabs: log/workout, progress, coach and settings boot on their head and send one selectTab that moves nothing; coach/chat declares the Coach tab and presents the chat', async () => {
  for (const [route, head] of [['log/workout', 'log'], ['progress', 'progress'], ['coach', 'coach'], ['settings', 'settings']]) {
    const app = await navBoot(route, head, route === 'log/workout' ? { init: 'try { sessionStorage.removeItem("fp_tab"); } catch (e) {}' } : {});
    try {
      await app.page.waitForFunction(() => window.__tap.some((e) => e.name === 'selectTab' && e.answer), null, { timeout: 15000 });
      await settle(app, 200);
      const o = await navLook(app);
      assert(o.sel.length === 1 && J(o.sel[0].args) === J({ tab: head }) && J(o.sel[0].answer) === J({ tab: head, seq: 0 }) && o.seq === 0 && o.back === 0,
        route + ': one selectTab of the selected tab, the seq unchanged: ' + J(o));
      assert(o.tab === head && o.scene === head && (route !== 'log/workout' || o.sub === 'workout'), route + ': on its head: ' + J(o));
    } finally { await app.close(); }
  }
  const app = await navBoot('coach/chat', 'coach');
  try {
    await app.page.waitForFunction(() => window.__fpShell.calls.some((c) => c[0] === 'present' && c[1].screen === 'coach'), null, { timeout: 15000 });
    await settle(app, 100);
    const o = await navLook(app);
    assert(J(o.ops) === J(['present coachHome', 'present coach']) && o.view === 'chat' && o.tab === 'coach', 'coach/chat: the Coach tab declared, then the chat presented: ' + J(o));
    assert(o.sel.length === 1 && J(o.sel[0].args) === J({ tab: 'coach' }) && J(o.sel[0].answer) === J({ tab: 'coach', seq: 0 }) && o.seq === 0,
      'coach/chat: one selectTab of the selected tab: ' + J(o));
  } finally { await app.close(); }
});

serial('dev.nav under tabs with hello late: overlay/how, settings/storage-sheet and modal/routines are announced (sheets {open:true}) before hello\'s answer; modal/* sends no selectTab; runner/rest selects Log and is not announced (D8); a reload in the same launch routes nothing', async () => {
  const LATE = 'window.__fpShellHelloDelay = 4000;';
  for (const [route, head, up] of [['overlay/how', 'log', () => document.getElementById('wf-view').style.display === 'block'],
    ['settings/storage-sheet', 'settings', () => !!document.getElementById('fpStoreOverlay')],
    ['modal/routines', 'log', () => !!document.getElementById('routinesOverlay')]]) {
    const app = await navBoot(route, head, { init: LATE + STORE_PLUGIN });
    try {
      await app.page.waitForFunction(up, null, { timeout: 15000 });
      await app.page.waitForFunction(() => window.__tap.some((e) => e.name === 'sheets' && e.args.open === true), null, { timeout: 15000 });
      const o = await navLook(app);
      const open = o.sheets.filter((s) => s.open === true);
      assert(open.length === 1 && open[0].hello === false, route + ': announced once, before hello\'s answer: ' + J(o));
      if (head === 'settings') assert(o.sel.length === 1 && J(o.sel[0].args) === J({ tab: 'settings' }) && o.tab === 'settings', route + ': one selectTab {tab:\'settings\'}: ' + J(o));
      else assert(o.sel.length === 0 && o.tab === 'log', route + ': no selectTab: ' + J(o));
      if (route === 'modal/routines') {
        await app.page.waitForFunction(() => window._fp && _fp.hello, null, { timeout: 15000 });
        await settle(app, 100);
        await app.reload();
        await settle(app, 600);
        const r = await navLook(app);
        const routines = await ev(app, () => !!document.getElementById('routinesOverlay'));
        assert(!routines && r.sel.length === 0 && r.sheets.every((s) => s.open === false), 'a reload in the same launch routes nothing: ' + J([routines, r]));
      }
    } finally { await app.close(); }
  }
  const app = await navBoot('runner/rest', 'log');
  try {
    await app.page.waitForFunction(() => window.runnerOpen === true && window.__tap.some((e) => e.name === 'selectTab' && e.answer), null, { timeout: 15000 });
    await settle(app, 300);
    const o = await navLook(app);
    assert(o.sel.length === 1 && J(o.sel[0].args) === J({ tab: 'log' }) && J(o.sel[0].answer) === J({ tab: 'log', seq: 0 }) && o.tab === 'log',
      'runner/rest: one selectTab {tab:\'log\'}: ' + J(o));
    assert(o.sheets.every((s) => s.open === false), 'runner/rest: the runner is not announced: ' + J(o));
  } finally { await app.close(); }
});
