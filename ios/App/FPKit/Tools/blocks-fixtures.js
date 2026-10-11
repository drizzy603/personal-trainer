#!/usr/bin/env node
// blocks-fixtures.js: golden message-body fixtures for FPCore, made by the page's own chat parser.
//
//   git show chatui/ui:index.html > /tmp/page.html      (or the merged index.html once chatui lands)
//   node ios/App/FPKit/Tools/blocks-fixtures.js /tmp/page.html 'chatui/ui 02d710e' \
//        > ios/App/FPKit/Tests/FPCoreTests/Fixtures/blocks/page-grammar.json
//
// It loads md(), _mdInline(), _coachBlocksHTML(), _cmbTakeHTML(), _esc() and _wellFormed() from the
// page, runs them on the texts below, and writes for each text:
//   - body: the block model of contract v1 (what the page's _mdModel/_cmbModel will hand Swift, plan
//     task C2). Built here by a port of md()'s and _coachBlocksHTML()'s loops whose inline runs come
//     from the page's own _mdInline(), so the runs are exactly what the page styles.
//   - signature: the structure the PAGE renders, read off the page's HTML (not off the model).
// The run fails unless the model, drawn back to HTML, reads the same as the page's HTML (same
// signature), so every fixture is a model the page's grammar really produces. FPCoreTests decodes
// each body, checks that encoding it again gives the same JSON, and that Swift's signature of the
// decoded body equals the page's.
//
// Inline styles are read the way a browser draws them: <strong>, <em> and <code> toggle bold, italic
// and code, so the one misnesting _mdInline can produce (**a `b** c`) reads as the browser shows it.
'use strict';
const fs = require('fs');
const vm = require('vm');

const pagePath = process.argv[2];
if (!pagePath) { console.error('usage: node blocks-fixtures.js <page index.html> [what the page is]'); process.exit(2); }
const pageLabel = process.argv[3] || 'the page passed in';
const html = fs.readFileSync(pagePath, 'utf8');
const scripts = []; const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi; let m;
while ((m = re.exec(html)) !== null) scripts.push(m[1]);
const src = scripts.join('\n');
function grab(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('page has no function ' + name);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('unbalanced ' + name);
}
const page = {};
vm.createContext(page);
vm.runInContext(['_chars', '_wellFormed', '_esc', '_mdInline', 'md', '_hasCoachBlocks', '_coachBlocksHTML', '_cmbTakeHTML']
  .map(grab).join('\n'), page);

// ── HTML tokens, read with the browser's toggle semantics for the three inline styles ──────────
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decode = s => s.replace(/&(amp|lt|gt|quot|#39);/g, e => ENT[e]);
function tokens(h) {
  const out = []; const tr = /<[^>]+>|[^<]+/g; let t;
  while ((t = tr.exec(h)) !== null) {
    const s = t[0];
    if (s[0] !== '<') { out.push({ text: decode(s) }); continue; }
    const tm = /^<(\/?)([a-z0-9]+)([^>]*)>$/i.exec(s);
    const attrs = {}; const ar = /([a-z-]+)="([^"]*)"/gi; let a;
    while ((a = ar.exec(tm[3])) !== null) attrs[a[1]] = decode(a[2]);
    out.push({ tag: tm[2].toLowerCase(), close: tm[1] === '/', cls: attrs.class || '', attrs });
  }
  return out;
}
const STYLE = { strong: 'b', em: 'i', code: 'c' };
// Runs of styled text, merged: [{t, s}] with s a subset of 'bic' in that order.
function runsOf(toks) {
  const depth = { b: 0, i: 0, c: 0 }; const runs = [];
  for (const k of toks) {
    if (k.tag && STYLE[k.tag]) { depth[STYLE[k.tag]] += k.close ? -1 : 1; continue; }
    let text = null;
    if (k.tag === 'br') text = '\n'; else if (k.text !== undefined) text = k.text;
    if (text === null || text === '') continue;
    const s = (depth.b > 0 ? 'b' : '') + (depth.i > 0 ? 'i' : '') + (depth.c > 0 ? 'c' : '');
    const last = runs[runs.length - 1];
    if (last && last.s === s) last.t += text; else runs.push({ t: text, s });
  }
  return runs;
}
// Contract form of a run: a bare string when plain, else {t, s}.
const runJSON = r => r.s ? { t: r.t, s: r.s } : r.t;
const inlineRuns = h => runsOf(tokens(h)).map(runJSON);
// Signature form: plain text, styled text as {s:text}.
const sigRuns = runs => runs.map(r => (typeof r === 'string' ? r : '{' + r.s + ':' + r.t + '}')).join('');

