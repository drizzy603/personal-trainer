// fp-spec: self-shelled
// 123: the native Coach tab, page side (plan task P7; P8 appends; contract 1.4, 1.5, 3.2, 3.6, 3.7, 4.1, 4.2, 8.3,
// 8.4, D3, D14, D17, D21, I6, I12, I13, I16). Every boot names its shell; the coach API answers at once, as in 118.
// - hello names coachHome, coach and tabs in tabs mode whatever kt_native_off says, coach alone in classic mode, none
//   with FP_NATIVE false.
// - The declaration: under tabs, after hello, the Coach tab's model then one present, and the bar's model once; with
//   kt_native_off one dismiss and no present; the About switch both ways (dismiss, then the model and present); a
//   present refused (the mock's refuse, or not-presentable once the scene fell back unheard) or a model that throws (at
//   the first declaration, or at a later check) ends in dismiss and the page's web Coach; a forced present of the chat
//   refused not-native does too (the chat and the Coach tab go together); under tabsWeb no coachHome message at all.
// - The placeholder: with the Coach tab native, #screen holds only .kt-fp-ph[data-fp-screen="coachHome"] (no key field
//   with no key); under tabsWeb the web hub; on the Coach tab the About switch's own paint follows the wish (the web
//   hub at off, the placeholder at on).
// - Pushes on change: renders with nothing new push nothing; a message, a reply in flight, a new name and applyTheme
//   each push one model with a higher rev (the bar's room follows the theme); revs rise across the three screens; a
//   snapshot is the model now with a new rev and counts as its push; classic mode sets no models check.
// - The joint rule: the chat is presented only while the Coach tab is native (tabs); 60's rule under coach61.
// - Covered (8.4): the native Coach tab covers the page, still after Back pops the chat (a toast is forwarded); Log
//   never; screens.off coachHome turns the Coach tab web with nothing sent back.
// - The take-over (3.2, I13): up naming both with Coach selected and a key: no present, both shown, the chat view, the
//   models pushed, no selectTab; the same after a reload under the mock's own scene (up from it, no 3 s WEB); with Log
//   selected the chat is dismissed; with no key the chat is dismissed and the connect route is the model's; with
//   kt_native_off both are dismissed once each and the web Coach drawn; tabs in up is ignored, never dismissed.
// - screens.off (4.2): coachHome needs; coach with a draft taken by the putBack rule (every case of the shared vectors,
//   Fixtures/draft/putback.json, through the handler, with the web composer off screen and, P13, on it: its box) and
//   answered took; a draft off coach ignored; a numeric draft bad-args; the mock's composer cleared only after took.
// - The words survive (P-D15, I16): kt_coach_handover is written before the took answer, is device-only bookkeeping
//   (no backup carries it), comes back after a reload in the fallen-back scene, after a relaunch and in the first
//   paint of a reload on the Coach tab in setup (then to the native setup chat as its draft), goes back to a
//   native chat as its draft and leaves on coach.draftTaken with the web copy (one composer at a time, a trailing line
//   too), follows the box (a render, the page hidden), and leaves on a send from either composer and on an emptied
//   box; a failed write answers without took and changes nothing; under STORE=shadow the native copy has the key.
// - The page's own text never takes their place: with the web chat on screen coachPrefill puts its draft in front of
//   them (putBack), a Today card's question, a chip and a seeded prompt (label and stamp kept) go without them, and a
//   prompt during a reply waits in front of them (tabs and coach61; with no key the composer is as it always was);
//   under the native chat a page draft leaves them in the key, a later hand-over merges over them (every shared vector
//   runs with the composer's words in the key too), and a web chat the page itself brings back shows them beside the
//   draft, then hands both to the native chat as one draft.
// - confirm and toast.undo answer before their action runs (D14); a spent id answers stale.
// - Setup keeps its answers: the setup chat has Cancel and no Back, a tab change dismisses it with setup kept and the
//   Coach tab's model saying resume, and Coach presents it again; the intake error says "top left".
// - The Coach tab's actions (P8; contract 4.1, 4.5, 5; T11 c, d): setKey carries a canary key (sk-ant-test- and 16
//   random characters, K8) into kt_apikey, trimmed, and nowhere else: no TrovoShell call, model, console line, _fpLog
//   line, watch context, sessionStorage, _fp, other storage key or DOM, and under STORE=shadow the native store never
//   saw kt_apikey; "API key saved" forwarded; the answer before the ping's fetch (held 3 s). A forced failure answers
//   exception and nothing carries any part of the canary. setKey refuses in order: bad-args, off, stale (no toast),
//   invalid (the err toast forwarded); a second call right after a good one is stale. Every coachHome.* answers off
//   where the native Coach tab is not in use (tabsWeb, coach61, build 60's coach, kt_native_off, screens.off
//   coachHome) and changes nothing. disconnect, clearChat and startIntake forward their confirms and act on yes (setup
//   presented with Cancel and no Back); nokey, empty, intake; stale on Log, where no web sheet opens. openChat
//   presents the chat, its model first; has-programme; openStarter selects Log before it paints the starter, which is
//   announced.
const fs = require('fs');
const path = require('path');
const { boot, assert, run } = require('../lib/harness');

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
const VECTORS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'ios', 'App', 'FPKit', 'Tests', 'FPCoreTests', 'Fixtures',
  'draft', 'putback.json'), 'utf8'));
const KEY = 'sk-ant-test';
const WORDS = 'unsent words';

// In the page, before its scripts: the coach API answering at once (as spec 118's), and the helpers the cases share.
// __decl(i): the screen messages (present, dismiss, model) the mock heard from call i on, as 'present coachHome';
// __last(s): the newest model pushed for a screen; __screen(): what #screen holds.
const INIT = `(() => {
  window.__turns = [];
  window.fetch = async (url, o) => {
    if (!String(url).includes('anthropic')) return new Response('', { status: 404 });
    const body = JSON.parse(o.body);
    if (body.tools) window.__turns.push(body.messages.slice(-1)[0].content);
    return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', content: [{ type: 'text', text: body.tools ? 'On it.' : '{"message":"ok","actions":[]}' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  window.__w = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__idle = async () => { for (let i = 0; i < 150 && coachLoading; i++) await __w(20); await __w(40); };
  window.__n = () => __fpShell.calls.length;
  window.__decl = (i) => __fpShell.calls.slice(i || 0).filter((c) => ['present', 'dismiss', 'model'].indexOf(c[0]) >= 0)
    .map((c) => c[0] + ' ' + (c[1] && c[1].screen));
  window.__models = (s) => __fpShell.calls.filter((c) => c[0] === 'model' && c[1].screen === s).map((c) => JSON.parse(c[1].json));
  window.__last = (s) => { const m = __models(s); return m.length ? m[m.length - 1] : null; };
  window.__screen = () => {
    const s = document.getElementById('screen'), box = document.getElementById('coach-input');
    return { kids: [...s.children].map((e) => e.className + (e.getAttribute('data-fp-screen') ? '/' + e.getAttribute('data-fp-screen') : '')),
      hub: !!s.querySelector('.kt-hero'), key: !!s.querySelector('#coach-key-input'), input: box ? box.value : null };
  };
  window.__key = () => localStorage.getItem('kt_coach_handover');
})();`;
const pageBoot = (shell, o) => {
  o = o || {};
  return boot(Object.assign({ native: true, shell }, o, { init: INIT + (o.init || ''),
    seed: Object.assign({ kt_apikey: KEY, kt_coach_msgs: '[]' }, o.seed || {}) }));
};
// Hello answered (under a flag) and the morning card's fetch done (it repaints Log a beat after the boot).
const ready = (app, flag) => app.page.waitForFunction((flag) => (!flag || (window._fp && _fp.hello)) && typeof coachCardLoading !== 'undefined'
  && !coachCardLoading, flag === undefined ? true : flag, { timeout: 15000 }).then(() => settle(app, 80));
const GETTER = (name) => 'Object.defineProperty(window, "' + name + '", { configurable: true, get: function () { return false; } });';
// The mock refuses every present from its first call (window.__fpShell is the mock's own, set after opts.init).
const REFUSE = 'Object.defineProperty(window, "__fpShell", { configurable: true, set: function (v) { v.refuse.present = "not-presentable: refused by the spec";'
  + ' Object.defineProperty(window, "__fpShell", { value: v, writable: true, configurable: true, enumerable: true }); } });';
const HIDDEN = 'window.__vis = "visible"; Object.defineProperty(document, "visibilityState", { configurable: true, get: function () { return window.__vis; } });';

