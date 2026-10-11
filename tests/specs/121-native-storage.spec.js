// 121: the page's hooks for the native copy (plan task S6), whatever STORE says.
// - Settings › About › Storage reads the shell's TrovoStore plugin: no row in the browser, none with the plugin but
//   without the shell's flag (window.__FP_SHELL), and with both the row reads the plugin's status ("In step · N items ·
//   X KB"), or how else the copy stands now (a wipe found at this start, changes made without it, off and why). Its
//   sheet shows what the starts found (changes made without the copy, changes this iPhone lost, unexplained
//   differences), fallbacks, timings, breaker trips and crash markers; Put back previews, asks, then stages (one kept
//   value, or everything a wipe took); the Native copy switch, Export a copy, and "Test: quit after next save" only
//   where the shell offers it.
// - The end of boot: the OTA confirm goes even when the first render is the coach route (it returns before the first
//   paint's confirm), exactly once; a shell's TrovoShell hears bootDone {page} at the end of boot, only with the flag.
// - The tools' launch arguments arrive in the flag (dev.nav once per launch, dev.theme painted and never saved);
//   kt_dev_nav still works without it.
// - The privacy copy is true with or without a native copy.
// The watch drain's re-send to the store before the wrist's queue is cleared is spec 120's.
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
const settle = (app, ms) => app.page.waitForTimeout(ms || 120);

const FLAG = { v: 1, min: 1, shell: '60', screens: [] };
const NOW = Date.now();

// StoreAttach.status() as the shell's TrovoStore plugin returns it: attached, the last start in step.
function inStep() {
  return {
    shell: '60', page: '20261010-3', facade: 'attached', why: null,
    document: { at: NOW, attached: true, boot: 3, rule: 0, label: 'in step', helloMs: 2.4, bootDone: true },
    deviceSwitchOn: true, policyFacade: 'on', policyRepair: 'off', breakerArmed: false, breakerTrips: 0, skippingThisLaunch: false,
    crashVerdicts: [], markerFoundAtLaunch: null, storeClosedWhy: null,
    counters: { prompts: 120, promptMs: 36, promptMaxMs: 1.8, hellos: 3, posts: 0, postsApplied: 0, postsStale: 0 },
    pagesAlive: 1,
    store: {
      state: 'ready', build: 60, schema: 1, minReader: 60, keys: 24, bytes: 180224, tombstones: 2, unknownEnc: 0, boot: 3, conflicts: 0,
      lastHello: { at: NOW, boot: 3, rule: 0, label: 'in step', adopted: {}, wouldRepair: [] },
      counts: { counts: { hellos: 3, inStep: 2, migrate: 1 }, maxMs: {} },
      wipeOffer: null, putBackStaged: false, putBackWaiting: 0, snaps: ['2026-10-11.json'], inStep: true,
    },
    testQuit: null, testQuitArmed: false, testKill: false,
  };
}
// The start after a hard kill: WebKit had lost two saves the copy kept (rule 6), with history behind it.
function lagged() {
  const st = inStep();
  st.document.rule = 6; st.document.label = 'lag';
  st.breakerTrips = 2; st.breakerLastTrip = NOW - 86400000;
  st.crashVerdicts = [{ piece: 'store', shell: '60', page: '20261009-1', why: 'crash marker: the app closed during a native copy save', at: NOW - 3600000 }];
  st.store.inStep = false; st.store.conflicts = 2;
  st.store.lastHello = { at: NOW, boot: 3, rule: 6, label: 'lag', adopted: { lag: ['kt_runner_draft', 'kt_sessions'] }, wouldRepair: ['kt_runner_draft', 'kt_sessions'] };
  st.store.counts.counts = { hellos: 9, inStep: 5, migrate: 1, olderBuild: 1, lag: 1, wouldRepairKeys: 2, unexplained: 1, full: 3, busy: 1, err: 0 };
  return st;
}
const ROWS = [
  { id: 7, at: NOW - 60000, key: 'kt_sessions', why: 'lag', h: '2:a:b', hnew: '1:c:d', units: 5120 },
  { id: 6, at: NOW - 7200000, key: 'kt_last_open', why: 'older build', h: '13:e:f', hnew: '13:g:h', units: 13 },
];
const PLAN = { items: [{ key: 'kt_sessions', outcome: 'put back', added: 1, origin: 'conflict:7' }], count: 1 };

