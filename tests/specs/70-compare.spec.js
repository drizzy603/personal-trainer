// Compare two: pick two workouts or two runs from the Activity Calendar month and read the
// then → now differences. Pins the judged spec (compare-spec) — flow, maths, delta rules, units,
// matching, state, both rooms, accessibility, dev nav.
const { boot, assert, run } = require('../lib/harness');

const SETUP = () => { switchTab('progress'); calYear = 2026; calMonth = 6; calSelectedDate = null; render(); };

run('compare two: flow, maths, deltas, units, matching, state, rooms, a11y', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async (SETUP_SRC) => {
      const SETUP = eval('(' + SETUP_SRC + ')');
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null);
      const q = s => document.querySelector(s), qa = s => Array.from(document.querySelectorAll(s));
      const sess = (date, type) => getSessions().find(x => x.date === date && (!type || x.type === type));
      const runOn = date => getRuns().find(x => x.date === date);
      const rowByKey = key => qa('#cmpSheetOverlay .kt-vs-row').find(row => { const k = row.querySelector('.kt-vs-k'); return k && k.textContent.trim() === key; });
      const rowByName = name => qa('#cmpSheetOverlay .kt-vs-row').find(row => { const n = row.querySelector('.kt-vs-name'); return n && n.textContent.trim() === name; });
      const vals = row => row ? { a: txt(row.querySelector('.kt-vs-v .a')), b: txt(row.querySelector('.kt-vs-v .b')), u: txt(row.querySelector('.kt-vs-v .u')),
        chip: txt(row.querySelector('.kt-vs-d')), up: !!row.querySelector('.kt-vs-d.up'), eq: !!row.querySelector('.kt-vs-d.eq'), none: !!row.querySelector('.kt-vs-v .none') } : null;
      const openPair = (a, b, kind) => { closeCompareSheet(true); cmpOn = true; cmpKind = kind; cmpPicks = [String(a.id), String(b.id)]; openCompareSheet(); };

      // 1. outside compare mode
      SETUP();
      const btn = q('.kt-cal-hd #cmp-btn.kt-vs-btn');
      r.a1 = { exists: !!btn, text: txt(btn), pressed: btn && btn.getAttribute('aria-pressed') };

      // 3. toggle on
      cmpToggle();
      r.a3 = { on: cmpOn, kind: cmpKind, text: txt(q('#cmp-btn')), pressed: q('#cmp-btn').getAttribute('aria-pressed'), tray: txt(q('#cmp-tray')) };
      // 4. the month's workouts, newest first, no date inputs
      const rows = qa('#cal-detail button.kt-vs-pick');
      r.a4 = { n: rows.length, dateInputs: qa('#cal-detail input[type=date]').length, first: txt(rows[0] && rows[0].querySelector('.kt-vs-pick-dt')) };
      // 5. runs, explicit sort
      r.a5seg = !!q('.kt-vs-seg');
      cmpPicks = ['x'];
      cmpSetKind('run');
      const runRows = qa('#cal-detail button.kt-vs-pick');
      r.a5 = { n: runRows.length, first: txt(runRows[0] && runRows[0].querySelector('.kt-vs-pick-dt')), picks: cmpPicks.length };
      cmpSetKind('lift');

      // 6-10. two Pushes, tapped newest first
      const p21 = sess('2026-07-21', 'Push'), p15 = sess('2026-07-15', 'Push');
      r.ids = { p21: !!p21, p15: !!p15 };
      cmpPick(String(p21.id)); cmpPick(String(p15.id));
      await wait(320);
      const ov = q('#cmpSheetOverlay'), sheet = ov && ov.querySelector('.kt-sheet');
      r.a6 = { open: !!ov, role: sheet && sheet.getAttribute('role'), modal: sheet && sheet.getAttribute('aria-modal'), lbl: sheet && sheet.getAttribute('aria-labelledby'), focus: document.activeElement && document.activeElement.id };
      r.a7 = qa('#cmpSheetOverlay .kt-vs-side-d').map(txt);
      r.a8 = vals(rowByKey('VOLUME'));
      r.a9 = { sets: vals(rowByKey('SETS')), reps: vals(rowByKey('REPS')), rpe: vals(rowByKey('AVG RPE')), prs: vals(rowByKey('PRS')), dur: !!rowByKey('DURATION') };
      const hds = qa('#cmpSheetOverlay .kt-vs-sec').map(txt);
      const bench = rowByName('Bench Press');
      r.a10 = { hds, bench: vals(bench), prMarks: bench ? qa('#cmpSheetOverlay .kt-vs-row').filter(x => x === bench)[0].querySelectorAll('.kt-vs-pr').length : -1,
        prOnNow: bench ? !!bench.querySelector('.kt-vs-v .b .kt-vs-pr') : false, lateral: vals(rowByName('Lateral Raise')) };
      r.a15 = /(^|\s)-\d/.test(txt(q('#cmpSheetOverlay')));

      // 24. Escape closes the sheet only; focus returns to #cmp-go; double open leaves one overlay
      q('#cmpSheetOverlay').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wait(50);
      r.a24 = { closed: !q('#cmpSheetOverlay'), focus: document.activeElement && document.activeElement.id, still: cmpOn && cmpPicks.length === 2 };
      openCompareSheet(); openCompareSheet();
      r.a24.one = qa('#cmpSheetOverlay').length;

      // 11. Push vs Pull: nothing in common, volume not coloured
      const l18 = sess('2026-07-18', 'Pull');
      openPair(p15, l18, 'lift');
      r.a11 = { hds: qa('#cmpSheetOverlay .kt-vs-sec').map(txt), empty: !!q('#cmpSheetOverlay .kt-vs-empty'),
        only: qa('#cmpSheetOverlay .kt-vs-only').length, vol: vals(rowByKey('VOLUME')) };

      // 12. runs Jul 16 vs Jul 20
      const r16 = runOn('2026-07-16'), r20 = runOn('2026-07-20'), r12 = runOn('2026-07-12');
      openPair(r16, r20, 'run');
      r.a12 = { pace: vals(rowByKey('PACE')), time: vals(rowByKey('TIME')), dist: vals(rowByKey('DISTANCE')), hr: vals(rowByKey('AVG HR')), feel: !!rowByKey('FEEL') };
      r.a15b = /(^|\s)-\d/.test(txt(q('#cmpSheetOverlay')));
      // 13. same distance and time
      openPair(r12, r16, 'run');
      r.a13 = ['DISTANCE', 'TIME', 'PACE', 'AVG HR'].map(k => { const v = vals(rowByKey(k)); return k + ':' + (v ? (v.eq ? 'eq' : v.chip) : 'missing'); });
      // 14. HR missing on one side, then both
      const runs = getRuns();
      runs.push({ id: 9001, date: '2026-07-24', type: 'easy', distance: 5, time: '30:00', hr: 0 });
      runs.push({ id: 9002, date: '2026-07-25', type: 'easy', distance: 5, time: '31:00', hr: 0 });
      lsSet('kt_runs', runs);
      openPair(r16, getRuns().find(x => x.id === 9001), 'run');
      r.a14 = { hr: vals(rowByKey('AVG HR')) };
      openPair(getRuns().find(x => x.id === 9001), getRuns().find(x => x.id === 9002), 'run');
      r.a14.none = !rowByKey('AVG HR');

      // 16. kg + mi
      localStorage.setItem('kt_unit_w', 'kg'); localStorage.setItem('kt_unit_d', 'mi');
      openPair(p15, p21, 'lift');
      const kgText = txt(q('#cmpSheetOverlay'));
      r.a16 = { noLb: !/\blb\b/.test(kgText), bench: vals(rowByName('Bench Press')), vol: vals(rowByKey('VOLUME')),
        volExpect: '+' + (Math.round(wDisp(12986)) - Math.round(wDisp(12808))) };
      openPair(r16, r20, 'run');
      const miText = txt(q('#cmpSheetOverlay'));
      r.a16.noKm = !/\bkm\b/.test(miText); r.a16.pace = vals(rowByKey('PACE')); r.a16.dist = vals(rowByKey('DISTANCE'));
      localStorage.setItem('kt_unit_w', 'lb'); localStorage.setItem('kt_unit_d', 'km');

      // 17. matching with flat-shape sessions (base-name pass, BW, ONLY ON)
      const S = getSessions();
      S.push({ id: 7001, date: '2026-08-03', type: 'Push', week: 9, prs: ['Bench Press (Top Set)'], exercises: [
        { name: 'Bench Press (Top Set)', sets: 1, reps: [5], weight: 185, weightLog: [185] },
        { name: 'Bench Press (Backoff)', sets: 3, reps: [8, 8, 8], weight: 155, weightLog: [155, 155, 155] },
        { name: 'Dips', sets: 3, reps: [10, 10, 10], weight: 0, weightLog: [0, 0, 0] }] });
      S.push({ id: 7002, date: '2026-08-10', type: 'Push', week: 10, prs: [], exercises: [
        { name: 'Bench Press', sets: 4, reps: [6, 6, 6, 6], weight: 175, weightLog: [175, 175, 175, 175] },
        { name: 'Cable Fly', sets: 3, reps: [12, 12, 12], weight: 40, weightLog: [40, 40, 40] }] });
      lsSet('kt_sessions', S);
      openPair(getSessions().find(x => x.id === 7002), getSessions().find(x => x.id === 7001), 'lift');
      const bp = rowByName('Bench Press');
      r.a17 = { bench: vals(bp), prThen: bp ? !!bp.querySelector('.kt-vs-v .a .kt-vs-pr') : false,
        subs: bp ? Array.from(bp.querySelectorAll('.kt-vs-sub')).map(txt) : [], hds: qa('#cmpSheetOverlay .kt-vs-sec').map(txt),
        only: qa('#cmpSheetOverlay .kt-vs-only').map(txt) };
      closeCompareSheet(true);

      // 18-22. state (start clean: the cases above left compare mode on with other picks)
      _cmpExit(); SETUP();
      cmpToggle();
      cmpSetKind('lift');
      const p9 = sess('2026-07-09') || getSessions().filter(x => x.date.slice(0, 7) === '2026-07')[2];
      cmpPick(String(p21.id)); cmpPick(String(p15.id)); closeCompareSheet(true); clearTimeout(_cmpOpenT);
      calNav(-1); calNav(1);
      r.a18 = { picks: cmpPicks.slice(), expect: [String(p21.id), String(p15.id)], tray: txt(q('#cmp-tray')) };
      r.a20 = { rings: qa('.cal-day.kt-vs-on').length };
      cmpPick(String(p15.id));
      r.a19 = { afterUnpick: cmpPicks.slice() };
      cmpPick(String(p15.id)); clearTimeout(_cmpOpenT); closeCompareSheet(true);
      cmpPick(String(p9.id)); clearTimeout(_cmpOpenT); closeCompareSheet(true);
      r.a19.replaced = cmpPicks.slice(); r.a19.p9 = String(p9.id); r.a19.p21 = String(p21.id);
      selectCalDate('2026-07-04');
      r.a21 = { n: qa('#cal-detail button.kt-vs-pick').length, hd: txt(q('.kt-vs-listhd')), whole: !!q('.kt-vs-link') };
      selectCalDate('2026-07-04');
      r.a21.back = qa('#cal-detail button.kt-vs-pick').length;
      deleteSession(p9.id);
      r.a22 = { gone: cmpPicks.indexOf(String(p9.id)) < 0 };
      switchTab('log'); switchTab('progress');
      r.a23 = { on: cmpOn, tray: !!q('#cmp-tray'), detail: txt(q('#cal-detail')) };

      // 25-27. rooms
      const rgb = v => { const d = document.createElement('div'); d.style.color = v; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
      const bg = v => { const d = document.createElement('div'); d.style.background = v; document.body.appendChild(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; };
      const roomCheck = () => {
        _cmpExit(); SETUP(); cmpToggle(); cmpSetKind('lift');
        cmpPick(String(p21.id)); cmpPick(String(p15.id)); clearTimeout(_cmpOpenT); openCompareSheet();
        const up = q('#cmpSheetOverlay .kt-vs-d.up');
        const disc = q('.kt-vs-pick.on .kt-vs-disc');
        const red = rgb('var(--red)'), orange = rgb('var(--orange)');
        const bad = qa('#cmpSheetOverlay *').filter(e => { const c = getComputedStyle(e).color; return c === red || c === orange; }).length;
        const o = { up: up && getComputedStyle(up).color, earnedInk: rgb('var(--earned-ink)'), disc: disc && getComputedStyle(disc).backgroundColor, text: bg('var(--text)'), bad };
        closeCompareSheet(true);
        selectCalDate('2026-07-04');
        const sel = q('.cal-day.sel');
        o.sel = sel && getComputedStyle(sel).backgroundColor; o.selTok = bg('var(--sel, var(--accent))'); o.accent = bg('var(--accent)');
        _cmpExit(); render();
        return o;
      };
      applyTheme('dark'); r.a25 = roomCheck();
      applyTheme('heavyweight'); r.a26 = roomCheck();

      // 28. a11y
      _cmpExit(); SETUP(); cmpToggle();
      r.a28 = { picksAreButtons: qa('.kt-vs-pick').every(b => b.tagName === 'BUTTON' && b.hasAttribute('aria-pressed')),
        radios: qa('.kt-vs-seg .kt-units-opt').every(o => o.getAttribute('role') === 'radio' && o.hasAttribute('aria-checked')) };
      _cmpExit(); render();
      return r;
    }, SETUP.toString());

    assert(out.a1.exists && out.a1.text === 'Compare' && out.a1.pressed === 'false', '1 COMPARE button: ' + JSON.stringify(out.a1));
    assert(out.a3.on && out.a3.kind === 'lift' && out.a3.text === 'Done' && out.a3.pressed === 'true' && /Pick two workouts/.test(out.a3.tray), '3 toggle: ' + JSON.stringify(out.a3));
    assert(out.a4.n === 10 && out.a4.dateInputs === 0 && /21/.test(out.a4.first), '4 the month\'s workouts newest first: ' + JSON.stringify(out.a4));
    assert(out.a5seg && out.a5.n === 5 && /20/.test(out.a5.first) && out.a5.picks === 0, '5 runs sorted, picks cleared: ' + JSON.stringify([out.a5seg, out.a5]));
    assert(out.ids.p21 && out.ids.p15, 'seed has the two Pushes');
    assert(out.a6.open && out.a6.role === 'dialog' && out.a6.modal === 'true' && out.a6.lbl === 'cmpSheetTitle' && out.a6.focus === 'cmpSheetTitle', '6 auto-open dialog: ' + JSON.stringify(out.a6));
    assert(out.a7[0] === 'WED JUL 15' && out.a7[1] === 'TUE JUL 21', '7 then → now by date: ' + JSON.stringify(out.a7));
    assert(out.a8 && out.a8.a === '12,808' && out.a8.b === '12,986' && /lb/.test(out.a8.u) && out.a8.chip === '+178 lb · +1%' && out.a8.up, '8 volume: ' + JSON.stringify(out.a8));
    assert(out.a9.sets && out.a9.sets.a === '17' && out.a9.sets.b === '17' && out.a9.sets.eq && out.a9.reps.eq && !out.a9.reps.up, '9 sets/reps: ' + JSON.stringify(out.a9));
    assert(out.a9.rpe && out.a9.rpe.a === '7.2' && out.a9.rpe.b === '8.2' && out.a9.rpe.chip === '+1' && !out.a9.rpe.up, '9 RPE: ' + JSON.stringify(out.a9.rpe));
    assert(out.a9.prs && out.a9.prs.a === '0' && out.a9.prs.b === '1' && !out.a9.prs.chip && !out.a9.dur, '9 PRs, no duration: ' + JSON.stringify([out.a9.prs, out.a9.dur]));
    assert(out.a10.hds.some(h => /LIFTS IN COMMON · 5/.test(h)) && !out.a10.hds.some(h => /ONLY ON/.test(h)), '10 headers: ' + JSON.stringify(out.a10.hds));
    assert(out.a10.bench && /157\.5 lb × 8/.test(out.a10.bench.a) && /160 lb × 8/.test(out.a10.bench.b) && out.a10.bench.chip === '+2.5 lb' && out.a10.bench.up && out.a10.prMarks === 1 && out.a10.prOnNow,
      '10 bench row: ' + JSON.stringify(out.a10));
    assert(out.a10.lateral && out.a10.lateral.eq, '10 lateral raise =: ' + JSON.stringify(out.a10.lateral));
    assert(out.a11.hds.some(h => /LIFTS IN COMMON · 0/.test(h)) && out.a11.empty && out.a11.only === 10 && out.a11.hds.filter(h => /ONLY ON/.test(h)).length === 2 && out.a11.vol && !out.a11.vol.up,
      '11 Push vs Pull: ' + JSON.stringify(out.a11));
    assert(out.a12.pace && out.a12.pace.chip === '−30 s /km' && out.a12.pace.up, '12 pace: ' + JSON.stringify(out.a12.pace));
    assert(out.a12.time && out.a12.time.a === '47:30' && out.a12.time.b === '1:03:00' && out.a12.time.chip === '+15:30' && !out.a12.time.up, '12 time: ' + JSON.stringify(out.a12.time));
    assert(out.a12.dist && out.a12.dist.chip === '+2 km' && !out.a12.dist.up, '12 distance: ' + JSON.stringify(out.a12.dist));
    assert(out.a12.hr && out.a12.hr.a === '145' && out.a12.hr.b === '140' && out.a12.hr.chip === '−5 bpm' && !out.a12.hr.up && !out.a12.feel, '12 HR: ' + JSON.stringify([out.a12.hr, out.a12.feel]));
    assert(out.a13.every(x => /:eq$/.test(x)), '13 identical runs: ' + JSON.stringify(out.a13));
    assert(out.a14.hr && out.a14.hr.none && !out.a14.hr.chip && out.a14.none, '14 missing HR: ' + JSON.stringify(out.a14));
    assert(!out.a15 && !out.a15b, '15 no hyphen-minus deltas');
    assert(out.a16.noLb && out.a16.bench && /71\.5 kg × 8/.test(out.a16.bench.a) && /72\.5 kg × 8/.test(out.a16.bench.b) && out.a16.bench.chip === '+1 kg' && out.a16.vol.chip.indexOf(out.a16.volExpect + ' kg') === 0,
      '16 kg: ' + JSON.stringify(out.a16));
    assert(out.a16.noKm && out.a16.pace && out.a16.pace.a === '15:17' && out.a16.pace.b === '14:29' && out.a16.pace.chip === '−48 s /mi' && out.a16.pace.up && out.a16.dist.a === '3.11' && out.a16.dist.b === '4.35' && out.a16.dist.chip === '+1.24 mi',
      '16 mi: ' + JSON.stringify([out.a16.pace, out.a16.dist]));
    assert(out.a17.bench && /185 lb × 5/.test(out.a17.bench.a) && /175 lb × 6/.test(out.a17.bench.b) && out.a17.bench.chip === '−10 lb · +1 rep' && !out.a17.bench.up && out.a17.prThen && out.a17.subs.length >= 2,
      '17 base-name match: ' + JSON.stringify(out.a17));
    assert(out.a17.hds.some(h => /ONLY ON AUG 3 · 1/.test(h)) && out.a17.hds.some(h => /ONLY ON AUG 10 · 1/.test(h)) && out.a17.only.some(t => /Dips/.test(t) && /top BW × 10/.test(t)) && out.a17.only.some(t => /Cable Fly/.test(t)),
      '17 only-on sections: ' + JSON.stringify([out.a17.hds, out.a17.only]));
    assert(JSON.stringify(out.a18.picks) === JSON.stringify(out.a18.expect) && /Jul 15/.test(out.a18.tray) && /Jul 21/.test(out.a18.tray), '18 picks survive month nav: ' + JSON.stringify(out.a18));
    assert(out.a20.rings === 2, '20 grid rings: ' + JSON.stringify(out.a20));
    assert(out.a19.afterUnpick.length === 1 && out.a19.replaced[0] === out.a19.p21 && out.a19.replaced[1] === out.a19.p9, '19 unpick / replace second: ' + JSON.stringify(out.a19));
    assert(out.a21.n === 1 && out.a21.hd && /SAT JUL 4 · 1 WORKOUT/.test(out.a21.hd) && out.a21.whole && out.a21.back === 10, '21 day filter: ' + JSON.stringify(out.a21));
    assert(out.a22.gone, '22 a deleted pick is pruned');
    assert(!out.a23.on && !out.a23.tray && /Tap a day to see what you did/.test(out.a23.detail), '23 leaving Progress exits: ' + JSON.stringify(out.a23));
    assert(out.a24.closed && out.a24.focus === 'cmp-go' && out.a24.still && out.a24.one === 1, '24 escape / single overlay: ' + JSON.stringify(out.a24));
    assert(out.a25.up === out.a25.earnedInk && out.a25.disc === out.a25.text && out.a25.sel === out.a25.selTok && out.a25.sel !== 'rgb(216, 255, 99)' && out.a25.bad === 0, '25 Lime room: ' + JSON.stringify(out.a25));
    assert(out.a26.up === 'rgb(79, 112, 0)' && out.a26.sel === out.a26.accent && out.a26.bad === 0, '26 Heavyweight: ' + JSON.stringify(out.a26));
    assert(out.a28.picksAreButtons && out.a28.radios, '28 a11y: ' + JSON.stringify(out.a28));
    assert(app.errors.length === 0, '31 no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('compare two: hidden without two comparable records; dev nav opens the sheet', async () => {
  const one = await boot({ native: true, seed: {
    kt_sessions: JSON.stringify([{ id: 1, date: '2026-07-15', type: 'Push', exercises: [{ name: 'Bench Press', sets: 1, reps: [5], weight: 100 }] }]),
    kt_runs: JSON.stringify([{ id: 2, date: '2026-07-16', type: 'easy', distance: 5, time: '30:00' }]) } });
  try {
    const n = await one.page.evaluate(() => { switchTab('progress'); calYear = 2026; calMonth = 6; render(); return document.querySelectorAll('.kt-vs-btn').length; });
    assert(n === 0, '2 no Compare with one of each: ' + n);
    assert(one.errors.length === 0, 'no page errors: ' + one.errors.join('|'));
  } finally { await one.close(); }
  const dev = await boot({ native: true, seed: { kt_dev_nav: 'progress/compare' } });
  try {
    await dev.page.waitForTimeout(1000);
    const open = await dev.page.evaluate(() => !!document.getElementById('cmpSheetOverlay'));
    assert(open, '29 dev nav progress/compare mounts the sheet');
    assert(dev.errors.length === 0, 'no page errors: ' + dev.errors.join('|'));
  } finally { await dev.close(); }
});
