// fp-spec: self-shelled
// 124: build 61's overlays announced to the shell and held for its answer (plan task P5; contract 3.4, D8, P-5, T-G8).
// - Every overlay kind is announced under the tab root: one sheets {open:true} as it opens and one {open:false} as the
//   last one closes, for every function a source scan finds putting an overlay up (each .kt-sheet-overlay,
//   .kt-close-sheet and .ex-modal-bg opener, the runner's Edit sheet, the starter, showManualCopy: a new one fails by
//   its name until it has its row here), How it works, the privacy page, and a day sheet that render() closes when its
//   last log is deleted; the runner itself is never announced (D8).
// - The rule, kind by kind: under no shell an overlay covers the page's own #tabs (elementFromPoint at the bar's
//   centre lands inside it) exactly when, under tabs, it is announced; the runner sits under the bar and is neither.
//   The scan finds every overlay put up as a child of <body>, where the announcer's observer sees it.
// - Coalescing: one call per task, and only on a net change: Begin workout (the overview's close is the one call: the
//   runner is not announced), _runnerReplace through its confirm, a re-opened theme sheet, a close then an open and an
//   open then a close in one task, the programme modal's starter link; a confirm over an open sheet sends nothing, and
//   nested overlays give one open and one close.
// - The hold (fp-hold), on Playwright's paused clock, so no wall-clock budget: on before the opener's task ends; at the
//   next frame the overlay is unseen and untouchable, its animations paused at their start and its title focused (the
//   seven openers that focus at once); released at 50 ms with no answer, at the answer when it comes sooner (10 ms, the
//   mock's 16), at 50 ms when the shell is silent, at once on a refusal ('off' leaves tabs mode: #tabs shows, no
//   dismiss tabs); its own call's answer only, never an older one's; the starter, showManualCopy's overlay and the
//   static pages too, which have no fade of their own, so their computed opacity 0 is the hold's, as it is for a
//   sheet's scrim under Reduce Motion (no fade there either); never an overlay put up while the state stays open, never
//   #runner-root. The bar: an answer's h 0 sets --fp-bar-h and leaves --fp-bar-up, closing brings 83 back, an older
//   answer never undoes a newer one. Leaving tabs mode mid-hold releases at once and ends the announcing.
// - The baseline: exactly one sheets {open:false} at boot in tabs mode, none under no shell, coach61 or build 60's
//   chat; a reload with a sheet open sends it again (the shell's state is per document); a dev.nav sheet is announced
//   before hello's answer.
// - The OTA confirm first: booting on Log and on Coach (a first paint on the coach route), TrovoOta.confirm goes once,
//   before the first sheets and the first selectTab; a baseline call that throws leaves the confirm sent and the boot
//   whole.
// - Untouched: Escape closes the top _SHEETS_SEL sheet (never #starterOverlay) and focus returns to the opener, as
//   under no shell.
// Every native boot names its shell (the mark above): FP_SHELL_INERT runs skip this spec.
const fs = require('fs');
const path = require('path');
const { boot, assert, run, CANONICAL_61, SEED } = require('../lib/harness');

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
const helloIn = (app) => app.page.waitForFunction(() => window._fp && _fp.hello, null, { timeout: 15000 });
const settle = (app, ms) => app.page.waitForTimeout(ms || 60);
const TABS = (extra) => Object.assign(JSON.parse(CANONICAL_61.tabs), extra || {});
const pageBoot = (shell, extra) => boot(Object.assign({ native: true, shell }, extra || {}));

// A TrovoStore standing in for the shell's (Settings > About > Storage opens its sheet only with one), answering as
// StoreAttach does with the copy in step.
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

