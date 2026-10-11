#!/usr/bin/env node
// coach-fixtures.js: golden coach models (contract v1) for FPCore, until the page builds its own.
//
//   git show chatui/ui:index.html > /tmp/page.html
//   node ios/App/FPKit/Tools/coach-fixtures.js /tmp/page.html ios/App/FPKit/Tests/FPCoreTests/Fixtures
//
// Plan task C3 makes the page build these models (_coachModel) and tests/golden/dump-coach.js write
// them here; until then this script writes the models the contract describes (CoachModel.swift) from
// what the page has today:
//   - message bodies from Fixtures/blocks/page-grammar.json (made by the page's own md() and
//     _coachBlocksHTML(): blocks-fixtures.js);
//   - the room palette from the page's THEMES (as _paintTheme reads it: earned falls back to the accent);
//   - the chat's strings as chatui writes them (header, empty chat, chips, PLAN CHANGES, notes, chips
//     under errors, the composer).
// Every string goes through the page's _wellFormed, as _nativeJSON does, except lone-surrogates.json,
// which keeps its half emoji on purpose (an older page that skipped _nativeJSON).
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
const at = (day, hh, mm) => Date.UTC(2026, 9, day, hh, mm);   // October 2026
const header = (o) => Object.assign({ eyebrow: 'COACH · ONLINE', status: 'online', title: "Today's plan", meta: 'WK 06 · DAY 6',
  model: { label: 'Sonnet 5.5', name: 'Sonnet', version: '5.5', next: 'claude-haiku-4-5-20251001', a11y: 'Coach model: Sonnet 5.5. Switch to Haiku 4.5' },
  back: true, cancel: false }, o || {});
const composer = (o) => Object.assign({ placeholder: 'Message Coach…', short: 'Message…', a11y: 'Message the coach', attach: true, image: null, draft: null }, o || {});
const chips = ['What should I focus on this week?', 'Am I progressing on track?', 'How is my recovery looking?', 'Any trends in my training data?'];
const ledgerUndo = rows => ({ head: 'PLAN CHANGES · WEEK 6', rows, canUndo: true,
  note: 'Applied to your programme · Undo restores the previous version',
  actions: [{ do: 'undo', label: 'Undo', tone: 'neutral' }, { do: 'keep', label: 'Keep changes', tone: 'primary' }] });
const ledgerDone = rows => ({ head: 'PLAN CHANGES · WEEK 6', rows, canUndo: false,
  note: 'Applied to your programme. It cannot be undone here any more.', actions: [{ do: 'gotIt', label: 'Got it', tone: 'neutral' }] });
const quiet = c => Object.assign({}, c.body, { actions: [] });   // older replies show no chips
let nid = 0;
const id = () => 'm' + (++nid);
const user = (text, o) => Object.assign({ id: id(), role: 'user', at: null, local: false, error: false, stopped: false, body: text }, o || {});
const reply = (c, o) => Object.assign({ id: id(), role: 'assistant', at: null, local: false, error: false, stopped: false,
  eyebrow: c.eyebrow, body: c.body }, o || {});
const prose = (text, o) => Object.assign({ id: id(), role: 'assistant', at: null, local: false, error: false, stopped: false,
  eyebrow: 'COACH', body: { k: 'md', blocks: [{ k: 'p', r: [text] }] } }, o || {});
const note = (text, o) => Object.assign({ id: id(), role: 'assistant', at: null, local: true, error: false, stopped: false, body: text }, o || {});

function chat(room) {
  nid = 0;
  const run = body('run-analysis'), lists = body('lists'), adj = body('programme-adjustment'), table = body('table');
  const messages = [
    user('How did my run look yesterday?', { at: at(8, 18, 2), day: 'Yesterday' }),
    reply(run, { at: at(8, 18, 3), body: quiet(run), a11y: 'Coach: Good session. PACE: 8:07 vs 8:15 goal -8s. Takeaway: Aerobic base is improving.' }),
    user('Plateau check', { at: at(9, 7, 30), day: 'Today', seed: 'Plateau check' }),
    reply(lists, { at: at(9, 7, 31) }),
    user('', { at: at(9, 7, 40), image: { key: 'm5' } }),
    prose('That is a clean bar path. Keep the elbows tucked on the way down.', { at: at(9, 7, 41) }),
    user('Add 10 lb to my bench from this week', { at: at(9, 7, 45) }),
    reply(adj, { at: at(9, 7, 46), body: quiet(adj), pills: [{ label: 'Changed Bench Press · 170 lb', ok: true }, { label: 'Not applied · Squat goal', ok: false }],
      ledger: (room === 'heavyweight' ? ledgerUndo : ledgerDone)([['Bench Press', '→ 170 lb', 'plan'], ['Bench goal', '→ 200 lb', 'goal']]) }),
    user('Show my top sets', { at: at(9, 7, 50) }),
    reply(table, { at: at(9, 7, 51) }),
    user('and my squat?', { at: at(9, 7, 55) }),
    room === 'heavyweight'
      ? note('Could not connect. Check your internet connection.', { at: at(9, 7, 56), error: true, chip: 'retry' })
      : note('Anthropic did not accept your API key. Check it in Settings › AI Coach.', { at: at(9, 7, 56), error: true, errKind: 'key', chip: 'settings' }),
  ];
  return {
    v: 1, rev: 42, boot: 'b1760000000000-4f2a', intake: false, loading: false,
    room, paper: !!page.THEMES[room].paper, dynTypeOn: true,
    tokens: tokens(room, room === 'heavyweight'),
    header: header(), empty: null, messages, running: [], composer: composer(),
    speech: { id: messages[messages.length - 1].id, text: messages[messages.length - 1].body },
  };
}

