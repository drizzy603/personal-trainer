// fp-spec: self-shelled
// 122: build 61's tab bar bridge (plan task P1 creates it with the harness's own cases; P2 and P13 append).
// - The harness (P1): the four 61 flags are contract 2.1's strings, build 60's two unchanged; SHELL_METHODS['61'] is
//   contract 3.1's list in order and its first 11 are SHELL_METHODS['60']; the mock negotiates as FPCore with the
//   dependency rule and the fallback at hello (a fresh scene per row), and MOCK_RULES run in Node give the same reply;
//   the page before the tabs half (BASE_PAGE(), 91708ae) under inert61, coach61, tabs and tabsWeb makes no selectTab,
//   sheets or setSwitch call and shows its own #tabs (under tabs its hello names coach only, so the scene falls back
//   with tabs declined and 60's overlay chat is negotiated); dismiss {screen:'tabs'} falls back 'page' with no
//   screens.off tabs (a live chat goes with the composer's words); every refusal reads '<code>: <words>'; the funnel's
//   order; the scene's seq, selection and fallback survive a reload; sheets answers 16 ms later by default; under a 61
//   flag a page error fails close() unless pageErrors: 'allow'; status {refresh: true} is recorded and answered.
// - Tabs mode (P2; contract 2.3-2.4, 3.2-3.3, 3.8, 4.1-4.3, 7.2, 8.4, I8, I14): the page is inert without a usable tabs
//   flag (no shell, build 60's, 61's classic roots, the flag with no TrovoShell or 60's methods, a malformed tabs,
//   FP_TABS or FP_NATIVE off by a getter or by the page an OTA ships): no fp-tabs, no --fp-* and its own #tabs, a
//   tour sends no selectTab, sheets, setSwitch or dismiss tabs, and boot and tour leave the error log empty with no
//   page error, one OTA confirm and bootDone once; the class and the flag's bar are on <html> before #tabs is in and
//   #tabs is hidden; the boot tab (the flag's, fp_tab, which gives way to hello's reply even at seq 0); hello names
//   FP_SCREENS and adopts a newer selection and bar with no selectTab; the funnel (one selectTab per switchTab before
//   the local switch, answers correct only the newest request, a crossing tap wins, no bounce back); tabs.select and
//   tabs.bar (newer only, again, bad-args, off outside tabs mode); the variables at the Larger Text zooms; covered is
//   the Coach tab not web; every visibilitychange forwarded; the way out (told by the shell: nothing sent; on its own:
//   one dismiss tabs, told, and the chat off once its hello asked for tabs, until a reply without tabs; selectTab's
//   refusals, and their handler with sheets' label as a unit check until P5 sends sheets; at hello it renders after the
//   leave and the take-over), the failsafe on visible time (real time and Playwright's clock; on the clock, a
//   suspension between a hide and a show adds nothing and no stretch counts more than 1 s), and a broken page still
//   drops the bar (whatever state its main script reached; told, and the chat kept when no hello asked for tabs).
// - The head's way out before the main script ran (page follow-up PF; contract 2.3, 10.3), the parser held between the
//   two scripts until it came: the way out holds for the document, as one that left at boot (told, no-hello, one
//   dismiss tabs, the class never back, its own bar on the boot tab), hello names coach alone, so the chat stays on and
//   presents once on the classic rule, the share read waits for no hello, and a late reply naming tabs changes nothing.
// Every native boot names its shell (the mark above): FP_SHELL_INERT runs skip this spec.
const { boot, assert, run, SHELLS, SHELL_METHODS, MOCK_RULES, BASE_PAGE, shellFlag } = require('../lib/harness');

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

// Contract 2.1's canonical strings and 3.1's method list, verbatim.
const CONTRACT_FLAGS = {
  tabs: '{"binary":["coach","coachHome","tabs"],"min":1,"screens":["coach","coachHome","tabs"],"shell":"61","tabs":{"bar":{"h":83,"safe":34},"selected":"log"},"v":1}',
  tabsWeb: '{"binary":["coach","coachHome","tabs"],"min":1,"screens":["tabs"],"shell":"61","tabs":{"bar":{"h":83,"safe":34},"selected":"log"},"v":1}',
  coach61: '{"binary":["coach","coachHome","tabs"],"min":1,"screens":["coach"],"shell":"61","v":1}',
  inert61: '{"binary":["coach","coachHome","tabs"],"min":1,"screens":[],"shell":"61","v":1}',
};
const CONTRACT_METHODS = 'hello, bootDone, present, dismiss, model, toast, confirm, log, status, reset, visibility, selectTab, sheets, setSwitch';

// A stand-in page: no hello of its own, a FPScreens that records what the shell sends (a coach screens.off with a
// draft is taken), and render() so boot() sees a page.
const STUB = '<!doctype html><meta charset="utf-8"><title>stub</title><script>'
  + 'window.currentTab="log"; window.__in=[];'
  + 'window.FPScreens={call:function(n,a){ window.__in.push([n,a]);'
  + ' return Promise.resolve(n==="screens.off" && a.screen==="coach" && a.draft ? {ok:true, took:true} : {ok:true}); }};'
  + 'function render(){}</script><body></body>';
const stub = (shell, extra) => boot(Object.assign({ native: true, shell, html: STUB }, extra || {}));
const ALL = ['coachHome', 'coach', 'tabs'];
const hello = (app, screens, v) => ev(app, (a) => window.Capacitor.Plugins.TrovoShell.hello({ v: a.v, page: '20261014-1', screens: a.screens, boot: 'b' }), { screens, v: v === undefined ? 1 : v });
const state = (app) => ev(app, () => window.__fpShell.state());
const settle = (app, ms) => app.page.waitForTimeout(ms || 60);
const freshScene = async (app) => { await ev(app, () => sessionStorage.removeItem('__fpShellMock')); await app.reload(); };
const refused = (app, name, args) => ev(app, (a) => window.Capacitor.Plugins.TrovoShell[a.name](a.args).then(() => 'resolved', (e) => e.message), { name, args });

serial('P1: the 61 flags are contract 2.1\'s strings and 60\'s are unchanged; SHELL_METHODS[61] is 3.1\'s list, its first 11 are 60\'s; FP_SHELL_INERT picks inert61 or 60\'s inert', async () => {
  for (const k of Object.keys(CONTRACT_FLAGS)) assert(J(SHELLS[k]) === CONTRACT_FLAGS[k], k + ': ' + J(SHELLS[k]));
  assert(J(SHELLS.inert) === '{"v":1,"min":1,"shell":"60","screens":[],"binary":["coach"]}', 'inert: ' + J(SHELLS.inert));
  assert(J(SHELLS.coach) === '{"v":1,"min":1,"shell":"60","screens":["coach"],"binary":["coach"]}', 'coach: ' + J(SHELLS.coach));
  assert(SHELLS.none === null && Object.keys(SHELLS).length === 7, 'seven variants: ' + Object.keys(SHELLS));
  assert(SHELL_METHODS['61'].join(', ') === CONTRACT_METHODS, '61 methods: ' + SHELL_METHODS['61']);
  assert(J(SHELL_METHODS['61'].slice(0, 11)) === J(SHELL_METHODS['60']) && SHELL_METHODS['60'].length === 11, '60 methods: ' + SHELL_METHODS['60']);
  // FP_SHELL_INERT for a native boot that names no shell: '' and 0 none, 1 inert61, 60 build 60's inert, else an error
  const env = process.env.FP_SHELL_INERT;
  try {
    const pick = (m, o) => { process.env.FP_SHELL_INERT = m; try { return shellFlag(o); } catch (e) { return 'throws'; } };
    assert(pick('', { native: true }) === null && pick('0', { native: true }) === null, 'no flag');
    assert(pick('1', { native: true }) === SHELLS.inert61 && pick('60', { native: true }) === SHELLS.inert, '1 is inert61, 60 is inert');
    assert(pick('1', {}) === null && pick('1', { native: true, shell: 'coach' }) === SHELLS.coach, 'only a native boot with no shell');
    assert(pick('2', { native: true }) === 'throws' && pick('', { shell: 'nope' }) === 'throws', 'unknown modes and variants throw');
  } finally { if (env === undefined) delete process.env.FP_SHELL_INERT; else process.env.FP_SHELL_INERT = env; }
  // the self-shelled guard: this spec's native boot that names no shell throws before a browser starts
  let msg = '';
  try { const app = await boot({ native: true }); await app.close(); } catch (e) { msg = e.message; }
  assert(/self-shelled/.test(msg), 'a native boot with no shell in a self-shelled spec throws: ' + msg);
  // the methods each flag gets, and opts.shellMethods
  for (const [shell, n, over] of [['tabs', 14], ['coach61', 14], ['coach', 11], ['tabs', 11, SHELL_METHODS['60']]]) {
    const app = await stub(shell, over ? { shellMethods: over } : {});
    try {
      const names = await ev(app, () => Object.keys(window.Capacitor.Plugins.TrovoShell));
      assert(names.length === n && J(names) === J(SHELL_METHODS[n === 14 ? '61' : '60']), shell + ' methods: ' + names);
    } finally { await app.close(); }
  }
});

serial('P1: the mock negotiates as FPCore with the dependency rule and the fallback at hello, a fresh scene per row; MOCK_RULES in Node give the same reply', async () => {
  const R = MOCK_RULES();
  const rows = [
    { shell: 'tabs', screens: ['coach', 'tabs'], want: ['tabs'], fellBack: null, declined: ['coachHome'] },
    { shell: 'tabs', screens: ALL, want: ['coach', 'coachHome', 'tabs'], fellBack: null, declined: [] },
    { shell: 'tabs', screens: ['coach'], want: ['coach'], fellBack: 'page', declined: ['tabs'] },
    { shell: 'tabs', screens: ALL, v: 0, want: [], fellBack: 'refused', declined: ['tabs'], why: 'no-version' },
    { shell: 'tabsWeb', screens: ALL, want: ['tabs'], fellBack: null, declined: [] },
    { shell: 'tabsWeb', screens: ['coach'], want: [], fellBack: 'page', declined: ['tabs'] },
    { shell: 'coach61', screens: ALL, want: ['coach'], fellBack: null, declined: [] },
    { shell: 'inert61', screens: ['coach'], want: [], fellBack: null, declined: [] },
  ];
  const apps = {};
  try {
    for (const r of rows) {
      if (!apps[r.shell]) apps[r.shell] = await stub(r.shell);
      const app = apps[r.shell];
      await freshScene(app);
      const reply = await hello(app, r.screens, r.v);
      const st = await state(app);
      const tag = r.shell + ' ' + J(r.screens) + (r.v === 0 ? ' v0' : '') + ': ';
      assert(J(reply.screens) === J(r.want), tag + 'screens ' + J(reply));
      assert((st.scene.fellBack ? st.scene.fellBack.why : null) === r.fellBack, tag + 'fellBack ' + J(st.scene.fellBack));
      assert(J(Object.keys(st.scene.declined).sort()) === J(r.declined.slice().sort()), tag + 'declined ' + J(st.scene.declined));
      assert((reply.why || null) === (r.why || null) && reply.v === (r.v === 0 ? 0 : 1), tag + 'v/why ' + J(reply));
      // the reply carries tabs iff tabs is negotiated: the selection, seq 0 and the flag's predicted bar at rev 0
      const tabsOn = r.want.indexOf('tabs') >= 0;
      assert(tabsOn ? J(reply.tabs) === '{"selected":"log","seq":0,"bar":{"h":83,"safe":34,"rev":0}}' : reply.tabs === undefined, tag + 'tabs ' + J(reply.tabs));
      // the same rules in Node
      const n = R.hello(SHELLS[r.shell], { v: r.v === undefined ? 1 : r.v, screens: r.screens }, { live: !!SHELLS[r.shell].tabs, off: [] });
      assert(J(n.screens) === J(reply.screens) && n.fellBack === r.fellBack && J(n.declined.sort()) === J(r.declined.slice().sort()) && (n.why || null) === (r.why || null),
        tag + 'Node: ' + J(n));
    }
  } finally { for (const k in apps) await apps[k].close(); }
  // the dependency rule alone
  assert(J(R.depend(['coach', 'coachHome', 'tabs'], true)) === '["coach","coachHome","tabs"]', 'all three live');
  assert(J(R.depend(['coach', 'tabs'], true)) === '["tabs"]', 'coach needs coachHome under a live tab root');
  assert(J(R.depend(['coach', 'coachHome', 'tabs'], false)) === '["coach"]', 'classic: coach alone');
  assert(J(R.depend(['coachHome', 'tabs'], true)) === '["tabs"]', 'coachHome needs coach');
});

