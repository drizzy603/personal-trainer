// fp-spec: self-shelled
// 129: every way into (and out of) the Coach tab through the funnel (plan task P4; contract 3.3, contract 12's "one
// selectTab per page path", I2).
// - A source scan: currentTab is assigned only in the state block, the fp-tabs boot block and _switchTabLocal;
//   coachCardAction no longer assigns it (it goes through switchTab('coach', {intent:'chat'})).
// - Under tabs and tabsWeb, with a key, a programme and the coach API answering at once, each page path sends exactly
//   one selectTab {tab, intent}, before its local switch (the mock saw the old currentTab), and the page and the shell
//   end on its tab (the answer's seq the page's; no tabs.select back): Today's card (coachCardAction) and its Ask, the
//   plateau, progression, recovery and weekly-review cards, a shared photo (checkPendingShare, a TrovoShare stand-in)
//   and Build day's "Ask the coach" ('chat'); the empty Log tab's CTA with a key ('intake'); the native chat's Open
//   Settings (coach.openSettings), trovo://start, the runner resumed from another tab, Start a new programme (its
//   confirm answered yes), "Set up the AI Coach" with no key, setup's end, the starter plan's apply, the programme
//   modal's starter link and Progress' empty state (no intent); the share's comment and Build day's request drafted.
//   The web chat's key-error chip runs under tabsWeb, where the Coach tab is always the page's: under tabs the chat
//   goes native once the page takes the Coach tab (P7), and the native chat's way to Settings is coach.openSettings.
//   Buttons are found by what they say, so a path that stops sending fails on its count, not on a lost selector.
// - Under coach61 (classic root, 60's overlay chat) the same tour sends no selectTab and ends each path on its tab.
// - Classic (none): coachCardAction now lights the Coach tab (aria-current), leaves COMPARE, closes the day sheet and
//   releases the workout's wake lock (a navigator.wakeLock stand-in records it), as the switch it goes through does;
//   the empty Log tab keeps button[onclick="switchTab('coach')"] with no key, and Lime's rules on the links' handler
//   text (switchTab('coach'), switchTab('settings'), openStarterIntake()) still style their buttons, key or none.
// Every boot names its shell (the mark above): FP_SHELL_INERT runs skip this spec.
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
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const KEY = 'sk-ant-test';
const SEED = { kt_apikey: KEY, kt_coach_msgs: '[]' };

// In the page, before its scripts: the coach API answering at once (chat turns, with tools, say "On it."; the morning
// card's call, without, a card), every other request as the page would make it, and a wait for a turn to end.
const COACH_API = `(() => {
  const real = window.fetch;
  window.fetch = async (url, o) => {
    if (!String(url).includes('anthropic')) return real.call(window, url, o);
    const body = JSON.parse(o.body);
    return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', content: [{ type: 'text', text: body.tools ? 'On it.' : '{"message":"ok","actions":[]}' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  window.__wait = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__idle = async () => { for (let i = 0; i < 150 && coachLoading; i++) await __wait(20); await __wait(30); };
})()`;
// Hello answered (under a flag) and the morning card's fetch done (it repaints Log a beat after the boot).
const ready = (app, flag) => app.page.waitForFunction((flag) => (!flag || (window._fp && _fp.hello)) && typeof coachCardLoading !== 'undefined'
  && !coachCardLoading, flag, { timeout: 15000 }).then(() => settle(app, 80));
const idle = (app) => ev(app, () => __idle());

