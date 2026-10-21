// fp-spec: self-shelled
// 125: the page under build 61's native tab bar (plan task P3; contract 7.2-7.4, I7, D8, D40; P-D2, P-D14; the H0
// probe's delta 14.1 and 14.3: the glass bar is 83pt on every iPhone, safe 34 or 0, and the shell sets no safe-area
// hold). env(safe-area-inset-bottom) is set through DevTools as WebKit has it under the tab root (the bar's 83 while
// it shows, the window's inset while it is hidden), so a tabs-mode surface that read it would move.
// - The fallback: until the shell has measured the bar shown, --fp-bar-up and _fp.tabs.up are 83, from the head
//   script's first frame on (P2 had 49 + safe); a measured 0 (hidden) keeps the last height, a measured h replaces it.
// - Every in-flow clearance is --fp-bar-up (CSS px at the Larger Text zoom) plus classic's gap above its bar: the
//   scroll end + 24, the toast + 8 (Heavyweight + 14), the web chat's column + 8 (chat-typing too; 8 with the keys
//   up), the runner's root and seal at the bar's height; at zoom 1, 1.12 and 1.25, both rooms, 390 x 844 (83/34) and
//   375 x 667 (83/0), under tabs and tabsWeb. On screen the runner ends at the bar's top at every zoom, its strip clear
//   of it and (zoom 1) its card whole; the composer, a shown toast and Log's last content sit their gap above it (the
//   twins of specs 37 and 39); the toast still goes to the top over a sheet and under the header in the chat.
// - I7: hiding the bar re-lays out nothing. On every tab innerHeight, #screen's scroll height and padding and #app stay
//   put across a tabs.bar of h 0 and back and a sheet's own answer and its close; the runner across its open, a
//   hidden bar and its close, its seal the bar's height (--fp-bar-up, not --fp-clear) while the bar is hidden; #tabs is
//   out of the accessibility tree and the page holds no tablist (spec 40's twin).
// - Overlays pad from --fp-sheet-b / --fp-safe-b, never env(): one overlay of each of the ten paddings at zoom 1, 1.12
//   and 1.25, for 83/34 and 83/0, the same in the hold, after the sheet's own answer, as env() moves and across a
//   tabs.bar of h 0 and back; the exercise picker's header and openCFMovePicker's own sheet keep their paddings. A
//   source scan holds the page to those ten readers of env(safe-area-inset-bottom): a new one fails until the block
//   has its line.
// - Typing: a hardware keyboard (chat-typing without kb-open) keeps the composer 8 above the bar, the conversation as
//   tall (spec 58's twin); with the keys up the column keeps classic's 8 above them, #app over the visual viewport
//   (spec 117 M2's twin), and the composer goes back above the bar when they go down.
// - The share intake under tabsWeb lands on Coach through one selectTab {tab:'coach'}, the day sheet closed, COMPARE
//   left, the Coach tab lit in the hidden #tabs (spec 106 R22's twin; its intent is P4's, spec 129).
// - Classic (none, coach61): the values classic computes today, #tabs shown, and every box equal to the one the same
//   page draws with its NATIVE TAB BAR block cut out (contract 7.3: classic CSS byte for byte in effect).
// Every native boot names its shell (the mark above): FP_SHELL_INERT runs skip this spec.
const fs = require('fs');
const path = require('path');
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
const sorted = (o) => JSON.stringify(Object.keys(o).sort().reduce((a, k) => { a[k] = o[k]; return a; }, {}));
const near = (a, b, tol) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= (tol === undefined ? 0.02 : tol);
const r2 = (n) => Math.round(n * 100) / 100;
// Hello answered (under a flag) and the boot's last render in: with a key saved the morning card's fetch fails here and
// repaints Log a beat after the boot, which would move what a case measures under it.
const ready = (app, flag) => app.page.waitForFunction((flag) => (!flag || (window._fp && _fp.hello)) && typeof coachCardLoading !== 'undefined'
  && !coachCardLoading, flag !== false, { timeout: 15000 }).then(() => app.page.waitForTimeout(60));
// WebKit's env(safe-area-inset-bottom) under the tab root is the bar's cover (83) while the bar shows and the window's
// inset (34 or 0) while it is hidden, and it moves late (contract 7.4). Chromium's is 0 unless DevTools overrides it:
// a case sets it as the phone would, so a tabs-mode surface that read it would move. __env(bottom) sets it in the page.
async function insets(app) {
  const cdp = await app.page.context().newCDPSession(app.page);
  const set = (bottom) => cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 0, right: 0, bottom } });
  await app.page.exposeFunction('__env', set);
  return set;
}
const FLAG = (name, bar) => { const f = JSON.parse(CANONICAL_61[name]); if (bar) f.tabs.bar = bar; return f; };
const PHONES = [
  { size: { width: 390, height: 844 }, h: 83, safe: 34 },   // Face ID: predicted (83, 34), taller than 2:1
  { size: { width: 375, height: 667 }, h: 83, safe: 0 },    // Home button: predicted (83, 0) (delta 14.1)
];
const SHORT = [{ role: 'user', content: 'How was my week?' }, { role: 'assistant', content: 'Four sessions, two PRs. Keep the same plan next week.' }];
const SEED = { kt_sessions: '[]', kt_apikey: 'sk-ant-test', kt_coach_msgs: JSON.stringify(SHORT) };

// A TrovoStore standing in for the shell's: Settings > About > Storage opens its sheet only with one.
const STORE_PLUGIN = '(function () { var P = window.Capacitor && window.Capacitor.Plugins; if (!P) return;'
  + ' var st = { shell: "61", facade: "attached", store: { state: "ready", build: 61, keys: 24, bytes: 180224, inStep: true },'
  + ' counters: {}, crashVerdicts: [] };'
  + ' P.TrovoStore = { status: function () { return Promise.resolve(JSON.parse(JSON.stringify(st))); },'
  + ' conflicts: function () { return Promise.resolve({ rows: [] }); } }; })();';