serial('P1: the page before the tabs half (BASE_PAGE, 91708ae) under inert61, coach61, tabs and tabsWeb: no selectTab, sheets or setSwitch, its own #tabs; under tabs the scene falls back with tabs declined and the overlay chat is negotiated', async () => {
  const want = { inert61: { screens: [], fellBack: null }, coach61: { screens: ['coach'], fellBack: null },
    tabs: { screens: ['coach'], fellBack: 'page' }, tabsWeb: { screens: [], fellBack: 'page' } };
  for (const shell of Object.keys(want)) {
    const app = await boot({ native: true, shell, html: BASE_PAGE() });
    try {
      await app.page.waitForFunction(() => window._fp && window._fp.hello, null, { timeout: 10000 });
      await settle(app, 300);
      const out = await ev(app, () => {
        const t = document.getElementById('tabs'), cs = getComputedStyle(t);
        return { hello: window.__fpShell.of('hello'), got: window._fp.hello, st: window.__fpShell.state(),
          other: window.__fpShell.calls.filter((c) => ['selectTab', 'sheets', 'setSwitch'].indexOf(c[0]) >= 0),
          tabs: cs.display !== 'none' && cs.visibility !== 'hidden' && t.getBoundingClientRect().height > 0,
          fpTabs: document.documentElement.classList.contains('fp-tabs') };
      });
      const w = want[shell];
      assert(out.hello.length === 1 && J(out.hello[0].screens) === '["coach"]', shell + ': the page names coach only: ' + J(out.hello));
      assert(out.other.length === 0 && out.tabs && !out.fpTabs, shell + ': inert and its own #tabs: ' + J(out));
      assert(J(out.got.screens) === J(w.screens), shell + ': negotiated ' + J(out.got));
      assert((out.st.scene.fellBack ? out.st.scene.fellBack.why : null) === w.fellBack, shell + ': fellBack ' + J(out.st.scene));
      if (w.fellBack) assert(out.st.scene.declined.tabs === out.hello[0].page && !out.st.live, shell + ': tabs declined for the page build: ' + J(out.st.scene));
      else assert(out.st.scene.root === 'classic' && J(out.st.scene.declined) === '{}', shell + ': classic root: ' + J(out.st.scene));
    } finally { await app.close(); }
  }
});

serial('P1: dismiss {screen:\'tabs\'} falls back \'page\' with no screens.off tabs (a live chat goes with the composer\'s words, then the Coach tab); every refusal reads \'<code>: <words>\'', async () => {
  const app = await stub('tabs');
  try {
    const r = await hello(app, ALL);
    assert(J(r.screens) === '["coach","coachHome","tabs"]', 'all negotiated: ' + J(r));
    // refusals under a live tab root, the Coach tab WAITING
    const bad = await refused(app, 'selectTab', { tab: 'gym' });
    const tabsP = await refused(app, 'present', { screen: 'tabs' });
    const notNative = await refused(app, 'present', { screen: 'coach' });
    const noModel = await refused(app, 'present', { screen: 'coachHome' });
    const noSwitch = await refused(app, 'setSwitch', { screen: 'coach', on: false });
    for (const [m, code] of [[bad, 'bad-tab'], [tabsP, 'not-presentable'], [notNative, 'not-native'], [noSwitch, 'no-switch']]) {
      assert(new RegExp('^' + code + ': \\S').test(m), code + ': ' + m);
    }
    assert(noModel === 'no coachHome model to open on', 'a present before its model keeps 60\'s words: ' + noModel);
    // the Coach tab NATIVE with the chat pushed, the composer holding words: then the page leaves tabs mode
    await ev(app, async () => {
      const P = window.Capacitor.Plugins.TrovoShell;
      await P.model({ screen: 'coachHome', rev: 1, json: '{"v":1}' });
      await P.present({ screen: 'coachHome' });
      await P.present({ screen: 'coach' });
      window.__fpShell.composer = 'half a question';
    });
    let st = await state(app);
    assert(st.scene.coach === 'native' && st.scene.pushed, 'native and pushed: ' + J(st.scene));
    await ev(app, () => window.Capacitor.Plugins.TrovoShell.dismiss({ screen: 'tabs' }));
    await settle(app, 150);
    const out = await ev(app, () => ({ inn: window.__in, sent: window.__fpShell.sent.map((s) => [s[0], s[1], s[2]]) }));
    st = await state(app);
    assert(st.scene.fellBack && st.scene.fellBack.why === 'page' && st.scene.declined.tabs === '20261014-1' && !st.live, 'fell back page, declined: ' + J(st.scene));
    const offs = out.inn.filter((m) => m[0] === 'screens.off');
    assert(J(offs) === J([['screens.off', { screen: 'coach', why: 'needs', draft: 'half a question' }], ['screens.off', { screen: 'coachHome', why: 'needs' }]]),
      'the chat with its draft, then the Coach tab; no screens.off tabs: ' + J(out.inn));
    assert(st.composer === '' && st.scene.coach === 'web' && !st.scene.pushed, 'the words taken (took: true), the Coach tab web: ' + J(st));
    // after the fallback: selectTab and sheets refused off; a second dismiss tabs changes nothing
    const off1 = await refused(app, 'selectTab', { tab: 'log' });
    const off2 = await refused(app, 'sheets', { open: true });
    assert(/^off: \S/.test(off1) && /^off: \S/.test(off2), 'off after the fallback: ' + off1 + ' / ' + off2);
    assert(await refused(app, 'dismiss', { screen: 'tabs' }) === 'resolved', 'dismiss tabs with no live tab root answers ok');
  } finally { await app.close(); }
  // under a classic root: selectTab, sheets and present coachHome refused; dismiss tabs answers ok and changes nothing
  const c = await stub('coach61');
  try {
    await hello(c, ALL);
    const m = [await refused(c, 'selectTab', { tab: 'log' }), await refused(c, 'sheets', { open: false }), await refused(c, 'present', { screen: 'coachHome' })];
    assert(/^off: /.test(m[0]) && /^off: /.test(m[1]) && /^not-presentable: /.test(m[2]), 'classic refusals: ' + J(m));
    assert(await refused(c, 'dismiss', { screen: 'tabs' }) === 'resolved' && (await state(c)).scene.fellBack === null, 'dismiss tabs under a classic root changes nothing');
  } finally { await c.close(); }
});

serial('P1: the funnel\'s order (covered before tabs.select, re-tap again:true); the scene\'s seq, selection and fallback survive a reload; a fallen-back scene\'s next document has no tabs', async () => {
  const app = await stub('tabs');
  try {
    await hello(app, ALL);
    await ev(app, async () => {
      const P = window.Capacitor.Plugins.TrovoShell;
      await P.model({ screen: 'coachHome', rev: 1, json: '{"v":1}' });
      await P.present({ screen: 'coachHome' });
    });
    await settle(app, 50);
    await ev(app, () => { window.__in.length = 0; });
    const a1 = await ev(app, () => window.__fpShell.tap('coach'));
    const a2 = await ev(app, () => window.__fpShell.tap('progress'));
    const a3 = await ev(app, () => window.__fpShell.tap('progress'));
    const inn = await ev(app, () => window.__in);
    assert(J(inn) === J([['shell.covered', { on: true }], ['tabs.select', { tab: 'coach', seq: 1 }], ['shell.covered', { on: false }],
      ['tabs.select', { tab: 'progress', seq: 2 }], ['tabs.select', { tab: 'progress', seq: 3, again: true }]]), 'funnel order: ' + J(inn));
    assert(a1.ok && a2.ok && a3.ok, 'the page\'s answers come back: ' + J([a1, a2, a3]));
    // the page's own selectTab moves the scene and sends no tabs.select (no echo); its call records currentTab
    const ans = await ev(app, () => window.Capacitor.Plugins.TrovoShell.selectTab({ tab: 'settings' }));
    assert(J(ans) === '{"tab":"settings","seq":4}', 'selectTab answers {tab, seq}: ' + J(ans));
    const same = await ev(app, () => window.Capacitor.Plugins.TrovoShell.selectTab({ tab: 'settings' }));
    assert(J(same) === '{"tab":"settings","seq":4}', 'the selected tab takes no seq: ' + J(same));
    await settle(app, 50);
    const rec = await ev(app, () => ({ inn: window.__in.slice(5), sel: window.__fpShell.calls.filter((c) => c[0] === 'selectTab') }));
    assert(rec.inn.length === 0 && rec.sel[0][2] && rec.sel[0][2].currentTab === 'log', 'no echo; currentTab recorded: ' + J(rec));
    // a deep link and a stray
    await ev(app, () => window.__fpShell.select('log', 'stray'));
    let st = await state(app);
    assert(st.scene.selected === 'log' && st.scene.seq === 5 && st.scene.strays === 1, 'stray counted and redirected: ' + J(st.scene));
    // a crossing tap: the answer reports the tab the owner tapped, with the newer seq
    const cross = await ev(app, () => { window.__fpShellCross = 'progress'; return window.Capacitor.Plugins.TrovoShell.selectTab({ tab: 'settings' }); });
    assert(J(cross) === '{"tab":"progress","seq":7}', 'a crossing tap wins the answer: ' + J(cross));
    // a reload: a new document of the same scene
    await app.reload();
    st = await state(app);
    assert(st.scene.selected === 'progress' && st.scene.seq === 7 && st.scene.docs === 2 && st.scene.coach === 'native' && !st.doc.sheetsOpen && st.doc.negotiated === null,
      'the scene survives the reload, the document starts fresh: ' + J(st));
    const r2 = await hello(app, ALL);
    assert(J(r2.up) === '["coachHome"]' && r2.tabs && r2.tabs.selected === 'progress' && r2.tabs.seq === 7, 'hello re-seeds the selection and names the native Coach tab in up: ' + J(r2));
    // the fallback survives too, and the next document has no tabs in its flag
    await ev(app, () => window.__fpShell.fallBack('failures'));
    await settle(app, 100);
    const fb = await ev(app, () => window.__in.filter((m) => m[0] === 'screens.off'));
    assert(J(fb) === J([['screens.off', { screen: 'coach', why: 'needs' }], ['screens.off', { screen: 'coachHome', why: 'needs' }], ['screens.off', { screen: 'tabs', why: 'failures' }]]),
      'the fallback\'s messages (every piece live under the tab root, then tabs): ' + J(fb));
    await app.reload();
    st = await state(app);
    const flagTabs = await ev(app, () => window.__FP_SHELL.tabs === undefined);
    assert(st.scene.fellBack && st.scene.fellBack.why === 'failures' && st.scene.root === 'tabs' && !st.live && flagTabs, 'fallen back across the reload: ' + J(st.scene));
    const r3 = await hello(app, ALL);
    assert(J(r3.screens) === '["coach"]' && r3.tabs === undefined, 'a later document negotiates on the classic rule: ' + J(r3));
  } finally { await app.close(); }
});

serial('P1: sheets answers 16 ms later by default with the bar\'s height (0 over a web tab, kept over a native Coach tab); a 61 page error fails close() unless pageErrors: \'allow\'; status {refresh: true}', async () => {
  const app = await stub('tabs', { init: 'window.__fpShellRefreshDelay = 30;' });
  try {
    await hello(app, ALL);
    const out = await ev(app, async () => {
      const P = window.Capacitor.Plugins.TrovoShell;
      const t0 = performance.now(); const a = await P.sheets({ open: true }); const dt = performance.now() - t0;
      const b = await P.sheets({ open: false });
      return { a, b, dt, log: window.__fpShell.sheetsLog.map((x) => x[1]) };
    });
    assert(out.dt >= 15, 'sheets answers about a frame later: ' + out.dt);
    assert(J(out.a) === '{"bar":{"h":0,"safe":34,"rev":1}}' && J(out.b) === '{"bar":{"h":83,"safe":34,"rev":2}}' && J(out.log) === '[true,false]', 'sheets: ' + J(out));
    await ev(app, async () => {
      const P = window.Capacitor.Plugins.TrovoShell;
      await P.model({ screen: 'coachHome', rev: 1, json: '{"v":1}' }); await P.present({ screen: 'coachHome' });
      await P.selectTab({ tab: 'coach' });
    });
    const c = await ev(app, () => window.Capacitor.Plugins.TrovoShell.sheets({ open: true }));
    assert(c.bar.h === 83, 'the bar stays over a native Coach tab: ' + J(c));
    // status {refresh: true}: recorded, the policy stamped, answered after the refresh delay; 10.5's fields
    const s = await ev(app, async () => {
      const P = window.Capacitor.Plugins.TrovoShell;
      const t0 = performance.now(); const st = await P.status({ refresh: true });
      return { st, dt: performance.now() - t0, rec: window.__fpShell.of('status') };
    });
    assert(J(s.rec[s.rec.length - 1]) === '{"refresh":true}' && typeof s.st.policy.at === 'number' && s.dt >= 25, 'refresh recorded and answered: ' + J(s));
    assert(s.st.root === 'tabs' && s.st.fellBack === null && J(s.st.switches) === '{"tabs":true}' && s.st.counters.strays && s.st.screens.tabs.on && s.st.screens.coachHome.live,
      'status: ' + J(s.st));
    const sw = await ev(app, () => window.Capacitor.Plugins.TrovoShell.setSwitch({ screen: 'tabs', on: false }));
    assert(sw.fellBack && sw.fellBack.why === 'switch' && sw.screens.tabs.off === 'device' && sw.switches.tabs === false, 'the switch falls back: ' + J(sw));
  } finally { await app.close(); }
  // classic root: tabs off needs root only when its own checks pass; the policy otherwise
  const c = await stub('coach61');
  try {
    const st = await ev(c, () => window.Capacitor.Plugins.TrovoShell.status());
    assert(st.root === 'classic' && st.screens.tabs.off === 'policy' && st.screens.coachHome.off === 'policy' && st.screens.coach.on, 'classic status: ' + J(st));
  } finally { await c.close(); }
  // a page error under a 61 flag fails close(); pageErrors: 'allow' lets it close; a 60 flag is unchanged
  const THROW = 'setTimeout(function(){ throw new Error("boom in the page") }, 0);';
  for (const [shell, allow, fails] of [['tabs', false, true], ['tabs', true, false], ['inert', false, false]]) {
    const b = await stub(shell, Object.assign({ init: THROW }, allow ? { pageErrors: 'allow' } : {}));
    await settle(b, 100);
    let msg = '';
    try { await b.close(); } catch (e) { msg = e.message; }
    assert(fails ? /boom in the page/.test(msg) : msg === '', shell + (allow ? ' allowed' : '') + ': ' + (msg || 'closed'));
  }
});

