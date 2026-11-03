#!/usr/bin/env node
// dump-meta-row.js: the Coach hub's meta row as the page lays it out, written as the golden file the native hub's
// layout is held to (ios/App/FPKit/Tests/FPCoreTests/Fixtures/layout/meta-row.json; CoachHomeViewTests).
//
//   node tests/golden/dump-meta-row.js          write the file
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
// the week has a block name, ' · ' and that name in capitals (_coachHomeScreen); the fixtures' three and three
// multi-word names a coach may write, the ones whose break and tile the flexbox decides.
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
];
const AVATAR = 'K';

// Runs in the page: every case of one room, as {label, width, size, lines, tile}.
async function measure(arg) {
  const out = [];
  _paintTheme(arg.room);
  currentTheme = arg.room;
  coachView = 'home'; intakeMode = false;
  if (currentTab !== 'coach') switchTab('coach'); else render();
  const label = () => document.querySelector('#screen .kt-meta-row .kt-meta-label');
  const ava = () => document.querySelector('#screen .kt-meta-row .kt-meta-ava');
  if (!label() || !ava()) throw new Error('no meta row on the Coach hub in ' + arg.room);
  const faces = arg.room === 'heavyweight' ? ['700 12px Archivo'] : ['700 12px "JetBrains Mono"'];
  for (const [size, zoom] of arg.sizes) {
    applyDynamicType(zoom);
    render();
    for (const text of arg.labels) {
      const el = label();
      el.textContent = text;
      ava().textContent = arg.avatar;
      await document.fonts.ready;
      for (const f of faces) if (!document.fonts.check(f, text)) throw new Error('the label\'s face is not loaded: ' + f);
      const node = el.firstChild, r = document.createRange(), rows = [];
      for (let i = 0; i < node.data.length; i++) {
        if (node.data[i] === ' ') continue;
        r.setStart(node, i); r.setEnd(node, i + 1);
        const b = r.getBoundingClientRect(), mid = b.top + b.height / 2;
        let row = rows.find((x) => Math.abs(x.mid - mid) < b.height / 2);
        if (!row) rows.push(row = { mid, first: i, last: i });
        row.first = Math.min(row.first, i); row.last = Math.max(row.last, i);
      }
      rows.sort((a, b) => a.mid - b.mid);
      const a = ava().getBoundingClientRect();
      out.push({ label: text, size, lines: rows.map((x) => node.data.slice(x.first, x.last + 1)),
        tile: Math.round(38 * zoom * a.width / a.height * 100) / 100 });
    }
  }
  return out;
}

// The file's text as the page lays the cases out now.
async function pageLayout() {
  const cases = [];
  for (const room of ROOMS) {
    const app = await boot({ seed: { kt_apikey: 'sk-ant-golden', kt_coach_msgs: '[]', kt_user_name: 'Kalani' }, store: 'classic',
      page: { timezoneId: 'UTC' }, init: CLOCK_INIT });
    try {
      for (const width of WIDTHS) {
        await app.page.setViewportSize({ width, height: 844 });
        for (const c of await app.page.evaluate(measure, { room, sizes: SIZES, labels: LABELS, avatar: AVATAR })) {
          cases.push({ room, width, size: c.size, label: c.label, lines: c.lines, tile: c.tile });
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
    ],
    avatar: AVATAR,
    cases,
  };
  return JSON.stringify(file, null, 1) + '\n';
}
module.exports = { pageLayout, OUT };

if (require.main === module) {
  (async () => {
    const text = await pageLayout();
    if (check) {
      if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== text) {
        console.error('FAIL: the page lays out the Coach hub\'s meta row otherwise than ' + path.relative(ROOT, OUT) +
          ' (node tests/golden/dump-meta-row.js rewrites it)');
        process.exit(1);
      }
      console.log('ok: the Coach hub\'s meta row lays out as ' + path.relative(ROOT, OUT) + ' says');
      return;
    }
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, text);
    console.log('wrote ' + JSON.parse(text).cases.length + ' meta row cases (' + path.relative(ROOT, OUT) + ')');
  })().catch((e) => { console.error('FAIL: ' + (e && e.stack || e)); process.exit(1); });
}