function intake() {
  nid = 0;
  return {
    v: 1, rev: 3, boot: 'b1760000100000-77aa', intake: true, loading: true, room: 'heavyweight', paper: true, dynTypeOn: false,
    tokens: tokens('heavyweight', false),
    header: header({ eyebrow: 'COACH · INTAKE', status: 'intake', title: 'Build your plan', meta: null, model: null, back: false, cancel: true }),
    empty: null,
    messages: [
      user('I want to generate my training programme.', { at: at(9, 9, 0), day: 'Today', seed: 'Programme setup' }),
      prose('How many days a week can you train, and for how long each time?', { at: at(9, 9, 0) }),
      user('4 days, about an hour', { at: at(9, 9, 2) }),
    ],
    running: [{ label: 'Weeks 1–12 updated', ok: true }, { label: 'Profile updated', ok: true }],
    composer: composer({ placeholder: 'Answer the Coach…', short: null, a11y: 'Answer the coach', attach: false }),
    speech: { id: 's-thinking-3', text: 'Coach is thinking' },
  };
}

function empty() {
  nid = 0;
  return {
    v: 1, rev: 1, boot: 'b1760000200000-0c1d', intake: false, loading: false, room: 'dark', paper: false, dynTypeOn: true,
    tokens: tokens('dark', true),
    header: header({ meta: 'WK 01 · STARTS MON' }),
    empty: { title: 'Ask anything', sub: 'Your training, recovery, and goals',
      programme: { label: 'Custom programme active', actions: [{ do: 'restorePrevious', label: 'Restore previous', tone: 'plain' }, { do: 'regenerate', label: 'Reset programme', tone: 'plain' }] },
      chips },
    messages: [], running: [],
    composer: composer({ image: { key: 'share-1760000200' }, draft: { text: 'Build my Legs day around the trap bar', nonce: 'd-1760000200-2' } }),
    speech: null,
  };
}

function errors() {
  nid = 0;
  return {
    v: 1, rev: 9, boot: 'b1760000300000-e1e1', intake: false, loading: false, room: 'heavyweight', paper: true, dynTypeOn: true,
    tokens: tokens('heavyweight', false), header: header({ eyebrow: 'COACH · OFFLINE', status: 'offline' }), empty: null,
    messages: [
      user('Plan my week', { at: at(9, 10, 0), day: 'Today' }),
      note('Your Anthropic account is out of credit. Add credit at console.anthropic.com, then try again.', { at: at(9, 10, 0), error: true, errKind: 'billing' }),
      user('Plan my week', { at: at(9, 10, 5) }),
      note('Stopped.', { at: at(9, 10, 5), stopped: true }),
      user('Plan my week', { at: at(9, 10, 6) }),
      note('Stopped. Changes made before the stop are kept:', { at: at(9, 10, 7), pills: [{ label: 'Weeks 7–8 updated', ok: true }],
        ledger: ledgerUndo([['Weeks 7, 8', 'rewritten', 'plan']]) }),
      user('Plan my week', { at: at(9, 10, 8) }),
      note("Coach didn't respond (network error). Check your API key in Settings.", { at: at(9, 10, 9), error: true, chip: 'retry' }),
    ],
    running: [], composer: composer(), speech: { id: 'm8', text: "Coach didn't respond (network error). Check your API key in Settings." },
  };
}

function loading() {
  nid = 0;
  const c = body('cmb-with-markdown');
  return {
    v: 1, rev: 17, boot: 'b1760000400000-5a5a', intake: false, loading: true, room: 'dark', paper: false, dynTypeOn: true,
    tokens: tokens('dark', false), header: header({ eyebrow: 'COACH · REPLYING', status: 'replying' }), empty: null,
    messages: [
      user('Review my week', { at: at(9, 11, 0), day: 'Today', seed: 'Weekly review' }),
      reply(c, { at: at(9, 11, 1), body: quiet(c) }),
      user('Move Friday to Saturday', { at: at(9, 11, 3) }),
    ],
    running: [{ label: 'Friday ⇄ Saturday · this week', ok: true }],
    composer: composer(), speech: { id: 's-thinking-17', text: 'Coach is thinking' },
  };
}

// 60 messages, the cap: one of every body, over and over, with pills and one ledger.
function sixty() {
  nid = 0;
  const cases = grammar.cases;
  const messages = [];
  for (let i = 0; messages.length < 60; i++) {
    const c = cases[i % cases.length];
    messages.push(user('Question ' + (i + 1) + ' about ' + c.name.replace(/-/g, ' '), { at: at(1 + (i % 9), 8, i % 60), day: i % 6 === 0 ? 'Thu, Oct ' + (1 + (i % 9)) : null }));
    messages.push(reply(c, { at: at(1 + (i % 9), 8, (i + 1) % 60), body: quiet(c), pills: i % 5 === 0 ? [{ label: 'Bench Press → 170 lb', ok: true }] : [] }));
  }
  messages[59].ledger = ledgerUndo([['Bench Press', '→ 170 lb', 'plan']]);
  return { v: 1, rev: 300, boot: 'b1760000500000-6060', intake: false, loading: false, room: 'heavyweight', paper: true, dynTypeOn: true,
    tokens: tokens('heavyweight', true), header: header(), empty: null, messages, running: [], composer: composer(), speech: null };
}

// What a newer page could send to this build: every addition must decode, and draw as text when unknown.
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
write('heavyweight-chat', chat('heavyweight'));
write('lime-chat', chat('dark'));
write('intake', intake());
write('empty', empty());
write('errors', errors());
write('loading', loading());
write('sixty', sixty());
write('forward-compat', forwardCompat());
write('lone-surrogates', lonely(), true);
write('minimal', minimal());
