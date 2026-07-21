// Shared Playwright harness for the Supero JS regression suites.
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
async function boot(opts = {}) {
  const srv = await startServer();
  const port = srv.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
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

module.exports = { boot, assert, run, SEED };
