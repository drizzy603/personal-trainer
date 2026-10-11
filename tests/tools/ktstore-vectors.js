#!/usr/bin/env node
// Writes ios/App/FPKit/Tests/FPStoreTests/Vectors/vectors.json: what the storage facade sends, computed by
// JavaScript itself, so FPStore's Swift tests (WireTests) prove the native side reads it exactly:
//   - values: JSON.stringify(v) (the wire literal), H(v) (the facade's hash), v.length, and the literal the
//     store answers with (every surrogate half, control and U+2028/2029 escaped), checked here with JSON.parse;
//   - formulas: long strings both sides rebuild from a formula (a 200k-character value), by hash and length;
//   - hello: a whole hello payload as the facade builds it, gap note included, and the manifest it carries;
//   - gapNotes: gap notes made by JSON.stringify, with the keys, hashes and stamps they name;
//   - noteSteps: the gap note after each missed op of a script, built by noteAfter() exactly as the facade must
//     write it (rule 5 needs both stamps: s per missed set or remove, c for a missed clear);
//   - merges: Put back's record merge of a log key, ordered by index.html's own lsSet comparator.
//
//   node tests/tools/ktstore-vectors.js           write the file
//   node tests/tools/ktstore-vectors.js --check   exit 1 if the committed file differs (CI drift check)
//
// H() is ktstore.js's hash. Keep it identical to the shipped facade's (FPStore/Resources/ktstore.js, plan task S3).
// Source text stays ASCII: every other code unit is written as a \u{...} escape.
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '../../ios/App/FPKit/Tests/FPStoreTests/Vectors/vectors.json');

// The facade's hash: length + FNV-1a 32 + djb2 32 over UTF-16 code units.
function H(s) {
  var a = 0x811c9dc5, b = 5381, i, c;
  for (i = 0; i < s.length; i++) { c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193) >>> 0; b = (Math.imul(b, 33) + c) >>> 0; }
  return s.length + ':' + a.toString(16) + ':' + b.toString(16);
}

// The literal the store writes (KTWire.quote): JSON.stringify's escapes, plus every surrogate half and U+2028/9.
function storeQuote(s) {
  var o = '"', i, c;
  for (i = 0; i < s.length; i++) {
    c = s.charCodeAt(i);
    if (c === 0x22) o += '\\"';
    else if (c === 0x5c) o += '\\\\';
    else if (c === 0x08) o += '\\b';
    else if (c === 0x0c) o += '\\f';
    else if (c === 0x0a) o += '\\n';
    else if (c === 0x0d) o += '\\r';
    else if (c === 0x09) o += '\\t';
    else if (c < 0x20 || (c >= 0xd800 && c <= 0xdfff) || c === 0x2028 || c === 0x2029) o += '\\u' + ('000' + c.toString(16)).slice(-4);
    else o += s[i];
  }
  return o + '"';
}

function check(cond, what) { if (!cond) { console.error('ktstore-vectors: ' + what); process.exit(2); } }

const EMOJI = '\u{d83d}\u{dcaa}';   // a flexed biceps: one surrogate pair
const HIGH = '\u{d83d}', LOW = '\u{dc4d}';   // halves of two different emoji, alone

// -- values ---------------------------------------------------------------------------------------------
const VALUES = [
  ['empty', ''],
  ['plain', 'plain'],
  ['json', '{"a":1,"b":[1,2,3]}'],
  ['quotes', 'quote " backslash \\ slash /'],
  ['controls', 'nl\nret\rtab\tbs\bff\f'],
  ['emoji pair', 'emoji ' + EMOJI + ' pair'],
  ['lone high', 'lone high ' + HIGH + ' end'],
  ['lone low', 'lone low ' + LOW + ' end'],
  ['lone high at end', 'cut ' + HIGH],
  ['lone low at start', LOW + ' first'],
  ['reversed pair', LOW + HIGH],
  ['u2028 u2029', 'u2028 \u{2028} u2029 \u{2029}'],
  ['nul and ctl', '\u{0}nul\u{1}ctl\u{1f}'],
  ['latin cjk', '\u{e9} \u{fc} \u{f1} \u{4e2d}\u{6587} e\u{301}'],
  ['five quotes', '"'.repeat(5)],
  ['del and c1', '\u{7f}\u{80}\u{9f}'],
  ['bmp edges', '\u{7ff}\u{800}\u{d7ff}\u{e000}\u{ffff}'],
  ['session', JSON.stringify([{ id: 1760140000000, date: '2026-10-10', exercises: [{ name: 'Bench', sets: [{ w: 135, r: 5 }] }], wSet: { Bench: [null, 135] } }])],
  ['chat with half emoji', JSON.stringify([{ role: 'user', content: 'Message ' + EMOJI + ' half ' + HIGH }])],
  ['timestamp', '1760140000000']
];
const values = VALUES.map(function (p) {
  const v = p[1], lit = JSON.stringify(v), store = storeQuote(v);
  check(JSON.parse(lit) === v, 'JSON.stringify round trip ' + p[0]);
  check(JSON.parse(store) === v, 'store literal round trip ' + p[0]);
  check(lit.indexOf('\n') < 0 && store.indexOf('\n') < 0, 'raw newline in a literal ' + p[0]);
  return { name: p[0], lit: lit, h: H(v), len: v.length, store: store };
});

