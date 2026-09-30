// Hunt 2026-09-26 "go" fixes, programme engine (web 20260930-2):
// - A deload week is its own: a working weight (carry forward, +5, the coach's loads) starts at
//   the next working week and leaves the deload as planned; a change to the deload week itself
//   stays in that week. Carried from the deload row it scaled every later week by ~1.42.
// - Carry forward judges a deload session against the working plan.
// - Routines writes only what the owner changed: an untouched kg load (shown rounded to 0.5 kg)
//   or a defaulted RPE is not written, so nothing is re-snapped or marked EDITED.
const { boot, assert, run } = require('../lib/harness');

run('a deload week is its own', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(() => {
      const r = {}, c = currentWeek - 1;
      const cr = getCustomRoutine();
      cr.weeks[c].bName = 'DELOAD';
      cr.weeks[c].push.find(e => e.name === 'Bench Press').weight = 112.5;
      setCustomRoutine(cr);
      const bench = () => getCustomRoutine().weeks.map(w => (w.push.find(e => e.name === 'Bench Press') || {}).weight);
      const before = bench();
      // a deload-week session at the working load is not "above the plan"
      const sess = { id: 5, date: todayISO(), type: 'Push', week: currentWeek, prs: [], exercises: [{ name: 'Bench Press', sets: 4, reps: [8, 8, 8, 8], weight: 160, weightLog: [160, 160, 160, 160] }] };
      r.cand = _carryCandidates(sess).length;
      // carry forward from the deload week starts at the next working week
      carryForward('Push', 'Bench Press', before[c + 1] + 12.5, c);
      const after = bench();
      r.carry = { deload: after[c], next: [before[c + 1], after[c + 1]], later: [before[c + 2], after[c + 2]], wk12: [before[11], after[11]] };
      // the coach's working weight skips the deload too
      executeCoachTool('set_exercise_weight', { name: 'Bench Press', weight: after[c + 1] + 5 });
      const coach = bench();
      r.coach = { deload: coach[c], next: coach[c + 1] };
      // a Routines change to the deload week stays in it
      openRoutines(); _rtOpenEdit('Push', 'Bench Press'); _rtEdit.w = wDisp(120); _rtSave();
      const rt = bench();
      r.routines = { deload: rt[c], next: rt[c + 1] === coach[c + 1] };
      closeRoutines();
      return r;
    });
    assert(out.cand === 0, 'a deload session at the working load is not above the plan');
    assert(out.carry.deload === 112.5 && out.carry.next[1] === out.carry.next[0] + 12.5 && out.carry.later[1] === out.carry.later[0] + 12.5, 'carry starts at the next working week, deload untouched, no scaling: ' + JSON.stringify(out.carry));
    assert(out.coach.deload === 112.5, 'the coach\'s working weight leaves the deload: ' + JSON.stringify(out.coach));
    assert(out.routines.deload === 120 && out.routines.next, 'a Routines change to the deload week stays in it: ' + JSON.stringify(out.routines));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('Routines writes only what the owner changed (kg, RPE)', async () => {
  const app = await boot({ native: true, seed: { kt_unit_w: 'kg' } });
  try {
    const out = await app.page.evaluate(() => {
      const r = {}, c = currentWeek - 1;
      const cr = getCustomRoutine();
      delete cr.weeks[c].push.find(e => e.name === 'Overhead Press').rpe;   // a row with no RPE
      setCustomRoutine(cr);
      const snap = () => localStorage.getItem('kt_routine');
      const s0 = snap();
      openRoutines();
      // open and save without touching anything
      _rtOpenEdit('Push', 'Bench Press'); _rtSave();
      _rtOpenEdit('Push', 'Overhead Press'); _rtSave();
      r.untouched = snap() === s0;
      // a sets-only change leaves the loads as they were
      const loads = JSON.stringify(getCustomRoutine().weeks.map(w => w.push.find(e => e.name === 'Bench Press').weight));
      _rtOpenEdit('Push', 'Bench Press'); _rtStep('sets', 1); _rtSave();
      const after = getCustomRoutine();
      r.setsOnly = { loads: JSON.stringify(after.weeks.map(w => w.push.find(e => e.name === 'Bench Press').weight)) === loads, sets: after.weeks[c].push.find(e => e.name === 'Bench Press').sets };
      r.noRpe = after.weeks[c].push.find(e => e.name === 'Overhead Press').rpe === undefined;
      closeRoutines();
      return r;
    });
    assert(out.untouched, 'opening and saving without a change writes nothing');
    assert(out.setsOnly.loads && out.setsOnly.sets === 5, 'a sets change leaves the kg loads: ' + JSON.stringify(out.setsOnly));
    assert(out.noRpe, 'an RPE the owner never set is not written');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
