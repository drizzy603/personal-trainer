#!/usr/bin/env node
// coach-fixtures.js: the coach models (contract v1) for FPCore that the page cannot build.
//
//   node ios/App/FPKit/Tools/coach-fixtures.js index.html ios/App/FPKit/Tests/FPCoreTests/Fixtures
//
// The page builds its own coach models since plan task C3 (_coachModel), and tests/golden/dump-coach.js
// writes them into Fixtures/coach (both rooms, setup, the empty chat, errors, a reply in flight, 60
// messages). This script writes the three no page sends, by hand from what the contract describes
// (CoachModel.swift):
//   - forward-compat.json: what a newer page could add (unknown blocks, actions, tones, fields);
//   - lone-surrogates.json: an older page that skipped _nativeJSON (it keeps its half emoji);
//   - minimal.json: {v:1}, every default.
// Message bodies come from Fixtures/blocks/page-grammar.json (the page's own md() and
// _coachBlocksHTML(): blocks-fixtures.js), the palette from the page's THEMES.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const [pagePath, outDir] = process.argv.slice(2);
if (!pagePath || !outDir) { console.error('usage: node coach-fixtures.js <page index.html> <Fixtures dir>'); process.exit(2); }
const html = fs.readFileSync(pagePath, 'utf8');
const scripts = []; const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi; let m;
while ((m = re.exec(html)) !== null) scripts.push(m[1]);
const src = scripts.join('\n');
function grabFrom(start) {
  let d = 0;
  for (let k = src.indexOf('{', start); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(start, k + 1); }
  }
  throw new Error('unbalanced');
}
const page = {};
vm.createContext(page);
vm.runInContext([grabFrom(src.indexOf('function _chars(')), grabFrom(src.indexOf('function _wellFormed(')),
  grabFrom(src.indexOf('var THEMES = {')) + ';', 'this.THEMES = THEMES;'].join('\n'), page);

const grammar = JSON.parse(fs.readFileSync(path.join(outDir, 'blocks', 'page-grammar.json'), 'utf8'));
const body = name => { const c = grammar.cases.find(x => x.name === name); if (!c) throw new Error('no case ' + name); return c; };

// ── tokens ──────────────────────────────────────────────────────────────────────────────────────
const camel = k => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
function palette(room) {
  const t = page.THEMES[room]; const out = {};
  for (const k of Object.keys(t)) {
    if (['name', 'room', 'paper', 'textColor'].includes(k)) continue;
    out[camel(k)] = t[k];
  }
  out.earned = t.earned || t.accent;
  out.earnedInk = t['earned-ink'] || t['accent-ink'];
  return out;
}
// The chat's roles, as the room CSS paints them (chatui/ui): what _coachModel will send.
const ROLES = {
  heavyweight: { sel: 'rgba(10,67,245,.10)', eyebrow: '#0a43f5', headDot: '#0a43f5', userBubble: '#0a43f5', onUserBubble: '#ffffff',
    chipPrimary: '#0a43f5', chipPrimaryText: '#ffffff', chipPrimaryBorder: '#0a43f5', pill: '#ffffff', pillIcon: '#4f7000',
    takeEyebrow: '#0a43f5', ledgerHead: '#0a43f5', deltaGood: '#4f7000', deltaWarn: 'color-mix(in srgb, #ea580c 80%, #0f0f0f)',
    progAction: '#0a43f5', composerFocus: '#0a43f5' },
  dark: { sel: 'color-mix(in srgb, #f4f4f1 15%, #151517)', eyebrow: '#8c8c91', headDot: '#8c8c91',
    userBubble: 'color-mix(in srgb, #f4f4f1 15%, #151517)', onUserBubble: '#f4f4f1',
    chipPrimary: '#1e1e21', chipPrimaryText: '#f4f4f1', chipPrimaryBorder: 'rgba(255,255,255,.08)', pill: '#1e1e21', pillIcon: '#b9b9be',
    takeEyebrow: '#8c8c91', ledgerHead: '#8c8c91', deltaGood: '#d8ff63', deltaWarn: '#ff9d5c', progAction: '#b9b9be', composerFocus: '#b9b9be' },
};
const TYPE = { title: 22, headEyebrow: 10, headMeta: 10, model: 11, body: 15, bubble: 15, heading: 16, eyebrow: 9, metricLabel: 10,
  metricValue: 13, metricRef: 12, take: 14, chip: 13, pill: 12, note: 13, day: 10, ledgerHead: 9, ledgerRow: 13, ledgerNote: 11,
  button: 13, table: 13, tableHead: 10, composer: 16, thinking: 13, emptyTitle: 22, emptySub: 14 };
const SPACE = { gutter: 20, messageGap: 8, turnGap: 20, blockGap: 10, sectionGap: 12, paragraphGap: 10, listItemGap: 6, cardPadH: 14,
  cardPadV: 12, metricPadV: 10, bubblePadH: 16, bubblePadV: 12, chipPadH: 16, chipPadV: 10, chipGap: 8, pillGap: 6, pillPadH: 10,
  pillPadV: 5, composerPad: 6, hit: 44 };
const RADIUS = { heavyweight: { card: 14, bubble: 16, bubbleTail: 5, chip: 22, pill: 12, composer: 16, send: 12, button: 12, code: 5, photo: 10, table: 14 },
  dark: { card: 14, bubble: 16, bubbleTail: 5, chip: 22, pill: 12, composer: 20, send: 22, button: 12, code: 5, photo: 10, table: 14 } };