// ── Every overlay kind ─────────────────────────────────────────────────────────────────────────────────────────────
serial('every overlay kind is announced under the tab root: one {open:true} as it opens, one {open:false} as the last goes (every opener the source scan finds: the sheets, the confirms, the modals, the runner\'s Edit sheet, the starter, showManualCopy; How it works, privacy, a day sheet render() closes); the runner never', async () => {
  const app = await pageBoot('tabs', { init: STORE_PLUGIN });
  try {
    await helloIn(app);
    await settle(app, 100);
    const out = await ev(app, async () => {
      const tick = () => new Promise((r) => setTimeout(r, 0));
      const calls = () => __fpShell.of('sheets').map((a) => a.open);
      const SEL = '.kt-sheet-overlay, .kt-close-sheet, .ex-modal-bg, #runner-ex-edit-modal';
      // the top sheet's backdrop, as Escape and a tap outside close it
      const closeTop = () => { const o = document.querySelectorAll(SEL); o[o.length - 1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); };
      const ses = getSessions(), runs = getRuns(), day = _calActiveDays().slice(-1)[0];
      const push = { type: 'lift', dayName: 'Push', exercises: _todayLiftExercises('Push') };
      const sp = getSportLogs(); sp.unshift({ id: 4343, date: day, type: 'Yoga', duration: 30 }); lsSet('kt_sports', sp);
      const inRunner = (fn) => () => { openDeckRunner('Push', true); fn(); };
      // [tab, name, open, close (default: the top sheet's backdrop), after (what the opener started besides)]
      const K = [
        ['log', 'openReadinessSheet', () => { lsSet('kt_readiness', { date: todayISO(), score: 64, zone: 'steady', parts: { sleep: 6.1, hrvDelta: -8, rhrDelta: 0 } }); openReadinessSheet(); }],
        ['log', 'openLocalWeekReview', () => openLocalWeekReview()],
        ['log', 'openRunEditor', () => openRunEditor(runs[0].id)],
        ['log', 'openSessionOverview', () => openSessionOverview(push)],
        ['log', 'openCompleteSheet', () => openCompleteSheet({ rec: ses[0] })],
        ['log', 'openRunnerCueSheet', inRunner(() => openRunnerCueSheet()), null, () => closeDeckRunner()],
        ['log', 'openBuildDay', () => openBuildDay('Arms')],
        ['log', 'openRoutines', () => openRoutines()],
        ['log', 'openNextRound', () => openNextRound()],
        ['log', 'openSessionEditor', () => openSessionEditor(ses[0].id)],
        ['log', 'openSportCatalogSheet', () => openSportCatalogSheet()],
        ['progress', 'openCalDay', () => openCalDay(day)],
        ['progress', 'openCompareSheet', () => { cmpOn = true; cmpKind = 'lift'; cmpPicks = [String(ses[0].id), String(ses[3].id)]; openCompareSheet(); }, null, () => _cmpExit()],
        ['progress', 'openPRHistory', () => openPRHistory(_prLedger().latest.name)],
        ['settings', 'openProfileSheet', () => openProfileSheet()],
        ['settings', 'openThemeSheet', () => openThemeSheet()],
        ['settings', 'openErrorLogSheet', () => openErrorLogSheet()],
        ['settings', 'openStorageSheet', () => openStorageSheet()],
        ['settings', 'openHealthSettings', () => openHealthSettings()],
        ['settings', 'openLogTabsEditor', () => openLogTabsEditor()],
        ['settings', 'openSportFieldsEditor', () => openSportFieldsEditor('CrossFit')],
        ['log', 'openCFMovePicker', () => openCFMovePicker()],
        ['progress', 'openSportLogEditor', () => openSportLogEditor(4343)],
        ['settings', 'openExLib', () => openExLib()],
        ['settings', 'openNativeChatSheet', () => openNativeChatSheet()],
        ['settings', '_ktConfirm', () => _ktConfirm({ title: 'Sure?', onConfirm: function () {} })],
        ['log', 'discardRunnerDraft', () => discardRunnerDraft()],
        ['log', 'confirmCloseRunner', inRunner(() => { runnerCompleteSet(); confirmCloseRunner(); }), null, () => closeDeckRunner()],
        ['settings', 'openRoutineArchiveModal', () => openRoutineArchiveModal()],
        ['log', 'openSwapModal', () => openSwapModal(1)],
        ['settings', 'openProgrammeModal', () => openProgrammeModal()],
        ['log', 'openRunnerExEdit', inRunner(() => openRunnerExEdit(0)), null, () => closeDeckRunner()],
        ['log', 'openStarterIntake', () => openStarterIntake(), () => closeStarterIntake()],
        ['settings', 'showManualCopy', () => showManualCopy('x'), () => Array.prototype.filter.call(document.querySelectorAll('.kt-manual-copy button'), (b) => b.textContent === 'Close')[0].click()],
        ['settings', 'openWorkflow', () => openWorkflow(), () => closeWorkflow()],
        ['settings', 'openPrivacy', () => openPrivacy(), () => closePrivacy()],
      ];
      const res = [];
      for (const [tab, name, open, close, after] of K) {
        if (currentTab !== tab) { switchTab(tab); await tick(); }
        const n0 = calls().length, kids = document.body.children.length;
        open(); await tick();
        const opened = calls().slice(n0);
        const added = document.body.children.length - kids;
        (close || closeTop)(); await tick();
        const all = calls().slice(n0);
        if (after) { after(); await tick(); }
        res.push({ name, opened, all, added, after: calls().slice(n0).length - all.length, left: _fpSheetsOpen() });
      }
      // the runner alone (it shows on Log): opened and closed, never announced (D8)
      switchTab('log'); await tick();
      let n0 = calls().length;
      openDeckRunner('Push', true); await tick();
      const runnerUp = !!runnerOpen && document.getElementById('runner-root').style.display === 'block';
      closeDeckRunner(); await tick();
      const runner = { up: runnerUp, calls: calls().slice(n0) };
      // a day sheet whose last log is deleted: render() closes it, and that close is announced
      switchTab('progress'); await tick();
      const one = _calActiveDays().find((d) => { const l = _calDayLogs(d); return l.s.length === 1 && !l.r.length && !l.p.length; });
      n0 = calls().length;
      openCalDay(one); await tick();
      const opened = calls().slice(n0), up = !!document.getElementById('calDayOverlay');
      deleteSession(_calDayLogs(one).s[0].id); await tick(); await tick();
      res.push({ name: 'a day sheet render() closes', opened, all: calls().slice(n0), added: up ? 1 : 0, after: 0, left: _fpSheetsOpen() || !!document.getElementById('calDayOverlay') });
      return { res, runner, mode: _fp.tabs.mode, logs: __fpShell.of('log').map((l) => l.text).filter((t) => /sheets/.test(t)) };
    });
    assert(out.mode && J(out.logs) === '[]', 'still in tabs mode after every kind, no sheets call refused or answered amiss: ' + J([out.mode, out.logs]));
    // Every opener there is: the source scan names the function that puts up each overlay, and K opens each one, so a
    // new sheet fails here by its name until it has a row in K. Besides those, K shows the two static pages, and the
    // last row is the day sheet render() closes.
    const ran = out.res.map((r) => r.name), EXTRA = ['openWorkflow', 'openPrivacy', 'a day sheet render() closes'];
    const sites = SITES(PAGE()), opener = (x) => OPENED_BY[x.fn] || x.fn;
    const missing = sites.filter((x) => ran.indexOf(opener(x)) < 0);
    assert(!missing.length, 'every function that puts up an overlay is opened here; add a row to K for each of: '
      + J(missing.map((x) => (x.fn || 'a site outside a named function') + ' (' + x.kind + ', index.html:' + x.line + ')')));
    const stale = ran.filter((n) => EXTRA.indexOf(n) < 0 && !sites.some((x) => opener(x) === n));
    assert(!stale.length && EXTRA.every((n) => ran.indexOf(n) >= 0) && ran.length === new Set(ran).size,
      'each row of K opens an overlay the scan finds (or a static page), once: ' + J({ stale, ran }));
    for (const r of out.res) {
      // each puts up one overlay of its own, or shows a static page (How it works, privacy)
      assert(r.added === (['openWorkflow', 'openPrivacy'].indexOf(r.name) >= 0 ? 0 : 1), r.name + ' put up its overlay: ' + J(r));
      assert(J(r.opened) === '[true]' && J(r.all) === '[true,false]' && r.after === 0 && !r.left,
        r.name + ': one {open:true} as it opened, one {open:false} as it closed, nothing else: ' + J(r));
    }
    assert(out.runner.up && J(out.runner.calls) === '[]', 'the runner opened and closed with no sheets call (D8): ' + J(out.runner));
  } finally { await app.close(); }
});

