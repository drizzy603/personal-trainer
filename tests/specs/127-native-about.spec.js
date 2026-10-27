// fp-spec: self-shelled
// 127: Settings > About under build 61's binary (plan task P10; contract 10.5, 3.5, 3.10, D39, D43, T-G9, T-G10).
// - Build 60's binary (inert, coach): no Native tab bar row; the chat's row, its sheet, Try again (coach alone) and the
//   switch's toast are byte for byte the page's before the tabs half (BASE_PAGE(), 91708ae) under the same status, and
//   neither #fp-chat-switch, #fp-chat-retry nor #fp-policy-check exists; BACKUP_KEYS, RAW_STRING_KEYS and
//   _FP_KEY_NAMES equal that page's (the tab bar's switch is the shell's: no kt_* key).
// - A 61 binary, states through window.__fpShellStatus: every Native tab bar line and pill (the OS, this iPhone's
//   switch by switches or off, the policy file, a crash, the breaker's two trips, the page build by off or by
//   fellBack's page and refused, the other fellBack words and needs root as "Back from the next launch"); the Native
//   Coach's lines for crash, policy, the breaker, page and needs (read through the piece needed); "Off: needs iOS 26
//   or later" offers no switch and no Try again, and its switch sends nothing; "Check the switches now" repaints both
//   rows and the open sheet from status {refresh: true}'s answer and says when and how the switches were last checked.
// - The real flows: the tab root's "On" twice (the bar, the Coach tab), 60's overlay under coach61, this iPhone's
//   Native Coach switch, a broken coachHome model, a present refused, the page's own way out ("the tab bar went away"),
//   "Starting..." before hello answers.
// - The stable ids, each once where contract 10.5 puts it; the tab bar's switch (one setSwitch from a click on
//   #fp-tabs-switch; the shell's fallback takes the page out of tabs mode; on again reads "Back from the next launch";
//   offered under coach61 too, where the policy file still holds); Try again (#fp-tabs-retry resets tabs,
//   #fp-chat-retry resets coachHome then coach); both 61 sheets list the shell-wide counters with "Tab changes outside
//   the funnel"; the tab bar's sheet pads as the chat's does in both modes; dev.nav settings/tabs-sheet opens it under
//   61 and nothing under 60; a 60 TrovoShell under a 61 flag (no setSwitch) shows no tab bar row.
// Every boot names its shell (the mark above): FP_SHELL_INERT runs skip this spec.
const { boot, assert, run, CANONICAL_61, SHELL_METHODS, BASE_PAGE } = require('../lib/harness');

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

// In the page, before its scripts: waits, text, the rows as they read, and a repaint of Settings from a status (the
// rows read it again through their own refresh: stale at once, then painted).
const HELP = `(() => {
  window.__w = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__until = async (f, ms) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < (ms || 5000)) await __w(16); return f(); };
  window.__txt = (sel) => { const el = typeof sel === 'string' ? document.querySelector(sel) : sel; return el ? el.innerText.replace(/\\s+/g, ' ').trim() : null; };
  window.__rows = () => ({ tabs: [__txt('#fp-tabs-sub'), __txt('#fp-tabs-pill')], coach: [__txt('#fp-chat-sub'), __txt('#fp-chat-pill')] });
  window.__again = async (st) => {
    if (st !== undefined) window.__fpShellStatus = st;
    const n = __fpShell.of('status').length;
    _fpChat.at = 0;
    if (currentTab !== 'settings') switchTab('settings'); else render();
    await __until(() => __fpShell.of('status').length > n && !_fpChat.busy);
    await __w(0);
  };
  window.__toast = () => { const t = document.getElementById('toast'); return t ? t.textContent : null; };
})();`;
const pageBoot = (shell, extra) => {
  const o = Object.assign({ native: true, shell }, extra || {});
  o.init = HELP + (o.init || '');
  return boot(o);
};
// Hello answered and the boot's own renders done.
const ready = (app) => app.page.waitForFunction(() => window._fp && _fp.hello, null, { timeout: 15000 }).then(() => app.page.waitForTimeout(80));

// Statuses as FPCore's ScreenStatus writes them (ShellStatus.swift): a piece, the counters, a 61 status.
const AT = Date.now() - 60000;
const count = (launch, total, last) => ({ launch, total, last: last || null });
const COUNTERS = { since: AT - 86400000, leftWindow: count(0, 0), hidden: count(0, 0), trips: count(0, 1, AT),
  markers: Object.assign(count(0, 1, AT), { found: [] }), strays: count(1, 3, AT), leftAny: count(0, 0) };
const piece = (o) => Object.assign({ on: true, live: false, off: null, trip: null, why: null, at: null, canReset: false }, o || {});
const OFF = (off, o) => piece(Object.assign({ on: false, off }, o || {}));
const ST61 = (o) => Object.assign({ v: 1, shell: '61', page: '20261012-2', verdicts: [], root: 'classic', fellBack: null,
  switches: { tabs: true }, policy: { at: null, result: null }, counters: COUNTERS,
  screens: { coach: piece(), coachHome: OFF('needs', { needs: ['tabs'] }), tabs: OFF('needs', { needs: ['root'] }) } }, o || {});
const withPieces = (o, screens) => { const s = ST61(o); Object.assign(s.screens, screens); return s; };
const FELL = (why) => ({ root: 'tabs', fellBack: { why, at: AT } });