// ── P2: tabs mode ──────────────────────────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const PAGE = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
// The page with one piece of its text replaced, as an OTA could ship it (the piece must be there exactly once).
function edited(from, to) {
  const i = PAGE.indexOf(from);
  if (i < 0 || PAGE.indexOf(from, i + 1) >= 0) throw new Error('spec 122: not exactly one "' + from.slice(0, 50) + '" in index.html');
  return (src) => src.replace(from, () => to);
}
const TABS = (tabs) => Object.assign(JSON.parse(CONTRACT_FLAGS.tabs), tabs === undefined ? {} : { tabs });
const BAR = { h: 83, safe: 34 };
const pageBoot = (shell, extra) => boot(Object.assign({ native: true, shell }, extra || {}));
const helloIn = (app) => app.page.waitForFunction(() => window._fp && _fp.hello, null, { timeout: 15000 });
// What the page shows of the tab bar: the class, every --fp-* variable on <html>, its own #tabs and the lit tab.
const look = (app) => ev(app, () => {
  const r = document.documentElement, t = document.getElementById('tabs'), cs = getComputedStyle(t), vars = {};
  for (let i = 0; i < r.style.length; i++) if (r.style[i].indexOf('--fp-') === 0) vars[r.style[i]] = r.style.getPropertyValue(r.style[i]).trim();
  const lit = (sel) => Array.prototype.map.call(document.querySelectorAll(sel), (b) => b.getAttribute('data-tab')).join(',');
  return { cls: r.classList.contains('fp-tabs'), vars, own: cs.display !== 'none' && t.getBoundingClientRect().height > 0,
    display: cs.display, active: lit('.tab.active'), current: lit('.tab[aria-current="page"]'), tab: currentTab,
    route: _lastRenderedRoute, mode: _fp.tabs.mode, left: _fp.tabs.left, why: _fp.tabs.why, told: _fp.tabs.told,
    offCoach: _fp.off.coach || null, hello: window.__fpShell ? window.__fpShell.of('hello') : null,
    tabsCalls: window.__fpShell ? window.__fpShell.calls.filter((c) => ['selectTab', 'sheets', 'setSwitch'].indexOf(c[0]) >= 0
      || (c[0] === 'dismiss' && c[1] && c[1].screen === 'tabs')).map((c) => [c[0], c[1]]) : null,
    scene: window.__fpShell ? window.__fpShell.state() : null, build: APP_BUILD };
});
const dismissTabs = (o) => (o.tabsCalls || []).filter((c) => c[0] === 'dismiss').length;
// The one tabs call a tabs-mode document makes at boot of its own: the sheets baseline (P5, contract 3.4).
const BASELINE = J([['sheets', { open: false }]]);
// Back in classic: no class, no variable, the page's own bar with the tab it shows lit (aria-current too once the page
// has set it: a classic boot leaves it to the first switch, as before).
const classicLook = (o, tag, current) => {
  assert(!o.cls && J(o.vars) === '{}' && o.own && o.display !== 'none', tag + ': no fp-tabs, no --fp-*, its own #tabs: ' + J(o));
  assert(o.active === o.tab && (current === false ? o.current === '' || o.current === o.tab : o.current === o.tab),
    tag + ': the tab it shows is lit: ' + J([o.tab, o.active, o.current]));
};
const routeTab = (o) => String(o.route).split('/')[0];
// The shell's bar gone at the page's word: the scene fell back 'page' and recorded the decline (for this page build when
// the mock has heard it: the mock learns the page build from hello only).
const fellBackPage = (o, tag) => assert(o.scene.scene.fellBack && o.scene.scene.fellBack.why === 'page' && !o.scene.live
  && Object.prototype.hasOwnProperty.call(o.scene.scene.declined, 'tabs')
  && [o.build, o.scene.doc.page].indexOf(o.scene.scene.declined.tabs) >= 0, tag + ': the scene fell back page with tabs declined: ' + J(o.scene));
// The page's own tour of what a session does: every tab, a sheet, the runner, a toast.
async function TOUR() {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const t of ['progress', 'coach', 'settings', 'log']) { switchTab(t); await w(10); }
  openThemeSheet(); await w(30); closeThemeSheet(); await w(30);
  openDeckRunner('Push'); await w(30); closeDeckRunner(); await w(30);
  showToast('Saved'); await w(30);
}
const GETTER = (name) => 'Object.defineProperty(window, "' + name + '", { configurable: true, get: function () { return false; } });';
const HIDDEN = 'window.__vis = "hidden"; Object.defineProperty(document, "visibilityState", { configurable: true, get: function () { return window.__vis; } });';
// TrovoOta.confirm counted in window.__otaConfirms (opts.init, after the harness's native Capacitor): the OTA confirm
// _bootDone sends once per document, which the one-strike breaker waits for on a phone.
const OTA = 'window.Capacitor.Plugins.TrovoOta = { confirm: function () { window.__otaConfirms = (window.__otaConfirms || 0) + 1; return Promise.resolve({}); } };';
// The end of the boot as the owner's phone sees it: the error log (Settings > About), the OTA confirms and bootDone
// (null with no TrovoShell).
const bootEnds = (app) => ev(app, () => ({ err: JSON.parse(localStorage.getItem('kt_err_log') || '[]').map((e) => e.m),
  confirms: window.__otaConfirms || 0, bootDone: window.__fpShell ? __fpShell.of('bootDone').length : null }));
// A boot whose hello stayed silent (__fpShellHelloSilent): the case sends the hello that answers (the mock negotiates
// it on its scene as it stands then), then opens the chat with a key saved: the reply, the chat's state and what the
// page presented.
const chatAfter = (app) => ev(app, async () => {
  const w = (ms) => new Promise((z) => setTimeout(z, ms));
  window.__fpShellHelloSilent = false; _fp.hello = null; _fpHello();
  for (let i = 0; i < 100 && !_fp.hello; i++) await w(20);
  const r = { screens: _fp.hello && _fp.hello.screens, off: _fp.off.coach || null, live: _fpLive('coach') };
  const p0 = __fpShell.of('present').length;
  switchTab('coach'); openCoachChat(); await w(60);
  return Object.assign(r, { present: __fpShell.of('present').slice(p0), shown: !!_fp.shown.coach, web: !!document.getElementById('coach-input') });
});

serial('P2: inert without a usable tabs flag (I8): no fp-tabs, no --fp-*, the page\'s own #tabs; a tour sends no selectTab, sheets, setSwitch or dismiss tabs; hello names coach ([] without FP_NATIVE); a 61 tab root falls back page at that hello', async () => {
  const OTA_NO_TABS = edited('var FP_NATIVE=true, FP_TABS=true,', 'var FP_NATIVE=true, FP_TABS=false,');
  const OTA_NO_NATIVE = edited('var FP_NATIVE=true, FP_TABS=true,', 'var FP_NATIVE=false, FP_TABS=true,');
  const rows = [
    ['no shell', { shell: 'none' }, null],
    ['build 60, inert', { shell: 'inert' }, ['coach']],
    ['build 60, the chat', { shell: 'coach' }, ['coach']],
    ['61 classic, inert61', { shell: 'inert61' }, ['coach']],
    ['61 classic, coach61', { shell: 'coach61' }, ['coach']],
    ['the tabs flag with no TrovoShell', { shell: 'none', init: 'window.__FP_SHELL = ' + CONTRACT_FLAGS.tabs + ';' }, null],
    ['the tabs flag over build 60\'s 11 methods', { shell: 'tabs', shellMethods: SHELL_METHODS['60'] }, ['coach'], true],
    ['tabs.selected home', { shell: TABS({ bar: BAR, selected: 'home' }) }, ['coach'], true],
    ['tabs.bar.h a string', { shell: TABS({ bar: { h: '83', safe: 34 }, selected: 'log' }) }, ['coach'], true],
    ['tabs with no bar', { shell: TABS({ selected: 'log' }) }, ['coach'], true],
    ['FP_TABS false (a getter)', { shell: 'tabs', init: GETTER('FP_TABS') }, ['coach'], true],
    ['FP_TABS false (the page an OTA ships)', { shell: 'tabs', html: OTA_NO_TABS }, ['coach'], true],
    ['FP_NATIVE false (a getter)', { shell: 'tabs', init: GETTER('FP_NATIVE') }, [], true],
    ['FP_NATIVE false (the page an OTA ships)', { shell: 'tabs', html: OTA_NO_NATIVE }, [], true],
  ];
  // The boot block runs on every boot of every browser, shell 41-59 and build 60 phone, and its catch writes a throw to
  // the owner's error log and boots on: each row must boot and tour with the log empty, no page error, one OTA confirm
  // (every row is native) and bootDone once wherever a TrovoShell exists.
  const clean = async (app, tag, o) => {
    const e = await bootEnds(app);
    assert(e.err.length === 0 && app.errors.length === 0, tag + ': nothing in the error log, no page error: ' + J([e.err, app.errors]));
    assert(e.confirms === 1 && e.bootDone === (o.shell === 'none' ? null : 1), tag + ': one OTA confirm, bootDone once with a TrovoShell: ' + J(e));
  };
  for (const [tag, o0, names, falls] of rows) {
    const o = Object.assign({}, o0, { init: OTA + (o0.init || '') });
    const app = await pageBoot(o.shell, o);
    try {
      if (names) await helloIn(app);
      const first = await look(app);
      classicLook(first, tag + ' (boot)', false);
      await clean(app, tag + ' (boot)', o);
      await app.page.evaluate(TOUR);
      const out = await look(app);
      classicLook(out, tag + ' (after the tour)');
      await clean(app, tag + ' (after the tour)', o);
      assert(!out.mode && !out.left && !out.told && out.offCoach === null, tag + ': never in tabs mode: ' + J(out));
      assert(out.tabsCalls === null ? names === null : out.tabsCalls.length === 0, tag + ': no selectTab, sheets, setSwitch or dismiss tabs: ' + J(out.tabsCalls));
      if (names === null) assert(out.hello === null || out.hello.length === 0, tag + ': no hello: ' + J(out.hello));
      else assert(out.hello.length === 1 && J(out.hello[0].screens) === J(names), tag + ': hello names ' + J(names) + ': ' + J(out.hello));
      if (falls) {
        fellBackPage(out, tag);
        const got = await ev(app, () => _fp.hello);
        assert(got.screens.indexOf('tabs') < 0 && !out.mode, tag + ': answered without tabs, never in tabs mode: ' + J(got));
      }
    } finally { await app.close(); }
  }
});

