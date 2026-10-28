#!/usr/bin/env node
// coach-html.js: the coach chat's HTML, frozen (plan task C2).
//
//   node tests/golden/coach-html.js                  check index.html against coach-html.json (exit 1 on drift)
//   node tests/golden/coach-html.js --write          capture index.html into coach-html.json
//   node tests/golden/coach-html.js --page FILE      check (or --write) another copy of the page,
//                                                    e.g. `git show <commit>:index.html > /tmp/p.html`
//   node tests/golden/coach-html.js --only G/N       check (or --write) the one case G/N (group/name): with
//                                                    --write that case alone is re-captured and every other
//                                                    case keeps its bytes (a change made on purpose, in a
//                                                    commit of its own, whose reason RECAPTURED below names)
//
// coach-html.json is what the page drew before md() and _coachBlocksHTML() were rebuilt on the block
// models the native chat reads (_mdModel, _cmbModel) and before _planChangeRows() returned raw text:
// every case of coach-cases.js through md(), _coachBlocksHTML() (with and without quiet),
// _planChangeLedger(), _toolPillHTML() and renderCoach(). Its homes group is the Coach hub and connect
// screen before renderCoach() was rebuilt on _coachHomeModel() (build 61, plan task P6). The rebuilt
// page must draw the same bytes. Spec 118 runs the same capture in the suite.
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
const oi = args.indexOf('--only');
const only = oi >= 0 ? String(args[oi + 1] || '') : null;
if (only !== null && !/^[^/\s]+\/[^/\s]+$/.test(only)) { console.error('--only takes one case as group/name, e.g. homes/hub-empty'); process.exit(2); }

// What each group is, for the about line when --write adds the group to coach-html.json.
const GROUPS = {
  homes: 'the Coach hub and connect HTML (renderCoach() on the hub view, one room: the markup has no room branch), frozen '
    + 'before renderCoach() was rebuilt on _coachHomeModel()',
};
// The cases re-captured alone on purpose (--write --only), and why: written into the about line.
const RECAPTURED = {
  'homes/hub-cut-emoji': 'the hub rebuilt on _coachHomeModel() cuts its preview in whole characters (contract 6.2), so the half '
    + 'emoji the 65-unit slice left is now the whole one',
};

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

// The about line of a whole capture: the old one while every case it held kept its bytes (a sentence added for each
// new group), else the line of a page frozen whole at this build.
function aboutOf(old, got, build) {
  const same = (g, n) => JSON.stringify(old.cases[g][n]) === JSON.stringify((got[g] || {})[n]);
  if (old && Object.keys(old.cases).every((g) => Object.keys(old.cases[g]).every((n) => same(g, n)))) {
    let about = old.about;
    for (const g of Object.keys(got)) {
      if (!old.cases[g]) about += ' The ' + g + ' group (' + Object.keys(got[g]).length + ' cases): ' + (GROUPS[g] || 'captured') + ', at web ' + build + '.';
    }
    return about;
  }
  return 'The coach chat HTML of index.html (web ' + build + '), before md() and _coachBlocksHTML() were rebuilt on block models and _planChangeRows() returned raw text.'
    + Object.keys(got).filter((g) => GROUPS[g]).map((g) => ' The ' + g + ' group: ' + GROUPS[g] + '.').join('')
    + ' Made by tests/golden/coach-html.js --write; lone surrogates written as <U+XXXX>.';
}

(async () => {
  const got = await captureFile();
  const old = fs.existsSync(JSON_PATH) ? JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')) : null;
  const build = (fs.readFileSync(pageFile, 'utf8').match(/<meta name="build" content="([^"]+)"/) || [])[1] || '?';
  if (only !== null) {
    const [g, n] = only.split('/');
    if (!got[g] || !(n in got[g])) { console.error('FAIL: the capture has no case ' + only); process.exit(1); }
    if (write) {
      if (!old) { console.error('FAIL: --only re-captures one case of an existing ' + path.relative(ROOT, JSON_PATH)); process.exit(1); }
      const was = old.cases[g] && old.cases[g][n];
      old.cases[g] = old.cases[g] || {};
      old.cases[g][n] = got[g][n];
      const note = ' Re-captured alone (--only): ' + only;
      if (old.about.indexOf(note) < 0) old.about += note + (RECAPTURED[only] ? ', ' + RECAPTURED[only] : '') + '.';
      fs.writeFileSync(JSON_PATH, JSON.stringify(old, null, 1) + '\n');
      console.log('wrote ' + only + ' alone into ' + path.relative(ROOT, JSON_PATH) + (JSON.stringify(was) === JSON.stringify(got[g][n]) ? ' (unchanged)' : ' (changed)'));
      return;
    }
    const want = old ? (old.cases[g] || {})[n] : undefined;
    if (JSON.stringify(want) !== JSON.stringify(got[g][n])) {
      console.error('FAIL: the page draws different HTML for ' + only + '\n  want: ' + JSON.stringify(want).slice(0, 600) + '\n  got:  ' + JSON.stringify(got[g][n]).slice(0, 600));
      process.exit(1);
    }
    console.log('ok: ' + only + ' draws the same HTML');
    return;
  }
  if (write) {
    const doc = { about: aboutOf(old, got, build), cases: got };
    fs.writeFileSync(JSON_PATH, JSON.stringify(doc, null, 1) + '\n');
    const n = Object.values(got).reduce((s, g) => s + Object.keys(g).length, 0);
    console.log('wrote ' + path.relative(ROOT, JSON_PATH) + ' (' + n + ' cases from web ' + build + ')');
    return;
  }
  const want = old.cases;
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
