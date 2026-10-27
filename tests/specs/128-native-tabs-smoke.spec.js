// fp-spec: self-shelled
// 128: the differential smoke (plan task T13; contract 12, I7, I8, D35): the same everyday flows under the five shells
// an OTA page meets, on one seed, in UTC, on the golden clock (CLOCK_INIT), the coach API answered in the page (as
// 118's): none (no flag: every shell up to 59), coach (build 60 with its native chat on, what the owner's phone runs),
// coach61 (a 61 binary under the classic root, as 61's first launches are), tabs and tabsWeb (the tab root, with and
// without the native Coach tab). The seed is the suite's with today made a Push day and an easy run logged today, and
// Math.random seeded too (the Progress hero's pick of the day is stored).
// - The flows, in one document per shell: (1) Log: today's overview, Begin, three sets, Finish (Save & finish early),
//   COMPLETE closed; (2) Progress: today's day sheet, its run moved a day back in the run editor and the toast's Undo;
//   (3) Settings: Theme to Lime and back, then Routines: one lift's sets +1 from this week on; (4) Coach: one question
//   answered, through the native chat's intents (coach.send) under coach, coach61 and tabs, the web composer under
//   none and tabsWeb; (5) trovo://start (under the tab root the shell selects Log for the link first, contract 9). The
//   tabs change by the owner's tap: the web tab bar under the classic root, the native bar (__fpShell.tap) under the
//   tab root.
// - After each flow every kt_* key is compared across the five runs, timestamps (numbers of 1.6e12 or more, and runs of
//   13 digits inside text) and ids masked, object keys in any order: equal. Left out: kt_last_open (each visit's
//   stamp) and kt_wch_log (the watch bridge's breadcrumbs: a wall-clock line per watch push, and the bridge's 800 ms
//   debounce counts the pushes by the flows' pace, which no shell sets; every run talks to the same watch mock). The
//   bridge's own session keys (fp_tab, the mock's __fpShellMock) live in sessionStorage, never under kt_*.
// - Each run checks that its flows did what they say (a session of three sets today, the run on yesterday and back
//   with the day sheet, Lime then Heavyweight, the lift's sets one up from this week on only, the question and its
//   reply through the chat its shell has, today's overview after the link), and every run but none that the page threw
//   nothing.
// - The classic root (none, coach, coach61): no fp-tabs class, the page's own #tabs drawn, no selectTab, sheets or
//   setSwitch call. The tab root (tabs, tabsWeb): #tabs never displayed (every frame sampled), tabs mode kept with no
//   fallback, each owner's tap answered on its tab, one selectTab per page switch (switchTab) naming its tab; every
//   overlay announced and closed again (after each step the shell's sheets state is the page's overlays, each flow
//   that puts one up announces it, the calls alternate, every flow ends closed and so does the run); the bar's
//   numbers follow (every answer applied: --fp-bar-h 0 while an overlay is up, the shown 83 otherwise and over the
//   runner, --fp-bar-up and innerHeight constant); the toasts on the web tabs drawn by the page, never forwarded; under
//   tabs the Coach tab native, under tabsWeb the web hub.
// Every native boot names its shell (the mark above): FP_SHELL_INERT runs skip this spec.
'use strict';
const { boot, assert, run } = require('../lib/harness');
const { CLOCK_INIT } = require('../golden/coach-cases');

// One run at a time: each starts its own browser, and the comparison waits for all five.
let _chain = Promise.resolve();
function serial(name, fn) {
  const prev = _chain;
  let done;
  _chain = new Promise((r) => { done = r; });
  run(name, async () => { await prev; try { await fn(); } finally { done(); } });
}
const ev = (app, fn, arg) => app.page.evaluate(fn, arg);
const J = (x) => JSON.stringify(x);