// ── The rule, kind by kind ─────────────────────────────────────────────────────────────────────────────────────────
// One opener per kind, run in the page under each shell: opened from the tab the owner opens it on, looked at, closed.
// Under no shell, whether something it put up covers the page's own #tabs (elementFromPoint at the bar's centre lands
// inside it) and whether that point is a tab; under tabs, the sheets calls it made before it closed.
async function KINDS(shell) {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const SEL = '.kt-sheet-overlay, .kt-close-sheet, .ex-modal-bg, #runner-ex-edit-modal';
  const closeTop = () => { const o = document.querySelectorAll(SEL); o[o.length - 1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); };
  const shown = () => ['wf-view', 'pp-view'].filter((id) => document.getElementById(id).style.display === 'block');
  const day = _calActiveDays().slice(-1)[0];
  const inRunner = (fn) => () => { openDeckRunner('Push', true); fn(); };
  const K = [
    ['settings', 'openThemeSheet', () => openThemeSheet()],
    ['progress', 'openCalDay', () => openCalDay(day)],
    ['progress', 'openPRHistory (.kt-sheet-over)', () => openPRHistory(_prLedger().latest.name)],
    ['settings', 'openExLib (no _sheetDrag)', () => openExLib()],
    ['settings', '_ktConfirm (clearApiKey)', () => clearApiKey()],
    ['log', 'confirmCloseRunner (a set logged)', inRunner(() => { runnerCompleteSet(); confirmCloseRunner(); }), null, () => closeDeckRunner()],
    ['settings', 'openProgrammeModal', () => openProgrammeModal()],
    ['log', 'openSwapModal', () => openSwapModal(1)],
    ['log', 'openRunnerExEdit (in the runner)', inRunner(() => openRunnerExEdit(0)), null, () => closeDeckRunner()],
    ['log', 'openStarterIntake', () => openStarterIntake(), () => closeStarterIntake()],
    ['settings', 'showManualCopy', () => showManualCopy('x'), () => Array.prototype.filter.call(document.querySelectorAll('.kt-manual-copy button'), (b) => b.textContent === 'Close')[0].click()],
    ['settings', 'openWorkflow', () => openWorkflow(), () => closeWorkflow()],
    ['settings', 'openPrivacy', () => openPrivacy(), () => closePrivacy()],
    ['log', 'the runner', () => openDeckRunner('Push', true), () => closeDeckRunner()],
  ];
  const res = [];
  for (const [tab, name, open, close, after] of K) {
    if (currentTab !== tab) { switchTab(tab); await tick(); }
    const kids = new Set(document.body.children), was = shown();
    const n0 = shell === 'tabs' ? __fpShell.of('sheets').length : 0;
    open(); await tick();
    const up = Array.prototype.filter.call(document.body.children, (n) => !kids.has(n));
    shown().forEach((id) => { if (was.indexOf(id) < 0) up.push(document.getElementById(id)); });
    const r = { name, up: up.length, runner: document.getElementById('runner-root').style.display === 'block' };
    if (shell === 'none') {
      const b = document.getElementById('tabs').getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      r.covers = up.some((n) => n.contains(hit));
      r.onTab = !!(hit && hit.closest && hit.closest('#tabs .tab'));
    } else r.calls = __fpShell.of('sheets').slice(n0).map((a) => a.open);
    (close || closeTop)(); await tick();
    if (after) { after(); await tick(); }
    res.push(r);
  }
  return res;
}
// The source scan: each site that makes an overlay (by class, or the runner's Edit sheet and the starter by id), the
// top-level function it sits in (fn: the last 'function name(' at a line's start with no top-level '}' line between
// it and the site, else null), and whether that function appends the overlay to <body> after making it.
function PAGE() { return fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8'); }
function SITES(page) {
  const re = /(\w+)\.(?:className\s*=\s*'(kt-sheet-overlay|kt-close-sheet|ex-modal-bg|kt-manual-copy)(?: [\w-]+)*'|id\s*=\s*'(runner-ex-edit-modal|starterOverlay)')/g;
  const out = [];
  let m;
  while ((m = re.exec(page))) {
    const rest = page.slice(m.index), end = rest.search(/\n\}\n/);
    const head = page.slice(0, m.index), at = head.lastIndexOf('\nfunction ');
    const decl = at < 0 ? null : /^\nfunction\s+([\w$]+)\s*\(/.exec(head.slice(at));
    out.push({ kind: m[2] || m[3], line: head.split('\n').length, fn: decl && !/\n\}\n/.test(head.slice(at)) ? decl[1] : null,
      appended: rest.slice(0, end < 0 ? rest.length : end).indexOf('document.body.appendChild(' + m[1] + ')') >= 0 });
  }
  return out;
}
// The opener an owner's path calls, where the function that makes the overlay is another: the starter's painter.
const OPENED_BY = { _siPaint: 'openStarterIntake' };

serial('the rule, kind by kind (contract 3.4): under no shell an overlay covers the page\'s own #tabs exactly when, under tabs, it is announced; the runner is neither (D8); every overlay is put up as a child of <body>', async () => {
  const seed = { kt_apikey: 'sk-ant-test' };
  const none = await pageBoot('none', { seed });
  let a;
  try { a = await ev(none, KINDS, 'none'); } finally { await none.close(); }
  const tabs = await pageBoot('tabs', { seed });
  let b;
  try { await helloIn(tabs); await settle(tabs, 60); b = await ev(tabs, KINDS, 'tabs'); } finally { await tabs.close(); }
  assert(a.length === 14 && b.length === 14, 'thirteen kinds and the runner: ' + J([a.length, b.length]));
  for (let i = 0; i < a.length; i++) {
    const n = a[i], t = b[i], announced = J(t.calls) === '[true]';
    assert(n.name === t.name && n.covers === announced, n.name + ': covers the bar under no shell exactly when announced under tabs: ' + J([n, t]));
    if (n.name === 'the runner') {
      assert(n.runner && t.runner && !n.covers && n.onTab && J(t.calls) === '[]', 'the runner sits under the bar (the point is a tab) and is not announced: ' + J([n, t]));
    } else {
      assert(n.covers && !n.onTab && announced, n.name + ': covers the bar, announced: ' + J([n, t]));
    }
  }
  // the scan finds each kind of site, each in a named function (the every-kind case opens every one of those, so a new
  // overlay is named there, not counted here)
  const sites = SITES(PAGE());
  const kinds = ['kt-sheet-overlay', 'kt-close-sheet', 'ex-modal-bg', 'runner-ex-edit-modal', 'starterOverlay', 'kt-manual-copy'];
  assert(kinds.every((k) => sites.some((x) => x.kind === k)) && sites.every((x) => x.fn),
    'the overlay sites, each kind found and each in a named function: ' + J(sites.map((x) => x.kind + '@' + x.line + ' in ' + x.fn)));
  assert(sites.every((x) => x.appended), 'every overlay goes to document.body.appendChild: ' + J(sites.filter((x) => !x.appended)));
});

