#!/usr/bin/env node
// web-shots.js: the web chat drawn for every coach fixture, for the native chat's contact sheets
// (plan task C6). Each fixture (Tests/FPCoreTests/Fixtures/coach) becomes the page's own chat state
// on the demo seed: its messages as kt_coach_msgs entries (a reply's text from the page-grammar case
// whose blocks it carries, else written back from its blocks), its pills and PLAN CHANGES as tool
// calls whose labels and rows are the fixture's, its header strings, a reply in flight, the
// programme setup, the empty chat, the pending photo and the draft. The page then draws it with its
// own renderCoach(), in Heavyweight and Lime, at the root zoom its Dynamic Type would use (1, 1.12,
// 1.25), on a 390 x 844 screen with a 47 pt status bar, at 2x, on a clock where the fixtures' days
// read as they say (2026-10-09, UTC).
//
//   node ios/App/FPKit/Tools/chat-contact/web-shots.js <out dir> [fixture,fixture...]
//
// Writes <out>/web/<fixture>/<room>-z<zoom>.png (the screen) and <room>-full-z<zoom>.png (the whole
// conversation), for every fixture and every variant below (VARIANTS). Needs Playwright
// (tests/node_modules) and tests/lib/harness.js.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const { boot } = require(path.join(ROOT, 'tests', 'lib', 'harness.js'));
const FIX = path.join(ROOT, 'ios', 'App', 'FPKit', 'Tests', 'FPCoreTests', 'Fixtures');
const [outDir, onlyArg] = process.argv.slice(2);
if (!outDir) { console.error('usage: node web-shots.js <out dir> [fixture,...]'); process.exit(2); }
const only = onlyArg ? new Set(onlyArg.split(',')) : null;

const ROOMS = [['heavyweight', 'heavyweight'], ['lime', 'dark']];
const ZOOMS = [[1, 'z1'], [1.12, 'z112'], [1.25, 'z125']];
const SAFE_TOP = 47;

// States no fixture holds, drawn as fixtures of their own (FPUITests' CoachRenderTests.variants
// draws the same natively): a fixture with a draft in the box of four lines and of six. The lines
// are ComposerTests.lines.
const DRAFT_LINES = ['Squats hurt.', 'Drop the load,', 'swap to box,', 'or rest a week?', 'And Legs 2?', 'Thanks!'];
const withDraft = (n) => (fx) => Object.assign({}, fx, {
  composer: Object.assign({}, fx.composer || {}, { draft: { text: DRAFT_LINES.slice(0, n).join('\n'), nonce: 'draft-' + n + '-lines' } }),
});
const VARIANTS = [['draft-4-lines', 'heavyweight-chat', withDraft(4)], ['draft-6-lines', 'heavyweight-chat', withDraft(6)]];

// ── a fixture's bodies back to the text the coach wrote ─────────────────────────────────────────
const GRAMMAR = JSON.parse(fs.readFileSync(path.join(FIX, 'blocks', 'page-grammar.json'), 'utf8')).cases;
const canon = (b) => (b && b.k === 'cmb') ? JSON.stringify({ k: 'cmb', sections: b.sections }) : JSON.stringify(b);
const BY_BODY = new Map(GRAMMAR.map((c) => [canon(c.body), c]));

