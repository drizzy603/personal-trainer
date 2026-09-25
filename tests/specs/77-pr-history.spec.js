// PR history: every record shows its reps and the day it was set, plus the records it
// replaced — derived from kt_sessions (no stored ledger), so edits, renames, deletes and
// restores follow on their own. Pins the judged spec (pr-history): record rule (top load,
// strict >, same load + more reps is not a record, date order), bodyweight added load,
// the kt_prs cache reconcile, Records pills + header, the exercise-detail PR row, the
// RECORD HISTORY sheet, units (incl. the library path to it), both rooms, a11y,
// performance and dev nav.
const { boot, assert, run } = require('../lib/harness');

const BBP = 'Barbell Bench Press';
const X = (name, reps, wl) => ({ name, sets: reps.length, reps, weight: Math.max.apply(null, wl), weightLog: wl });
// Deliberately stored OLDEST-first: the ledger must sort by date, then id.
const S = [
  { id: 1001, date: '2026-05-04', type: 'Push', prs: [], exercises: [X(BBP, [5, 5], [100, 100])] },
  { id: 1002, date: '2026-05-11', type: 'Push', prs: [], exercises: [X(BBP, [8], [100])] },                  // same load, more reps
  { id: 1003, date: '2026-05-18', type: 'Push', prs: [], exercises: [X(BBP, [5, 3, 4], [110, 120, 120])] },  // 120 × 4 (most reps at the top)
  { id: 1004, date: '2026-05-25', type: 'Push', prs: [], exercises: [X(BBP, [10], [115])] },
  { id: 1005, date: '2026-06-01', type: 'Push', prs: [], exercises: [{ name: BBP, sets: [{ reps: 2, weight: 125 }, { reps: 5, weight: 100 }] }] }, // legacy nested
  { id: 1006, date: '2026-06-01', type: 'Push', label: 'Chest Day', prs: [{ ex: BBP, weight: 155, reps: 8 }], exercises: [X(BBP, [1], [130])] }, // same day, later id; legacy object prs
  { id: 2020, date: '2026-05-01', type: 'Pull', prs: [], exercises: [X('Barbell Row', [8], [140])] },        // logged later, dated earlier
  { id: 2010, date: '2026-05-20', type: 'Pull', prs: [], exercises: [X('Barbell Row', [5], [150])] },
  { id: 3001, date: '2026-06-02', type: 'Pull', prs: [], exercises: [X('Pull Up', [10, 10, 10], [0, 0, 0])] },
  { id: 3002, date: '2026-06-08', type: 'Pull', prs: [], exercises: [X('Pull Up', [6, 5], [25, 25])] },
  { id: 3003, date: '2026-06-03', type: 'Push', prs: [], exercises: [{ name: 'Push Up', sets: 2, reps: [20, 20], weight: 0 }] },
  { id: 4001, date: '2026-05-02', type: 'Push', prs: [], exercises: [X('Lateral Raise', [15, 15, 15], [20, 20, 20])] },
  { id: 4002, date: '2026-05-09', type: 'Push', prs: [], exercises: [X('Lateral Raise', [15, 15, 15], [20, 20, 20])] },
  { id: 5001, date: '2026-05-05', type: 'Legs', prs: [], exercises: [X('Back Squat', [5], [1850])] },         // typo
  { id: 5002, date: '2026-05-12', type: 'Legs', prs: [], exercises: [X('Back Squat', [5], [190])] },
  { id: 5003, date: '2026-05-19', type: 'Legs', prs: [], exercises: [X('Back Squat', [5], [200])] },
  { id: 6001, date: '2026-05-03', type: 'Pull', prs: [], exercises: [X('Barbell Curl', [10], [157.5])] },    // 71.5 kg
  { id: 6002, date: '2026-05-10', type: 'Pull', prs: [], exercises: [X('Barbell Curl', [10], [158])] },      // also 71.5 kg
  { id: 7001, date: '2026-05-05', type: 'Pull', prs: [], exercises: [X("Farmer's Walk", [2], [90])] },         // apostrophe in the name
  { id: 7002, date: '2026-05-06', type: 'Pull', prs: [], exercises: [X("Farmer's Walk", [1], [100])] },
  { id: 8001, date: '2026-05-07', type: 'Legs', prs: [], exercises: [{ name: 'Leg Press', sets: 1, reps: [5], weight: 'Infinity' }] }, // never a record
];