// ── Coalescing ─────────────────────────────────────────────────────────────────────────────────────────────────────
serial('coalescing: one call per task and only on a net change (Begin workout, _runnerReplace through its confirm, a re-opened theme sheet, a close then an open and an open then a close in one task, the programme modal\'s starter link); a confirm over an open sheet sends nothing; nested overlays give one open and one close', async () => {
  // every weekday a Push day, so Begin workout opens the runner whatever day the case runs on
  const routine = JSON.parse(SEED.kt_routine);
  routine.weekPlan = ['Push', 'Push', 'Push', 'Push', 'Push', 'Push', 'Push'];
  const app = await pageBoot('tabs', { seed: { kt_routine: JSON.stringify(routine) } });
  try {
    await helloIn(app);
    await settle(app, 60);
    const out = await ev(app, async () => {
      const tick = () => new Promise((r) => setTimeout(r, 0));
      const calls = () => __fpShell.of('sheets').map((a) => a.open);
      const r = {};
      let n0;
      const step = async (name, fn) => { n0 = calls().length; await fn(); await tick(); r[name] = calls().slice(n0); };
      // Begin workout: the overview's close and the runner's open in one task; the runner is not announced (D8)
      await step('overview', () => startTodaySession());
      await step('begin', () => Array.prototype.filter.call(document.querySelectorAll('#sessionOverviewOverlay button'), (b) => /Begin workout/.test(b.textContent))[0].click());
      r.runner = !!runnerOpen && document.getElementById('runner-root').style.display === 'block';
      // another day over a workout with a set logged: its confirm, then _runnerReplace in the confirm's own task
      await step('replace', async () => { runnerCompleteSet(); openDeckRunner('Pull'); await tick(); document.querySelector('.kt-close-sheet [id$="ok"]').click(); });
      r.replaced = !!runnerOpen && !!runnerSession && runnerSession.type === 'Pull';
      await step('runner closed', () => closeDeckRunner());
      // a re-opened theme sheet (removed and put up again in one task): nothing sent, the new node never held
      await step('theme', () => openThemeSheet());
      await step('theme again', () => openThemeSheet());
      r.reheld = document.getElementById('themeSheetOverlay').classList.contains('fp-hold');
      // a close then an open in one task, then an open then a close in one task
      await step('close then open', () => { closeThemeSheet(); openHealthSettings(); });
      await step('health closed', () => closeHealthSettings());
      await step('open then close', () => { openThemeSheet(); closeThemeSheet(); });
      // nested: a confirm over an open sheet sends nothing; the last close is the one {open:false}
      await step('nested', async () => {
        openThemeSheet(); await tick();
        _ktConfirm({ title: 'Sure?', onConfirm: function () {} }); await tick();
        document.querySelector('.kt-close-sheet').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); await tick();
        closeThemeSheet();
      });
      // the programme modal's starter link (no programme): the modal goes and the starter comes in one task
      lsDel('kt_routine'); render(); await tick();
      await step('programme', () => openProgrammeModal());
      await step('starter link', () => Array.prototype.filter.call(document.querySelectorAll('#prog-modal button'), (b) => /Build a starter plan/.test(b.textContent))[0].click());
      r.starter = !!document.getElementById('starterOverlay') && !document.getElementById('prog-modal');
      await step('starter closed', () => closeStarterIntake());
      r.mode = _fp.tabs.mode;
      return r;
    });
    const want = { overview: [true], begin: [false], replace: [true, false], 'runner closed': [], theme: [true], 'theme again': [],
      'close then open': [], 'health closed': [false], 'open then close': [], nested: [true, false], programme: [true], 'starter link': [],
      'starter closed': [false] };
    for (const k of Object.keys(want)) assert(J(out[k]) === J(want[k]), k + ': ' + J(out[k]) + ' (want ' + J(want[k]) + ')');
    assert(out.runner && out.replaced && out.starter && !out.reheld && out.mode,
      'the runner opened, Pull replaced Push, the starter came up, the re-opened sheet was never held: ' + J(out));
  } finally { await app.close(); }
});

// ── The hold ───────────────────────────────────────────────────────────────────────────────────────────────────────
// On Playwright's clock, paused once the page is up: the mock's answer delay, the page's 50 ms and
// requestAnimationFrame all run only as the case runs the clock, so each check sits at a known time however slow the
// machine.
const HOLD_LOG = '(function () { window.__holdLog = []; new MutationObserver(function (ms) { ms.forEach(function (m) {'
  + ' var n = m.target, on = n.classList.contains("fp-hold"), was = /(^|\\s)fp-hold(\\s|$)/.test(m.oldValue || "");'
  + ' if (on !== was) __holdLog.push([n.id || n.className, on, performance.now()]); }); })'
  + '.observe(document.documentElement, { attributes: true, attributeFilter: ["class"], attributeOldValue: true, subtree: true }); })();';
