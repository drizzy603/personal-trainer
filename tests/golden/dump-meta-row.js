#!/usr/bin/env node
// dump-meta-row.js: the Coach hub's meta row as the page lays it out, written as the golden file the native hub's
// layout is held to (ios/App/FPKit/Tests/FPCoreTests/Fixtures/layout/meta-row.json; CoachHomeViewTests).
//
//   node tests/golden/dump-meta-row.js          write the file (on a Mac: the file is made where it is checked whole)
//   node tests/golden/dump-meta-row.js --check  exit 1 when the file differs from what the page lays out now
//
// The row is `.kt-meta-row` (index.html: display flex, space-between, no gap): the label (`.kt-meta-label`, a flex
// row of its 7 px ::before, a 9 px gap and the text) and the avatar's tile (`.kt-meta-ava`, 38 px, flex-shrink 1, so
// it gives way when the label is wider than its room). Each case is the web Coach hub drawn by renderCoach in Chromium
// (no shell, so the page draws the hub itself) in one room, at one phone width and one text size (the root zoom
// applyDynamicType sets: 1, 1.12, 1.24 for the large, xLarge and xxLarge body sizes), with one label written into the
// label and the owner's initial K into the tile. Read back: the label's lines (each letter's line off its client
// rect, a line's spaces at its ends dropped) and the tile's drawn width in points (its 38 px height is never flexed,
// so width = 38 x zoom x drawn width / drawn height). The labels are the page's own: 'COACH · WK nn / nn' and, when
// the week has a block name, ' · ' and that name in capitals (_coachHomeScreen); the fixtures' three, three
// multi-word names a coach may write, the ones whose break and tile the flexbox decides, and three whose break the
// web view's own rules decide (WebLineBreaks in FPUI): a slash inside a name, never a break (HYPERTROPHY/STRENGTH), a
// hyphen, a break after it (STRENGTH-ENDURANCE), and a slash between spaces, a break before it (UPPER / LOWER). WebKit
// (Playwright's 26.5, the phone's engine) lays every case out in the same lines as Chromium (probed 2026-11-03).
//
// What the check holds where: the lines and the tiles come from the text's glyph advances, so they are the Mac's
// (Chromium over CoreText). On darwin, where the file is made and where publish.sh runs the suite before every
// publish, --check and spec 126 compare the file byte for byte. On any other platform (CI's ubuntu-latest Chromium,
// whose text goes through FreeType, hinted and without subpixel positioning at a device scale factor of 1) they
// compare only what no text rasterizer decides: the file's version, notes and avatar, its cases in order (room, width,
// size, label), the computed styles that lay the row out (`styles`: the row, the label, its ::before, the tile) and
// the row's boxes with its label empty, which no glyph moves (`boxes`: the row's left and width, the label's left, the
// tile's width and height), each length within 0.05 px (the layout's 1/64 px steps through the zoom). Even on
// the Mac a device scale factor of 2 moves 35 of the first 180 tiles by 0.01 pt, with the same page, faces and engine.
// FP_META_ROW_PLATFORM=linux runs the other platforms' check on a Mac.
'use strict';
const fs = require('fs');
const path = require('path');
const { boot } = require('../lib/harness');
const { CLOCK_INIT } = require('./coach-cases');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'ios', 'App', 'FPKit', 'Tests', 'FPCoreTests', 'Fixtures', 'layout', 'meta-row.json');
const check = process.argv.includes('--check');

const ROOMS = ['heavyweight', 'dark'];
const WIDTHS = [320, 375, 390, 402, 440];
const SIZES = [['large', 1], ['xLarge', 1.12], ['xxLarge', 1.24]];
const LABELS = [
  'COACH · WK 06 / 12',
  'COACH · WK 06 / 12 · BUILD',
  'COACH · WK 06 / 12 · STRENGTH',
  'COACH · WK 03 / 12 · FOUNDATION PHASE',
  'COACH · WK 10 / 16 · PEAK & TAPER',
  'COACH · WK 06 / 12 · HYPERTROPHY ACCUMULATION',
  'COACH · WK 06 / 12 · HYPERTROPHY/STRENGTH',
  'COACH · WK 06 / 12 · STRENGTH-ENDURANCE',
  'COACH · WK 06 / 12 · UPPER / LOWER',
];
// The computed styles that lay the row out, per element (the label's text inherits the label's).
const STYLES = {
  row: ['display', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'column-gap', 'padding-left',
    'padding-right', 'border-left-width', 'border-right-width'],
  label: ['display', 'align-items', 'column-gap', 'flex-grow', 'flex-shrink', 'flex-basis', 'min-width', 'max-width',
    'margin-left', 'margin-right', 'padding-left', 'padding-right', 'font-family', 'font-size', 'font-weight',
    'font-style', 'font-stretch', 'font-variant-numeric', 'font-feature-settings', 'font-variation-settings',
    'font-kerning', 'letter-spacing', 'word-spacing', 'text-transform', 'white-space-collapse', 'text-wrap-mode',
    'text-wrap-style', 'word-break', 'overflow-wrap', 'line-break', 'hyphens'],
  before: ['content', 'display', 'width', 'height', 'flex-grow', 'flex-shrink', 'margin-left', 'margin-right'],
  ava: ['display', 'box-sizing', 'width', 'height', 'min-width', 'max-width', 'flex-grow', 'flex-shrink', 'flex-basis',
    'border-left-width', 'border-right-width', 'padding-left', 'padding-right', 'margin-left', 'margin-right',
    'font-family', 'font-size', 'font-weight'],
};
const AVATAR = 'K';