// ── hello and the declaration ──────────────────────────────────────────────────────────────────────────────────────
serial('the declaration under tabs: after hello the Coach tab\'s model, then one present, and the bar\'s model once; the About switch both ways; renders with nothing new push nothing, each change one model with a higher rev; covered while native, after Back too; screens.off coachHome turns the tab web with nothing sent back', async () => {
  const app = await pageBoot('tabs');
  try {
    await ready(app);
    const out = await ev(app, async () => {
      const r = {};
      r.hello = __fpShell.of('hello').map((h) => h.screens);
      r.boot = { decl: __decl(), declared: _fp.declared.coachHome, shown: !!_fp.shown.coachHome, mode: _fpCoachMode(), tab: currentTab,
        covered: _fpCovered(), home: __last('coachHome'), tabs: __last('tabs') };
      // nothing new: five renders push no model
      let n = __n();
      for (let k = 0; k < 5; k++) { render(); await __w(10); }
      await __w(30);
      r.quiet = __decl(n);
      // each change pushes one model with a higher rev
      const step = async (fn) => { const i = __n(), rev = _fp.rev; fn(); await __w(40); return { decl: __decl(i), revs: __fpShell.calls.slice(i).filter((c) => c[0] === 'model').map((c) => c[1].rev), rev0: rev }; };
      r.message = await step(() => { _pushCoach({ role: 'user', content: 'How was my week?' }); render(); });
      r.loading = await step(() => { coachLoading = true; render(); });
      r.sub = __last('coachHome').groups[0].rows[0].sub;
      coachLoading = false; render(); await __w(40);
      r.name = await step(() => { localStorage.setItem('kt_user_name', 'Zed'); render(); });
      r.greet = __last('coachHome').hero.greet;
      // the shell's snapshot answers the model as it is now and counts as its push: the next check sends nothing more
      localStorage.setItem('kt_user_name', 'Ann');
      const snap = await FPScreens.call('coachHome.snapshot', {}), sm = JSON.parse(snap.json);
      n = __n(); render(); await __w(40);
      r.snap = { ok: snap.ok, greet: sm.hero.greet, rev: sm.rev, before: r.name.revs[0], after: __decl(n) };
      r.theme = await step(() => { applyTheme('dark'); });
      r.rooms = { tabs: __last('tabs').room, home: __last('coachHome').room };
      // the Coach tab: only the placeholder, covered; the chat pushed on it; Back pops it and the tab stays covered
      n = __n();
      switchTab('coach'); await __w(40);
      r.coach = { screen: __screen(), covered: _fpCovered(), mode: _fpCoachMode(), decl: __decl(n) };
      n = __n();
      openCoachChat(); await __w(40);
      r.chat = { decl: __decl(n), shown: !!_fp.shown.coach };
      n = __n();
      const t0 = __fpShell.of('toast').length;
      r.back = { answer: await FPScreens.call('coach.back', {}) };
      await __w(40);
      showToast('Saved');
      Object.assign(r.back, { decl: __decl(n), covered: _fpCovered(), shown: !!_fp.shown.coach, toasts: __fpShell.of('toast').length - t0,
        web: document.getElementById('toast').classList.contains('show') });
      // revs rise across the chat's, the Coach tab's and the bar's models, in the order they went
      r.revs = __fpShell.calls.filter((c) => c[0] === 'model').map((c) => [c[1].screen, c[1].rev]);
      // the About switch: off is the dismiss; on is the model first, then the present
      n = __n();
      switchTab('log'); await __w(30);
      r.log = { covered: _fpCovered(), screen: __screen() };
      n = __n();
      toggleNativeChat(); await __w(40);
      r.off = { decl: __decl(n), mode: _fpCoachMode(), declared: _fp.declared.coachHome, hello: __fpShell.of('hello').length };
      n = __n();
      toggleNativeChat(); await __w(40);
      r.on = { decl: __decl(n), mode: _fpCoachMode(), declared: _fp.declared.coachHome };
      // on the Coach tab the switch redraws in its own paint, keyed on the wish: off draws the web hub before the
      // dismiss goes, on puts the placeholder back before the present
      switchTab('coach'); await __w(30);
      toggleNativeChat(); r.offNow = __screen(); await __w(40);
      toggleNativeChat(); r.onNow = __screen(); await __w(40);
      // screens.off coachHome (a piece it needs went off): the Coach tab is the web's, nothing sent back
      n = __n();
      r.off2 = { answer: await FPScreens.call('screens.off', { screen: 'coachHome', why: 'needs' }) };
      await __w(40);
      Object.assign(r.off2, { decl: __decl(n), mode: _fpCoachMode(), declared: _fp.declared.coachHome, off: _fp.off.coachHome, screen: __screen(),
        snapshot: await FPScreens.call('coachHome.snapshot', {}) });
      return r;
    });
    const ALL = '["coachHome","coach","tabs"]';
    assert(J(out.hello) === '[' + ALL + ']', 'hello names the three pieces: ' + J(out.hello));
    const b = out.boot;
    assert(J(b.decl) === J(['model coachHome', 'present coachHome', 'model tabs']) && b.declared === 'present' && b.shown && b.mode === 'native',
      'after hello: the Coach tab\'s model, one present, the bar\'s model: ' + J(b));
    assert(b.tab === 'log' && !b.covered && b.home.v === 1 && b.home.route === 'hub' && b.home.rev >= 1 && b.tabs.v === 1 && b.tabs.room === 'heavyweight' && b.tabs.rev > b.home.rev,
      'on Log, uncovered; the models: ' + J([b.home.rev, b.tabs]));
    assert(out.quiet.length === 0, 'five renders with nothing new push nothing: ' + J(out.quiet));
    for (const k of ['message', 'loading', 'name']) {
      const s = out[k];
      assert(J(s.decl) === '["model coachHome"]' && s.revs.length === 1 && s.revs[0] > s.rev0, k + ': one Coach tab model with a higher rev: ' + J(s));
    }
    assert(out.sub === 'Coach is replying…' && out.greet === 'Hi Zed.', 'the models carry the change: ' + J([out.sub, out.greet]));
    assert(out.snap.ok && out.snap.greet === 'Hi Ann.' && out.snap.rev > out.snap.before && out.snap.after.length === 0,
      'a snapshot is the model now, with a new rev, and counts as its push: ' + J(out.snap));
    assert(out.theme.decl.length === 2 && out.theme.decl.indexOf('model coachHome') >= 0 && out.theme.decl.indexOf('model tabs') >= 0
      && out.theme.revs.every((v) => v > out.theme.rev0) && out.rooms.tabs === 'dark' && out.rooms.home === 'dark',
      'applyTheme: one model of each, in the new room: ' + J([out.theme, out.rooms]));
    assert(J(out.coach.screen.kids) === '["kt-fp-ph/coachHome"]' && !out.coach.screen.hub && !out.coach.screen.key && out.coach.screen.input === null
      && out.coach.covered && out.coach.mode === 'native' && out.coach.decl.length === 0, 'the Coach tab: only the placeholder, covered, nothing sent: ' + J(out.coach));
    assert(J(out.chat.decl) === '["model coach","present coach"]' && out.chat.shown, 'the chat is pushed on the native Coach tab: ' + J(out.chat));
    assert(out.back.answer.ok && J(out.back.decl) === '["dismiss coach"]' && out.back.covered && !out.back.shown && out.back.toasts === 1 && !out.back.web,
      'Back pops the chat; the native hub still covers the page and the toast is forwarded: ' + J(out.back));
    assert(out.revs.length >= 6 && out.revs.every((x, i, a) => i === 0 || x[1] > a[i - 1][1]) && ['coach', 'coachHome', 'tabs'].every((s) => out.revs.some((x) => x[0] === s)),
      'revs rise across the three screens\' models: ' + J(out.revs));
    assert(!out.log.covered && out.log.screen.kids.indexOf('kt-fp-ph/coachHome') < 0, 'Log is never covered: ' + J(out.log));
    assert(J(out.off.decl) === '["dismiss coachHome"]' && out.off.mode === 'web' && out.off.declared === 'dismiss' && out.off.hello === 1,
      'the About switch off: one dismiss: ' + J(out.off));
    assert(J(out.on.decl) === '["model coachHome","present coachHome"]' && out.on.mode === 'native' && out.on.declared === 'present',
      'the About switch on: the model first, then the present: ' + J(out.on));
    assert(out.offNow.hub && out.offNow.kids.indexOf('kt-fp-ph/coachHome') < 0 && J(out.onNow.kids) === '["kt-fp-ph/coachHome"]',
      'on the Coach tab the switch\'s own paint follows the wish: the web hub at off, the placeholder at on: ' + J([out.offNow, out.onNow]));
    const o2 = out.off2;
    assert(J(o2.answer) === '{"ok":true}' && o2.decl.length === 0 && o2.mode === 'web' && o2.declared === 'dismiss' && o2.off === 'needs'
      && o2.screen.hub && o2.screen.kids.indexOf('kt-fp-ph/coachHome') < 0 && J(o2.snapshot) === '{"ok":false,"error":"off"}',
      'screens.off coachHome: the web Coach, nothing sent back; its snapshot is off: ' + J(o2));
  } finally { await app.close(); }
});

serial('the declaration\'s other ends: kt_native_off (one dismiss, no present; hello still names the three); a present refused at the first declaration, or not-presentable once the scene fell back unheard; a model that throws at the first declaration: each ends in dismiss and the web Coach', async () => {
  // kt_native_off seeded: one dismiss; then the scene falls back with its messages swallowed and the switch goes on:
  // the present is refused not-presentable, and the page draws its own Coach tab and dismisses it
  let app = await pageBoot('tabs', { seed: { kt_native_off: '1' } });
  try {
    await ready(app);
    const out = await ev(app, async () => {
      const r = {};
      r.hello = __fpShell.of('hello').map((h) => h.screens);
      r.boot = { decl: __decl(), declared: _fp.declared.coachHome, mode: _fpCoachMode() };
      switchTab('coach'); await __w(40);
      r.coach = { screen: __screen(), covered: _fpCovered(), mode: _fpCoachMode() };
      const real = window.FPScreens;
      window.FPScreens = { v: 1, call: () => Promise.resolve({ ok: true }) };
      await __fpShell.fallBack('failures');
      window.FPScreens = real;
      const n = __n();
      toggleNativeChat(); await __w(80);
      r.refused = { decl: __decl(n), off: _fp.off.coachHome, declared: _fp.declared.coachHome, mode: _fp.tabs.mode ? _fpCoachMode() : 'left',
        screen: __screen(), log: __fpShell.of('log').map((l) => l.text).filter((t) => /coachHome not presented/.test(t)) };
      return r;
    });
    assert(J(out.hello) === '[["coachHome","coach","tabs"]]', 'kt_native_off: hello still names the three: ' + J(out.hello));
    assert(J(out.boot.decl) === '["dismiss coachHome","model tabs"]' && out.boot.declared === 'dismiss' && out.boot.mode === 'web',
      'kt_native_off: one dismiss and no present: ' + J(out.boot));
    assert(out.coach.screen.hub && out.coach.screen.kids.indexOf('kt-fp-ph/coachHome') < 0 && out.coach.mode === 'web', 'kt_native_off: the web hub: ' + J(out.coach));
    const f = out.refused;
    assert(J(f.decl) === '["model coachHome","present coachHome","dismiss coachHome"]' && f.off === 'present' && f.declared === 'dismiss' && f.mode === 'web'
      && f.screen.hub && f.log.length === 1 && /not-presentable/.test(f.log[0]), 'not-presentable: _fpRefused, the dismiss, the web Coach: ' + J(f));
  } finally { await app.close(); }
  // a present the mock refuses from the first: the dismiss follows, and the page's Coach tab is its own
  app = await pageBoot('tabs', { init: REFUSE });
  try {
    await ready(app);
    const out = await ev(app, async () => {
      switchTab('coach'); await __w(40);
      return { decl: __decl(), off: _fp.off.coachHome, declared: _fp.declared.coachHome, mode: _fpCoachMode(), screen: __screen(), covered: _fpCovered() };
    });
    assert(J(out.decl.filter((d) => /coachHome/.test(d))) === '["model coachHome","present coachHome","dismiss coachHome"]' && out.off === 'present' && out.declared === 'dismiss'
      && out.mode === 'web' && out.screen.hub, 'a refused present: dismissed, the web Coach: ' + J(out));
  } finally { await app.close(); }
  // a Coach tab model that throws at the first declaration (hello answered once it is broken): no present, the dismiss
  app = await pageBoot('tabs', { init: 'window.__fpShellHelloSilent = true; window.__fpTabsFailsafeMs = 1e9;' });
  try {
    await ready(app, false);
    const out = await ev(app, async () => {
      window._coachHomeModel = () => { throw new Error('boom'); };
      window.__fpShellHelloSilent = false; _fp.hello = null; _fpHello();
      for (let i = 0; i < 100 && !_fp.hello; i++) await __w(20);
      await __w(80);
      switchTab('coach'); await __w(40);
      return { decl: __decl(), off: _fp.off.coachHome, declared: _fp.declared.coachHome, mode: _fpCoachMode(), screen: __screen(),
        log: __fpShell.of('log').map((l) => l.text).filter((t) => /coachHome model failed: boom/.test(t)).length };
    });
    assert(J(out.decl.filter((d) => /coachHome/.test(d))) === '["dismiss coachHome"]' && out.off === 'model' && out.declared === 'dismiss' && out.mode === 'web'
      && out.screen.hub && out.log === 1, 'a model that throws at the first declaration: the dismiss, the web Coach: ' + J(out));
  } finally { await app.close(); }
});