serial('the hold (fp-hold): on before the opener\'s task ends, held at the next frame with its title focused (the seven that focus at once), released at 50 ms with no answer, at its own answer when it comes sooner (10 ms, the mock\'s 16; never an older call\'s), at 50 ms when the shell is silent, at once on a refusal (off leaves tabs mode, no dismiss tabs); the starter, showManualCopy and the static pages too, at computed opacity 0 with no fade of their own; never on an overlay put up while open, never on #runner-root; the bar\'s h 0 and back, never undone by an older answer', async () => {
  const app = await pageBoot('tabs', { clock: { time: Date.now() }, init: 'window.__fpShellSheetsDelay = 200;' });
  try {
    await helloIn(app);
    await settle(app, 300);
    const t = await ev(app, () => Date.now());
    await app.page.clock.pauseAt(t + 1000);
    const runFor = (ms) => app.page.clock.runFor(ms);
    await ev(app, HOLD_LOG);
    const vars = () => ev(app, () => { const s = document.documentElement.style; return { h: s.getPropertyValue('--fp-bar-h'), up: s.getPropertyValue('--fp-bar-up'), clear: s.getPropertyValue('--fp-clear'), rev: _fp.tabs.rev }; });
    const look = (id) => ev(app, (id) => {
      const ov = document.getElementById(id);
      return { up: !!ov, hold: !!ov && ov.classList.contains('fp-hold'), pe: ov ? getComputedStyle(ov).pointerEvents : null,
        paused: !!ov && ov.getAnimations({ subtree: true }).some((x) => x.playState === 'paused'), rev: _fp.tabs.rev };
    }, id);
    const SEVEN = [
      ['openRunEditor', 'runEditOverlay', 'reTitle', 'log'], ['openBuildDay', 'buildDayOverlay', 'bdTitle', 'log'],
      ['openRoutines', 'routinesOverlay', 'rtTitle', 'log'], ['openNextRound', 'nextRoundOverlay', 'nrTitle', 'log'],
      ['openCalDay', 'calDayOverlay', 'cdTitle', 'progress'], ['openCompareSheet', 'cmpSheetOverlay', 'cmpSheetTitle', 'progress'],
      ['openPRHistory', 'prHistOverlay', 'prHistTitle', 'progress'],
    ];
    for (const [name, id, title, tab] of SEVEN) {
      const before = await vars();
      await ev(app, (a) => {
        if (currentTab !== a.tab) switchTab(a.tab);
        const ses = getSessions();
        window.__frame = null;
        requestAnimationFrame(() => {
          const ov = document.getElementById(a.id), f = document.activeElement;
          window.__frame = { hold: ov.classList.contains('fp-hold'), opacity: getComputedStyle(ov).opacity, pe: getComputedStyle(ov).pointerEvents,
            focus: f ? f.id : null, inside: ov.contains(f), anims: ov.getAnimations({ subtree: true }).map((x) => [x.playState, x.currentTime]) };
        });
        if (a.name === 'openRunEditor') openRunEditor(getRuns()[0].id);
        else if (a.name === 'openBuildDay') openBuildDay('Arms');
        else if (a.name === 'openRoutines') openRoutines();
        else if (a.name === 'openNextRound') openNextRound();
        else if (a.name === 'openCalDay') openCalDay(_calActiveDays().slice(-1)[0]);
        else if (a.name === 'openCompareSheet') { cmpOn = true; cmpKind = 'lift'; cmpPicks = [String(ses[0].id), String(ses[3].id)]; openCompareSheet(); }
        else openPRHistory(_prLedger().latest.name);
      }, { name, id, tab });
      await runFor(16);
      const frame = await ev(app, () => window.__frame);
      assert(frame && frame.hold && frame.opacity === '0' && frame.pe === 'none' && frame.inside && frame.focus === title,
        name + ': at the next frame held (opacity 0, untouchable) with its title focused: ' + J(frame));
      assert(frame.anims.length > 0 && frame.anims.every((x) => x[0] === 'paused' && x[1] === 0), name + ': its animations paused at their start: ' + J(frame.anims));
      await runFor(44);   // 60 ms: released by the page's 50 ms, the answer (200 ms) still to come
      const at60 = await look(id);
      assert(at60.up && !at60.hold && at60.pe !== 'none' && !at60.paused && at60.rev === before.rev, name + ': released at 50 ms with no answer (its spring plays): ' + J(at60));
      await runFor(140);  // 200 ms: the answer, the bar hidden
      const bar = await vars();
      assert(bar.h === '0px' && bar.up === '83px' && bar.clear === '34px' && bar.rev > before.rev, name + ': the answer\'s h 0 sets --fp-bar-h and leaves --fp-bar-up: ' + J(bar));
      await ev(app, (id) => { document.getElementById(id).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); if (window.cmpOn) _cmpExit(); }, id);
      await runFor(200);
      const back = await vars();
      assert(back.h === '83px' && back.up === '83px' && back.rev > bar.rev, name + ': closed, the bar back: ' + J(back));
    }
    // the answer sooner than 50 ms ends the hold: 10 ms, and the mock's default (16 ms, one frame)
    for (const d of [10, 16]) {
      const before = await vars();
      // the hold is on within the opener's own microtasks, before any later task (and so before any frame) can run
      const inTask = await ev(app, async (d) => {
        if (d === 16) delete window.__fpShellSheetsDelay; else window.__fpShellSheetsDelay = d;
        switchTab('settings'); openThemeSheet();
        for (let i = 0; i < 10; i++) await Promise.resolve();
        return document.getElementById('themeSheetOverlay').classList.contains('fp-hold');
      }, d);
      assert(inTask, 'a ' + d + ' ms answer: the hold is on before the opener\'s task has ended');
      await runFor(d - 1);
      const held = await look('themeSheetOverlay');
      await runFor(1);
      const freed = await look('themeSheetOverlay');
      assert(held.hold && held.rev === before.rev && !freed.hold && freed.rev > before.rev, 'a ' + d + ' ms answer: held until it, released at it: ' + J([held, freed]));
      await ev(app, () => closeThemeSheet()); await runFor(20);
    }
    // the overlays outside _SHEETS_SEL are held too (on their root: the starter, showManualCopy's, the static pages);
    // none has a fade of its own, so its computed opacity 0 while held is the hold's alone, and 1 once released
    const OTHERS = ['#starterOverlay', '.kt-manual-copy', '#wf-view', '#pp-view'];
    const seen = (sel) => ev(app, (sel) => { const n = document.querySelector(sel), cs = getComputedStyle(n);
      return { hold: n.classList.contains('fp-hold'), opacity: cs.opacity, pe: cs.pointerEvents, own: n.getAnimations().length }; }, sel);
    for (let i = 0; i < OTHERS.length; i++) {
      await ev(app, (i) => [() => openStarterIntake(), () => showManualCopy('x'), () => openWorkflow(), () => openPrivacy()][i](), i);
      const held = await seen(OTHERS[i]);
      await runFor(16);
      const freed = await seen(OTHERS[i]);
      assert(held.hold && held.opacity === '0' && held.pe === 'none' && held.own === 0 && !freed.hold && freed.opacity === '1' && freed.pe !== 'none',
        OTHERS[i] + ': held as it opens (unseen and untouchable with no fade of its own), released at the answer: ' + J([held, freed]));
      await ev(app, (i) => [() => closeStarterIntake(), () => document.querySelector('.kt-manual-copy').remove(), () => closeWorkflow(), () => closePrivacy()][i](), i);
      await runFor(20);
    }
    // a silent shell: released at 50 ms; the bar keeps its numbers
    {
      const before = await vars();
      await ev(app, () => { window.__fpShellSheetsSilent = true; openThemeSheet(); });
      await runFor(49);
      const held = await look('themeSheetOverlay');
      await runFor(1);
      const freed = await look('themeSheetOverlay');
      assert(held.hold && !freed.hold && freed.rev === before.rev, 'silence: held for 50 ms, then released with no answer: ' + J([held, freed]));
      await ev(app, () => { closeThemeSheet(); window.__fpShellSheetsSilent = false; }); await runFor(20);
    }
    // each hold is its call's own: an older call's answer, landing while a newer hold waits, leaves it held (answers
    // 30 ms late: A opens at 0, closes at 5, B opens at 10; A's answers land at 30 and 35, B's at 40)
    {
      await ev(app, () => { window.__fpShellSheetsDelay = 30; openThemeSheet(); });
      await runFor(5);
      await ev(app, () => closeThemeSheet());
      await runFor(5);
      await ev(app, () => openHealthSettings());
      await runFor(25);
      const at35 = await look('healthSheetOverlay');
      await runFor(5);
      const at40 = await look('healthSheetOverlay');
      assert(at35.hold && !at40.hold, 'an older call\'s answers leave a newer hold alone; its own answer ends it: ' + J([at35, at40]));
      await ev(app, () => closeHealthSettings()); await runFor(40);
    }
    // an older answer never undoes a newer one: an open answered at 200 ms, its close at 20 ms; the bar stays shown
    {
      await ev(app, () => { window.__fpShellSheetsDelay = 200; openThemeSheet(); });
      await runFor(10);
      await ev(app, () => { window.__fpShellSheetsDelay = 10; closeThemeSheet(); });
      await runFor(10);
      const shown = await vars();
      await runFor(180);
      const later = await vars();
      assert(shown.h === '83px' && later.h === '83px' && later.rev === shown.rev, 'the open\'s late answer (an older rev) leaves the bar the close showed: ' + J([shown, later]));
      await ev(app, () => { delete window.__fpShellSheetsDelay; }); await runFor(20);
    }
    // a refusal with another code: released at once (no time passes), logged, still tabs mode
    {
      await ev(app, () => { __fpShell.refuse.sheets = 'bad message: sheets'; openThemeSheet(); });
      const o = await ev(app, () => ({ hold: document.getElementById('themeSheetOverlay').classList.contains('fp-hold'), mode: _fp.tabs.mode,
        logged: __fpShell.of('log').some((l) => /sheets refused: bad message: sheets/.test(l.text)) }));
      const held = await ev(app, () => __holdLog.filter((e) => e[0] === 'themeSheetOverlay').slice(-2).map((e) => e[1]));
      assert(J(held) === '[true,false]' && !o.hold && o.mode && o.logged, 'another refusal: held, released at once, logged, still tabs mode: ' + J([held, o]));
      await ev(app, () => { delete __fpShell.refuse.sheets; closeThemeSheet(); }); await runFor(20);
    }
    // put up while the state stays open: never held (the sheet re-opened over itself, a confirm over it)
    await ev(app, () => openThemeSheet());
    const first = await look('themeSheetOverlay');
    await runFor(16);
    const n = await ev(app, () => { const k = __fpShell.of('sheets').length; openThemeSheet(); _ktConfirm({ title: 'Sure?', onConfirm: function () {} }); return k; });
    const re = await ev(app, (k) => ({ theme: document.getElementById('themeSheetOverlay').classList.contains('fp-hold'),
      confirm: document.querySelector('.kt-close-sheet').classList.contains('fp-hold'), sent: __fpShell.of('sheets').length - k }), n);
    assert(first.hold && !re.theme && !re.confirm && re.sent === 0, 'put up while open (re-opened, a confirm over it): nothing sent, never held: ' + J([first, re]));
    await ev(app, () => { document.querySelector('.kt-close-sheet').remove(); closeThemeSheet(); });
    await runFor(20);
    // the runner's Edit sheet is held as it opens; #runner-root never is
    await ev(app, () => { switchTab('log'); openDeckRunner('Push', true); openRunnerExEdit(0); });
    const rx = await ev(app, () => ({ edit: document.getElementById('runner-ex-edit-modal').classList.contains('fp-hold'), root: document.getElementById('runner-root').classList.contains('fp-hold'),
      shown: document.getElementById('runner-root').style.display }));
    await runFor(16);
    await ev(app, () => closeRunnerExEdit());
    await runFor(20);
    await ev(app, () => closeDeckRunner());
    // a refusal ends the hold at once (no time passes): 'off' leaves tabs mode with nothing sent back, the sheet still
    // up over the page's own bar
    await ev(app, () => { __fpShell.refuse.sheets = 'off: no live tab root'; switchTab('settings'); });
    await runFor(20);
    await ev(app, () => openThemeSheet());
    const after = await ev(app, () => ({ hold: document.getElementById('themeSheetOverlay').classList.contains('fp-hold'), mode: _fp.tabs.mode, why: _fp.tabs.why,
      cls: document.documentElement.classList.contains('fp-tabs'), tabs: getComputedStyle(document.getElementById('tabs')).display,
      dismiss: __fpShell.of('dismiss').filter((a) => a && a.screen === 'tabs').length, sheet: !!document.getElementById('themeSheetOverlay'), sent: __fpShell.of('sheets').slice(-1)[0] }));
    const log = await ev(app, () => __holdLog.slice());
    const runnerRoot = log.filter((e) => e[0] === 'runner-root');
    assert(rx.edit && !rx.root && rx.shown === 'block' && runnerRoot.length === 0, 'the runner\'s Edit sheet is held, #runner-root never: ' + J([rx, runnerRoot]));
    const theme = log.filter((e) => e[0] === 'themeSheetOverlay').slice(-2);
    assert(J(theme.map((e) => e[1])) === '[true,false]' && after.sent.open === true && !after.hold,
      'refused: the sheet was held and is released already, no time passing: ' + J([theme, after]));
    assert(!after.mode && after.why === 'off' && !after.cls && after.tabs !== 'none' && after.dismiss === 0 && after.sheet,
      'refused off: out of tabs mode (#tabs shows), no dismiss tabs, the sheet still up: ' + J(after));
  } finally { await app.close(); }
});

