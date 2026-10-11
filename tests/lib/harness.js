// Shared Playwright harness for the Fitness Programmer JS regression suites.
//
// Serves the repo root over local HTTP (the OTA loader is capacitor:-only, so
// it stays dormant), seeds localStorage from seed-dump.json before the page
// scripts run, and — when opts.native is set — installs a mock Capacitor
// bridge so the watch/widget code paths run as they would inside the shell.
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
async function boot(opts = {}) {
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

  const seed = Object.assign({}, SEED, opts.seed || {});
  await page.addInitScript(({ seed, native, watchPending }) => {
    for (const k of Object.keys(seed)) localStorage.setItem(k, seed[k]);
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
    page, errors,
    close: async () => { await browser.close(); srv.close(); },
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
