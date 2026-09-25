// Routines (web 20260925-7): Settings › Routines shows every lift day as the coach built it; an edit
// carries through the rest of the programme with a live HOW IT CLIMBS preview; the row is marked
// EDITED with the coach's original beside it; Use coach's, Reset day, Add, Remove and Make main all
// go through the programme engine with Undo; empty days offer Build; both rooms; no sideways scroll.
const { boot, assert, run } = require('../lib/harness');

run('Routines: days, edit with preview, marks, coach version, add/remove/main, reset', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1;
      const curve = n => getCustomRoutine().weeks.map(w => { const x = (w.push || []).find(e => e.name === n); return x ? x.sets + 'x' + x.reps + '@' + x.weight : '-'; });
      switchTab('settings'); await wait(20);
      r.settingsRow = /Routines/.test(document.getElementById('screen').textContent);
      openRoutines(); await wait(30);
      r.cards = [...document.querySelectorAll('.kt-rt-card-hd')].map(e => e.textContent);
      r.heading = (document.querySelector('.kt-rt-h') || {}).textContent;
      // edit Bench: 5x5 @ 185 from week 6 on; the preview shows the new and old numbers
      _rtOpenEdit('Push', 'Bench Press'); _rtEdit.w = wDisp(wStore(185)); _rtEdit.sets = 5; _rtEdit.reps = 5; _paintRoutines();
      r.preview = [...document.querySelectorAll('.kt-rt-cell')].slice(0, 2).map(e => e.textContent);
      r.everyChip = !!document.querySelector('.kt-rt-chip[aria-pressed="true"]');
      document.getElementById('rtSave').click(); await wait(60);
      r.after = curve('Bench Press').slice(4);
      const row = [...document.querySelectorAll('.kt-rt-row')].find(x => /Bench Press/.test(x.textContent));
      r.marks = row && row.textContent.replace(/\s+/g, ' ');
      // Use coach's puts it back exactly
      _rtUseCoach('Push', 'Bench Press'); await wait(40);
      r.coach = curve('Bench Press').slice(4); r.noMarks = !getCustomRoutine().weeks.some(w => (w.push || []).some(e => e.rec !== undefined));
      // this week only
      _rtOpenEdit('Push', 'Overhead Press'); _rtEdit.w = wDisp(wStore(110)); _rtEdit.scope = 'only'; _paintRoutines();
      document.getElementById('rtSave').click(); await wait(40);
      r.only = curve('Overhead Press').slice(5, 7);
      // add, make main, remove, then reset the day
      _rtAddPick('Push', 'Cable Fly'); await wait(40);
      r.added = curve('Cable Fly').slice(4, 7);
      _rtOpenEdit('Push', 'Cable Fly'); _rtMakeMain(); await wait(40);
      r.main = getCustomRoutine().weeks[c].push.filter(e => e.isMain).map(e => e.name);
      _commitRoutine(cr => _progRemove(cr, 'push', 'Lateral Raise', c), { scope: 'routines' }); await wait(40);
      r.removedLine = /coach lift removed/.test(document.getElementById('rtSheet').textContent);
      _commitRoutine(cr => _progResetSlot(cr, 'push', c), { scope: 'routines' }); await wait(40);
      const push = getCustomRoutine().weeks[c].push;
      r.reset = { names: push.map(e => e.name).join(','), marks: push.some(e => e.rec !== undefined), mains: push.filter(e => e.isMain).map(e => e.name) };
      // an empty day is listed with Build
      setWeekPlanDay((new Date().getDay() + 6) % 7, 'Arms'); await wait(40);
      r.empty = [...document.querySelectorAll('.kt-rt-card')].some(x => /Arms/.test(x.textContent) && /Build your Arms day/.test(x.textContent));
      r.noOverflow = document.getElementById('rtSheet').scrollWidth <= document.getElementById('rtSheet').clientWidth + 1;
      return r;
    });
    assert(out.settingsRow, 'Settings shows Routines');
    assert(JSON.stringify(out.cards) === JSON.stringify(['PushWED', 'PullTHU', 'LegsSUN']), 'every lift day with its weekdays: ' + JSON.stringify(out.cards));
    assert(/by wk 11/.test(out.heading) && /deload wk 12/.test(out.heading), 'each lift says where it is heading: ' + out.heading);
    assert(/5×5 185/.test(out.preview[0]) && /4×8 160/.test(out.preview[0]) && /5×5 187\.5/.test(out.preview[1]), 'the preview shows new and old: ' + JSON.stringify(out.preview));
    assert(JSON.stringify(out.after) === JSON.stringify(['4x8@157.5', '5x5@185', '5x5@187.5', '5x5@190', '5x5@192.5', '5x5@195', '5x5@197.5', '4x8@187.5']), 'the edit carries forward and keeps the climb: ' + JSON.stringify(out.after));
    assert(/EDITED/.test(out.marks) && /Coach: 4×8 · 160 lb/.test(out.marks) && /Use coach/.test(out.marks), 'the row is marked with the coach original: ' + out.marks);
    assert(JSON.stringify(out.coach) === JSON.stringify(['4x8@157.5', '4x8@160', '4x8@162.5', '4x8@165', '4x8@167.5', '4x8@170', '4x8@172.5', '4x8@175']) && out.noMarks, 'Use coach\'s restores it exactly: ' + JSON.stringify(out.coach));
    assert(JSON.stringify(out.only) === JSON.stringify(['4x8@110', '4x8@102.5']), 'week 6 only: ' + JSON.stringify(out.only));
    assert(out.added[0] === '-' && out.added[1] !== '-' && out.added[2] !== '-', 'added from week 6 on: ' + JSON.stringify(out.added));
    assert(JSON.stringify(out.main) === '["Cable Fly"]', 'make main moves the tag: ' + JSON.stringify(out.main));
    assert(out.removedLine, 'a removed coach lift can be restored');
    assert(!out.reset.marks && out.reset.names.indexOf('Cable Fly') < 0 && out.reset.names.indexOf('Lateral Raise') >= 0 && JSON.stringify(out.reset.mains) === '["Bench Press"]', 'reset puts the day back: ' + JSON.stringify(out.reset));
    assert(out.empty, 'an empty day is listed with Build');
    assert(out.noOverflow, 'no sideways scroll');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('Routines at 320 pt and 125% text, both rooms: no sideways scroll', async () => {
  for (const room of ['heavyweight', 'dark']) {
    const app = await boot({ native: true, seed: { kt_theme: room } });
    try {
      await app.page.setViewportSize({ width: 320, height: 568 });
      const out = await app.page.evaluate(async () => {
        document.documentElement.style.zoom = '1.25';
        openRoutines(); const sh = document.getElementById('rtSheet');
        const a = sh.scrollWidth <= sh.clientWidth + 1;
        _rtOpenEdit('Push', 'Bench Press'); _rtEdit.w += 10; _paintRoutines();
        return { days: a, edit: sh.scrollWidth <= sh.clientWidth + 1 };
      });
      assert(out.days && out.edit, room + ': no sideways scroll at 320@125%: ' + JSON.stringify(out));
    } finally { await app.close(); }
  }
});

run('an edit to the plan is not shown as an earned gain', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const c = currentWeek - 1;
      const delta = () => { switchTab('progress'); setProgressTab('lifts'); const row = [...document.querySelectorAll('.lift-row')].find(r => /Bench/.test(r.textContent)); return row ? (row.querySelector('.lift-delta') || {}).textContent || '' : 'none'; };
      const before = delta();
      _commitRoutine(cr => _progCarryLoad(cr, 'push', 'Bench Press', c, 230, { markOwner: true })); await wait(30);
      const after = delta();
      return { before, after };
    });
    assert(out.after === out.before, 'raising the plan does not show as an earned gain: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
