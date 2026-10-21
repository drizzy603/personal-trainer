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
//   Fixtures/draft/putback.json, through the handler) and answered took; a draft off coach ignored; a numeric draft
//   bad-args; the mock's composer cleared only after took.
// - The words survive (P-D15, I16): kt_coach_handover is written before the took answer, is device-only bookkeeping
//   (no backup carries it), comes back after a reload in the fallen-back scene, after a relaunch and in the first
//   paint of a reload on the Coach tab in setup (then to the native setup chat as its draft), goes back to a
//   native chat as its draft and leaves on coach.draftTaken with the web copy (one composer at a time, a trailing line
//   too), follows the box (a render, the page hidden), and leaves on a send from either composer and on an emptied
//   box; a failed write answers without took and changes nothing; under STORE=shadow the native copy has the key.
// - confirm and toast.undo answer before their action runs (D14); a spent id answers stale.
// - Setup keeps its answers: the setup chat has Cancel and no Back, a tab change dismisses it with setup kept and the
//   Coach tab's model saying resume, and Coach presents it again; the intake error says "top left".
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
      // every shared vector through the handler: the composer off screen (Log), the words handed over
      switchTab('log'); await __w(30);
      r.vectors = [];
      for (const c of VECTORS.cases) {
        _coachDraft = { v: c.composer, s: 0, e: 0, focus: false };
        const a = await FPScreens.call('screens.off', { screen: 'coach', why: 'failures', draft: c.words });
        r.vectors.push({ name: c.name, a, got: _coachDraft.v, key: __key(), want: c.result, page: _fpPutBack(c.composer, c.words) });
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
    assert(out.vectors.length === VECTORS.cases.length && VECTORS.cases.length >= 20, 'every vector ran: ' + out.vectors.length);
    for (const v of out.vectors) {
      assert(v.got === v.want && v.page === v.want && J(v.a) === '{"ok":true,"took":true}' && v.key === (v.want.trim() ? v.want : null),
        'putback.json "' + v.name + '": ' + J(v));
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