// In the page: the helpers every case reads with, and the ten overlay paddings (P-D14), one opener each:
// [name, tab, open, the element that pads, close, the rule's variable, its addend].
const HELP = `(() => {
  window.__w = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__v = (k) => parseFloat(document.documentElement.style.getPropertyValue(k));
  window.__cs = (el, p) => (el ? parseFloat(getComputedStyle(el)[p]) : null);
  window.__fin = () => document.getAnimations().forEach((a) => { try { a.finish(); } catch (e) {} });
  window.__until = async (f, ms) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < (ms || 3000)) await __w(16); return f(); };
  window.__R = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, h: b.height }; };
  const sheet = (id) => () => document.querySelector('#' + id + ' .kt-sheet');
  const runner = async () => { if (currentTab !== 'log') switchTab('log'); if (!runnerOpen) { openDeckRunner('Push'); await __w(60); } openRunnerExEdit(0); };
  const edit = () => document.getElementById('runner-ex-edit-sheet');
  window.__OVERLAYS = [
    ['openThemeSheet .kt-sheet', 'settings', () => openThemeSheet(), sheet('themeSheetOverlay'), () => closeThemeSheet(), '--fp-sheet-b', 8],
    ['_ktConfirm .kt-close-sheet-inner', 'settings', () => _ktConfirm({ title: 'Sure?', onConfirm() {} }),
      () => document.querySelector('.kt-close-sheet .kt-close-sheet-inner'), () => document.querySelector('.kt-close-sheet').remove(), '--fp-sheet-b', 8],
    ['openRoutineArchiveModal .ex-modal-sheet', 'settings', () => openRoutineArchiveModal(),
      () => document.querySelector('#routine-archive-modal .ex-modal-sheet'), () => closeRoutineArchiveModal(), '--fp-sheet-b', 8],
    ['openStorageSheet inline .kt-sheet', 'settings', () => openStorageSheet(), sheet('fpStoreOverlay'), () => closeStorageSheet(), '--fp-sheet-b', 8],
    ['openHealthSettings inline .kt-sheet', 'settings', () => openHealthSettings(), sheet('healthSheetOverlay'), () => closeHealthSettings(), '--fp-sheet-b', 8],
    ['openNativeChatSheet inline .kt-sheet', 'settings', () => openNativeChatSheet(), sheet('fpChatOverlay'), () => closeNativeChatSheet(), '--fp-sheet-b', 8],
    ['openRunnerExEdit root', 'log', runner, () => edit() && edit().firstElementChild, () => closeRunnerExEdit(), '--fp-safe-b', 28],
    ['the Edit sheet\\'s superset picker root', 'log', async () => { await runner(); runnerExEditPickSS(); },
      () => edit() && edit().firstElementChild, () => closeRunnerExEdit(), '--fp-safe-b', 28],
    ['the runner\\'s exercise picker #runner-ex-picker-list', 'log', async () => { await runner(); _openRunnerExPicker(); },
      () => document.getElementById('runner-ex-picker-list'), () => closeRunnerExEdit(), '--fp-safe-b', 16],
    ['openCFMovePicker #cfPickerList', 'settings', () => openCFMovePicker(), () => document.getElementById('cfPickerList'), () => closeCFMovePicker(), '--fp-sheet-b', 0],
  ];
  // The paddings that are not the rule's: the picker's header (its first root) and openCFMovePicker's own sheet.
  window.__OWN = () => ({ pickHead: (() => { const s = edit(); return s && s.children.length === 2 ? __cs(s.firstElementChild, 'paddingBottom') : null; })(),
    cfSheet: __cs(document.querySelector('#cfPickerOverlay > .kt-sheet'), 'paddingBottom') });
})();`;
const pageBoot = (shell, extra) => {
  const o = Object.assign({ native: true, shell, seed: SEED }, extra || {});
  o.init = HELP + (o.init || '');
  return boot(o);
};

// ── The fallback ─────────────────────────────────────────────────────────────────────────────────────────────────────
// The head script's first frame: when #tabs is parsed the main script has not run, so what the page shows there is the
// head's work (class, variables, and the CSS reading them).
const FIRST = '(function () { window.__ff = null; new MutationObserver(function (ms) { ms.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) {'
  + ' if (n.id === "tabs" && !window.__ff) { var r = document.documentElement; window.__ff = { cls: r.classList.contains("fp-tabs"),'
  + ' up: r.style.getPropertyValue("--fp-bar-up"), h: r.style.getPropertyValue("--fp-bar-h"),'
  + ' pb: getComputedStyle(document.getElementById("screen")).paddingBottom, main: "_fp" in window }; } }); }); })'
  + '.observe(document, { childList: true, subtree: true }); })();';