serial('the joint rule: under tabs the chat is presented only while the Coach tab is native (a model that throws at a later check takes the tab, and the chat opens web); a forced present of the chat refused not-native takes both; coach61 keeps 60\'s rule; tabsWeb sends no coachHome message; FP_NATIVE false names none', async () => {
  let app = await pageBoot('tabs');
  try {
    await ready(app);
    const out = await ev(app, async () => {
      const r = {};
      render(); r.timer = _fp.modelsT !== null;   // tabs mode: each render's pass sets one models check for its task
      await __w(20);
      switchTab('coach'); openCoachChat(); await __w(40);
      r.native = { decl: __decl().slice(-2), shown: !!_fp.shown.coach };
      switchTab('log'); await __w(40);
      let n = __n();
      window._coachHomeModel = () => { throw new Error('boom'); };
      _pushCoach({ role: 'user', content: 'A change for the hub' }); render(); await __w(80);
      r.broken = { decl: __decl(n), off: _fp.off.coachHome, declared: _fp.declared.coachHome, mode: _fpCoachMode(), coachLive: _fpLive('coach') };
      n = __n();
      switchTab('coach'); openCoachChat(); await __w(40);
      r.web = { decl: __decl(n), shown: !!_fp.shown.coach, screen: __screen() };
      return r;
    });
    assert(out.timer, 'tabs: a render sets the models check');
    assert(J(out.native.decl) === '["model coach","present coach"]' && out.native.shown, 'the chat on the native Coach tab: ' + J(out.native));
    assert(J(out.broken.decl) === '["dismiss coachHome"]' && out.broken.off === 'model' && out.broken.declared === 'dismiss' && out.broken.mode === 'web' && out.broken.coachLive,
      'a Coach tab model that throws at a later check: the dismiss: ' + J(out.broken));
    assert(out.web.decl.length === 0 && !out.web.shown && out.web.screen.input !== null, 'without the native Coach tab the chat is the web\'s: ' + J(out.web));
  } finally { await app.close(); }
  // the page's state says native, the shell's Coach tab is WEB (a dismiss the page never sent): the chat's present is
  // refused not-native, and the page draws its own chat and dismisses the Coach tab (the two go together)
  app = await pageBoot('tabs');
  try {
    await ready(app);
    const out = await ev(app, async () => {
      await Capacitor.Plugins.TrovoShell.dismiss({ screen: 'coachHome' });
      const n = __n();
      switchTab('coach'); openCoachChat(); await __w(80);
      return { decl: __decl(n), off: _fp.off.coach, home: _fp.declared.coachHome, mode: _fpCoachMode(),
        screen: __screen(), log: __fpShell.of('log').map((l) => l.text).filter((t) => /coach not presented: not-native/.test(t)).length };
    });
    assert(J(out.decl) === '["model coach","present coach","dismiss coachHome"]' && out.off === 'present' && out.home === 'dismiss' && out.mode === 'web'
      && out.screen.input !== null && out.log === 1, 'not-native: _fpRefused, the Coach tab dismissed, the web chat: ' + J(out));
  } finally { await app.close(); }
  // coach61: 60's overlay chat, no Coach tab piece
  app = await pageBoot('coach61');
  try {
    await ready(app);
    const out = await ev(app, async () => {
      switchTab('coach'); openCoachChat(); await __w(40);
      // classic mode has no Coach tab or bar model to check: a render sets no models timer
      render(); const timer = _fp.modelsT;
      return { hello: __fpShell.of('hello').map((h) => h.screens), decl: __decl(), shown: !!_fp.shown.coach, mode: _fpCoachMode(), timer };
    });
    assert(out.timer === null, 'coach61: a render schedules no models check: ' + J(out.timer));
    assert(J(out.hello) === '[["coach"]]' && J(out.decl) === '["model coach","present coach"]' && out.shown && out.mode === null,
      'coach61: hello names coach, and the chat presents on 60\'s rule: ' + J(out));
  } finally { await app.close(); }
  // tabsWeb: the bar only, the web Coach tab: no coachHome message at all
  app = await pageBoot('tabsWeb');
  try {
    await ready(app);
    const out = await ev(app, async () => {
      switchTab('coach'); await __w(40);
      const r = { hello: __fpShell.of('hello').map((h) => h.screens), reply: _fp.hello.screens, screen: __screen(), mode: _fpCoachMode(),
        snapshot: await FPScreens.call('coachHome.snapshot', {}) };
      openCoachChat(); await __w(40);
      r.chat = __screen().input !== null;
      r.home = __fpShell.calls.filter((c) => c[1] && c[1].screen === 'coachHome').length;
      r.decl = __decl();
      return r;
    });
    assert(J(out.hello) === '[["coachHome","coach","tabs"]]' && J(out.reply) === '["tabs"]' && out.home === 0 && J(out.decl) === '["model tabs"]'
      && out.screen.hub && out.mode === 'web' && out.chat && J(out.snapshot) === '{"ok":false,"error":"off"}', 'tabsWeb: no coachHome message, the web hub and chat: ' + J(out));
  } finally { await app.close(); }
  // FP_NATIVE false: hello names nothing
  app = await pageBoot('tabs', { init: GETTER('FP_NATIVE') });
  try {
    await ready(app);
    const hello = await ev(app, () => __fpShell.of('hello').map((h) => h.screens));
    assert(J(hello) === '[[]]', 'FP_NATIVE false: hello names none: ' + J(hello));
  } finally { await app.close(); }
});

// ── the take-over ──────────────────────────────────────────────────────────────────────────────────────────────────
serial('the take-over (3.2, I13): up naming the Coach tab and the chat with Coach selected and a key: no present, both shown, the chat view, the models pushed, no selectTab; the same after a reload under the mock\'s own scene, with no 3 s WEB; Log selected: the chat dismissed; no key: the chat dismissed and the connect route', async () => {
  const UP = 'window.__fpShellUp = ["coachHome", "coach"];';
  const PRE = 'window.__fpShellPre = { selected: "coach", seq: 1 };';
  const taken = (app) => ev(app, async () => {
    await __w(60);
    return { tab: currentTab, view: coachView, shown: Object.assign({}, _fp.shown), declared: _fp.declared.coachHome, mode: _fpCoachMode(), covered: _fpCovered(),
      decl: __decl(), select: __fpShell.of('selectTab').length, screen: __screen(), home: __last('coachHome'),
      snaps: __fpShell.sent.filter((s) => /snapshot$/.test(s[0])).map((s) => [s[0], !!(s[2] && s[2].ok && s[2].json)]),
      log: __fpShell.of('log').map((l) => l.text).filter((t) => /taken over|not taken over/.test(t)) };
  });
  // the take-over's own words, in its order: the Coach tab first, then the chat
  const BOTH = ['fp: coachHome taken over from the document before', 'fp: coach taken over from the document before'];
  const HOME_ONLY = ['fp: coachHome taken over from the document before', 'fp: coach not taken over: dismissed'];
  // a fresh document on the hub view: the page adopts the chat view the shell shows
  let app = await pageBoot('tabs', { init: UP + PRE });
  try {
    await ready(app);
    const t = await taken(app);
    assert(t.tab === 'coach' && t.view === 'chat' && t.shown.coachHome && t.shown.coach && t.declared === 'present' && t.mode === 'native' && t.covered,
      'both taken over, on the chat view: ' + J(t));
    assert(t.decl.filter((d) => /^(present|dismiss)/.test(d)).length === 0 && t.select === 0, 'no present, no dismiss, no selectTab: ' + J(t));
    assert(['model coachHome', 'model coach', 'model tabs'].every((d) => t.decl.indexOf(d) >= 0) && J(t.screen.kids) === '["kt-fp-ph/coachHome"]',
      'the models pushed; the placeholder: ' + J([t.decl, t.screen]));
    assert(J(t.snaps) === J([['coachHome.snapshot', true], ['coach.snapshot', true]]) && J(t.log) === J(BOTH), 'the resync\'s snapshots answered: ' + J([t.snaps, t.log]));
  } finally { await app.close(); }
  // the mock's own scene: the chat presented in the first document; a reload's hello names both from the scene
  app = await pageBoot('tabs');
  try {
    await ready(app);
    await ev(app, async () => { switchTab('coach'); openCoachChat(); await __w(60); });
    await app.reload();
    await ready(app);
    const t = await taken(app);
    assert(t.tab === 'coach' && t.view === 'chat' && t.shown.coachHome && t.shown.coach && t.declared === 'present' && t.mode === 'native'
      && t.decl.filter((d) => /^(present|dismiss)/.test(d)).length === 0 && t.select === 0 && J(t.log) === J(BOTH),
      'a reload under the native chat: taken over from the scene: ' + J(t));
    await settle(app, 3300);   // past the WAITING tab's 3 s net, which a taken-over NATIVE tab never starts
    const s = await ev(app, () => ({ scene: __fpShell.state().scene.coach, pushed: __fpShell.state().scene.pushed, off: __fpShell.sent.filter((x) => x[0] === 'shell.covered' && !x[1].on).length,
      shown: !!_fp.shown.coachHome, up: __fpShell.of('hello').length }));
    assert(s.scene === 'native' && s.pushed && s.off === 0 && s.shown, 'NATIVE stays NATIVE: no 3 s WEB: ' + J(s));
  } finally { await app.close(); }
  // Log selected: the Coach tab is taken over, the chat dismissed, the page stays on Log
  app = await pageBoot('tabs', { init: UP });
  try {
    await ready(app);
    const t = await taken(app);
    assert(t.tab === 'log' && t.view === 'home' && t.shown.coachHome && !t.shown.coach && t.declared === 'present' && J(t.decl.filter((d) => /^(present|dismiss)/.test(d))) === '["dismiss coach"]'
      && t.select === 0 && J(t.log) === J(HOME_ONLY),
      'Log selected: the Coach tab taken over, the chat dismissed (never taken), still on Log: ' + J(t));
  } finally { await app.close(); }
  // no key: the chat dismissed, the Coach tab taken over on its connect route; #screen holds only the placeholder
  app = await pageBoot('tabs', { init: UP + PRE, seed: { kt_apikey: '' } });
  try {
    await ready(app);
    const t = await taken(app);
    assert(t.tab === 'coach' && t.view === 'home' && t.shown.coachHome && !t.shown.coach && J(t.decl.filter((d) => /^(present|dismiss)/.test(d))) === '["dismiss coach"]'
      && J(t.log) === J(HOME_ONLY)
      && t.home && t.home.route === 'connect' && J(t.screen.kids) === '["kt-fp-ph/coachHome"]' && !t.screen.key && !t.screen.hub,
      'no key: the chat dismissed, the connect route, only the placeholder (no key field): ' + J(t));
  } finally { await app.close(); }
  // up naming tabs too (a shell never does: the root is not presented): ignored, never dismissed, which would say the
  // page left tabs mode and take the bar away from a page still in it
  app = await pageBoot('tabs', { init: 'window.__fpShellUp = ["coachHome", "coach", "tabs"];' + PRE });
  try {
    await ready(app);
    const t = await taken(app);
    const s = await ev(app, () => ({ mode: _fp.tabs.mode, fellBack: __fpShell.state().scene.fellBack, dismiss: __fpShell.of('dismiss').map((d) => d.screen) }));
    assert(t.shown.coachHome && t.shown.coach && J(t.log) === J(BOTH) && s.mode && s.fellBack === null && s.dismiss.length === 0,
      'tabs in up: ignored, both taken over, still in tabs mode: ' + J([t.log, s]));
  } finally { await app.close(); }
  // the About switch off on this iPhone: the page cannot take the Coach tab over, so both are dismissed, the Coach
  // tab's dismiss is its declaration (sent once), and the page draws its web Coach
  app = await pageBoot('tabs', { init: UP + PRE, seed: { kt_native_off: '1' } });
  try {
    await ready(app);
    const t = await taken(app);
    assert(t.tab === 'coach' && !t.shown.coachHome && !t.shown.coach && t.declared === 'dismiss' && t.mode === 'web'
      && J(t.decl.filter((d) => /^(present|dismiss)/.test(d))) === '["dismiss coachHome","dismiss coach"]' && t.select === 0
      && J(t.log) === J(['fp: coachHome not taken over: dismissed', 'fp: coach not taken over: dismissed']) && t.screen.hub,
      'kt_native_off: both dismissed once, the web Coach: ' + J(t));
  } finally { await app.close(); }
});