// ── the model, by a port of md() (chatui) whose inline runs come from the page's _mdInline ───────
function mdModel(text) {
  const srcText = String(text || '').replace(/\r/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = srcText.split('\n'); const out = []; let para = []; let list = null; let tbl = null; let mm;
  const BUL = /^(\s*)[-*+•]\s+(.*)$/, NUM = /^(\s*)(\d{1,3})[.)]\s+(.*)$/;
  const inl = s => inlineRuns(page._mdInline(s));
  function flushPara() {
    if (!para.length) return;
    const runs = []; para.forEach((line, i) => { if (i) runs.push('\n'); runs.push(...inl(line)); });
    out.push({ k: 'p', r: mergeRuns(runs) }); para = [];
  }
  function closeList() { list = null; }
  function flushTbl() {
    if (!tbl) return;
    const rows = tbl.filter(r => !/^\|?\s*:?-{2,}/.test(r))
      .map(r => r.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map(c => inl(c.trim())));
    out.push({ k: 'table', rows }); tbl = null;
  }
  function nextNonBlank(j) { for (; j < lines.length; j++) if (lines[j].trim()) return lines[j]; return ''; }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]; let t = line.trim();
    if (tbl && t.charAt(0) !== '|') flushTbl();
    if (!t) {
      flushPara();
      if (list) { const nx = nextNonBlank(i + 1); if (!((list.k === 'ul' && BUL.test(nx)) || (list.k === 'ol' && NUM.test(nx)))) closeList(); }
      continue;
    }
    if (t.charAt(0) === '|') { flushPara(); closeList(); (tbl = tbl || []).push(t); continue; }
    if ((mm = /^#{1,6}\s+(.*)$/.exec(t))) { flushPara(); closeList(); out.push({ k: 'h', r: inl(mm[1]) }); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushPara(); closeList(); out.push({ k: 'hr' }); continue; }
    if ((mm = BUL.exec(line))) {
      flushPara(); if (!list || list.k !== 'ul') { list = { k: 'ul', items: [] }; out.push(list); }
      const item = { r: inl(mm[2]) }; if (mm[1].length >= 2) item.sub = true; list.items.push(item); continue;
    }
    if ((mm = NUM.exec(line))) {
      flushPara(); if (!list || list.k !== 'ol') { list = { k: 'ol', start: parseInt(mm[2], 10), items: [] }; out.push(list); }
      list.items.push({ r: inl(mm[3]) }); continue;
    }
    if ((mm = /^&gt;\s?(.*)$/.exec(t))) t = mm[1];
    closeList(); para.push(t);
  }
  flushTbl(); flushPara(); closeList();
  return out;
}
function mergeRuns(runs) {
  const out = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (typeof r === 'string' && typeof last === 'string') out[out.length - 1] = last + r; else out.push(r);
  }
  return out;
}
// A port of _coachBlocksHTML (chatui): sections of markdown, metric cards and the takeaway; two actions.
function cmbModel(text) {
  const lines = String(text || '').split('\n');
  let typeTag = ''; let buf = []; const sections = []; let metricBuf = []; const actions = []; let takeaways = 0;
  function flushParas() { const s = buf.join('\n').trim(); buf = []; if (s) sections.push({ k: 'md', blocks: mdModel(s) }); }
  function flushMetrics() {
    if (!metricBuf.length) return;
    sections.push({ k: 'metrics', rows: metricBuf.map(x => ({ label: x.label.toUpperCase(), value: x.value, ref: x.ref, delta: x.delta,
      tone: x.tone === 'good' ? 'good' : x.tone === 'warn' ? 'warn' : 'plain' })) });
    metricBuf = [];
  }
  lines.forEach(line => {
    const mm = line.match(/^\s*%%(type|metric|takeaway|action):\s*(.*)$/);
    if (!mm) { if (line.trim()) flushMetrics(); buf.push(line); return; }
    const kind = mm[1], body = mm[2];
    if (kind === 'type') { typeTag = body.trim(); return; }
    if (kind === 'metric') {
      flushParas();
      const p = body.split('|').map(x => x.trim());
      if (p[0]) metricBuf.push({ label: p[0], value: p[1] || '', ref: p[2] || '', delta: p[3] || '', tone: (p[4] || '').toLowerCase() });
      return;
    }
    flushParas(); flushMetrics();
    if (kind === 'takeaway') { if (takeaways < 1) { takeaways++; sections.push({ k: 'take', r: inlineRuns(page._mdInline(page._esc(body.trim()))) }); } return; }
    if (kind === 'action' && actions.length < 2) {
      const ap = body.split('|').map(x => x.trim());
      if (ap[0]) actions.push({ label: ap[0], msg: ap[1] || ap[0], primary: actions.length === 0 });
    }
  });
  flushParas(); flushMetrics();
  return { eyebrow: 'COACH' + (typeTag ? ' · ' + typeTag : ''), body: { k: 'cmb', sections, actions } };
}