// Runs in the page: every case of one room at the viewport's width, as {label, size, lines, tile}, and per size the
// row's styles and boxes with its label empty ({size, styles, box}).
async function measure(arg) {
  const out = [], frames = [];
  _paintTheme(arg.room);
  currentTheme = arg.room;
  coachView = 'home'; intakeMode = false;
  if (currentTab !== 'coach') switchTab('coach'); else render();
  const row = () => document.querySelector('#screen .kt-meta-row');
  const label = () => document.querySelector('#screen .kt-meta-row .kt-meta-label');
  const ava = () => document.querySelector('#screen .kt-meta-row .kt-meta-ava');
  if (!label() || !ava()) throw new Error('no meta row on the Coach hub in ' + arg.room);
  const faces = arg.room === 'heavyweight' ? ['700 12px Archivo'] : ['700 12px "JetBrains Mono"'];
  const round = (v) => Math.round(v * 100) / 100;
  const pick = (cs, keys) => Object.fromEntries(keys.map((k) => [k,
    cs.getPropertyValue(k).replace(/(-?\d+(?:\.\d+)?)px/g, (m, n) => round(parseFloat(n)) + 'px')]));
  for (const [size, zoom] of arg.sizes) {
    applyDynamicType(zoom);
    render();
    // the styles and boxes with no text in the label, so no glyph moves them (a tile's used width is its own)
    label().textContent = '';
    ava().textContent = arg.avatar;
    const r = row().getBoundingClientRect(), l = label().getBoundingClientRect(), a = ava().getBoundingClientRect();
    frames.push({ size, styles: { row: pick(getComputedStyle(row()), arg.styles.row), label: pick(getComputedStyle(label()), arg.styles.label),
      before: pick(getComputedStyle(label(), '::before'), arg.styles.before), ava: pick(getComputedStyle(ava()), arg.styles.ava) },
      box: { row: [round(r.left), round(r.width)], label: round(l.left), tile: [round(a.width), round(a.height)] } });
    for (const text of arg.labels) {
      const el = label();
      el.textContent = text;
      ava().textContent = arg.avatar;
      await document.fonts.ready;
      for (const f of faces) if (!document.fonts.check(f, text)) throw new Error('the label\'s face is not loaded: ' + f);
      const node = el.firstChild, range = document.createRange(), rows = [];
      for (let i = 0; i < node.data.length; i++) {
        if (node.data[i] === ' ') continue;
        range.setStart(node, i); range.setEnd(node, i + 1);
        const b = range.getBoundingClientRect(), mid = b.top + b.height / 2;
        let line = rows.find((x) => Math.abs(x.mid - mid) < b.height / 2);
        if (!line) rows.push(line = { mid, first: i, last: i });
        line.first = Math.min(line.first, i); line.last = Math.max(line.last, i);
      }
      rows.sort((x, y) => x.mid - y.mid);
      const t = ava().getBoundingClientRect();
      out.push({ label: text, size, lines: rows.map((x) => node.data.slice(x.first, x.last + 1)),
        tile: Math.round(38 * zoom * t.width / t.height * 100) / 100 });
    }
  }
  return { cases: out, frames };
}