// The document-start script: a TrovoStore plugin standing in for the shell's (recording each call), optionally the
// shell's flag, TrovoShell and TrovoOta, and the first render forced onto the coach route.
function init(cfg) {
  return '(' + function (cfg) {
    window.__ts = { calls: [], status: cfg.status, rows: cfg.rows || [], plan: cfg.plan || { items: [], count: 0 }, events: [] };
    var P = window.Capacitor && window.Capacitor.Plugins;
    var copy = function (o) { return JSON.parse(JSON.stringify(o)); };
    if (P && cfg.status) {
      P.TrovoStore = {
        status: function () { __ts.calls.push(['status']); return Promise.resolve(copy(__ts.status)); },
        conflicts: function (o) { __ts.calls.push(['conflicts', o]); return Promise.resolve({ rows: copy(__ts.rows) }); },
        putBack: function (o) {
          __ts.calls.push(['putBack', o]);
          var r = copy(__ts.plan); r.staged = !o.preview && r.count > 0;
          return Promise.resolve(r);
        },
        setSwitch: function (o) { __ts.calls.push(['setSwitch', o]); __ts.status.deviceSwitchOn = !!o.on; return Promise.resolve({ on: !!o.on }); },
        exportCopy: function () { __ts.calls.push(['exportCopy']); return Promise.resolve({ shared: true, keys: 24, bytes: 180224, name: 'x.json' }); },
      };
      if (cfg.testKill) {
        P.TrovoStore.testKill = function (o) { __ts.calls.push(['testKill', o]); __ts.status.testQuitArmed = !!o.arm; return Promise.resolve({ armed: !!o.arm }); };
      }
    }
    if (P && cfg.ota) {
      P.TrovoOta = {
        confirm: function () { __ts.events.push(['confirm', typeof window._trovoOpen]); return Promise.resolve(); },
        status: function () { return Promise.resolve({}); },
      };
    }
    if (P && cfg.shellPlugin) {
      P.TrovoShell = { bootDone: function (o) { __ts.events.push(['bootDone', typeof window._trovoOpen, o]); return Promise.resolve({ ok: true }); } };
    }
    if (P && cfg.icon) P.TrovoIcon = { set: function (o) { __ts.events.push(['icon', o.name]); return Promise.resolve({ changed: true }); } };
    if (cfg.flag) window.__FP_SHELL = cfg.flag;
    if (cfg.coachFirst) {
      // `var currentTab = 'log'` assigns through this setter: the boot render sees the coach route.
      var v, first = true;
      Object.defineProperty(window, 'currentTab', { configurable: true, get: function () { return v; },
        set: function (x) { v = first ? 'coach' : x; first = false; } });
    }
  } + ')(' + JSON.stringify(cfg) + ');';
}
const rowText = (app) => ev(app, () => { const r = document.getElementById('fp-store-row'); return r ? r.textContent : null; });