// ── Build 60's binary ────────────────────────────────────────────────────────────────────────────────────────────
// Spec 118's C5 crash status, with a trip and the counters it lists.
const CRASH60 = { v: 1, shell: '60', page: 'P1', verdicts: [{ piece: 'coach', shell: '60', page: 'P1', why: 'crash marker', at: AT }],
  screens: { coach: { on: false, live: false, off: 'crash', trip: null, why: 'crash marker', at: AT, canReset: true } },
  counters: { since: AT - 86400000, leftWindow: count(0, 0), hidden: count(0, 2, AT), trips: count(0, 1, AT), markers: Object.assign(count(1, 1, AT), { found: ['presenting coach@P1 shell 60'] }) } };
// The About row and sheet under build 60's flag, the same steps on either page: the row, the sheet, Try again, the
// switch's toasts, and the key lists.
async function ABOUT60() {
  const r = {};
  await __again();
  r.row = document.getElementById('fp-chat-row').outerHTML;
  r.tabsRow = !!document.getElementById('fp-tabs-row');
  openNativeChatSheet();
  await __until(() => !_fpChat.busy && /SAFETY/.test(__txt('#fpChatBody') || '') && !/Reading the counters/.test(__txt('#fpChatBody')));
  await __w(0);
  r.sheet = document.getElementById('fpChatOverlay').outerHTML;
  r.ids61 = ['fp-chat-switch', 'fp-chat-retry', 'fp-policy-check', 'fp-tabs-row', 'fpTabsOverlay'].filter((id) => document.getElementById(id));
  const retry = [...document.querySelectorAll('#fpChatBody .settings-row')].find((x) => /Try the native chat again/.test(x.textContent));
  r.retry = !!retry;
  const n = __fpShell.of('reset').length;
  if (retry) retry.click();
  await __until(() => __fpShell.of('reset').length > n && /back from the next launch/.test(__toast() || ''));
  await __w(0);
  r.reset = __fpShell.of('reset');
  r.retryToast = __toast();
  r.rowAfter = document.getElementById('fp-chat-row').outerHTML;
  r.sheetAfter = document.getElementById('fpChatOverlay').outerHTML;
  closeNativeChatSheet();
  toggleNativeChat(); await __w(20);
  r.offToast = __toast(); r.offRow = document.getElementById('fp-chat-row').outerHTML;
  toggleNativeChat(); await __w(20);
  r.onToast = __toast();
  if (typeof openNativeTabsSheet === 'function') openNativeTabsSheet();
  r.tabsSheet = !!document.getElementById('fpTabsOverlay');
  r.keys = { backup: BACKUP_KEYS.slice(), raw: RAW_STRING_KEYS.slice(), names: Object.keys(_FP_KEY_NAMES) };
  return r;
}

serial('build 60\'s binary: no tab bar row; the chat\'s row, sheet, Try again (coach alone) and toasts are byte for byte the page\'s before the tabs half; no 61 id; no key added to BACKUP_KEYS, RAW_STRING_KEYS or _FP_KEY_NAMES', async () => {
  const init = 'window.__fpShellStatus = ' + J(CRASH60) + ';';
  const base = await pageBoot('inert', { html: BASE_PAGE(), init });
  let a;
  try { await ready(base); a = await ev(base, ABOUT60); } finally { await base.close(); }
  const cur = await pageBoot('inert', { init });
  let b;
  try { await ready(cur); b = await ev(cur, ABOUT60); } finally { await cur.close(); }
  for (const k of ['row', 'sheet', 'rowAfter', 'sheetAfter', 'offRow']) assert(a[k] === b[k], k + ' is byte for byte the base page\'s: ' + J([a[k], b[k]]));
  for (const k of ['retryToast', 'offToast', 'onToast']) assert(a[k] === b[k], k + ' is the base page\'s: ' + J([a[k], b[k]]));
  assert(/Native Coach chat/.test(b.row) && /Off: the app closed with it open/.test(b.row) && b.retry && /Hidden under a native screen/.test(b.sheet),
    'the row and sheet say what spec 118\'s C5 reads: ' + J([b.row, b.retry]));
  assert(J(b.reset) === '[{"screen":"coach"}]' && J(a.reset) === J(b.reset), 'Try again resets coach alone, as before: ' + J([a.reset, b.reset]));
  assert(!b.tabsRow && !b.tabsSheet && J(b.ids61) === '[]', 'no tab bar row or sheet and no 61 id under build 60\'s binary: ' + J(b));
  assert(J(a.keys) === J(b.keys), 'BACKUP_KEYS, RAW_STRING_KEYS and _FP_KEY_NAMES equal the base page\'s: ' + J([a.keys, b.keys]));
  assert(!b.keys.backup.concat(b.keys.raw, b.keys.names).some((k) => /tabs?_?(bar|switch|off|root)|native_tab/.test(k)), 'no tab bar key: ' + J(b.keys));
  // build 60 with the chat on: the row as spec 118 reads it, still no tab bar row and no 61 id
  const chat = await pageBoot('coach');
  try {
    await ready(chat);
    const out = await ev(chat, async () => {
      await __again();
      openNativeChatSheet(); await __until(() => !_fpChat.busy); await __w(0);
      return { row: __txt('#fp-chat-row'), tabsRow: !!document.getElementById('fp-tabs-row'),
        ids: ['fp-chat-switch', 'fp-chat-retry', 'fp-policy-check'].filter((id) => document.getElementById(id)), title: __txt('#fpChatTitle') };
    });
    assert(/^Native Coach chat On . the iPhone.s own chat screen On$/.test(out.row) && out.title === 'Native Coach chat' && !out.tabsRow && J(out.ids) === '[]',
      'build 60 with its chat: today\'s row and title, no tab bar row, no 61 id: ' + J(out));
  } finally { await chat.close(); }
});