// ── screens.off and the handed-over words ──────────────────────────────────────────────────────────────────────────
serial('screens.off: coach with a draft is taken by the putBack rule (an empty composer, one holding the words, one with others; every shared vector) and stored before the took answer; a draft off coach is ignored; a numeric draft is bad-args; the key is device-only bookkeeping, mirrored to the native copy', async () => {
  const app = await pageBoot('tabs');
  try {
    await ready(app);
    const out = await ev(app, async ({ WORDS, VECTORS }) => {
      const r = {};
      // the shell takes the Coach tab away first (needs), so the chat is the web's on the Coach tab
      await FPScreens.call('screens.off', { screen: 'coachHome', why: 'needs' }); await __w(30);
      switchTab('coach'); openCoachChat(); await __w(40);
      r.web = __screen().input;
      // the write lands before the answer: a spy on Storage.prototype.setItem and the answer, in order
      const order = [], set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (k === 'kt_coach_handover') order.push(['set', v]); return set.apply(this, arguments); };
      const a1 = await FPScreens.call('screens.off', { screen: 'coach', why: 'failures', draft: WORDS }).then((a) => { order.push(['answer', a]); return a; });
      Storage.prototype.setItem = set;
      await __w(40);
      r.empty = { a: a1, order, input: __screen().input, key: __key(), draft: _coachDraft.v, off: _fp.off.coach };
      r.held = { a: await FPScreens.call('screens.off', { screen: 'coach', draft: WORDS }) };
      await __w(40);
      Object.assign(r.held, { input: __screen().input, key: __key() });
      document.getElementById('coach-input').value = 'my own';
      r.other = { a: await FPScreens.call('screens.off', { screen: 'coach', draft: WORDS }) };
      await __w(40);
      Object.assign(r.other, { input: __screen().input, key: __key() });
      // a draft with any other screen: ignored, no took; a draft that is not a string: bad-args
      r.ignored = { a: await FPScreens.call('screens.off', { screen: 'coachHome', why: 'needs', draft: 'other words' }), key: __key(), input: __screen().input };
      r.bad = await FPScreens.call('screens.off', { screen: 'coach', draft: 5 });
      r.shadow = window.__ktMock ? window.__ktMock.values().kt_coach_handover : null;
      // device-only bookkeeping: no backup list, no export; Storage's Put back leaves it out
      r.lists = { backup: BACKUP_KEYS.indexOf('kt_coach_handover'), raw: RAW_STRING_KEYS.indexOf('kt_coach_handover'), book: _fpBookkeeping('kt_coach_handover'),
        exported: Object.prototype.hasOwnProperty.call(buildBackupJSON(), 'kt_coach_handover'), named: Object.prototype.hasOwnProperty.call(_FP_KEY_NAMES, 'kt_coach_handover') };
      // every shared vector through the handler: the composer off screen (Log), the words handed over; once with no
      // key (the composer's words are the owner's own) and once with the composer's words in the key, as the key
      // follows the composer after an earlier hand-over (a blank composer leaves no key): the handler merges over the
      // key's words too
      switchTab('log'); await __w(30);
      r.vectors = [];
      for (const c of VECTORS.cases) {
        for (const held of [false, true]) {
          if (held && !c.composer.trim()) continue;
          if (held) localStorage.setItem('kt_coach_handover', c.composer); else localStorage.removeItem('kt_coach_handover');
          _coachDraft = { v: c.composer, s: 0, e: 0, focus: false };
          const a = await FPScreens.call('screens.off', { screen: 'coach', why: 'failures', draft: c.words });
          r.vectors.push({ name: c.name + (held ? ' (the key holds the composer)' : ''), a, got: _coachDraft.v, key: __key(), want: c.result, page: _fpPutBack(c.composer, c.words) });
        }
      }
      return r;
    }, { WORDS, VECTORS });
    assert(out.web === '', 'the web chat with an empty composer: ' + J(out.web));
    const e = out.empty;
    assert(J(e.a) === '{"ok":true,"took":true}' && e.input === WORDS && e.key === WORDS && e.draft === WORDS && e.off === 'failures',
      'an empty composer takes the words, stored, answered took: ' + J(e));
    assert(J(e.order) === J([['set', WORDS], ['answer', { ok: true, took: true }]]), 'kt_coach_handover is written before the answer: ' + J(e.order));
    assert(J(out.held.a) === '{"ok":true,"took":true}' && out.held.input === WORDS && out.held.key === WORDS, 'a composer that holds the words is left as it is: ' + J(out.held));
    assert(J(out.other.a) === '{"ok":true,"took":true}' && out.other.input === WORDS + '\nmy own' && out.other.key === WORDS + '\nmy own',
      'other words: the words, a new line, then its own: ' + J(out.other));
    assert(J(out.ignored.a) === '{"ok":true}' && out.ignored.key === WORDS + '\nmy own' && out.ignored.input === WORDS + '\nmy own', 'a draft off coach is ignored: ' + J(out.ignored));
    assert(J(out.bad) === '{"ok":false,"error":"bad-args"}', 'a numeric draft is bad-args: ' + J(out.bad));
    if (app.store) assert(out.shadow === WORDS + '\nmy own', 'STORE=shadow: the native copy has the key (mirrored): ' + J(out.shadow));
    assert(out.lists.backup < 0 && out.lists.raw < 0 && out.lists.book && !out.lists.exported && !out.lists.named,
      'device-only: in no backup list, not exported, bookkeeping, no Put back name: ' + J(out.lists));
    assert(VECTORS.cases.length >= 20 && out.vectors.length === VECTORS.cases.length + VECTORS.cases.filter((c) => c.composer.trim()).length,
      'every vector ran, with and without the key: ' + out.vectors.length);
    for (const v of out.vectors) {
      assert(v.got === v.want && v.page === v.want && J(v.a) === '{"ok":true,"took":true}' && v.key === (v.want.trim() ? v.want : null),
        'putback.json "' + v.name + '": ' + J(v));
    }
  } finally { await app.close(); }
});

// The shared vectors with the web composer on screen (P13; contract 12's Drift row, D42): the hand-over's other path,
// where the composer is the box the owner sees (#coach-input), read for the merge and written back with the merged words
// (_fpTakeDraft); the case above runs them with the composer off screen (its copy and the key) and through _fpPutBack.
serial('screens.off: every shared vector (Fixtures/draft/putback.json) with the web composer on screen: its box is the composer, and the box, the web composer\'s draft and the handed-over key are the vector\'s result, answered took', async () => {
  const app = await pageBoot('tabs');
  try {
    await ready(app);
    const out = await ev(app, async (VECTORS) => {
      // the shell takes the Coach tab away first (needs), so the chat on the Coach tab is the web's, with its box
      await FPScreens.call('screens.off', { screen: 'coachHome', why: 'needs' }); await __w(30);
      switchTab('coach'); openCoachChat(); await __w(40);
      const r = [];
      for (const c of VECTORS.cases) {
        localStorage.removeItem('kt_coach_handover');
        const box = document.getElementById('coach-input');
        if (!box) { r.push({ name: c.name, box: 'none on screen' }); continue; }
        box.value = c.composer;
        const a = await FPScreens.call('screens.off', { screen: 'coach', why: 'failures', draft: c.words });
        await __w(20);
        const after = document.getElementById('coach-input');
        r.push({ name: c.name, a, box: after ? after.value : 'none on screen', draft: _coachDraft.v, key: __key(), want: c.result });
      }
      return r;
    }, VECTORS);
    assert(VECTORS.cases.length >= 20 && out.length === VECTORS.cases.length, 'every vector ran: ' + out.length);
    for (const v of out) {
      assert(J(v.a) === '{"ok":true,"took":true}' && v.box === v.want && v.draft === v.want && v.key === (v.want.trim() ? v.want : null),
        'putback.json "' + v.name + '", the box on screen: ' + J(v));
    }
  } finally { await app.close(); }
});

serial('the words survive (I16): the mock\'s fallback hands the composer\'s words over, cleared only after took; a reload in the fallen-back scene and a relaunch show them; a native chat that comes back gets them as its draft, and coach.draftTaken lets the key go; a send from the native composer spends them', async () => {
  // the chat up natively; the scene falls back with the composer's words: they reach the web chat and the key, and the
  // mock clears its composer only on the took answer (a spy reads the composer as the key is written)
  const OFF = 'if (sessionStorage.getItem("t123-off")) window.__fpShellOff = ["coach"];';
  let app = await pageBoot('tabs', { init: OFF });
  try {
    await ready(app);
    const out = await ev(app, async (WORDS) => {
      switchTab('coach'); openCoachChat(); await __w(40);
      const r = { native: !!_fp.shown.coach };
      const seen = [], set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (k === 'kt_coach_handover') seen.push(__fpShell.composer); return set.apply(this, arguments); };
      await __fpShell.fallBack('failures', WORDS); await __w(60);
      Storage.prototype.setItem = set;
      const off = __fpShell.sent.find((s) => s[0] === 'screens.off' && s[1].screen === 'coach');
      Object.assign(r, { seen, composer: __fpShell.composer, sent: off && [off[1], off[2]], mode: _fp.tabs.mode, input: __screen().input, key: __key() });
      return r;
    }, WORDS);
    assert(out.native && J(out.sent) === J([{ screen: 'coach', why: 'needs', draft: WORDS }, { ok: true, took: true }]), 'the fallback\'s screens.off carries the words, answered took: ' + J(out));
    assert(J(out.seen) === J([WORDS]) && out.composer === '', 'the composer kept its words while the key was written, cleared after took: ' + J([out.seen, out.composer]));
    assert(!out.mode && out.input === WORDS && out.key === WORDS, 'classic, the web chat holds the words, and so does the key: ' + J(out));
    // a reload in the fallen-back scene (the chat kept off, as its breaker would): the web composer shows them
    await ev(app, () => sessionStorage.setItem('t123-off', '1'));
    await app.reload();
    await ready(app);
    const re = await ev(app, async () => {
      const r = { mode: _fp.tabs.mode, draft: _coachDraft.v, key: __key(), live: _fpLive('coach') };
      switchTab('coach'); openCoachChat(); await __w(40);
      r.input = __screen().input;
      return r;
    });
    assert(!re.mode && !re.live && re.draft === WORDS && re.key === WORDS && re.input === WORDS, 'after a reload the web composer shows the words: ' + J(re));
  } finally { await app.close(); }
  // a relaunch with the key on the device, no shell: the web composer has them
  app = await boot({ native: true, shell: 'none', init: INIT, seed: { kt_apikey: KEY, kt_coach_msgs: '[]', kt_coach_handover: WORDS } });
  try {
    await ready(app, false);
    const out = await ev(app, async () => { switchTab('coach'); openCoachChat(); await __w(40); return { input: __screen().input, key: __key() }; });
    assert(out.input === WORDS && out.key === WORDS, 'a relaunch shows the words in the web composer: ' + J(out));
  } finally { await app.close(); }
  // under tabs with the key: the native chat opens on them as its draft; draftTaken lets the key and the web copy go;
  // after a reload (the seed puts the key back) a send of the words from the native composer spends them
  app = await pageBoot('tabs', { seed: { kt_coach_handover: WORDS } });
  try {
    await ready(app);
    const out = await ev(app, async () => {
      const r = { web: _coachDraft.v };
      switchTab('coach'); openCoachChat(); await __w(40);
      const d = __last('coach').composer.draft;
      r.present = { draft: d, decl: __decl().slice(-2) };
      r.taken = { a: await FPScreens.call('coach.draftTaken', { nonce: d.nonce }), key: __key(), web: _coachDraft.v };
      await __w(40);
      r.taken.after = __last('coach').composer.draft;
      return r;
    });
    assert(out.web === WORDS && out.present.draft && out.present.draft.text === WORDS && /^d\d+\./.test(out.present.draft.nonce) && J(out.present.decl) === '["model coach","present coach"]',
      'the native chat opens with the words as its draft: ' + J(out));
    assert(out.taken.a.ok && out.taken.key === null && out.taken.web === '' && out.taken.after === null, 'draftTaken: the key and the web copy go: ' + J(out.taken));
    await app.reload();
    await ready(app);
    const sent = await ev(app, async (WORDS) => {
      switchTab('coach'); openCoachChat(); await __w(40);
      const before = __key();
      const a = await FPScreens.call('coach.send', { text: WORDS, nonce: 'n-123' }); await __idle();
      return { before, a: a.ok, key: __key(), draft: _coachDraft.v, model: __last('coach').composer.draft };
    }, WORDS);
    assert(sent.before === WORDS && sent.a && sent.key === null && sent.draft === '' && sent.model === null, 'a send from the native composer spends the words: ' + J(sent));
  } finally { await app.close(); }
  // a reload on the Coach tab in setup (tabs mode): the first paint, before hello, draws the web setup chat, and its
  // box starts with the words (the boot render runs before _coachDraft's own line), so the next render's capture keeps
  // them and the native setup chat gets them as its draft
  app = await pageBoot('tabs', { init: 'sessionStorage.setItem("fp_tab", "coach"); window.__fpShellPre = { selected: "coach", seq: 1 };'
    + 'window.__firstBox = null; new MutationObserver(function () { var b = document.getElementById("coach-input"); if (b && window.__firstBox === null) window.__firstBox = b.value; })'
    + '.observe(document, { childList: true, subtree: true });',
  seed: { kt_coach_handover: WORDS, kt_intake: '1', kt_routine: '' } });
  try {
    await ready(app);
    const out = await ev(app, async () => {
      await __w(40);
      const m = __last('coach');
      return { tab: currentTab, intake: intakeMode, first: window.__firstBox, shown: !!_fp.shown.coach, draft: m && m.composer.draft ? m.composer.draft.text : null,
        key: __key(), screen: __screen().kids };
    });
    assert(out.tab === 'coach' && out.intake && out.first === WORDS && out.shown && out.draft === WORDS && out.key === WORDS && J(out.screen) === '["kt-fp-ph/coachHome"]',
      'a reload in setup: the first paint\'s box holds the words, and the native setup chat gets them as its draft: ' + J(out));
  } finally { await app.close(); }
  // one composer at a time: the About switch off, the web chat shows the words and the owner adds a line (the key
  // follows); switched on, the native chat gets them as its draft (sent trimmed) and draftTaken lets the key and the
  // web copy go; switched off again, the web composer is empty (no words come back twice)
  app = await pageBoot('tabs', { seed: { kt_coach_handover: WORDS, kt_native_off: '1' } });
  try {
    await ready(app);
    const out = await ev(app, async (WORDS) => {
      switchTab('coach'); openCoachChat(); await __w(40);
      const r = { web: __screen().input, home: _fp.declared.coachHome };
      document.getElementById('coach-input').value = WORDS + '\n'; render(); await __w(20);
      r.followed = __key();
      const n = __n();
      toggleNativeChat(); await __w(60);
      const m = __last('coach'), d = m && m.composer.draft;
      r.on = { draft: d, decl: __decl(n).filter((x) => /^(present|dismiss)/.test(x)) };
      r.taken = { a: d ? await FPScreens.call('coach.draftTaken', { nonce: d.nonce }) : null, key: __key(), web: _coachDraft.v };
      toggleNativeChat(); await __w(60);
      r.off = { input: __screen().input, key: __key(), shown: !!_fp.shown.coach };
      return r;
    }, WORDS);
    assert(out.web === WORDS && out.home === 'dismiss' && out.followed === WORDS + '\n', 'the web chat with the words, the key following the box: ' + J(out));
    assert(out.on.draft && out.on.draft.text === WORDS && J(out.on.decl) === '["present coachHome","present coach"]', 'switched on: the native chat gets them as its draft: ' + J(out.on));
    assert(out.taken.a && out.taken.a.ok && out.taken.key === null && out.taken.web === '', 'draftTaken: the key and the web copy (with its line) go: ' + J(out.taken));
    assert(out.off.input === '' && out.off.key === null && !out.off.shown, 'switched off again: the web composer is empty: ' + J(out.off));
  } finally { await app.close(); }
});