// The file's text as the page lays the cases out now.
async function pageLayout() {
  const cases = [], styles = [], boxes = [];
  for (const room of ROOMS) {
    const app = await boot({ seed: { kt_apikey: 'sk-ant-golden', kt_coach_msgs: '[]', kt_user_name: 'Kalani' }, store: 'classic',
      page: { timezoneId: 'UTC' }, init: CLOCK_INIT });
    try {
      for (const width of WIDTHS) {
        await app.page.setViewportSize({ width, height: 844 });
        const got = await app.page.evaluate(measure, { room, sizes: SIZES, labels: LABELS, avatar: AVATAR, styles: STYLES });
        for (const c of got.cases) cases.push({ room, width, size: c.size, label: c.label, lines: c.lines, tile: c.tile });
        for (const f of got.frames) {
          boxes.push(Object.assign({ room, width, size: f.size }, f.box));
          const json = JSON.stringify(f.styles);
          const same = styles.find((x) => x.room === room && x.size === f.size);
          if (!same) styles.push(Object.assign({ room, size: f.size }, f.styles));
          else if (JSON.stringify({ row: same.row, label: same.label, before: same.before, ava: same.ava }) !== json) {
            throw new Error('the row\'s styles in ' + room + ' at ' + f.size + ' change with the width (' + width + ' px)');
          }
        }
      }
      if (app.errors.length) throw new Error('page errors: ' + app.errors.join(' | '));
    } finally { await app.close(); }
  }
  const file = {
    v: 1,
    about: [
      'The Coach hub\'s meta row as the page lays it out (tests/golden/dump-meta-row.js; tests/golden/check.sh fails on drift).',
      'Each case: renderCoach\'s hub in Chromium in one room (heavyweight, or dark: Lime), at a phone width in points and a text size',
      '(the root zoom applyDynamicType sets: large 1, xLarge 1.12, xxLarge 1.24), with the label written into .kt-meta-label and',
      'the initial ' + AVATAR + ' into .kt-meta-ava. lines: the label\'s lines as drawn. tile: the avatar tile\'s drawn width in points',
      '(38 px x zoom unless the label is wider than its room: both flex-shrink 1, in proportion to their inner flex base sizes).',
      'CoachHomeViewTests.testTheMetaLabelBreaksWhereTheWebsDoes holds HomeMetaRow.layout to every case.',
      'styles (per room and size: the computed styles that lay the row out) and boxes (per room, width and size: the row\'s',
      'left and width, the label\'s left, the tile\'s width and height, in px), read with the label empty, are what no',
      'text rasterizer decides: off darwin the check holds those and the cases\' order, not the lines and tiles.',
    ],
    avatar: AVATAR,
    styles,
    boxes,
    cases,
  };
  return JSON.stringify(file, null, 1) + '\n';
}
// What differs between the file and the page's layout now (`text`, from pageLayout): nothing, or the parts that
// differ. On darwin the file whole, byte for byte; elsewhere only what no text rasterizer decides (the notes above).
function drift(text, platform = process.env.FP_META_ROW_PLATFORM || process.platform) {
  const file = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (platform === 'darwin') return file === text ? [] : ['the file, byte for byte (its lines and tiles included)'];
  let had;
  try { had = JSON.parse(file); } catch (e) { return ['the file (unreadable: ' + e.message + ')']; }
  const now = JSON.parse(text), bad = [];
  // equal, but a length (a number, or a px value in a style) within 0.05 px
  const px = /-?\d+(?:\.\d+)?(?=px)/g;
  const close = (a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 0.05;
    if (typeof a === 'string' && typeof b === 'string') {
      const x = a.match(px) || [], y = b.match(px) || [];
      return a.replace(px, '#') === b.replace(px, '#') && x.length === y.length && x.every((n, i) => Math.abs(n - y[i]) <= 0.05);
    }
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => close(v, b[i]));
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      const ka = Object.keys(a), kb = Object.keys(b);
      return ka.length === kb.length && ka.every((k, i) => k === kb[i] && close(a[k], b[k]));
    }
    return a === b;
  };
  for (const k of ['v', 'about', 'avatar']) if (JSON.stringify(had[k]) !== JSON.stringify(now[k])) bad.push(k);
  for (const k of ['styles', 'boxes']) if (!close(had[k], now[k])) bad.push(k);
  const order = (f) => JSON.stringify((f.cases || []).map((c) => [c.room, c.width, c.size, c.label]));
  if (order(had) !== order(now)) bad.push('the cases (room, width, size, label, in order)');
  return bad;
}

// What the check holds on this platform, in words.
function holds(platform = process.env.FP_META_ROW_PLATFORM || process.platform) {
  return platform === 'darwin' ? 'byte for byte' : 'what no text rasterizer decides (the lines and tiles: on darwin only)';
}
module.exports = { pageLayout, drift, holds, OUT };

if (require.main === module) {
  (async () => {
    const text = await pageLayout();
    if (check) {
      const bad = drift(text);
      if (bad.length) {
        console.error('FAIL: the page lays out the Coach hub\'s meta row otherwise than ' + path.relative(ROOT, OUT) +
          ' says (' + holds() + '): ' + bad.join(', ') + ' (node tests/golden/dump-meta-row.js on a Mac rewrites it)');
        process.exit(1);
      }
      console.log('ok: the Coach hub\'s meta row lays out as ' + path.relative(ROOT, OUT) + ' says (' + holds() + ')');
      return;
    }
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, text);
    console.log('wrote ' + JSON.parse(text).cases.length + ' meta row cases (' + path.relative(ROOT, OUT) + ')');
  })().catch((e) => { console.error('FAIL: ' + (e && e.stack || e)); process.exit(1); });
}