// ── The source scan ───────────────────────────────────────────────────────────────────────────────────────────────
serial('the source scan: currentTab is assigned only in the state block, the fp-tabs boot block and _switchTabLocal; coachCardAction goes through switchTab(\'coach\', {intent:\'chat\'})', async () => {
  const lineOf = (i) => SRC.slice(0, i).split('\n').length;
  const fnBody = (name) => {
    const i = SRC.indexOf('\nfunction ' + name + '(');
    assert(i >= 0, name + ' is in the page');
    const j = SRC.indexOf('\n}\n', i);
    return { from: i, to: j + 2, text: SRC.slice(i, j + 2) };
  };
  // Every assignment (=, and the compound ones), never a comparison (==, ===, !=, <=, >=); a match after a line
  // comment's // is the comment's.
  const RX = /\bcurrentTab\s*(?:[-+*/%&|^]|\|\||&&|\?\?|<<|>>>?|\*\*)?=(?!=)/g;
  const found = [];
  let m;
  while ((m = RX.exec(SRC))) {
    const ls = SRC.lastIndexOf('\n', m.index) + 1;
    if (/(^|\s)\/\/.*$/.test(SRC.slice(ls, m.index))) continue;
    found.push({ at: m.index, line: lineOf(m.index), text: SRC.slice(ls, SRC.indexOf('\n', m.index)).trim() });
  }
  const st = SRC.indexOf('// ── State ──'), boot0 = SRC.indexOf('// fp-tabs boot block:'), boot1 = SRC.indexOf('\nvar coachMessages', boot0);
  assert(st >= 0 && boot0 > st && boot1 > boot0, 'the state block and the fp-tabs boot block are where the scan looks: ' + J([st, boot0, boot1]));
  const local = fnBody('_switchTabLocal');
  const where = (f) => (f.at > st && f.at < boot0 && f.text === "var currentTab = 'log';" ? 'state'
    : f.at > boot0 && f.at < boot1 ? 'boot' : f.at > local.from && f.at < local.to ? 'local' : null);
  const stray = found.filter((f) => !where(f));
  assert(stray.length === 0, 'no assignment to currentTab outside the three places: ' + J(stray));
  const per = found.reduce((a, f) => { a[where(f)] = (a[where(f)] || 0) + 1; return a; }, {});
  assert(per.state === 1 && per.boot === 1 && per.local === 1 && found.length === 3, 'one in each place: ' + J(found));
  const cca = fnBody('coachCardAction');
  assert(!/\bcurrentTab\s*=(?!=)/.test(cca.text) && cca.text.indexOf("switchTab('coach',{intent:'chat'}); coachView='chat'; render();") >= 0,
    'coachCardAction switches through the funnel with the chat as its intent: ' + cca.text);
});