// -- formulas (Swift rebuilds the same strings by name) -------------------------------------------------
function big200k() { let s = ''; for (let i = 0; i < 200000; i++) s += String.fromCharCode(32 + (i * 7919) % 60000); return s; }
function allUnits() { let s = ''; for (let i = 0; i < 65536; i++) s += String.fromCharCode(i); return s; }
const formulas = [['big200k', big200k()], ['allUnits', allUnits()]].map(function (p) {
  const lit = JSON.stringify(p[1]);
  check(JSON.parse(lit) === p[1], 'formula round trip ' + p[0]);
  return { name: p[0], len: p[1].length, h: H(p[1]), litH: H(lit), storeH: H(storeQuote(p[1])) };
});

// -- hello payload, as the facade builds it -------------------------------------------------------------
const LONE_KEY = 'kt_lone ' + HIGH;
const WK = {
  kt_last_open: '1760140000000',
  kt_sessions: JSON.stringify([{ id: 2, date: '2026-10-10' }, { id: 1, date: '2026-10-09' }]),
  kt_theme: 'heavyweight',
  'kt_odd "key"\n\\': 'odd',
  ['kt_emoji ' + EMOJI]: 'pair',
  [LONE_KEY]: 'cannot be a store key',
  kt_apikey: 'sk-ant-not-a-key',
  kt_empty: ''
};
const GAP = JSON.stringify({ v: 1, at: 1760140000123, k: { kt_sessions: H(WK.kt_sessions), kt_theme: '-' }, s: { kt_sessions: '3:7', kt_theme: '3:9' } });
WK.kt__store_gap = GAP;
const helloLines = [JSON.stringify(GAP)];
Object.keys(WK).forEach(function (k) { helloLines.push(JSON.stringify(k), JSON.stringify(H(WK[k]))); });
const hello = {
  payload: helloLines.join('\n'),
  manifest: Object.keys(WK).filter(function (k) { return k !== LONE_KEY; }).map(function (k) { return [JSON.stringify(k), H(WK[k])]; }),
  skipped: 1,
  gap: [[JSON.stringify('kt_sessions'), H(WK.kt_sessions)], [JSON.stringify('kt_theme'), '-']],
  gapStamps: [[JSON.stringify('kt_sessions'), '3:7'], [JSON.stringify('kt_theme'), '3:9']],
  gapAt: 1760140000123
};
check(hello.payload.indexOf('\r') < 0, 'raw CR in hello');