// ── the model drawn back to HTML (in the page's classes) ─────────────────────────────────────────
function runsHTML(runs) {
  return runs.map(r => {
    const t = typeof r === 'string' ? r : r.t, s = typeof r === 'string' ? '' : r.s;
    const body = page._esc(t).replace(/\n/g, '<br>');
    let o = '', c = '';
    if (s.includes('b')) { o += '<strong>'; c = '</strong>' + c; }
    if (s.includes('i')) { o += '<em>'; c = '</em>' + c; }
    if (s.includes('c')) { o += '<code class="kt-md-code">'; c = '</code>' + c; }
    return o + body + c;
  }).join('');
}
function mdHTML(blocks) {
  return blocks.map(b => {
    if (b.k === 'p') return '<p>' + runsHTML(b.r) + '</p>';
    if (b.k === 'h') return '<div class="kt-md-h">' + runsHTML(b.r) + '</div>';
    if (b.k === 'hr') return '<hr class="kt-md-hr">';
    if (b.k === 'ul') return '<ul>' + b.items.map(it => '<li' + (it.sub ? ' class="sub"' : '') + '>' + runsHTML(it.r) + '</li>').join('') + '</ul>';
    if (b.k === 'ol') return '<ol start="' + b.start + '">' + b.items.map(it => '<li>' + runsHTML(it.r) + '</li>').join('') + '</ol>';
    if (b.k === 'table') return '<div class="kt-md-tablewrap"><table class="kt-md-table">' + b.rows.map((row, ri) =>
      '<tr>' + row.map(c => { const tag = ri === 0 ? 'th' : 'td'; return '<' + tag + '>' + runsHTML(c) + '</' + tag + '>'; }).join('') + '</tr>').join('') + '</table></div>';
    throw new Error('unknown block ' + b.k);
  }).join('');
}
function modelHTML(eyebrow, body) {
  let h = '<div class="kt-cmb-eyebrow">' + page._esc(eyebrow) + '</div>';
  if (body.k === 'md') return h + '<div class="kt-cmb-para">' + mdHTML(body.blocks) + '</div>';
  for (const s of body.sections) {
    if (s.k === 'md') h += '<div class="kt-cmb-para">' + mdHTML(s.blocks) + '</div>';
    else if (s.k === 'take') h += '<div class="kt-cmb-take"><div class="kt-cmb-take-eyebrow">TAKEAWAY</div><div class="kt-cmb-take-body">' + runsHTML(s.r) + '</div></div>';
    else if (s.k === 'metrics') h += '<div class="kt-cmb-metrics">' + s.rows.map(x => {
      const tc = x.tone === 'good' ? 'kt-cmb-delta-good' : x.tone === 'warn' ? 'kt-cmb-delta-warn' : 'kt-cmb-mref';
      return '<div class="kt-cmb-mrow"><span class="kt-cmb-mlabel">' + page._esc(x.label) + '</span><span class="kt-cmb-mval"><span class="kt-cmb-mv">' + page._esc(x.value) + '</span>' +
        (x.ref ? ' <span class="kt-cmb-mref">' + page._esc(x.ref) + '</span>' : '') + (x.delta ? ' <span class="' + tc + '">· ' + page._esc(x.delta) + '</span>' : '') + '</span></div>';
    }).join('') + '</div>';
    else throw new Error('unknown section ' + s.k);
  }
  if (body.actions.length) h += '<div class="kt-cmb-actions">' + body.actions.map((a, i) =>
    '<button class="kt-cmb-chip' + (a.primary ? ' primary' : '') + '" data-msg="' + page._esc(a.msg) + '">' + page._esc(a.label) + (a.primary ? ' →' : '') + '</button>').join('') + '</div>';
  return h;
}