// ── The tour ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Each path: pre (before the switch to its starting tab), from (that tab: every path starts elsewhere, so the mock's
// record of currentTab at the call tells a selectTab sent before the local switch from one sent after), setup (on that
// tab), then act (a page function) or click (a button Playwright clicks, found by what it says, so its handler's own
// text runs), then until (a page function the path's own timer makes true) and no coach turn in flight, check (a page
// function whose answer must be true) and after (the clean-up: a page function or a list of them).
// tab and intent: the selectTab it must send. only: the shells it runs under.
const STARTER = { goal: 'muscle', days: 3, runs: 0, equip: 'full', exp: 0 };
// A drafted message (the share's comment, Build day's request) leaves the composer, so no later path sends it.
const UNDRAFT = () => {
  _fp.draft = null; _coachDraft = { v: '', s: 0, e: 0, focus: false };
  const box = document.getElementById('coach-input'); if (box) box.value = '';
};
const TOUR = [
  { name: 'coachCardAction', from: 'log', tab: 'coach', intent: 'chat', act: () => { coachCardAction('Ask about my squat'); },
    check: () => coachView === 'chat' && coachMessages.some((m) => m.role === 'user' && m.content === 'Ask about my squat') },
  { name: 'handleCoachCardAsk', from: 'log', tab: 'coach', intent: 'chat', act: () => { handleCoachCardAsk({ key: 'Enter', target: { value: 'x' } }); },
    check: () => coachView === 'chat' && coachMessages.some((m) => m.role === 'user' && m.content === 'x') },
  { name: 'startPlateauFix', from: 'log', tab: 'coach', intent: 'chat', act: () => { startPlateauFix(); },
    check: () => coachView === 'chat' && coachMessages.some((m) => m._seed === 'Plateau check') },
  { name: 'startProgression', from: 'progress', tab: 'coach', intent: 'chat', act: () => { startProgression(); },
    check: () => coachView === 'chat' && coachMessages.some((m) => m._seed === 'Progression check') },
  { name: 'startRecoveryAdjust', from: 'settings', tab: 'coach', intent: 'chat', act: () => { startRecoveryAdjust(); },
    check: () => coachView === 'chat' && coachMessages.some((m) => m._seed === 'Recovery check') },
  { name: 'startWeeklyReview', from: 'log', tab: 'coach', intent: 'chat', act: () => { startWeeklyReview(); },
    check: () => coachView === 'chat' && coachMessages.some((m) => m._seed === 'Weekly review') },
  // armed in the call's own task, so the boot's 2.5 s check can never take it first; the comment is drafted 200 ms on
  { name: 'checkPendingShare', from: 'progress', tab: 'coach', intent: 'chat',
    act: () => { window.__share = { imageBase64: '/9j/4AAQ', comment: 'Form check' }; return checkPendingShare(); },
    until: () => __prefill.length > 0,
    check: () => coachView === 'chat' && !!pendingImage && window.__share === null && __prefill.join('|') === 'Form check',
    after: [() => { clearPendingImage(); }, UNDRAFT] },
  // the request is drafted 150 ms on
  { name: "Build day's Ask the coach (_bdAskCoach)", from: 'log', tab: 'coach', intent: 'chat',
    setup: () => { openBuildDay('Arms'); }, click: '#buildDayOverlay button:has-text("Ask the coach to build it")',
    until: () => __prefill.length > 0,
    check: () => coachView === 'chat' && !document.getElementById('buildDayOverlay') && __prefill.length === 1 && __prefill[0].indexOf('Build my ') === 0,
    after: UNDRAFT },
  { name: 'coach.openSettings', from: 'coach', tab: 'settings', act: () => window.__fpShell.call('coach.openSettings').then(() => {}) },
  { name: 'the key-error chip', from: 'coach', tab: 'settings', only: ['tabsWeb'],
    setup: () => {
      _pushCoach({ role: 'assistant', content: 'Anthropic did not accept your API key. Check it in Settings › AI Coach.', _error: true, _local: true, _errKind: 'key' });
      saveCoachHistory(); coachView = 'chat'; render();
    },
    click: '#screen .kt-chat-retry button:has-text("Open Settings")',
    after: () => { coachMessages.pop(); saveCoachHistory(); } },
  // today's session (or the run log) opens 150 ms on; a sport day opens its own Log tab and nothing more
  { name: 'trovo://start (_handleDeepLink)', from: 'progress', tab: 'log',
    pre: () => { window.__opened = []; window.__keep = [window.startTodaySession, window.openRunLog];
      window.startTodaySession = () => { __opened.push('session'); }; window.openRunLog = () => { __opened.push('run'); }; },
    act: () => { _handleDeepLink('trovo://start'); },
    until: () => __opened.length > 0 || getTodayActivity().type === 'sport',
    check: () => __opened.length === (getTodayActivity().type === 'sport' ? 0 : 1),
    after: () => { window.startTodaySession = __keep[0]; window.openRunLog = __keep[1]; logSubTab = 'workout'; } },
  { name: "openDeckRunner's resume", from: 'settings', tab: 'log', pre: () => { switchTab('log'); openDeckRunner('Push', true); },
    act: () => { openDeckRunner(); },
    check: () => runnerOpen && document.getElementById('runner-root').style.display === 'block',
    after: () => { closeDeckRunner(); } },
  { name: 'startNewProgramme', from: 'settings', tab: 'coach',
    setup: () => { window.__ask = []; window.__confirm = window._ktConfirm; window._ktConfirm = (o) => { __ask.push(o.title); o.onConfirm(); }; },
    act: () => { startNewProgramme(); },
    check: () => __ask.length === 1 && !hasCustomRoutine() && coachView === 'home',
    after: () => { window._ktConfirm = __confirm; } },
  { name: '"Set up the AI Coach" (no key)', from: 'log', tab: 'coach', pre: () => { localStorage.removeItem('kt_apikey'); logSubTab = 'workout'; },
    click: '#screen button:has-text("Set up the AI Coach")',
    check: () => !getApiKey() && !hasCustomRoutine(),
    after: (key) => { localStorage.setItem('kt_apikey', key); } },
  { name: "the empty Log tab's CTA (a key)", from: 'log', tab: 'coach', intent: 'intake', pre: () => { logSubTab = 'workout'; },
    click: '#screen button.kt-cta',
    check: () => intakeMode === true && coachMessages.some((m) => m._seed === 'Programme setup') },
  // the programme the coach would have written lands; the next reply ends setup
  { name: "setup's end", from: 'coach', tab: 'log', pre: () => { setCustomRoutine(window.__routine); },
    act: () => { coachSend('That is everything'); },
    check: () => intakeMode === false && hasCustomRoutine() },
  { name: 'applyStarterRoutine', from: 'coach', tab: 'log', setup: () => { openStarterIntake(); },
    act: (a) => { applyStarterRoutine(a); },
    check: () => !document.getElementById('starterOverlay') && getCustomRoutine().name === 'Your starter block' },
  { name: "the programme modal's starter link", from: 'settings', tab: 'log', pre: () => { clearCustomRoutine(); },
    setup: () => { openProgrammeModal(); },
    click: '#prog-modal button:has-text("Build a starter plan")',
    check: () => !document.getElementById('prog-modal') && !!document.getElementById('starterOverlay'),
    after: () => { closeStarterIntake(); } },
  { name: "Progress' empty state", from: 'progress', tab: 'log',
    pre: () => { clearCustomRoutine(); lsDel('kt_sessions'); lsDel('kt_runs'); lsDel('kt_sports'); },
    click: '#screen button:has-text("Build a plan")',
    check: () => !!document.getElementById('starterOverlay'),
    after: () => { closeStarterIntake(); } },
];
const ARGS = { applyStarterRoutine: STARTER, '"Set up the AI Coach" (no key)': KEY };