serial('P2: the first frame (html.fp-tabs and the flag\'s bar on <html> before #tabs is in; #tabs hidden); hello names FP_SCREENS; a reply at seq 0 moves nothing and its newer bar sets the variables; the boot tab is fp_tab when it names a tab, and hello\'s reply then wins (a stale fp_tab gives way to the scene\'s seq 0)', async () => {
  const FIRST = '(function () { window.__ff = null; new MutationObserver(function (ms) { ms.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) {'
    + ' if (n.id === "tabs" && !window.__ff) { var r = document.documentElement; window.__ff = { cls: r.classList.contains("fp-tabs"), h: r.style.getPropertyValue("--fp-bar-h"),'
    + ' up: r.style.getPropertyValue("--fp-bar-up"), main: "_fp" in window }; } }); }); }).observe(document, { childList: true, subtree: true }); })();';
  // The first document: fp_tab 'home' (no tab) and a reply at seq 0 that names Progress, with a measured bar (rev 1).
  // Later documents get the mock's own reply (its scene); while __p2quiet is set the boot's hello stays silent and the
  // case sends the one that answers, so the boot tab is seen before hello's reply.
  const app = await pageBoot('tabs', { init: FIRST
    + 'if (!sessionStorage.getItem("__p2")) { sessionStorage.setItem("__p2", "1"); sessionStorage.setItem("fp_tab", "home");'
    + ' window.__fpShellHelloTabs = { selected: "progress", seq: 0, bar: { h: 49, safe: 0, rev: 1 } }; }'
    + 'if (sessionStorage.getItem("__p2quiet")) window.__fpShellHelloSilent = true;' });
  try {
    await helloIn(app);
    await settle(app, 100);
    const ff = await ev(app, () => window.__ff);
    assert(ff && ff.cls && ff.h === '83px' && ff.up === '83px' && ff.main === false, 'the head set the class and the flag\'s bar before #tabs was in: ' + J(ff));
    let o = await look(app);
    const screens = await ev(app, () => FP_SCREENS.slice());
    assert(o.cls && o.display === 'none' && !o.own, '#tabs is hidden in tabs mode: ' + J(o));
    assert(o.hello.length === 1 && J(o.hello[0].screens) === J(screens) && screens.indexOf('coach') >= 0 && screens.indexOf('tabs') >= 0,
      'hello names FP_SCREENS (coach and tabs among them): ' + J(o.hello));
    assert(o.tab === 'log' && routeTab(o) === 'log' && o.active === 'log' && J(o.tabsCalls) === BASELINE, 'fp_tab home is no tab: the flag\'s Log; seq 0 moves nothing: ' + J(o));
    assert(J(o.vars) === J({ '--fp-bar-h': '49px', '--fp-safe-b': '0px', '--fp-sheet-b': '16px', '--fp-clear': '49px', '--fp-bar-up': '49px' }),
      'the reply\'s bar (rev 1) sets the variables: ' + J(o.vars));
    // fp_tab, written by every local switch in tabs mode: a reload boots on it. Written here with no selectTab (as when a
    // local switch's selectTab never reached the shell) it is stale: the scene still shows the flag's Log at seq 0, and
    // hello's reply wins although its seq is 0 (contract 2.4: the page saw no seq for the tab it booted on)
    await ev(app, () => { sessionStorage.setItem('fp_tab', 'settings'); sessionStorage.setItem('__p2quiet', '1'); });
    await app.reload(); await settle(app, 60);
    o = await look(app);
    let ends = await ev(app, () => ({ hello: _fp.hello, bootDone: __fpShell.of('bootDone').length, errors: JSON.parse(localStorage.getItem('kt_err_log') || '[]').length }));
    assert(o.mode && ends.hello === null && o.tab === 'settings' && o.route === 'settings' && o.active === 'settings' && o.current === 'settings',
      'fp_tab settings: the boot tab, before hello answers: ' + J([o, ends.hello]));
    assert(ends.bootDone === 1 && ends.errors === 0 && app.errors.length === 0, 'booted on Settings, the boot ran to its end (bootDone) with no error: ' + J([ends, app.errors]));
    await ev(app, () => { sessionStorage.removeItem('__p2quiet'); window.__fpShellHelloSilent = false; _fpHello(); });
    await helloIn(app); await settle(app, 60);
    o = await look(app);
    const kept = await ev(app, () => sessionStorage.getItem('fp_tab'));
    assert(o.mode && o.tab === 'log' && routeTab(o) === 'log' && o.active === 'log' && o.current === 'log' && J(o.tabsCalls) === BASELINE
      && o.scene.scene.selected === 'log' && o.scene.scene.seq === 0 && kept === 'log',
      'a stale fp_tab gives way to hello\'s reply at seq 0 (the scene\'s Log), with no selectTab: ' + J([o, kept]));
    const sw = await ev(app, async () => { switchTab('progress'); await new Promise((r) => setTimeout(r, 30)); return sessionStorage.getItem('fp_tab'); });
    assert(sw === 'progress', 'a local switch writes fp_tab: ' + sw);
    await app.reload(); await helloIn(app); await settle(app, 60);
    o = await look(app);
    ends = await ev(app, () => ({ bootDone: __fpShell.of('bootDone').length, errors: JSON.parse(localStorage.getItem('kt_err_log') || '[]').length }));
    assert(o.tab === 'progress' && o.route === 'progress' && o.active === 'progress' && J(o.tabsCalls) === BASELINE && o.scene.scene.seq === 1,
      'a reload boots on the tab it showed, which hello\'s reply (the scene\'s seq 1) keeps: ' + J(o));
    assert(ends.bootDone === 1 && ends.errors === 0 && app.errors.length === 0, 'booted on Progress, the boot ran to its end: ' + J([ends, app.errors]));
  } finally { await app.close(); }
});

serial('P2: hello adopts a newer selection with no selectTab; the funnel (one selectTab per switchTab, before the local switch; answers correct only the newest request; a crossing tap wins; no bounce); tabs.select newer, older, again, bad-args; tabs.bar and the variables at every zoom; visibility', async () => {
  const app = await pageBoot('tabs', { seed: { kt_apikey: 'sk-ant-test' }, init: 'window.__fpShellPre = { selected: "progress", seq: 3 };' });
  try {
    await helloIn(app);
    await settle(app, 100);
    const a = await look(app);
    assert(a.tab === 'progress' && a.route === 'progress' && a.active === 'progress' && J(a.tabsCalls) === BASELINE, 'hello\'s newer selection, adopted with no selectTab: ' + J(a));
    const f = await ev(app, async () => {
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      const r = {};
      const sel = () => __fpShell.calls.filter((c) => c[0] === 'selectTab');
      const ts = () => __fpShell.sent.filter((s) => s[0] === 'tabs.select');
      r.seq0 = _fp.tabs.seq;
      switchTab('settings'); r.now = currentTab; await w(30);
      r.one = sel().map((c) => [c[1], c[2].currentTab]);
      switchTab('coach', { intent: 'chat' }); switchTab('log', { intent: 'nope' }); switchTab('progress', { intent: 'intake' }); await w(30);
      r.intents = sel().slice(1).map((c) => c[1]);
      // two quick selections: their answers never bounce the page back to the first
      const seen = [], real = window._switchTabLocal;
      window._switchTabLocal = function (t) { seen.push(t); return real(t); };
      switchTab('log'); switchTab('settings'); await w(60);
      r.quick = { seen: seen.slice(), tab: currentTab, seq: _fp.tabs.seq, shell: __fpShell.state().scene };
      // a tap crossing the page's own selection: the page ends on the tab the owner tapped
      seen.length = 0; window.__fpShellCross = 'coach'; switchTab('log'); await w(120);
      r.cross = { seen: seen.slice(), tab: currentTab, seq: _fp.tabs.seq, shell: __fpShell.state().scene, last: ts().slice(-1)[0] };
      window._switchTabLocal = real;
      // the owner's tap: tabs.select, no selectTab, answered after the new tab is drawn
      const renders = [], realR = window.render;
      window.render = function () { const x = realR.apply(this, arguments); renders.push([currentTab, performance.now()]); return x; };
      const n0 = sel().length;
      const ans = await __fpShell.tap('settings');
      const msg = ts().slice(-1)[0];
      window.render = realR;
      r.tap = { ans, tab: currentTab, sel: sel().length - n0, msg: msg[1], drawn: renders.some((x) => x[0] === 'settings' && x[1] <= msg[4]) };
      // an older tabs.select changes nothing and answers the page's tab
      const s0 = _fp.tabs.seq;
      r.older = { ans: await FPScreens.call('tabs.select', { tab: 'log', seq: 1 }), tab: currentTab, seq: _fp.tabs.seq, s0 };
      // the owner's re-tap of Coach: back to the hub, not while a reply is in flight
      await __fpShell.tap('coach'); coachView = 'chat'; render(); await w(20);
      r.again = { ans: await __fpShell.tap('coach'), msg: ts().slice(-1)[0][1], view: coachView };
      coachView = 'chat'; coachLoading = true; render(); await w(20);
      await __fpShell.tap('coach'); r.againLoading = { view: coachView, msg: ts().slice(-1)[0][1] };
      coachLoading = false; render();
      // bad-args, checked before anything moves
      const b0 = { tab: currentTab, seq: _fp.tabs.seq };
      r.bad = [await FPScreens.call('tabs.select', { tab: 'home', seq: 99 }), await FPScreens.call('tabs.select', { tab: 'log', seq: '1' }),
        await FPScreens.call('tabs.select', { tab: 'log', seq: 99, again: 1 }), await FPScreens.call('tabs.select', { tab: 'log' }),
        await FPScreens.call('tabs.select', { tab: 'log', seq: 1.5 })];
      r.afterBad = { b0, tab: currentTab, seq: _fp.tabs.seq };
      // visibility: every visibilitychange in tabs mode, on a web tab too
      switchTab('log'); await w(20);
      const v0 = __fpShell.of('visibility').length;
      document.dispatchEvent(new Event('visibilitychange')); await w(10);
      r.vis = { n: __fpShell.of('visibility').length - v0, covered: _fpCovered(), args: __fpShell.of('visibility').slice(-1)[0] };
      return r;
    });
    assert(f.seq0 === 3, 'hello\'s seq is the page\'s: ' + f.seq0);
    assert(f.now === 'settings' && J(f.one) === J([[{ tab: 'settings' }, 'progress']]), 'one selectTab {tab}, sent before the local switch, which runs at once: ' + J(f));
    assert(J(f.intents) === J([{ tab: 'coach', intent: 'chat' }, { tab: 'log' }, { tab: 'progress', intent: 'intake' }]), 'the intent goes when it is chat or intake: ' + J(f.intents));
    assert(J(f.quick.seen) === '["log","settings"]' && f.quick.tab === 'settings' && f.quick.shell.selected === 'settings' && f.quick.seq === f.quick.shell.seq,
      'two quick selections never bounce back: ' + J(f.quick));
    assert(J(f.cross.seen) === '["log","coach"]' && f.cross.tab === 'coach' && f.cross.shell.selected === 'coach' && f.cross.seq === f.cross.shell.seq
      && f.cross.last[1].tab === 'coach' && J(f.cross.last[2]) === '{"ok":true,"tab":"coach"}', 'a crossing tap wins, and its tabs.select (no newer) changes nothing: ' + J(f.cross));
    assert(f.tap.ans.ok && f.tap.ans.tab === 'settings' && f.tap.tab === 'settings' && f.tap.sel === 0 && !('again' in f.tap.msg) && f.tap.drawn,
      'the owner\'s tap: switched with no selectTab, answered after Settings was drawn: ' + J(f.tap));
    assert(J(f.older.ans) === '{"ok":true,"tab":"settings"}' && f.older.tab === 'settings' && f.older.seq === f.older.s0, 'an older tabs.select changes nothing: ' + J(f.older));
    assert(f.again.ans.ok && f.again.msg.again === true && f.again.view === 'home', 'the re-tap of Coach (again) goes back to the hub: ' + J(f.again));
    assert(f.againLoading.msg.again === true && f.againLoading.view === 'chat', '...but not while a reply is in flight: ' + J(f.againLoading));
    assert(f.bad.every((x) => x.ok === false && x.error === 'bad-args') && f.afterBad.tab === f.afterBad.b0.tab && f.afterBad.seq === f.afterBad.b0.seq,
      'bad-args for tab home, seq \'1\' or 1.5 or none, again 1: ' + J(f.bad));
    assert(f.vis.n === 1 && !f.vis.covered && f.vis.args.state === 'visible' && typeof f.vis.args.at === 'number', 'visibility on a web tab in tabs mode: ' + J(f.vis));
    // the bar's numbers in CSS px at the zoom (contract 7.2): h, safe, max(safe, 16), max(h, safe), the newest h above 0
    const v = await ev(app, async () => {
      const VARS = ['--fp-bar-h', '--fp-safe-b', '--fp-sheet-b', '--fp-clear', '--fp-bar-up'];
      const vars = () => VARS.map((k) => document.documentElement.style.getPropertyValue(k).trim());
      const steps = [];
      const step = async (tag, z, args) => { const ans = args ? await FPScreens.call('tabs.bar', args) : null; steps.push({ tag, z, ans, vars: vars() }); };
      await step('83/34 rev 2', 1, { h: 83, safe: 34, rev: 2 });
      applyDynamicType(1.12); await step('zoom 1.12', 1.12);
      applyDynamicType(1.25); await step('zoom 1.25', 1.25);
      await step('hidden: h 0 rev 3', 1.25, { h: 0, safe: 34, rev: 3 });
      await step('49/0 rev 4', 1.25, { h: 49, safe: 0, rev: 4 });
      await step('rev 4 again', 1.25, { h: 90, safe: 40, rev: 4 });
      await step('rev 1', 1.25, { h: 90, safe: 40, rev: 1 });
      const bad = [];
      for (const a of [{ h: 83.5, safe: 34, rev: 9 }, { h: '83', safe: 34, rev: 9 }, { h: 83, safe: -1, rev: 9 }, { h: 83, safe: 34 }]) bad.push(await FPScreens.call('tabs.bar', a));
      await step('after bad-args', 1.25);
      applyDynamicType(1); await step('zoom 1', 1);
      return { steps, bad, rev: _fp.tabs.rev };
    });
    const want = [[83, 34, 34, 83, 83], [83, 34, 34, 83, 83], [83, 34, 34, 83, 83], [0, 34, 34, 34, 83], [49, 0, 16, 49, 49], [49, 0, 16, 49, 49],
      [49, 0, 16, 49, 49], [49, 0, 16, 49, 49], [49, 0, 16, 49, 49]];
    v.steps.forEach((s, i) => {
      const ok = s.vars.every((x, k) => /px$/.test(x) && Math.abs(parseFloat(x) - want[i][k] / s.z) <= 0.011);
      assert(ok && (s.ans === null || J(s.ans) === '{"ok":true}'), s.tag + ': ' + J(s.vars) + ' at zoom ' + s.z + ' (want ' + J(want[i].map((n) => Math.round(n / s.z * 100) / 100)) + ')');
    });
    assert(v.bad.every((x) => x.ok === false && x.error === 'bad-args') && v.rev === 4, 'tabs.bar: bad-args unless three whole numbers; older revs change nothing: ' + J(v));
    // a hello reply made before a page selection that is still unanswered (a slow hello, dev-nav at 120 ms): the page
    // keeps its own tab and leaves the shell's selection to that answer, never bouncing to the reply's tab and back
    const h = await ev(app, async () => {
      const w = (ms) => new Promise((z) => setTimeout(z, ms));
      const TS = Capacitor.Plugins.TrovoShell, realSel = TS.selectTab, realHello = TS.hello, realLocal = window._switchTabLocal;
      switchTab('log'); await w(30);
      const sc = __fpShell.state().scene, seen = [];
      let release = null;
      TS.selectTab = function (x) { return new Promise((res) => { release = () => res(realSel(x)); }); };
      TS.hello = function (x) { __fpShell.calls.push(['hello', x]);
        return Promise.resolve({ v: 1, screens: ['tabs'], tabs: { selected: sc.selected, seq: sc.seq + 1, bar: { h: 83, safe: 34, rev: 0 } } }); };
      window._switchTabLocal = function (t) { seen.push(t); return realLocal(t); };
      switchTab('settings'); _fp.hello = null; _fpHello(); await w(40);
      const mid = { tab: currentTab, seq: _fp.tabs.seq, pend: _fp.tabs.pend };
      release(); await w(40);
      TS.selectTab = realSel; TS.hello = realHello; window._switchTabLocal = realLocal;
      return { from: sc.selected, mid, seen, tab: currentTab, pend: _fp.tabs.pend, shell: __fpShell.state().scene.selected };
    });
    assert(h.from === 'log' && h.mid.tab === 'settings' && h.mid.pend === 1 && J(h.seen) === '["settings"]' && h.tab === 'settings' && h.pend === 0 && h.shell === 'settings',
      'hello\'s reply leaves the tab to a page selection still unanswered: ' + J(h));
  } finally { await app.close(); }
  // outside tabs mode (a 61 classic root): every tabs.* answers off once its arguments pass; visibility only while covered
  const c = await pageBoot('coach61');
  try {
    await helloIn(c);
    const o = await ev(c, async () => {
      const r = { sel: await FPScreens.call('tabs.select', { tab: 'log', seq: 1 }), bar: await FPScreens.call('tabs.bar', { h: 83, safe: 34, rev: 1 }),
        bad: await FPScreens.call('tabs.select', { tab: 'home', seq: 1 }), mode: _fp.tabs.mode };
      const v0 = __fpShell.of('visibility').length;
      document.dispatchEvent(new Event('visibilitychange')); await new Promise((z) => setTimeout(z, 10));
      r.vis = __fpShell.of('visibility').length - v0;
      return r;
    });
    assert(J(o.sel) === '{"ok":false,"error":"off"}' && J(o.bar) === '{"ok":false,"error":"off"}' && o.bad.error === 'bad-args' && !o.mode && o.vis === 0,
      'coach61: tabs.* off, arguments first, no visibility while uncovered: ' + J(o));
  } finally { await c.close(); }
});