const SHELLS = ['none', 'coach', 'coach61', 'tabs', 'tabsWeb'];
const ROOT = { tabs: true, tabsWeb: true };   // the tab root: the native bar is the tabs
const NATIVE_CHAT = { coach: true, coach61: true, tabs: true };   // the question goes through the native chat's intents
const FLOWS = ['log', 'progress', 'settings', 'coach', 'start'];
const LEFT_OUT = { kt_last_open: true, kt_wch_log: true };
const KEY = 'sk-ant-test';
const QUESTION = 'How did my week go?';
const RUN_ID = 1784596627751;   // the run logged today (the seed's own runs end at ...750)

// In the page, before its scripts (after CLOCK_INIT, so its dates are the golden clock's):
// - Math.random seeded, as the data is: the page's random choices (the Progress hero's pick of the day, kept in
//   kt_progress_hero) come out the same in every run;
// - the coach API answering at once (spec 118's), each request counted while it is in flight (__busy);
// - today a Push day (the seed's Friday is a rest day; the other days stay the seed's), and an easy run logged today;
// - every frame, whether #tabs is displayed (__tabsShown counts the frames it was).
const INIT = CLOCK_INIT + `(() => {
  let seed = 128;
  Math.random = () => {   // mulberry32
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  window.__busy = 0;
  window.fetch = async (url, o) => {
    if (!String(url).includes('anthropic')) return new Response('', { status: 404 });
    window.__busy++;
    try {
      const body = JSON.parse(o.body);
      return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', content: [{ type: 'text', text: body.tools ? 'On it.' : '{"message":"ok","actions":[]}' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    } finally { setTimeout(() => { window.__busy--; }, 0); }
  };
  try {
    const cr = JSON.parse(localStorage.getItem('kt_routine'));
    cr.weekPlan[(new Date().getDay() + 6) % 7] = 'Push';
    localStorage.setItem('kt_routine', JSON.stringify(cr));
    const d = new Date(), z = (n) => (n < 10 ? '0' : '') + n;
    const runs = JSON.parse(localStorage.getItem('kt_runs') || '[]');
    runs.unshift({ id: ${RUN_ID}, date: d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()), distance: 5, time: '27:30', hr: 150, type: 'easy', note: 'Easy.' });
    localStorage.setItem('kt_runs', JSON.stringify(runs));
  } catch (e) {}
  window.__tabsShown = 0;
  (function tick() {
    try { const t = document.getElementById('tabs'); if (t && getComputedStyle(t).display !== 'none') window.__tabsShown++; } catch (e) {}
    requestAnimationFrame(tick);
  })();
})();`;

// After the boot, in the page: __switches, every page path into a tab (switchTab); __toasts, each toast with the tab it
// showed on, whether the page drew it (#toast shows its words) and how many went to the shell.
function RECORD() {
  window.__switches = [];
  const st = window.switchTab;
  window.switchTab = function (tab) { window.__switches.push(tab); return st.apply(this, arguments); };
  window.__toasts = [];
  ['showToast', 'showUndoToast'].forEach((name) => {
    const f = window[name];
    window[name] = function (msg) {
      const shell = () => (window.__fpShell ? window.__fpShell.of('toast').length : 0);
      const n = shell(), tab = currentTab;
      const r = f.apply(this, arguments);
      const t = document.getElementById('toast');
      window.__toasts.push({ fn: name, msg: String(msg), tab, fwd: shell() - n,
        drawn: !!t && t.classList.contains('show') && t.textContent.indexOf(String(msg)) === 0 });
      return r;
    };
  });
}
// Every kt_* key and its stored text.
function SNAP() {
  const o = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('kt_') === 0) o[k] = localStorage.getItem(k); }
  return o;
}
// Where the records stand, and one flow's share of them since.
function HEARD() {
  return { calls: window.__fpShell ? window.__fpShell.calls.length : 0, switches: window.__switches.length, toasts: window.__toasts.length };
}
function HEARD_SINCE(n) {
  const calls = window.__fpShell ? window.__fpShell.calls.slice(n.calls) : [];
  return {
    sel: calls.filter((c) => c[0] === 'selectTab').map((c) => c[1]),
    sheets: calls.filter((c) => c[0] === 'sheets').map((c) => c[1] && c[1].open),
    decl: calls.filter((c) => c[0] === 'present' || c[0] === 'dismiss').map((c) => c[0] + ' ' + (c[1] && c[1].screen)),
    switches: window.__switches.slice(n.switches),
    toasts: window.__toasts.slice(n.toasts),
  };
}