// Runs the tour in a booted page; returns one row per path: the selectTab calls it made (args, the currentTab the mock
// saw), where the page and the shell's scene ended, the seqs, the shell's tabs.select messages, and its check.
async function tour(app, shell) {
  await ev(app, () => {
    window.__routine = getCustomRoutine();
    // each card's due state, as spec 118 seeds it
    window._plateauLifts = () => [{ name: 'Bench Press', e1rm: 200, days: 28 }];
    window._progressionLifts = () => [{ name: 'Bench Press', weight: 185, rpe: 7, sets: 3 }];
    lsSet('kt_readiness', { date: todayISO(), score: 40, parts: { sleep: 5, hrvDelta: -12 } });
    // TrovoShare: getPendingShare hands over what it holds once (the plugin deletes what it returns)
    window.__share = null;
    Capacitor.Plugins.TrovoShare.getPendingShare = () => { const r = window.__share; window.__share = null; return Promise.resolve(r || {}); };
    // the drafts the app writes for the owner to send (coachPrefill), per path
    window.__prefill = [];
    const prefill = window.coachPrefill;
    window.coachPrefill = function (t) { __prefill.push(String(t)); return prefill.apply(this, arguments); };
  });
  const rows = [];
  for (const s of TOUR) {
    if (s.only && s.only.indexOf(shell) < 0) continue;
    const arg = ARGS[s.name];
    if (s.pre) await ev(app, s.pre, arg);
    await ev(app, (t) => { switchTab(t); }, s.from);
    if (s.setup) await ev(app, s.setup, arg);
    await settle(app, 40);
    const n0 = await ev(app, () => { window.__prefill = []; return { calls: __fpShell.calls.length, sent: __fpShell.sent.length, tab: currentTab }; });
    if (s.click) await app.page.click(s.click, { timeout: 5000 });
    else await ev(app, s.act, arg);
    if (s.until) await app.page.waitForFunction(s.until, arg, { timeout: 10000 });
    await idle(app);
    const r = await ev(app, (n0) => {
      const sc = __fpShell.state().scene;
      return {
        sel: __fpShell.calls.slice(n0.calls).filter((c) => c[0] === 'selectTab').map((c) => ({ args: c[1], was: c[2].currentTab })),
        at: n0.tab, tab: currentTab, scene: sc.selected, sceneSeq: sc.seq, seq: _fp.tabs.seq, mode: _fp.tabs.mode,
        back: __fpShell.sent.slice(n0.sent).filter((m) => m[0] === 'tabs.select').length,
      };
    }, n0);
    r.check = s.check ? await ev(app, s.check, arg) : true;
    rows.push(Object.assign({ name: s.name, from: s.from, want: s.intent ? { tab: s.tab, intent: s.intent } : { tab: s.tab } }, r));
    for (const f of [].concat(s.after || [])) await ev(app, f, arg);
  }
  return rows;
}