serial('the words follow the web composer: more typing is rewritten at the next render and when the page is hidden; a send from the web composer and an emptied box each remove them; a failed write answers without took and changes nothing', async () => {
  let app = await boot({ native: true, shell: 'none', init: INIT + HIDDEN, seed: { kt_apikey: KEY, kt_coach_msgs: '[]', kt_coach_handover: WORDS } });
  try {
    await ready(app, false);
    const out = await ev(app, async (WORDS) => {
      const r = {};
      switchTab('coach'); openCoachChat(); await __w(40);
      const box = () => document.getElementById('coach-input');
      box().value = WORDS + ' and more'; render(); await __w(20);
      r.render = __key();
      box().value = WORDS + ' and more, then left'; window.__vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
      r.hidden = __key();
      window.__vis = 'visible';
      sendCoachMessage(); await __idle();
      r.sent = { key: __key(), last: coachMessages.filter((m) => m.role === 'user').slice(-1)[0].content, input: __screen().input };
      return r;
    }, WORDS);
    assert(out.render === WORDS + ' and more' && out.hidden === WORDS + ' and more, then left', 'the key follows the box: ' + J(out));
    assert(out.sent.key === null && out.sent.last === WORDS + ' and more, then left' && out.sent.input === '', 'sent from the web composer: the key goes: ' + J(out.sent));
    // the seed puts the key back at the reload: an emptied box removes it
    await app.reload();
    await ready(app, false);
    const emptied = await ev(app, async () => {
      switchTab('coach'); openCoachChat(); await __w(40);
      const before = __key(), input = __screen().input;
      document.getElementById('coach-input').value = ''; render(); await __w(20);
      return { before, input, key: __key() };
    });
    assert(emptied.before === WORDS && emptied.input === WORDS && emptied.key === null, 'an emptied box removes the key: ' + J(emptied));
  } finally { await app.close(); }
  // the write fails (quota): the answer has no took, the mock's composer keeps the words, the web composer is unchanged
  const QUOTA = 'Storage.prototype.setItem = (function (set) { return function (k, v) { if (k === "kt_coach_handover") { throw new DOMException("full", "QuotaExceededError"); } return set.apply(this, arguments); }; })(Storage.prototype.setItem);';
  app = await pageBoot('tabs', { init: QUOTA });
  try {
    await ready(app);
    const out = await ev(app, async (WORDS) => {
      switchTab('coach'); openCoachChat(); await __w(40);
      const before = _coachDraft.v;
      await __fpShell.fallBack('failures', WORDS); await __w(60);
      const off = __fpShell.sent.find((s) => s[0] === 'screens.off' && s[1].screen === 'coach');
      return { before, answer: off && off[2], composer: __fpShell.composer, input: __screen().input, draft: _coachDraft.v, key: __key(), mode: _fp.tabs.mode };
    }, WORDS);
    assert(J(out.answer) === '{"ok":true}' && out.composer === WORDS && out.input === out.before && out.draft === out.before && out.key === null && !out.mode,
      'a failed write: no took, the words stay native, the web composer as it was: ' + J(out));
  } finally { await app.close(); }
});

serial('the page\'s own text never writes over the handed-over words (I16, P-D15): with the web chat on screen coachPrefill puts its draft in front of them (putBack), a Today card\'s question, a chip and a seeded prompt go without touching them (label and stamp kept), a prompt during a reply waits in front of them, under tabs and coach61; with no key the composer is as it always was', async () => {
  const P = 'Build my Arms day: 4 or 5 exercises', PW = P + '\n' + WORDS;
  // tabs, the Coach tab web (needs): with no key the page's own text replaces the box and a chip sends it as before;
  // then the native composer's words are handed over and every way the page writes or sends leaves them in the box and
  // the key
  let app = await pageBoot('tabs');
  try {
    await ready(app);
    const out = await ev(app, async ({ WORDS, P }) => {
      const r = {};
      const box = () => document.getElementById('coach-input');
      const where = () => ({ input: __screen().input, draft: _coachDraft.v, key: __key() });
      const lastUser = () => coachMessages.filter((m) => m.role === 'user').slice(-1)[0];
      await FPScreens.call('screens.off', { screen: 'coachHome', why: 'needs' }); await __w(30);
      switchTab('coach'); openCoachChat(); await __w(40);
      box().value = 'my own';
      r.noKey = { ta: coachPrefill(P) === box(), input: __screen().input };
      box().value = 'my own';
      sendCoachChip('What should I train?'); await __idle();
      Object.assign(r.noKey, { chipInput: __screen().input, chipSent: lastUser().content, key: __key() });
      r.took = await FPScreens.call('screens.off', { screen: 'coach', why: 'failures', draft: WORDS }); await __w(40);
      r.handed = where();
      // Build day's "Ask the coach" and a share's comment (coachPrefill): the draft in front of the words, the key
      // following
      r.prefill = { ta: coachPrefill(P) === box(), input: __screen().input };
      render(); await __w(20);
      Object.assign(r.prefill, where());
      // a Today card's action (coachCardAction, then _coachAsk): its question goes, the box keeps the words
      coachCardAction('Swap in dips'); await __idle();
      r.card = Object.assign({ sent: lastUser().content, seed: lastUser()._seed || null }, where());
      // a chip (sendCoachChip): its words go, the box keeps the words
      sendCoachChip('How was my week?'); await __idle();
      r.chip = Object.assign({ sent: lastUser().content }, where());
      // the plateau card's way (_coachAsk with a label and a stamp): sent as written, with its label, the stamp
      // written, and the photo the composer shows goes with it as Send's path would send it
      pendingImage = { data: 'AAAA', mediaType: 'image/jpeg', previewUrl: 'data:image/jpeg;base64,AAAA' };
      _coachAsk('Propose ONE concrete programme change', { seed: 'Plateau check', stamp: ['kt_last_plateau_week', 7] }); await __idle();
      const u = lastUser(), parts = Array.isArray(u.content) ? u.content : [];
      r.seeded = Object.assign({ sent: (parts.find((p) => p.type === 'text') || {}).text, photo: parts.some((p) => p.type === 'image'), pending: pendingImage,
        seed: u._seed, stamp: lsGet('kt_last_plateau_week') }, where());
      // a prompt while a reply is in flight: it waits in front of the words for the owner's Send, as a native
      // composer's draft would
      sendCoachChip('First');
      _coachAsk('Review my week', { seed: 'Weekly review' });
      r.waiting = { loading: !!coachLoading, input: __screen().input };
      await __idle(); render(); await __w(20);
      Object.assign(r.waiting, { sent: lastUser().content }, where());
      // the box is the composer: words the owner took out of it since the last paint stay out when a hand-over comes
      box().value = 'rewritten';
      r.boxWins = { a: await FPScreens.call('screens.off', { screen: 'coach', why: 'failures', draft: 'more words' }) };
      await __w(30);
      Object.assign(r.boxWins, where());
      return r;
    }, { WORDS, P });
    assert(out.noKey.ta && out.noKey.input === P && out.noKey.chipInput === '' && out.noKey.chipSent === 'What should I train?' && out.noKey.key === null,
      'no key: the page\'s draft replaces the box and a chip sends through it, as always: ' + J(out.noKey));
    assert(J(out.took) === '{"ok":true,"took":true}' && J(out.handed) === J({ input: WORDS, draft: WORDS, key: WORDS }), 'the words handed over: ' + J(out));
    assert(out.prefill.ta && out.prefill.input === PW && out.prefill.draft === PW && out.prefill.key === PW, 'coachPrefill: its draft in front of the words: ' + J(out.prefill));
    assert(out.card.sent === 'Swap in dips' && out.card.seed === null && J([out.card.input, out.card.draft, out.card.key]) === J([PW, PW, PW]),
      'a card\'s question goes (as the owner\'s words, as before), the words stay: ' + J(out.card));
    assert(out.chip.sent === 'How was my week?' && J([out.chip.input, out.chip.draft, out.chip.key]) === J([PW, PW, PW]), 'a chip goes, the words stay: ' + J(out.chip));
    assert(out.seeded.sent === 'Propose ONE concrete programme change' && out.seeded.photo && out.seeded.pending === null && out.seeded.seed === 'Plateau check'
      && out.seeded.stamp === 7 && J([out.seeded.input, out.seeded.key]) === J([PW, PW]), 'a seeded prompt keeps its label, stamp and photo, the words stay: ' + J(out.seeded));
    const RW = 'Review my week\n' + PW;
    assert(out.waiting.loading && out.waiting.input === RW && out.waiting.sent === 'First' && J([out.waiting.draft, out.waiting.key]) === J([RW, RW]),
      'a prompt during a reply waits in front of the words: ' + J(out.waiting));
    const MR = 'more words\nrewritten';
    assert(J(out.boxWins.a) === '{"ok":true,"took":true}' && J([out.boxWins.input, out.boxWins.draft, out.boxWins.key]) === J([MR, MR, MR]),
      'a hand-over merges over the box as it is, not over the key\'s older copy: ' + J(out.boxWins));
  } finally { await app.close(); }
  // coach61 (60's overlay chat under 61's flag): the chat taken away with the words, then the same writes on the web
  // chat
  app = await pageBoot('coach61');
  try {
    await ready(app);
    const out = await ev(app, async ({ WORDS, P }) => {
      const lastUser = () => coachMessages.filter((m) => m.role === 'user').slice(-1)[0];
      const where = () => ({ input: __screen().input, key: __key() });
      switchTab('coach'); openCoachChat(); await __w(40);
      const r = { native: !!_fp.shown.coach, took: await FPScreens.call('screens.off', { screen: 'coach', why: 'failures', draft: WORDS }) };
      await __w(40);
      r.handed = where();
      coachPrefill(P); render(); await __w(20);
      r.prefill = where();
      coachCardAction('Swap in dips'); await __idle();
      r.card = Object.assign({ sent: lastUser().content }, where());
      sendCoachChip('How was my week?'); await __idle();
      r.chip = Object.assign({ sent: lastUser().content }, where());
      return r;
    }, { WORDS, P });
    assert(out.native && J(out.took) === '{"ok":true,"took":true}' && J(out.handed) === J({ input: WORDS, key: WORDS }), 'coach61: the words handed over: ' + J(out));
    assert(J(out.prefill) === J({ input: PW, key: PW }) && out.card.sent === 'Swap in dips' && out.card.input === PW && out.card.key === PW
      && out.chip.sent === 'How was my week?' && out.chip.input === PW && out.chip.key === PW, 'coach61: the words stay through a prefill, a card and a chip: ' + J(out));
  } finally { await app.close(); }
});