serial('the Storage row: none in the browser or without the shell\'s flag, the plugin\'s status with both', async () => {
  // The browser and the PWA: no plugin.
  let app = await boot();
  try {
    await ev(app, () => switchTab('settings'));
    assert(await rowText(app) === null, 'no row in the browser');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
  // A shell before 60: native, no TrovoStore.
  app = await boot({ native: true });
  try {
    await ev(app, () => switchTab('settings'));
    assert(await rowText(app) === null, 'no row on a shell without the plugin');
  } finally { await app.close(); }
  // The plugin but no flag: nothing changes, and the plugin is never asked.
  app = await boot({ native: true, init: init({ status: inStep() }) });
  try {
    await ev(app, () => switchTab('settings'));
    await settle(app, 200);
    const out = await ev(app, () => ({ row: !!document.getElementById('fp-store-row'), calls: __ts.calls.length, sheet: (openStorageSheet(), !!document.getElementById('fpStoreOverlay')) }));
    assert(!out.row && out.calls === 0 && !out.sheet, 'without the flag: no row, no sheet, no call: ' + JSON.stringify(out));
  } finally { await app.close(); }
  // Both: the row reads the mocked status.
  app = await boot({ native: true, init: init({ status: inStep(), flag: FLAG }) });
  try {
    await ev(app, () => switchTab('settings'));
    await app.page.waitForFunction(() => /In step/.test((document.getElementById('fp-store-sub') || {}).textContent || ''), null, { timeout: 3000 });
    const out = await ev(app, () => {
      const row = document.getElementById('fp-store-row');
      const group = row.closest('.settings-group');
      return { title: row.querySelector('.settings-row-title').textContent, sub: document.getElementById('fp-store-sub').textContent,
        group: group && group.querySelector('.settings-group-hd').textContent, role: row.getAttribute('role'), calls: __ts.calls.map((c) => c[0]) };
    });
    assert(out.title === 'Storage' && out.sub === 'In step · 24 items · 176 KB', 'the row reads the status: ' + JSON.stringify(out));
    assert(out.group === 'About' && out.role === 'button', 'in Settings › About, a control: ' + JSON.stringify(out));
    assert(out.calls.indexOf('status') >= 0, 'the status came from the plugin');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

serial('the Storage sheet: counts from the status, Put back after a preview, the switch, Export a copy, the TestFlight test', async () => {
  let app = await boot({ native: true, init: init({ status: lagged(), rows: ROWS, plan: PLAN, flag: FLAG }) });
  try {
    await ev(app, () => switchTab('settings'));
    await app.page.waitForFunction(() => /this iPhone lost/.test((document.getElementById('fp-store-sub') || {}).textContent || ''), null, { timeout: 3000 });
    assert(await ev(app, () => document.getElementById('fp-store-sub').textContent) === 'Kept 2 changes this iPhone lost · Put back', 'the row says what the copy kept');
    await ev(app, () => document.getElementById('fp-store-row').click());
    await app.page.waitForFunction(() => /Workouts/.test((document.getElementById('fpStoreBody') || {}).textContent || ''), null, { timeout: 3000 });
    const sheet = await ev(app, () => {
      const body = document.getElementById('fpStoreBody');
      const stat = (label) => { const el = [...body.querySelectorAll('div')].find((d) => d.firstElementChild && d.firstElementChild.firstChild && d.firstElementChild.firstChild.textContent === label); return el ? el.lastElementChild.textContent : null; };
      return { text: body.textContent, older: stat('Changes made without the copy'), lost: stat('Changes this iPhone lost'),
        unexplained: stat('Unexplained differences'), fallbacks: stat('Fallbacks'), timings: stat('Timings'), trips: stat('Breaker trips'),
        markers: stat('Crash markers'), putBacks: body.querySelectorAll('button[data-id]').length, a11y: [...body.querySelectorAll('.settings-row')].map((r) => r.getAttribute('role')) };
    });
    assert(sheet.older === '1 time' && sheet.lost === '1 time · 2 items' && sheet.unexplained === '1', 'what the starts found: ' + JSON.stringify(sheet));
    assert(sheet.trips === '2' && sheet.markers === '1' && /save 0\.3 ms/.test(sheet.timings), 'breaker trips, crash markers and timings: ' + JSON.stringify(sheet));
    assert(/full 3, busy 1, error 0/.test(sheet.text), 'the native answers behind the fallbacks: ' + sheet.text);
    assert(/would repair: Workout in progress, Workouts/.test(sheet.text) && /This iPhone lost it, the copy kept it/.test(sheet.text), 'the last start and the kept values read in the owner\'s words');
    assert(sheet.putBacks === 2 && sheet.a11y.indexOf('switch') >= 0, 'a Put back per kept value, the switch is a switch: ' + JSON.stringify(sheet));
    assert(!/Test: quit after next save/.test(sheet.text), 'no test row where the shell does not offer it');

    // Put back: a preview first, then the owner's yes stages it.
    await ev(app, () => document.querySelector('#fpStoreBody button[data-id="7"]').click());
    await app.page.waitForFunction(() => !!document.querySelector('.kt-close-sheet'), null, { timeout: 3000 });
    const ask = await ev(app, () => ({ title: document.querySelector('.kt-close-sheet-ttl').textContent, calls: __ts.calls.filter((c) => c[0] === 'putBack') }));
    assert(ask.title === 'Put back Workouts (+1 record)?' && ask.calls.length === 1 && ask.calls[0][1].preview === true && ask.calls[0][1].conflicts[0] === 7,
      'the preview, then the question: ' + JSON.stringify(ask));
    await ev(app, () => document.querySelector('.kt-close-sheet [id$="ok"]').click());
    await settle(app, 150);
    const staged = await ev(app, () => ({ calls: __ts.calls.filter((c) => c[0] === 'putBack'), sheet: !!document.getElementById('fpStoreOverlay'), toast: (document.getElementById('toast') || {}).textContent || '' }));
    assert(staged.calls.length === 2 && !staged.calls[1][1].preview && staged.calls[1][1].conflicts[0] === 7, 'staged on the yes: ' + JSON.stringify(staged.calls));
    assert(!staged.sheet && /Putting it back/.test(staged.toast), 'the sheet closes while the shell reloads: ' + JSON.stringify(staged));

    // Nothing to put back (it changed since): said, nothing staged.
    await ev(app, () => { __ts.plan = { items: [{ key: 'kt_sessions', outcome: 'changed since', origin: 'conflict:7' }], count: 0 }; openStorageSheet(); });
    await app.page.waitForFunction(() => !!document.querySelector('#fpStoreBody button[data-id="7"]'), null, { timeout: 3000 });
    await ev(app, () => document.querySelector('#fpStoreBody button[data-id="7"]').click());
    await settle(app, 150);
    const none = await ev(app, () => ({ ask: !!document.querySelector('.kt-close-sheet'), toast: (document.getElementById('toast') || {}).textContent || '', n: __ts.calls.filter((c) => c[0] === 'putBack').length }));
    assert(!none.ask && /changed since then/.test(none.toast) && none.n === 3, 'a value that changed since stays: ' + JSON.stringify(none));

    // The Native copy switch asks before it turns the copy off, then says when it takes effect.
    await ev(app, () => [...document.querySelectorAll('#fpStoreBody .settings-row')].find((r) => /Native copy/.test(r.textContent)).click());
    await app.page.waitForFunction(() => !!document.querySelector('.kt-close-sheet'), null, { timeout: 3000 });
    await ev(app, () => document.querySelector('.kt-close-sheet [id$="ok"]').click());
    await app.page.waitForFunction(() => __ts.calls.some((c) => c[0] === 'setSwitch'), null, { timeout: 3000 });
    await settle(app, 150);
    const sw = await ev(app, () => ({ call: __ts.calls.filter((c) => c[0] === 'setSwitch')[0], toast: (document.getElementById('toast') || {}).textContent || '',
      row: [...document.querySelectorAll('#fpStoreBody .settings-row')].find((r) => /Native copy/.test(r.textContent)).getAttribute('aria-checked') }));
    assert(sw.call[1].on === false && /off from the next start/.test(sw.toast) && sw.row === 'false', 'the switch: ' + JSON.stringify(sw));
    // A crash verdict offers the way back while the switch is on.
    await ev(app, () => { __ts.status.deviceSwitchOn = true; _fpStoreRefresh(true); });
    await app.page.waitForFunction(() => /Try the copy again/.test((document.getElementById('fpStoreBody') || {}).textContent || ''), null, { timeout: 3000 });
    await ev(app, () => [...document.querySelectorAll('#fpStoreBody .settings-row')].find((r) => /Try the copy again/.test(r.textContent)).click());
    await app.page.waitForFunction(() => __ts.calls.filter((c) => c[0] === 'setSwitch').length === 2, null, { timeout: 3000 });
    assert(await ev(app, () => __ts.calls.filter((c) => c[0] === 'setSwitch')[1][1].on === true), 'Try again turns it on (clearing the crash verdict)');

    // Export a copy.
    await ev(app, () => [...document.querySelectorAll('#fpStoreBody .settings-row')].find((r) => /Export a copy/.test(r.textContent)).click());
    await app.page.waitForFunction(() => __ts.calls.some((c) => c[0] === 'exportCopy'), null, { timeout: 3000 });
    await settle(app, 100);
    assert(/Native copy exported · 24 items/.test(await ev(app, () => (document.getElementById('toast') || {}).textContent || '')), 'the export is confirmed');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }

  // TestFlight: the shell offers the test (status.testKill and the method).
  const st = inStep(); st.testKill = true;
  st.testQuit = { armedAt: NOW - 120000, firedAt: NOW - 60000, key: 'kt_runner_draft', op: 'w', shell: '60', page: '20261010-3',
    after: { at: NOW - 30000, rule: 6, label: 'lag', wouldRepair: ['kt_runner_draft'], adopted: {} } };
  app = await boot({ native: true, init: init({ status: st, flag: FLAG, testKill: true }) });
  try {
    await ev(app, () => { switchTab('settings'); openStorageSheet(); });
    await app.page.waitForFunction(() => /Test: quit after next save/.test((document.getElementById('fpStoreBody') || {}).textContent || ''), null, { timeout: 3000 });
    const text = await ev(app, () => document.getElementById('fpStoreBody').textContent);
    assert(/quit after saving Workout in progress · on reopening, this iPhone had lost the save; the copy kept it/.test(text), 'the last test says what the reopening found: ' + text);
    await ev(app, () => [...document.querySelectorAll('#fpStoreBody .settings-row')].find((r) => /Test: quit after next save/.test(r.textContent)).click());
    await app.page.waitForFunction(() => !!document.querySelector('.kt-close-sheet'), null, { timeout: 3000 });
    await ev(app, () => document.querySelector('.kt-close-sheet [id$="ok"]').click());
    await app.page.waitForFunction(() => __ts.calls.some((c) => c[0] === 'testKill'), null, { timeout: 3000 });
    const arm = await ev(app, () => __ts.calls.filter((c) => c[0] === 'testKill')[0][1]);
    assert(arm.arm === true && arm.keys.indexOf('kt_runner_draft') >= 0 && arm.keys.indexOf('kt_sessions') >= 0 && arm.keys.indexOf('kt_last_open') < 0,
      'armed for the training saves, never the app\'s bookkeeping: ' + JSON.stringify(arm));
    await app.page.waitForFunction(() => /Armed/.test((document.getElementById('fpStoreBody') || {}).textContent || ''), null, { timeout: 3000 });
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

serial('the row says how the copy stands now: a wipe this start, an offer waiting, changes made without it, off', async () => {
  const wipe = { at: NOW - 3600000, snap: '2026-10-11-130750-wiped.json', keys: 73, seq: 10 };
  // Rule 3 this start: the copy kept its set and stays off for the document.
  const wipedNow = inStep();
  wipedNow.facade = 'off'; wipedNow.why = 'store: wiped'; wipedNow.document.attached = false;
  wipedNow.store.inStep = false; wipedNow.store.wipeOffer = wipe;
  wipedNow.store.lastHello = { at: NOW, boot: 3, rule: 3, label: 'wiped', adopted: {}, wouldRepair: [] };
  // Later starts are in step; the offer waits in the sheet's Put back list.
  const offerWaits = inStep(); offerWaits.store.wipeOffer = wipe;
  // A start after an older build, or after a launch with the copy switched off.
  const without = inStep(); without.store.inStep = false;
  without.store.lastHello = { at: NOW, boot: 3, rule: 4, label: 'older build', adopted: { 'older build': ['kt_bw', 'kt_last_open'] }, wouldRepair: [] };
  const switchedOff = inStep(); switchedOff.facade = 'off'; switchedOff.why = 'Storage\'s Native copy switch is off'; switchedOff.deviceSwitchOn = false;
  const closed = inStep(); delete closed.store; closed.facade = 'off'; closed.storeClosedWhy = 'crash marker: the app closed during a native copy save';
  const unreadable = inStep(); unreadable.store = { state: 'unreadable', why: 'file is not a database', counts: { counts: {} } };
  // Wiped at an earlier start (the store's last record still says rule 3), then switched off: the switch is the news.
  const offAfterWipe = JSON.parse(JSON.stringify(switchedOff)); offAfterWipe.store.wipeOffer = wipe;
  offAfterWipe.store.lastHello = { at: NOW - 86400000, boot: 2, rule: 3, label: 'wiped', adopted: {}, wouldRepair: [] };
  const app = await boot({ native: true, init: init({ status: offerWaits, flag: FLAG }) });
  try {
    const lines = await ev(app, (all) => all.map((st) => _fpStoreLine(st)), [wipedNow, offerWaits, without, switchedOff, closed, unreadable, offAfterWipe]);
    assert(lines[0] === 'This iPhone’s data was wiped · the copy kept 73 items', 'the wiped start: ' + lines[0]);
    assert(lines[1] === 'In step · 24 items · 176 KB', 'an offer waiting does not take the row over: ' + lines[1]);
    assert(lines[2] === 'In step · caught up with changes made without it · 24 items · 176 KB', 'rule 4: ' + lines[2]);
    assert(lines[3] === 'Off · switched off on this iPhone', 'the switch: ' + lines[3]);
    assert(lines[4] === 'Off this launch · paused after the app closed during a save', 'a crash verdict: ' + lines[4]);
    assert(/^Off · the copy can’t be read/.test(lines[5]), 'an unreadable store: ' + lines[5]);
    assert(lines[6] === 'Off · switched off on this iPhone', 'an earlier wipe does not hide that the copy is off: ' + lines[6]);
    // The waiting offer: Put back of everything the copy kept, after a preview.
    await ev(app, () => { __ts.plan = { items: [{ key: 'kt_routine', outcome: 'put back', origin: 'snap:x' }, { key: 'kt_sessions', outcome: 'put back', added: 3, origin: 'snap:x' }], count: 2 }; switchTab('settings'); openStorageSheet(); });
    await app.page.waitForFunction(() => /Everything the copy kept/.test((document.getElementById('fpStoreBody') || {}).textContent || ''), null, { timeout: 3000 });
    await ev(app, () => [...document.querySelectorAll('#fpStoreBody button')].find((b) => b.getAttribute('onclick') === '_fpStorePutBackWipe()').click());
    await app.page.waitForFunction(() => !!document.querySelector('.kt-close-sheet'), null, { timeout: 3000 });
    const ask = await ev(app, () => ({ title: document.querySelector('.kt-close-sheet-ttl').textContent, body: document.querySelector('.kt-close-sheet-sub').textContent }));
    assert(ask.title === 'Put back everything the copy kept?' && /Programme, Workouts \(\+3 records\)/.test(ask.body), 'the question names what goes back: ' + JSON.stringify(ask));
    await ev(app, () => document.querySelector('.kt-close-sheet [id$="ok"]').click());
    await app.page.waitForFunction(() => __ts.calls.filter((c) => c[0] === 'putBack').length === 2, null, { timeout: 3000 });
    const calls = await ev(app, () => __ts.calls.filter((c) => c[0] === 'putBack').map((c) => c[1]));
    assert(calls[0].wipe === true && calls[0].preview === true && calls[1].wipe === true && !calls[1].preview, 'preview, then the staged Put back of the wipe: ' + JSON.stringify(calls));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

serial('the OTA confirm is sent when the first render is the coach route, once', async () => {
  const app = await boot({ native: true, seed: { kt_ota_attempt: '20200101-1' }, init: init({ ota: true, coachFirst: true }) });
  try {
    await settle(app, 400);
    const out = await ev(app, () => ({ route: _lastRenderedRoute, tab: currentTab, events: __ts.events, confirmed: _otaConfirmed,
      attempt: localStorage.getItem('kt_ota_attempt') }));
    assert(out.tab === 'coach' && /^coach/.test(out.route), 'the first render was the coach route: ' + JSON.stringify(out));
    const confirms = out.events.filter((e) => e[0] === 'confirm');
    assert(confirms.length === 1 && confirms[0][1] === 'function', 'one confirm, sent at the end of boot: ' + JSON.stringify(out.events));
    assert(out.confirmed === true && out.attempt === null, 'the old shells\' breaker key goes too: ' + JSON.stringify(out));
    // A later paint off the coach route sends nothing more.
    await ev(app, () => switchTab('log'));
    await settle(app, 100);
    assert(await ev(app, () => __ts.events.filter((e) => e[0] === 'confirm').length) === 1, 'still one confirm');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

serial('the first paint confirms as before; bootDone reaches TrovoShell at the end of boot only with the flag', async () => {
  // No flag (every shell before 60): the confirm from the first paint, before the end of boot, and no bootDone.
  let app = await boot({ native: true, init: init({ ota: true, shellPlugin: true }) });
  try {
    await settle(app, 300);
    const ev1 = await ev(app, () => __ts.events);
    assert(ev1.length === 1 && ev1[0][0] === 'confirm' && ev1[0][1] === 'undefined', 'one confirm from the first paint, nothing else: ' + JSON.stringify(ev1));
  } finally { await app.close(); }
  // The flag: the same confirm, and bootDone with the page's build once boot is over.
  app = await boot({ native: true, init: init({ ota: true, shellPlugin: true, flag: FLAG }) });
  try {
    await settle(app, 300);
    const out = await ev(app, () => ({ events: __ts.events, build: APP_BUILD }));
    const confirms = out.events.filter((e) => e[0] === 'confirm'), dones = out.events.filter((e) => e[0] === 'bootDone');
    assert(confirms.length === 1 && confirms[0][1] === 'undefined', 'the confirm still comes from the first paint: ' + JSON.stringify(out.events));
    assert(dones.length === 1 && dones[0][1] === 'function' && dones[0][2].page === out.build, 'bootDone {page} once, at the end of boot: ' + JSON.stringify(out.events));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

serial('the tools\' launch arguments come in the flag: dev.nav once per launch, dev.theme painted and never saved', async () => {
  let app = await boot({ native: true, init: init({ flag: Object.assign({}, FLAG, { dev: { nav: 'settings', theme: 'dark' } }), icon: true }) });
  try {
    await app.page.waitForFunction(() => currentTab === 'settings', null, { timeout: 3000 });
    const out = await ev(app, () => ({ room: document.documentElement.getAttribute('data-room'), theme: currentTheme, saved: localStorage.getItem('kt_theme'),
      nav: localStorage.getItem('kt_dev_nav') }));
    assert(out.room === 'dark' && out.theme === 'dark' && out.saved === null && out.nav === null, 'the room for this launch, nothing written: ' + JSON.stringify(out));
    await settle(app, 2700);
    assert(await ev(app, () => __ts.events.filter((e) => e[0] === 'icon').length) === 0, 'the Home Screen icon is left alone under a dev room');
    // The same launch reloads the page (Put back, a WebContent restart): the room again, the route not again.
    await app.reload();
    await settle(app, 400);
    const again = await ev(app, () => ({ tab: currentTab, room: document.documentElement.getAttribute('data-room') }));
    assert(again.tab === 'log' && again.room === 'dark', 'once per launch: ' + JSON.stringify(again));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
  // settings/storage-sheet opens the Storage sheet (test-native.sh shoots it).
  app = await boot({ native: true, init: init({ status: inStep(), flag: Object.assign({}, FLAG, { dev: { nav: 'settings/storage-sheet' } }) }) });
  try {
    await app.page.waitForFunction(() => /In step/.test((document.getElementById('fpStoreHead') || {}).textContent || ''), null, { timeout: 3000 });
    assert(await ev(app, () => currentTab) === 'settings', 'the route lands in Settings with the sheet open');
  } finally { await app.close(); }
  // Without the flag, kt_dev_nav still routes (and is taken).
  app = await boot({ seed: { kt_dev_nav: 'progress' } });
  try {
    await app.page.waitForFunction(() => currentTab === 'progress', null, { timeout: 3000 });
    assert(await ev(app, () => localStorage.getItem('kt_dev_nav')) === null, 'kt_dev_nav is consumed');
  } finally { await app.close(); }
});

serial('the privacy copy is true with or without a native copy', async () => {
  const app = await boot();
  try {
    const text = await ev(app, () => { openPrivacy(); return document.getElementById('pp-view').textContent; });
    assert(/second, native copy of the same data on the phone/.test(text) && /never leaves the phone unless you export it/.test(text), 'the native copy is described');
    assert(/Uninstalling the app deletes everything, the native copy included/.test(text), 'uninstalling deletes both copies');
    assert(!/lives in localStorage on your phone\. We do not/.test(text), 'the old single-copy sentence is gone');
  } finally { await app.close(); }
});