// ── a signature of what an HTML string shows: blocks, styled runs, metric rows, chips ────────────
function signature(h) {
  const toks = tokens(h); const sig = []; let i = 0;
  const has = (k, c) => k.cls.split(/\s+/).includes(c);
  // the tokens up to the matching close of the element opened at toks[i]
  function inner() {
    const open = toks[i]; let d = 0; const start = i + 1;
    for (let j = i; j < toks.length; j++) {
      const k = toks[j];
      if (k.tag === open.tag && !k.close) d++;
      else if (k.tag === open.tag && k.close) { d--; if (d === 0) { i = j; return toks.slice(start, j); } }
    }
    throw new Error('unclosed ' + open.tag);
  }
  const text = ts => sigRuns(runsOf(ts).map(runJSON));
  for (; i < toks.length; i++) {
    const k = toks[i];
    if (k.text !== undefined) { if (k.text.trim()) throw new Error('loose text: ' + k.text); continue; }
    if (k.close) continue;
    if (k.tag === 'div' && has(k, 'kt-cmb-eyebrow')) sig.push('eyebrow:' + text(inner()));
    else if (k.tag === 'div' && has(k, 'kt-cmb-para')) sig.push('md');
    else if (k.tag === 'p') sig.push('p:' + text(inner()));
    else if (k.tag === 'div' && has(k, 'kt-md-h')) sig.push('h:' + text(inner()));
    else if (k.tag === 'hr') sig.push('hr');
    else if (k.tag === 'ul') sig.push('ul');
    else if (k.tag === 'ol') sig.push('ol:' + k.attrs.start);
    else if (k.tag === 'li') sig.push((has(k, 'sub') ? 'li.sub:' : 'li:') + text(inner()));
    else if (k.tag === 'div' && has(k, 'kt-md-tablewrap')) sig.push('table');
    else if (k.tag === 'tr') {
      const cells = []; let head = false; const row = inner(); let j = 0;
      while (j < row.length) {
        const c = row[j];
        if ((c.tag === 'th' || c.tag === 'td') && !c.close) {
          head = c.tag === 'th'; let d = 0; let e = j;
          for (; e < row.length; e++) { if (row[e].tag === c.tag) { d += row[e].close ? -1 : 1; if (d === 0) break; } }
          cells.push(text(row.slice(j + 1, e))); j = e + 1;
        } else j++;
      }
      sig.push((head ? 'th:' : 'tr:') + cells.join(' | '));
    }
    else if (k.tag === 'div' && has(k, 'kt-cmb-metrics')) sig.push('metrics');
    else if (k.tag === 'div' && has(k, 'kt-cmb-mrow')) {
      const row = inner(); const get = cls => { const at = row.findIndex(x => x.tag && !x.close && has(x, cls)); if (at < 0) return null;
        let d = 0, e = at; for (; e < row.length; e++) { if (row[e].tag === row[at].tag) { d += row[e].close ? -1 : 1; if (d === 0) break; } } return text(row.slice(at + 1, e)); };
      const lab = get('kt-cmb-mlabel'), val = get('kt-cmb-mv');
      const good = get('kt-cmb-delta-good'), warn = get('kt-cmb-delta-warn');
      // the ref span and, with no tone, the delta span share the class kt-cmb-mref: the ref comes first
      const refs = []; row.forEach((x, at) => { if (x.tag === 'span' && !x.close && has(x, 'kt-cmb-mref')) refs.push(text([row[at + 1]].filter(y => y && y.text !== undefined))); });
      let ref = '', delta = '', tone = '-';
      if (good !== null) { delta = good; tone = 'good'; ref = refs[0] || ''; }
      else if (warn !== null) { delta = warn; tone = 'warn'; ref = refs[0] || ''; }
      else { const dl = refs.findIndex(r => r.startsWith('· ')); if (dl >= 0) { delta = refs[dl]; tone = 'plain'; refs.splice(dl, 1); } ref = refs[0] || ''; }
      sig.push('m:' + lab + '=' + val + '|' + ref + '|' + delta.replace(/^· /, '') + '#' + tone);
    }
    else if (k.tag === 'div' && has(k, 'kt-cmb-take-eyebrow')) inner();   // the fixed TAKEAWAY label
    else if (k.tag === 'div' && has(k, 'kt-cmb-take-body')) sig.push('take:' + text(inner()));
    else if (k.tag === 'button' && has(k, 'kt-cmb-chip')) {
      const primary = has(k, 'primary'); let label = text(inner());
      if (primary) label = label.replace(/ →$/, '');
      sig.push((primary ? 'chip*:' : 'chip:') + label + '>' + k.attrs['data-msg']);
    }
  }
  return sig;
}
function pageHTML(text) {
  if (page._hasCoachBlocks(text)) return page._coachBlocksHTML(text, false);
  return '<div class="kt-cmb-eyebrow">COACH</div><div class="kt-cmb-para">' + page.md(text) + '</div>';
}
function modelOf(text) {
  if (page._hasCoachBlocks(text)) return cmbModel(text);
  return { eyebrow: 'COACH', body: { k: 'md', blocks: mdModel(text) } };
}