serial('the fallback is the glass bar\'s 83 (delta 14.1): a flag predicting h 0 and safe 0 gives --fp-bar-up and _fp.tabs.up 83 from the head\'s first frame on, the page 83 + 24 clear (P2 gave 49 + safe); a measured 0 keeps the last height, a measured h replaces it, at every zoom', async () => {
  const app = await pageBoot(FLAG('tabs', { h: 0, safe: 0 }), { init: FIRST });
  try {
    await ready(app);
    await app.page.waitForTimeout(80);
    const ff = await ev(app, () => window.__ff);
    assert(ff && ff.cls && ff.up === '83px' && ff.h === '0px' && ff.pb === '107px' && ff.main === false,
      'the head script set the class and --fp-bar-up 83 before #tabs was in, and #screen read it (107 = 83 + 24): ' + J(ff));
    const o = await ev(app, async () => {
      const VARS = ['--fp-bar-h', '--fp-safe-b', '--fp-sheet-b', '--fp-clear', '--fp-bar-up'];
      const read = () => ({ vars: VARS.map((k) => document.documentElement.style.getPropertyValue(k).trim()), up: _fp.tabs.up,
        pb: __cs(document.getElementById('screen'), 'paddingBottom') });
      const r = { boot: read() };
      await __fpShell.bar(0, 0); await __w(20); r.zero = read();
      applyDynamicType(1.25); await __w(20); r.zoomed = read();
      applyDynamicType(1); await __w(20);
      await __fpShell.bar(90, 0); await __w(20); r.measured = read();
      await __fpShell.bar(0, 0); await __w(20); r.hidden = read();
      return r;
    });
    assert(J(o.boot.vars) === J(['0px', '0px', '16px', '0px', '83px']) && o.boot.up === 83 && o.boot.pb === 107,
      'after hello: --fp-bar-up and _fp.tabs.up 83, --fp-sheet-b 16, the scroll end 83 + 24: ' + J(o.boot));
    assert(J(o.zero.vars) === J(o.boot.vars) && o.zero.up === 83 && o.zero.pb === 107, 'a measured h 0 keeps 83: ' + J(o.zero));
    assert(o.zoomed.vars[4] === '66.4px' && o.zoomed.up === 83 && near(o.zoomed.pb, 66.4 + 24), 'at zoom 1.25 the fallback is 83 / z: ' + J(o.zoomed));
    assert(o.measured.vars[4] === '90px' && o.measured.up === 90 && o.measured.pb === 114, 'a measured h above 0 replaces it: ' + J(o.measured));
    assert(o.hidden.vars[0] === '0px' && o.hidden.vars[4] === '90px' && o.hidden.up === 90 && o.hidden.pb === 114,
      'hidden again (h 0), the last shown height stays: ' + J(o.hidden));
  } finally { await app.close(); }
});

// ── The page under the bar ───────────────────────────────────────────────────────────────────────────────────────────
// Per room and zoom: the computed clearances against the variable, and the boxes on screen (viewport px) against the
// bar's top, innerHeight - 83 at every zoom (the native bar does not grow with the page's zoom).
async function clearances(app, web) {
  return ev(app, async (web) => {
    const rows = [];
    const sc = document.getElementById('screen'), toast = document.getElementById('toast');
    for (const room of ['heavyweight', 'dark']) {
      applyTheme(room);
      switchTab('log'); await __w(60);
      for (const z of [1, 1.12, 1.25]) {
        applyDynamicType(z); await __w(30);
        // Log's last content, the page scrolled to its end (read in the same task as the scroll)
        __fin(); sc.scrollTop = sc.scrollHeight;
        let end = 0;
        sc.querySelectorAll('*').forEach((e) => { const b = e.getBoundingClientRect(); if (b.height > 1 && b.width > 1) end = Math.max(end, b.bottom); });
        const atEnd = sc.scrollTop >= sc.scrollHeight - sc.clientHeight - 1;
        sc.scrollTop = 0;
        showToast('Saved'); await __w(20); __fin();
        const row = { room, z, ih: innerHeight, up: __v('--fp-bar-up'), screen: __cs(sc, 'paddingBottom'), end, atEnd, toast: __cs(toast, 'bottom'), toastR: __R(toast) };
        // over a .kt-sheet-overlay the sheet-open rule still wins: the toast at the top
        openThemeSheet(); await __w(100); showToast('Saved'); await __w(20); __fin(); row.toastSheet = __R(toast);
        closeThemeSheet(); await __w(100);
        openDeckRunner('Push'); await __w(60); __fin();
        const root = document.getElementById('runner-root'), seal = document.getElementById('runner-seal');
        const card = document.querySelector('.kt-r-card:not(.peek1):not(.peek2)'), foot = card && card.querySelector('.kt-r-card-foot');
        Object.assign(row, { root: __cs(root, 'bottom'), seal: __cs(seal, 'height'), rootR: __R(root), sealR: __R(seal), strip: __R(document.querySelector('.kt-r-strip')),
          cardOverflow: card ? card.scrollHeight - card.clientHeight : null,
          footClipped: card && foot ? foot.getBoundingClientRect().bottom - card.getBoundingClientRect().bottom : null });
        closeDeckRunner(); await __w(20);
        if (web) {
          switchTab('coach'); coachView = 'chat'; render(); await __w(120);
          const html = document.documentElement, col = () => __cs(sc, 'paddingBottom');
          row.chat = { cls: html.classList.contains('kt-chat'), col: col(), row: __R(document.querySelector('.coach-input-row')) };
          // the chat's toast rule still wins: 8 under the header
          showToast('Coach model: Haiku 4.5'); await __w(20); __fin();
          row.chat.toast = __R(toast); row.chat.head = __R(document.querySelector('.coach-chat-stick')).bottom;
          html.classList.add('chat-typing'); row.chat.typing = col(); html.classList.add('kb-open'); row.chat.kbTyping = col();
          html.classList.remove('chat-typing'); row.chat.kb = col(); html.classList.remove('kb-open');
          switchTab('log'); await __w(40);
        }
        rows.push(row);
      }
    }
    applyDynamicType(1);
    return rows;
  }, web);
}