serial('P2: covered in tabs mode is the Coach tab not web (contract 8.4): booted on Coach before hello it is waiting (toasts and confirms go to the shell, no scripted focus); Log never; after a hello without coachHome the web Coach, covered only by the shell\'s word, which _fpDown keeps', async () => {
  const app = await pageBoot(TABS({ bar: BAR, selected: 'coach' }), { seed: { kt_apikey: 'sk-ant-test' },
    init: 'window.__fpShellHelloSilent = true; window.__fpTabsFailsafeMs = 1e9;' });
  try {
    const out = await ev(app, async () => {
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      const n = (k) => __fpShell.of(k).length;
      const r = {};
      r.boot = { tab: currentTab, route: _lastRenderedRoute, mode: _fpCoachMode(), covered: _fpCovered(), hello: _fp.hello };
      // forwarded while covered: the web #toast stays down
      let t0 = n('toast'), c0 = n('confirm');
      showToast('Saved'); showUndoToast('Removed', function () {}); _ktConfirm({ title: 'Sure?', body: '', confirmLabel: 'Yes', onConfirm: function () {} });
      r.fwd = { toasts: n('toast') - t0, confirms: n('confirm') - c0, undo: !!__fpShell.of('toast').slice(-1)[0].undo, web: document.getElementById('toast').classList.contains('show') };
      // no scripted focus while covered: the chat's draft and the sheet observer
      let focus = 0; const realFocus = HTMLElement.prototype.focus;
      HTMLElement.prototype.focus = function () { focus++; return realFocus.apply(this, arguments); };
      const draftAndSheet = async () => {
        coachView = 'chat'; render(); await w(20);
        const box = document.getElementById('coach-input'); box.value = 'draft'; realFocus.call(box);
        focus = 0; render(); await w(20);
        const d = { focus, value: document.getElementById('coach-input').value };
        const btn = document.querySelector('#screen button'); realFocus.call(btn);
        const sh = document.createElement('div'); sh.className = 'kt-sheet-overlay'; document.body.appendChild(sh); await w(10);
        document.activeElement.blur(); focus = 0; sh.remove(); await w(30);
        return { draft: d, sheet: { focus, back: document.activeElement === btn } };
      };
      r.covered = await draftAndSheet();
      // Log is never covered, even before hello
      switchTab('log'); await w(20);
      t0 = n('toast'); showToast('Saved');
      r.log = { covered: _fpCovered(), mode: _fpCoachMode(), fwd: n('toast') - t0, web: document.getElementById('toast').classList.contains('show') };
      switchTab('coach'); await w(20); r.back = _fpCovered();
      // hello answers without coachHome (the policy has it off; this page names it, P7): the Coach tab is the web's
      window.__fpShellOff = ['coachHome']; window.__fpShellHelloSilent = false; _fpHello();
      for (let i = 0; i < 100 && !_fp.hello; i++) await w(20);
      await w(60);
      r.after = { mode: _fpCoachMode(), covered: _fpCovered(), cov: _fp.covered, screens: _fp.hello.screens };
      t0 = n('toast'); showToast('Saved');
      r.after.fwd = n('toast') - t0; r.after.web = document.getElementById('toast').classList.contains('show');
      r.uncovered = await draftAndSheet();
      // the shell's word covers the web Coach; Log stays uncovered under it (and render gives a field its focus back)
      await FPScreens.call('shell.covered', { on: true });
      r.word = { coach: _fpCovered() };
      switchTab('log'); switchLogSub('body'); await w(20);
      const field = () => document.getElementById('bwVal');
      realFocus.call(field()); focus = 0; render(); await w(20);
      r.word.log = { covered: _fpCovered(), cov: _fp.covered, focus, refocused: document.activeElement === field() };
      _fpDown('coach'); r.word.down = _fp.covered;
      HTMLElement.prototype.focus = realFocus;
      return r;
    });
    assert(out.boot.tab === 'coach' && out.boot.route === 'coach/home' && out.boot.mode === 'waiting' && out.boot.covered && out.boot.hello === null,
      'booted on the flag\'s Coach, waiting and covered before hello: ' + J(out.boot));
    assert(out.fwd.toasts === 2 && out.fwd.confirms === 1 && out.fwd.undo && !out.fwd.web, 'toasts, the Undo toast and the confirm go to the shell: ' + J(out.fwd));
    assert(out.covered.draft.focus === 0 && out.covered.draft.value === 'draft' && out.covered.sheet.focus === 0 && !out.covered.sheet.back,
      'no scripted focus while covered (the chat\'s draft, the sheet observer): ' + J(out.covered));
    assert(!out.log.covered && out.log.mode === 'waiting' && out.log.fwd === 0 && out.log.web && out.back, 'Log is never covered: ' + J(out.log));
    assert(out.after.mode === 'web' && !out.after.covered && out.after.cov === false && out.after.screens.indexOf('coachHome') < 0 && out.after.fwd === 0 && out.after.web,
      'after a hello without coachHome: the web Coach, uncovered, the web toast: ' + J(out.after));
    assert(out.uncovered.draft.focus > 0 && out.uncovered.sheet.focus > 0 && out.uncovered.sheet.back, 'uncovered, the draft and the sheet observer give focus back: ' + J(out.uncovered));
    assert(out.word.coach && !out.word.log.covered && out.word.log.cov === true && out.word.log.focus > 0 && out.word.log.refocused && out.word.down === true,
      'shell.covered covers the Coach tab only; _fpDown keeps the shell\'s word in tabs mode: ' + J(out.word));
  } finally { await app.close(); }
});

serial('P2: the way out when the shell says so (a fallback, a hello without tabs, an off refusal): the page\'s own bar on the same tab, nothing sent back, selectTab no more, tabs.* off; a later hello naming tabs is ignored; other refusals change nothing', async () => {
  // the scene falls back (policy): screens.off tabs
  const app = await pageBoot('tabs');
  try {
    await helloIn(app);
    await ev(app, () => switchTab('progress'));
    await settle(app, 60);
    await ev(app, () => window.__fpShell.fallBack('policy'));
    await settle(app, 150);
    let o = await look(app);
    classicLook(o, 'fallBack');
    assert(!o.mode && o.left && o.why === 'policy' && !o.told && o.tab === 'progress' && o.route === 'progress' && dismissTabs(o) === 0 && o.offCoach !== 'tabs',
      'fallBack: out on the same tab, nothing sent back: ' + J(o));
    const after = await ev(app, async () => {
      const w = (ms) => new Promise((r) => setTimeout(r, ms));
      const n0 = __fpShell.of('selectTab').length;
      switchTab('settings'); await w(30);
      const r = { sel: __fpShell.of('selectTab').length - n0, tab: currentTab,
        select: await FPScreens.call('tabs.select', { tab: 'coach', seq: 99 }), bar: await FPScreens.call('tabs.bar', { h: 49, safe: 0, rev: 99 }) };
      const v0 = __fpShell.of('visibility').length; document.dispatchEvent(new Event('visibilitychange')); await w(10);
      r.vis = __fpShell.of('visibility').length - v0;
      // a hello answer naming tabs, after the way out: read for its other pieces, its tabs ignored
      Capacitor.Plugins.TrovoShell.hello = function (a) { __fpShell.calls.push(['hello', a]);
        return Promise.resolve({ v: 1, screens: ['tabs'], tabs: { selected: 'coach', seq: 120, bar: { h: 49, safe: 0, rev: 120 } } }); };
      _fp.hello = null; _fpHello(); await w(40);
      r.late = { asked: __fpShell.of('hello').slice(-1)[0].screens, mode: _fp.tabs.mode, tab: currentTab, seq: _fp.tabs.seq, rev: _fp.tabs.rev, screens: _fp.hello.screens };
      return r;
    });
    assert(after.sel === 0 && after.tab === 'settings' && J(after.select) === '{"ok":false,"error":"off"}' && J(after.bar) === '{"ok":false,"error":"off"}' && after.vis === 0,
      'after the way out: switchTab sends nothing, tabs.* off, visibility only while covered: ' + J(after));
    o = await look(app);
    classicLook(o, 'a later hello');
    assert(J(after.late.asked) === '["coach"]' && !after.late.mode && after.late.tab === 'settings' && after.late.seq < 120 && after.late.rev < 120 && dismissTabs(o) === 0,
      'a later hello naming tabs is ignored: ' + J(after.late));
  } finally { await app.close(); }
  // hello's reply leaves tabs out (the policy turned it off): out at hello, nothing sent back
  const off = await pageBoot('tabs', { init: 'window.__fpShellOff = ["tabs"];' });
  try {
    await helloIn(off); await settle(off, 60);
    const o = await look(off);
    classicLook(o, 'a reply without tabs');
    assert(!o.mode && o.why === 'hello' && !o.told && dismissTabs(o) === 0 && o.offCoach !== 'tabs' && o.scene.scene.fellBack.why === 'policy',
      'a reply without tabs: out, nothing sent back: ' + J(o));
  } finally { await off.close(); }
  // selectTab refused: another code is logged and changes nothing; off leaves tabs mode with nothing sent back
  const ref = await pageBoot('tabs');
  try {
    await helloIn(ref);
    const r = await ev(ref, async () => {
      const w = (ms) => new Promise((z) => setTimeout(z, ms));
      const out = {};
      for (const words of ['bad-tab: progress is not a tab', 'bad message: selectTab']) {
        __fpShell.refuse.selectTab = words;
        switchTab(words.indexOf('bad-tab') === 0 ? 'progress' : 'settings'); await w(40);
        out[words.split(':')[0]] = { mode: _fp.tabs.mode, tab: currentTab, cls: document.documentElement.classList.contains('fp-tabs'),
          logged: __fpShell.of('log').some((l) => l.text.indexOf(words) >= 0) };
      }
      __fpShell.refuse.selectTab = 'off: no live tab root';
      switchTab('coach'); await w(60);
      out.off = { mode: _fp.tabs.mode, tab: currentTab, why: _fp.tabs.why };
      return out;
    });
    assert(r['bad-tab'].mode && r['bad-tab'].cls && r['bad-tab'].tab === 'progress' && r['bad-tab'].logged, 'bad-tab: logged, still tabs mode: ' + J(r));
    assert(r['bad message'].mode && r['bad message'].tab === 'settings' && r['bad message'].logged, 'build 60\'s words: no code acted on, still tabs mode: ' + J(r));
    const o = await look(ref);
    classicLook(o, 'off refusal');
    assert(!r.off.mode && r.off.why === 'off' && r.off.tab === 'coach' && o.tab === 'coach' && dismissTabs(o) === 0 && o.offCoach !== 'tabs',
      'selectTab refused off: out on the tab it switched to, nothing sent back: ' + J([r.off, o]));
    // A unit check of _fpTabsRefused, the handler P5's sheets announcer will share with selectTab, called here with sheets'
    // label: P2 sends no sheets call, so this cannot hold the sheets path. The acceptance for sheets refused 'off: no live
    // tab root' is P5's spec 124 case, which drives the real call (10-page.md P5, The hold). The next document is in tabs
    // mode again (a refusal is no fallback); another code is logged and changes nothing, off leaves with nothing sent back
    await ref.reload(); await helloIn(ref);
    const s = await ev(ref, async () => {
      const w = (ms) => new Promise((z) => setTimeout(z, ms));
      const out = { mode0: _fp.tabs.mode };
      _fpTabsRefused(new Error('bad message: sheets'), 'sheets'); await w(20);
      out.other = { mode: _fp.tabs.mode, logged: __fpShell.of('log').some((l) => l.text.indexOf('sheets refused: bad message: sheets') >= 0) };
      _fpTabsRefused(new Error('off: no live tab root'), 'sheets'); await w(40);
      out.off = { mode: _fp.tabs.mode, why: _fp.tabs.why, told: _fp.tabs.told };
      return out;
    });
    const so = await look(ref);
    classicLook(so, 'the refusal handler, off with sheets\' label');
    assert(s.mode0 && s.other.mode && s.other.logged && !s.off.mode && s.off.why === 'off' && !s.off.told && dismissTabs(so) === 0 && so.offCoach !== 'tabs',
      'the refusal handler with sheets\' label (a unit check: the sheets call is P5\'s): another code is logged, off leaves with nothing sent back: ' + J([s, so.tabsCalls]));
  } finally { await ref.close(); }
});

