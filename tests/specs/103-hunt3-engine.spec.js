// Hunt 3 fixes, programme engine and Routines:
// - H02: a working weight swapped or added in a deload week (the new lift's known load, the coach's
//   load) is read against the working week: the deload takes its share and the working weeks start
//   at it (it scaled every later week by working/deload, ~1.45x). A typed weight stays the week's own.
// - H09: "Week N only" holds for a swap in Routines, and the coach's only_this_week holds for swap,
//   add and remove (they rewrote every later week while the toast and the coach said "that week only");
//   a change for that week alone keeps the owner's marks on the later weeks.
// - M12 + L09: the coach's add of a lift the owner removed brings it back at the sets, reps and
//   load the call asked for (it came back as before while the chat reported the new numbers), and
//   the coach's own adds and removes are the programme's version: not "[added by the user]", not
//   undone by Reset, not kept out of a later rebuild.
const { boot, assert, run } = require('../lib/harness');

// One browser at a time: each suite boots its own.
let queue = Promise.resolve();
const seq = (name, fn) => { const p = queue.then(fn); queue = p.catch(() => {}); run(name, () => p); };

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

seq('H02: a swap or add in a deload week keeps the deload\'s share and starts the working weeks at the load', async () => {
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

seq('H09: "week N only" holds for a Routines swap and for the coach\'s swap, add and remove', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1;
      const orig = localStorage.getItem('kt_routine');
      const reset = () => lsSet('kt_routine', JSON.parse(orig));
      const has = (name) => getCustomRoutine().weeks.map(w => (w.push || []).some(e => e.name === name) ? 1 : 0).join('');
      // Routines: Overhead Press > Week 6 only > Change exercise > Arnold Press > Save
      openRoutines(); _rtOpenEdit('Push', 'Overhead Press'); _rtSet('scope', 'only'); _rtEdit.swapTo = 'Arnold Press'; _paintRoutines();
      r.cells = document.querySelectorAll('#rtSheet .kt-rt-cell').length;
      _rtSave(); await wait(20);
      r.toast = (document.getElementById('toast') || {}).textContent || '';
      r.rt = { arnold: has('Arnold Press'), ohp: has('Overhead Press') };
      r.rtRec = ((getCustomRoutine().weeks[c].push.find(e => e.name === 'Arnold Press') || {}).rec || {}).name;
      _rtUseCoach('Push', 'Arnold Press'); await wait(20);
      r.rtBack = has('Overhead Press');
      closeRoutines(); reset();
      // the coach, that week only
      const sw = executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Overhead Press', action: 'swap', rename_to: 'Arnold Press', only_this_week: true });
      r.swap = { ok: sw.ok, msg: sw.message, arnold: has('Arnold Press'), ohp: has('Overhead Press') };
      reset();
      const ad = executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Cable Fly', action: 'add', sets: 3, reps: 12, weight: 40, only_this_week: true });
      r.add = { ok: ad.ok, msg: ad.message, fly: has('Cable Fly'), w: (getCustomRoutine().weeks[c].push.find(e => e.name === 'Cable Fly') || {}).weight };
      reset();
      const rm = executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Lateral Raise', action: 'remove', only_this_week: true });
      r.rem = { ok: rm.ok, msg: rm.message, lr: has('Lateral Raise') };
      reset();
      // a change for that week alone keeps the owner's marks on the later weeks
      _commitRoutine(cr => _progCarryLoad(cr, 'push', 'Bench Press', c, 185, { markOwner: true }));
      executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Bench Press', action: 'change', sets: 5, only_this_week: true });
      const cr = getCustomRoutine(), b6 = cr.weeks[c].push.find(e => e.name === 'Bench Press'), b7 = cr.weeks[c + 1].push.find(e => e.name === 'Bench Press');
      r.change = { rec6: b6.rec !== undefined, rec7: !!(b7.rec && b7.rec.weight === 162.5), sets: [b6.sets, b7.sets] };
      return r;
    });
    const only6 = '000001000000', but6 = '111110111111';
    assert(out.cells === 1, 'the preview shows the one week: ' + out.cells);
    assert(/updated for week 6/.test(out.toast), 'the toast says week 6: ' + out.toast);
    assert(out.rt.arnold === only6 && out.rt.ohp === but6 && out.rtRec === 'Overhead Press', 'Routines: the swap is week 6 alone, marked with the coach\'s lift: ' + JSON.stringify([out.rt, out.rtRec]));
    assert(out.rtBack === '111111111111', 'Use coach\'s puts Overhead Press back in week 6: ' + out.rtBack);
    assert(out.swap.ok && /that week only/.test(out.swap.msg) && out.swap.arnold === only6 && out.swap.ohp === but6, 'the coach\'s swap, that week only: ' + JSON.stringify(out.swap));
    assert(out.add.ok && /that week only/.test(out.add.msg) && out.add.fly === only6 && out.add.w === 40, 'the coach\'s add, that week only: ' + JSON.stringify(out.add));
    assert(out.rem.ok && /that week only/.test(out.rem.msg) && out.rem.lr === but6, 'the coach\'s remove, that week only: ' + JSON.stringify(out.rem));
    assert(!out.change.rec6 && out.change.rec7 && out.change.sets[0] === 5 && out.change.sets[1] === 4, 'a change for week 6 alone keeps week 7\'s owner mark: ' + JSON.stringify(out.change));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// per week from this one: sets x reps @ load, + = added by the owner, * = edited by the owner
const serSrc = `(k, n) => getCustomRoutine().weeks.slice(currentWeek - 1).map(w => { const e = (w[k] || []).find(x => x.name === n); return e ? e.sets + 'x' + e.reps + '@' + e.weight + (e.rec === null ? '+' : e.rec ? '*' : '') : '-'; })`;

seq('M12 + L09: the coach\'s add brings a removed lift back at its numbers; the coach\'s adds and removes are the programme\'s', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async (serSrc) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1, ser = eval(serSrc);
      const orig = localStorage.getItem('kt_routine');
      const reset = () => lsSet('kt_routine', JSON.parse(orig));
      const removed = (k, j) => ((getCustomRoutine().weeks[j == null ? c : j].recOut || {})[k] || []).map(e => e.row.name);
      const ownerRemoves = async (slot, name) => {
        openRoutines(); _rtOpenEdit(slot, name); _rtRemove(); await wait(10);
        document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(20); closeRoutines();
      };
      r.coachLR = ser('push', 'Lateral Raise');
      // the owner removes Lateral Raise; the coach adds it back at 4x12 @ 25 (any casing)
      await ownerRemoves('Push', 'Lateral Raise');
      r.removed = ser('push', 'Lateral Raise').join('') === '-------' && removed('push').join() === 'Lateral Raise';
      const a = executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'lateral raise', action: 'add', sets: 4, reps: 12, weight: 25 });
      r.add = { ok: a.ok, s0: a.series && a.series[0], lr: ser('push', 'Lateral Raise'), out: removed('push') };
      reset();
      // without numbers it comes back as the coach wrote it
      await ownerRemoves('Push', 'Lateral Raise');
      executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Lateral Raise', action: 'add' });
      r.plain = ser('push', 'Lateral Raise');
      reset();
      // for that week only: the later weeks stay removed (and restorable)
      await ownerRemoves('Push', 'Lateral Raise');
      executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Lateral Raise', action: 'add', sets: 4, reps: 12, weight: 25, only_this_week: true });
      r.only = { lr: ser('push', 'Lateral Raise'), later: removed('push', c + 1).join() };
      reset();
      // L09: the coach adds Cable Fly and removes Face Pull
      executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Cable Fly', action: 'add', sets: 3, reps: 12, weight: 40 });
      executeCoachTool('edit_programme_exercise', { day: 'Pull', exercise: 'Face Pull', action: 'remove' });
      r.fly = ser('push', 'Cable Fly');
      r.fpOut = removed('pull');
      r.changes = _rtChanges(getCustomRoutine(), c);
      r.promptAdded = /Cable Fly: [^\n]*added by the user/.test(buildSystemPrompt());
      _commitRoutine(cr => _progResetSlot(cr, 'push', c) + _progResetSlot(cr, 'pull', c));
      r.afterReset = { fly: ser('push', 'Cable Fly')[0], fp: ser('pull', 'Face Pull')[0] };
      // a later rebuild that puts Face Pull back is the coach's to make
      const pull = getCustomRoutine().weeks[c].pull.map(e => ({ name: e.name, sets: e.sets, reps: e.reps, weight: e.weight, isMain: !!e.isMain })).concat([{ name: 'Face Pull', sets: 3, reps: 15, weight: 35 }]);
      const rb = executeCoachTool('update_routine_weeks', { weeks: [{ wk: currentWeek, bName: 'BUILD', bColor: '#0a43f5', pull }] });
      r.rebuild = { ok: rb.ok, kept: rb.keptUserEdits, fp: ser('pull', 'Face Pull')[0] };
      return r;
    }, serSrc);
    const last = out.coachLR.length - 1;
    assert(out.coachLR.every(x => x === '3x15@17.5') && out.removed, 'the owner removed the coach\'s 3x15 @ 17.5: ' + JSON.stringify(out.coachLR));
    // the seed's last week is a deload: it keeps its own reps (its load follows by e1RM)
    assert(out.add.ok && out.add.s0 === 'wk6 4×12 25 lb' && out.add.lr.slice(0, last).every(x => x === '4x12@25') && /^3x15@\d/.test(out.add.lr[last]) && !out.add.out.length,
      'the coach\'s add brings it back at 4x12 @ 25, unmarked, and clears the removal: ' + JSON.stringify(out.add));
    assert(out.plain.every(x => x === '3x15@17.5'), 'an add without numbers brings back the coach\'s row: ' + JSON.stringify(out.plain));
    assert(out.only.lr[0] === '4x12@25' && out.only.lr.slice(1).every(x => x === '-') && out.only.later === 'Lateral Raise', 'that week only: ' + JSON.stringify(out.only));
    assert(out.fly[0] === '3x12@40' && out.fly.every(x => /^\d+x\d+@\d/.test(x) && !/[+*]/.test(x)), 'the coach\'s Cable Fly is not the owner\'s add: ' + JSON.stringify(out.fly));
    assert(!out.fpOut.length && out.changes === 0 && !out.promptAdded, 'the coach\'s removal is not kept for Restore and counts as no change by the owner: ' + JSON.stringify([out.fpOut, out.changes, out.promptAdded]));
    assert(out.afterReset.fly === '3x12@40' && out.afterReset.fp === '-', 'Reset keeps the coach\'s add and remove: ' + JSON.stringify(out.afterReset));
    assert(out.rebuild.ok && !(out.rebuild.kept || []).length && /^3x15@35/.test(out.rebuild.fp), 'a later rebuild puts Face Pull back: ' + JSON.stringify(out.rebuild));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
