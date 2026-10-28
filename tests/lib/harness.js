// Shared Playwright harness for the Fitness Programmer JS regression suites.
//
// Serves the repo root over local HTTP (the OTA loader is capacitor:-only, so
// it stays dormant), seeds localStorage from seed-dump.json before the page
// scripts run, and — when opts.native is set — installs a mock Capacitor
// bridge so the watch/widget code paths run as they would inside the shell.
//
// Store matrix (plan task S4): with opts.store = 'shadow', or STORE=shadow in
// the environment (./tests/run.sh passes it through), every document starts
// as it does in a build 60 shell: the flag window.__ktStore, a JS reference of
// the native store answering the KT1 prompt channel (lib/ktstore-mock.js), and
// the shipped facade itself (ios/App/FPKit/Sources/FPStore/Resources/ktstore.js),
// all before the seed and the page's own scripts. app.close() then checks for
// drift: the store, WebKit and what the page reads must hold the same values.
//
// Shell contracts (plan task C3): opts.shell, or FP_SHELL_INERT=1 for every
// native boot that names none, runs the page under a shell's flag
// window.__FP_SHELL and a TrovoShell mock (see shellMock at the end of this
// file). The two are independent and combine: STORE=shadow FP_SHELL_INERT=1
// is build 60 with no native screen up (the native copy in shadow under the
// flag and TrovoShell), and opts.store with opts.shell does the same for one
// boot. The store's scripts go first (everything after writes through the
// facade), the shell's last, after the native mock and opts.init. A spec that
// sets window.__FP_SHELL or a TrovoShell itself in opts.init names
// shell: 'none', so FP_SHELL_INERT=1 never paints the inert flag over its own.
//
// Build 61 (plan task P1): seven shell variants (build 60's none, inert and coach byte for byte; 61's
// inert61, coach61, tabs and tabsWeb, contract 2.1's strings verbatim), SHELL_METHODS {60, 61} (the
// TrovoShell methods each binary registers), FP_SHELL_INERT=1 (inert61) or =60 (build 60's inert), a mock
// that models the shell's scene (it outlives the document in sessionStorage: the negotiation with the
// dependency rule, the fallback, the funnel, the bar, sheets, setSwitch, status), MOCK_RULES (the mock's
// rules as one self-contained function, run by the page's mock and exported to Node), BASE_PAGE() (the
// page before the tabs half, 91708ae), and the boot options html, clock, shellMethods and pageErrors.
// A boot under a 61 flag fails at close() on any page error unless it passes pageErrors: 'allow'. A spec
// marked `// fp-spec: self-shelled` in its first five lines must name the shell on every native boot.
//
// Usage in a spec:
//   const { boot, assert, run } = require('../lib/harness');
//   run('my suite', async () => {
//     const app = await boot();
//     try { ... } finally { await app.close(); }
//   });

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seed-dump.json'), 'utf8'));
const FACADE = path.join(ROOT, 'ios', 'App', 'FPKit', 'Sources', 'FPStore', 'Resources', 'ktstore.js');
const MOCK = path.join(__dirname, 'ktstore-mock.js');

// 'shadow', or null for the classic run (no shell, no facade).
function storeMode(opts) {
  const m = opts.store !== undefined ? opts.store : (process.env.STORE || '');
  if (!m || m === 'classic') return null;
  if (m !== 'shadow') throw new Error('unknown store mode "' + m + '" (shadow, or nothing for the classic run)');
  return m;
}
let storeScripts = null;
const storeReport = { pages: 0, skipped: 0, writes: 0, fallbacks: 0, drift: 0 };
function loadStoreScripts() {
  if (!storeScripts) {
    storeScripts = { mock: fs.readFileSync(MOCK, 'utf8'), facade: fs.readFileSync(FACADE, 'utf8') };
    process.on('exit', () => {
      console.log('  store: shadow · ' + storeReport.pages + ' page(s) checked, ' + storeReport.skipped + ' without the facade · ' +
        storeReport.writes + ' write(s) mirrored, ' + storeReport.fallbacks + ' fallback(s) · ' + storeReport.drift + ' drift');
    });
  }
  return storeScripts;
}
// store == WebKit == page reads, at browser close (async posts delivered first; a gap the facade noted is
// left to the next document start, which adopts it).
async function storeCheck(page) {
  let r = null;
  for (let t = 0; t < 5; t++) {
    try { r = await page.evaluate(() => (window.__ktMock ? window.__ktMock.check() : null)); } catch (e) { return; }   // the page is gone
    if (!r || r.ok) break;
    await new Promise((z) => setTimeout(z, 100));
  }
  if (!r) return;
  storeReport.pages++;
  if (r.skipped) storeReport.skipped++;
  storeReport.writes += r.writes || 0;
  storeReport.fallbacks += r.fallbacks || 0;
  if (!r.ok) {
    storeReport.drift++;
    console.error('  FAIL  store drift: ' + r.bad.slice(0, 6).join(' | ') + (r.bad.length > 6 ? ' (+' + (r.bad.length - 6) + ' more)' : ''));
    process.exitCode = 1;
  }
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

// html: another page text served as /index.html for this boot (opts.html), or null for the repo's own.
function startServer(html) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      if (html !== null && p === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); return;
      }
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end(); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