serial('the handed-over words outlast a page draft under the native chat (I16, P-D15): a later hand-over merges over them as well as over the web copy, and a web chat the page itself brings back shows them beside the draft; switched on again the native chat gets both as one draft, and once taken nothing comes back', async () => {
  const P = 'Build my Arms day', WP = WORDS + '\n' + P;
  // the key on the device, the native chat up with the words as its draft (the mock never takes one); coachPrefill
  // under the native chat makes the page's draft and the web copy; the shell then falls back with its composer's own
  // words
  let app = await pageBoot('tabs', { seed: { kt_coach_handover: WORDS } });
  try {
    await ready(app);
    const out = await ev(app, async (P) => {
      const r = {};
      const draft = () => { const m = __last('coach'); return m && m.composer.draft ? m.composer.draft.text : null; };
      switchTab('coach'); openCoachChat(); await __w(40);
      r.offered = draft();
      coachPrefill(P); await __w(40);
      r.page = { draft: draft(), copy: _coachDraft.v, key: __key() };
      await __fpShell.fallBack('failures', 'typed natively'); await __w(60);
      const off = __fpShell.sent.find((s) => s[0] === 'screens.off' && s[1].screen === 'coach');
      r.after = { answer: off && off[2], composer: __fpShell.composer, mode: _fp.tabs.mode, input: __screen().input, draft: _coachDraft.v, key: __key() };
      return r;
    }, P);
    const M = 'typed natively\n' + WP;
    assert(out.offered === WORDS && J(out.page) === J({ draft: P, copy: P, key: WORDS }), 'under the native chat: the page\'s draft, the words in the key: ' + J(out));
    assert(J(out.after.answer) === '{"ok":true,"took":true}' && out.after.composer === '' && !out.after.mode
      && J([out.after.input, out.after.draft, out.after.key]) === J([M, M, M]), 'the hand-over merges over the key\'s words and the web copy: ' + J(out.after));
  } finally { await app.close(); }
  // the same start; the About switch off brings the web chat back (the page's own withdrawal: nothing handed over)
  app = await pageBoot('tabs', { seed: { kt_coach_handover: WORDS } });
  try {
    await ready(app);
    const out = await ev(app, async (P) => {
      const r = {};
      switchTab('coach'); openCoachChat(); await __w(40);
      coachPrefill(P); await __w(40);
      toggleNativeChat(); await __w(60);
      r.web = { shown: !!_fp.shown.coach, input: __screen().input, draft: _coachDraft.v };
      render(); await __w(20);
      r.web.key = __key();
      toggleNativeChat(); await __w(60);
      const m = __last('coach'), d = m && m.composer.draft;
      r.on = { draft: d && d.text, a: d ? await FPScreens.call('coach.draftTaken', { nonce: d.nonce }) : null, key: __key(), web: _coachDraft.v };
      toggleNativeChat(); await __w(60);
      r.off = { input: __screen().input, key: __key() };
      return r;
    }, P);
    assert(!out.web.shown && J([out.web.input, out.web.draft, out.web.key]) === J([WP, WP, WP]), 'the web chat shows the words beside the page\'s draft, and the key keeps both: ' + J(out.web));
    assert(out.on.draft === WP && out.on.a && out.on.a.ok && out.on.key === null && out.on.web === '', 'switched on: both as one draft, taken: the key and the web copy go: ' + J(out.on));
    assert(J(out.off) === J({ input: '', key: null }), 'switched off again: nothing comes back: ' + J(out.off));
  } finally { await app.close(); }
  // the same start; the native composer takes the page's draft (paints under the native chat leave the web copy as the
  // draft, so it goes), then the words at their own next offer (the key goes): switched off, the web composer is empty
  app = await pageBoot('tabs', { seed: { kt_coach_handover: WORDS } });
  try {
    await ready(app);
    const out = await ev(app, async (P) => {
      const r = {};
      switchTab('coach'); openCoachChat(); await __w(40);
      coachPrefill(P); await __w(40);
      render(); await __w(20);
      const d1 = __last('coach').composer.draft;
      r.p = { draft: d1 && d1.text, a: await FPScreens.call('coach.draftTaken', { nonce: d1.nonce }), copy: _coachDraft.v, key: __key() };
      render(); await __w(40);
      const d2 = __last('coach').composer.draft;
      r.k = { draft: d2 && d2.text, a: d2 ? await FPScreens.call('coach.draftTaken', { nonce: d2.nonce }) : null, copy: _coachDraft.v, key: __key() };
      toggleNativeChat(); await __w(60);
      r.off = { input: __screen().input, key: __key() };
      return r;
    }, P);
    assert(out.p.draft === P && out.p.a.ok && out.p.copy === '' && out.p.key === WORDS, 'the page\'s draft taken: the web copy goes, the words wait in the key: ' + J(out.p));
    assert(out.k.draft === WORDS && out.k.a && out.k.a.ok && out.k.copy === '' && out.k.key === null, 'the words offered again and taken: the key goes: ' + J(out.k));
    assert(J(out.off) === J({ input: '', key: null }), 'switched off: nothing comes back twice: ' + J(out.off));
  } finally { await app.close(); }
});

// ── answers first; setup ───────────────────────────────────────────────────────────────────────────────────────────
serial('confirm and toast.undo answer on receipt and act on the next task (D14): an action that busies the page for 3 s comes after the answer; a spent id answers stale', async () => {
  const app = await pageBoot('tabs');
  try {
    await ready(app);
    const out = await ev(app, async () => {
      switchTab('coach'); await __w(40);
      const r = { covered: _fpCovered() };
      const order = [];
      _ktConfirm({ title: 'Restore?', body: '', confirmLabel: 'Restore', onConfirm: () => { order.push('action'); const t = Date.now(); while (Date.now() - t < 3000) { /* busy */ } order.push('done'); } });
      const cf = __fpShell.of('confirm').slice(-1)[0];
      const a = await FPScreens.call('confirm', { id: cf.id, yes: true });
      order.push(['answer', a]);
      await __w(0);
      order.push('next');
      r.confirm = { order, again: await FPScreens.call('confirm', { id: cf.id, yes: true }) };
      const undo = [];
      showUndoToast('Removed', () => { undo.push('undone'); });
      const t = __fpShell.of('toast').slice(-1)[0];
      const u = await FPScreens.call('toast.undo', { id: t.undo });
      undo.push(['answer', u]);
      await __w(0);
      r.undo = { order: undo, again: await FPScreens.call('toast.undo', { id: t.undo }) };
      return r;
    });
    assert(out.covered, 'the native Coach tab covers the page: the confirm and the toast are forwarded');
    assert(J(out.confirm.order) === J([['answer', { ok: true }], 'action', 'done', 'next']) && J(out.confirm.again) === '{"ok":false,"error":"stale"}',
      'confirm: answered before its action ran; a spent id is stale: ' + J(out.confirm));
    assert(J(out.undo.order) === J([['answer', { ok: true }], 'undone']) && J(out.undo.again) === '{"ok":false,"error":"stale"}',
      'toast.undo: answered before its action ran; a spent id is stale: ' + J(out.undo));
  } finally { await app.close(); }
});

serial('setup keeps its answers (8.3): the setup chat has Cancel and no Back; a tap on Log dismisses it with setup kept and the Coach tab\'s model saying resume; a tap on Coach presents it again; the intake error says top left', async () => {
  // no programme (setup ends as soon as one exists); the setup turn fails before its request, so the chat shows the
  // intake's own error and setup goes on
  const app = await pageBoot('tabs', { seed: { kt_routine: '' } });
  try {
    await ready(app);
    const out = await ev(app, async () => {
      const r = {};
      switchTab('coach'); await __w(40);
      const prompt = window.buildIntakeSystemPrompt;
      window.buildIntakeSystemPrompt = () => { throw new Error('offline'); };
      // the chat's present and dismiss, each present after a model of the chat
      const chat = (i) => {
        const d = __decl(i).filter((x) => / coach$/.test(x)), p = d.indexOf('present coach'), m = d.indexOf('model coach');
        return { pd: d.filter((x) => !/^model/.test(x)), modelFirst: p < 0 || (m >= 0 && m < p) };
      };
      let n = __n();
      startRoutineIntake(); await __idle();
      window.buildIntakeSystemPrompt = prompt;
      const m = __last('coach');
      r.setup = Object.assign(chat(n), { header: m.header, intake: m.intake, error: coachMessages.slice(-1)[0].content });
      n = __n();
      r.log = { answer: await __fpShell.tap('log') };
      await __w(40);
      Object.assign(r.log, chat(n), { tab: currentTab, intake: intakeMode, stored: localStorage.getItem('kt_intake'),
        resume: __last('coachHome').resume, home: _fp.shown.coachHome });
      n = __n();
      r.back = { answer: await __fpShell.tap('coach') };
      await __w(40);
      Object.assign(r.back, chat(n), { tab: currentTab, intake: intakeMode, header: __last('coach').header });
      return r;
    });
    const s = out.setup;
    assert(J(s.pd) === '["present coach"]' && s.modelFirst && s.intake && s.header.cancel === true && s.header.back === false, 'setup presents the chat with Cancel, no Back: ' + J(s));
    assert(s.error === 'Intake hit a snag (offline). Reply again or cancel from the top left.', 'the intake error says top left: ' + J(s.error));
    const l = out.log;
    assert(l.answer.ok && l.tab === 'log' && J(l.pd) === '["dismiss coach"]' && l.intake && l.stored === '1' && l.resume === true && l.home,
      'Log: the chat dismissed, setup kept, the Coach tab\'s model says resume: ' + J(l));
    const b = out.back;
    assert(b.answer.ok && b.tab === 'coach' && J(b.pd) === '["present coach"]' && b.modelFirst && b.intake && b.header.cancel === true,
      'Coach: setup presented again: ' + J(b));
  } finally { await app.close(); }
});

// ── The Coach tab's actions: coachHome.* and the API key (plan task P8; contract 4.1, 4.5, 5; T11 c, d) ─────────────
const crypto = require('crypto');
// A canary key (K8): sk-ant-test- and 16 random characters, never a real key. Its pieces, any of which is a leak: the
// whole canary, Settings' masked form of it, and every 8 characters in a row of its random part (long enough that the
// page's own text cannot hold one by chance).
const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const canary = () => 'sk-ant-test-' + Array.from({ length: 16 }, () => ALNUM[crypto.randomInt(ALNUM.length)]).join('');
const pieces = (c) => {
  const r = c.slice(12), out = [c, c.slice(0, 8) + '•'.repeat(16)];
  for (let i = 0; i + 8 <= r.length; i++) out.push(r.slice(i, i + 8));
  return out;
};
const TWO = JSON.stringify([{ role: 'user', content: 'How was my week?', at: Date.now() - 90000 },
  { role: 'assistant', content: 'A strong one.', at: Date.now() - 80000 }]);