serial('every in-flow clearance is --fp-bar-up plus classic\'s gap (scroll end + 24, toast + 8 or Heavyweight\'s + 14, the web chat\'s column + 8, chat-typing too, 8 with the keys up; the runner\'s root and seal at the bar), never env(), zoom 1, 1.12 and 1.25, both rooms, 390 x 844 (83/34) and 375 x 667 (83/0), tabs and tabsWeb; on screen the runner ends at the bar\'s top, its strip clear, its card whole, the composer, the toast and Log\'s content their gap above it (specs 37 and 39 twins), the toast at the top over a sheet and under the chat\'s header', async () => {
  for (const shell of ['tabs', 'tabsWeb']) {
    for (const ph of PHONES) {
      const tag = shell + ' ' + ph.size.width + 'x' + ph.size.height + ' ';
      const app = await pageBoot(FLAG(shell, { h: ph.h, safe: ph.safe }), { page: { viewport: ph.size } });
      try {
        await ready(app);
        await (await insets(app))(83);   // env() as WebKit has it while the bar shows: nothing below may read it
        const rows = await clearances(app, shell === 'tabsWeb');
        assert(rows.length === 6, tag + 'two rooms, three zooms: ' + rows.length);
        for (const r of rows) {
          const t = tag + r.room + ' zoom ' + r.z + ': ', gap = r.room === 'heavyweight' ? 14 : 8, top = r.ih - ph.h;
          assert(near(r.up, r2(ph.h / r.z), 0.001), t + '--fp-bar-up is h / z: ' + r.up);
          assert(near(r.screen, r.up + 24), t + '#screen\'s scroll end is --fp-bar-up + 24: ' + J([r.screen, r.up]));
          assert(near(r.toast, r.up + gap), t + 'the toast sits --fp-bar-up + ' + gap + ': ' + J([r.toast, r.up]));
          assert(near(r.root, r.up) && near(r.seal, r.up), t + 'the runner\'s root and seal are --fp-bar-up: ' + J([r.root, r.seal, r.up]));
          assert(near(r.rootR.bottom, top, 0.5) && near(r.sealR.top, top, 0.5) && near(r.sealR.bottom, r.ih, 0.5),
            t + 'on screen the runner ends at the bar\'s top and the seal fills under it: ' + J([r.rootR, r.sealR, top]));
          assert(r.strip && r.strip.bottom <= r.rootR.bottom - 8 * r.z, t + 'the runner\'s strip clears the bar by its 14: ' + J([r.strip, r.rootR]));
          if (r.z === 1) assert(r.cardOverflow === 0 && r.footClipped !== null && r.footClipped <= 0, t + 'the card is whole: ' + J([r.cardOverflow, r.footClipped]));
          assert(near(r.toastR.bottom, top - gap * r.z, 0.6), t + 'a shown toast sits ' + gap + ' above the bar: ' + J([r.toastR, top]));
          assert(r.atEnd && r.end > 0 && r.end <= top - 24 * r.z + 0.5, t + 'Log\'s content ends 24 above the bar: ' + J([r.atEnd, r.end, top]));
          assert(near(r.toastSheet.top, 24 * r.z, 0.6), t + 'over a sheet the toast shows at the top: ' + J(r.toastSheet));
          if (shell === 'tabsWeb') {
            const c = r.chat;
            assert(c.cls && near(c.col, r.up + 8) && near(c.typing, r.up + 8), t + 'the web chat\'s column is --fp-bar-up + 8, chat-typing too: ' + J(c));
            assert(c.kbTyping === 8 && c.kb === 8, t + 'with the keys up the column keeps classic\'s 8: ' + J(c));
            assert(near(c.row.bottom, top - 8 * r.z, 0.6), t + 'the composer ends 8 above the bar: ' + J([c.row, top]));
            assert(near(c.toast.top, c.head + 8 * r.z, 1.5) && c.toast.bottom < c.row.top, t + 'in the chat the toast shows 8 under the header: ' + J([c.toast, c.head]));
          }
        }
      } finally { await app.close(); }
    }
  }
});