// -- gap notes ------------------------------------------------------------------------------------------
// stamps: what the store reads from s (a stamp that is not "B:S" with B >= 1, or names a key k lacks, is ignored);
// clear: what it reads from c (only with all). Notes without them are read the old way (KTProtocol.GapNote).
const gapNotes = [
  { note: JSON.stringify({ v: 1, at: 5, k: {} }), valid: true, all: false, keys: [], stamps: [], clear: null },
  { note: JSON.stringify({ v: 1, at: 5, k: { kt_last_open: H('1760140000999') } }), valid: true, all: false, keys: [[JSON.stringify('kt_last_open'), H('1760140000999')]], stamps: [], clear: null },
  { note: JSON.stringify({ v: 1, at: 7, k: { 'quote"key': '3:a:b', '\u{e9}': '-' }, extra: [1, { x: '}' }] }), valid: true, all: false, keys: [[JSON.stringify('quote"key'), '3:a:b'], [JSON.stringify('\u{e9}'), '-']], stamps: [], clear: null },
  { note: JSON.stringify({ v: 1, at: 9, k: { kt_a: '1:x:y' }, all: true }), valid: true, all: true, keys: [[JSON.stringify('kt_a'), '1:x:y']], stamps: [], clear: null },
  { note: JSON.stringify({ v: 1, k: { ['lone ' + LOW]: '1:x:y', kt_b: '-' } }), valid: true, all: false, keys: [[JSON.stringify('kt_b'), '-']], stamps: [], clear: null },
  { note: JSON.stringify({ v: 1, at: 11, k: { kt_a: '1:x:y', '\u{e9}': '-' }, s: { kt_a: '4:2', '\u{e9}': '4:3' } }), valid: true, all: false, keys: [[JSON.stringify('kt_a'), '1:x:y'], [JSON.stringify('\u{e9}'), '-']], stamps: [[JSON.stringify('kt_a'), '4:2'], [JSON.stringify('\u{e9}'), '4:3']], clear: null },
  { note: JSON.stringify({ v: 1, at: 12, k: { kt_a: '1:x:y', kt_b: '-' }, s: { kt_a: '4:x', kt_b: '0:3', kt_z: '4:5' } }), valid: true, all: false, keys: [[JSON.stringify('kt_a'), '1:x:y'], [JSON.stringify('kt_b'), '-']], stamps: [], clear: null },
  { note: JSON.stringify({ v: 1, at: 13, k: {}, all: true, c: '4:7' }), valid: true, all: true, keys: [], stamps: [], clear: '4:7' },
  { note: JSON.stringify({ v: 1, at: 14, k: { kt_a: '1:x:y' }, all: true, c: '4:7', s: { kt_a: '4:8' } }), valid: true, all: true, keys: [[JSON.stringify('kt_a'), '1:x:y']], stamps: [[JSON.stringify('kt_a'), '4:8']], clear: '4:7' },
  { note: JSON.stringify({ v: 1, at: 15, k: {}, c: '4:7' }), valid: true, all: false, keys: [], stamps: [], clear: null },
  { note: JSON.stringify({ v: 1, at: 16, k: {}, all: true, c: 'soon' }), valid: true, all: true, keys: [], stamps: [], clear: null },
  { note: JSON.stringify({ v: 2, k: {} }), valid: false },
  { note: '{"v":1,"k":', valid: false },
  { note: 'not json', valid: false }
];

// -- the gap note op by op, as the facade must write it -------------------------------------------------
// A mirror not answered ok: a set or remove adds its key's hash after the op (k) and the op's stamp (s); a clear
// empties WebKit, the note with it, so a fresh note says so with the clear's stamp (all, c). Later misses merge
// into it. An op answered ok leaves the note alone. Boot 7, seq counting the document's ops from 1.
function noteAfter(prev, op, boot, seq, at) {
  const stamp = boot + ':' + seq;
  if (op[0] === 'c') return JSON.stringify({ v: 1, at: at, k: {}, all: true, c: stamp });
  const n = prev == null ? { v: 1, at: at, k: {} } : JSON.parse(prev);
  n.at = at;
  n.k[op[1]] = op[0] === 'd' ? '-' : H(op[2]);
  (n.s || (n.s = {}))[op[1]] = stamp;
  return JSON.stringify(n);
}
const NOTE_OPS = [
  ['w', 'kt_sessions', JSON.stringify([{ id: 2, date: '2026-10-10' }])],
  ['d', 'kt_theme'],
  ['w', 'kt_sessions', JSON.stringify([{ id: 3, date: '2026-10-10' }, { id: 2, date: '2026-10-10' }])],
  ['c'],
  ['w', 'kt_last_open', '1760140000999'],
  ['w', 'kt_emoji ' + EMOJI, 'pair'],
  ['d', 'kt_last_open']
];
let noteText = null;
const noteSteps = NOTE_OPS.map(function (op, i) {
  noteText = noteAfter(noteText, op, 7, i + 1, 1760140001000 + i);
  const n = JSON.parse(noteText);
  check((!n.all || typeof n.c === 'string') && Object.keys(n.k).every(function (k) { return n.s && n.s[k]; }), 'a note step without its stamps');
  return {
    op: op[0] + (op[1] ? ' ' + JSON.stringify(op[1]) : ''),
    note: noteText,
    all: !!n.all,
    keys: Object.keys(n.k).map(function (k) { return [JSON.stringify(k), n.k[k]]; }),
    stamps: Object.keys(n.s || {}).map(function (k) { return [JSON.stringify(k), n.s[k]]; }),
    clear: n.all ? n.c : null
  };
});