// ── A 61 binary: every line through __fpShellStatus ─────────────────────────────────────────────────────────────────
// [name, status, the tab bar's line and pill, the Native Coach's line and pill (null: not read)]
const LINES = [
  ['this iPhone\'s switch (switches and off device)', withPieces({ switches: { tabs: false } }, { tabs: OFF('device') }),
    ['Off on this iPhone', 'Off'], ['Back from the next launch', 'Off']],
  ['this iPhone\'s switch (switches alone)', ST61({ switches: { tabs: false } }), ['Off on this iPhone', 'Off'], null],
  ['this iPhone\'s switch (off device alone)', withPieces({}, { tabs: OFF('device') }), ['Off on this iPhone', 'Off'], null],
  ['the policy file', withPieces({}, { tabs: OFF('policy'), coach: OFF('policy') }), ['Off by the policy file', 'Off'], ['Off by the policy file', 'Off']],
  ['a crash', withPieces({ verdicts: [{ piece: 'tabs', shell: '61', page: 'P', why: 'tabs marker', at: AT }] },
    { tabs: OFF('crash', { why: 'tabs marker', at: AT, canReset: true }), coach: OFF('crash', { why: 'crash marker', at: AT, canReset: true }) }),
    ['Off: the app closed during a tab change', 'Off'], ['Off: the app closed with it open', 'Off']],
  ['the breaker, no hello', withPieces({}, { tabs: OFF('breaker', { trip: 'no-hello', at: AT, canReset: true }), coach: OFF('breaker', { trip: 'no-hello', at: AT, canReset: true }) }),
    ['Paused: no hello', 'Paused'], ['Paused: no hello', 'Paused']],
  ['the breaker, failures', withPieces({}, { tabs: OFF('breaker', { trip: 'failures', at: AT, canReset: true }), coach: OFF('breaker', { trip: 'failures', at: AT, canReset: true }) }),
    ['Paused: calls kept failing', 'Paused'], ['Paused: calls kept failing', 'Paused']],
  ['the page build (off page)', withPieces({}, { tabs: OFF('page', { canReset: true }), coach: OFF('page', { canReset: true }) }),
    ['Off: this version of the page doesn’t use it', 'Off'], ['Off: this version of the page doesn’t use it', 'Off']],
  ['fellBack page', withPieces(FELL('page'), { tabs: piece() }), ['Off: this version of the page doesn’t use it', 'Off'], ['Back from the next launch', 'Off']],
  ['fellBack refused', withPieces(FELL('refused'), { tabs: piece() }), ['Off: this version of the page doesn’t use it', 'Off'], null],
  ['fellBack failures (its trip cleared)', withPieces(FELL('failures'), { tabs: piece() }), ['Back from the next launch', 'Off'], null],
  ['fellBack policy (the policy back on)', withPieces(FELL('policy'), { tabs: piece() }), ['Back from the next launch', 'Off'], null],
  ['fellBack switch (switched on again)', withPieces(FELL('switch'), { tabs: piece() }), ['Back from the next launch', 'Off'], null],
  ['fellBack no-hello (its trip cleared)', withPieces(FELL('no-hello'), { tabs: piece() }), ['Back from the next launch', 'Off'], null],
  ['needs root', ST61(), ['Back from the next launch', 'Off'], ['Back from the next launch', 'Off']],
  ['iOS 17 or 18', withPieces({}, { tabs: OFF('os', { canReset: true }) }), ['Off: needs iOS 26 or later', 'Off'], null],
];
serial('a 61 binary, through __fpShellStatus: every tab bar line and pill, the Native Coach\'s status lines, iOS 17/18 with no switch and no Try again, and "Check the switches now" repainting both rows and the open sheet from its answer', async () => {
  const app = await pageBoot('inert61');
  try {
    await ready(app);
    const out = await ev(app, async (LINES) => {
      const r = { lines: [] };
      for (const [name, st] of LINES) { await __again(st); r.lines.push([name, __rows()]); }
      // the row as a whole, once: title, line, pill
      r.whole = [__txt('#fp-tabs-row'), __txt('#fp-chat-row')];
      // iOS 17 or 18 (the last status): the sheet has no switch and no Try again, and the switch sends nothing
      openNativeTabsSheet(); await __until(() => !_fpChat.busy); await __w(0);
      r.os = { head: __txt('#fpTabsHead'), sw: !!document.getElementById('fp-tabs-switch'), retry: !!document.getElementById('fp-tabs-retry'),
        check: document.querySelectorAll('#fpTabsBody #fp-policy-check').length };
      const n0 = __fpShell.of('setSwitch').length;
      toggleNativeTabs(); await __w(30);
      r.os.sent = __fpShell.of('setSwitch').length - n0;
      closeNativeTabsSheet();
      return r;
    }, LINES);
    for (let i = 0; i < LINES.length; i++) {
      const [name, , tabs, coach] = LINES[i], got = out.lines[i][1];
      assert(out.lines[i][0] === name && J(got.tabs) === J(tabs), name + ': the tab bar reads ' + J(tabs) + ': ' + J(got.tabs));
      if (coach) assert(J(got.coach) === J(coach), name + ': the Native Coach reads ' + J(coach) + ': ' + J(got.coach));
    }
    assert(out.whole[0] === 'Native tab bar Off: needs iOS 26 or later Off' && out.whole[1] === 'Native Coach Back from the next launch Off',
      'the rows: Native tab bar and Native Coach, each title, line and pill: ' + J(out.whole));
    assert(out.os.head === 'Off: needs iOS 26 or later' && !out.os.sw && !out.os.retry && out.os.check === 1 && out.os.sent === 0,
      'iOS 17 or 18: no switch, no Try again (whatever canReset says), its switch sends nothing; Check the switches now stays: ' + J(out.os));
    // Check the switches now: status {refresh: true}, its answer repaints both rows and the open sheet
    const chk = await ev(app, async ({ A, B, C }) => {
      const r = {};
      await __again(A);
      openNativeTabsSheet(); await __until(() => !_fpChat.busy); await __w(0);
      r.before = { rows: __rows(), sub: __txt('#fpTabsBody #fp-policy-check .settings-row-sub'), head: __txt('#fpTabsHead') };
      window.__fpShellStatus = B;   // what the shell will answer once it has fetched the file
      window.__fpShellRefreshDelay = 1000;
      const n0 = __fpShell.calls.length;
      document.querySelector('#fpTabsBody #fp-policy-check').click();
      await __w(20);
      r.during = __txt('#fpTabsBody #fp-policy-check .settings-row-sub');
      await __until(() => !_fpChat.chk); await __w(0);
      r.calls = __fpShell.calls.slice(n0).filter((c) => c[0] === 'status').map((c) => c[1]);
      r.after = { rows: __rows(), sub: __txt('#fpTabsBody #fp-policy-check .settings-row-sub'), head: __txt('#fpTabsHead') };
      closeNativeTabsSheet();
      // in the Native Coach's sheet too, with a fetch that failed
      window.__fpShellStatus = C;
      openNativeChatSheet(); await __until(() => !_fpChat.busy); await __w(0);
      document.querySelector('#fpChatBody #fp-policy-check').click();
      await __until(() => !_fpChat.chk); await __w(0);
      r.chat = { sub: __txt('#fpChatBody #fp-policy-check .settings-row-sub'), checks: document.querySelectorAll('#fp-policy-check').length };
      // a refresh the shell refuses: an error toast, and the line as it was
      __fpShell.refuse.status = 'bad message: status';
      document.querySelector('#fpChatBody #fp-policy-check').click();
      await __until(() => !_fpChat.chk); await __w(0);
      r.refused = { toast: __toast(), sub: __txt('#fpChatBody #fp-policy-check .settings-row-sub') };
      delete __fpShell.refuse.status;
      closeNativeChatSheet();
      return r;
    }, {
      A: withPieces({ policy: { at: Date.now() - 125000, result: 'unchanged' } }, { tabs: OFF('policy'), coach: OFF('policy') }),
      B: withPieces({ policy: { at: Date.now(), result: 'applied' } }, { tabs: OFF('needs', { needs: ['root'] }), coach: piece() }),
      C: withPieces({ policy: { at: Date.now(), result: 'fetch failed, nothing changed: timed out' } }, {}),
    });
    assert(J(chk.before.rows) === J({ tabs: ['Off by the policy file', 'Off'], coach: ['Off by the policy file', 'Off'] }) && chk.before.sub === 'Checked 2 min ago'
      && chk.before.head === 'Off by the policy file', 'before: both rows off by the policy file, checked 2 min ago: ' + J(chk.before));
    assert(chk.during === 'Checking…' && J(chk.calls) === '[{"refresh":true}]', 'one status {refresh: true}, "Checking..." meanwhile: ' + J([chk.during, chk.calls]));
    assert(J(chk.after.rows) === J({ tabs: ['Back from the next launch', 'Off'], coach: ['Back from the next launch', 'Off'] })
      && chk.after.head === 'Back from the next launch' && chk.after.sub === 'Checked just now · the switches changed',
      'its answer repaints both rows and the open sheet: ' + J(chk.after));
    assert(chk.chat.sub === 'Checked just now · couldn’t reach the file' && chk.chat.checks === 1, 'the Native Coach\'s sheet carries it too, and says a fetch failed: ' + J(chk.chat));
    assert(chk.refused.toast === 'Couldn’t check the switches — try again' && chk.refused.sub === chk.chat.sub, 'a refused refresh: a toast, the line kept: ' + J(chk.refused));
  } finally { await app.close(); }
});