function runsText(r) {
  if (typeof r === 'string') return r;
  return (r || []).map((x) => {
    if (typeof x === 'string') return x;
    let t = x.t || '';
    const s = x.s || '';
    if (s.includes('c')) t = '`' + t + '`';
    if (s.includes('i')) t = '*' + t + '*';
    if (s.includes('b')) t = '**' + t + '**';
    return t;
  }).join('');
}
function blocksText(blocks) {
  return (blocks || []).map((b) => {
    switch (b.k) {
      case 'p': return runsText(b.r);
      case 'h': return '### ' + runsText(b.r);
      case 'hr': return '---';
      case 'ul': return b.items.map((i) => (i.sub ? '  - ' : '- ') + runsText(i.r)).join('\n');
      case 'ol': return b.items.map((i, n) => ((b.start || 1) + n) + '. ' + runsText(i.r)).join('\n');
      case 'table': return b.rows.map((row, n) => '| ' + row.map(runsText).join(' | ') + ' |' + (n === 0 ? '\n|' + row.map(() => '---').join('|') + '|' : '')).join('\n');
      default: return b.text || (b.title ? b.title + (b.items ? ': ' + b.items.join(', ') : '') : '');
    }
  }).join('\n\n');
}
function bodyText(m) {
  const b = m.body;
  if (b == null) return '';
  if (typeof b === 'string') return b;
  const hit = BY_BODY.get(canon(b));
  if (hit) return hit.text;
  if (b.k === 'md') return blocksText(b.blocks);
  if (b.k === 'cmb') {
    const type = (m.eyebrow || '').replace(/^COACH( · )?/, '');
    const lines = type ? ['%%type: ' + type] : [];
    for (const s of b.sections || []) {
      if (s.k === 'md') lines.push(blocksText(s.blocks));
      else if (s.k === 'metrics') for (const r of s.rows) lines.push('%%metric: ' + [r.label, r.value, r.ref, r.delta, r.tone].join(' | '));
      else if (s.k === 'take') lines.push('%%takeaway: ' + runsText(s.r));
      else lines.push(s.text || '');
    }
    for (const a of b.actions || []) lines.push('%%action: ' + a.label + ' | ' + a.msg);
    return lines.join('\n');
  }
  return b.text || '';
}

// ── a fixture as the page's chat state ───────────────────────────────────────────────────────────
function pageState(fx) {
  const tools = (pills) => (pills || []).map((p) => {
    const says = /not saved|^No weeks changed/i.test(p.label);
    const label = (!p.ok && !says) ? String(p.label).replace(/^Not applied · /, '') : p.label;
    return { name: '__fx', input: {}, result: { ok: !!p.ok }, units: { w: 'lb', d: 'km' }, __label: label };
  });
  const canUndo = {};
  const messages = (fx.messages || []).filter((m) => m && typeof m === 'object').map((m) => {
    const out = { role: m.role === 'user' ? 'user' : 'assistant', content: bodyText(m) };
    if (m.at) out.at = m.at;
    if (m.seed) out._seed = m.seed;
    if (m.local || (m.role !== 'user' && m.role !== 'assistant')) out._local = true;
    if (m.error) out._error = true;
    if (m.stopped) out._stopped = true;
    if (m.errKind) out._errKind = m.errKind;
    if (m.image) { out.__photo = true; if (!out.content) out._auto = true; }
    const t = tools(m.pills);
    if (m.ledger) {
      out.__ledger = true;
      out._undo = 'fx:' + m.id;
      canUndo[out._undo] = !!m.ledger.canUndo;
      if (!t.length) t.push({ name: '__fx', input: {}, result: { ok: true }, units: { w: 'lb', d: 'km' }, __label: 'Programme updated' });
      t[0].__rows = m.ledger.rows.map((r) => Array.isArray(r) ? r : [r.label, r.value, r.kind]);
    }
    if (t.length) out._tools = t;
    return out;
  });
  return { messages, canUndo, running: tools(fx.running), intake: !!fx.intake, loading: !!fx.loading,
    header: fx.header || null, empty: fx.empty || null, composer: fx.composer || {} };
}

// A stand-in photo: a bar over a plate on the paper grey (CoachRenderTests.photo draws the same).
const PHOTO_JS = `(() => { const c = document.createElement('canvas'); c.width = 480; c.height = 360; const g = c.getContext('2d');
  g.fillStyle = 'rgb(204,199,189)'; g.fillRect(0, 0, 480, 360); g.fillStyle = 'rgb(51,56,66)'; g.fillRect(40, 170, 400, 20);
  g.fillStyle = 'rgb(26,28,33)'; g.beginPath(); g.ellipse(90, 180, 30, 70, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(390, 180, 30, 70, 0, 0, 7); g.fill();
  return c.toDataURL('image/png'); })()`;

