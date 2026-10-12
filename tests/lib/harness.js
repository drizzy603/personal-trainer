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
// Usage in a spec:
//   const { boot, assert, run } = require('../lib/harness');
//   run('my suite', async () => {
//     const app = await boot();
//     try { ... } finally { await app.close(); }
//   });

const http = require('http');
const fs = require('fs');
const path = require('path');
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

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
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
// opts.shell       — the shell contract: 'none', 'inert', 'coach' or a flag object (SHELLS, shellFlag below).
//                    Default: 'inert' for a native boot when FP_SHELL_INERT=1, else 'none'. Combines with opts.store.
async function boot(opts = {}) {
  const store = storeMode(opts);
  const srv = await startServer();
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
  const shell = shellFlag(opts);   // the shell contract this boot runs under (opts.shell, FP_SHELL_INERT): see shellMock
  if (shell) await page.addInitScript(shellMock, shell);

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
      if (store && opts.storeCheck !== false) await storeCheck(page);
      await browser.close(); srv.close();
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

// Shell contracts (plan task C3). opts.shell names the one a boot runs under, one variant per contract
// an installable shell speaks:
//   'none'   no flag and no TrovoShell: every shell up to 59, the PWA, the browser (the default);
//   'inert'  build 60's flag with no native screen: window.__FP_SHELL {v:1, screens:[]} and the mock;
//   'coach'  build 60: contract v1 with the native Coach chat;
//   or a flag object {v, min, shell, screens}.
// FP_SHELL_INERT=1 (tests/run.sh passes it) runs every native boot that names no shell as 'inert'.
// The mock TrovoShell answers hello the way FPCore's Negotiation does and records every call in
// window.__fpShell (calls, of(name), models()); a spec calls the page as the shell does through
// window.FPScreens.call(name, args).
const SHELLS = {
  none: null,
  inert: { v: 1, min: 1, shell: '60', screens: [] },
  coach: { v: 1, min: 1, shell: '60', screens: ['coach'] },
};
function shellFlag(opts) {
  let s = opts.shell;
  if (s === undefined || s === null) s = opts.native && process.env.FP_SHELL_INERT === '1' ? 'inert' : 'none';
  if (typeof s === 'string') {
    if (!Object.prototype.hasOwnProperty.call(SHELLS, s)) throw new Error('unknown shell variant "' + s + '" (none, inert, coach)');
    return SHELLS[s];
  }
  return s || null;
}
// Runs in the page before its scripts: the flag the shell injects at document start, and TrovoShell.
function shellMock(flag) {
  window.__FP_SHELL = JSON.parse(JSON.stringify(flag));
  if (!window.Capacitor) window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} };
  const calls = [];
  const copy = (a) => (a === undefined ? null : JSON.parse(JSON.stringify(a)));
  function hello(a) {   // FPCore Negotiation.negotiate
    const want = (a && a.v) | 0;
    if (want < 1) return { v: 0, screens: [], why: 'no-version' };
    const v = Math.min(want, flag.v);
    if (v < (flag.min || 1)) return { v: 0, screens: [], why: 'page-too-old' };
    return { v, screens: (flag.screens || []).filter((s) => ((a && a.screens) || []).indexOf(s) >= 0) };
  }
  const method = (name) => (a) => {
    calls.push([name, copy(a)]);
    if (window.__fpShell.refuse && window.__fpShell.refuse[name]) return Promise.reject(new Error(window.__fpShell.refuse[name]));
    return Promise.resolve(name === 'hello' ? hello(a) : {});
  };
  window.__fpShell = {
    flag, calls, refuse: {},
    of: (name) => calls.filter((c) => c[0] === name).map((c) => c[1]),
    models: () => calls.filter((c) => c[0] === 'model').map((c) => JSON.parse(c[1].json)),
    call: (name, args) => window.FPScreens.call(name, args || {}),
  };
  window.Capacitor.Plugins.TrovoShell = {};
  ['hello', 'bootDone', 'present', 'dismiss', 'model', 'toast', 'confirm', 'log'].forEach((n) => { window.Capacitor.Plugins.TrovoShell[n] = method(n); });
}

module.exports = { boot, assert, run, SEED, SHELLS };