// The Native Coach's needs: under a live tab root with the Coach's pieces left out of hello (__fpShellOff), the line of
// the piece needed.
serial('a 61 binary, the Native Coach under a live tab root: needs reads the needed piece\'s line; coachHome\'s own policy and page', async () => {
  const app = await pageBoot('tabs', { init: 'window.__fpShellOff = ["coach"];' });
  try {
    await ready(app);
    const out = await ev(app, async (S) => {
      const r = { negotiated: _fp.hello.screens.slice(), mode: _fpTabsLive() };
      for (const st of S) { await __again(st); r[st.__name] = __rows(); }
      return r;
    }, [
      Object.assign(withPieces({ root: 'tabs' }, { tabs: piece({ live: true }), coach: OFF('breaker', { trip: 'failures', at: AT, canReset: true }), coachHome: OFF('needs', { needs: ['coach'] }) }), { __name: 'needs' }),
      Object.assign(withPieces({ root: 'tabs' }, { tabs: piece({ live: true }), coach: OFF('needs', { needs: ['coachHome'] }), coachHome: OFF('policy') }), { __name: 'policy' }),
      Object.assign(withPieces({ root: 'tabs' }, { tabs: piece({ live: true }), coach: OFF('needs', { needs: ['coachHome'] }), coachHome: OFF('page', { canReset: true }) }), { __name: 'page' }),
    ]);
    assert(J(out.negotiated) === '["tabs"]' && out.mode, 'the bar alone is negotiated: ' + J(out));
    assert(J(out.needs.coach) === '["Paused: calls kept failing","Paused"]' && J(out.needs.tabs) === '["On · the iPhone’s own tab bar","On"]',
      'coachHome off for needs coach reads coach\'s line; the bar is on: ' + J(out.needs));
    assert(J(out.policy.coach) === '["Off by the policy file","Off"]', 'coachHome off by the policy file: ' + J(out.policy));
    assert(J(out.page.coach) === '["Off: this version of the page doesn’t use it","Off"]', 'coachHome declined by the page build: ' + J(out.page));
  } finally { await app.close(); }
});