// ── I7: hiding the bar re-lays out nothing ───────────────────────────────────────────────────────────────────────────
serial('I7: hiding the bar re-lays out nothing: on every tab innerHeight, #screen\'s scroll height and padding and #app stay put across a tabs.bar of h 0 and back and a sheet\'s own answer (h 0) and its close, env() following the bar as WebKit\'s does; the runner across its open, a hidden bar and its close, the seal --fp-bar-up (not --fp-clear) while hidden; #tabs out of the accessibility tree, no tablist (spec 40\'s twin); tabs and tabsWeb', async () => {
  for (const shell of ['tabs', 'tabsWeb']) {
    const app = await pageBoot(shell);
    try {
      await ready(app);
      await (await insets(app))(83);
      const ihs = [];
      for (const tab of ['log', 'progress', 'coach', 'settings']) {
        const t = shell + ' ' + tab + ': ';
        const o = await ev(app, async (tab) => {
          const sc = document.getElementById('screen');
          const snap = () => ({ ih: innerHeight, sh: sc.scrollHeight, pb: __cs(sc, 'paddingBottom'), app: __R(document.getElementById('app')) });
          const bar = () => ({ h: __v('--fp-bar-h'), up: __v('--fp-bar-up'), clear: __v('--fp-clear') });
          switchTab(tab); await __w(80);
          const r = { s0: snap() };
          await __fpShell.bar(0, 34); await __env(34); await __w(20); r.hidden = snap(); r.hiddenBar = bar();
          await __fpShell.bar(83, 34); await __env(83); await __w(20); r.shown = snap();
          openThemeSheet(); await __w(120); r.sheetH = _fp.tabs.bar.h; r.coach = __fpShell.state().scene.coach;
          if (r.sheetH === 0) await __env(34);
          await __w(20); r.sheet = snap(); r.sheetBar = bar();
          closeThemeSheet(); await __w(120); await __env(83); await __w(20); r.closed = snap(); r.closedBar = bar();
          r.tabs = { display: getComputedStyle(document.getElementById('tabs')).display, tablists: document.querySelectorAll('[role="tablist"]').length };
          if (tab === 'log') {
            const root = document.getElementById('runner-root'), seal = document.getElementById('runner-seal');
            const rs = () => { __fin(); return { s: snap(), root: __R(root), seal: __R(seal), sealH: __cs(seal, 'height') }; };
            openDeckRunner('Push'); await __w(80); r.run0 = rs();
            await __fpShell.bar(0, 34); await __env(34); await __w(20); r.runHidden = rs(); r.runHiddenBar = bar();
            await __fpShell.bar(83, 34); await __env(83); await __w(20); r.runShown = rs();
            closeDeckRunner(); await __w(40); r.runClosed = snap();
          }
          return r;
        }, tab);
        const S = J(o.s0);
        ihs.push(o.s0.ih);
        for (const k of ['hidden', 'shown', 'sheet', 'closed']) assert(J(o[k]) === S, t + k + ': innerHeight, #screen and #app unchanged: ' + J([o.s0, o[k]]));
        assert(o.hiddenBar.h === 0 && o.hiddenBar.up === 83 && o.hiddenBar.clear === 34, t + 'tabs.bar h 0: --fp-bar-h 0, --fp-bar-up 83: ' + J(o.hiddenBar));
        // contract 3.4: a sheet hides the bar over a web tab or a WEB Coach tab; over a NATIVE or WAITING one it stays
        const hides = tab !== 'coach' || o.coach === 'web';
        assert(o.sheetBar.up === 83 && o.sheetH === (hides ? 0 : 83) && o.sheetBar.h === o.sheetH,
          t + 'the sheet\'s own answer (h ' + (hides ? 0 : 83) + '), --fp-bar-up kept: ' + J([o.sheetH, o.sheetBar, o.coach]));
        assert(o.closedBar.h === 83 && o.closedBar.up === 83, t + 'closed, the bar is back: ' + J(o.closedBar));
        assert(o.tabs.display === 'none' && o.tabs.tablists === 0, t + '#tabs is not displayed and no tablist is left: ' + J(o.tabs));
        // under no shell the tree holds the bar as a navigation landmark with the four buttons in a row
        const ax = await app.page.locator('body').ariaSnapshot();
        assert(!/^\s*- (navigation|tablist)\b/m.test(ax) && !/button "Log":?\n\s*- button "Progress"/.test(ax),
          t + 'the page\'s own bar is out of the accessibility tree: ' + ax.split('\n').filter((l) => /navigation|tablist|button "(Log|Progress)"/.test(l)).join(' | '));
        if (tab === 'log') {
          assert(J(o.run0.s) === S && J(o.runHidden.s) === S && J(o.runShown.s) === S && J(o.runClosed) === S, t + 'the runner open, the bar hidden under it and the runner closed move nothing: ' + J([o.run0.s, o.runHidden.s, o.runClosed]));
          assert(J(o.runHidden.root) === J(o.run0.root) && J(o.runShown.root) === J(o.run0.root) && J(o.runHidden.seal) === J(o.run0.seal),
            t + 'the runner and its seal stay put while the bar hides: ' + J([o.run0.root, o.runHidden.root, o.run0.seal, o.runHidden.seal]));
          assert(o.runHidden.sealH === 83 && o.runHiddenBar.clear === 34 && o.runHiddenBar.h === 0, t + 'the seal is --fp-bar-up (83), not --fp-clear (34): ' + J([o.runHidden.sealH, o.runHiddenBar]));
        }
      }
      assert(ihs.length === 4 && ihs.every((h) => h === 844), shell + ': innerHeight is the screen\'s on every tab: ' + J(ihs));
    } finally { await app.close(); }
  }
});

// ── Overlays pad from the shell's numbers ────────────────────────────────────────────────────────────────────────────
serial('overlays pad from --fp-sheet-b and --fp-safe-b, never env() (P-D14): each of the ten paddings at zoom 1, 1.12 and 1.25, for 83/34 (tabs, 390 x 844) and 83/0 (tabsWeb, 375 x 667), in both rooms, the same in the hold (env() the bar\'s 83), after the sheet\'s own answer (env() the window\'s inset, late) and across a tabs.bar of h 0 and back; the exercise picker\'s header and openCFMovePicker\'s own sheet keep their paddings', async () => {
  for (const [shell, ph] of [['tabs', PHONES[0]], ['tabsWeb', PHONES[1]]]) {
    const tag = shell + ' ' + ph.h + '/' + ph.safe + ' ';
    const app = await pageBoot(FLAG(shell, { h: ph.h, safe: ph.safe }), { page: { viewport: ph.size }, init: STORE_PLUGIN });
    try {
      await ready(app);
      await insets(app);
      const out = await ev(app, async (safe) => {
        const rows = [];
        for (const room of ['heavyweight', 'dark']) {
          applyTheme(room);
          for (const [name, tab, open, el, close, v, add] of __OVERLAYS) {
            if (currentTab !== tab) { switchTab(tab); await __w(40); }
            await __env(83);   // WebKit's while the bar shows
            await open(); await __w(0);   // the announcer's sync is a microtask after the observer's: the hold is on now
            const pb = () => __cs(el(), 'paddingBottom');
            const r = { room, name, v, add, opened: !!el(), held: !!(el() && el().closest('.fp-hold')), hold: pb() };
            await __w(100);
            r.answer = pb(); r.barH = _fp.tabs.bar.h; r.own = __OWN();
            await __env(safe); await __w(10); r.late = pb();   // the hidden bar's inset reaches WebKit after the answer
            r.zooms = [];
            for (const z of [1.12, 1.25, 1]) { applyDynamicType(z); await __w(10); r.zooms.push({ z, pb: pb(), v: __v(v) }); }
            await __fpShell.bar(0, safe); await __w(20); r.hidden = pb(); r.hiddenH = __v('--fp-bar-h');
            await __fpShell.bar(83, safe); await __w(20); r.back = pb();
            close(); await __w(60);
            rows.push(r);
          }
        }
        if (runnerOpen) closeDeckRunner();
        return rows;
      }, ph.safe);
      assert(out.length === 20, tag + 'ten overlays in two rooms: ' + out.length);
      const want1 = (r) => (r.v === '--fp-sheet-b' ? Math.max(ph.safe, 16) : ph.safe) + r.add;
      for (const r of out) {
        const t = tag + r.room + ' ' + r.name + ': ';
        assert(r.opened, t + 'it opened');
        assert(r.held && r.barH === 0, t + 'it was announced and held, and the answer hid the bar: ' + J([r.held, r.barH]));
        assert(r.hold === want1(r) && r.answer === want1(r) && r.late === want1(r) && r.hidden === want1(r) && r.back === want1(r) && r.hiddenH === 0,
          t + 'the padding is ' + r.v + ' + ' + r.add + ' in the hold, after the answer, as env() moves, across a hidden bar: ' + J(r));
        for (const zz of r.zooms) {
          const v = r2((r.v === '--fp-sheet-b' ? Math.max(ph.safe, 16) : ph.safe) / zz.z);
          assert(near(zz.v, v, 0.001) && near(zz.pb, zz.v + r.add), t + 'at zoom ' + zz.z + ' ' + r.v + ' + ' + r.add + ': ' + J(zz));
        }
        if (/exercise picker/.test(r.name)) assert(r.own.pickHead === 12, t + 'the picker\'s header keeps its own 12: ' + J(r.own));
        if (/CFMove/.test(r.name)) assert(r.own.cfSheet === 0, t + 'its own sheet keeps its inline 0 (its list pads): ' + J(r.own));
      }
    } finally { await app.close(); }
  }
});