run('PR history: derived records, pills, sheet, detail row, units, rooms, edits', async () => {
  const app = await boot({ seed: { kt_sessions: JSON.stringify(S), kt_prs: JSON.stringify({ [BBP]: 999, 'Ghost Lift': 50 }), kt_weights: '{}' } });
  try {
    const out = await app.page.evaluate(async (BBP) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null);
      const q = s => document.querySelector(s), qa = s => Array.from(document.querySelectorAll(s));
      const ch = n => (_prChain(n) || []).map(e => e.w + 'x' + e.r + '@' + e.date);
      const sheet = () => ({ title: txt(q('#prHistTitle')), meta: txt(q('.kt-prh-meta')), cur: txt(q('.kt-prh-cur-v')), curS: txt(q('.kt-prh-cur .kt-prh-s')),
        gain: txt(q('.kt-prh-cur .kt-prh-d.up')), hd: txt(q('.kt-prh-hd .l')), rows: qa('.kt-prh-row .kt-prh-v').map(txt),
        subs: qa('.kt-prh-row .kt-prh-s').map(txt), chips: qa('.kt-prh-row .kt-prh-d').map(txt), empty: !!q('.kt-prh-empty') });
      const r = {};

      // 1. boot reconciled the stale cache
      r.a1 = { prs: getPRs(), heads: _prHeads(), again: _syncPRCache() };
      // 2-5. derivation
      r.a2 = ch(BBP); r.a2ids = (_prChain(BBP) || []).map(e => e.id);
      r.a4 = ch('Barbell Row'); r.a5 = { pu: ch('Pull Up'), push: _prChain('Push Up'), inf: _prChain('Leg Press') };
      // 6. _prMeta = the entry that SET the load
      r.a6 = { hit: _prMeta(BBP, 120), miss: _prMeta(BBP, 117) };
      // 7. recomputePRs = heads, and a caller mutating getPRs() cannot corrupt the ledger
      const rp = recomputePRs(); r.a7 = { same: JSON.stringify(rp) === JSON.stringify(_prHeads()) };
      getPRs()[BBP] = 1; r.a7.head = _prHead(BBP).w; recomputePRs();
      // 19. memo
      const L = _prLedger(); r.a19 = { same: _prLedger() === L };
      lsSet('kt_sessions', getSessions()); r.a19.rebuilt = _prLedger() !== L;

      // 8. Records card
      switchTab('progress'); showAllPRs = true; render();
      const pills = qa('#screen button.kt-pr-pill');
      const pill = n => pills.find(b => b.dataset.ex === n);
      r.a8 = { n: pills.length, names: _prLedger().names.length, bbp: txt(pill(BBP)), pu: txt(pill('Pull Up')), push: !!pill('Push Up'),
        head: txt(q('#screen [onclick^="showAllPRs"]')) };
      // 9. tap a pill → sheet
      pill(BBP).focus(); pill(BBP).click(); await wait(30);
      const ov = q('#prHistOverlay'), sh = ov && ov.querySelector('.kt-sheet');
      r.a9 = Object.assign({ open: !!ov, over: !!(ov && ov.classList.contains('kt-sheet-over')), role: sh && sh.getAttribute('role'), modal: sh && sh.getAttribute('aria-modal'),
        lbl: sh && sh.getAttribute('aria-labelledby'), focus: document.activeElement && document.activeElement.id, day: _dayLabel('Push') }, sheet());
      // 10. escape, focus return, single overlay, backdrop
      ov.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      r.a10 = { closed: !q('#prHistOverlay'), back: document.activeElement && document.activeElement.dataset && document.activeElement.dataset.ex };
      openPRHistory(BBP); openPRHistory(BBP); r.a10.one = qa('#prHistOverlay').length;
      q('#prHistOverlay').click(); r.a10.backdrop = !q('#prHistOverlay');
      // 11-12. single record, bodyweight, nothing to show
      openPRHistory('Lateral Raise'); r.a11 = sheet(); r.a11.anyGain = !!q('.kt-prh-cur .kt-prh-d'); r.a11.emptyTxt = txt(q('.kt-prh-empty')); closePRHistory(true);
      openPRHistory('Pull Up'); r.a12 = sheet(); closePRHistory(true);
      openPRHistory('Push Up'); r.a12.none = !q('#prHistOverlay');
      // an apostrophe in the name survives data-ex + dataset on a real pill tap
      qa('#screen button.kt-pr-pill').find(b => b.dataset.ex === "Farmer's Walk").click(); await wait(20);
      r.a12b = sheet(); closePRHistory(true);
      // 13. exercise library detail row
      openExLib(BBP);
      const xp = q('#exlibList .kt-ex-pr');
      r.a13 = { tag: xp && xp.tagName, text: txt(xp) };
      xp.click(); await wait(30);
      r.a13.z = q('#prHistOverlay') ? [+getComputedStyle(q('#prHistOverlay')).zIndex, +getComputedStyle(q('#exlibOverlay')).zIndex] : null;
      r.a13.title = txt(q('#prHistTitle'));
      closePRHistory(true); r.a13.libOpen = !!q('#exlibOverlay'); closeExLib();

      // 14. kg
      localStorage.setItem('kt_unit_w', 'kg');
      render();
      const kpill = qa('#screen button.kt-pr-pill').find(b => b.dataset.ex === BBP);
      const shelf = txt(kpill.parentElement);
      r.a14 = { pill: txt(kpill), head: txt(q('#screen [onclick^="showAllPRs"]')), shelfLb: /\blb\b/.test(shelf) };
      openPRHistory(BBP); r.a14.s = sheet(); r.a14.sheetLb = /\blb\b/.test(txt(q('#prHistOverlay'))); closePRHistory(true);
      openPRHistory('Barbell Curl'); r.a14.curl = sheet(); closePRHistory(true);
      openExLib(BBP); r.a14.detail = txt(q('#exlibList .kt-ex-pr')); r.a14.card = txt(q('#exlibList [onclick^="event.stopPropagation"]')); closeExLib();
      localStorage.setItem('kt_unit_w', 'lb'); render();

      // 15. rooms
      const rgb = v => { const d = document.createElement('div'); d.style.color = v; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
      const bg = v => { const d = document.createElement('div'); d.style.background = v; document.body.appendChild(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; };
      const room = () => {
        switchTab('progress'); showAllPRs = true; render();
        const p = qa('#screen button.kt-pr-pill')[0];
        openPRHistory(BBP);
        const o = { kf: getComputedStyle(q('.kt-prh-k')).fontFamily, df: getComputedStyle(q('.kt-prh-row .kt-prh-d')).fontFamily, ef: getComputedStyle(q('#prHistOverlay .screen-eyebrow')).fontFamily,
          k: getComputedStyle(q('.kt-prh-k')).color, up: getComputedStyle(q('.kt-prh-cur .kt-prh-d.up')).color, chip: getComputedStyle(q('.kt-prh-row .kt-prh-d')).color,
          earned: rgb('var(--earned-ink)'), muted: rgb('var(--muted)'), pillBg: getComputedStyle(p).backgroundColor, card2: bg('var(--card2)') };
        const red = rgb('var(--red)'), orange = rgb('var(--orange)');
        o.bad = qa('#prHistOverlay *').filter(e => { const c = getComputedStyle(e).color; return c === red || c === orange; }).length;
        closePRHistory(true);
        return o;
      };
      applyTheme('dark'); r.a15d = room();
      applyTheme('heavyweight'); r.a15h = room();

      // 16. delete a record → the masked one surfaces; undo restores
      deleteSession(1003); r.a16 = { del: ch(BBP), pr: getPRs()[BBP] };
      _toastUndo(); r.a16.undo = ch(BBP);
      // 17. fix a typo in history → the chain follows
      r.a17 = { before: getPRs()['Back Squat'] };
      openSessionEditor(5001); document.getElementById('se_0_0_w').value = '185'; saveSessionEdit();
      r.a17.chain = ch('Back Squat'); r.a17.pr = getPRs()['Back Squat'];
      // 18. rename carries the record to the new name
      openSessionEditor(1006); document.getElementById('se_0_name').value = 'Paused Bench Press'; saveSessionEdit();
      r.a18 = { bbp: ch(BBP), paused: ch('Paused Bench Press'), pr: getPRs()[BBP], prP: getPRs()['Paused Bench Press'] };
      openPRHistory(BBP); r.a18.cur = txt(q('.kt-prh-cur-v')); closePRHistory(true);
      // the library row that leads to the detail speaks the display unit too
      const ss = getSessions(); ss.unshift({ id: 9901, date: todayISO(), type: 'Push', prs: [], exercises: [{ name: BBP, sets: 1, reps: [12], weight: 25, weightLog: [25] }] }); lsSet('kt_sessions', ss);
      localStorage.setItem('kt_unit_w', 'kg'); openExLib(BBP);
      r.a14row = txt(qa('#exlibList [onclick^="toggleLibEx"]').find(el => el.getAttribute('onclick') === "toggleLibEx('" + BBP + "')")); closeExLib(); localStorage.setItem('kt_unit_w', 'lb');

      // 20. hundreds of sessions
      const G = []; const base = new Date('2023-01-02T00:00:00');
      for (let i = 0; i < 700; i++) {
        const d = new Date(base); d.setDate(d.getDate() + i);
        const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        G.push({ id: 9e11 + i, date: iso, type: 'Push', prs: [], exercises: [0, 1, 2, 3, 4, 5].map(k => ({ name: 'Lift ' + k, sets: 4, reps: [8, 8, 6, 5],
          weight: 100 + k * 10 + (i % 40), weightLog: [90, 95, 100 + k * 10 + (i % 40), 100 + k * 10 + (i % 40)] })) });
      }
      lsSet('kt_sessions', G);
      let t0 = performance.now(); const LG = _prLedger(); const cold = performance.now() - t0;
      r.a20 = { cold, warm: _prLedger() === LG, lifts: LG.names.length, chain: (_prChain('Lift 0') || []).length };
      t0 = performance.now(); switchTab('progress'); showAllPRs = true; render(); openPRHistory('Lift 0'); r.a20.ui = performance.now() - t0; r.a20.rows = qa('.kt-prh-row').length; closePRHistory(true);
      return r;
    }, BBP);

    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    assert(eq(out.a1.prs, out.a1.heads) && out.a1.prs[BBP] === 130 && !('Ghost Lift' in out.a1.prs) && out.a1.prs['Pull Up'] === 25 && !('Push Up' in out.a1.prs) && out.a1.again === false,
      '1 boot reconciles kt_prs to the derived heads, once (a non-finite load never loops the write): ' + JSON.stringify(out.a1));
    assert(eq(out.a2, ['100x5@2026-05-04', '120x4@2026-05-18', '125x2@2026-06-01', '130x1@2026-06-01']) && eq(out.a2ids, [1001, 1003, 1005, 1006]),
      '2 chain = strictly heavier sessions in date order; reps are the most done at the top load; legacy nested counts: ' + JSON.stringify([out.a2, out.a2ids]));
    assert(!out.a2.some(e => /2026-05-11/.test(e)), '3 same load for more reps is not a record');
    assert(eq(out.a4, ['140x8@2026-05-01', '150x5@2026-05-20']), '4 date order, not log order: ' + JSON.stringify(out.a4));
    assert(eq(out.a5.pu, ['25x6@2026-06-08']) && out.a5.push === null && out.a5.inf === null, '5 bodyweight: added load only, 0 never a record: ' + JSON.stringify(out.a5));
    assert(eq(out.a6.hit, { date: '2026-05-18', reps: 4 }) && out.a6.miss === null, '6 _prMeta returns the entry that set the load: ' + JSON.stringify(out.a6));
    assert(out.a7.same && out.a7.head === 130, '7 recomputePRs writes the heads; mutating getPRs() leaves the ledger intact: ' + JSON.stringify(out.a7));
    assert(out.a19.same && out.a19.rebuilt, '19 memoized on the log version: ' + JSON.stringify(out.a19));
    assert(out.a8.n === out.a8.names && out.a8.n === 7 && !out.a8.push, '8 one pill button per derived record: ' + JSON.stringify(out.a8));
    assert(out.a8.bbp === 'Barbell Bench Press 130 lb ×1 · JUN 1, 2026' && out.a8.pu === 'Pull Up +25 lb ×6 · JUN 8, 2026', '8 pills: load through fmtW, reps, set date: ' + JSON.stringify(out.a8));
    assert(/7 PRs · latest Pull Up \+25 lb/.test(out.a8.head) && /JUN 8, 2026 · ×6/.test(out.a8.head) && !/155/.test(out.a8.head), '8 header: latest record from the ledger, never s.prs: ' + out.a8.head);
    assert(out.a9.open && out.a9.over && out.a9.role === 'dialog' && out.a9.modal === 'true' && out.a9.lbl === 'prHistTitle' && out.a9.focus === 'prHistTitle', '9 dialog: ' + JSON.stringify(out.a9));
    assert(out.a9.title === BBP && out.a9.meta === '4 records since May 4, 2026' && out.a9.cur === '130 lb × 1' && out.a9.curS === 'Jun 1, 2026 · Chest Day' && out.a9.gain === '+5 lb',
      '9 current record: load × reps, set date, the session it came from, gain: ' + JSON.stringify(out.a9));
    assert(out.a9.hd === 'REPLACED · 3' && eq(out.a9.rows, ['125 lb × 2', '120 lb × 4', '100 lb × 5']) && eq(out.a9.chips, ['+5 lb', '+20 lb', 'FIRST']) &&
      eq(out.a9.subs, ['Jun 1, 2026 · ' + out.a9.day, 'May 18, 2026 · ' + out.a9.day, 'May 4, 2026 · ' + out.a9.day]), '9 replaced records newest first: ' + JSON.stringify(out.a9));
    assert(out.a10.closed && out.a10.back === BBP && out.a10.one === 1 && out.a10.backdrop, '10 escape / focus back / one overlay / backdrop: ' + JSON.stringify(out.a10));
    assert(out.a11.emptyTxt === 'Nothing replaced yet — this is the first record for this lift.' && out.a11.meta === '1 record' && out.a11.rows.length === 0 && out.a11.empty && !out.a11.anyGain && out.a11.cur === '20 lb × 15', '11 a lone record: ' + JSON.stringify(out.a11));
    assert(out.a12b.title === "Farmer's Walk" && out.a12b.meta === '2 records since May 5, 2026' && out.a12b.cur === '100 lb × 1' && eq(out.a12b.rows, ['90 lb × 2']) && eq(out.a12b.chips, ['FIRST']),
      '12b an apostrophe in the name survives the pill tap: ' + JSON.stringify(out.a12b));
    assert(/added load/.test(out.a12.meta) && out.a12.cur === '+25 lb × 6' && out.a12.none, '12 bodyweight sheet; no sheet without a record: ' + JSON.stringify(out.a12));
    assert(out.a13.tag === 'BUTTON' && /PR · 130 lb × 1/.test(out.a13.text) && /JUN 1, 2026/.test(out.a13.text) && out.a13.z && out.a13.z[0] > out.a13.z[1] && out.a13.title === BBP && out.a13.libOpen,
      '13 exercise detail PR row opens the sheet above the library: ' + JSON.stringify(out.a13));
    assert(/59 kg ?×1/.test(out.a14.pill) && !out.a14.shelfLb && /latest Pull Up \+11\.5 kg/.test(out.a14.head), '14 kg pills + header: ' + JSON.stringify(out.a14));
    assert(out.a14.s.cur === '59 kg × 1' && out.a14.s.gain === '+2.5 kg' && eq(out.a14.s.rows, ['56.5 kg × 2', '54.5 kg × 4', '45.5 kg × 5']) && eq(out.a14.s.chips, ['+2 kg', '+9 kg', 'FIRST']) && !out.a14.sheetLb,
      '14 kg sheet, gains on the displayed numbers: ' + JSON.stringify(out.a14.s));
    assert(out.a14.curl.cur === '71.5 kg × 10' && out.a14.curl.gain === null && eq(out.a14.curl.chips, ['FIRST']), '14 records that round to the same kg carry no "+0": ' + JSON.stringify(out.a14.curl));
    assert(/PR · 59 kg × 1/.test(out.a14.detail), '14 kg detail row: ' + out.a14.detail);
    assert(/LAST LOGGED ?59 ?kg × 1/.test(out.a14.card) && /[+\u2212][\d.]+ KG · \d+ SESSIONS/.test(out.a14.card) && !/\blb\b|\bLB\b/.test(out.a14.card),
      '14 kg exercise card: hero, change chip and PR row agree on the unit: ' + out.a14.card);
    assert(/TODAY · 11\.5 KG/.test(out.a14row), '14 kg library row: ' + out.a14row);
    assert(/JetBrains Mono/.test(out.a15d.kf) && out.a15d.k === out.a15d.earned && out.a15d.up === out.a15d.earned && out.a15d.chip === out.a15d.muted && out.a15d.pillBg === out.a15d.card2 && out.a15d.bad === 0, '15 Lime room: ' + JSON.stringify(out.a15d));
    assert(/^Archivo/.test(out.a15h.kf) && /^Archivo/.test(out.a15h.df) && out.a15h.kf === out.a15h.ef && out.a15h.k === 'rgb(79, 112, 0)' && out.a15h.up === 'rgb(79, 112, 0)' && out.a15h.chip === out.a15h.muted && out.a15h.bad === 0, '15 Heavyweight: ' + JSON.stringify(out.a15h));
    assert(eq(out.a16.del, ['100x5@2026-05-04', '115x10@2026-05-25', '125x2@2026-06-01', '130x1@2026-06-01']) && out.a16.pr === 130 &&
      eq(out.a16.undo, ['100x5@2026-05-04', '120x4@2026-05-18', '125x2@2026-06-01', '130x1@2026-06-01']), '16 delete surfaces the masked record; undo restores: ' + JSON.stringify(out.a16));
    assert(out.a17.before === 1850 && eq(out.a17.chain, ['185x5@2026-05-05', '190x5@2026-05-12', '200x5@2026-05-19']) && out.a17.pr === 200, '17 a typo fix re-derives the chain: ' + JSON.stringify(out.a17));
    assert(eq(out.a18.bbp, ['100x5@2026-05-04', '120x4@2026-05-18', '125x2@2026-06-01']) && eq(out.a18.paused, ['130x1@2026-06-01']) && out.a18.pr === 125 && out.a18.prP === 130 && out.a18.cur === '125 lb × 2',
      '18 a rename carries the record to the new name: ' + JSON.stringify(out.a18));
    assert(out.a20.cold < 100 && out.a20.warm && out.a20.lifts === 6 && out.a20.chain > 1 && out.a20.rows === out.a20.chain - 1, '20 700 sessions: ' + JSON.stringify(out.a20));
    assert(app.errors.length === 0, '21 no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('PR history: demo seed reconcile, restore, dev nav', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      const ms = lsGet('kt_milestones') || {};
      r.boot = { prs: getPRs(), heads: _prHeads(), ms: Object.keys(ms).filter(k => /^pr-/.test(k)).map(k => k + '=' + ms[k]) };
      // a legacy array-shaped kt_prs is rewritten as the {name: lb} map
      lsSet('kt_prs', [{ ex: 'Bench Press', weight: 155 }]);
      r.arr = { wrote: _syncPRCache(), map: !Array.isArray(lsGet('kt_prs')) && lsGet('kt_prs')['Bench Press'] === 160, again: _syncPRCache() };
      _applyImportedData({ kt_sessions: [{ id: 1, date: '2026-07-01', type: 'Push', prs: [], exercises: [{ name: 'Bench Press', sets: 1, reps: [5], weight: 100, weightLog: [100] }] }],
        kt_prs: { 'Bench Press': 500 } });
      r.restore = getPRs();
      return r;
    });
    assert(JSON.stringify(out.boot.prs) === JSON.stringify(out.boot.heads) && out.boot.prs['Bench Press'] === 160 && out.boot.prs['Back Squat'] === 230 && Object.keys(out.boot.prs).length === 15,
      '22 the demo seed\'s stale kt_prs is reconciled at boot: ' + JSON.stringify(out.boot.prs));
    assert(out.boot.ms.slice().sort().join() === 'pr-10=1,pr-5=1', '22 the PR milestone baseline stays silent: ' + JSON.stringify(out.boot.ms));
    assert(out.arr.wrote && out.arr.map && out.arr.again === false, '22b a legacy array kt_prs is rewritten once as the map: ' + JSON.stringify(out.arr));
    assert(JSON.stringify(out.restore) === JSON.stringify({ 'Bench Press': 100 }), '23 a restore reconciles the cache: ' + JSON.stringify(out.restore));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
  const dev = await boot({ seed: { kt_dev_nav: 'progress/records' } });
  try {
    await dev.page.waitForTimeout(1000);
    const o = await dev.page.evaluate(() => ({ open: !!document.getElementById('prHistOverlay'), shelf: showAllPRs, title: (document.getElementById('prHistTitle') || {}).textContent, latest: _prLedger().latest.name }));
    assert(o.open && o.shelf && o.title === o.latest, '24 dev nav progress/records opens the latest record: ' + JSON.stringify(o));
    assert(dev.errors.length === 0, 'no page errors: ' + dev.errors.join('|'));
  } finally { await dev.close(); }
});