// ── The real flows ──────────────────────────────────────────────────────────────────────────────────────────────────
serial('the tab root: both rows on; this iPhone\'s Native Coach switch both ways at once; a broken coachHome model; the page\'s own way out ("the tab bar went away", the bar declined by the page build)', async () => {
  const app = await pageBoot('tabs');
  try {
    await ready(app);
    const out = await ev(app, async () => {
      const r = {};
      await __again();
      r.on = __rows();
      toggleNativeChat(); await __w(30);
      r.off = { rows: __rows(), toast: __toast(), dismissed: __fpShell.of('dismiss').map((a) => a.screen) };
      toggleNativeChat(); await __w(30);
      r.back = { rows: __rows(), toast: __toast() };
      // a coachHome model the page cannot build: the web Coach for the document
      const real = _coachHomeModel;
      _coachHomeModel = () => { throw new Error('boom'); };
      toggleNativeChat(); await __w(30); toggleNativeChat(); await __w(60);
      _coachHomeModel = real;
      await __again();
      r.model = { rows: __rows(), off: _fp.off.coachHome };
      // the page leaves tabs mode on its own once its hello asked for the bar (the failsafe's way): dismiss tabs
      _fpTabsLeave('test', true); await __w(30);
      await __again();
      r.left = { rows: __rows(), mode: _fp.tabs.mode, dismiss: __fpShell.of('dismiss').filter((a) => a.screen === 'tabs').length,
        fellBack: __fpShell.state().scene.fellBack && __fpShell.state().scene.fellBack.why };
      return r;
    });
    assert(J(out.on) === J({ tabs: ['On · the iPhone’s own tab bar', 'On'], coach: ['On · the iPhone’s own Coach tab', 'On'] }), 'the tab root, both on: ' + J(out.on));
    assert(J(out.off.rows.coach) === '["Off · the app shows its web Coach","Off"]' && out.off.toast === 'Native Coach off'
      && out.off.dismissed.indexOf('coachHome') >= 0 && J(out.off.rows.tabs) === J(out.on.tabs),
      'the switch: the web Coach at once (coachHome dismissed), the bar stays: ' + J(out.off));
    assert(J(out.back.rows) === J(out.on) && out.back.toast === 'Native Coach on', 'and back on at once: ' + J(out.back));
    assert(out.model.off === 'model' && J(out.model.rows.coach) === '["Paused: it couldn’t be drawn · back from the next launch","Paused"]',
      'a broken coachHome model: ' + J(out.model));
    assert(!out.left.mode && out.left.dismiss === 1 && out.left.fellBack === 'page'
      && J(out.left.rows.coach) === '["Off this launch: the tab bar went away · back from the next launch","Off"]'
      && J(out.left.rows.tabs) === '["Off: this version of the page doesn’t use it","Off"]',
      'the page\'s own way out: the Native Coach went with the bar, the bar declined by this page build: ' + J(out.left));
  } finally { await app.close(); }
});

serial('before hello answers, under the tab root: both rows "Starting..."', async () => {
  const app = await pageBoot('tabs', { init: 'window.__fpShellHelloSilent = true;' });
  try {
    await app.page.waitForFunction(() => typeof render === 'function' && window._fp && _fp.tabs.mode, null, { timeout: 15000 });
    const out = await ev(app, async () => { await __again(); return { rows: __rows(), hello: !!_fp.hello, mode: _fp.tabs.mode }; });
    assert(!out.hello && out.mode && J(out.rows) === J({ tabs: ['Starting…', 'Off'], coach: ['Starting…', 'Off'] }), 'Starting...: ' + J(out));
  } finally { await app.close(); }
});