serial('P2: a way out at hello renders after the leave, once the take-over has read up: a reply without tabs (the policy turned tabs off) that negotiates the overlay chat presents it once, after the leave (a conforming shell: no up), or takes it over when up names it (no present, no dismiss); with nothing wanted the page still renders on its own bar', async () => {
  // Each boot's hello stays silent and the case sends the one that answers, with spies on render, present and dismiss
  // that note whether the page was still in tabs mode at each call (contract 3.2's order: leave, take over, then
  // render). The policy turned tabs off, so the scene falls back at that hello and negotiates 60's overlay chat.
  const SILENT = 'window.__fpShellHelloSilent = true; window.__fpTabsFailsafeMs = 1e9; window.__fpShellOff = ["tabs"];';
  const answer = (app, chat) => ev(app, (chat) => {
    if (chat) { coachView = 'chat'; render(); }
    const r = { hello: _fp.hello, mode: _fp.tabs.mode, tab: currentTab, web: !!document.getElementById('coach-input') };
    window.__order = [];
    const P = Capacitor.Plugins.TrovoShell, present = P.present, dismiss = P.dismiss, paint = window.render;
    P.present = function (a) { __order.push(['present', a && a.screen, _fp.tabs.mode]); return present.apply(this, arguments); };
    P.dismiss = function (a) { __order.push(['dismiss', a && a.screen, _fp.tabs.mode]); return dismiss.apply(this, arguments); };
    window.render = function () { __order.push(['render', null, _fp.tabs.mode]); return paint.apply(this, arguments); };
    window.__fpShellHelloSilent = false; _fpHello();
    return r;
  }, chat);
  const after = async (app) => {
    await helloIn(app);
    await settle(app, 100);
    const o = await look(app);
    const r = await ev(app, () => ({ order: window.__order, present: __fpShell.of('present'), dismiss: __fpShell.of('dismiss'),
      shown: !!_fp.shown.coach, live: _fpLive('coach'), want: _fpWantAny(), view: coachView }));
    const of = (k) => r.order.filter((x) => x[0] === k);
    Object.assign(r, { renders: of('render'), presents: of('present'), dismisses: of('dismiss'),
      firstRender: r.order.findIndex((x) => x[0] === 'render'), firstPresent: r.order.findIndex((x) => x[0] === 'present') });
    return [o, r];
  };
  const outAtHello = (o, r, tag) => {
    classicLook(o, tag);
    assert(!o.mode && o.why === 'hello' && !o.told && dismissTabs(o) === 0 && o.scene.scene.fellBack.why === 'policy', tag + ': out at hello, nothing sent back: ' + J(o));
    assert(r.renders.length > 0 && r.renders.every((x) => x[2] === false), tag + ': rendered after the leave, and never in tabs mode once hello answered: ' + J(r.order));
  };
  // a conforming shell pops the chat when it falls back (contract 10.3), so its reply names no up: booted on Coach with
  // the web chat drawn, the page leaves tabs mode and its render then presents 60's overlay chat, once
  let app = await pageBoot(TABS({ bar: BAR, selected: 'coach' }), { seed: { kt_apikey: 'sk-ant-test' }, init: SILENT });
  try {
    const pre = await answer(app, true);
    const [o, r] = await after(app);
    assert(pre.hello === null && pre.mode && pre.tab === 'coach' && pre.web, 'the web chat was drawn before hello answered: ' + J(pre));
    outAtHello(o, r, 'a conforming fallback at hello, the chat drawn');
    assert(J(r.present) === '[{"screen":"coach"}]' && J(r.presents) === '[["present","coach",false]]' && r.firstRender >= 0 && r.firstRender < r.firstPresent
      && r.dismiss.length === 0 && r.shown && r.live && r.view === 'chat' && o.scene.scene.pushed === true,
      'the overlay chat presented once, by the render after the leave; no dismiss: ' + J(r));
  } finally { await app.close(); }
  // a reply that names the chat up (the mock's __fpShellUp; 10.3 rules it out for a conforming shell): the take-over
  // reads up before the render, so the chat the shell still shows is taken over, not presented again
  app = await pageBoot(TABS({ bar: BAR, selected: 'coach' }), { seed: { kt_apikey: 'sk-ant-test' }, init: SILENT + 'window.__fpShellUp = ["coach"];' });
  try {
    const pre = await answer(app, true);
    const [o, r] = await after(app);
    assert(pre.hello === null && pre.mode && pre.tab === 'coach' && pre.web, 'the web chat was drawn before hello answered: ' + J(pre));
    outAtHello(o, r, 'a reply without tabs, the chat up');
    assert(r.present.length === 0 && r.dismiss.length === 0 && r.shown && r.live && r.view === 'chat',
      'the chat the shell still shows is taken over: no present, no dismiss: ' + J(r));
  } finally { await app.close(); }
  // nothing wanted (Log, no key): no take-over and no native screen, and the leave still renders the page on its own bar
  app = await pageBoot('tabs', { init: SILENT });
  try {
    const pre = await answer(app, false);
    const [o, r] = await after(app);
    assert(pre.hello === null && pre.mode && pre.tab === 'log', 'in tabs mode on Log before hello answered: ' + J(pre));
    outAtHello(o, r, 'a reply without tabs, nothing wanted');
    assert(!r.want && r.presents.length === 0 && r.dismisses.length === 0 && r.present.length === 0 && r.dismiss.length === 0 && routeTab(o) === 'log',
      'nothing wanted: no present, no dismiss, the same tab drawn: ' + J([r, o.route]));
  } finally { await app.close(); }
});

serial('P2: the way out on the page\'s own (a malformed reply, a rejected or thrown hello): one dismiss tabs, the scene falls back page, the chat stays off for the document (no present coach), the page\'s own bar (I14)', async () => {
  const TRAP = 'Object.defineProperty(window, "__fpShell", { configurable: true, set: function (v) { v.refuse.hello = "error: hello refused";'
    + ' Object.defineProperty(window, "__fpShell", { value: v, writable: true, configurable: true, enumerable: true }); } });';
  const rows = [
    ['a reply with tabs.selected home', 'window.__fpShellHelloTabs = { selected: "home", seq: 0, bar: { h: 83, safe: 34, rev: 0 } };', 'malformed'],
    ['a reply with seq \'1\'', 'window.__fpShellHelloTabs = { selected: "log", seq: "1", bar: { h: 83, safe: 34, rev: 0 } };', 'malformed'],
    ['a rejected hello', TRAP, 'hello-failed'],
    ['a hello that throws', 'window.__fpShellThrow = ["hello"];', 'hello-failed'],
  ];
  for (const [tag, init, why] of rows) {
    const app = await pageBoot('tabs', { init });
    try {
      await app.page.waitForFunction(() => window._fp && _fp.tabs.left, null, { timeout: 15000 });
      await settle(app, 100);
      const o = await look(app);
      classicLook(o, tag);
      assert(!o.mode && o.why === why && o.told && dismissTabs(o) === 1 && o.offCoach === 'tabs', tag + ': out on its own, one dismiss tabs, the chat off: ' + J(o));
      fellBackPage(o, tag);
    } finally { await app.close(); }
  }
  // the chat negotiated in a reply the page cannot use for tabs: the page left on its own, so it never presents it
  const app = await pageBoot('tabs', { seed: { kt_apikey: 'sk-ant-test' } });
  try {
    await helloIn(app);
    const r = await ev(app, async () => {
      const w = (ms) => new Promise((z) => setTimeout(z, ms));
      Capacitor.Plugins.TrovoShell.hello = function (a) { __fpShell.calls.push(['hello', a]);
        return Promise.resolve({ v: 1, screens: ['coach', 'tabs'], tabs: { selected: 'home', seq: 1, bar: { h: 83, safe: 34, rev: 1 } } }); };
      _fp.hello = null; _fpHello(); await w(40);
      const p0 = __fpShell.of('present').length;
      switchTab('coach'); openCoachChat(); await w(40);
      return { mode: _fp.tabs.mode, why: _fp.tabs.why, negotiated: _fpNegotiated('coach'), off: _fp.off.coach, present: __fpShell.of('present').length - p0,
        web: !!document.getElementById('coach-input') };
    });
    const o = await look(app);
    assert(!r.mode && r.why === 'malformed' && r.negotiated && r.off === 'tabs' && r.present === 0 && r.web && dismissTabs(o) === 1,
      'a negotiated chat stays web once the page left on its own: ' + J(r));
  } finally { await app.close(); }
});

serial('P2: the failsafe: no hello answer in 16 s of visible time (hidden time does not count) and the page leaves on its own with one dismiss tabs; at 400 ms in real time, and the full 16 s on Playwright\'s clock', async () => {
  const app = await pageBoot('tabs', { init: HIDDEN + 'window.__fpShellHelloSilent = true; window.__fpTabsFailsafeMs = 400;' });
  try {
    await settle(app, 1200);
    const hidden = await look(app);
    assert(hidden.mode && hidden.cls && dismissTabs(hidden) === 0, 'hidden for 1.2 s: still in tabs mode: ' + J(hidden));
    await ev(app, () => { window.__vis = 'visible'; });
    await app.page.waitForFunction(() => !_fp.tabs.mode, null, { timeout: 15000 });
    await settle(app, 100);
    const o = await look(app);
    classicLook(o, 'the failsafe');
    assert(o.why === 'no-hello' && o.told && dismissTabs(o) === 1 && o.offCoach === 'tabs', 'visible: out on its own, one dismiss tabs: ' + J(o));
    fellBackPage(o, 'the failsafe');
  } finally { await app.close(); }
  // the full 16 s, on Playwright's clock (paused): hidden time does not count; in at 15.9 s of visible time, out at the
  // next tick past 16 s (the failsafe ticks every 250 ms and never counts a stretch that ended hidden)
  const c = await pageBoot('tabs', { clock: { time: Date.now() }, init: HIDDEN + 'window.__fpShellHelloSilent = true;' });
  try {
    const t = await ev(c, () => Date.now());
    await c.page.clock.pauseAt(t + 1000);
    await c.page.clock.runFor(30000);
    const a = await look(c);
    await ev(c, () => { window.__vis = 'visible'; });
    await c.page.clock.runFor(15900);
    const b = await look(c);
    await c.page.clock.runFor(350);
    const d = await look(c);
    assert(a.mode && a.cls && dismissTabs(a) === 0, '30 s hidden: still in tabs mode: ' + J(a));
    assert(b.mode && b.cls && dismissTabs(b) === 0, '15.9 s visible: still in tabs mode: ' + J(b));
    assert(!d.mode && !d.cls && J(d.vars) === '{}' && d.why === 'no-hello' && dismissTabs(d) === 1, '16 s visible: out, one dismiss tabs: ' + J(d));
  } finally { await c.close(); }
});