for (const shell of ['tabs', 'tabsWeb']) {
  serial(shell + ': every path into and out of Coach sends exactly one selectTab {tab, intent} before its local switch, and the page and the shell end on its tab', async () => {
    const app = await boot({ native: true, shell, seed: SEED, init: COACH_API });
    try {
      await ready(app, true);
      const rows = await tour(app, shell);
      assert(rows.length === TOUR.filter((s) => !s.only || s.only.indexOf(shell) >= 0).length, 'every path ran: ' + J(rows.map((r) => r.name)));
      for (const r of rows) {
        const tag = shell + ' ' + r.name + ': ';
        assert(r.mode === true && r.at === r.from && r.from !== r.want.tab, tag + 'in tabs mode, from its own tab: ' + J(r));
        assert(r.sel.length === 1, tag + 'exactly one selectTab: ' + J(r.sel));
        assert(J(r.sel[0].args) === J(r.want), tag + 'selectTab ' + J(r.want) + ': ' + J(r.sel[0].args));
        assert(r.sel[0].was === r.from, tag + 'sent before the local switch (the mock saw ' + r.from + '): ' + J(r.sel[0]));
        assert(r.tab === r.want.tab && r.scene === r.want.tab && r.seq === r.sceneSeq, tag + 'the page and the shell on its tab, the seq the page\'s: ' + J(r));
        assert(r.back === 0, tag + 'no tabs.select back (no echo): ' + J(r));
        assert(r.check === true, tag + 'the path did what it does: ' + J(r));
      }
      assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
    } finally { await app.close(); }
  });
}