// In the page: __leaks(P, logs) names each place that holds one of the pieces P: every TrovoShell call (logs, toasts,
// models, presents), what the mock sent the page and heard back, every model, the _fpLog lines, the watch's context,
// sessionStorage, _fp, every localStorage key but kt_apikey, the DOM, and under STORE=shadow everything the native
// store mock holds or heard (__storeText). __state(): what an intent answering a refusal leaves as it was.
// __offSweep(): on the Coach tab, every coachHome.* with good arguments and setKey's bad ones, then setKey with a key
// saved.
const P8 = `(() => {
  window.__storeText = () => JSON.stringify([__ktMock.log, __ktMock.posts, __ktMock.postResults, __ktMock.rows(), __ktMock.journal(),
    __ktMock.snaps().map((n) => __ktMock.readSnap(n)), __ktMock.conflicts()]);
  window.__leaks = (P, logs) => {
    const ls = {}, ss = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k !== 'kt_apikey') ls[k] = localStorage.getItem(k); }
    for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); ss[k] = sessionStorage.getItem(k); }
    const at = { calls: JSON.stringify(__fpShell.calls), sent: JSON.stringify(__fpShell.sent), models: JSON.stringify(__fpShell.models()),
      fpLog: JSON.stringify(logs), watch: JSON.stringify(window.__mock ? __mock.updateContext : null), sessionStorage: JSON.stringify(ss),
      fp: JSON.stringify(_fp), localStorage: JSON.stringify(ls), dom: document.documentElement.outerHTML };
    if (window.__ktMock) at.store = __storeText();
    return Object.keys(at).filter((k) => P.some((p) => at[k].indexOf(p) >= 0));
  };
  window.__logs = () => {
    const logs = [], fl = window._fpLog;
    window._fpLog = function (t) { logs.push(String(t)); return fl.apply(this, arguments); };
    return logs;
  };
  window.__state = () => JSON.stringify({ key: localStorage.getItem('kt_apikey'), msgs: localStorage.getItem('kt_coach_msgs'),
    n: coachMessages.length, tab: currentTab, view: coachView, intake: !!intakeMode, starter: !!document.getElementById('starterOverlay'),
    sheets: document.querySelectorAll('.kt-close-sheet').length, asks: __fpShell.of('confirm').length, toasts: __fpShell.of('toast').length,
    selects: __fpShell.of('selectTab').length, shows: __fpShell.of('present').length + __fpShell.of('dismiss').length });
  window.__offSweep = async () => {
    switchTab('coach'); await __w(40);
    const before = __state(), r = [];
    const go = async (n, a) => {
      const x = await FPScreens.call('coachHome.' + n, a || {});
      r.push(n + (a ? ' ' + JSON.stringify(a) : '') + ': ' + (x.ok ? 'ok' : x.error));
    };
    await go('setKey', { secret: 5 }); await go('setKey', {}); await go('setKey', { secret: 'sk-xyz' }); await go('setKey', { secret: 'sk-ant-test-off' });
    for (const n of ['openChat', 'disconnect', 'clearChat', 'startIntake', 'openStarter', 'snapshot']) await go(n);
    await __w(40);
    const changed = __state() !== before;
    localStorage.setItem('kt_apikey', 'sk-ant-test'); render(); await __w(20);
    await go('setKey', { secret: 'sk-xyz' });
    return { r, changed, shown: !!_fp.shown.coachHome, mode: _fpCoachMode() };
  };
})();`;
const OFF_SWEEP = ['setKey {"secret":5}: bad-args', 'setKey {}: bad-args', 'setKey {"secret":"sk-xyz"}: off', 'setKey {"secret":"sk-ant-test-off"}: off',
  'openChat: off', 'disconnect: off', 'clearChat: off', 'startIntake: off', 'openStarter: off', 'snapshot: off', 'setKey {"secret":"sk-xyz"}: off'];
// The one invalid-key text: the web connect screen, Settings and setKey (_KEY_BAD).
const BAD_TEXT = 'Invalid key — Anthropic keys start with sk-ant-';

serial('coachHome.setKey carries the key once (contract 5, K1-K8): a canary typed with blanks around it is saved trimmed in kt_apikey and is nowhere else (no TrovoShell call, model, console line, _fpLog line, watch context, sessionStorage, _fp, other storage key or DOM; under STORE=shadow the native store never saw kt_apikey); "API key saved" forwarded, the route hub; the answer comes before the ping\'s fetch, held 3 s; a forced failure answers exception and nothing carries any part of the canary', async () => {
  const C = canary(), P = pieces(C), lines = [];
  let app = await pageBoot('tabs', { init: P8, seed: { kt_apikey: '' } });
  app.page.on('console', (m) => lines.push(m.text()));
  try {
    await ready(app);
    const out = await ev(app, async ({ C, P }) => {
      const logs = __logs();
      switchTab('coach'); await __w(40);
      const r = { before: { covered: _fpCovered(), route: __last('coachHome').route, key: localStorage.getItem('kt_apikey') } };
      const st = window.__ktStoreState && __ktStoreState.mode === 'shadow' ? __ktStoreState : null, pass0 = st ? st.passthrough : 0;
      // the ping's request is held 3 s: the answer comes before it ends
      const order = [];
      r.ping = [];
      window.fetch = (url, o) => {
        order.push('fetch');
        r.ping.push({ api: String(url) === _coachApiURL(), key: !!(o && o.headers && o.headers['x-api-key'] === C) });
        return new Promise((res) => setTimeout(() => { order.push('fetched'); res(new Response('{}', { status: 200 })); }, 3000));
      };
      const n = __n();
      const a = await FPScreens.call('coachHome.setKey', { secret: '  ' + C + '\n' });
      order.push('answer');
      r.answer = a; r.order = order.slice();
      await __w(60);
      r.after = { saved: localStorage.getItem('kt_apikey') === C, toasts: __fpShell.calls.slice(n).filter((c) => c[0] === 'toast').map((c) => c[1]),
        route: __last('coachHome').route,
        store: st ? { passthrough: st.passthrough - pass0, count: __ktMock.count('passthrough'), named: __storeText().indexOf('kt_apikey') >= 0 } : null };
      r.leaks = __leaks(P, logs);
      return r;
    }, { C, P });
    assert(out.before.covered && out.before.route === 'connect' && out.before.key === '', 'the native connect screen covers the page: ' + J(out.before));
    assert(J(out.answer) === '{"ok":true}' && J(out.order) === '["fetch","answer"]',
      'answered at once, the ping sent and still out (held 3 s): ' + J([out.answer, out.order]));
    assert(out.ping.length === 1 && out.ping[0].api && out.ping[0].key, 'one ping, to the coach API, with the trimmed key in its header: ' + J(out.ping));
    assert(out.after.saved && J(out.after.toasts) === J([{ text: 'API key saved', style: 'ok' }]) && out.after.route === 'hub',
      'saved trimmed, "API key saved" forwarded, the route hub: ' + J(out.after));
    assert(J(out.leaks) === '[]', 'the canary is nowhere but kt_apikey: ' + J(out.leaks));
    assert(!lines.some((l) => P.some((p) => l.indexOf(p) >= 0)), 'no console line carries it (' + lines.length + ' lines)');
    if (app.store) {
      assert(out.after.store && out.after.store.passthrough === 1 && out.after.store.count === 0 && !out.after.store.named,
        'STORE=shadow: the facade kept the key in WebKit alone, and the native store never saw kt_apikey: ' + J(out.after.store));
    }
  } finally { await app.close(); }
  // the write fails with an error whose text carries the value: no answer, toast, log line or storage passes it on
  const FAIL = 'Storage.prototype.setItem = (function (set) { return function (k, v) { if (k === "kt_apikey") {'
    + ' throw new DOMException("full: " + v, "QuotaExceededError"); } return set.apply(this, arguments); }; })(Storage.prototype.setItem);';
  const C2 = canary(), P2 = pieces(C2), lines2 = [];
  app = await pageBoot('tabs', { init: P8 + FAIL, seed: { kt_apikey: '' } });
  app.page.on('console', (m) => lines2.push(m.text()));
  try {
    await ready(app);
    const out = await ev(app, async ({ C, P }) => {
      const logs = __logs();
      switchTab('coach'); await __w(40);
      const n = __n();
      const a = await FPScreens.call('coachHome.setKey', { secret: C });
      await __w(60);
      return { answer: a, key: localStorage.getItem('kt_apikey'), route: __last('coachHome').route, logs: logs.slice(),
        heard: __fpShell.calls.slice(n).filter((c) => c[0] === 'log' || c[0] === 'toast').map((c) => c[0] + ' ' + c[1].text), leaks: __leaks(P, logs) };
    }, { C: C2, P: P2 });
    assert(J(out.answer) === '{"ok":false,"error":"exception"}' && out.key === '' && out.route === 'connect',
      'a failed write answers exception and saves nothing: ' + J([out.answer, out.key, out.route]));
    assert(J(out.logs) === '["coachHome.setKey failed"]' && J(out.heard) === '["log fp: coachHome.setKey failed"]',
      'one log line, in the handler\'s own words, and no toast: ' + J([out.logs, out.heard]));
    assert(J(out.leaks) === '[]' && !lines2.some((l) => P2.some((p) => l.indexOf(p) >= 0)),
      'no error text, log line, toast or storage carries any part of the canary: ' + J(out.leaks));
  } finally { await app.close(); }
});

serial('coachHome.setKey refuses in the contract\'s order: bad-args, off, stale (a key is saved: no toast), invalid (\'sk-xyz\' and blanks: the err toast forwarded, nothing saved); a good one is saved trimmed and a second one right after it is stale; once screens.off takes the Coach tab down every coachHome.* answers off', async () => {
  const app = await pageBoot('tabs', { init: P8 });
  try {
    await ready(app);
    const out = await ev(app, async () => {
      window.fetch = () => new Promise(() => {});   // the ping stays out: only the handler's own toasts
      switchTab('coach'); await __w(40);
      const r = {}, toasts = (i) => __fpShell.of('toast').slice(i);
      const key = (s) => FPScreens.call('coachHome.setKey', s === undefined ? {} : { secret: s });
      let t = __fpShell.of('toast').length;
      r.stale = [await key('sk-xyz'), await key('sk-ant-test-other')];
      await __w(40);
      r.staleAfter = { key: localStorage.getItem('kt_apikey'), toasts: toasts(t) };
      localStorage.removeItem('kt_apikey'); render(); await __w(40);
      t = __fpShell.of('toast').length;
      r.invalid = [await key('sk-xyz'), await key('   '), await key(5), await key()];
      await __w(40);
      r.invalidAfter = { key: localStorage.getItem('kt_apikey'), toasts: toasts(t), route: __last('coachHome').route };
      t = __fpShell.of('toast').length;
      r.both = await Promise.all([key('  sk-ant-test-first  '), key('sk-ant-test-second')]);
      await __w(60);
      r.saved = { key: localStorage.getItem('kt_apikey'), toasts: toasts(t), route: __last('coachHome').route };
      // the shell takes the Coach tab down: off from then on, with no key saved too
      localStorage.removeItem('kt_apikey'); render(); await __w(40);
      r.down = await FPScreens.call('screens.off', { screen: 'coachHome', why: 'needs' });
      await __w(40);
      r.off = await __offSweep();
      return r;
    });
    const no = (e) => ({ ok: false, error: e });
    const BAD = { text: BAD_TEXT, style: 'err' };
    assert(J(out.stale) === J([no('stale'), no('stale')]) && out.staleAfter.key === KEY && J(out.staleAfter.toasts) === '[]',
      'a key saved: stale before invalid, no toast, the key kept: ' + J([out.stale, out.staleAfter]));
    assert(J(out.invalid) === J([no('invalid'), no('invalid'), no('bad-args'), no('bad-args')]) && out.invalidAfter.key === null
      && J(out.invalidAfter.toasts) === J([BAD, BAD]) && out.invalidAfter.route === 'connect',
      'no key: invalid with the page\'s err toast forwarded, bad-args for a non-string, nothing saved: ' + J([out.invalid, out.invalidAfter]));
    assert(J(out.both) === J([{ ok: true }, no('stale')]) && out.saved.key === 'sk-ant-test-first' && J(out.saved.toasts) === J([{ text: 'API key saved', style: 'ok' }])
      && out.saved.route === 'hub', 'saved trimmed; the second call right after it is stale and says nothing: ' + J([out.both, out.saved]));
    assert(J(out.down) === '{"ok":true}' && J(out.off.r) === J(OFF_SWEEP) && !out.off.changed && !out.off.shown && out.off.mode === 'web',
      'after screens.off coachHome every coachHome.* is off and changes nothing: ' + J(out.off));
  } finally { await app.close(); }
});