serial('the stable ids, each once where contract 10.5 puts it; Try again: #fp-tabs-retry resets tabs, #fp-chat-retry resets coachHome then coach; both sheets list the shell-wide counters', async () => {
  const st = withPieces(FELL('failures'), {
    tabs: OFF('breaker', { trip: 'failures', at: AT, canReset: true }),
    coach: OFF('crash', { why: 'crash marker', at: AT, canReset: true }), coachHome: OFF('needs', { needs: ['coach'] }) });
  const app = await pageBoot('tabs', { init: 'window.__fpShellStatus = ' + J(st) + ';' });
  try {
    await ready(app);
    const out = await ev(app, async () => {
      const r = {};
      await __again();
      openNativeChatSheet(); openNativeTabsSheet();
      await __until(() => !_fpChat.busy); await __w(0);
      const IDS = ['fp-chat-row', 'fp-chat-sub', 'fp-chat-pill', 'fpChatOverlay', 'fp-chat-switch', 'fp-chat-retry',
        'fp-tabs-row', 'fp-tabs-sub', 'fp-tabs-pill', 'fpTabsOverlay', 'fp-tabs-switch', 'fp-tabs-retry'];
      r.counts = IDS.map((id) => document.querySelectorAll('#' + id).length);
      const $ = (id) => document.getElementById(id), inside = (id, up) => !!($(id) && $(up) && $(up).contains($(id)) && $(id) !== $(up));
      const rows = [...document.querySelectorAll('#screen .settings-row')];
      r.where = {
        rows: !!($('fp-chat-row') && $('screen').contains($('fp-chat-row')) && $('screen').contains($('fp-tabs-row'))),
        next: rows.indexOf($('fp-tabs-row')) === rows.indexOf($('fp-chat-row')) + 1,
        about: (() => { const g = $('fp-tabs-row').closest('.settings-group'); const hd = g && g.previousElementSibling; return !!(hd && /About/i.test(hd.textContent)); })(),
        chatParts: inside('fp-chat-sub', 'fp-chat-row') && inside('fp-chat-pill', 'fp-chat-row'),
        tabsParts: inside('fp-tabs-sub', 'fp-tabs-row') && inside('fp-tabs-pill', 'fp-tabs-row'),
        overlays: $('fpChatOverlay').parentNode === document.body && $('fpTabsOverlay').parentNode === document.body,
        chatSheet: inside('fp-chat-switch', 'fpChatBody') && inside('fp-chat-retry', 'fpChatBody'),
        tabsSheet: inside('fp-tabs-switch', 'fpTabsBody') && inside('fp-tabs-retry', 'fpTabsBody'),
        checks: [document.querySelectorAll('#fpChatBody #fp-policy-check').length, document.querySelectorAll('#fpTabsBody #fp-policy-check').length],
        roles: ['fp-chat-row', 'fp-tabs-row', 'fp-chat-switch', 'fp-tabs-switch', 'fp-chat-retry', 'fp-tabs-retry'].map((id) => $(id).getAttribute('role')),
        checked: [$('fp-chat-switch').getAttribute('aria-checked'), $('fp-tabs-switch').getAttribute('aria-checked')],
      };
      r.safety = [__txt('#fpChatBody'), __txt('#fpTabsBody')];
      r.titles = [__txt('#fpChatTitle'), __txt('#fpTabsTitle')];
      // Try again, the tab bar's
      const n0 = __fpShell.of('reset').length;
      $('fp-tabs-retry').click();
      await __until(() => __fpShell.of('reset').length > n0 && !$('fp-tabs-retry')); await __w(0);
      r.tabsRetry = { reset: __fpShell.of('reset').slice(n0), toast: __toast(), row: __rows().tabs };
      // the Native Coach's: coachHome, then coach
      const n1 = __fpShell.of('reset').length;
      $('fp-chat-retry').click();
      await __until(() => __fpShell.of('reset').length >= n1 + 2 && !$('fp-chat-retry')); await __w(0);
      r.chatRetry = { reset: __fpShell.of('reset').slice(n1), toast: __toast() };
      return r;
    });
    assert(J(out.counts) === J(new Array(12).fill(1)), 'each of the twelve ids exists once: ' + J(out.counts));
    const w = out.where;
    assert(w.rows && w.next && w.about && w.chatParts && w.tabsParts, 'the rows in Settings > About, the tab bar\'s right after the Native Coach\'s, each with its line and pill: ' + J(w));
    assert(w.overlays && w.chatSheet && w.tabsSheet && J(w.checks) === '[1,1]', 'the sheets on <body>, each with its switch, Try again and Check the switches now: ' + J(w));
    assert(J(w.roles) === '["button","button","switch","switch","button","button"]' && J(w.checked) === '["true","true"]', 'controls, the switches as switches: ' + J(w));
    assert(J(out.titles) === '["Native Coach","Native tab bar"]', 'the sheets\' titles: ' + J(out.titles));
    for (const s of out.safety) {
      assert(/Left its window while open Stays 0: native screens and tab changes never take the app out of its window 0 this launch . 0 in all/.test(s)
        && /Hidden while in use Stays 0: the app keeps showing under native screens and tab changes 0 this launch . 0 in all/.test(s)
        && /Tab changes outside the funnel Stays 0: every tab change goes one way 1 this launch . 3 in all/.test(s)
        && /Breaker trips Last: .+? 0 this launch . 1 in all/.test(s) && /Crash markers Last: .+? 0 this launch . 1 in all/.test(s),
        'the shell-wide counters: ' + s);
    }
    assert(J(out.tabsRetry.reset) === '[{"screen":"tabs"}]' && out.tabsRetry.toast === 'The native tab bar is back from the next launch'
      && J(out.tabsRetry.row) === '["Back from the next launch","Off"]', '#fp-tabs-retry resets tabs: ' + J(out.tabsRetry));
    assert(J(out.chatRetry.reset) === '[{"screen":"coachHome"},{"screen":"coach"}]' && out.chatRetry.toast === 'The native Coach is back from the next launch',
      '#fp-chat-retry resets coachHome, then coach: ' + J(out.chatRetry));
  } finally { await app.close(); }
});