// ── the texts: the earlier %% fixtures, then each part of the grammar on chatui ─────────────────
const CASES = [
  ['run-analysis', '%%type: Run analysis\nGood session. Faster than planned, but your heart rate says it stayed easy.\n%%metric: PACE | 8:07 | vs 8:15 goal | -8s | good\n%%metric: AVG HR | 168 | vs cap 165 | +3 | warn\n%%metric: DISTANCE | 5.01 km | | on plan | plain\n%%takeaway: Aerobic base is improving - same pace, 6 bpm lower.\n%%takeaway: Second takeaway should be dropped.\n%%action: Set goal pace 8:05 | Set my run goal pace to 8:05/km\n%%action: Tempo on Thursday | Schedule a tempo run on Thursday\n%%action: Third action should be dropped | nope'],
  ['programme-adjustment', 'On it.\n\n%%type: Programme adjustment\n%%metric: BENCH | 200 lb | was 160 | +10 | good\n%%takeaway: Heavier from this week.\n%%action: Undo that | Put my bench back'],
  ['metric-runs', '%%metric: A | 1\nline between\n%%metric: B | 2 | ref\n\n\npara one\npara two same block\n\npara three\n%%action: Only label'],
  ['markdown-and-markers', 'Intro **bold** and *em* and `code`\n- bullet one\n- bullet two\n%%type:    Spaced type   \n%%takeaway: <script>x</script> & "q"\n  %%metric: indented marker | still a marker'],
  ['lists', 'Three things this week:\n- **Bench**: hold 160 lb and own the last rep\n- **Squat**: depth first, then load\n  - sub item under squat\n\n- still the same list after a blank line\n* star bullet\n+ plus bullet\n• dot bullet\n\nThen the order:\n3) warm up\n4) work sets\n\n1. a new list after a paragraph\n2. second'],
  ['headings-rules', '# Week 6 review\nTwo lines in one paragraph\nare joined by a line break.\n\n### What changed\n---\n> A quoted line reads as plain text\n***\n___\nLast line.'],
  ['table', 'Your top sets:\n| Lift | Top set | Change |\n|---|:---:|---|\n| **Bench** | 170 lb x 5 | +10 |\n| Squat | `225` x 3 | *held* |\n| Deadlift | 275 x 2\nAfter the table.'],
  ['inline-edges', '3*5*2 is not italic, *this is* and **this is**.\n**bold *em* bold** keeps its stars\n*em with **bold** inside*\n`code with **bold** inside`\n**a `b** c` misnests\nA [link](https://example.com/x) is its text; [not this](ftp://x) one.\n<b>not html</b> & "quotes" and \'apostrophes\''],
  ['cmb-with-markdown', '%%type: Week review\nThis week in short:\n- 4 sessions, **all** done\n- 2 runs\n\n%%metric: VOLUME | 12,400 lb | vs 11,900 | +4% | good\n\n%%metric: RUNS | 2 | of 3 | -1 | warn\n%%metric: SLEEP | 7.1 h | | flat | Plain\nKeep it going.\n%%takeaway: **Volume** is up; keep `deload` in week 8.\n%%action: Plan week 7 | Plan my week 7\n%%action:  | empty label is skipped\n%%action: Ask about sleep'],
  ['plain-prose', 'Good question.\n\nYour bench has moved from 150 to 170 lb in six weeks: that is steady progress.\n\nKeep the runs easy.'],
  ['unicode', 'Great work 💪 on the 5×5.\n日本語のテキスト and עברית side by side.\nCombining: é and a flag 🇬🇧.\n- half an emoji at the end \ud83d\n%%type: Ünïcödé\n%%metric: Ström | 5 km | | ✓ | good'],
  ['blank-markers', '%%type:\n%%metric:  | no label is skipped\n%%metric: ONLY LABEL\n%%takeaway:\nText after an empty takeaway.\n%%action:'],
];

const cases = CASES.map(([name, text]) => {
  const want = signature(pageHTML(text));
  const model = modelOf(text);
  const got = signature(modelHTML(model.eyebrow, model.body));
  if (JSON.stringify(want) !== JSON.stringify(got)) {
    console.error('model differs from the page for ' + name + '\npage:  ' + JSON.stringify(want, null, 1) + '\nmodel: ' + JSON.stringify(got, null, 1));
    process.exit(1);
  }
  return { name, text, eyebrow: model.eyebrow, body: model.body, signature: want };
});
const out = {
  source: 'md(), _mdInline(), _coachBlocksHTML(), _cmbTakeHTML(), _esc() of ' + pageLabel,
  generator: 'ios/App/FPKit/Tools/blocks-fixtures.js',
  cases,
};
// The page hands Swift JSON through _nativeJSON, which drops half an emoji: so does this file.
process.stdout.write(JSON.stringify(out, (k, v) => (typeof v === 'string' ? page._wellFormed(v) : v), 1) + '\n');