// Masks what differs by the moment a run happened: numbers that are times (1.6e12 or more), runs of 13 digits inside
// text (ids and scopes built from times) and every id; object keys sorted. A value that is not JSON stays text.
function mask(v, k) {
  if (k === 'id' || /Id$/.test(k || '')) return '<id>';
  if (typeof v === 'number') return v >= 1.6e12 ? '<t>' : v;
  if (typeof v === 'string') return v.replace(/\d{13,}/g, '<t>');
  if (Array.isArray(v)) return v.map((x) => mask(x));
  if (v && typeof v === 'object') {
    const o = {};
    Object.keys(v).sort().forEach((key) => { o[key] = mask(v[key], key); });
    return o;
  }
  return v;
}
function masked(snap) {
  const o = {};
  Object.keys(snap).sort().forEach((k) => {
    if (LEFT_OUT[k]) return;
    let v = snap[k];
    try { v = JSON.parse(v); } catch (e) { /* text */ }
    o[k] = J(mask(v));
  });
  return o;
}
// Where a run's masked snapshot differs from none's, key by key, with the text around the first difference.
function diff(a, b) {
  const out = [];
  for (const k of Object.keys(Object.assign({}, a, b)).sort()) {
    if (a[k] === b[k]) continue;
    if (a[k] === undefined || b[k] === undefined) { out.push(k + (a[k] === undefined ? ' missing under none' : ' missing here')); continue; }
    let i = 0;
    while (i < a[k].length && a[k][i] === b[k][i]) i++;
    const at = (s) => '…' + s.slice(Math.max(0, i - 40), i + 60) + '…';
    out.push(k + ' @' + i + ': none ' + at(a[k]) + ' here ' + at(b[k]));
  }
  return out;
}

// Quiet: no coach request in flight, no coach turn, no morning card loading, twice across a short wait (a reply's
// render can start the next request).
async function idle(app) {
  const quiet = () => app.page.waitForFunction(() => !window.__busy && !coachLoading && !coachCardLoading, null, { timeout: 15000 });
  await quiet();
  await app.page.waitForTimeout(80);
  await quiet();
}

