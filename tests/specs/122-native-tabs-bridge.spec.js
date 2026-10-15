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