serial('coach61 (classic root, 60\'s overlay chat): the same tour sends no selectTab and ends each path on its tab', async () => {
  const app = await boot({ native: true, shell: 'coach61', seed: SEED, init: COACH_API });
  try {
    await ready(app, true);
    const rows = await tour(app, 'coach61');
    assert(rows.length === TOUR.filter((s) => !s.only).length, 'every path ran: ' + J(rows.map((r) => r.name)));
    for (const r of rows) {
      const tag = 'coach61 ' + r.name + ': ';
      assert(r.mode === false && r.sel.length === 0 && r.back === 0, tag + 'no selectTab: ' + J(r));
      assert(r.tab === r.want.tab && r.check === true, tag + 'on its tab, and the path did what it does: ' + J(r));
    }
    const all = await ev(app, () => ({ sel: __fpShell.of('selectTab').length, hello: _fp.hello && _fp.hello.screens }));
    assert(all.sel === 0 && J(all.hello) === J(['coach']), 'no selectTab in the whole document, and 60\'s chat negotiated: ' + J(all));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

// ── Classic ───────────────────────────────────────────────────────────────────────────────────────────────────────
// navigator.wakeLock that records each request and each release.
const WAKE_LOCK = `(() => {
  window.__wl = [];
  const lock = { request: (type) => { __wl.push('request:' + type); return Promise.resolve({ release: () => { __wl.push('release'); return Promise.resolve(); } }); } };
  Object.defineProperty(Navigator.prototype, 'wakeLock', { configurable: true, get: () => lock });
})()`;
// Lime's rules that read an inline handler's text (the CSS in the page, not a copy).
const LIME = SRC.match(/html\[data-room="dark"\] #screen button\[onclick="[^"]+"\]\[style\*="accent-ink"\]/g) || [];

serial('classic (none): coachCardAction goes through the switch, so it lights the Coach tab, leaves COMPARE, closes the day sheet and releases the wake lock; the empty Log tab keeps switchTab(\'coach\') with no key, and Lime\'s rules on the handlers\' text still style their buttons', async () => {
  const app = await boot({ shell: 'none', seed: SEED, init: COACH_API + ';' + WAKE_LOCK });
  try {
    await ready(app, false);
    const out = await ev(app, async () => {
      const lit = () => [...document.querySelectorAll('.tab')].filter((t) => t.getAttribute('aria-current') === 'page').map((t) => t.dataset.tab);
      const on = () => [...document.querySelectorAll('.tab.active')].map((t) => t.dataset.tab);
      const ask = async () => { coachCardAction('Ask about my squat'); await __idle(); };
      const r = { shell: !!window.__FP_SHELL || !!(window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.TrovoShell) };
      // the workout's wake lock: held on Log's workout, released on the way to Coach
      logSubTab = 'workout'; switchTab('log'); await __wait(40);
      r.held = { lock: !!wakeLock, wl: __wl.slice(), lit: lit() };
      const k = __wl.length;
      await ask();
      r.lock = { wl: __wl.slice(k), lock: !!wakeLock, tab: currentTab, view: coachView, lit: lit(), on: on(),
        sent: coachMessages.filter((m) => m.role === 'user' && m.content === 'Ask about my squat').length };
      // COMPARE on Progress
      switchTab('progress'); await __wait(20); cmpToggle(); await __wait(20);
      r.cmp0 = { on: cmpOn, lit: lit() };
      await ask();
      r.cmp = { on: cmpOn, sheet: !!document.getElementById('cmpSheetOverlay'), tab: currentTab, lit: lit(), on2: on() };
      // the calendar's day sheet
      switchTab('progress'); await __wait(20); openCalDay(_calActiveDays().slice(-1)[0]); await __wait(20);
      r.day0 = !!document.getElementById('calDayOverlay');
      await ask();
      r.day = { open: !!document.getElementById('calDayOverlay'), tab: currentTab, view: coachView, lit: lit(), on: on() };
      return r;
    });
    assert(out.shell === false, 'no shell, no TrovoShell: ' + J(out));
    assert(out.held.lock && out.held.wl.indexOf('request:screen') >= 0 && J(out.held.lit) === '["log"]', 'the workout holds the wake lock on Log: ' + J(out.held));
    assert(J(out.lock.wl) === '["release"]' && !out.lock.lock, 'coachCardAction releases it (the switch does): ' + J(out.lock));
    assert(out.lock.tab === 'coach' && out.lock.view === 'chat' && out.lock.sent === 1 && J(out.lock.lit) === '["coach"]' && J(out.lock.on) === '["coach"]',
      'the chat with the question, the Coach tab lit (aria-current, active): ' + J(out.lock));
    assert(out.cmp0.on === true && out.cmp.on === false && !out.cmp.sheet && out.cmp.tab === 'coach' && J(out.cmp.lit) === '["coach"]' && J(out.cmp.on2) === '["coach"]',
      'COMPARE left on the way: ' + J([out.cmp0, out.cmp]));
    assert(out.day0 === true && out.day.open === false && out.day.tab === 'coach' && out.day.view === 'chat' && J(out.day.lit) === '["coach"]',
      'the day sheet closed on the way: ' + J([out.day0, out.day]));

    // the empty Log tab: no key, then a key; in the Lime room
    assert(LIME.length === 3 && J(LIME.map((s) => s.match(/onclick="([^"]+)"/)[1]).sort()) === J(["openStarterIntake()", "switchTab('coach')", "switchTab('settings')"]),
      'Lime reads three links\' handler text: ' + J(LIME));
    const empty = await ev(app, (LIME) => {
      const look = () => {
        const o = {};
        LIME.forEach((sel) => {
          const els = [...document.querySelectorAll(sel)];
          o[sel.match(/onclick="([^"]+)"/)[1]] = els.map((el) => [el.textContent.trim(), getComputedStyle(el).textDecorationLine]);
        });
        const cta = document.querySelector('#screen button.kt-cta');
        o.cta = cta ? cta.getAttribute('onclick') : null;
        o.coachBtn = document.querySelectorAll('#screen button[onclick="switchTab(\'coach\')"]').length;
        return o;
      };
      applyTheme('dark');
      localStorage.removeItem('kt_apikey'); clearCustomRoutine(); logSubTab = 'workout'; switchTab('log');
      const nokey = Object.assign({ room: document.documentElement.getAttribute('data-room') }, look());
      localStorage.setItem('kt_apikey', 'sk-ant-test'); render();
      const key = look();
      return { nokey, key };
    }, LIME);
    const nk = empty.nokey, k = empty.key;
    assert(nk.room === 'dark' && nk.coachBtn === 1, 'no key: the empty Log tab keeps button[onclick="switchTab(\'coach\')"]: ' + J(nk));
    assert(J(nk["switchTab('coach')"]) === J([['Set up the AI Coach →', 'underline']]) && J(nk["switchTab('settings')"]) === J([['Restore a backup →', 'underline']])
      && nk['openStarterIntake()'].length === 0 && nk.cta === 'openStarterIntake();', 'no key: Lime styles "Set up the AI Coach" and "Restore a backup": ' + J(nk));
    assert(J(k['openStarterIntake()']) === J([['Quick starter plan →', 'underline']]) && J(k["switchTab('settings')"]) === J([['Restore a backup →', 'underline']])
      && k["switchTab('coach')"].length === 0 && k.coachBtn === 0 && k.cta === "switchTab('coach',{intent:'intake'});startRoutineIntake();",
      'a key: Lime styles "Quick starter plan" and "Restore a backup"; the CTA asks for setup, a handler no Lime rule reads: ' + J(k));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