// One document: the five flows under one shell, recorded in RUNS[shell] as they go (a run that stops keeps the flows
// it finished for the comparison), for the run's own checks and the comparison.
const RUNS = {};
async function smoke(shell) {
  const tabsRoot = !!ROOT[shell];
  const rec = RUNS[shell] = { shell, snaps: {}, flows: {}, steps: [], taps: [], facts: {}, dates: null, errors: null, end: null };
  const app = await boot({ native: true, shell, page: { timezoneId: 'UTC' }, init: INIT, seed: { kt_apikey: KEY, kt_coach_msgs: '[]' } });
  try {
    // hello answered (under a flag) and the boot's morning card fetched
    await app.page.waitForFunction((flag) => (!flag || (window._fp && _fp.hello)) && typeof coachCardLoading !== 'undefined' && !coachCardLoading,
      shell !== 'none', { timeout: 15000 });
    await idle(app);
    await ev(app, RECORD);
    let flow = null;
    // After each step: quiet, then (the tab root) once the shell's newest bar answer has reached the page (a sheets
    // answer comes 16 ms after its call, and a page timer can put an overlay up late in the step: COMPLETE at +80 ms),
    // the page's overlays, the shell's sheets state, both revs, the bar's numbers on <html> (--fp-bar-h, --fp-bar-up),
    // innerHeight and whether the runner is up.
    const after = async (label) => {
      await idle(app);
      if (tabsRoot) {
        await app.page.waitForFunction(() => _fp.tabs.rev === __fpShell.state().scene.rev, null, { timeout: 3000 }).catch(() => {});
        rec.steps.push(Object.assign({ flow, label }, await ev(app, () => {
          const st = document.documentElement.style;
          return { up: _fpSheetsOpen(), shell: !!__fpShell.state().doc.sheetsOpen, revs: [_fp.tabs.rev, __fpShell.state().scene.rev],
            h: st.getPropertyValue('--fp-bar-h'), barUp: st.getPropertyValue('--fp-bar-up'), ih: window.innerHeight,
            runner: !!runnerOpen, tab: currentTab, coach: _fpCoachMode() };
        })));
      }
    };
    const t = {
      click: async (sel) => { await app.page.click(sel, { timeout: 8000 }); await after(sel); },
      fill: async (sel, text) => { await app.page.fill(sel, text, { timeout: 8000 }); },
      // a page call or a shell's message; its answer kept as a fact under its label
      ev: async (label, fn, arg) => { const r = rec.facts[label] = await ev(app, fn, arg); await after(label); return r; },
      // the owner's tap: the native bar under the tab root (its tabs.select answered by the page), else the web tab bar
      tab: async (tab) => {
        if (tabsRoot) rec.taps.push([tab, await ev(app, (tab) => __fpShell.tap(tab), tab)]);
        else await app.page.click('#tabs .tab[data-tab="' + tab + '"]', { timeout: 8000 });
        await after('tab ' + tab);
      },
      fact: async (name, fn, arg) => { rec.facts[name] = await ev(app, fn, arg); },
      // a page condition the step's own work makes true (a reply landing)
      until: async (label, fn) => { await app.page.waitForFunction(fn, null, { timeout: 10000 }); await after(label); },
    };
    const dates = rec.dates = await ev(app, () => ({ today: todayISO(), yesterday: addDays(todayISO(), -1) }));

    for (const f of FLOWS) {
      flow = f;
      const n = await ev(app, HEARD);
      await FLOW[f](t, { shell, tabsRoot, dates });
      rec.flows[f] = await ev(app, HEARD_SINCE, n);
      rec.snaps[f] = await ev(app, SNAP);
    }
    rec.end = await ev(app, () => {
      const S = window.__fpShell, st = S ? S.state() : null;
      return { tabsShown: window.__tabsShown, cls: document.documentElement.classList.contains('fp-tabs'),
        mode: !!(window._fp && _fp.tabs && _fp.tabs.mode), sheets: st && st.doc ? !!st.doc.sheetsOpen : null,
        fellBack: st && st.scene ? st.scene.fellBack : null,
        calls: ['selectTab', 'sheets', 'setSwitch'].map((m) => (S ? S.of(m).length : 0)) };
    });
    rec.errors = app.errors.slice();
  } finally { await app.close(); }
  return rec;
}