// opts.seed        — extra/override localStorage keys (values must be strings)
// opts.native      — mock Capacitor so isNativeIOS() is true
// opts.watchPending — array of JSON strings TrovoWatch.getPendingSessions returns
// opts.page        — extra browser.newPage options (viewport, hasTouch, isMobile, deviceScaleFactor…)
// opts.init        — a script (string or function) that runs before the page's own scripts
// opts.store       — 'shadow': the build 60 shell's storage (flag, mock native store, shipped facade);
//                    'classic' or false: none, whatever STORE says. Default: process.env.STORE.
// opts.storeCheck  — false skips the drift check at close (a spec that leaves a difference on purpose)
// opts.shell       — the shell contract: 'none', 'inert', 'coach', 'inert61', 'coach61', 'tabs', 'tabsWeb' or a flag
//                    object (SHELLS, shellFlag below). Default for a native boot: FP_SHELL_INERT=1 'inert61',
//                    FP_SHELL_INERT=60 'inert', else 'none'. Combines with opts.store.
// opts.shellMethods — the TrovoShell methods the mock registers (default SHELL_METHODS['61'] for a flag whose binary
//                    names tabs, else SHELL_METHODS['60']): a 60 TrovoShell under a 61 flag, say.
// opts.html        — another page text served as /index.html for this boot: a string, or a function of the page's
//                    own text (an OTA switch such as FP_TABS=false, a page whose main script throws, BASE_PAGE()).
// opts.clock       — {time}: Playwright's clock installed before the page loads (page.clock.runFor / fastForward).
// opts.pageErrors  — 'allow': a boot under a 61 flag closes even when the page threw (by default close() throws).
async function boot(opts = {}) {
  if (opts.native && (opts.shell === undefined || opts.shell === null) && selfShelled()) {
    throw new Error('this spec is marked fp-spec: self-shelled, so every native boot names its shell (opts.shell)');
  }
  const store = storeMode(opts);
  const shell = shellFlag(opts);   // the shell contract this boot runs under (opts.shell, FP_SHELL_INERT): see shellMock
  const html = opts.html === undefined || opts.html === null ? null
    : String(typeof opts.html === 'function' ? opts.html(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')) : opts.html);
  const srv = await startServer(html);
  const port = srv.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage(Object.assign({ viewport: { width: 390, height: 844 } }, opts.page || {}));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // Nothing leaves the machine: only the local server answers.
  await page.route('**/*', (route) => {
    if (route.request().url().includes('127.0.0.1')) return route.continue();
    return route.abort();
  });

  // The store's document-start scripts come first, as StoreAttach injects them: everything after (the seed,
  // opts.init, the shell mock, the page) reads and writes localStorage through the facade.
  if (store) {
    const s = loadStoreScripts();
    await page.addInitScript({ content: s.mock });
    await page.addInitScript({ content: s.facade });
    await page.addInitScript({ content: 'window.__ktMock && window.__ktMock._afterFacade();' });
  }

  const seed = Object.assign({}, SEED, opts.seed || {});
  await page.addInitScript(({ seed, native, watchPending }) => {
    // A store spec can stop the re-seed at each load (__ktMock.device({seed:false})): a real relaunch keeps WebKit.
    if (!window.__ktSkipSeed) for (const k of Object.keys(seed)) localStorage.setItem(k, seed[k]);
    if (!native) return;
    window.__mock = { updateContext: [], pending: watchPending || [], listeners: [] };
    const resolved = (v) => () => Promise.resolve(v);
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      Plugins: {
        TrovoWatch: {
          updateContext: (a) => { window.__mock.updateContext.push(a); return Promise.resolve({ sent: true }); },
          getPendingSessions: () => Promise.resolve({ sessions: window.__mock.pending }),
          clearPendingSessions: () => { window.__mock.pending = []; return Promise.resolve({}); },
          isPaired: resolved({ paired: true, installed: true }),
          addListener: (name, fn) => { window.__mock.listeners.push({ name, fn }); return { remove() {} }; },
        },
        TrovoWidget: { updateSummary: resolved({}) },
        TrovoShare: {},
        Haptics: { impact: resolved({}), notification: resolved({}) },
        LocalNotifications: {
          requestPermissions: resolved({ display: 'denied' }),
          checkPermissions: resolved({ display: 'denied' }),
          schedule: resolved({}), cancel: resolved({}),
          getPending: resolved({ notifications: [] }),
        },
        // TrovoHealth deliberately absent — every call site guards for it.
      },
    };
  }, { seed, native: !!opts.native, watchPending: opts.watchPending || [] });
  if (opts.init) await page.addInitScript(opts.init);
  if (shell) {
    const methods = opts.shellMethods || SHELL_METHODS[is61(shell) ? '61' : '60'];
    await page.addInitScript(shellMock, { flag: shell, methods, rules: MOCK_RULES.toString() });
  }
  if (opts.clock) await page.clock.install(opts.clock.time !== undefined ? { time: opts.clock.time } : {});

  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.render === 'function', { timeout: 10000 });

  return {
    page, errors, store, shell,
    // A relaunch of the page in the same browser (sessionStorage, and so the store, survive it).
    reload: async () => {
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.render === 'function', { timeout: 10000 });
    },
    close: async () => {
      try {
        if (store && opts.storeCheck !== false) await storeCheck(page);
      } finally { await browser.close(); srv.close(); }
      // Under a 61 flag a page error fails the boot: an error thrown only there could stop a 61 phone's boot before
      // the OTA confirm, and the one-strike breaker would reject the staged page for good (kt_ota_rejected).
      if (is61(shell) && opts.pageErrors !== 'allow' && errors.length) {
        throw new Error('page error(s) under a build 61 flag (pass pageErrors: \'allow\' if expected): ' + errors.join(' | '));
      }
    },
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT: ' + msg);
}

// Runs the suite body and reports pass/fail with a non-zero exit on failure.
function run(name, fn) {
  fn().then(
    () => { console.log('  PASS  ' + name); },
    (e) => { console.error('  FAIL  ' + name + ' — ' + (e && e.message || e)); process.exitCode = 1; }
  );
}


