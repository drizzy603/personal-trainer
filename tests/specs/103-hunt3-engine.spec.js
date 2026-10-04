// Hunt 3 fixes, programme engine and Routines:
// - H02: a working weight swapped or added in a deload week (the new lift's known load, the coach's
//   load) is read against the working week: the deload takes its share and the working weeks start
//   at it (it scaled every later week by working/deload, ~1.45x). A typed weight stays the week's own.
const { boot, assert, run } = require('../lib/harness');

// Week 6 (the demo's current week) as a deload at 70% of week 5, plus a few lifts the owner has
// logged before (known loads), three days ago.
const deloadSetup = () => {
  const cr = getCustomRoutine(), c = currentWeek - 1;
  cr.weeks[c].bName = 'DELOAD';
  ['push', 'pull', 'legs'].forEach(k => (cr.weeks[c][k] || []).forEach(e => {
    const p = (cr.weeks[c - 1][k] || []).find(x => x.name === e.name);
    if (p && p.weight > 0) e.weight = Math.max(2.5, Math.round(p.weight * 0.7 / 2.5) * 2.5);
  }));
  setCustomRoutine(cr);
  const sess = getSessions().slice();
  sess.unshift({ id: 7700, date: addDays(todayISO(), -3), type: 'Push', week: currentWeek - 1, prs: [], exercises: [
    { name: 'Arnold Press', sets: 3, reps: [10, 10, 10], weight: 50, weightLog: [50, 50, 50] },
    { name: 'Cable Fly', sets: 3, reps: [12, 12, 12], weight: 40, weightLog: [40, 40, 40] }] });
  lsSet('kt_sessions', sess);
  return localStorage.getItem('kt_routine');
};

run('H02: a swap or add in a deload week keeps the deload\'s share and starts the working weeks at the load', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async (setupSrc) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const setup = eval('(' + setupSrc + ')');
      const r = {}, c = currentWeek - 1;
      const orig = setup();
      const reset = () => lsSet('kt_routine', JSON.parse(orig));
      const curve = (name) => getCustomRoutine().weeks.map(w => { const x = (w.push || []).find(e => e.name === name); return x ? x.weight : null; });
      const ohp = curve('Overhead Press');
      r.ohp = ohp; r.deload = _isDeloadWk(getCustomRoutine().weeks[c]);
      // Routines: Overhead Press > Change exercise > Arnold Press, weight untouched (its known load)
      openRoutines(); _rtOpenEdit('Push', 'Overhead Press'); _rtEdit.swapTo = 'Arnold Press'; _rtSave(); await wait(20);
      r.rtSwap = curve('Arnold Press');
      // Routines: + Add exercise > Cable Fly (known 40)
      _rtAddPick('Push', 'Cable Fly'); await wait(20);
      r.rtAdd = curve('Cable Fly');
      closeRoutines(); reset();
      // a weight typed in the deload week is that week's own load (the later weeks scale from it)
      openRoutines(); _rtOpenEdit('Push', 'Overhead Press'); _rtEdit.swapTo = 'Arnold Press'; _rtEdit.w = wDisp(35); _rtSave(); await wait(20);
      r.rtTyped = curve('Arnold Press');
      closeRoutines(); reset();
      // the coach's swap, without and with a weight (the coach's loads are working weights)
      r.coachKnown = executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Overhead Press', action: 'swap', rename_to: 'Arnold Press' }).ok && curve('Arnold Press');
      reset();
      r.coachW = executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Overhead Press', action: 'swap', rename_to: 'Arnold Press', weight: 55 }).ok && curve('Arnold Press');
      reset();
      r.coachAdd = executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Cable Fly', action: 'add', sets: 3, reps: 12, weight: 40 }).ok && curve('Cable Fly');
      reset();
      // the runner's "Also update my programme": a rename with the weight untouched
      openDeckRunner('Push'); await wait(30);
      const oi = runnerSession.exercises.findIndex(e => e.name === 'Overhead Press');
      openRunnerExEdit(oi); runnerExEditToggleApply(); _rExEditName = 'Arnold Press'; saveRunnerExEdit(); await wait(30);
      r.runner = curve('Arnold Press');
      closeDeckRunner(); runnerSession = null; localStorage.removeItem('kt_runner_draft');
      return r;
    }, deloadSetup.toString());
    const snap = x => Math.max(2.5, Math.round(x / 2.5) * 2.5);
    const C = 5, o = out.ohp;
    assert(out.deload && o[C] === 70 && o[C + 1] === 102.5, 'week 6 is a 70% deload: ' + JSON.stringify(o));
    // the working weeks follow OHP's shape at the known load; the deload is its share of it
    const workAt = (load) => o.map((p, j) => j < C ? null : (j === C ? snap(o[C] * load / o[C + 1]) : snap(p * load / o[C + 1])));
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    assert(eq(out.rtSwap, workAt(50)) && out.rtSwap[C] === 35 && out.rtSwap[C + 1] === 50, 'Routines swap: deload 35, week 7 at the known 50: ' + JSON.stringify(out.rtSwap));
    assert(out.rtAdd[C] < 40 && out.rtAdd[C + 1] === 40 && out.rtAdd.slice(C + 1).every(x => x >= 40 && x <= 45), 'Routines add: the deload below 40, the working weeks from 40: ' + JSON.stringify(out.rtAdd));
    assert(out.rtTyped[C] === 35 && out.rtTyped[C + 1] === snap(102.5 * 35 / 70), 'a typed deload weight stays the deload\'s own: ' + JSON.stringify(out.rtTyped));
    assert(eq(out.coachKnown, workAt(50)), 'the coach\'s swap without a weight: ' + JSON.stringify(out.coachKnown));
    assert(eq(out.coachW, workAt(55)), 'the coach\'s swap with a weight starts the working weeks at it: ' + JSON.stringify(out.coachW));
    assert(out.coachAdd && out.coachAdd[C] < 40 && out.coachAdd[C + 1] === 40, 'the coach\'s add: ' + JSON.stringify(out.coachAdd));
    assert(eq(out.runner, workAt(50)), 'the runner\'s rename onto the programme: ' + JSON.stringify(out.runner));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