// The flows. Each step clicks what the owner would tap (found by what it is or says), or sends the shell's message.
const FLOW = {
  // (1) Log: today's overview, Begin, three sets, Finish, COMPLETE closed.
  log: async (t, o) => {
    await t.click('#screen .kt-cta');   // START
    await t.click('#sessionOverviewOverlay button:has-text("Begin workout")');
    await t.click('#runner-root .kt-r-target');   // the first lift's card: engaged
    for (let n = 1; n <= 3; n++) {
      await t.click('#runner-root .kt-eng-done:has-text("Log set ' + n + '")');
      await t.click('#runner-root .kt-rest-go');   // Skip the rest
    }
    await t.click('#runner-root .kt-r-back');   // Leave workout?
    await t.click('#kt-close-runner-sheet button:has-text("Save & finish early")');
    await t.click('#completeSheetOverlay .kt-cmp-actions button:has-text("Done")');
    await t.fact('log', () => {
      const s = getSessions()[0] || {};
      return { date: s.date, type: s.type, sets: (s.exercises || []).map((e) => [e.name, e.sets]), runner: !!runnerOpen,
        overlays: document.querySelectorAll('.kt-sheet-overlay, .kt-close-sheet').length };
    });
  },
  // (2) Progress: today's day sheet, its run moved a day back in the run editor, and the toast's Undo.
  progress: async (t, o) => {
    await t.tab('progress');
    await t.click('.cal-day[data-date="' + o.dates.today + '"]');
    await t.click('#calDayOverlay #cal-edit-' + RUN_ID);   // Edit run
    await t.fill('#re_date', o.dates.yesterday);
    await t.click('#runEditOverlay button:has-text("Save changes")');
    await t.fact('moved', (id) => ({ date: (getRuns().find((r) => r.id === id) || {}).date, sheet: calSelectedDate }), RUN_ID);
    await t.click('#toast .kt-toast-undo');
    await t.fact('back', (id) => ({ date: (getRuns().find((r) => r.id === id) || {}).date, sheet: calSelectedDate }), RUN_ID);
    await t.click('#calDayOverlay .kt-sheet-x');
  },
  // (3) Settings: Theme to Lime and back; Routines: one lift's sets +1 from this week on.
  settings: async (t) => {
    const room = () => ({ theme: localStorage.getItem('kt_theme'), room: document.documentElement.getAttribute('data-room') });
    const rows = () => ({ c: currentWeek - 1, rows: getCustomRoutine().weeks.map((w) => (w.push && w.push[0] ? [w.push[0].name, w.push[0].sets] : null)) });
    await t.tab('settings');
    await t.click('#screen .settings-row[onclick="openThemeSheet()"]');
    await t.click('#themeSheetOverlay button[onclick="applyTheme(\'dark\')"]');
    await t.fact('lime', room);
    await t.click('#themeSheetOverlay button[onclick="applyTheme(\'heavyweight\')"]');
    await t.click('#themeSheetOverlay .kt-sheet-x');
    await t.fact('heavyweight', room);
    await t.fact('sets0', rows);
    await t.click('#screen .settings-row[onclick="openRoutines()"]');
    await t.click('#routinesOverlay .kt-rt-open');   // the first day's first lift
    await t.click('#routinesOverlay button[aria-label="More Sets"]');   // APPLIES: from this week on (the default)
    await t.click('#rtSave');
    await t.click('#routinesOverlay .kt-sheet-x');
    await t.fact('sets1', rows);
  },
  // (4) Coach: one question answered. The native chat's intents under coach, coach61 and tabs; the web chat otherwise.
  coach: async (t, o) => {
    await t.tab('coach');
    await t.fact('hub', () => ({ mode: _fpCoachMode(), ph: !!document.querySelector('#screen > .kt-fp-ph'),
      row: !!document.querySelector('#screen [onclick="openCoachChat()"]') }));
    if (o.shell === 'tabs') await t.ev('coachHome.openChat', () => __fpShell.call('coachHome.openChat'));   // the native hub's row
    else await t.click('#screen [onclick="openCoachChat()"]');   // the web hub's row
    const replied = () => !coachLoading && coachMessages.some((m) => m.role === 'assistant');
    const chat = () => ({ shown: !!(window._fp && _fp.shown && _fp.shown.coach), input: !!document.getElementById('coach-input') });
    if (NATIVE_CHAT[o.shell]) {
      await t.ev('coach.send', (q) => __fpShell.call('coach.send', { text: q, nonce: 'smoke-1' }), QUESTION);
      await t.until('the reply', replied);
      await t.fact('chat', chat);
      await t.ev('coach.back', () => __fpShell.call('coach.back'));
    } else {
      await t.fill('#coach-input', QUESTION);
      await t.click('#coach-send');
      await t.until('the reply', replied);
      await t.fact('chat', chat);
      await t.click('#screen button:has-text("Back")');
    }
    await t.fact('asked', () => ({ view: coachView, tab: currentTab,
      msgs: JSON.parse(localStorage.getItem('kt_coach_msgs') || '[]').map((m) => [m.role, typeof m.content === 'string' ? m.content : '?']) }));
  },
  // (5) trovo://start: under the tab root the shell selects Log for the link first, then hands it over (contract 9).
  start: async (t, o) => {
    if (o.tabsRoot) await t.ev('select log', () => __fpShell.select('log', 'deepLink'));
    await t.ev('trovo://start', () => { window._trovoOpen('trovo://start'); });
    await t.click('#sessionOverviewOverlay .kt-sheet-x');   // today's overview, opened by the link, closed
    await t.fact('start', () => ({ tab: currentTab, sub: logSubTab }));
  },
};
for (const shell of SHELLS) {
  const what = ROOT[shell] ? 'the native bar is the tabs, every overlay announced, the toasts the page\'s'
    : 'the classic root keeps the page\'s own bar';
  serial(shell + ': the five flows do what they say; ' + what, async () => {
    const r = await smoke(shell);
    const tag = shell + ': ';
    const f = r.facts, d = r.dates;
    // the flows did what they say
    assert(f.log.date === d.today && f.log.type === 'Push' && J(f.log.sets) === J([['Bench Press', 3]]) && !f.log.runner && f.log.overlays === 0,
      tag + 'Log: a Push session today with three sets of its first lift, the runner and every sheet closed: ' + J(f.log));
    assert(f.moved.date === d.yesterday && f.moved.sheet === d.yesterday && f.back.date === d.today && f.back.sheet === d.today,
      tag + 'Progress: the run moved a day back with the day sheet, and back on today by Undo: ' + J([f.moved, f.back]));
    assert(J(f.lime) === J({ theme: 'dark', room: 'dark' }) && J(f.heavyweight) === J({ theme: 'heavyweight', room: 'heavyweight' }),
      tag + 'Theme: Lime, then Heavyweight: ' + J([f.lime, f.heavyweight]));
    const c = f.sets0.c, r0 = f.sets0.rows, r1 = f.sets1.rows;
    assert(r1.length === r0.length && r1[c] && r1[c][1] === r0[c][1] + 1 && r1.every((x, i) => x && r0[i] && x[0] === r0[i][0]
      && (i < c ? x[1] === r0[i][1] : i === c || x[1] === r0[i][1] || x[1] === r0[i][1] + 1)),
      tag + 'Routines: the first lift\'s sets one up from this week on, earlier weeks unchanged: ' + J([c, r0, r1]));
    assert(J(f.asked.msgs) === J([['user', QUESTION], ['assistant', 'On it.']]) && f.asked.view === 'home' && f.asked.tab === 'coach',
      tag + 'Coach: the question and its reply, back on the hub: ' + J(f.asked));
    if (NATIVE_CHAT[shell]) {
      const sent = f['coach.send'], back = f['coach.back'], open = f['coachHome.openChat'];
      assert((shell !== 'tabs' || (open && open.ok === true)) && sent && sent.ok === true && !sent.duplicate
        && f.chat.shown && !f.chat.input && back && back.ok === true,
        tag + 'the question went through the native chat (coach.send), Back by coach.back: ' + J([open, sent, f.chat, back]));
      const decl = r.flows.coach.decl.filter((x) => / coach$/.test(x));
      assert(J(decl) === J(['present coach', 'dismiss coach']), tag + 'the chat presented once and dismissed by Back: ' + J(r.flows.coach.decl));
    } else {
      assert(!f.chat.shown && f.chat.input, tag + 'the question went through the web composer: ' + J(f.chat));
    }
    assert(f.start.tab === 'log' && f.start.sub === 'workout', tag + 'trovo://start: today\'s overview on Log: ' + J(f.start));
    if (shell !== 'none') assert(r.errors.length === 0, tag + 'no page errors: ' + r.errors.join(' | '));

    const e = r.end;
    if (!ROOT[shell]) {
      assert(!e.cls && !e.mode && e.tabsShown > 0, tag + 'the classic root: no fp-tabs class, the page\'s own #tabs drawn: ' + J(e));
      assert(J(e.calls) === '[0,0,0]', tag + 'no selectTab, sheets or setSwitch call: ' + J(e.calls));
      return;
    }
    assert(e.tabsShown === 0, tag + '#tabs never displayed: ' + e.tabsShown + ' frame(s)');
    assert(e.cls && e.mode && e.fellBack === null, tag + 'tabs mode kept, no fallback: ' + J(e));
    assert(J(r.taps.map((x) => x[0])) === J(['progress', 'settings', 'coach']) && r.taps.every((x) => x[1] && x[1].ok === true && x[1].tab === x[0]),
      tag + 'each tap answered on its tab: ' + J(r.taps));
    assert(J(f['select log']) === J({ ok: true, tab: 'log' }), tag + 'the link\'s selection of Log answered on Log: ' + J(f['select log']));
    assert(J(f.hub) === J(shell === 'tabs' ? { mode: 'native', ph: true, row: false } : { mode: 'web', ph: false, row: true }),
      tag + (shell === 'tabs' ? 'the Coach tab native (the placeholder alone)' : 'the Coach tab the web hub') + ': ' + J(f.hub));
    for (const fl of FLOWS) {
      const h = r.flows[fl];
      assert(J(h.sel.map((s) => s.tab)) === J(h.switches), tag + fl + ': one selectTab per page switch, naming its tab: ' + J([h.sel, h.switches]));
      assert(h.sheets.length % 2 === 0 && h.sheets.every((x, i) => x === (i % 2 === 0)),
        tag + fl + ': every overlay announced and closed again, in turn: ' + J(h.sheets));
      if (fl !== 'coach') assert(h.sheets.length >= 2, tag + fl + ': its overlays announced: ' + J(h.sheets));
      const web = h.toasts.filter((x) => x.tab !== 'coach');
      if (fl === 'log' || fl === 'progress' || fl === 'settings') assert(web.length >= 1, tag + fl + ': its toasts recorded: ' + J(h.toasts));
      assert(web.every((x) => x.drawn && x.fwd === 0), tag + fl + ': the toasts on the web tabs drawn by the page, never forwarded: ' + J(web));
    }
    assert(J(r.flows.start.switches) === '["log"]', tag + 'trovo://start is the run\'s one page switch: ' + J(r.flows.start));
    const steps = r.steps, bad = steps.filter((s) => s.up !== s.shell);
    assert(steps.length >= 30 && bad.length === 0, tag + 'after every step the shell\'s sheets state is the page\'s overlays: ' + J(bad));
    const late = steps.filter((s) => s.revs[0] !== s.revs[1]);
    assert(late.length === 0, tag + 'every bar answer applied (the page\'s rev the shell\'s): ' + J(late));
    // the bar's numbers follow it (contract 3.4, I7): hidden (0) while an overlay is up over a web tab or a web Coach
    // tab, the shown 83 otherwise, over the runner too; the newest shown height kept throughout; innerHeight never moves
    const geo = steps.filter((s) => s.h !== (s.up && (s.tab !== 'coach' || s.coach === 'web') ? '0px' : '83px'));
    assert(geo.length === 0, tag + 'the bar hidden exactly while an overlay is up: ' + J(geo));
    assert(steps.some((s) => s.runner) && steps.every((s) => s.barUp === '83px' && s.ih === steps[0].ih),
      tag + 'the bar up over the runner, --fp-bar-up and innerHeight constant: ' + J(steps.map((s) => [s.label, s.h, s.barUp, s.ih, s.runner])));
    assert(e.sheets === false, tag + 'the sheets state closed at the end: ' + J(e));
  });
}

serial('every kt_* key equal after each flow under coach, coach61, tabs and tabsWeb as under none (timestamps and ids masked)', async () => {
  const bad = [];
  for (const fl of FLOWS) {
    if (!RUNS.none || !RUNS.none.snaps[fl]) { bad.push('none did not finish ' + fl); continue; }
    const base = masked(RUNS.none.snaps[fl]);
    for (const s of SHELLS.slice(1)) {
      if (!RUNS[s] || !RUNS[s].snaps[fl]) { bad.push(s + ' did not finish ' + fl); continue; }
      const d = diff(base, masked(RUNS[s].snaps[fl]));
      if (d.length) bad.push(s + ' after ' + fl + ': ' + d.join(' || '));
    }
  }
  assert(bad.length === 0, 'stored data differs:\n    ' + bad.join('\n    '));
  const keys = Object.keys(masked(RUNS.none.snaps.start));
  assert(['kt_sessions', 'kt_runs', 'kt_routine', 'kt_theme', 'kt_coach_msgs'].every((k) => keys.indexOf(k) >= 0),
    'the comparison holds the flows\' data: ' + J(keys));
});