const FONT = { heavyweight: { body: 'Archivo', eyebrow: 'Archivo', display: 'Anton', mono: 'Archivo' },
  dark: { body: 'Inter', eyebrow: 'JetBrains Mono', display: 'Inter', mono: 'JetBrains Mono' } };
const tokens = (room, full) => full
  ? { color: Object.assign(palette(room), ROLES[room]), type: TYPE, space: SPACE, radius: RADIUS[room], font: FONT[room] }
  : { color: Object.assign(palette(room), ROLES[room]) };

// ── the chat's strings (chatui) ─────────────────────────────────────────────────────────────────
const header = (o) => Object.assign({ eyebrow: 'COACH · ONLINE', status: 'online', title: "Today's plan", meta: 'WK 06 · DAY 6',
  model: { label: 'Sonnet 5.5', name: 'Sonnet', version: '5.5', next: 'claude-haiku-4-5-20251001', a11y: 'Coach model: Sonnet 5.5. Switch to Haiku 4.5' },
  back: true, cancel: false }, o || {});
const composer = (o) => Object.assign({ placeholder: 'Message Coach…', short: 'Message…', a11y: 'Message the coach', attach: true, image: null, draft: null }, o || {});
let nid = 0;
const id = () => 'm' + (++nid);
const user = (text, o) => Object.assign({ id: id(), role: 'user', at: null, local: false, error: false, stopped: false, body: text }, o || {});
const reply = (c, o) => Object.assign({ id: id(), role: 'assistant', at: null, local: false, error: false, stopped: false,
  eyebrow: c.eyebrow, body: c.body }, o || {});
const prose = (text, o) => Object.assign({ id: id(), role: 'assistant', at: null, local: false, error: false, stopped: false,
  eyebrow: 'COACH', body: { k: 'md', blocks: [{ k: 'p', r: [text] }] } }, o || {});

function forwardCompat() {
  nid = 0;
  return {
    v: 1, rev: 5, boot: 'b1760000600000-f0f0', intake: false, loading: false, room: 'ocean', paper: false, dynTypeOn: true,
    newTopLevel: { anything: [1, 2, 3] },
    tokens: { color: { accent: '#ff7a00', bg: 'var(--bg)', glow: '#ffffff' }, type: { body: 17, huge: 999 }, motion: { fast: 0.15 } },
    header: header({ status: 'thinking', extra: true, model: { label: 'Opus 5', next: 'claude-opus-5', a11y: 'Coach model: Opus 5. Switch to Sonnet 5.5' } }),
    empty: null,
    messages: [
      user('What is new?', { day: 'Today', mood: 'curious' }),
      { id: id(), role: 'assistant', eyebrow: 'COACH · Chart', body: { k: 'cmb', sections: [
        { k: 'chart', text: 'Volume up 4% over four weeks', series: [1, 2, 3, 4] },
        { k: 'md', blocks: [{ k: 'callout', tone: 'warn', title: 'Deload', items: ['week 8'] }, { k: 'p', r: ['Plain text still reads.'] }] },
        { k: 'take', r: [{ t: 'Keep going', s: 'bu' }] }], actions: [{ label: 'Show the chart', msg: 'Show my volume chart', primary: true, icon: 'chart' }] },
      chip: { do: 'upgrade', label: 'Upgrade', tone: 'primary' }, ledger: { head: 'PLAN CHANGES · WEEK 6', rows: [{ label: 'Note', value: 'kept', kind: 'note' }], canUndo: false, note: null } },
      { id: id(), role: 'assistant', eyebrow: 'COACH', body: { k: 'voice', text: 'A voice reply (0:12)', url: 'x' } },
      'not a message',
      { id: id(), role: 'system', local: true, body: 'A role this build does not know', errKind: 'quota', error: true },
    ],
    running: [], composer: composer({ attach: true, voice: true }), speech: 'Coach: What is new?',
  };
}

function lonely() {
  // an older page that skipped _nativeJSON: half an emoji in a title, a body, a pill, a chip and a key
  nid = 0;
  const half = String.fromCharCode(0xD83D), low = String.fromCharCode(0xDE00);
  return {
    v: 1, rev: 2, boot: 'b1760000700000-d83d', intake: false, loading: false, room: 'heavyweight', paper: true, dynTypeOn: true,
    tokens: tokens('heavyweight', false), header: header({ title: "Today's plan " + half }), empty: null,
    messages: [
      user('Strong week ' + half, { day: 'Today' }),
      prose('Great work ' + low + half + 'on the bench.'),
      reply(body('programme-adjustment'), { pills: [{ label: 'Bench ' + half, ok: true }] }),
    ],
    running: [], composer: composer({ draft: { text: 'half ' + half, nonce: 'd1' } }), speech: { id: 's1', text: 'Coach: Great work ' + half },
    ['key' + half]: 'a key with half an emoji',
  };
}

function minimal() { return { v: 1 }; }

const write = (name, model, keepHalves) => {
  const text = JSON.stringify(model, (k, v) => (typeof v === 'string' && !keepHalves ? page._wellFormed(v) : v), 1);
  fs.mkdirSync(path.join(outDir, 'coach'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'coach', name + '.json'), text + '\n');
};
write('forward-compat', forwardCompat());
write('lone-surrogates', lonely(), true);
write('minimal', minimal());