serial('the tab bar\'s switch under the tab root: one setSwitch {screen:\'tabs\', on:false} from a click; the shell falls back and the page leaves tabs mode; on again reads "Back from the next launch"; no kt_* key; Check the switches now with the shell\'s fetch', async () => {
  const app = await pageBoot('tabs');
  try {
    await ready(app);
    await ev(app, () => __again());
    const keys0 = await ev(app, () => Object.keys(localStorage).filter((k) => /^kt_/.test(k)).sort());
    await app.page.click('#fp-tabs-row');
    await ev(app, () => __until(() => document.getElementById('fpTabsOverlay') && !_fpChat.busy));
    const before = await ev(app, () => ({ sub: __txt('#fpTabsBody #fp-policy-check .settings-row-sub'), head: __txt('#fpTabsHead'), mode: _fp.tabs.mode }));
    await ev(app, () => { window.__fpShellRefreshDelay = 1000; });
    await app.page.click('#fpTabsBody #fp-policy-check');
    const during = await ev(app, () => __txt('#fpTabsBody #fp-policy-check .settings-row-sub'));
    await ev(app, () => __until(() => !_fpChat.chk));
    const checked = await ev(app, () => ({ sub: __txt('#fpTabsBody #fp-policy-check .settings-row-sub'), calls: __fpShell.of('status').filter((a) => a && a.refresh) }));
    await app.page.click('#fp-tabs-switch');
    await ev(app, () => __until(() => !_fp.tabs.mode && /Off on this iPhone/.test(__txt('#fp-tabs-sub') || '')));
    await app.page.waitForTimeout(60);
    const off = await ev(app, () => ({ calls: __fpShell.of('setSwitch'), rows: __rows(), toast: __toast(), cls: document.documentElement.classList.contains('fp-tabs'),
      tabs: getComputedStyle(document.getElementById('tabs')).display, fellBack: __fpShell.state().scene.fellBack && __fpShell.state().scene.fellBack.why,
      head: __txt('#fpTabsHead'), sw: [__txt('#fp-tabs-switch'), document.getElementById('fp-tabs-switch').getAttribute('aria-checked')] }));
    await app.page.click('#fp-tabs-switch');
    await ev(app, () => __until(() => __fpShell.of('setSwitch').length === 2 && /Back from the next launch/.test(__txt('#fp-tabs-sub') || '')));
    const on = await ev(app, () => ({ calls: __fpShell.of('setSwitch'), rows: __rows(), toast: __toast(),
      sw: [__txt('#fp-tabs-switch'), document.getElementById('fp-tabs-switch').getAttribute('aria-checked')] }));
    const keys1 = await ev(app, () => Object.keys(localStorage).filter((k) => /^kt_/.test(k)).sort());
    assert(before.mode && before.head === 'On · the iPhone’s own tab bar' && before.sub === 'Not checked yet', 'the sheet before: ' + J(before));
    assert(during === 'Checking…' && checked.sub === 'Checked just now' && J(checked.calls) === '[{"refresh":true}]',
      'Check the switches now: Checking..., then when it checked: ' + J([during, checked]));
    assert(J(off.calls) === '[{"screen":"tabs","on":false}]' && off.fellBack === 'switch' && !off.cls && off.tabs !== 'none',
      'one setSwitch off; the shell fell back and the page left tabs mode (its own #tabs shows): ' + J(off));
    assert(J(off.rows.tabs) === '["Off on this iPhone","Off"]' && off.head === 'Off on this iPhone' && off.toast === 'Native tab bar off' && J(off.sw) === '["Native tab bar Off on this iPhone · on again from the next launch Off","false"]',
      'the row, the sheet and the switch say off on this iPhone: ' + J(off));
    assert(J(off.rows.coach) === '["Off this launch: the tab bar went away · back from the next launch","Off"]', 'the Native Coach went with the bar: ' + J(off.rows));
    assert(J(on.calls) === '[{"screen":"tabs","on":false},{"screen":"tabs","on":true}]' && J(on.rows.tabs) === '["Back from the next launch","Off"]'
      && on.toast === 'Native tab bar on from the next launch' && on.sw[1] === 'true', 'on again: from the next launch: ' + J(on));
    assert(J(keys0) === J(keys1), 'the switch is the shell\'s: no kt_* key came or went: ' + J([keys0, keys1]));
  } finally { await app.close(); }
});