serial('P2: the failsafe counts only time the page could see: a hide and a show with no tick between them (the app suspended) add nothing; a stretch no visibilitychange reported adds 1 s at most', async () => {
  // On Playwright's clock, paused once the page is up (hidden until then): the failsafe ticks only while the case runs
  // the clock, so no real time counts (no wall-clock budget, however slow the machine) and each check sits at a known
  // visible time against __fpTabsFailsafeMs = 8000. A suspension is ten minutes of performance.now() moved by hand
  // (__skew, over the clock's own performance.now, so installed after boot) while the clock stands still: no tick
  // between. Ticks fall every 250 ms of clock time, so a check reads the count of the last tick up to 250 ms before it.
  const app = await pageBoot('tabs', { clock: { time: Date.now() }, init: HIDDEN + 'window.__fpShellHelloSilent = true; window.__fpTabsFailsafeMs = 8000;' });
  try {
    const t = await ev(app, () => Date.now());
    await app.page.clock.pauseAt(t + 1000);
    const runFor = (ms) => app.page.clock.runFor(ms);
    await ev(app, () => { window.__skew = 0; const pn = performance.now.bind(performance); performance.now = () => pn() + window.__skew;
      window.__vis = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
    await runFor(3000);   // 3 s visible
    await ev(app, () => { window.__vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
      window.__skew += 600000; window.__vis = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
    await runFor(1000);   // 4 s, the ten minutes between the hide and the show uncounted
    const a = await look(app);
    await ev(app, () => { window.__skew += 600000; });   // visible all along, ten minutes in one stretch: a stall, a suspension
    await runFor(1000);   // 5 s; that stretch counts 1 s, 0.75 s more than its own 250 ms of clock
    const b = await look(app);
    await runFor(2000);   // 7 s: 7.75 s counted at most
    const c = await look(app);
    await runFor(500);    // 7.5 s: past 8 s counted by its last tick
    const d = await look(app);
    assert(a.mode && a.cls && dismissTabs(a) === 0, 'ten minutes between a hide and a show (no tick between them): still in tabs mode: ' + J(a));
    assert(b.mode && b.cls && dismissTabs(b) === 0, 'an unreported ten minutes counts 1 s at most: still in tabs mode: ' + J(b));
    assert(c.mode && c.cls && dismissTabs(c) === 0, '7 s of visible time plus that 1 s: still in tabs mode (the suspension added nothing): ' + J(c));
    classicLook(d, 'the failsafe after a suspension');
    assert(!d.mode && d.why === 'no-hello' && d.told && dismissTabs(d) === 1, '7.5 s of visible time plus that 1 s: out on its own, one dismiss tabs: ' + J(d));
  } finally { await app.close(); }
});

serial('P2: the chat after a way out on the page\'s own once its hello asked for tabs (the failsafe): off while the shell may have negotiated it under the tab root\'s rule; a late reply naming tabs keeps it off, a late reply without tabs (the classic rule) gives it back', async () => {
  // Each boot's hello names tabs and stays silent, so the failsafe (400 ms of visible time) leaves tabs mode with one
  // dismiss tabs and the chat off; then the case sends the reply that comes late. A reply naming tabs was negotiated
  // under the tab root's rule, and the page's dismiss reached the shell after it, a fallback mid-document that takes
  // the chat off (contract 2.2, 10.3: a stand-in reply, as the mock's scene has fallen back by then). A reply without
  // tabs was negotiated on the classic rule (here the mock's own, the scene having fallen back at the page's dismiss),
  // which no later fallback changes: 60's overlay chat.
  // Each boot is hidden (HIDDEN) until its hello has asked for tabs, so the failsafe counts no time before that: visible
  // from the start, a loaded machine could hold the parser short of the main script for 400 ms of visible time, and the
  // head's own way out then came before any hello asked (seen at the page lane's gate: no 'no-hello', nothing told).
  const INIT = HIDDEN + 'window.__fpShellHelloSilent = true; window.__fpTabsFailsafeMs = 400;';
  const out = async (app, tag) => {
    await app.page.waitForFunction(() => window._fp && _fp.tabs.asked && window.__fpShell && __fpShell.of('hello').length === 1, null, { timeout: 15000 });
    const asked = await look(app);
    assert(asked.mode && asked.cls && dismissTabs(asked) === 0, tag + ': hidden, its hello sent: still in tabs mode: ' + J(asked));
    await ev(app, () => { window.__vis = 'visible'; });
    await app.page.waitForFunction(() => window._fp && _fp.tabs.left, null, { timeout: 15000 });
    await settle(app, 100);
    const o = await look(app);
    classicLook(o, tag);
    assert(!o.mode && o.why === 'no-hello' && o.told && dismissTabs(o) === 1 && o.hello.length === 1 && o.hello[0].screens.indexOf('tabs') >= 0 && o.offCoach === 'tabs',
      tag + ': its hello asked for tabs, the failsafe left with one dismiss tabs and the chat off: ' + J(o));
    fellBackPage(o, tag);
  };
  let app = await pageBoot('tabs', { seed: { kt_apikey: 'sk-ant-test' }, init: INIT });
  try {
    await out(app, 'a late reply naming tabs');
    const r = await ev(app, async () => {
      const w = (ms) => new Promise((z) => setTimeout(z, ms));
      Capacitor.Plugins.TrovoShell.hello = function (a) { __fpShell.calls.push(['hello', a]);
        return Promise.resolve({ v: 1, screens: ['coach', 'coachHome', 'tabs'], tabs: { selected: 'log', seq: 0, bar: { h: 83, safe: 34, rev: 0 } } }); };
      _fp.hello = null; _fpHello(); await w(40);
      const p0 = __fpShell.of('present').length;
      switchTab('coach'); openCoachChat(); await w(60);
      return { screens: _fp.hello.screens, mode: _fp.tabs.mode, off: _fp.off.coach || null, negotiated: _fpNegotiated('coach'),
        present: __fpShell.of('present').length - p0, web: !!document.getElementById('coach-input') };
    });
    assert(J(r.screens) === '["coach","coachHome","tabs"]' && !r.mode && r.off === 'tabs' && r.negotiated && r.present === 0 && r.web,
      'a late reply naming tabs: its tabs ignored, the chat stays off and the web chat shows: ' + J(r));
  } finally { await app.close(); }
  app = await pageBoot('tabs', { seed: { kt_apikey: 'sk-ant-test' }, init: INIT });
  try {
    await out(app, 'a late reply without tabs');
    const c = await chatAfter(app);
    assert(J(c.screens) === '["coach"]' && c.off === null && c.live && J(c.present) === '[{"screen":"coach"}]' && c.shown,
      'a late reply without tabs: the chat is the reply\'s again and presents once (60\'s overlay): ' + J(c));
  } finally { await app.close(); }
});

serial('P2: a broken page still drops the native bar (the head failsafe\'s own way out): the main script throws at its first statement, or does not parse, or reached its state with tabs mode never started; and a throw in the tabs boot block (and in its way out too) leaves tabs mode at boot while the first render and _bootDone still run; told either way, and the chat stays on when no hello asked for tabs', async () => {
  const MAIN = '<script>\n// ── Hybrid loader: live update check';
  const broken = [
    ['the main script throws at its first statement', edited(MAIN, '<script>\nthrow new Error("boom: the main script\'s first statement");\n// ── Hybrid loader: live update check')],
    ['the main script does not parse', edited(MAIN, '<script>function render(){}</script>\n<script>\n)(\n// ── Hybrid loader: live update check')],
  ];
  for (const [tag, html] of broken) {
    const app = await pageBoot('tabs', { html, pageErrors: 'allow', init: 'window.__fpTabsFailsafeMs = 400;' });
    try {
      await app.page.waitForFunction(() => !document.documentElement.classList.contains('fp-tabs'), null, { timeout: 15000 });
      await settle(app, 300);
      const o = await ev(app, () => {
        const r = document.documentElement, vars = [];
        for (let i = 0; i < r.style.length; i++) if (r.style[i].indexOf('--fp-') === 0) vars.push(r.style[i]);
        return { cls: r.classList.contains('fp-tabs'), vars, calls: __fpShell.calls.map((c) => [c[0], c[1]]), st: __fpShell.state(), fp: typeof window._fp };
      });
      assert(app.errors.length > 0 && o.fp === 'undefined', tag + ': the main script never set its state: ' + J([app.errors, o.fp]));
      assert(!o.cls && o.vars.length === 0 && J(o.calls) === '[["dismiss",{"screen":"tabs"}]]', tag + ': class and variables gone, one dismiss tabs and nothing else: ' + J(o));
      assert(o.st.scene.fellBack && o.st.scene.fellBack.why === 'page' && !o.st.live, tag + ': the scene fell back page: ' + J(o.st.scene));
    } finally { await app.close(); }
  }
  // In the next two cases (tabs mode never started; a throw in the boot block) the page leaves before any hello asks
  // for tabs, and its hello names coach alone: the shell falls back at the page's dismiss with nothing negotiated, and
  // the hello is then negotiated on the classic rule (contract 10.3, 2.2), so the chat stays the page's to present
  // (60's overlay). The boot's hello stays silent until the case has read that the chat was never turned off, then
  // the case sends the one that answers.
  // the main script got as far as its state but tabs mode never started (its boot block never ran): the main script's way
  // out has nothing to leave, so the head strips the class and the variables and tells the shell itself
  const skipped = edited('try{\n  (function(){\n    var root=document.documentElement, t=_fpTabsTest();',
    'try{\n  (function(){ return;\n    var root=document.documentElement, t=_fpTabsTest();');
  // Hidden until the boot is up (the main script has run), so the failsafe counts only from there: visible from the
  // start, the head's own way out could come before the main script reached its state, and then nothing set told.
  const sk = await pageBoot('tabs', { html: skipped, seed: { kt_apikey: 'sk-ant-test' }, init: HIDDEN + 'window.__fpShellHelloSilent = true; window.__fpTabsFailsafeMs = 400;' });
  try {
    const up = await ev(sk, () => ({ fp: typeof window._fp, cls: document.documentElement.classList.contains('fp-tabs'), dismiss: __fpShell.calls.filter((c) => c[0] === 'dismiss').length }));
    assert(up.fp === 'object' && up.cls && up.dismiss === 0, 'tabs mode never started: hidden, the main script up: the class on, no dismiss yet: ' + J(up));
    await ev(sk, () => { window.__vis = 'visible'; });
    await sk.page.waitForFunction(() => !document.documentElement.classList.contains('fp-tabs'), null, { timeout: 15000 });
    await settle(sk, 300);
    const o = await look(sk);
    classicLook(o, 'tabs mode never started', false);
    assert(!o.mode && o.told && dismissTabs(o) === 1 && o.tabsCalls.length === 1 && J(o.hello.map((h) => h.screens)) === '[["coach"]]',
      'tabs mode never started: one dismiss tabs, told: ' + J(o));
    assert(o.offCoach === null, 'tabs mode never started: its hello named coach alone, so the chat stays on: ' + J(o));
    fellBackPage(o, 'tabs mode never started');
    const c = await chatAfter(sk);
    assert(J(c.screens) === '["coach"]' && c.off === null && c.live && J(c.present) === '[{"screen":"coach"}]' && c.shown,
      'tabs mode never started: the hello negotiated on the classic rule, and the chat presents once (60\'s overlay): ' + J(c));
  } finally { await sk.close(); }
  // a throw at the start of the fp-tabs boot block (found by its marker comment)
  const marker = PAGE.indexOf('// fp-tabs boot block'), at = PAGE.indexOf('\ntry{', marker);
  assert(marker > 0 && PAGE.indexOf('// fp-tabs boot block', marker + 1) < 0 && at > marker && at - marker < 800, 'the boot block\'s marker and its try');
  const html = (src) => src.slice(0, at + 5) + ' throw new Error("boom in the fp-tabs boot block");' + src.slice(at + 5);
  const app = await pageBoot('tabs', { html, seed: { kt_apikey: 'sk-ant-test' }, init: OTA + 'window.__fpShellHelloSilent = true;' });
  try {
    await app.page.waitForFunction(() => window.__fpShell && __fpShell.of('bootDone').length === 1, null, { timeout: 15000 });
    await settle(app, 100);
    const o = await look(app);
    const x = await ev(app, () => ({ confirms: window.__otaConfirms || 0, bootDone: __fpShell.of('bootDone').length, screen: document.getElementById('screen').children.length,
      err: JSON.parse(localStorage.getItem('kt_err_log') || '[]').map((e) => e.m).join(' | '), order: __fpShell.calls.map((c) => c[0]) }));
    classicLook(o, 'a throw in the boot block');
    assert(!o.mode && o.left && o.why === 'boot' && o.told && dismissTabs(o) === 1 && o.tab === 'log' && routeTab(o) === 'log', 'the boot block threw: classic, one dismiss tabs: ' + J(o));
    assert(J(o.hello.map((h) => h.screens)) === '[["coach"]]', 'hello names coach, as classic: ' + J(o.hello));
    assert(x.confirms === 1 && x.bootDone === 1 && x.screen > 0 && /fp-tabs boot: boom in the fp-tabs boot block/.test(x.err) && x.order[0] === 'dismiss',
      'the first render, the OTA confirm and bootDone still ran; the throw is in the error log: ' + J(x));
    assert(o.offCoach === null, 'the boot block threw before hello asked for tabs: the chat stays on: ' + J(o));
    const c = await chatAfter(app);
    assert(J(c.screens) === '["coach"]' && c.off === null && c.live && J(c.present) === '[{"screen":"coach"}]' && c.shown,
      'the boot block threw: the hello negotiated on the classic rule, and the chat presents once (60\'s overlay): ' + J(c));
  } finally { await app.close(); }
  // the boot block throws and so does its way out (past the point where it left tabs mode): the catch strips the class
  // and the variables and tells the shell itself, and _fp.tabs.told says so
  const wayOutThrows = edited('T.mode=false; T.left=true; T.why=String(why || \'\');\n  _fpFailStop();',
    'T.mode=false; T.left=true; T.why=String(why || \'\');\n  _fpFailStop(); if(why===\'boot\') throw new Error("boom in the way out");');
  const tw = await pageBoot('tabs', { html: (src) => wayOutThrows(html(src)), init: OTA + 'window.__fpShellHelloSilent = true;' });
  try {
    await tw.page.waitForFunction(() => window.__fpShell && __fpShell.of('bootDone').length === 1, null, { timeout: 15000 });
    await settle(tw, 100);
    const o = await look(tw);
    const e = await bootEnds(tw);
    classicLook(o, 'the way out threw at boot', false);
    assert(!o.mode && o.left && o.why === 'boot' && o.told && dismissTabs(o) === 1 && o.offCoach === null && J(o.hello.map((h) => h.screens)) === '[["coach"]]',
      'the way out threw at boot: classic, one dismiss tabs, told: ' + J(o));
    fellBackPage(o, 'the way out threw at boot');
    assert(e.confirms === 1 && e.bootDone === 1 && tw.errors.length === 0, 'the way out threw at boot: the OTA confirm and bootDone still ran: ' + J([e, tw.errors]));
  } finally { await tw.close(); }
});

// ── P2 follow-up (PF): the head failsafe's way out before the main script ran ─────────────────────────────────────────
// The parser held between the head script and the main script (the page lane gate's probe, made deterministic): a
// parser-blocking script right after the head script's end, from a server of the case's own that answers it only when
// the page asks (GET /release). The page asks once the head's way out has been seen (window.__fpTabsTold and exactly one
// dismiss tabs recorded), from a 10 ms poll its init installs, so the event loop, and with it the head's failsafe, runs
// while the main script waits, for as long as that condition takes and never for a set time. A hold that nothing
// released is answered after 15 s as 'timeout': the case then fails on `released`, and the run never hangs. The case
// closes the hold in a finally of its own, after the boot's close() even when that throws (any page error under the 61
// flag, a store drift); the server and the valve are unref'd as well, so a hold left open can never keep the spec's
// process alive.
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
      if (at < 0 || src.indexOf(end, at + 1) >= 0) throw new Error('spec 122: not one end of the head script');
      return src.slice(0, at + 9) + '\n<script src="' + base + '/hold.js"></script>' + src.slice(at + 9);
    },
    // __holdSeen: the page as the poll saw it at the release (_fp and render are the main script's: undefined there).
    // The poll stops once, with the setInterval and clearInterval it started with (as spec 130's, under a clock).
    init: '(function () { var si = window.setInterval, ci = window.clearInterval, done = false, t = si(function () { var s = window.__fpShell;'
      + ' if (done || window.__fpTabsTold !== true || !s) return;'
      + ' if (s.calls.filter(function (c) { return c[0] === "dismiss" && c[1] && c[1].screen === "tabs"; }).length !== 1) return;'
      + ' done = true; ci(t);'
      + ' window.__holdSeen = { fp: typeof window._fp, render: typeof window.render, cls: document.documentElement.classList.contains("fp-tabs"),'
      + ' calls: s.calls.map(function (c) { return c[0]; }) };'
      + ' var x = new XMLHttpRequest(); x.open("GET", "' + base + '/release", true); x.send(); }, 10); })();',
    close: () => { clearTimeout(valve); release('closed'); try { srv.closeAllConnections(); } catch (e) {} srv.close(); },
  };
}
// Every value <html>'s class takes, as fp-tabs on (1) or off (0), from before the head script on: each change's old
// value in order (a MutationObserver on the document, from init, so it sees the head's own change), then the class now.
const CLASS_WATCH = 'window.__cls = []; new MutationObserver(function (ms) { ms.forEach(function (m) {'
  + ' if (m.target === document.documentElement) window.__cls.push(/(^|\\s)fp-tabs(\\s|$)/.test(m.oldValue || "") ? 1 : 0); }); })'
  + '.observe(document, { subtree: true, attributes: true, attributeFilter: ["class"], attributeOldValue: true });';
const classSeq = (app) => ev(app, () => window.__cls.concat([document.documentElement.classList.contains('fp-tabs') ? 1 : 0]));
// on (the head's test), off (its way out), and never on again
const classOnce = (s) => { const on = s.indexOf(1), off = s.indexOf(0, on + 1); return on >= 0 && off > on && s.indexOf(1, off) < 0; };

serial('P2 follow-up: the head failsafe\'s way out came before the main script ran (the parser held between them until it): the document stays out of tabs mode as one that left at boot (told, no-hello, one dismiss tabs, the class and the bar\'s numbers never back, its own bar on the boot tab: the flag\'s, fp_tab over it); hello names coach alone, so the chat stays on and presents once on the classic rule; the share read waits for no hello; a late reply naming tabs changes nothing; the first render and _bootDone ran', async () => {
  const rows = [
    // tag, the flag's selected, fp_tab, hello silent at boot, the tab the page boots on
    ['the flag\'s Coach', 'coach', null, false, 'coach'],
    ['fp_tab Settings over the flag\'s Coach, hello silent', 'coach', 'settings', true, 'settings'],
  ];
  for (const [tag, selected, fpTab, silent, tab] of rows) {
    const hold = await parserHold();
    let app = null;
    try {
      app = await pageBoot(TABS({ bar: BAR, selected }), { html: hold.html, seed: { kt_apikey: 'sk-ant-test' },
        init: OTA + CLASS_WATCH + hold.init + 'window.__fpTabsFailsafeMs = 400;'
          + (fpTab ? 'sessionStorage.setItem("fp_tab", "' + fpTab + '");' : '') + (silent ? 'window.__fpShellHelloSilent = true;' : '') });
      if (!silent) await helloIn(app);
      await settle(app, 100);
      const seen = await ev(app, () => window.__holdSeen || null);
      assert(hold.st.released === 'page' && seen && seen.fp === 'undefined' && seen.render === 'undefined' && !seen.cls && J(seen.calls) === '["dismiss"]',
        tag + ': the head\'s way out came while the parser held the main script (released at the page\'s word, not the valve: no _fp, no render, the class off, one dismiss and no other call): ' + J([hold.st, seen]));
      const o = await look(app);
      const x = await ev(app, () => ({ asked: _fp.tabs.asked, offHome: _fp.off.coachHome || null, declared: _fp.declared.coachHome || null,
        calls: __fpShell.calls.map((c) => c[0]), confirms: window.__otaConfirms || 0, bootDone: __fpShell.of('bootDone').length,
        screen: document.getElementById('screen').children.length, err: JSON.parse(localStorage.getItem('kt_err_log') || '[]').map((e) => e.m) }));
      classicLook(o, tag);
      assert(!o.mode && o.left && o.told && o.why === 'no-hello' && x.asked === false,
        tag + ': out of tabs mode for the document as one that left at boot: told, no-hello, no hello asked for tabs: ' + J([o, x.asked]));
      assert(o.tab === tab && routeTab(o) === tab && o.active === tab, tag + ': its own bar and the screen on ' + tab + ': ' + J([o.tab, o.route, o.active]));
      assert(J(o.tabsCalls) === J([['dismiss', { screen: 'tabs' }]]) && x.calls[0] === 'dismiss',
        tag + ': exactly one dismiss tabs, the head\'s, before any other call; no selectTab, sheets or setSwitch: ' + J([o.tabsCalls, x.calls]));
      assert(o.hello.length === 1 && J(o.hello[0].screens) === '["coach"]', tag + ': hello names coach alone: ' + J(o.hello));
      assert(o.offCoach === null && x.offHome === 'tabs' && x.declared === 'dismiss', tag + ': the chat not taken off; the Coach tab the web\'s for the document: ' + J([o.offCoach, x.offHome, x.declared]));
      assert(x.confirms === 1 && x.bootDone === 1 && x.screen > 0 && !x.err.some((m) => /fp-tabs/.test(m)),
        tag + ': the first render, the OTA confirm and bootDone ran, and nothing threw: ' + J(x));
      assert(o.scene.scene.fellBack && o.scene.scene.fellBack.why === 'page' && !o.scene.live && Object.prototype.hasOwnProperty.call(o.scene.scene.declined, 'tabs'),
        tag + ': the scene fell back page at the head\'s dismiss, tabs declined: ' + J(o.scene.scene));
      if (!silent) {
        assert(J(o.scene.doc.negotiated) === '["coach"]', tag + ': the shell, fallen back, negotiated the chat on the classic rule: ' + J(o.scene.doc));
        // the page's own tour: no tabs call, no second dismiss; the shell's tabs.* answer off
        await ev(app, TOUR);
        const offs = await ev(app, async () => [await __fpShell.call('tabs.select', { tab: 'log', seq: 9 }), await __fpShell.call('tabs.bar', { h: 83, safe: 34, rev: 9 })]);
        const t = await look(app);
        assert(J(t.tabsCalls) === J([['dismiss', { screen: 'tabs' }]]) && !t.mode && !t.cls && J(t.vars) === '{}' && J(offs) === J([{ ok: false, error: 'off' }, { ok: false, error: 'off' }]),
          tag + ': after a tour still one dismiss tabs and nothing else; tabs.select and tabs.bar answer off: ' + J([t, offs]));
        // the chat, opened with a key: presented once, on the classic rule (60's overlay)
        const c = await ev(app, async () => {
          const w = (ms) => new Promise((z) => setTimeout(z, ms));
          const p0 = __fpShell.calls.length;
          switchTab('coach'); openCoachChat(); await w(60);
          return { calls: __fpShell.calls.slice(p0).filter((k) => ['present', 'dismiss', 'selectTab', 'sheets'].indexOf(k[0]) >= 0).map((k) => [k[0], k[1]]),
            shown: !!_fp.shown.coach, live: _fpLive('coach') };
        });
        assert(J(c.calls) === J([['present', { screen: 'coach' }]]) && c.shown && c.live, tag + ': the chat presented once on the classic rule, nothing else: ' + J(c));
        // a late hello reply naming tabs (a stand-in: this document's hello never asked for them) puts nothing back
        const late = await ev(app, async () => {
          const w = (ms) => new Promise((z) => setTimeout(z, ms));
          const real = Capacitor.Plugins.TrovoShell.hello, n0 = __fpShell.calls.length;
          Capacitor.Plugins.TrovoShell.hello = function (a) { __fpShell.calls.push(['hello', a]);
            return Promise.resolve({ v: 1, screens: ['coach', 'coachHome', 'tabs'], tabs: { selected: 'settings', seq: 7, bar: { h: 83, safe: 34, rev: 7 } } }); };
          _fp.hello = null; _fpHello(); await w(60);
          Capacitor.Plugins.TrovoShell.hello = real;
          return { mode: _fp.tabs.mode, tab: currentTab, seq: _fp.tabs.seq, cls: document.documentElement.classList.contains('fp-tabs'),
            calls: __fpShell.calls.slice(n0).map((k) => k[0]).filter((k) => ['selectTab', 'sheets', 'dismiss', 'present'].indexOf(k) >= 0) };
        });
        assert(!late.mode && late.tab === 'coach' && late.seq === 0 && !late.cls && J(late.calls) === '[]',
          tag + ': a late reply naming tabs is ignored (no tabs mode, no move to its tab, no call): ' + J(late));
      } else {
        // hello still out, but the page has left tabs mode: the share read waits for no hello (resolved before a 0 ms timer)
        const w = await ev(app, async () => ({ out: _fpHelloOut(), left: _fp.tabs.left,
          first: await Promise.race([_fpAfterHello(3000).then(() => 'at once'), new Promise((r) => setTimeout(() => r('waited'), 0))]) }));
        assert(w.out && w.left && w.first === 'at once', tag + ': hello still out and the page out of tabs mode: the share read waits for no hello: ' + J(w));
        // the hello that answers, negotiated by the fallen-back scene on the classic rule: the chat presents once
        const c = await chatAfter(app);
        assert(J(c.screens) === '["coach"]' && c.off === null && c.live && J(c.present) === '[{"screen":"coach"}]' && c.shown,
          tag + ': the reply negotiated on the classic rule, and the chat presents once (60\'s overlay): ' + J(c));
      }
      const cls = await classSeq(app);
      const end = await look(app);
      assert(classOnce(cls) && !end.cls && J(end.vars) === '{}' && dismissTabs(end) === 1,
        tag + ': fp-tabs on from the head, off at its way out and never back; no --fp-*; one dismiss tabs in the whole document: ' + J([cls, end.vars, end.tabsCalls]));
    } finally { try { if (app) await app.close(); } finally { hold.close(); } }
  }
});