// Under Reduce Motion a sheet's scrim has no fade (animation:none), so at the next frame only the hold's opacity keeps
// it unseen while the bar is still up; the sheet inside keeps a short fade, paused at its start like any other.
serial('the hold under Reduce Motion: a sheet\'s scrim has no fade there, and at the next frame the hold alone keeps it unseen and untouchable, its title focused; released at 50 ms it shows at once', async () => {
  const app = await pageBoot('tabs', { clock: { time: Date.now() }, init: 'window.__fpShellSheetsDelay = 200;', page: { reducedMotion: 'reduce' } });
  try {
    await helloIn(app);
    await settle(app, 300);
    const t = await ev(app, () => Date.now());
    await app.page.clock.pauseAt(t + 1000);
    const runFor = (ms) => app.page.clock.runFor(ms);
    await ev(app, () => {
      if (currentTab !== 'log') switchTab('log');
      window.__frame = null;
      requestAnimationFrame(() => {
        const ov = document.getElementById('routinesOverlay'), cs = getComputedStyle(ov), f = document.activeElement;
        window.__frame = { reduce: matchMedia('(prefers-reduced-motion: reduce)').matches, hold: ov.classList.contains('fp-hold'),
          opacity: cs.opacity, pe: cs.pointerEvents, own: ov.getAnimations().length, focus: f ? f.id : null,
          anims: ov.getAnimations({ subtree: true }).map((x) => [x.playState, x.currentTime]) };
      });
      openRoutines();
    });
    await runFor(16);
    const frame = await ev(app, () => window.__frame);
    assert(frame && frame.reduce && frame.hold && frame.own === 0 && frame.opacity === '0' && frame.pe === 'none' && frame.focus === 'rtTitle',
      'Reduce Motion: at the next frame the scrim, with no fade of its own, is unseen and untouchable by the hold, its title focused: ' + J(frame));
    assert(frame.anims.length > 0 && frame.anims.every((x) => x[0] === 'paused' && x[1] === 0), 'Reduce Motion: the sheet\'s short fade paused at its start: ' + J(frame.anims));
    await runFor(44);   // 60 ms: released by the page's 50 ms, the answer (200 ms) still to come
    const at60 = await ev(app, () => { const ov = document.getElementById('routinesOverlay'), cs = getComputedStyle(ov);
      return { hold: ov.classList.contains('fp-hold'), opacity: cs.opacity, pe: cs.pointerEvents }; });
    assert(!at60.hold && at60.opacity === '1' && at60.pe !== 'none', 'Reduce Motion: released at 50 ms, the scrim shows at once: ' + J(at60));
    await ev(app, () => document.getElementById('routinesOverlay').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    await runFor(400);
    const end = await ev(app, () => ({ up: !!document.getElementById('routinesOverlay'), calls: __fpShell.of('sheets').map((a) => a.open), mode: _fp.tabs.mode }));
    assert(!end.up && J(end.calls) === '[false,true,false]' && end.mode, 'Reduce Motion: the baseline, the sheet, its close: ' + J(end));
  } finally { await app.close(); }
});

serial('leaving tabs mode mid-hold releases the overlay at once and ends the announcing (the scene fell back: screens.off tabs)', async () => {
  const app = await pageBoot('tabs', { clock: { time: Date.now() }, init: 'window.__fpShellSheetsSilent = true;' });
  try {
    await helloIn(app);
    await settle(app, 300);
    const t = await ev(app, () => Date.now());
    await app.page.clock.pauseAt(t + 1000);
    const runFor = (ms) => app.page.clock.runFor(ms);
    await ev(app, () => { switchTab('settings'); openThemeSheet(); });
    await runFor(1);
    const held = await ev(app, () => ({ hold: document.getElementById('themeSheetOverlay').classList.contains('fp-hold'), mode: _fp.tabs.mode }));
    await ev(app, () => { __fpShell.fallBack('policy'); });
    await runFor(5);   // the shell's queue sends screens.off tabs on its next task: the page leaves on it
    const out = await ev(app, () => ({ hold: document.getElementById('themeSheetOverlay').classList.contains('fp-hold'), mode: _fp.tabs.mode, why: _fp.tabs.why,
      n: __fpShell.of('sheets').length }));
    await ev(app, () => { closeThemeSheet(); openWorkflow(); });
    await runFor(5);
    await ev(app, () => { closeWorkflow(); openThemeSheet(); });
    await runFor(5);
    const after = await ev(app, () => ({ n: __fpShell.of('sheets').length, hold: document.getElementById('themeSheetOverlay').classList.contains('fp-hold') }));
    assert(held.hold && held.mode, 'held while the shell is silent: ' + J(held));
    assert(!out.hold && !out.mode && out.why === 'policy', 'the way out released it at once, well before 50 ms: ' + J(out));
    assert(after.n === out.n && !after.hold, 'out of tabs mode nothing is announced or held: ' + J([out, after]));
  } finally { await app.close(); }
});

// ── The baseline ───────────────────────────────────────────────────────────────────────────────────────────────────
serial('the baseline: one sheets {open:false} at boot in tabs mode, none under no shell, coach61 or build 60\'s chat; a reload with a sheet open sends it again (the shell\'s state is per document); a dev.nav sheet is announced before hello\'s answer', async () => {
  // tabs: exactly the baseline, then a sheet; a reload sends the baseline again and the shell's bar shows
  const app = await pageBoot('tabs');
  try {
    await helloIn(app); await settle(app, 60);
    const a = await ev(app, () => ({ calls: __fpShell.of('sheets'), open: __fpShell.state().doc.sheetsOpen }));
    assert(J(a.calls) === '[{"open":false}]' && a.open === false, 'tabs: exactly one sheets {open:false} at boot: ' + J(a));
    await ev(app, () => { switchTab('settings'); openThemeSheet(); });
    await settle(app, 60);
    const b = await ev(app, () => ({ calls: __fpShell.of('sheets'), open: __fpShell.state().doc.sheetsOpen }));
    assert(J(b.calls) === '[{"open":false},{"open":true}]' && b.open === true, 'a sheet opened: ' + J(b));
    await app.reload(); await helloIn(app); await settle(app, 60);
    const c = await ev(app, () => ({ calls: __fpShell.of('sheets'), st: __fpShell.state(), h: document.documentElement.style.getPropertyValue('--fp-bar-h') }));
    assert(J(c.calls) === '[{"open":false}]' && c.st.doc.sheetsOpen === false && c.h === '83px', 'the reload sent the baseline again, the bar shows: ' + J([c.calls, c.st.doc, c.h]));
  } finally { await app.close(); }
  // no tabs mode, no sheets: no shell (no TrovoShell at all), build 61's classic root with the chat, build 60's chat
  for (const shell of ['none', 'coach61', 'coach']) {
    const o = await pageBoot(shell);
    try {
      if (shell !== 'none') await helloIn(o);
      await ev(o, () => { switchTab('settings'); openThemeSheet(); });
      await settle(o, 60);
      const r = await ev(o, () => ({ mode: _fp.tabs.mode, sheets: window.__fpShell ? __fpShell.of('sheets').length : null, plugin: !!(window.Capacitor && Capacitor.Plugins.TrovoShell) }));
      assert(!r.mode && (shell === 'none' ? r.sheets === null && !r.plugin : r.sheets === 0), shell + ': no sheets call: ' + J(r));
    } finally { await o.close(); }
  }
  // dev.nav modal/routines with hello's answer held back: the sheet is announced before it
  const nav = await pageBoot(TABS({ dev: { nav: 'modal/routines' } }), {
    init: 'window.__fpShellHelloDelay = 1500; window.__navAt = null; new MutationObserver(function (ms) { ms.forEach(function (m) {'
      + ' Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.id === "routinesOverlay" && !window.__navAt)'
      + ' window.__navAt = { hello: !!(window._fp && _fp.hello), mode: !!(window._fp && _fp.tabs.mode) }; }); }); })'
      + '.observe(document, { childList: true, subtree: true });' });
  try {
    await nav.page.waitForFunction(() => window.__navAt, null, { timeout: 15000 });
    await settle(nav, 30);
    const before = await ev(nav, () => ({ at: window.__navAt, hello: _fp.hello, calls: __fpShell.of('sheets') }));
    await helloIn(nav);
    // the sheet went up before hello had answered, and the observer's call goes in that same microtask checkpoint,
    // before any task (hello's answer is one) can run
    assert(before.at.mode && !before.at.hello && J(before.calls) === '[{"open":false},{"open":true}]',
      'dev.nav\'s sheet is announced before hello\'s answer: ' + J(before));
  } finally { await nav.close(); }
});

// ── The OTA confirm first ──────────────────────────────────────────────────────────────────────────────────────────
// TrovoOta.confirm records the shell calls made before it (the first paint's own confirm, or _bootDone's).
const OTA = 'window.__ota = []; window.Capacitor.Plugins.TrovoOta = { confirm: function () {'
  + ' __ota.push({ calls: window.__fpShell ? __fpShell.calls.map(function (c) { return c[0]; }) : null, tab: window.currentTab,'
  + ' route: window._lastRenderedRoute }); return Promise.resolve({}); },'
  + ' status: function () { return Promise.resolve({}); } };';
serial('the OTA confirm first: booting on Log and on Coach (a first paint on the coach route), TrovoOta.confirm goes once, before the first sheets and selectTab; a baseline that throws leaves the confirm sent and the boot whole', async () => {
  for (const [tag, shell] of [['Log', 'tabs'], ['Coach', TABS({ tabs: { bar: { h: 83, safe: 34 }, selected: 'coach' } })]]) {
    const app = await pageBoot(shell, { init: OTA });
    try {
      await helloIn(app); await settle(app, 60);
      await ev(app, () => switchTab('progress'));
      await settle(app, 60);
      const o = await ev(app, () => ({ ota: __ota, calls: __fpShell.calls.map((c) => c[0]), route: _lastRenderedRoute, tab: currentTab }));
      const before = (o.ota[0] && o.ota[0].calls) || [];
      assert(o.ota.length === 1 && before.indexOf('sheets') < 0 && before.indexOf('selectTab') < 0, tag + ': the confirm once, before any sheets or selectTab: ' + J(o));
      // on Coach the first paint returns before its own confirm, so _bootDone's is the one: it went after bootDone's
      // turn came (the coach route painted, bootDone not yet sent)
      if (tag === 'Coach') assert(o.ota[0].tab === 'coach' && /^coach/.test(o.ota[0].route) && before.indexOf('bootDone') < 0, 'Coach: a first paint on the coach route, _bootDone\'s confirm: ' + J(o.ota));
      assert(o.calls.indexOf('sheets') >= before.length && o.calls.indexOf('selectTab') >= before.length, tag + ': the baseline and the selection came after it: ' + J(o.calls));
    } finally { await app.close(); }
  }
  // the baseline throws synchronously (__fpShellThrow): the confirm went, the boot ran to its end (bootDone, the first
  // paint), tabs mode stays (a throw is no off), the throw is logged, and a sheet opened later is not left held
  const app = await pageBoot('tabs', { init: OTA + 'window.__fpShellThrow = ["sheets"];' });
  try {
    await helloIn(app); await settle(app, 100);
    await ev(app, () => { switchTab('settings'); openThemeSheet(); });
    await settle(app, 60);
    const o = await ev(app, () => ({ ota: __ota.length, bootDone: __fpShell.of('bootDone').length, sheets: __fpShell.of('sheets').length,
      mode: _fp.tabs.mode, screen: document.getElementById('screen').children.length,
      hold: document.getElementById('themeSheetOverlay').classList.contains('fp-hold'),
      logged: __fpShell.of('log').filter((l) => /sheets refused: sheets: thrown by the mock/.test(l.text)).length }));
    assert(o.ota === 1 && o.bootDone === 1 && o.sheets === 2 && o.mode && o.screen > 0 && !o.hold && o.logged === 2,
      'a throwing baseline: the confirm sent, the boot whole, the throws logged, nothing left held: ' + J(o));
  } finally { await app.close(); }
});

// ── Untouched ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Escape and the focus return, by real keys, from the theme row on Settings: the same under tabs as under no shell.
async function ESCAPE(app) {
  const p = app.page;
  await ev(app, () => switchTab('settings'));
  await p.waitForTimeout(60);
  const row = '.settings-row[onclick="openThemeSheet()"]';
  await p.focus(row);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(80);
  const a = await ev(app, () => ({ sheet: !!document.getElementById('themeSheetOverlay') }));
  await ev(app, () => _ktConfirm({ title: 'Sure?', onConfirm: function () {} }));
  await p.waitForTimeout(80);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(80);
  const b = await ev(app, () => ({ confirm: !!document.querySelector('.kt-close-sheet'), sheet: !!document.getElementById('themeSheetOverlay') }));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(80);
  const c = await ev(app, (row) => ({ sheet: !!document.getElementById('themeSheetOverlay'), back: document.activeElement === document.querySelector(row) }), row);
  await ev(app, () => openStarterIntake());
  await p.waitForTimeout(80);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(80);
  const d = await ev(app, () => ({ starter: !!document.getElementById('starterOverlay') }));
  await ev(app, () => closeStarterIntake());
  return { a, b, c, d };
}
serial('untouched: Escape closes the top sheet (a confirm, then the sheet under it) and never #starterOverlay, and focus returns to the opener, under tabs as under no shell', async () => {
  for (const shell of ['none', 'tabs']) {
    const app = await pageBoot(shell);
    try {
      if (shell === 'tabs') await helloIn(app);
      const o = await ESCAPE(app);
      assert(o.a.sheet && !o.b.confirm && o.b.sheet && !o.c.sheet && o.c.back && o.d.starter,
        shell + ': Escape closed the confirm, then the sheet, focus went back to the theme row, the starter stayed: ' + J(o));
      if (shell === 'tabs') {
        const calls = await ev(app, () => __fpShell.of('sheets').map((a) => a.open));
        assert(J(calls) === '[false,true,false,true,false]', 'tabs: the baseline, the sheet, the starter: ' + J(calls));
      }
    } finally { await app.close(); }
  }
});