// The fixtures' clock: 2026-10-09 09:30 UTC (their days read Today and Yesterday on it), running.
const CLOCK = `(() => { const T = Date.UTC(2026, 9, 9, 9, 30); const D = Date; const off = T - D.now();
  function F(...a) { if (!(this instanceof F)) return new D(D.now() + off).toString(); return a.length ? new D(...a) : new D(D.now() + off); }
  F.prototype = D.prototype; F.now = () => D.now() + off; F.UTC = D.UTC; F.parse = D.parse; window.Date = F; })();`;

// The forwarded toasts and the confirm, as the page draws them over the chat (heavyweight-chat).
const TOASTS = [['Previous programme restored', 'ok'], ['New record: Bench Press 175 lb', 'pr'],
  ['Storage full: the change was not saved', 'err'], ['Bench Press removed', 'undo']];
const CONFIRM = { title: 'Restore previous programme?', body: 'Your current one is set aside: restoring again brings it back.', confirmLabel: 'Restore' };

async function overlays(fx, roomName, roomId) {
  const dir = path.join(outDir, 'web', 'overlays');
  fs.mkdirSync(dir, { recursive: true });
  const shots = TOASTS.map((t, i) => [`${roomName}-toast-${i}.png`, t]).concat([[`${roomName}-confirm.png`, null]]);
  for (const [file, toast] of shots) {
    await shoot('heavyweight-chat', fx, roomName, roomId, 1, 'z1', async (page) => {
      await page.evaluate(({ toast, confirm }) => {
        if (!toast) { _ktConfirm(Object.assign({ onConfirm() {} }, confirm)); return; }
        if (toast[1] === 'undo') showUndoToast(toast[0], () => {});
        else showToast(toast[0], toast[1]);
      }, { toast, confirm: CONFIRM });
      await page.waitForTimeout(450);
      await page.screenshot({ path: path.join(dir, file) });
    });
  }
}