serial('every coachHome.* answers off where the native Coach tab is not in use in this document (tabsWeb, coach61, build 60\'s coach, tabs with kt_native_off), bad-args first, and changes nothing: no key saved, no message cleared, no setup, no starter, no tab change, nothing asked; the web connect screen and Settings say an invalid key as setKey does', async () => {
  for (const [shell, seed, mode] of [['tabsWeb', {}, 'web'], ['coach61', {}, null], ['coach', {}, null], ['tabs', { kt_native_off: '1' }, 'web']]) {
    const app = await pageBoot(shell, { init: P8, seed: Object.assign({ kt_apikey: '', kt_routine: '', kt_coach_msgs: TWO }, seed) });
    try {
      await ready(app);
      const out = await ev(app, () => __offSweep());
      assert(J(out.r) === J(OFF_SWEEP) && !out.changed && !out.shown && out.mode === mode, shell + J(seed) + ': off, and nothing changed: ' + J(out));
      if (shell !== 'tabsWeb') continue;
      // one text: the web Coach tab's connect screen and Settings > AI Coach refuse a key with setKey's words
      const said = await ev(app, async () => {
        localStorage.removeItem('kt_apikey'); render(); await __w(20);
        const toast = () => document.getElementById('toast').textContent;
        document.getElementById('coach-key-input').value = 'sk-xyz'; saveApiKey();
        const coach = toast();
        switchTab('settings'); await __w(20);
        document.getElementById('settingsApiKeyInput').value = 'sk-xyz'; saveApiKeyFromSettings();
        return [_KEY_BAD, coach, toast(), localStorage.getItem('kt_apikey')];
      });
      assert(J(said) === J([BAD_TEXT, BAD_TEXT, BAD_TEXT, null]), 'the connect screen and Settings say the one invalid-key text: ' + J(said));
    } finally { await app.close(); }
  }
});

serial('disconnect, clearChat and startIntake ask first (their confirms forwarded) and act on yes: Key removed and the connect route, the chat cleared, setup presented with Cancel and no Back; nokey, empty, intake, each before stale; stale on Log, where no web sheet opens; clearChat with no key is stale (the connect screen offers no Clear Chat History)', async () => {
  const app = await pageBoot('tabs', { init: P8, seed: { kt_coach_msgs: TWO, kt_routine: '' } });
  try {
    await ready(app);
    const out = await ev(app, async () => {
      const r = {}, call = async (n, a) => { const x = await FPScreens.call(n, a || {}); return x.ok ? 'ok' : x.error; };
      const onLog = async (names) => {
        await __fpShell.tap('log'); await __w(40);
        const s = __state(), covered = _fpCovered(), answers = [];
        for (const n of names) answers.push(await call('coachHome.' + n));
        await __w(40);
        const same = __state() === s;
        await __fpShell.tap('coach'); await __w(40);
        return { covered, answers, same };
      };
      // asks through the shell: the answer, the titles asked, and the one confirm's id
      const ask = async (n) => {
        const i = __fpShell.of('confirm').length, a = await call('coachHome.' + n);
        await __w(20);
        const c = __fpShell.of('confirm').slice(i);
        return { a, asked: c.map((x) => x.title), id: c.length === 1 ? c[0].id : null };
      };
      const reply = async (id, yes) => { const a = await call('confirm', { id, yes }); await __w(60); return a; };
      const said = (i) => __fpShell.of('toast').slice(i).map((x) => x.text);
      // Log: the native Coach tab does not cover the page; the three answer stale, ask nothing and open no sheet
      r.log = await onLog(['disconnect', 'clearChat', 'startIntake']);
      // clearChat: no leaves the chat; yes clears it
      let q = await ask('clearChat');
      let s = __state();
      r.clearNo = { q: { a: q.a, asked: q.asked }, reply: await reply(q.id, false) };
      r.clearNo.same = __state() === s;
      q = await ask('clearChat');
      let t = __fpShell.of('toast').length;
      r.clear = { q: { a: q.a, asked: q.asked }, reply: await reply(q.id, true) };
      Object.assign(r.clear, { n: coachMessages.length, stored: localStorage.getItem('kt_coach_msgs'), toasts: said(t),
        rows: __last('coachHome').groups.map((g) => g.rows.map((x) => x.do).join(' ')), again: await call('coachHome.clearChat') });
      r.clearLog = await onLog(['clearChat']);   // empty before stale
      // disconnect: yes removes the key; then nokey, on Log too (nokey before stale)
      q = await ask('disconnect');
      t = __fpShell.of('toast').length;
      r.disc = { q: { a: q.a, asked: q.asked }, reply: await reply(q.id, true) };
      Object.assign(r.disc, { key: localStorage.getItem('kt_apikey'), toasts: said(t), route: __last('coachHome').route,
        again: [await call('coachHome.disconnect'), await call('coachHome.startIntake')] });
      r.discLog = await onLog(['disconnect', 'startIntake']);
      // no key with a message: the connect screen has no Clear Chat History
      _pushCoach({ role: 'user', content: 'Still there?' }); render(); await __w(20);
      r.clearNoKey = await call('coachHome.clearChat');
      // startIntake over that message: asks first; yes starts setup, which presents the chat in setup mode
      r.setKey = await call('coachHome.setKey', { secret: 'sk-ant-test-again' });
      await __w(40);
      q = await ask('startIntake');
      const n = __n();
      r.intake = { q: { a: q.a, asked: q.asked, tone: __fpShell.of('confirm').slice(-1)[0].tone }, reply: await reply(q.id, true) };
      await __idle();
      const d = __decl(n).filter((x) => / coach$/.test(x)), p = d.indexOf('present coach'), m = __last('coach');
      Object.assign(r.intake, { intake: !!intakeMode, pd: d.filter((x) => !/^model/.test(x)), modelFirst: p > 0 && d.slice(0, p).indexOf('model coach') >= 0,
        header: { back: m.header.back, cancel: m.header.cancel }, mIntake: m.intake, again: await call('coachHome.startIntake') });
      r.intakeLog = await onLog(['startIntake']);   // intake before stale
      return r;
    });
    assert(!out.log.covered && J(out.log.answers) === '["stale","stale","stale"]' && out.log.same,
      'on Log: stale, nothing asked, no web sheet, nothing changed: ' + J(out.log));
    assert(out.clearNo.q.a === 'ok' && J(out.clearNo.q.asked) === '["Clear chat history?"]' && out.clearNo.reply === 'ok' && out.clearNo.same,
      'clearChat forwards its confirm; no changes nothing: ' + J(out.clearNo));
    const c = out.clear;
    assert(c.q.a === 'ok' && J(c.q.asked) === '["Clear chat history?"]' && c.reply === 'ok' && c.n === 0 && c.stored === null
      && J(c.toasts) === '["Chat history cleared"]' && J(c.rows) === '["openChat","startIntake","disconnect"]' && c.again === 'empty',
      'clearChat on yes: cleared, the toast forwarded, the hub without the row; then empty: ' + J(c));
    assert(J(out.clearLog.answers) === '["empty"]' && out.clearLog.same, 'empty before stale: ' + J(out.clearLog));
    const k = out.disc;
    assert(k.q.a === 'ok' && J(k.q.asked) === '["Disconnect API key?"]' && k.reply === 'ok' && k.key === null && J(k.toasts) === '["Key removed"]'
      && k.route === 'connect' && J(k.again) === '["nokey","nokey"]', 'disconnect on yes: Key removed, the connect route; then nokey: ' + J(k));
    assert(J(out.discLog.answers) === '["nokey","nokey"]' && out.discLog.same, 'nokey before stale: ' + J(out.discLog));
    assert(out.clearNoKey === 'stale', 'clearChat with no key is stale: ' + J(out.clearNoKey));
    const i = out.intake;
    assert(out.setKey === 'ok' && i.q.a === 'ok' && J(i.q.asked) === '["Start programme setup?"]' && i.q.tone === 'accent' && i.reply === 'ok',
      'startIntake asks first over the chat: ' + J([out.setKey, i.q, i.reply]));
    assert(i.intake && J(i.pd) === '["present coach"]' && i.modelFirst && i.mIntake && i.header.cancel === true && i.header.back === false && i.again === 'intake',
      'setup presents the chat with Cancel and no Back, its model first; then intake: ' + J(i));
    assert(J(out.intakeLog.answers) === '["intake"]' && out.intakeLog.same, 'intake before stale: ' + J(out.intakeLog));
  } finally { await app.close(); }
});

serial('openChat presents the chat, its model first (nokey without a key); with a programme startIntake and openStarter answer has-programme (nokey first), and openStarter neither selects Log nor paints the starter', async () => {
  const app = await pageBoot('tabs', { init: P8 });
  try {
    await ready(app);
    const out = await ev(app, async () => {
      const call = async (n) => { const x = await FPScreens.call('coachHome.' + n, {}); return x.ok ? 'ok' : x.error; };
      switchTab('coach'); await __w(40);
      let s = __state();
      const r = { has: [await call('startIntake'), await call('openStarter')] };
      await __w(40);
      r.hasSame = __state() === s;
      localStorage.removeItem('kt_apikey'); render(); await __w(40);
      s = __state();
      r.nokey = [await call('startIntake'), await call('openChat')];
      await __w(40);
      r.nokeySame = __state() === s;
      localStorage.setItem('kt_apikey', 'sk-ant-test'); render(); await __w(40);
      const n = __n();
      r.open = { a: await call('openChat') };
      await __w(40);
      const d = __decl(n).filter((x) => / coach$/.test(x)), p = d.indexOf('present coach');
      Object.assign(r.open, { pd: d.filter((x) => !/^model/.test(x)), modelFirst: p > 0 && d.slice(0, p).indexOf('model coach') >= 0, shown: !!_fp.shown.coach,
        view: coachView, screen: __screen().kids });
      return r;
    });
    assert(J(out.has) === '["has-programme","has-programme"]' && out.hasSame, 'a programme: has-programme, nothing changed: ' + J(out));
    assert(J(out.nokey) === '["nokey","nokey"]' && out.nokeySame, 'no key: nokey (before has-programme), nothing presented: ' + J(out));
    assert(out.open.a === 'ok' && J(out.open.pd) === '["present coach"]' && out.open.modelFirst && out.open.shown && out.open.view === 'chat'
      && J(out.open.screen) === '["kt-fp-ph/coachHome"]', 'openChat: the chat presented, its model first: ' + J(out.open));
  } finally { await app.close(); }
});

serial('openStarter: one selectTab {tab:\'log\'}, sent before the local switch and before the starter is painted (T9 f); then the starter up on Log, announced (sheets {open:true}), the page no longer covered', async () => {
  const app = await pageBoot('tabs', { init: P8, seed: { kt_apikey: '', kt_routine: '' } });
  try {
    await ready(app);
    const out = await ev(app, async () => {
      switchTab('coach'); await __w(40);
      const home = __last('coachHome'), r = { route: home.route, link: !!(home.connect && home.connect.starter), covered: _fpCovered() };
      // the starter's paint, as the page appends it: how many selectTab calls had gone by then, and the page's tab
      const s0 = __fpShell.of('selectTab').length, c0 = __fpShell.calls.length, seen = [], ap = document.body.appendChild;
      document.body.appendChild = function (el) {
        if (el && el.id === 'starterOverlay') seen.push({ selects: __fpShell.of('selectTab').length - s0, tab: currentTab });
        return ap.apply(this, arguments);
      };
      r.a = await FPScreens.call('coachHome.openStarter', {});
      await __w(80);
      delete document.body.appendChild;
      const after = __fpShell.calls.slice(c0);
      Object.assign(r, { seen, selects: after.filter((c) => c[0] === 'selectTab').map((c) => ({ args: c[1], from: c[2].currentTab })),
        sheets: after.filter((c) => c[0] === 'sheets').map((c) => c[1]), overlay: !!document.getElementById('starterOverlay'), tab: currentTab,
        coveredAfter: _fpCovered() });
      return r;
    });
    assert(out.route === 'connect' && out.link && out.covered, 'the native connect screen offers the starter: ' + J(out));
    assert(J(out.a) === '{"ok":true}' && J(out.selects) === J([{ args: { tab: 'log' }, from: 'coach' }]),
      'one selectTab {tab:"log"}, sent before the local switch: ' + J(out));
    assert(J(out.seen) === J([{ selects: 1, tab: 'log' }]), 'the starter painted after the selectTab, on Log: ' + J(out.seen));
    assert(out.overlay && J(out.sheets) === '[{"open":true}]' && out.tab === 'log' && !out.coveredAfter, 'the starter up and announced: ' + J(out));
  } finally { await app.close(); }
});