// Each place the page reads env(safe-area-inset-bottom) (comments aside) is one of the ten the block replaces: a CSS
// rule by its selector, an inline padding by the function that builds it. A new one fails here by its place until it
// has its line in the NATIVE TAB BAR block and its row in __OVERLAYS (contract 7.4: a new overlay follows the rule).
const ENV_READERS = ['css .ex-modal-sheet', 'css .kt-close-sheet-inner', 'css .kt-sheet', 'js _buildRunnerSSPickerHTML',
  'js _buildRunnerExEditHTML', 'js _buildRunnerExPickerHTML', 'js openStorageSheet', 'js openHealthSettings', 'js openCFMovePicker',
  'js openNativeChatSheet'];
serial('every env(safe-area-inset-bottom) the page reads is one of the ten paddings the NATIVE TAB BAR block replaces (a new reader fails here by its place)', async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  // CSS comments out of the <style> blocks (blanked, so offsets and lines stay), whole-line // comments out of the rest
  const noCss = src.replace(/<style[^>]*>[\s\S]*?<\/style>/g, (b) => b.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')));
  const text = noCss.split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n');
  const styles = [];
  text.replace(/<style[^>]*>[\s\S]*?<\/style>/g, (b, at) => { styles.push([at, at + b.length]); return b; });
  const found = [];
  const re = /safe-area-inset-bottom/g;
  let m;
  while ((m = re.exec(text))) {
    const at = m.index, line = text.slice(0, at).split('\n').length;
    if (styles.some(([a, b]) => at > a && at < b)) {
      const open = text.lastIndexOf('{', at), close = text.lastIndexOf('}', open);
      found.push(['css ' + text.slice(close + 1, open).trim().split(/\s*,\s*/).pop(), line]);
    } else {
      const f = [...text.slice(0, at).matchAll(/function\s+([A-Za-z0-9_$]+)\s*\(/g)].pop();
      found.push(['js ' + (f ? f[1] : '?'), line]);
    }
  }
  const got = found.map((x) => x[0]).sort(), want = ENV_READERS.slice().sort();
  assert(J(got) === J(want), 'the page reads env(safe-area-inset-bottom) at exactly the ten places (new or gone: '
    + J(found.filter((x) => want.indexOf(x[0]) < 0).concat(want.filter((w) => got.indexOf(w) < 0).map((w) => [w, 'gone']))) + '): ' + J(found));
});

// ── Typing in the web chat ───────────────────────────────────────────────────────────────────────────────────────────
serial('a hardware keyboard (spec 58\'s twin, tabsWeb): chat-typing without kb-open leaves the composer 8 above the native bar, which never slides away, and the conversation as tall; the blur changes nothing either, in both rooms', async () => {
  const app = await pageBoot('tabsWeb');
  try {
    await ready(app);
    const out = await ev(app, async () => {
      const rows = [];
      for (const room of ['heavyweight', 'dark']) {
        applyTheme(room);
        switchTab('coach'); coachView = 'chat'; render(); await __w(160);
        const html = document.documentElement;
        const read = () => ({ typing: html.classList.contains('chat-typing'), kb: html.classList.contains('kb-open'),
          rowGap: innerHeight - document.querySelector('.coach-input-row').getBoundingClientRect().bottom,
          msgsH: document.querySelector('.coach-msgs-area').getBoundingClientRect().height, pb: __cs(document.getElementById('screen'), 'paddingBottom') });
        const r = { room, idle: read() };
        document.getElementById('coach-input').focus(); await __w(260);
        r.typing = read();
        document.getElementById('coach-input').blur(); await __w(320);
        r.after = read();
        switchTab('log'); await __w(40);
        rows.push(r);
      }
      return rows;
    });
    for (const r of out) {
      const t = r.room + ': ';
      assert(!r.idle.typing && near(r.idle.rowGap, 91, 0.6) && r.idle.pb === 91, t + 'idle, the composer ends 8 above the 83 bar: ' + J(r.idle));
      assert(r.typing.typing && !r.typing.kb, t + 'a focus with a hardware keyboard is chat-typing, never kb-open: ' + J(r.typing));
      assert(near(r.typing.rowGap, 91, 0.6) && r.typing.pb === 91 && near(r.typing.msgsH, r.idle.msgsH, 0.6), t + 'the composer stays 8 above the bar and the conversation as tall: ' + J([r.idle, r.typing]));
      assert(!r.after.typing && near(r.after.rowGap, 91, 0.6) && near(r.after.msgsH, r.idle.msgsH, 0.6), t + 'after the blur nothing moved: ' + J(r.after));
    }
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// A scriptable visualViewport standing in for WebKit's (iOS keeps the layout viewport and pans the visual one over it).
const FAKE_VV = `(() => {
  const et = new EventTarget();
  const st = { h: innerHeight, top: 0, scale: 1 };
  const fake = {
    get width(){ return innerWidth; }, get height(){ return st.h; }, get offsetTop(){ return st.top; }, get offsetLeft(){ return 0; },
    get pageTop(){ return st.top; }, get pageLeft(){ return 0; }, get scale(){ return st.scale; },
    addEventListener: et.addEventListener.bind(et), removeEventListener: et.removeEventListener.bind(et), dispatchEvent: et.dispatchEvent.bind(et),
  };
  Object.defineProperty(window, 'visualViewport', { configurable: true, get(){ return fake; } });
  window.__vv = {
    set(h, top){ st.h = h; st.top = top; st.scale = 1; et.dispatchEvent(new Event('resize')); et.dispatchEvent(new Event('scroll')); },
    reset(){ st.h = innerHeight; st.top = 0; st.scale = 1; et.dispatchEvent(new Event('resize')); et.dispatchEvent(new Event('scroll')); },
  };
})();`;

serial('the keys up (spec 117 M2\'s twin, tabsWeb on a touch screen): the column keeps classic\'s 8 above the keys, #app over the visual viewport; with the keys down the composer is back 8 above the bar, in both rooms', async () => {
  const app = await pageBoot('tabsWeb', { page: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, init: FAKE_VV });
  try {
    await ready(app);
    const out = await ev(app, async () => {
      const KB = 336, rows = [];
      for (const room of ['heavyweight', 'dark']) {
        applyTheme(room);
        switchTab('coach'); coachView = 'chat'; render(); await __w(160);
        const html = document.documentElement;
        const read = () => ({ cls: ['chat-typing', 'kb-open'].filter((c) => html.classList.contains(c)), pos: getComputedStyle(document.getElementById('app')).position,
          app: __R(document.getElementById('app')), row: __R(document.querySelector('.coach-input-row')), pb: __cs(document.getElementById('screen'), 'paddingBottom'),
          vv: { h: visualViewport.height, top: visualViewport.offsetTop } });
        const r = { room };
        // the binding answers the visual viewport on a frame: wait for its class, then a frame or two more
        document.getElementById('coach-input').focus(); await __w(60);
        __vv.set(innerHeight - KB, KB); await __until(() => html.classList.contains('kb-open')); await __w(60);
        r.up = read();
        __vv.reset(); await __until(() => !html.classList.contains('kb-open'));
        document.getElementById('coach-input').blur(); await __until(() => !html.classList.contains('chat-typing')); await __w(60);
        r.down = read();
        switchTab('log'); await __w(40);
        rows.push(r);
      }
      return rows;
    });
    for (const r of out) {
      const t = r.room + ': ', U = r.up, D = r.down;
      assert(U.cls.indexOf('kb-open') >= 0 && U.pos === 'fixed' && near(U.app.top, U.vv.top, 1) && near(U.app.h, U.vv.h, 1), t + 'kb-open lays #app over the visual viewport: ' + J(U));
      assert(U.pb === 8 && near(U.row.bottom, U.vv.top + U.vv.h - 8, 1), t + 'the column keeps classic\'s 8 and the composer sits 8 above the keys: ' + J(U));
      assert(D.cls.length === 0 && D.pos === 'relative' && D.pb === 91 && near(D.row.bottom, 844 - 91, 0.6), t + 'keys down, the composer is 8 above the bar again: ' + J(D));
    }
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// ── The share intake ─────────────────────────────────────────────────────────────────────────────────────────────────
serial('a shared photo under tabsWeb (spec 106 R22\'s twin) lands on Coach through one selectTab {tab:\'coach\'}: the day sheet closed, COMPARE left, the chat with the photo, the Coach tab lit in the hidden #tabs', async () => {
  const app = await pageBoot('tabsWeb');
  try {
    await ready(app);
    const out = await ev(app, async () => {
      const D = addDays(todayISO(), -3);
      lsSet('kt_runs', getRuns().concat([{ id: 2201, date: D, distance: 5, time: '25:00', type: 'easy', note: '' }]));
      const st = () => ({ sheet: !!document.getElementById('calDayOverlay'), tab: currentTab, view: coachView, sel: calSelectedDate, cmpOn,
        lit: [...document.querySelectorAll('.tab.active')].map((t) => t.getAttribute('data-tab')).join(), img: !!pendingImage });
      const openDay = async () => { switchTab('progress'); progressTab = 'lifts'; _calNavToDate(D); calSelectedDate = null; render(); await __w(30);
        document.querySelector('.cal-day[data-date="' + D + '"]').click(); await __w(60); };
      // back in the foreground with a photo waiting: the shell's share hand-off
      const share = async () => {
        const n = __fpShell.of('selectTab').length;
        Capacitor.Plugins.TrovoShare.getPendingShare = () => { Capacitor.Plugins.TrovoShare.getPendingShare = () => Promise.resolve({}); return Promise.resolve({ imageBase64: 'iVBORw0KGgo=' }); };
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange'));
        await __w(900);
        return __fpShell.of('selectTab').slice(n);
      };
      const r = {};
      await openDay(); r.opened = st();
      r.calls = await share(); r.shared = st();
      pendingImage = null;
      switchTab('progress'); render(); await __w(30);
      document.getElementById('cmp-btn').click(); await __w(30);
      r.cmp = st();
      r.cmpCalls = await share(); r.cmpShared = st();
      return r;
    });
    assert(out.opened.sheet && out.opened.lit === 'progress', 'the day sheet is open on Progress: ' + J(out.opened));
    assert(out.calls.length === 1 && out.calls[0].tab === 'coach', 'one selectTab {tab:\'coach\'} (its intent is P4\'s): ' + J(out.calls));
    assert(!out.shared.sheet && out.shared.sel === null && out.shared.tab === 'coach' && out.shared.view === 'chat' && out.shared.lit === 'coach' && out.shared.img,
      'the photo lands in the Coach chat, the sheet closed, the Coach tab lit in the hidden #tabs: ' + J(out.shared));
    assert(out.cmp.cmpOn && out.cmpCalls.length === 1 && out.cmpCalls[0].tab === 'coach' && !out.cmpShared.cmpOn && out.cmpShared.tab === 'coach' && out.cmpShared.lit === 'coach',
      'COMPARE is left the same way: ' + J([out.cmp, out.cmpCalls, out.cmpShared]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// ── Classic stays classic ────────────────────────────────────────────────────────────────────────────────────────────
const OPEN = '/* NATIVE TAB BAR (tabs mode) */', CLOSE = '/* END NATIVE TAB BAR */';
function strip(src) {
  const a = src.indexOf(OPEN), b = src.indexOf(CLOSE);
  if (a < 0 || b < a || src.indexOf(OPEN, a + 1) >= 0 || src.indexOf(CLOSE, b + 1) >= 0) throw new Error('the NATIVE TAB BAR block\'s markers are not one pair');
  return src.slice(0, a) + src.slice(b + CLOSE.length);
}
// Everything classic shows that the block could reach: values, and boxes in viewport px.
async function classic(app) {
  return ev(app, async () => {
    const out = {};
    const sc = document.getElementById('screen'), tabs = document.getElementById('tabs'), toast = document.getElementById('toast');
    for (const room of ['heavyweight', 'dark']) {
      applyTheme(room);
      switchTab('log'); await __w(60); __fin();
      const o = { screen: __cs(sc, 'paddingBottom'), screenR: __R(sc), tabsDisplay: getComputedStyle(tabs).display, tabsR: __R(tabs), toast: __cs(toast, 'bottom') };
      showToast('Saved'); await __w(20); __fin(); o.toastR = __R(toast);
      openDeckRunner('Push'); await __w(60); __fin();
      const root = document.getElementById('runner-root'), seal = document.getElementById('runner-seal');
      Object.assign(o, { root: __cs(root, 'bottom'), seal: __cs(seal, 'height'), rootR: __R(root), sealR: __R(seal), stripR: __R(document.querySelector('.kt-r-strip')) });
      closeDeckRunner(); await __w(20);
      switchTab('coach'); coachView = 'chat'; render(); await __w(120); __fin();
      const html = document.documentElement;
      o.chat = html.classList.contains('kt-chat') ? { col: __cs(sc, 'paddingBottom'), colR: __R(sc), row: __R(document.querySelector('.coach-input-row')),
        msgs: __R(document.querySelector('.coach-msgs-area')) } : null;
      if (o.chat) {
        html.classList.add('chat-typing'); o.chat.typing = __cs(sc, 'paddingBottom');
        html.classList.add('kb-open'); o.chat.kb = __cs(sc, 'paddingBottom'); html.classList.remove('chat-typing', 'kb-open');
      }
      switchTab('settings'); await __w(40);
      openThemeSheet(); await __w(60); __fin();
      const sh = document.querySelector('#themeSheetOverlay .kt-sheet');
      o.sheetR = __R(sh); o.sheet = __cs(sh, 'paddingBottom'); closeThemeSheet(); await __w(30);
      o.pads = {};
      for (const [name, tab, open, el, close] of __OVERLAYS) {
        if (currentTab !== tab) { switchTab(tab); await __w(40); }
        await open(); await __w(30);
        o.pads[name] = el() ? __cs(el(), 'paddingBottom') : null;
        if (/exercise picker/.test(name)) o.pads.pickHead = __OWN().pickHead;
        if (/CFMove/.test(name)) o.pads.cfSheet = __OWN().cfSheet;
        close(); await __w(30);
      }
      if (runnerOpen) closeDeckRunner();
      out[room] = o;
    }
    return out;
  });
}

serial('classic (none, coach61): the values classic computes today (scroll end 110, toast 94 / 92, runner 86, the chat\'s column 94 / 86, 22 typing, 8 with the keys up, the ten paddings 24, 28, 16, 16), #tabs shown, and every box equal to the same page\'s with its NATIVE TAB BAR block cut out', async () => {
  for (const shell of ['none', 'coach61']) {
    const o = { init: STORE_PLUGIN };
    const app = await pageBoot(shell, o);
    let a, b;
    try {
      await ready(app, shell !== 'none');
      a = await classic(app);
    } finally { await app.close(); }
    const app2 = await pageBoot(shell, Object.assign({ html: strip }, o));
    try {
      await ready(app2, shell !== 'none');
      b = await classic(app2);
    } finally { await app2.close(); }
    assert(J(a) === J(b), shell + ': every value and box equals the page\'s with the block cut out: ' + J(a).slice(0, 600) + ' vs ' + J(b).slice(0, 600));
    for (const room of ['heavyweight', 'dark']) {
      const t = shell + ' ' + room + ': ', c = a[room], hw = room === 'heavyweight';
      assert(c.screen === 110 && c.toast === (hw ? 92 : 94) && c.root === 86 && c.seal === 86 && c.tabsDisplay === 'flex', t + 'classic\'s numbers and #tabs shown: ' + J(c));
      assert(shell === 'coach61' || (c.chat && c.chat.col === (hw ? 86 : 94) && c.chat.typing === 22 && c.chat.kb === 8), t + 'the chat\'s column: ' + J(c.chat));
      const P = c.pads, want = { 'openThemeSheet .kt-sheet': 24, '_ktConfirm .kt-close-sheet-inner': 24, 'openRoutineArchiveModal .ex-modal-sheet': 24,
        'openStorageSheet inline .kt-sheet': shell === 'none' ? null : 24, 'openHealthSettings inline .kt-sheet': 24,
        'openNativeChatSheet inline .kt-sheet': shell === 'none' ? null : 24, 'openRunnerExEdit root': 28, 'the Edit sheet\'s superset picker root': 28,
        'the runner\'s exercise picker #runner-ex-picker-list': 16, 'openCFMovePicker #cfPickerList': 16, pickHead: 12, cfSheet: 0 };
      assert(sorted(P) === sorted(want), t + 'the ten paddings as classic computes them (env() is 0 here): ' + J(P));
    }
  }
});