// -- merges (Put back of a log key) ---------------------------------------------------------------------
// index.html lsSet's comparator, verbatim: newest date first, then the larger id.
function lsCmp(a, b) {
  var ad = String((a && a.date) || ''), bd = String((b && b.date) || '');
  if (ad !== bd) return ad < bd ? 1 : -1;
  return ((b && b.id) || 0) - ((a && a.id) || 0);
}
function idTok(r) { return (r && typeof r === 'object' && !Array.isArray(r) && 'id' in r && r.id !== null) ? JSON.stringify(r.id) : null; }
function merge(baseText, extraText) {
  const base = baseText == null ? [] : JSON.parse(baseText), extra = JSON.parse(extraText);
  const ids = new Set(), texts = new Set();
  base.forEach(function (r) { const t = idTok(r); if (t !== null) ids.add(t); else texts.add(JSON.stringify(r)); });
  const added = [];
  extra.forEach(function (r) { const t = idTok(r); if (t !== null) { if (!ids.has(t)) added.push(r); } else if (!texts.has(JSON.stringify(r))) added.push(r); });
  const all = base.concat(added);
  all.sort(lsCmp);  // stable (ES2019)
  return { text: JSON.stringify(all), added: added.length };
}
const S = function (id, date, extra) { const r = { id: id, date: date }; if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; }); return r; };
const MERGE_CASES = [
  ['into absent', null, [S(2, '2026-10-02'), S(1, '2026-10-01')]],
  ['adds the missing record in order', [S(3, '2026-10-03'), S(1, '2026-10-01')], [S(2, '2026-10-02'), S(1, '2026-10-01')]],
  ['same id keeps the current version', [S(1, '2026-10-01', { note: 'edited' })], [S(1, '2026-10-01', { note: 'old' })]],
  ['same date orders by id', [S(10, '2026-10-05')], [S(30, '2026-10-05'), S(20, '2026-10-05')]],
  ['id-less measurements by content', [{ date: '2026-10-01', waist: 80 }], [{ date: '2026-10-01', waist: 80 }, { date: '2026-09-01', waist: 82 }]],
  ['string and numeric ids are different records', [S('5', '2026-10-01')], [S(5, '2026-10-01')]],
  ['missing dates sort last', [S(1, '2026-10-01')], [{ id: 2 }, S(3, '')]],
  ['lone surrogates and brackets in strings', [S(1, '2026-10-01', { n: 'cut ' + HIGH, s: '[{"]}' })], [S(2, '2026-10-02', { n: LOW + '}', a: [[1], { b: ']' }] })]],
  ['duplicate ids in the current value are kept', [S(1, '2026-10-01'), S(1, '2026-10-01', { x: 1 })], [S(2, '2026-10-03')]],
  ['nothing to add', [S(2, '2026-10-02'), S(1, '2026-10-01')], [S(1, '2026-10-01')]],
  ['working-weight stamps survive', [S(1, '2026-10-01', { wSet: { Bench: [null, 135] }, wk0: 3 })], [S(2, '2026-10-04', { hkOrig: { date: '2026-10-04', km: 5, time: '25:00' } })]],
  ['empty current', [], [S(1, '2026-10-01')]]
];
const merges = MERGE_CASES.map(function (c) {
  const base = c[1] == null ? null : JSON.stringify(c[1]), extra = JSON.stringify(c[2]), m = merge(base, extra);
  return { name: c[0], base: base, extra: extra, expected: m.text, added: m.added };
});

const doc = { generatedBy: 'tests/tools/ktstore-vectors.js', values: values, formulas: formulas, hello: hello, gapNotes: gapNotes, noteSteps: noteSteps, merges: merges };
const text = JSON.stringify(doc, null, 1) + '\n';
// The Swift side reads this file with JSONSerialization, which rejects a lone-surrogate escape: every value that
// holds one travels inside a literal, never raw. (JSON.stringify writes a valid pair as is, so any \u{5c}udXXX
// escape left once escaped backslashes are gone is lone.)
check(!/\\ud[89a-f][0-9a-f]{2}/i.test(text.replace(/\\\\/g, '')), 'a raw lone surrogate reached the vectors file');

if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== text) { console.error('vectors.json is stale: run node tests/tools/ktstore-vectors.js'); process.exit(1); }
  console.log('vectors.json is current');
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, text);
  console.log('wrote ' + path.relative(process.cwd(), OUT) + ' (' + text.length + ' bytes)');
}