serial('coach61 (a classic root): 60\'s overlay chat is the Native Coach\'s "On"; the tab bar\'s switch is offered (the policy file still holds); the tab bar\'s sheet pads as the chat\'s; a present refused', async () => {
  const app = await pageBoot('coach61', { seed: { kt_apikey: 'sk-ant-test', kt_coach_msgs: '[]' },
    init: '(() => { window.fetch = async () => new Response(JSON.stringify({ id: "m", type: "message", role: "assistant", content: [{ type: "text", text: "{}" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 }); })();' });
  try {
    await ready(app);
    const out = await ev(app, async () => {
      const r = {};
      await __again();
      r.on = __rows();
      openNativeTabsSheet(); await __until(() => !_fpChat.busy); await __w(0);
      document.getElementById('fp-tabs-switch').click();
      await __until(() => __fpShell.of('setSwitch').length === 1 && !_fpChat.sw); await __w(0);
      r.off = __rows();
      document.getElementById('fp-tabs-switch').click();
      await __until(() => __fpShell.of('setSwitch').length === 2 && !_fpChat.sw); await __w(0);
      r.back = __rows();
      r.calls = __fpShell.of('setSwitch');
      const pad = (sel) => parseFloat(getComputedStyle(document.querySelector(sel)).paddingBottom);
      r.pad = [pad('#fpTabsOverlay .kt-sheet')];
      closeNativeTabsSheet();
      openNativeChatSheet(); await __w(0);
      r.pad.push(pad('#fpChatOverlay .kt-sheet'));
      closeNativeChatSheet();
      // the overlay chat refused: this document's own reason
      __fpShell.refuse.present = 'not-native: test';
      switchTab('coach'); coachView = 'chat'; render();
      await __until(() => _fp.off.coach === 'present');
      await __again();
      r.refused = __rows();
      return r;
    });
    assert(J(out.on) === J({ tabs: ['Off by the policy file', 'Off'], coach: ['On · the iPhone’s own chat screen', 'On'] }), 'a classic root: ' + J(out.on));
    assert(J(out.calls) === '[{"screen":"tabs","on":false},{"screen":"tabs","on":true}]' && J(out.off.tabs) === '["Off on this iPhone","Off"]'
      && J(out.back.tabs) === '["Off by the policy file","Off"]', 'the switch is offered on a classic root; on again, the policy file still holds: ' + J(out));
    assert(out.pad[0] === 24 && out.pad[1] === 24, 'the tab bar\'s sheet pads as the chat\'s (max(env(), 16) + 8): ' + J(out.pad));
    assert(J(out.refused.coach) === '["Paused: it couldn’t open · back from the next launch","Paused"]', 'a present refused: ' + J(out.refused));
  } finally { await app.close(); }
  // under the tab root the sheet pads from the shell's numbers, as the chat's (the NATIVE TAB BAR block)
  const tabs = await pageBoot('tabs');
  try {
    await ready(tabs);
    const pad = await ev(tabs, async () => {
      switchTab('settings'); await __w(30);
      const p = (sel) => parseFloat(getComputedStyle(document.querySelector(sel)).paddingBottom);
      openNativeTabsSheet(); await __w(0); const a = p('#fpTabsOverlay .kt-sheet'); closeNativeTabsSheet();
      openNativeChatSheet(); await __w(0); const b = p('#fpChatOverlay .kt-sheet'); closeNativeChatSheet();
      return [a, b, parseFloat(document.documentElement.style.getPropertyValue('--fp-sheet-b'))];
    });
    assert(pad[0] === pad[2] + 8 && pad[1] === pad[0], 'under the tab root: --fp-sheet-b + 8, as the chat\'s sheet: ' + J(pad));
  } finally { await tabs.close(); }
});

serial('dev.nav settings/tabs-sheet opens the tab bar\'s sheet under 61 and nothing under 60; a 60 TrovoShell under a 61 flag (no setSwitch) shows no tab bar row', async () => {
  const flag61 = Object.assign(JSON.parse(CANONICAL_61.tabs), { dev: { nav: 'settings/tabs-sheet' } });
  const a = await pageBoot(flag61);
  try {
    await ready(a);
    await a.page.waitForFunction(() => document.getElementById('fpTabsOverlay'), null, { timeout: 5000 });
    const out = await ev(a, () => ({ tab: currentTab, title: __txt('#fpTabsTitle'), mode: _fp.tabs.mode }));
    assert(out.tab === 'settings' && out.title === 'Native tab bar' && out.mode, '61: the route opens #fpTabsOverlay on Settings: ' + J(out));
  } finally { await a.close(); }
  const b = await pageBoot({ v: 1, min: 1, shell: '60', screens: [], binary: ['coach'], dev: { nav: 'settings/tabs-sheet' } });
  try {
    await ready(b);
    await b.page.waitForFunction(() => currentTab === 'settings', null, { timeout: 5000 });
    await b.page.waitForTimeout(100);
    const out = await ev(b, () => ({ sheet: !!document.getElementById('fpTabsOverlay'), row: !!document.getElementById('fp-tabs-row') }));
    assert(!out.sheet && !out.row && b.errors.length === 0, '60: nothing opens, no row, no error: ' + J([out, b.errors]));
  } finally { await b.close(); }
  const c = await pageBoot('tabs', { shellMethods: SHELL_METHODS['60'] });
  try {
    await ready(c);
    const out = await ev(c, async () => {
      switchTab('settings'); await __w(40);
      openNativeChatSheet(); await __w(40);
      return { row: !!document.getElementById('fp-tabs-row'), check: !!document.getElementById('fp-policy-check'), title: __txt('#fp-chat-row .settings-row-title') };
    });
    assert(!out.row && !out.check && out.title === 'Native Coach', 'no setSwitch: no tab bar row and no Check the switches now; the Native Coach row stays: ' + J(out));
  } finally { await c.close(); }
});