// Shell contracts (plan tasks C3 and P1). opts.shell names the one a boot runs under, one variant per contract an
// installable shell speaks:
//   'none'     no flag and no TrovoShell: every shell up to 59, the PWA, the browser (the default);
//   'inert'    build 60's flag with no native screen on: window.__FP_SHELL {v:1, screens:[], binary:['coach']}
//              and the mock (the published policy file keeps the chat off: Settings > About says so);
//   'coach'    build 60: contract v1 with the native Coach chat;
//   'inert61'  build 61, classic root, nothing native;
//   'coach61'  build 61, classic root with build 60's overlay chat;
//   'tabs'     build 61, tab root, everything on (the native bar and the native Coach tab);
//   'tabsWeb'  build 61, tab root with the native Coach tab off (the bar only);
//   or a flag object {v, min, shell, screens, binary?, tabs?}.
// The four 61 flags are JSON.parse of contract 2.1's canonical strings, kept verbatim (FPCore's ContractTests hold
// the same strings). FP_SHELL_INERT=1 (tests/run.sh passes it) runs every native boot that names no shell as
// 'inert61', FP_SHELL_INERT=60 as build 60's 'inert'.
// The mock TrovoShell answers hello the way FPCore's Negotiation does (61: with the dependency rule and the fallback,
// MOCK_RULES) and records every call in window.__fpShell (calls, of(name), models()); a spec calls the page as the
// shell does through window.FPScreens.call(name, args) (__fpShell.call). Its status (Settings > About) is
// window.__fpShellStatus when a spec sets one, else FPCore ScreenStatus's shape for the flag: each binary screen on
// when the flag has it, else off by the policy file (61 adds 10.5's fields); reset turns a screen of
// __fpShellStatus back on for the next launch.
const CANONICAL_61 = {
  tabs: '{"binary":["coach","coachHome","tabs"],"min":1,"screens":["coach","coachHome","tabs"],"shell":"61","tabs":{"bar":{"h":83,"safe":34},"selected":"log"},"v":1}',
  tabsWeb: '{"binary":["coach","coachHome","tabs"],"min":1,"screens":["tabs"],"shell":"61","tabs":{"bar":{"h":83,"safe":34},"selected":"log"},"v":1}',
  coach61: '{"binary":["coach","coachHome","tabs"],"min":1,"screens":["coach"],"shell":"61","v":1}',
  inert61: '{"binary":["coach","coachHome","tabs"],"min":1,"screens":[],"shell":"61","v":1}',
};
const SHELLS = {
  none: null,
  inert: { v: 1, min: 1, shell: '60', screens: [], binary: ['coach'] },
  coach: { v: 1, min: 1, shell: '60', screens: ['coach'], binary: ['coach'] },
  inert61: JSON.parse(CANONICAL_61.inert61),
  coach61: JSON.parse(CANONICAL_61.coach61),
  tabs: JSON.parse(CANONICAL_61.tabs),
  tabsWeb: JSON.parse(CANONICAL_61.tabsWeb),
};
// The TrovoShell methods each binary registers (CapApp/TrovoShellPlugin.swift pluginMethods; contract 3.1). v1 grows
// by additions: the first 11 of 61's are 60's.
const SHELL_METHODS = {
  '60': ['hello', 'bootDone', 'present', 'dismiss', 'model', 'toast', 'confirm', 'log', 'status', 'reset', 'visibility'],
  '61': ['hello', 'bootDone', 'present', 'dismiss', 'model', 'toast', 'confirm', 'log', 'status', 'reset', 'visibility',
    'selectTab', 'sheets', 'setSwitch'],
};
// A build 61 flag: its binary names tabs.
function is61(flag) { return !!(flag && Array.isArray(flag.binary) && flag.binary.indexOf('tabs') >= 0); }
function shellFlag(opts) {
  let s = opts.shell;
  if (s === undefined || s === null) {
    const m = process.env.FP_SHELL_INERT || '';
    s = !opts.native || m === '' || m === '0' ? 'none' : m === '1' ? 'inert61' : m === '60' ? 'inert' : null;
    if (s === null) throw new Error('FP_SHELL_INERT=' + m + ' is not a shell mode (1, 60, or nothing)');
  }
  if (typeof s === 'string') {
    if (!Object.prototype.hasOwnProperty.call(SHELLS, s)) {
      throw new Error('unknown shell variant "' + s + '" (' + Object.keys(SHELLS).join(', ') + ')');
    }
    return SHELLS[s];
  }
  return s || null;
}
// A spec marked `// fp-spec: self-shelled` in its first five lines names its shell on every native boot, so the
// inert modes skip it (tests/run.sh) without hiding a boot that would have run differently there.
let _selfShelled = null;
function selfShelled() {
  if (_selfShelled === null) {
    try {
      const f = process.argv[1];
      _selfShelled = !!f && /\.spec\.js$/.test(f)
        && fs.readFileSync(f, 'utf8').split('\n').slice(0, 5).some((l) => l.indexOf('fp-spec: self-shelled') >= 0);
    } catch (e) { _selfShelled = false; }
  }
  return _selfShelled;
}
// The page before the tabs half (91708ae, web 20261012-2): the page a build 60 phone may still have staged, for spec
// 122's "a page from before the page half under 61's flags". Pinned for good; nothing compares today's page with it.
const BASE_COMMIT = '91708ae';
let _basePage = null;
function BASE_PAGE() {
  if (_basePage === null) {
    try {
      _basePage = execFileSync('git', ['show', BASE_COMMIT + ':index.html'],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      throw new Error('BASE_PAGE(): commit ' + BASE_COMMIT + ' is not in this checkout (a shallow clone? CI checks out '
        + 'with actions/checkout fetch-depth: 0): ' + String((e && e.stderr) || e).trim());
    }
  }
  return _basePage;
}

// The shell's rules, written once (contract 2.2, 3.2, 3.4, 8.1, 10.3): a self-contained function with no page or Node
// globals. The page's mock runs it (shellMock evaluates its source) and Node gets it from the exports, so a shared
// table (Fixtures/shell/negotiation.json, plan task P13) can drive the very rules the page specs boot under.
// MOCK_RULES() returns {TAB_IDS, depend, hello, barH, funnel, fallBack}.
function MOCK_RULES() {
  var TAB_IDS = ['log', 'progress', 'coach', 'settings'];
  var has = function (l, x) { return Array.isArray(l) && l.indexOf(x) >= 0; };
  // The dependency rule: which of `base` stay on under the root (live: a tab root that has not fallen back). tabs iff
  // a live tab root; coachHome iff tabs and coach; coach under a live tab root iff coachHome, else alone. Other names
  // (a spec's own screens) pass through.
  function depend(base, live) {
    base = Array.isArray(base) ? base : [];
    var on = { tabs: has(base, 'tabs') && !!live };
    on.coachHome = has(base, 'coachHome') && on.tabs && has(base, 'coach');
    on.coach = live ? has(base, 'coach') && on.coachHome : has(base, 'coach');
    return base.filter(function (p) { return Object.prototype.hasOwnProperty.call(on, p) ? on[p] : true; });
  }
  // hello: flag (this document's), req (the page's {v, page, screens}), o {live, off}: whether the scene's root is a
  // live tab root, and the pieces off in this document before the hello (policy, trips). Returns {v, screens, why,
  // fellBack, declined}: why for a version refusal; fellBack the fallback this hello triggers ('refused', 'page',
  // 'policy') or null; declined the pieces recorded as declined for the hello's page build. A fallback at a hello
  // negotiates the same hello on the fallen-back (classic) rule.
  function hello(flag, req, o) {
    o = o || {};
    var live = !!o.live, off = Array.isArray(o.off) ? o.off : [];
    var res = { v: 0, screens: [], why: null, fellBack: null, declined: [] };
    var want = (req && req.v) | 0;
    var why = want < 1 ? 'no-version' : Math.min(want, flag.v | 0) < (flag.min || 1) ? 'page-too-old' : null;
    if (why) {
      res.why = why;
      if (live) { res.fellBack = 'refused'; res.declined.push('tabs'); }
      return res;
    }
    res.v = Math.min(want, flag.v | 0);
    var page = req && Array.isArray(req.screens) ? req.screens : [];
    var base = (flag.screens || []).filter(function (s) { return off.indexOf(s) < 0; });
    var avail = depend(base, live);
    var screens = depend(avail.filter(function (s) { return page.indexOf(s) >= 0; }), live);
    if (live && screens.indexOf('tabs') < 0) {
      res.fellBack = has(off, 'tabs') ? 'policy' : 'page';
      if (res.fellBack === 'page' && has(avail, 'tabs') && !has(page, 'tabs')) res.declined.push('tabs');
      screens = depend(depend(base, false).filter(function (s) { return page.indexOf(s) >= 0; }), false);
    } else if (live && has(avail, 'coachHome') && !has(page, 'coachHome')) {
      res.declined.push('coachHome');
    }
    res.screens = screens;
    return res;
  }
  // The bar's height now (3.4): hidden for good after a fallback; hidden while a sheet is open over a web tab or a WEB
  // Coach tab (it stays over a NATIVE or WAITING one); else the shown height. s {fellBack, selected, coach, sheetsOpen,
  // h}: coach is 'waiting' | 'native' | 'web'.
  function barH(s) {
    if (s.fellBack) return 0;
    if (s.sheetsOpen && (s.selected !== 'coach' || s.coach === 'web')) return 0;
    return s.h;
  }
  // The funnel (8.1) for a selection of `tab` from `source` ('tap', 'page', 'deepLink', 'stray') on s {selected, seq,
  // coach}: whether it moves, the seq after, and the messages to the page in order (shell.covered on before entering
  // a NATIVE or WAITING Coach tab, off after leaving one for a web tab, tabs.select for tap, deepLink and stray).
  // A re-tap takes the next seq and sends again:true; a page or deepLink selection of the selected tab does nothing.
  function funnel(s, tab, source) {
    if (tab === s.selected) {
      if (source !== 'tap') return { moved: false, seq: s.seq, msgs: [] };
      return { moved: false, seq: s.seq + 1, msgs: [['tabs.select', { tab: tab, seq: s.seq + 1, again: true }]] };
    }
    var covers = function (t) { return t === 'coach' && s.coach !== 'web'; };
    var seq = s.seq + 1, msgs = [];
    if (covers(tab)) msgs.push(['shell.covered', { on: true }]);
    else if (covers(s.selected)) msgs.push(['shell.covered', { on: false }]);
    if (source === 'tap' || source === 'deepLink' || source === 'stray') msgs.push(['tabs.select', { tab: tab, seq: seq }]);
    return { moved: true, seq: seq, msgs: msgs };
  }
  // The fallback's messages (10.3), in order: screens.off for a live chat (with the composer's draft) and a live Coach
  // tab (why 'needs'), then screens.off tabs with the fallback's why unless the page asked (dismiss tabs), then
  // shell.covered off when it was on. s {why, live: [pieces live under the tab root], pageAsked, covered, draft,
  // linked}: a document that has not said hello (linked false) hears none of them, only the rule changes (FPCore's
  // LinkState.fallBack; its hello's reply tells it, negotiated on the classic rule).
  function fallBack(s) {
    var out = [];
    if (s.linked === false) return out;
    if (has(s.live, 'coach')) {
      out.push(['screens.off', typeof s.draft === 'string' && s.draft ? { screen: 'coach', why: 'needs', draft: s.draft } : { screen: 'coach', why: 'needs' }]);
    }
    if (has(s.live, 'coachHome')) out.push(['screens.off', { screen: 'coachHome', why: 'needs' }]);
    if (!s.pageAsked) out.push(['screens.off', { screen: 'tabs', why: s.why }]);
    if (s.covered) out.push(['shell.covered', { on: false }]);
    return out;
  }
  return { TAB_IDS: TAB_IDS, depend: depend, hello: hello, barH: barH, funnel: funnel, fallBack: fallBack };
}

// Runs in the page before its scripts: the flag the shell injects at document start, and TrovoShell with the
// binary's methods. arg {flag, methods, rules: MOCK_RULES's source}.
//
// Build 60 flags (binary without tabs) keep the C3 mock exactly: hello negotiates, present/dismiss/model answer {},
// up only from window.__fpShellUp, no scene. Build 61 flags model the shell (contract 2-4, 8, 10.3, 15.3):
// - The scene outlives the document (sessionStorage __fpShellMock; a new browser is a new scene): root ('tabs' iff
//   the scene's first flag has tabs), fellBack ({why, at} or null), selected, seq, rev, bar {h, safe} (the flag's
//   prediction until a measurement), coach ('waiting' | 'native' | 'web', per scene), pushed (the chat), home (the
//   last coachHome model), switches {tabs}, declined {piece: page build}, strays, policy {at, result}. A document
//   start in a fallen-back scene deletes window.__FP_SHELL.tabs before the page runs.
// - Per document: sheetsOpen (closed at every document start), the negotiated set, covered.
// - Shell-to-page messages go through one FIFO queue, one at a time, never resent (PageLink), each recorded in
//   __fpShell.sent as [name, args, answer, t0, t1]; a message unanswered in 2 s (5 s for a snapshot) is recorded
//   with {timeout: true}. __fpShell.call(name, args) stays the spec's direct call.
// - Refusals are worded '<code>: <words>' as the plugin rejects them; __fpShell.refuse[name] still rejects any method
//   with a spec's own message.
// Knobs (window, set in opts.init): __fpShellHelloSilent, __fpShellHelloDelay (ms), __fpShellPre {selected, seq},
// __fpShellHelloTabs (the reply's tabs replaced; null leaves it out), __fpShellOff (pieces off before this hello),
// __fpShellBar {h, safe}, __fpShellThrow (method names that throw synchronously), __fpShellUp, __fpShellStatus,
// __fpShellCross ('<tab>': a tap crosses the next selectTab), __fpShellSheetsDelay (ms, default 16),
// __fpShellSheetsSilent, __fpShellRefreshDelay (ms, default 0), __fpShellIOS (a number below 26: tabs off 'os').
// Helpers: __fpShell.tap(tab), select(tab, 'deepLink' | 'stray'), bar(h, safe), fallBack(why, draft), state();
// __fpShell.composer stands for the native composer's unsent words (cleared by an answer with took: true).
function shellMock(arg) {
  const flag = arg.flag;
  window.__FP_SHELL = JSON.parse(JSON.stringify(flag));
  if (!window.Capacitor) window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} };
  const R = (new Function('return (' + arg.rules + ')();'))();
  const v61 = Array.isArray(flag.binary) && flag.binary.indexOf('tabs') >= 0;
  const calls = [];
  const sent = [];
  const sheetsLog = [];
  const copy = (a) => (a === undefined ? null : JSON.parse(JSON.stringify(a)));
  const later = (v, ms) => new Promise((res) => setTimeout(() => res(v), ms));
  const refusal = (words) => Promise.reject(new Error(words));
  const knob = (k) => window[k];

  // ---- the scene (61) ----
  const KEY = '__fpShellMock';
  let scene = null;
  const save = () => { if (!v61) return; try { sessionStorage.setItem(KEY, JSON.stringify(scene)); } catch (e) {} };
  if (v61) {
    try { scene = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { scene = null; }
    if (!scene || typeof scene !== 'object') {
      const t = flag.tabs && typeof flag.tabs === 'object' ? flag.tabs : null;
      const b = t && t.bar && typeof t.bar === 'object' ? t.bar : {};
      scene = { root: t ? 'tabs' : 'classic', fellBack: null, selected: (t && t.selected) || 'log', seq: 0, rev: 0,
        bar: { h: (b.h | 0) || 0, safe: (b.safe | 0) || 0 }, coach: t ? 'waiting' : 'web', pushed: false, home: null,
        switches: { tabs: true }, declined: {}, strays: 0, policy: { at: null, result: null }, docs: 0 };
    }
    scene.docs++;
    if (scene.fellBack) delete window.__FP_SHELL.tabs;   // 10.3: the scene's later documents boot classic
    save();
  }
  const live = () => !!(scene && scene.root === 'tabs' && !scene.fellBack);
  const doc = { sheetsOpen: false, negotiated: null, off: [], covered: false, homeModel: false, declared: false,
    page: null, helloAt: null };
  const shownBar = () => ({ h: R.barH({ fellBack: scene.fellBack, selected: scene.selected, coach: scene.coach,
    sheetsOpen: doc.sheetsOpen, h: scene.bar.h }), safe: scene.bar.safe, rev: scene.rev });

  // ---- shell to page: one FIFO queue, one message at a time, never resent ----
  const queue = [];
  let busy = false;
  function pump() {
    if (busy || !queue.length) return;
    busy = true;
    const it = queue.shift();
    const t0 = performance.now();
    let done = false, timer = null;
    const fin = (ans) => {
      if (done) return;
      done = true; clearTimeout(timer);
      sent.push([it.name, copy(it.args), copy(ans), t0, performance.now()]);
      if (it.name === 'screens.off' && it.args && it.args.screen === 'coach' && ans && ans.took === true) window.__fpShell.composer = '';
      busy = false;
      it.res(ans);
      setTimeout(pump, 0);
    };
    timer = setTimeout(() => fin({ timeout: true }), /snapshot$/.test(it.name) ? 5000 : 2000);
    try {
      if (!window.FPScreens || typeof window.FPScreens.call !== 'function') { fin({ ok: false, error: 'gone' }); return; }
      Promise.resolve(window.FPScreens.call(it.name, copy(it.args) || {})).then(fin, (e) => fin({ ok: false, error: String(e && e.message || e) }));
    } catch (e) { fin({ ok: false, error: String(e && e.message || e) }); }
  }
  function send(name, args) {
    return new Promise((res) => { queue.push({ name, args: args || {}, res }); setTimeout(pump, 0); });
  }
  const sendAll = (msgs) => Promise.all(msgs.map((m) => {
    if (m[0] === 'shell.covered') doc.covered = !!m[1].on;
    return send(m[0], m[1]);
  }));

  // ---- the funnel and the fallback (61) ----
  function runFunnel(tab, source) {
    const f = R.funnel({ selected: scene.selected, seq: scene.seq, coach: scene.coach }, tab, source);
    if (f.moved) scene.selected = tab;
    scene.seq = f.seq;
    if (source === 'stray') scene.strays++;
    save();
    const p = sendAll(f.msgs);
    const i = f.msgs.findIndex((m) => m[0] === 'tabs.select');
    return i < 0 ? Promise.resolve(null) : p.then((answers) => answers[i]);
  }
  function fallBackNow(why, o) {
    o = o || {};
    const livePieces = (doc.negotiated || []).filter((p) => (p === 'coach' || p === 'coachHome') && doc.off.indexOf(p) < 0);
    const msgs = R.fallBack({ why, live: livePieces, pageAsked: !!o.pageAsked, covered: doc.covered,
      draft: window.__fpShell.composer, linked: doc.negotiated !== null });
    scene.fellBack = { why, at: Date.now() };
    scene.coach = 'web'; scene.pushed = false;
    (doc.negotiated || []).forEach((p) => { if (p === 'tabs' || p === 'coach' || p === 'coachHome') doc.off.push(p); });
    save();
    return sendAll(msgs);
  }

  // ---- the methods ----
  function hello60(a) {   // FPCore Negotiation.negotiate, then HelloReply.takingOver
    const want = (a && a.v) | 0;
    if (want < 1) return { v: 0, screens: [], why: 'no-version' };
    const v = Math.min(want, flag.v);
    if (v < (flag.min || 1)) return { v: 0, screens: [], why: 'page-too-old' };
    const screens = (flag.screens || []).filter((s) => ((a && a.screens) || []).indexOf(s) >= 0);
    // window.__fpShellUp (a spec's init): the screens the shell still shows from the document before (a reload under
    // the native chat); the answer names those this document may have, as `up` (plan task C5)
    const up = Array.isArray(window.__fpShellUp) ? window.__fpShellUp.filter((s) => screens.indexOf(s) >= 0) : [];
    return up.length ? { v, screens, up } : { v, screens };
  }
  function hello61(a) {
    const pre = knob('__fpShellPre');
    if (pre && typeof pre === 'object' && !doc.preDone) {
      doc.preDone = true;
      if (R.TAB_IDS.indexOf(pre.selected) >= 0) scene.selected = pre.selected;
      if (typeof pre.seq === 'number') scene.seq = pre.seq;
    }
    const b = knob('__fpShellBar');
    if (b && typeof b === 'object') scene.bar = { h: b.h | 0, safe: b.safe | 0 };
    const off = Array.isArray(knob('__fpShellOff')) ? knob('__fpShellOff').slice() : [];
    off.forEach((p) => { if (doc.off.indexOf(p) < 0) doc.off.push(p); });
    const r = R.hello(window.__FP_SHELL, a, { live: live(), off: doc.off });
    doc.page = (a && a.page) || null;
    r.declined.forEach((p) => { scene.declined[p] = doc.page; });
    if (r.fellBack) { scene.fellBack = { why: r.fellBack, at: Date.now() }; scene.coach = 'web'; scene.pushed = false; }
    doc.negotiated = r.screens.slice();
    const reply = r.why ? { v: 0, screens: [], why: r.why } : { v: r.v, screens: r.screens.slice() };
    const has = (s) => reply.screens.indexOf(s) >= 0;
    let up;
    if (Array.isArray(window.__fpShellUp)) up = window.__fpShellUp.filter(has);
    else {
      up = [];
      if (live() && scene.coach === 'native' && has('coachHome')) up.push('coachHome');
      if (scene.pushed && has('coach')) up.push('coach');
    }
    if (up.length) reply.up = up;
    if (has('tabs')) reply.tabs = { selected: scene.selected, seq: scene.seq, bar: shownBar() };
    const ht = knob('__fpShellHelloTabs');
    if (ht !== undefined) { if (ht === null) delete reply.tabs; else reply.tabs = copy(ht); }
    // the Coach tab (1.4): WEB at once on a reply without coachHome; a screen up that the reply leaves out goes down
    if (live() && !has('coachHome')) scene.coach = 'web';
    if (scene.pushed && !has('coach')) scene.pushed = false;
    save();
    return reply;
  }
  // After the answer, on the next task: the resync (3.2) and the WAITING tab's 3 s net (1.4). Never tabs.select.
  function afterHello(reply) {
    doc.helloAt = performance.now();
    const up = reply.up || [];
    const msgs = [];
    if (live()) {
      msgs.push(['shell.covered', { on: scene.selected === 'coach' && scene.coach !== 'web' }]);
      if (up.indexOf('coachHome') >= 0) msgs.push(['coachHome.snapshot', {}]);
      if (up.indexOf('coach') >= 0) msgs.push(['coach.snapshot', {}]);
      if (scene.coach === 'waiting' && reply.screens.indexOf('coachHome') >= 0 && up.indexOf('coachHome') < 0) {
        setTimeout(() => {
          if (!live() || scene.coach !== 'waiting' || doc.declared) return;
          scene.coach = 'web'; save();
          if (scene.selected === 'coach' && doc.covered) sendAll([['shell.covered', { on: false }]]);
        }, 3000);
      }
    } else {
      up.forEach((s) => { msgs.push(['shell.covered', { on: true }]); if (s === 'coach') msgs.push(['coach.snapshot', {}]); });
    }
    setTimeout(() => sendAll(msgs), 0);
  }
  function hello(a) {
    if (!v61) return Promise.resolve(hello60(a));
    if (knob('__fpShellHelloSilent')) return new Promise(() => {});
    const d = knob('__fpShellHelloDelay');
    const go = () => { const reply = hello61(a); afterHello(reply); return reply; };
    return typeof d === 'number' && d > 0 ? new Promise((res) => setTimeout(() => res(go()), d)) : Promise.resolve(go());
  }

  // FPCore ScreenStatus's shape (Settings > About): a spec's own window.__fpShellStatus, else the flag's binary
  // screens, each on when the flag offers it, else off by the policy file; 61 adds 10.5's fields.
  const count = () => ({ launch: 0, total: 0, last: null });
  function status60() {
    const screens = {};
    (flag.binary || []).forEach((s) => {
      const on = (flag.screens || []).indexOf(s) >= 0;
      screens[s] = { on, live: on, off: on ? null : 'policy', trip: null, why: null, at: null, canReset: false };
    });
    return { v: 1, shell: flag.shell, page: null, screens, verdicts: [],
      counters: { since: null, leftWindow: count(), hidden: count(), trips: count(), markers: Object.assign(count(), { found: [] }) } };
  }
  function status61() {
    const st = status60();
    const offNow = Array.isArray(knob('__fpShellOff')) ? knob('__fpShellOff') : [];
    const baseOn = (s) => (flag.screens || []).indexOf(s) >= 0 && offNow.indexOf(s) < 0;
    const ios = knob('__fpShellIOS');
    // Each piece's own reason first; a piece whose own checks pass is off only for another, with what it needs, as
    // FPCore's Pieces.resolve has it (negotiation.json's resolve rows): tabs needs the root under any root that is not
    // a live tab root (a classic one, or a tab root that fell back); coachHome needs tabs on and coach's own checks
    // passing, naming each it lacks; coach under a live tab root needs coachHome on.
    const why = {};
    if (typeof ios === 'number' && ios < 26) why.tabs = { off: 'os' };
    else if (!scene.switches.tabs) why.tabs = { off: 'device' };
    else if (scene.declined.tabs !== undefined) why.tabs = { off: 'page' };
    else if (!baseOn('tabs')) why.tabs = { off: 'policy' };
    else if (!live()) why.tabs = { off: 'needs', needs: ['root'] };
    const own = (s) => (scene.declined[s] !== undefined ? 'page' : !baseOn(s) ? 'policy' : null);
    ['coachHome', 'coach'].forEach((s) => {
      if (own(s)) why[s] = { off: own(s) };
      else if (s === 'coachHome' && (why.tabs || own('coach'))) {
        why[s] = { off: 'needs', needs: [why.tabs && 'tabs', own('coach') && 'coach'].filter(Boolean) };
      } else if (s === 'coach' && live() && why.coachHome) why[s] = { off: 'needs', needs: ['coachHome'] };
    });
    Object.keys(st.screens).forEach((s) => {
      const w = why[s] || null;
      const negotiated = !!(doc.negotiated && doc.negotiated.indexOf(s) >= 0 && doc.off.indexOf(s) < 0);
      st.screens[s] = { on: !w, live: !w && negotiated, off: w ? w.off : null, trip: null, why: null, at: null, canReset: false };
      if (w && w.needs) st.screens[s].needs = w.needs.slice();
    });
    st.root = scene.root;
    st.fellBack = scene.fellBack ? copy(scene.fellBack) : null;
    st.switches = { tabs: scene.switches.tabs };
    st.policy = copy(scene.policy);
    st.counters.strays = Object.assign(count(), { launch: scene.strays, total: scene.strays });
    return st;
  }
  function status(a) {
    const answer = () => (window.__fpShellStatus ? copy(window.__fpShellStatus) : v61 ? status61() : status60());
    if (v61 && a && a.refresh === true) {   // 3.10: a forced policy fetch, then the status
      scene.policy = { at: Date.now(), result: 'ok' }; save();
      const d = knob('__fpShellRefreshDelay');
      return later(null, typeof d === 'number' && d > 0 ? d : 0).then(answer);
    }
    return Promise.resolve(answer());
  }
  function reset(a) {   // the next launch may show it: off, verdicts and trips gone
    const st = window.__fpShellStatus, s = st && st.screens && st.screens[a && a.screen];
    if (s) Object.assign(s, { on: true, off: null, trip: null, why: null, at: null, canReset: false });
    if (st && Array.isArray(st.verdicts)) st.verdicts = st.verdicts.filter((v) => v.piece !== (a && a.screen));
    if (v61 && a && typeof a.screen === 'string') { delete scene.declined[a.screen]; save(); }
    return status();
  }
  function present(a) {
    if (!v61) return Promise.resolve({});
    const s = a && a.screen;
    if (s === 'tabs') return refusal('not-presentable: tabs is the root, never presented');
    if (s === 'coachHome') {
      if (!live()) return refusal('not-presentable: no live tab root');
      if (!doc.homeModel) return refusal('no coachHome model to open on');
      scene.coach = 'native'; doc.declared = true; save();
      if (scene.selected === 'coach' && !doc.covered) sendAll([['shell.covered', { on: true }]]);
      return Promise.resolve({});
    }
    if (s === 'coach') {
      if (live() && scene.coach !== 'native') return refusal('not-native: the Coach tab is not native');
      scene.pushed = true; save();
    }
    return Promise.resolve({});
  }
  function dismiss(a) {
    if (!v61) return Promise.resolve({});
    const s = a && a.screen;
    if (s === 'tabs') {
      if (live()) { scene.declined.tabs = doc.page; fallBackNow('page', { pageAsked: true }); }
      return Promise.resolve({});
    }
    if (s === 'coachHome' && live()) {
      scene.coach = 'web'; scene.pushed = false; doc.declared = true; save();
      if (scene.selected === 'coach' && doc.covered) sendAll([['shell.covered', { on: false }]]);
    }
    if (s === 'coach') { scene.pushed = false; save(); }
    return Promise.resolve({});
  }
  function model(a) {
    if (v61 && a && a.screen === 'coachHome') {
      doc.homeModel = true;
      try { scene.home = JSON.parse(a.json); } catch (e) { scene.home = null; }
      save();
    }
    return Promise.resolve({});
  }
  function selectTab(a) {
    if (!live()) return refusal('off: no live tab root');
    const tab = a && a.tab;
    if (R.TAB_IDS.indexOf(tab) < 0) return refusal('bad-tab: ' + tab + ' is not a tab');
    runFunnel(tab, 'page');
    const cross = knob('__fpShellCross');
    if (cross !== undefined) { delete window.__fpShellCross; if (R.TAB_IDS.indexOf(cross) >= 0) runFunnel(cross, 'tap'); }
    return Promise.resolve({ tab: scene.selected, seq: scene.seq });
  }
  function sheets(a) {
    if (!live()) return refusal('off: no live tab root');
    doc.sheetsOpen = !!(a && a.open);
    sheetsLog.push([performance.now(), doc.sheetsOpen]);
    scene.rev++; save();
    const bar = shownBar();
    if (knob('__fpShellSheetsSilent')) return new Promise(() => {});
    const d = knob('__fpShellSheetsDelay');
    return later({ bar }, typeof d === 'number' && d >= 0 ? d : 16);
  }
  function setSwitch(a) {
    const s = a && a.screen;
    if (s !== 'tabs') return refusal('no-switch: this binary keeps no switch for ' + s);
    scene.switches.tabs = !!a.on; save();
    if (!a.on && live()) fallBackNow('switch');
    return status();
  }
  const handlers = { hello, status, reset, present, dismiss, model, selectTab, sheets, setSwitch,
    visibility: () => Promise.resolve({ counted: false }) };
  const method = (name) => (a) => {
    calls.push(name === 'selectTab' ? [name, copy(a), { currentTab: window.currentTab }] : [name, copy(a)]);
    const th = knob('__fpShellThrow');
    if (Array.isArray(th) && th.indexOf(name) >= 0) throw new Error(name + ': thrown by the mock (__fpShellThrow)');
    if (window.__fpShell.refuse && window.__fpShell.refuse[name]) return Promise.reject(new Error(window.__fpShell.refuse[name]));
    try { return handlers[name] ? handlers[name](a) : Promise.resolve({}); } catch (e) { return Promise.reject(e); }
  };

  window.__fpShell = {
    flag, calls, refuse: {}, sent, sheetsLog, composer: '',
    of: (name) => calls.filter((c) => c[0] === name).map((c) => c[1]),
    models: () => calls.filter((c) => c[0] === 'model').map((c) => JSON.parse(c[1].json)),
    call: (name, args) => window.FPScreens.call(name, args || {}),
    // the owner's tap in the funnel's order; returns the page's answer to tabs.select
    tap: (tab) => (live() ? runFunnel(tab, 'tap') : Promise.reject(new Error('off: no live tab root'))),
    // a deepLink or a stray the root redirected: the same funnel and its tabs.select
    select: (tab, source) => {
      if (source !== 'deepLink' && source !== 'stray') return Promise.reject(new Error('select: source is deepLink or stray'));
      return live() ? runFunnel(tab, source) : Promise.reject(new Error('off: no live tab root'));
    },
    // a geometry change the shell made on its own: tabs.bar with the next rev
    bar: (h, safe) => {
      if (!live()) return Promise.reject(new Error('off: no live tab root'));
      scene.bar = { h: h | 0, safe: safe | 0 }; scene.rev++; save();
      return send('tabs.bar', { h: h | 0, safe: safe | 0, rev: scene.rev });
    },
    // the scene falls back (10.3's order); draft: the native composer's words
    fallBack: (why, draft) => {
      if (!live()) return Promise.reject(new Error('off: no live tab root'));
      if (draft !== undefined) window.__fpShell.composer = draft;
      return fallBackNow(why || 'failures');
    },
    state: () => ({ scene: copy(scene), doc: copy(doc), live: live(), composer: window.__fpShell.composer }),
  };
  window.Capacitor.Plugins.TrovoShell = {};
  (arg.methods || []).forEach((n) => { window.Capacitor.Plugins.TrovoShell[n] = method(n); });
}

module.exports = { boot, assert, run, SEED, SHELLS, SHELL_METHODS, CANONICAL_61, MOCK_RULES, BASE_PAGE, shellFlag };