async function shoot(name, fx, roomName, roomId, zoom, ztag, instead) {
  const app = await boot({
    native: true,
    seed: { kt_theme: roomId, kt_apikey: 'sk-ant-test-not-real', kt_coach_msgs: '[]', kt_dyn_type: '1' },
    page: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'UTC' },
    init: CLOCK,
  });
  try {
    const page = app.page;
    await page.addStyleTag({ content: `#screen{padding-top:calc(${SAFE_TOP}px / var(--dt-z,1)) !important} body::before{height:calc(${SAFE_TOP}px / var(--dt-z,1)) !important}` });
    const st = pageState(fx);
    await page.evaluate(async ({ st, zoom, photoJS }) => {
      const photo = eval(photoJS);
      window.__fxCanUndo = st.canUndo;
      const _tcl = window.toolCallLabel;
      window.toolCallLabel = (tc) => (tc && tc.__label != null) ? tc.__label : _tcl(tc);
      const _rows = window._planChangeRows;
      window._planChangeRows = (tools) => { const t = (tools || []).find((x) => x && x.__rows); return t ? t.__rows.map((r) => [_esc(r[0]), _esc(r[1]), r[2] || 'plan']) : _rows(tools); };
      const _bsi = window._backupScopeIs;
      window._backupScopeIs = (s) => (s && Object.prototype.hasOwnProperty.call(window.__fxCanUndo, s)) ? window.__fxCanUndo[s] : _bsi(s);
      window._lastPlanMsg = () => { for (let i = coachMessages.length - 1; i >= 0; i--) if (coachMessages[i].__ledger) return coachMessages[i]; return null; };
      if (st.empty) {
        window.getCoachChips = () => st.empty.chips || [];
        const acts = (st.empty.programme && st.empty.programme.actions) || [];
        window.hasRoutineBackup = () => acts.some((a) => a.do === 'restorePrevious');
        if (!st.empty.programme) window.hasCustomRoutine = () => false;
      }
      currentWeek = 6;
      coachMessages = st.messages.map((m) => { const x = Object.assign({}, m); if (x.__photo) x._preview = photo; return x; });
      intakeMode = st.intake;
      coachLoading = st.loading;
      _runningTools = st.running;
      if (st.composer.image) pendingImage = { data: photo.split(',')[1], mediaType: 'image/png', previewUrl: photo };
      applyDynamicType(zoom === 1 ? undefined : zoom);
      if (zoom === 1) { document.documentElement.style.zoom = ''; document.documentElement.setAttribute('data-dyn-type', '1'); document.documentElement.style.removeProperty('--dt-z'); }
      switchTab('coach'); coachView = 'chat'; render();
      // the header's strings as the model has them (the page builds the same in C3)
      const h = st.header;
      if (h) {
        const eb = document.querySelector('.coach-head-eyebrow');
        if (eb) { eb.textContent = h.eyebrow; eb.classList.toggle('off', h.status === 'offline'); }
        const tt = document.querySelector('.coach-head-title'); if (tt && h.title != null) tt.textContent = h.title;
        const meta = document.querySelector('.coach-head-meta'); if (meta) { if (h.meta) meta.textContent = h.meta; else meta.remove(); }
        const pill = document.querySelector('.coach-head .kt-hit');
        if (pill) {
          if (!h.model) pill.remove();
          else {
            const ver = h.model.version || ((h.model.label.match(/ ([\d.]+)$/) || [])[1]) || '';
            const nm = h.model.name || h.model.label.replace(/ [\d.]+$/, '');
            pill.innerHTML = ''; pill.appendChild(document.createTextNode(nm));
            if (ver) { const v = document.createElement('span'); v.className = 'kt-model-ver'; v.textContent = ' ' + ver; pill.appendChild(v); }
            pill.setAttribute('aria-label', h.model.a11y);
          }
        }
      }
      if (st.composer.draft && st.composer.draft.text) _fillComposer(st.composer.draft.text);
      await document.fonts.ready;
      const s = document.getElementById('screen');
      if (typeof _metricsFit === 'function') _metricsFit(s);
      if (typeof _fitPlaceholder === 'function') _fitPlaceholder();
      scrollChatBottom();
    }, { st, zoom: fx.dynTypeOn === false ? 1 : zoom, photoJS: PHOTO_JS });
    await page.waitForTimeout(300);
    if (instead) { await instead(page); return; }
    const dir = path.join(outDir, 'web', name);
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `${roomName}-${ztag}.png`) });
    // the whole conversation: the screen grown by what the conversation scrolls
    const extra = await page.evaluate(() => { const l = document.querySelector('.coach-msgs-area'); const z = parseFloat(document.documentElement.style.zoom) || 1; return l ? Math.ceil((l.scrollHeight - l.clientHeight) * z) : 0; });
    if (extra > 0) {
      await page.setViewportSize({ width: 390, height: 844 + extra });
      await page.evaluate(() => { if (typeof _metricsFit === 'function') _metricsFit(document.getElementById('screen')); scrollChatBottom(); });
      await page.waitForTimeout(250);
    }
    await page.screenshot({ path: path.join(dir, `${roomName}-full-${ztag}.png`) });
    if (app.errors.length) console.warn('  page errors in', name, roomName, ztag, app.errors.join(' | '));
  } finally {
    await app.close();
  }
}

(async () => {
  const names = fs.readdirSync(path.join(FIX, 'coach')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
    .filter((n) => !only || only.has(n));
  const fixture = (name) => JSON.parse(fs.readFileSync(path.join(FIX, 'coach', name + '.json'), 'utf8'));
  const jobs = names.map((name) => [name, fixture(name)])
    .concat(VARIANTS.filter(([name]) => !only || only.has(name)).map(([name, base, apply]) => [name, apply(fixture(base))]));
  for (const [name, fx] of jobs) {
    for (const [roomName, roomId] of ROOMS) {
      for (const [zoom, ztag] of ZOOMS) {
        await shoot(name, fx, roomName, roomId, zoom, ztag);
      }
    }
    console.log('web', name);
  }
  if (!only || only.has('overlays')) {
    const fx = JSON.parse(fs.readFileSync(path.join(FIX, 'coach', 'heavyweight-chat.json'), 'utf8'));
    for (const [roomName, roomId] of ROOMS) await overlays(fx, roomName, roomId);
    console.log('web overlays');
  }
})().catch((e) => { console.error(e); process.exit(1); });
