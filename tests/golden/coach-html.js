#!/usr/bin/env node
// coach-html.js: the coach chat's HTML, frozen (plan task C2).
//
//   node tests/golden/coach-html.js                  check index.html against coach-html.json (exit 1 on drift)
//   node tests/golden/coach-html.js --write          capture index.html into coach-html.json
//   node tests/golden/coach-html.js --page FILE      check (or --write) another copy of the page,
//                                                    e.g. `git show <commit>:index.html > /tmp/p.html`
//
// coach-html.json is what the page drew before md() and _coachBlocksHTML() were rebuilt on the block
// models the native chat reads (_mdModel, _cmbModel) and before _planChangeRows() returned raw text:
// every case of coach-cases.js through md(), _coachBlocksHTML() (with and without quiet),
// _planChangeLedger(), _toolPillHTML() and renderCoach(). The rebuilt page must draw the same bytes.
// Spec 118 runs the same capture in the suite.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { CLOCK_INIT, TEXTS, TOOLS, capture, asciiJSON } = require('./coach-cases');

const ROOT = path.resolve(__dirname, '..', '..');
const JSON_PATH = path.join(__dirname, 'coach-html.json');
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'seed-dump.json'), 'utf8'));

const args = process.argv.slice(2);
const write = args.includes('--write');
const pi = args.indexOf('--page');
const pageFile = pi >= 0 ? path.resolve(args[pi + 1]) : path.join(ROOT, 'index.html');

// The repo over local HTTP, with /index.html answered from pageFile.
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const file = p === '/index.html' ? pageFile : path.join(ROOT, p);
      if (!file.startsWith(ROOT) && file !== pageFile) { res.writeHead(404); res.end(); return; }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': /\.html$/.test(file) ? 'text/html' : /\.js$/.test(file) ? 'text/javascript' : 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

// What the page at pageFile draws for every case.
async function captureFile() {
  const srv = await serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'UTC' });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.route('**/*', (route) => (route.request().url().includes('127.0.0.1') ? route.continue() : route.abort()));
    await page.addInitScript((seed) => { for (const k of Object.keys(seed)) localStorage.setItem(k, seed[k]); }, Object.assign({}, SEED, { kt_apikey: 'sk-ant-golden', kt_coach_msgs: '[]' }));
    await page.addInitScript({ content: CLOCK_INIT });
    await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.render === 'function', { timeout: 10000 });
    const out = await page.evaluate(capture, asciiJSON({ TEXTS, TOOLS }));
    if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
    return out;
  } finally { await browser.close(); srv.close(); }
}

// The cases whose HTML differs, as "group/name" lines.
function drift(want, got) {
  const out = [];
  for (const g of Object.keys(want)) {
    for (const n of Object.keys(want[g])) {
      if (JSON.stringify(want[g][n]) !== JSON.stringify((got[g] || {})[n])) out.push(g + '/' + n);
    }
  }
  for (const g of Object.keys(got)) for (const n of Object.keys(got[g])) if (!want[g] || !(n in want[g])) out.push(g + '/' + n + ' (new)');
  return out;
}

(async () => {
  const got = await captureFile();
  if (write) {
    const build = (fs.readFileSync(pageFile, 'utf8').match(/<meta name="build" content="([^"]+)"/) || [])[1] || '?';
    const doc = { about: 'The coach chat HTML of index.html (web ' + build + '), before md() and _coachBlocksHTML() were rebuilt on block models and _planChangeRows() returned raw text. Made by tests/golden/coach-html.js --write; lone surrogates written as <U+XXXX>.', cases: got };
    fs.writeFileSync(JSON_PATH, JSON.stringify(doc, null, 1) + '\n');
    const n = Object.values(got).reduce((s, g) => s + Object.keys(g).length, 0);
    console.log('wrote ' + path.relative(ROOT, JSON_PATH) + ' (' + n + ' cases from web ' + build + ')');
    return;
  }
  const want = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')).cases;
  const bad = drift(want, got);
  if (bad.length) {
    console.error('FAIL: the page draws different HTML for ' + bad.length + ' golden case(s): ' + bad.slice(0, 12).join(', '));
    const [g, n] = bad[0].split(' ')[0].split('/');
    console.error('  first: ' + g + '/' + n + '\n  want: ' + JSON.stringify(want[g] && want[g][n]).slice(0, 600) + '\n  got:  ' + JSON.stringify((got[g] || {})[n]).slice(0, 600));
    process.exit(1);
  }
  const n = Object.values(want).reduce((s, g) => s + Object.keys(g).length, 0);
  console.log('ok: ' + n + ' golden cases draw the same HTML');
})().catch((e) => { console.error('FAIL: ' + (e && e.stack || e)); process.exit(1); });
