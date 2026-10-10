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
// - M13: Use coach's on a swapped lift whose original the owner added back keeps one copy (the day
//   held it twice and the runner logged both cards as one lift); a row renamed to it is refused.
// - M14: removing the main lift hands its tag on as the owner's change, and Restore, Reset, adding
//   it back and Use coach's (after Make main) give back one main, the coach's, first on the day; a
//   removed superset partner comes back paired; rows come back where they were.
// - M15 + L41: Restore brings back each week's own removed rows (it added a block's lift to every
//   later week as an ADDED row with no load), and a removed lift back on the day under that name
//   (a swap onto it) is not offered for a Restore that did nothing; Reset still has it.
// - M16: an owner's swap onto a lift the coach brings in later keeps the coach's original it drops
//   in those weeks, so Reset and Use coach's give it back (it was gone for good).
// - M45: Undo on a Routines change repaints an open Routines sheet (it kept showing the undone
//   edit, with links that acted on a programme that was gone).
// - M46: a day with every lift removed keeps its Restore and Reset (only Build was offered), and an
//   emptied day that is not on the schedule stays on the sheet.
// - M11: the launch plate sweep leaves a programme that reads as kg on the kg grid when the app is
//   in lb (one launch in lb moved every load onto the lb grid for good); stray fractional loads go
//   to the kg grid there, and an lb programme still sweeps onto 2.5 lb plates.
// - L11: Today's carry card offers each lift logged above the plan in turn (carrying the first
//   marked the session done and the second was never offered).
// - L42 + L43: the Routines editor reads "weight changed" from what it opened with (an untouched kg
//   row offered THE COACH HELD THIS FLAT), and its steppers never move against the press on a row
//   outside their range (RPE 4 "Less" gave 5, 12 sets "More" gave 10).
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

seq('M13: Use coach\'s never puts the same lift on a day twice', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1;
      const orig = localStorage.getItem('kt_routine');
      const coachDay = getCustomRoutine().weeks[c].push.map(e => e.name).join('|');
      const count = (n) => getCustomRoutine().weeks.slice(c).map(w => (w.push || []).filter(e => e.name === n).length).join('');
      // swap Overhead Press for Arnold Press, add Overhead Press back, then Use coach's on Arnold
      openRoutines();
      _rtOpenEdit('Push', 'Overhead Press'); _rtEdit.swapTo = 'Arnold Press'; _rtSave(); await wait(10);
      _rtAddPick('Push', 'Overhead Press'); await wait(10);
      _rtUseCoach('Push', 'Arnold Press'); await wait(10);
      r.ohp = count('Overhead Press'); r.arnold = count('Arnold Press');
      r.day = getCustomRoutine().weeks[c].push.map(e => e.name + (e.rec !== undefined ? '*' : '')).join('|');
      closeRoutines();
      openDeckRunner('Push'); await wait(20);
      r.cards = runnerSession.exercises.filter(e => e.name === 'Overhead Press').length;
      closeDeckRunner(); runnerSession = null; localStorage.removeItem('kt_runner_draft');
      lsSet('kt_routine', JSON.parse(orig));
      // the coach's lift on the day as another changed row: refused, nothing written
      openRoutines();
      _rtOpenEdit('Push', 'Overhead Press'); _rtEdit.swapTo = 'Arnold Press'; _rtSave(); await wait(10);
      _rtOpenEdit('Push', 'Lateral Raise'); _rtEdit.swapTo = 'Overhead Press'; _rtSave(); await wait(10);
      const s0 = localStorage.getItem('kt_routine');
      _rtUseCoach('Push', 'Arnold Press'); await wait(10);
      r.refused = { same: localStorage.getItem('kt_routine') === s0, toast: (document.getElementById('toast') || {}).textContent };
      closeRoutines();
      return { r, coachDay };
    });
    const { r, coachDay } = out;
    assert(r.ohp === '1111111' && r.arnold === '0000000' && r.day === coachDay, 'one Overhead Press a week, the coach\'s day back: ' + JSON.stringify(r));
    assert(r.cards === 1, 'the runner shows one Overhead Press card: ' + r.cards);
    assert(r.refused.same && /Overhead Press is already on Push/.test(r.refused.toast), 'a row renamed to the coach\'s lift is changed first: ' + JSON.stringify(r.refused));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

seq('M14: Restore, Reset and Use coach\'s give back the coach\'s day: the main lift first and alone, the superset paired', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1;
      // the coach supersets Incline Dumbbell Press with Cable Triceps Pushdown
      const cr0 = getCustomRoutine(); cr0.weeks.forEach(w => { w.push.find(e => e.name === 'Incline Dumbbell Press').ss = true; }); setCustomRoutine(cr0);
      const orig = localStorage.getItem('kt_routine');
      const reset = () => { closeRoutines(); lsSet('kt_routine', JSON.parse(orig)); };
      // ! = main, ~ = superset opener, + = added by the owner, * = edited by the owner
      const day = (j) => getCustomRoutine().weeks[j == null ? c : j].push.map(e => e.name + (e.isMain ? '!' : '') + (e.ss ? '~' : '') + (e.rec === null ? '+' : e.rec ? '*' : '')).join(' | ');
      const remove = async (n) => { openRoutines(); _rtOpenEdit('Push', n); _rtRemove(); await wait(5); document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(10); };
      const resetPush = () => _commitRoutine(cr => _progResetSlot(cr, 'push', c));
      r.coach = day(); r.coach12 = day(11);
      // the main lift removed: its tag goes on, marked; Restore, Reset and adding it back give it back
      await remove('Bench Press');
      r.removed = day();
      r.line = [...document.querySelectorAll('#rt-card-Push .kt-rt-coach')].map(d => d.textContent).join(' / ');
      _rtRestoreRemoved('Push'); await wait(10);
      r.restored = [day(), day(11)]; reset();
      await remove('Bench Press'); resetPush(); r.reset = day(); reset();
      await remove('Bench Press'); _rtAddPick('Push', 'Bench Press'); await wait(10); r.addBack = day(); reset();
      // the superset's second half removed: Restore and Reset pair it again
      await remove('Cable Triceps Pushdown'); r.unpaired = day();
      _rtRestoreRemoved('Push'); await wait(10); r.ssRestore = day(); reset();
      await remove('Cable Triceps Pushdown'); resetPush(); r.ssReset = day(); reset();
      // two removed one after the other: Reset puts each where it was
      await remove('Overhead Press'); await remove('Incline Dumbbell Press'); resetPush(); r.two = day(); reset();
      // Make main, then Use coach's on either lift: one main, the coach's
      openRoutines(); _rtOpenEdit('Push', 'Overhead Press'); _rtMakeMain(); await wait(5);
      _rtUseCoach('Push', 'Overhead Press'); await wait(5); r.mmOhp = day(); reset();
      openRoutines(); _rtOpenEdit('Push', 'Overhead Press'); _rtMakeMain(); await wait(5);
      _rtUseCoach('Push', 'Bench Press'); await wait(5); r.mmBench = day(); reset();
      return r;
    });
    const C = out.coach;
    assert(C === 'Bench Press! | Overhead Press | Incline Dumbbell Press~ | Cable Triceps Pushdown | Lateral Raise', 'the coach\'s day: ' + C);
    assert(out.removed === 'Overhead Press!* | Incline Dumbbell Press~ | Cable Triceps Pushdown | Lateral Raise' && /not main/.test(out.line), 'the handed-on tag is the owner\'s change: ' + JSON.stringify([out.removed, out.line]));
    assert(out.restored[0] === C && out.restored[1] === out.coach12, 'Restore: Bench first and the only main lift, in every week: ' + JSON.stringify(out.restored));
    assert(out.reset === C, 'Reset: one main lift: ' + out.reset);
    assert(out.addBack === C, 'adding the removed lift back puts it where it was: ' + out.addBack);
    assert(out.unpaired === 'Bench Press! | Overhead Press | Incline Dumbbell Press | Lateral Raise', 'the opener is unpaired while its partner is out: ' + out.unpaired);
    assert(out.ssRestore === C && out.ssReset === C, 'Restore and Reset pair the superset again: ' + JSON.stringify([out.ssRestore, out.ssReset]));
    assert(out.two === C, 'two removals come back where they were: ' + out.two);
    assert(out.mmOhp === C && out.mmBench === C, 'Use coach\'s after Make main leaves one main lift, the coach\'s: ' + JSON.stringify([out.mmOhp, out.mmBench]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

seq('M15 + L41: Restore brings back only what each week had; a lift back on the day under that name is not offered', async () => {
  // The coach: Lateral Raise in weeks 1-8, Cable Fly in its place from week 9.
  const r0 = JSON.parse(require('../lib/harness').SEED.kt_routine);
  r0.weeks.forEach((w, i) => { if (i >= 8) Object.assign(w.push.find(e => e.name === 'Lateral Raise'), { name: 'Cable Fly', weight: 40, sets: 3, reps: 12 }); });
  const app = await boot({ native: true, seed: { kt_routine: JSON.stringify(r0) } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1;
      const orig = localStorage.getItem('kt_routine');
      const acc = () => getCustomRoutine().weeks.slice(c).map(w => w.push.filter(e => /Lateral|Fly/.test(e.name)).map(e => e.name + '@' + e.weight + (e.rec === null ? '+' : '')).join('/')).join(' ');
      const line = () => { const l = [...document.querySelectorAll('#rt-card-Push .kt-rt-coach')].find(d => /removed/.test(d.textContent)); return l ? l.textContent : ''; };
      const remove = async (n) => { _rtOpenEdit('Push', n); _rtRemove(); await wait(5); document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(10); };
      r.coach = acc();
      openRoutines(); await remove('Lateral Raise');
      r.removed = acc(); r.line = line();
      _rtRestoreRemoved('Push'); await wait(10);
      r.restored = acc(); r.lineAfter = line();
      closeRoutines(); lsSet('kt_routine', JSON.parse(orig));
      // L41: Overhead Press removed, then Incline Dumbbell Press changed to Overhead Press
      const day = () => getCustomRoutine().weeks[c].push.map(e => e.name).join(' | ');
      const coachDay = day();
      openRoutines(); await remove('Overhead Press');
      _rtOpenEdit('Push', 'Incline Dumbbell Press'); _rtEdit.swapTo = 'Overhead Press'; _rtSave(); await wait(10);
      r.swapped = { line: line(), changes: _rtChanges(getCustomRoutine(), c), reset: !!document.querySelector('#rt-card-Push .kt-rt-reset') };
      document.querySelector('#rt-card-Push .kt-rt-reset').click(); await wait(5);
      document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(10);
      r.reset = day() === coachDay;
      closeRoutines();
      return r;
    });
    const coach = 'Lateral Raise@17.5 Lateral Raise@17.5 Lateral Raise@17.5 Cable Fly@40 Cable Fly@40 Cable Fly@40 Cable Fly@40';
    assert(out.coach === coach, 'the coach\'s block accessories: ' + out.coach);
    assert(out.removed === '   Cable Fly@40 Cable Fly@40 Cable Fly@40 Cable Fly@40' && /1 coach lift removed/.test(out.line), 'removed from week 6 on: ' + JSON.stringify([out.removed, out.line]));
    assert(out.restored === coach && !out.lineAfter, 'Restore puts it back in weeks 6-8 only, nothing added to the Cable Fly weeks: ' + JSON.stringify([out.restored, out.lineAfter]));
    assert(!out.swapped.line && out.swapped.changes === 1 && out.swapped.reset, 'a removed lift back on the day by a swap is not offered for Restore: ' + JSON.stringify(out.swapped));
    assert(out.reset, 'Reset still gives back the coach\'s day');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

seq('M16: a swap onto a lift the coach brings in later keeps the coach\'s original for Reset and Use coach\'s', async () => {
  // The coach: Overhead Press every week, Arnold Press beside it from week 9.
  const r0 = JSON.parse(require('../lib/harness').SEED.kt_routine);
  r0.weeks.forEach((w, i) => { if (i >= 8) { const at = w.push.findIndex(e => e.name === 'Overhead Press'); w.push.splice(at + 1, 0, { name: 'Arnold Press', sets: 3, reps: 10, weight: 45 }); } });
  const app = await boot({ native: true, seed: { kt_routine: JSON.stringify(r0) } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1;
      const orig = localStorage.getItem('kt_routine');
      const has = (n) => getCustomRoutine().weeks.slice(c).map(w => w.push.some(e => e.name === n) ? 1 : 0).join('');
      const days = () => JSON.stringify(getCustomRoutine().weeks.slice(c).map(w => w.push));
      const coach = days();
      const swap = async () => { openRoutines(); _rtOpenEdit('Push', 'Overhead Press'); _rtEdit.swapTo = 'Arnold Press'; _rtSave(); await wait(10); };
      await swap();
      r.swapped = has('Overhead Press');
      document.querySelector('#rt-card-Push .kt-rt-reset').click(); await wait(5);
      document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(10);
      r.reset = days() === coach;
      closeRoutines(); lsSet('kt_routine', JSON.parse(orig));
      await swap();
      _rtUseCoach('Push', 'Arnold Press'); await wait(10);
      r.useCoach = days() === coach;
      closeRoutines(); lsSet('kt_routine', JSON.parse(orig));
      // the coach's own swap is the programme's version: nothing is kept
      executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Overhead Press', action: 'swap', rename_to: 'Arnold Press' });
      r.coachKept = getCustomRoutine().weeks.some(w => !!(w.recOut && w.recOut.push));
      return r;
    });
    assert(out.swapped === '0000000', 'Overhead Press swapped out from week 6 on: ' + out.swapped);
    assert(out.reset && out.useCoach, 'Reset and Use coach\'s give back the coach\'s weeks, Overhead Press in 9-12 too: ' + JSON.stringify(out));
    assert(!out.coachKept, 'the coach\'s swap keeps nothing for Restore');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

seq('M45: Undo on a Routines change repaints the open sheet', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1;
      const card = (s) => ((document.getElementById('rt-card-' + s) || {}).textContent || '').replace(/\s+/g, ' ');
      const undo = async () => { document.querySelector('#toast .kt-toast-undo').click(); await wait(10); };
      openRoutines();
      _rtOpenEdit('Push', 'Bench Press'); _rtEdit.w = wDisp(185); _rtSave(); await wait(10);
      r.saved = /EDITED/.test(card('Push')) && /185/.test(card('Push'));
      await undo();
      r.undone = { stored: getCustomRoutine().weeks[c].push[0].weight, edited: /EDITED|Use coach|185/.test(card('Push')), list: !!document.getElementById('rt-card-Push') };
      // an editor opened before the Undo goes back to the day list
      _rtOpenEdit('Push', 'Bench Press'); _rtEdit.w = wDisp(185); _rtSave(); await wait(10);
      _rtOpenEdit('Push', 'Bench Press'); await undo();
      r.undoneEditing = { stored: getCustomRoutine().weeks[c].push[0].weight, edited: /EDITED|Use coach|185/.test(card('Push')), list: !!document.getElementById('rt-card-Push') };
      _rtAddPick('Push', 'Cable Fly'); await wait(10); await undo();
      r.add = /Cable Fly|ADDED/.test(card('Push'));
      _rtOpenEdit('Push', 'Lateral Raise'); _rtRemove(); await wait(5); document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(10);
      r.removed = /coach lift removed/.test(card('Push'));
      await undo();
      r.remove = { back: /Lateral Raise/.test(card('Push')), line: /removed/.test(card('Push')) };
      closeRoutines();
      return r;
    });
    assert(out.saved, 'the edit shows on the sheet');
    assert(out.undone.stored === 160 && !out.undone.edited && out.undone.list, 'after Undo the sheet shows the programme as it is again: ' + JSON.stringify(out.undone));
    assert(out.undoneEditing.stored === 160 && !out.undoneEditing.edited && out.undoneEditing.list, 'an editor open at the Undo goes back to the days: ' + JSON.stringify(out.undoneEditing));
    assert(!out.add, 'an undone add leaves no ghost row');
    assert(out.removed && out.remove.back && !out.remove.line, 'an undone remove shows the lift again: ' + JSON.stringify(out.remove));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

seq('M46: a day with every lift removed still offers Restore and Reset', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1;
      // the coach also wrote an Arms day that is not on the schedule
      const cr0 = getCustomRoutine(); cr0.weeks.forEach(w => { w.arms = [{ name: 'Barbell Curl', sets: 3, reps: 10, weight: 60, isMain: true }, { name: 'Hammer Curl', sets: 3, reps: 12, weight: 30 }]; }); setCustomRoutine(cr0);
      const day = (k) => getCustomRoutine().weeks[c][k].map(e => e.name + (e.isMain ? '!' : '') + (e.rec !== undefined ? '*' : '')).join(' | ');
      const coachLegs = day('legs'), coachArms = day('arms');
      const card = (s) => document.getElementById('rt-card-' + s);
      const removeAll = async (k, slot) => {
        for (const n of getCustomRoutine().weeks[c][k].map(e => e.name)) { _rtOpenEdit(slot, n); _rtRemove(); await wait(5); document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(10); }
      };
      openRoutines();
      await removeAll('legs', 'Legs'); await removeAll('arms', 'Arms');
      const links = (s) => { const el = card(s); return el ? [...el.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /Restore|Reset|Build/.test(t)) : null; };
      r.legs = { left: getCustomRoutine().weeks[c].legs.length, links: links('Legs') };
      r.arms = links('Arms');
      [...card('Legs').querySelectorAll('.kt-rt-link')].find(b => /Restore/.test(b.textContent)).click(); await wait(10);
      r.legsBack = day('legs') === coachLegs;
      card('Arms').querySelector('.kt-rt-reset').click(); await wait(5);
      document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(10);
      r.armsBack = day('arms') === coachArms;
      closeRoutines();
      return r;
    });
    assert(out.legs.left === 0 && JSON.stringify(out.legs.links) === '["Restore","Build your Legs day","Reset Legs to the coach\u2019s version"]', 'the emptied Legs day offers Restore and Reset beside Build: ' + JSON.stringify(out.legs));
    assert(out.arms && out.arms.indexOf('Restore') >= 0, 'an emptied day that is not scheduled stays on the sheet: ' + JSON.stringify(out.arms));
    assert(out.legsBack && out.armsBack, 'Restore and Reset bring the coach\'s days back: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

seq('M11: a launch in lb leaves a kg owner\'s programme on the kg plate grid', async () => {
  const { SEED } = require('../lib/harness');
  const LB = 2.2046226218, kgGrid = (lb) => Math.round(Math.max(1.25, Math.round(lb / LB / 1.25) * 1.25) * LB * 10) / 10;
  // the demo programme as a kg owner's coach wrote it (1.25 kg plates, stored in lb)
  const kgR = JSON.parse(SEED.kt_routine);
  kgR.weeks.forEach(w => ['push', 'pull', 'legs'].forEach(k => (w[k] || []).forEach(e => { if (e.weight > 0) e.weight = kgGrid(e.weight); })));
  const loads = (r) => r.weeks.map(w => ['push', 'pull', 'legs'].map(k => (w[k] || []).map(e => e.weight).join(',')).join(';')).join('|');
  const launch = async (routine, unit) => {
    const app = await boot({ native: true, seed: { kt_routine: JSON.stringify(routine), kt_unit_w: unit } });
    try {
      const out = await app.page.evaluate(() => ({ r: getCustomRoutine() }));
      assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
      return out;
    } finally { await app.close(); }
  };
  const inLb = await launch(kgR, 'lb');
  assert(loads(inLb.r) === loads(kgR), 'nothing moved on a launch in lb');
  const backInKg = await launch(inLb.r, 'kg');
  assert(loads(backInKg.r) === loads(kgR), 'back in kg every load reads as the coach wrote it');
  // a stray fractional load in a kg programme goes to the kg grid; an lb programme still sweeps to 2.5 lb
  const kgF = JSON.parse(JSON.stringify(kgR)); kgF.weeks[6].push[0].weight = 151.3;
  const fixedKg = await launch(kgF, 'lb');
  assert(fixedKg.r.weeks[6].push[0].weight === kgGrid(151.3) && loads(fixedKg.r).split('|')[5] === loads(kgR).split('|')[5], 'a fractional load in a kg programme snaps to 1.25 kg: ' + fixedKg.r.weeks[6].push[0].weight);
  const demo = await launch(JSON.parse(SEED.kt_routine), 'lb');
  assert(demo.r.weeks.every(w => ['push', 'pull', 'legs'].every(k => (w[k] || []).every(e => !(e.weight > 0) || Math.abs(Math.round(e.weight / 2.5) * 2.5 - e.weight) < 0.01))), 'an lb programme still sweeps onto 2.5 lb plates');
  // a stray load that happens to sit on the kg grid (102 lb = 46.25 kg) in an lb programme
  const stray = JSON.parse(JSON.stringify(demo.r)); stray.weeks[6].push[1].weight = 102;
  const strayOut = await launch(stray, 'lb');
  assert(strayOut.r.weeks[6].push[1].weight === 102.5, 'a stray in an lb programme still snaps to 2.5 lb: ' + strayOut.r.weeks[6].push[1].weight);
});

seq('L11: Today offers every lift logged above the plan, one after the other', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, w = getCustomRoutine().weeks[currentWeek - 1].push;
      const plan = (n) => w.find(e => e.name === n).weight;
      const b = plan('Bench Press') + 10, o = plan('Overhead Press') + 10;
      // yesterday's Push (a wrist session never opens the COMPLETE sheet): both lifts a plate or more over
      const sess = getSessions().slice();
      sess.unshift({ id: 8800, date: addDays(todayISO(), -1), type: 'Push', week: currentWeek, prs: [], exercises: [
        { name: 'Bench Press', sets: 4, reps: [8, 8, 8, 8], weight: b, weightLog: [b, b, b, b] },
        { name: 'Overhead Press', sets: 4, reps: [8, 8, 8, 8], weight: o, weightLog: [o, o, o, o] }] });
      lsSet('kt_sessions', sess);
      switchTab('log'); promoteTodayItem('carry'); await wait(20);
      const card = () => { const el = [...document.querySelectorAll('.kt-resume-banner')].find(x => /MORE THAN THE PLAN/.test(x.textContent)); return el ? el.querySelector('.kt-resume-ttl').textContent : ''; };
      const carry = async () => { [...document.querySelectorAll('.kt-resume-banner .kt-resume-cta')].find(x => x.dataset.n).click(); await wait(20); promoteTodayItem('carry'); await wait(20); };
      r.first = card();
      await carry();
      r.second = card();
      await carry();
      r.after = card();
      const now = getCustomRoutine().weeks[currentWeek - 1].push;
      r.loads = [now.find(e => e.name === 'Bench Press').weight === b, now.find(e => e.name === 'Overhead Press').weight === o];
      r.seen = _carrySeen().indexOf(8800) >= 0;
      return r;
    });
    assert(/^Bench Press went/.test(out.first) && /^Overhead Press went/.test(out.second), 'Bench first, then Overhead Press: ' + JSON.stringify(out));
    assert(!out.after && out.loads.every(Boolean) && out.seen, 'both carried, then the card goes: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

seq('L42 + L43: the Routines editor: no flat-row chips on an untouched kg row; steppers never move the wrong way', async () => {
  const app = await boot({ native: true, seed: { kt_unit_w: 'kg' } });
  try {
    const out = await app.page.evaluate(async () => {
      const r = {}, c = currentWeek - 1;
      // a coach deload-style row at RPE 4 and a 12-set row
      const cr0 = getCustomRoutine(); cr0.weeks.forEach(w => { w.push.find(e => e.name === 'Cable Triceps Pushdown').rpe = 4; w.push.find(e => e.name === 'Incline Dumbbell Press').sets = 12; }); setCustomRoutine(cr0);
      const sheet = () => document.getElementById('rtSheet').textContent;
      const tap = (lbl) => [...document.querySelectorAll('.kt-rt-sb')].find(b => b.getAttribute('aria-label') === lbl).click();
      openRoutines();
      // Lateral Raise: held flat at 17.5 lb (8 kg shown)
      _rtOpenEdit('Push', 'Lateral Raise');
      r.untouched = /THE COACH HELD THIS FLAT/.test(sheet());
      tap('More Weight');
      r.touched = /THE COACH HELD THIS FLAT/.test(sheet());
      _rtEdit = null; _paintRoutines();
      _rtOpenEdit('Push', 'Cable Triceps Pushdown'); tap('Less RPE'); r.rpeDown = _rtEdit.rpe; tap('More RPE'); r.rpeUp = _rtEdit.rpe;
      _rtEdit = null; _paintRoutines();
      _rtOpenEdit('Push', 'Incline Dumbbell Press'); tap('More Sets'); r.setsUp = _rtEdit.sets; tap('Less Sets'); r.setsDown = _rtEdit.sets;
      _rtEdit = null; closeRoutines();
      return r;
    });
    assert(!out.untouched && out.touched, 'the flat-row chips show once the weight is changed, not before: ' + JSON.stringify(out));
    assert(out.rpeDown === 4 && out.rpeUp === 5, 'RPE 4: Less keeps it, More moves it up: ' + JSON.stringify(out));
    assert(out.setsUp === 12 && out.setsDown === 11, '12 sets: More keeps it, Less moves it down: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R02 (regression from M14): the main tag a removed main hands on is no edit of the lift. The coach
// was told "[edited by the user]" with identical numbers, its rewrite of that lift was kept at the
// old numbers as the owner's, and a rebuild that left it out put it back.
seq('R02: a handed-on main tag is not the owner\'s edit for the coach; its rewrite applies and the tag stays', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1;
      // ! = main, + = added by the owner, * = marked
      const day = () => getCustomRoutine().weeks[c].push.map(e => e.name + ' ' + e.sets + 'x' + e.reps + '@' + e.weight + (e.isMain ? '!' : '') + (e.rec === null ? '+' : e.rec ? '*' : '')).join(' | ');
      const ohpLine = () => (buildSystemPrompt().match(/ {2}Overhead Press:[^\n]*/) || [''])[0];
      openRoutines(); _rtOpenEdit('Push', 'Bench Press'); _rtRemove(); await wait(5);
      document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(10); closeRoutines();
      const removed = localStorage.getItem('kt_routine');
      r.removed = day(); r.prompt = ohpLine();
      // the coach rewrites week 6's Push: Bench (main) again and Overhead Press at 4x6 @ 115
      const push = [{ name: 'Bench Press', sets: 4, reps: 8, weight: 160, isMain: true }].concat(getCustomRoutine().weeks[c].push.map(e => e.name === 'Overhead Press' ? { name: e.name, sets: 4, reps: 6, weight: 115 } : { name: e.name, sets: e.sets, reps: e.reps, weight: e.weight }));
      const rb = executeCoachTool('update_routine_weeks', { weeks: [{ wk: currentWeek, bName: 'BUILD', bColor: '#0a43f5', push }] });
      r.rebuild = { ok: rb.ok, kept: rb.keptUserEdits, day: day(), stored: JSON.stringify(rb.stored), prompt: ohpLine() };
      openRoutines(); _rtRestoreRemoved('Push'); await wait(10); closeRoutines();
      r.restored = day();
      // a rebuild that leaves Overhead Press out drops it (Bench stays out: the owner removed it)
      lsSet('kt_routine', JSON.parse(removed));
      const rest = getCustomRoutine().weeks[c].push.filter(e => e.name !== 'Overhead Press').map(e => ({ name: e.name, sets: e.sets, reps: e.reps, weight: e.weight }));
      const lo = executeCoachTool('update_routine_weeks', { weeks: [{ wk: currentWeek, bName: 'BUILD', bColor: '#0a43f5', push: rest }] });
      r.leftOut = { kept: lo.keptUserEdits, day: day() };
      // control: the owner then changes the lift itself; that is their edit and it wins
      lsSet('kt_routine', JSON.parse(removed));
      openRoutines(); _rtOpenEdit('Push', 'Overhead Press'); _rtEdit.w = wDisp(105); _rtSave(); await wait(10); closeRoutines();
      r.editPrompt = ohpLine();
      const ed = executeCoachTool('update_routine_weeks', { weeks: [{ wk: currentWeek, bName: 'BUILD', bColor: '#0a43f5', push }] });
      r.edited = { kept: ed.keptUserEdits, day: day() };
      return r;
    });
    assert(out.removed === 'Overhead Press 4x8@100!* | Incline Dumbbell Press 3x10@60 | Cable Triceps Pushdown 3x12@55 | Lateral Raise 3x15@17.5', 'the tag is handed on, marked for Restore: ' + out.removed);
    assert(/\(main\)$/.test(out.prompt) && !/edited by the user/.test(out.prompt), 'the coach is not told the owner edited it: ' + out.prompt);
    assert(out.rebuild.ok && JSON.stringify(out.rebuild.kept) === '["-Bench Press"]' && /^Overhead Press 4x6@115!\* \| Incline/.test(out.rebuild.day), 'the coach\'s 4x6 @ 115 is stored and the tag stays: ' + JSON.stringify(out.rebuild));
    assert(/"Overhead Press 4×6 115 lb"/.test(out.rebuild.stored) && !/edit kept/.test(out.rebuild.stored) && !/edited by the user/.test(out.rebuild.prompt), 'the readback and the prompt carry no owner mark: ' + JSON.stringify(out.rebuild));
    assert(out.restored === 'Bench Press 4x8@160! | Overhead Press 4x6@115 | Incline Dumbbell Press 3x10@60 | Cable Triceps Pushdown 3x12@55 | Lateral Raise 3x15@17.5', 'Restore gives Bench back as the one main lift: ' + out.restored);
    assert(!(out.leftOut.kept || []).length && !/Overhead Press/.test(out.leftOut.day), 'a rebuild that leaves it out drops it: ' + JSON.stringify(out.leftOut));
    assert(/\[edited by the user; you had 4×8 @ 100 lb\]/.test(out.editPrompt) && (out.edited.kept || []).indexOf('Overhead Press') >= 0 && /^Overhead Press 4x8@105!\*/.test(out.edited.day), 'an owner\'s change to the lift is still theirs: ' + JSON.stringify([out.editPrompt, out.edited]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R04 (regression from H02): in a deload week a lift's known load came from another day's deload
// row and was scaled for the deload again: a 35 lb Face Pull (25 in the deload) swapped or added
// into Push went in at 17.5, then 25 in every working week.
seq('R04: a known load in a deload week is the lift\'s working weight; the deload takes its share once', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async (setupSrc) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1;
      const orig = eval('(' + setupSrc + ')')();
      const reset = () => lsSet('kt_routine', JSON.parse(orig));
      const curve = (k, n) => getCustomRoutine().weeks.slice(c).map(w => { const x = (w[k] || []).find(e => e.name === n); return x ? x.weight : null; });
      r.pull = curve('pull', 'Face Pull');
      r.known = _knownLoadLb('Face Pull', getCustomRoutine(), c);
      openRoutines(); _rtOpenEdit('Push', 'Lateral Raise'); _rtEdit.swapTo = 'Face Pull'; _rtSave(); await wait(20); closeRoutines();
      r.swap = curve('push', 'Face Pull'); reset();
      openRoutines(); _rtAddPick('Push', 'Face Pull'); await wait(20); closeRoutines();
      r.add = curve('push', 'Face Pull'); reset();
      executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Lateral Raise', action: 'swap', rename_to: 'Face Pull' });
      r.coachSwap = curve('push', 'Face Pull'); reset();
      executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Face Pull', action: 'add', sets: 3, reps: 15 });
      r.coachAdd = curve('push', 'Face Pull'); reset();
      // Build day suggests the load the owner works at, not the deload's
      openBuildDay('Arms'); _bdAdd('Face Pull');
      r.build = (_bdRows.find(x => x.name === 'Face Pull') || {}).weight; closeBuildDay();
      return r;
    }, deloadSetup.toString());
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const last = out.pull.length - 1;
    assert(out.pull[0] === 25 && out.pull.slice(1).every(x => x === 35) && out.known === 35, 'Pull holds Face Pull at 35, 25 in the deload; its known load is 35: ' + JSON.stringify(out));
    // Lateral Raise is flat (12.5 in the deload): Face Pull takes its shape at 35
    assert(eq(out.swap, [25, 35, 35, 35, 35, 35, 35]) && eq(out.coachSwap, out.swap), 'a swap: the deload 25, every working week 35: ' + JSON.stringify([out.swap, out.coachSwap]));
    assert(out.add[0] === 25 && out.add[1] === 35 && out.add.slice(1, last).every(x => x === 35) && eq(out.coachAdd, out.add), 'an add: the deload 25, the working weeks from 35: ' + JSON.stringify([out.add, out.coachAdd]));
    assert(out.build === 35, 'Build day offers 35: ' + out.build);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R05 (regression from L09): the owner swaps a lift away, the coach adds it back (the programme's
// version, unmarked), then Reset: the swapped row went back to the coach's original beside the
// coach's add, so every week held the lift twice (the runner showed 7 sets, the watch both rows).
seq('R05: Reset keeps one copy of a lift the coach added back after the owner swapped it away', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1;
      const orig = localStorage.getItem('kt_routine');
      const day = () => getCustomRoutine().weeks[c].push.map(e => e.name + ' ' + e.sets + 'x' + e.reps + '@' + e.weight + (e.isMain ? '!' : '') + (e.rec === null ? '+' : e.rec ? '*' : '')).join(' | ');
      const count = (n) => getCustomRoutine().weeks.slice(c).map(w => (w.push || []).filter(e => e.name === n).length).join('');
      const swap = async (from, to) => { openRoutines(); _rtOpenEdit('Push', from); _rtEdit.swapTo = to; _rtSave(); await wait(10); closeRoutines(); };
      const resetPush = async () => {
        openRoutines(); document.querySelector('#rt-card-Push .kt-rt-reset').click(); await wait(5);
        document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(10); closeRoutines();
      };
      await swap('Overhead Press', 'Arnold Press');
      r.add = executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Overhead Press', action: 'add', sets: 3, reps: 10, weight: 95 }).ok;
      await resetPush();
      r.day = day(); r.ohp = count('Overhead Press'); r.arnold = count('Arnold Press');
      r.prompt = (buildSystemPrompt().match(/\nPUSH[^\n]*\n((?: {2}[^\n]*\n)+)/) || ['', ''])[1];
      openDeckRunner('Push'); await wait(20);
      r.cards = runnerSession.exercises.filter(e => e.name === 'Overhead Press').map(e => e.sets);
      closeDeckRunner(); runnerSession = null; localStorage.removeItem('kt_runner_draft');
      // the main lift: swapped away, added back by the coach, then Reset: one Bench, first and main
      lsSet('kt_routine', JSON.parse(orig));
      await swap('Bench Press', 'Barbell Bench Press');
      executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Bench Press', action: 'add', sets: 5, reps: 5, weight: 165 });
      await resetPush();
      r.mainDay = day(); r.bench = count('Bench Press');
      return r;
    });
    assert(out.add && out.ohp === '1111111' && out.arnold === '0000000', 'one Overhead Press a week after Reset: ' + JSON.stringify(out));
    assert(out.day === 'Bench Press 4x8@160! | Overhead Press 3x10@95 | Incline Dumbbell Press 3x10@60 | Cable Triceps Pushdown 3x12@55 | Lateral Raise 3x15@17.5', 'the coach\'s newer row, where the coach first had it: ' + out.day);
    assert((out.prompt.match(/Overhead Press:/g) || []).length === 1 && JSON.stringify(out.cards) === '[3]', 'the coach and the runner see it once, at its 3 sets: ' + JSON.stringify([out.prompt, out.cards]));
    assert(out.bench === '1111111' && /^Bench Press 5x5@165! \| Overhead Press [^!]*$/.test(out.mainDay), 'a main lift comes back once, first and main, at the coach\'s numbers: ' + out.mainDay);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R01 (regression from L11): a load off the plate grid (166 lb, 34 kg dumbbells) carries as the plate
// below it, so the lift stayed "above the plan" after the carry: it was offered after every tap, the
// session never counted as done, the next lift waited behind it, and each tap took a new undo point
// (Restore previous programme lost the plan from before the carry). A session from last week, so
// the carry lands in a later week than the plan it is judged by (any weekday).
seq('R01: an off-grid load is carried once; the next lift follows; one undo point for the session', async () => {
  const probe = async (unit) => {
    const app = await boot({ native: true, seed: unit ? { kt_unit_w: unit } : {} });
    try {
      const out = await app.page.evaluate(async (unit) => {
        const wait = ms => new Promise(res => setTimeout(res, ms));
        const r = {}, c = currentWeek - 1;
        const plan = (n, cr) => (cr || getCustomRoutine()).weeks[c].push.find(e => e.name === n).weight;
        const ex = unit === 'kg'
          ? [{ name: 'Incline Dumbbell Press', sets: 3, reps: [10, 10, 10], weight: 75, weightLog: [75, 75, 75] }]
          : [{ name: 'Bench Press', sets: 4, reps: [8, 8, 8, 8], weight: 166, weightLog: [166, 166, 166, 166] },
            { name: 'Overhead Press', sets: 4, reps: [8, 8, 8, 8], weight: 110, weightLog: [110, 110, 110, 110] }];
        lsSet('kt_sessions', [{ id: 8800, date: addDays(todayISO(), -7), type: 'Push', week: currentWeek - 1, prs: [], exercises: ex }].concat(getSessions()));
        r.wk = weekForDate(addDays(todayISO(), -7));
        r.before = { bench: plan('Bench Press'), ohp: plan('Overhead Press'), inc: plan('Incline Dumbbell Press') };
        const cands = () => _carryCandidates(getSessions().find(x => x.id === 8800)).map(k => k.name);
        const btns = () => [...document.querySelectorAll('#completeSheetOverlay .kt-carry-row button')];
        r.c0 = cands();
        openCompleteSheet({ rec: getSessions().find(x => x.id === 8800), startedAt: Date.now() });
        btns()[0].click(); await wait(20);
        r.c1 = cands(); r.seen1 = _carrySeen().indexOf(8800) >= 0;
        if (btns()[0]) { btns()[0].click(); await wait(20); }
        r.c2 = cands(); r.seen2 = _carrySeen().indexOf(8800) >= 0;
        closeCompleteSheet();
        r.after = { bench: plan('Bench Press'), ohp: plan('Overhead Press'), inc: plan('Incline Dumbbell Press') };
        const bk = lsGet('kt_routine_backup');
        r.backup = { bench: plan('Bench Press', bk), ohp: plan('Overhead Press', bk), inc: plan('Incline Dumbbell Press', bk) };
        return r;
      }, unit);
      assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
      return out;
    } finally { await app.close(); }
  };
  const lb = await probe('');
  assert(lb.wk === 5 && JSON.stringify(lb.c0) === '["Bench Press","Overhead Press"]', 'last week\'s Push: Bench and Overhead Press above the plan: ' + JSON.stringify(lb));
  assert(JSON.stringify(lb.c1) === '["Overhead Press"]' && !lb.seen1, 'Bench carried (166 as 165): Overhead Press is next: ' + JSON.stringify(lb));
  assert(!lb.c2.length && lb.seen2 && lb.after.bench === 165 && lb.after.ohp === 110, 'both carried, then the session is done: ' + JSON.stringify(lb));
  assert(lb.backup.bench === lb.before.bench && lb.backup.ohp === lb.before.ohp, 'Restore previous programme still has the plan from before the first carry: ' + JSON.stringify(lb));
  const kg = await probe('kg');
  assert(JSON.stringify(kg.c0) === '["Incline Dumbbell Press"]' && !kg.c1.length && kg.seen1 && kg.after.inc === 74.4, 'kg: 34 kg dumbbells carry as 33.75 kg, once: ' + JSON.stringify(kg));
});

// R03 (regression from M14): a superset opener coming back at its place without its partner (the
// owner removed both and added the opener back; the coach removed the partner, then Restore) kept
// its pairing and the runner supersetted it with whatever lift followed.
seq('R03: a superset opener comes back paired only with its own partner', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1;
      // the coach supersets Incline Dumbbell Press with Cable Triceps Pushdown
      const cr0 = getCustomRoutine(); cr0.weeks.forEach(w => { w.push.find(e => e.name === 'Incline Dumbbell Press').ss = true; }); setCustomRoutine(cr0);
      const orig = localStorage.getItem('kt_routine');
      const reset = () => { closeRoutines(); lsSet('kt_routine', JSON.parse(orig)); };
      // ! = main, ~ = superset opener
      const day = (j) => getCustomRoutine().weeks[j == null ? c : j].push.map(e => e.name + (e.isMain ? '!' : '') + (e.ss ? '~' : '')).join(' | ');
      const remove = async (n) => { openRoutines(); _rtOpenEdit('Push', n); _rtRemove(); await wait(5); document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(10); };
      const runner = async () => { closeRoutines(); openDeckRunner('Push'); await wait(20); const x = runnerSession.exercises.map(e => e.name + (e.ss ? '~' : '')).join(' | '); closeDeckRunner(); runnerSession = null; localStorage.removeItem('kt_runner_draft'); return x; };
      r.coach = day();
      await remove('Incline Dumbbell Press'); await remove('Cable Triceps Pushdown');
      _rtAddPick('Push', 'Incline Dumbbell Press'); await wait(10);
      r.addBack = [day(), day(11)]; r.addBackRunner = await runner(); reset();
      await remove('Incline Dumbbell Press'); closeRoutines();
      executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Cable Triceps Pushdown', action: 'remove' });
      openRoutines(); _rtRestoreRemoved('Push'); await wait(10);
      r.restore = day(); r.restoreRunner = await runner(); reset();
      // with its partner it pairs again: both restored, or the opener alone added back
      await remove('Incline Dumbbell Press'); await remove('Cable Triceps Pushdown');
      _rtRestoreRemoved('Push'); await wait(10); r.both = day(); reset();
      await remove('Incline Dumbbell Press'); _rtAddPick('Push', 'Incline Dumbbell Press'); await wait(10); r.alone = day(); reset();
      return r;
    });
    const C = 'Bench Press! | Overhead Press | Incline Dumbbell Press~ | Cable Triceps Pushdown | Lateral Raise';
    const unpaired = 'Bench Press! | Overhead Press | Incline Dumbbell Press | Lateral Raise';
    assert(out.coach === C, 'the coach\'s day: ' + out.coach);
    assert(out.addBack[0] === unpaired && out.addBack[1] === unpaired && !/~/.test(out.addBackRunner), 'added back without its partner it pairs with nothing, in every week and in the runner: ' + JSON.stringify(out));
    assert(out.restore === unpaired && !/~/.test(out.restoreRunner), 'restored after the coach removed its partner: unpaired: ' + JSON.stringify(out));
    assert(out.both === C && out.alone === C, 'back beside its partner it pairs again: ' + JSON.stringify([out.both, out.alone]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R07 (incomplete M12): a removed lift added back comes back in the weeks it was removed from, and
// goes into the weeks that never had it as a new row: those got no load ("your load"), even at the
// load the coach asked for. The coach: Lateral Raise in weeks 1-8, Cable Fly in its place from week 9.
seq('R07: a lift added back has a load in the weeks that never had it, the coach\'s when it asked', async () => {
  const r0 = JSON.parse(require('../lib/harness').SEED.kt_routine);
  r0.weeks.forEach((w, i) => { if (i >= 8) Object.assign(w.push.find(e => e.name === 'Lateral Raise'), { name: 'Cable Fly', weight: 40, sets: 3, reps: 12 }); });
  const app = await boot({ native: true, seed: { kt_routine: JSON.stringify(r0) } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1;
      const lr = () => getCustomRoutine().weeks.slice(c).map(w => { const e = w.push.find(x => x.name === 'Lateral Raise'); return e ? e.sets + 'x' + e.reps + '@' + e.weight + (e.rec === null ? '+' : e.rec ? '*' : '') : '-'; });
      openRoutines(); _rtOpenEdit('Push', 'Lateral Raise'); _rtRemove(); await wait(5);
      document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(10); closeRoutines();
      const removed = localStorage.getItem('kt_routine');
      const a = executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Lateral Raise', action: 'add', sets: 4, reps: 12, weight: 25 });
      r.coach = { ok: a.ok, lr: lr(), series: a.series, fly: getCustomRoutine().weeks.slice(8).every(w => w.push.some(e => e.name === 'Cable Fly')) };
      lsSet('kt_routine', JSON.parse(removed));
      openRoutines(); _rtAddPick('Push', 'Lateral Raise'); await wait(10); closeRoutines();
      r.owner = lr();
      return r;
    });
    const last = out.coach.lr.length - 1, w = (s) => parseFloat(s.split('@')[1]);
    assert(out.coach.ok && out.coach.lr.slice(0, last).every(x => x === '4x12@25') && w(out.coach.lr[last]) > 0 && w(out.coach.lr[last]) < 25 && out.coach.fly, 'the coach\'s 4x12 @ 25 in every working week, the deload its share, Cable Fly kept: ' + JSON.stringify(out.coach));
    assert(!out.coach.series.some(s => /your load/.test(s)), 'the coach is told the loads it set: ' + JSON.stringify(out.coach.series));
    assert(out.owner.slice(0, 3).every(x => x === '3x15@17.5') && out.owner.slice(3).every(x => /\+$/.test(x) && w(x) > 0), 'the owner\'s add: the coach\'s rows back in weeks 6-8, a loaded ADDED row after: ' + JSON.stringify(out.owner));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R06 (incomplete M16): a coach rewrite of a week re-recorded a lift the owner had removed without
// its markers: Use coach's on the lift the owner swapped onto left the coach's original out of that
// week. The same rewrite left a superset opener paired with the next lift when the owner had
// removed its partner. The coach: Overhead Press every week, Arnold Press beside it from week 9,
// Incline Dumbbell Press supersetted with Cable Triceps Pushdown.
seq('R06: a coach rewrite keeps the swap and superset marks of the lifts the owner removed', async () => {
  const r0 = JSON.parse(require('../lib/harness').SEED.kt_routine);
  r0.weeks.forEach((w, i) => {
    w.push.find(e => e.name === 'Incline Dumbbell Press').ss = true;
    if (i >= 8) { const at = w.push.findIndex(e => e.name === 'Overhead Press'); w.push.splice(at + 1, 0, { name: 'Arnold Press', sets: 3, reps: 10, weight: 45 }); }
  });
  const app = await boot({ native: true, seed: { kt_routine: JSON.stringify(r0) } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1;
      const orig = localStorage.getItem('kt_routine');
      const has = (n) => getCustomRoutine().weeks.slice(c).map(w => w.push.some(e => e.name === n) ? 1 : 0).join('');
      // ~ = superset opener
      const day9 = () => getCustomRoutine().weeks[8].push.map(e => e.name + (e.ss ? '~' : '')).join(' | ');
      // the coach rewrites week 9 as it wrote it
      const rewrite9 = () => executeCoachTool('update_routine_weeks', { weeks: [{ wk: 9, bName: 'PEAK', bColor: '#0a43f5', push: [
        { name: 'Bench Press', sets: 4, reps: 8, weight: 167.5, isMain: true }, { name: 'Overhead Press', sets: 4, reps: 8, weight: 105 }, { name: 'Arnold Press', sets: 3, reps: 10, weight: 45 },
        { name: 'Incline Dumbbell Press', sets: 3, reps: 10, weight: 65, ss: true }, { name: 'Cable Triceps Pushdown', sets: 3, reps: 12, weight: 60 }, { name: 'Lateral Raise', sets: 3, reps: 15, weight: 17.5 }] }] });
      // the owner swaps Overhead Press for Arnold Press from week 6 (weeks 9-12 drop it)
      openRoutines(); _rtOpenEdit('Push', 'Overhead Press'); _rtEdit.swapTo = 'Arnold Press'; _rtSave(); await wait(10); closeRoutines();
      r.rewrite = rewrite9().ok;
      openRoutines(); _rtUseCoach('Push', 'Arnold Press'); await wait(10); closeRoutines();
      r.useCoach = { ohp: has('Overhead Press'), day9: day9() };
      // the owner removes the superset's second half, then the coach rewrites week 9 with both
      lsSet('kt_routine', JSON.parse(orig));
      openRoutines(); _rtOpenEdit('Push', 'Cable Triceps Pushdown'); _rtRemove(); await wait(5);
      document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(10); closeRoutines();
      rewrite9();
      r.unpaired = day9();
      openRoutines(); _rtRestoreRemoved('Push'); await wait(10); closeRoutines();
      r.restored = day9();
      return r;
    });
    const coach9 = 'Bench Press | Overhead Press | Arnold Press | Incline Dumbbell Press~ | Cable Triceps Pushdown | Lateral Raise';
    assert(out.rewrite && out.useCoach.ohp === '1111111' && out.useCoach.day9 === coach9, 'Use coach\'s brings Overhead Press back in every week, the rewritten one too: ' + JSON.stringify(out.useCoach));
    assert(out.unpaired === 'Bench Press | Overhead Press | Arnold Press | Incline Dumbbell Press | Lateral Raise', 'the opener whose partner stays removed pairs with nothing: ' + out.unpaired);
    assert(out.restored === coach9, 'Restore pairs it again: ' + out.restored);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R08 (new bug from M11): a kg owner who switched to lb in Settings kept the kg grid for good
// (159.8, 102, 60.6, 55.1 and 16.5 lb: the launch sweep reads the programme as kg). The switch moves
// the programme onto lb plates, with an Undo, and the way back to kg gives every load not changed
// since its exact kg value (M11: a round trip read 106.5 for 106 kg). A relaunch is a new boot on
// what the last one stored, the device note included.
seq('R08: a switch to lb in Settings moves the programme onto lb plates; back in kg the kg loads return', async () => {
  const { SEED } = require('../lib/harness');
  const LB = 2.2046226218, kgGrid = (lb) => Math.round(Math.max(1.25, Math.round(lb / LB / 1.25) * 1.25) * LB * 10) / 10;
  const kgR = JSON.parse(SEED.kt_routine);
  kgR.weeks.forEach(w => ['push', 'pull', 'legs'].forEach(k => (w[k] || []).forEach(e => { if (e.weight > 0) e.weight = kgGrid(e.weight); })));
  const launch = async (seed, fn, arg) => {
    const app = await boot({ native: true, seed });
    try {
      const out = await app.page.evaluate(fn, arg);
      assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
      return out;
    } finally { await app.close(); }
  };
  const keep = (o) => Object.assign({ kt_routine: o.routine, kt_unit_w: 'lb' }, o.note ? { kt_unit_regrid: o.note } : {});
  // in kg the owner removes Lateral Raise and sets Overhead Press to 47.5 kg, then Settings > Units > lb
  const a = await launch({ kt_routine: JSON.stringify(kgR), kt_unit_w: 'kg' }, async () => {
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const r = {}, c = currentWeek - 1;
    const unit = async (u) => { switchTab('settings'); await wait(20); [...document.querySelectorAll('.kt-units-opt')].find(b => b.textContent === u).click(); await wait(30); };
    // * = marked: the coach's original kept beside it
    const day = () => getCustomRoutine().weeks[c].push.map(e => fmtW(e.weight) + (e.rec ? '*' : '')).join(' | ');
    const offLb = () => { let n = 0; getCustomRoutine().weeks.forEach(w => ['push', 'pull', 'legs'].forEach(k => {
      (w[k] || []).forEach(e => [e, e.rec].forEach(h => { if (h && h.weight > 0 && Math.abs(Math.round(h.weight / 2.5) * 2.5 - h.weight) > 0.01) n++; }));
      ((w.recOut || {})[k] || []).forEach(x => { if (Math.abs(Math.round(x.row.weight / 2.5) * 2.5 - x.row.weight) > 0.01) n++; }); })); return n; };
    openRoutines(); _rtOpenEdit('Push', 'Lateral Raise'); _rtRemove(); await wait(5);
    document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(10); closeRoutines();
    openRoutines(); _rtOpenEdit('Push', 'Overhead Press'); _rtEdit.w = 47.5; _rtSave(); await wait(10); closeRoutines();
    r.before = localStorage.getItem('kt_routine'); r.offBefore = offLb();
    await unit('lb');
    r.toast = document.getElementById('toast').textContent; r.lb = day(); r.off = offLb();
    r.lrOut = getCustomRoutine().weeks[c].recOut.push.map(x => x.row.name + ' ' + fmtW(x.row.weight)).join();
    r.plate = _plateMath(getCustomRoutine().weeks[c].push[0].weight);
    openRoutines(); await wait(10);
    r.coachLine = [...document.querySelectorAll('#rtSheet *')].map(x => x.textContent.trim()).filter(t => /^Coach:/.test(t))[0];
    closeRoutines();
    // Undo keeps lb and puts the kg loads back; then to kg (nothing to move) and to lb again
    document.querySelector('#toast .kt-toast-undo').click(); await wait(20);
    r.undone = day(); r.undoneSame = localStorage.getItem('kt_routine') === r.before;
    await unit('kg'); r.kgSame = localStorage.getItem('kt_routine') === r.before;
    await unit('lb'); r.lbAgain = day();
    r.routine = localStorage.getItem('kt_routine'); r.note = localStorage.getItem('kt_unit_regrid');
    return r;
  });
  assert(a.offBefore > 0 && /^Programme loads moved onto lb plates/.test(a.toast) && /Undo$/.test(a.toast), 'the switch says so and offers Undo: ' + JSON.stringify(a.toast));
  assert(a.lb === '160 lb | 105 lb* | 60 lb | 55 lb' && a.off === 0, 'every load on lb plates, the owner\'s edit still marked: ' + JSON.stringify([a.lb, a.off]));
  assert(a.lrOut === 'Lateral Raise 17.5 lb' && a.coachLine === 'Coach: 4×8 · 102.5 lb Use coach’s' && a.plate === '45 + 10 + 2.5 / side', 'the coach\'s original and the removed lift follow; the plates add up: ' + JSON.stringify([a.lrOut, a.coachLine, a.plate]));
  assert(a.undone === '159.8 lb | 104.7 lb* | 60.6 lb | 55.1 lb' && a.undoneSame && a.kgSame && a.lbAgain === a.lb, 'Undo puts the kg loads back; switched again they move again: ' + JSON.stringify([a.undone, a.undoneSame, a.kgSame, a.lbAgain]));
  // relaunched in lb nothing moves, and the runner prescribes the lb load
  const b = await launch(keep(a), async () => {
    const wait = ms => new Promise(res => setTimeout(res, ms));
    openDeckRunner('Push'); await wait(20);
    const card = runnerSession.exercises[0].name + ' ' + runnerSession.exercises[0].weight;
    closeDeckRunner(); runnerSession = null; localStorage.removeItem('kt_runner_draft');
    return { card, routine: localStorage.getItem('kt_routine'), note: localStorage.getItem('kt_unit_regrid') };
  });
  assert(b.routine === a.routine && b.card === 'Bench Press 160', 'a launch in lb leaves the lb plates: ' + b.card);
  // in lb: Restore Lateral Raise, Use coach's on Overhead Press, Bench to 162.5 from this week on
  const d = await launch(keep(b), async () => {
    const wait = ms => new Promise(res => setTimeout(res, ms));
    openRoutines(); _rtRestoreRemoved('Push'); await wait(10); closeRoutines();
    openRoutines(); _rtUseCoach('Push', 'Overhead Press'); await wait(10); closeRoutines();
    openRoutines(); _rtOpenEdit('Push', 'Bench Press'); _rtEdit.w = 162.5; _rtSave(); await wait(10); closeRoutines();
    return { routine: localStorage.getItem('kt_routine'), note: localStorage.getItem('kt_unit_regrid') };
  });
  // relaunched, then Settings > Units > kg: each load as the kg programme had it (Overhead Press the
  // coach's, Lateral Raise the removed row), except Bench from this week on (the owner's lb edit)
  const e = await launch(keep(d), async (before) => {
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const c = currentWeek - 1;
    switchTab('settings'); await wait(20); [...document.querySelectorAll('.kt-units-opt')].find(b => b.textContent === 'kg').click(); await wait(30);
    const B = JSON.parse(before), diffs = [];
    getCustomRoutine().weeks.forEach((w, j) => ['push', 'pull', 'legs'].forEach(k => (w[k] || []).forEach(x => {
      const o = (B.weeks[j][k] || []).find(y => y.name === x.name) || ((B.weeks[j].recOut || {})[k] || []).map(y => y.row).find(y => y.name === x.name);
      const ow = o ? (o.rec && !x.rec ? o.rec.weight : o.weight) : null;
      if (ow == null || Math.abs(ow - x.weight) > 0.01) diffs.push((j + 1) + ' ' + x.name);
    })));
    return { diffs, expect: getCustomRoutine().weeks.slice(c).map((w, i) => (c + i + 1) + ' Bench Press'), day: getCustomRoutine().weeks[c].push.map(x => fmtW(x.weight)).join(' | '), note: localStorage.getItem('kt_unit_regrid') };
  }, a.before);
  assert(JSON.stringify(e.diffs) === JSON.stringify(e.expect) && e.day === '73.5 kg | 46.5 kg | 27.5 kg | 25 kg | 7.5 kg' && e.note === null, 'back in kg the kg loads return, the lb edit stays: ' + JSON.stringify(e));
});

// T01 (regression from R02): the owner's Make main lift marks both rows with the tag alone, so a
// coach rewrite of the day took the coach's main and dropped both marks (and the coach was never
// told the main was the owner's pick); a rewrite that left the lift out dropped it. The coach's
// rows and numbers apply, the main stays the owner's, and the prompt says so.
seq('T01: the owner\'s Make main survives a coach rewrite of the day; the coach\'s numbers apply', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1;
      // ! = main, + = added by the owner, * = marked
      const day = (j) => getCustomRoutine().weeks[j == null ? c : j].push.map(e => e.name + ' ' + e.sets + 'x' + e.reps + '@' + e.weight + (e.isMain ? '!' : '') + (e.rec === null ? '+' : e.rec ? '*' : '')).join(' | ');
      const line = (n) => (buildSystemPrompt().match(new RegExp(' {2}' + n + ':[^\\n]*')) || [''])[0];
      const coachPush = (j) => getCustomRoutine().weeks[j].push.map(e => ({ name: e.name, sets: e.sets, reps: e.reps, weight: e.weight, isMain: e.name === 'Bench Press' }));
      openRoutines(); _rtOpenEdit('Push', 'Overhead Press'); _rtMakeMain(); await wait(10); closeRoutines();
      const made = localStorage.getItem('kt_routine');
      r.made = day(); r.prompt = [line('Overhead Press'), line('Bench Press')];
      // the coach rewrites this week's Push as it designed it: Bench main, a little harder
      const push = [{ name: 'Bench Press', sets: 4, reps: 6, weight: 165, isMain: true }, { name: 'Overhead Press', sets: 4, reps: 6, weight: 105 },
        { name: 'Incline Dumbbell Press', sets: 3, reps: 10, weight: 60 }, { name: 'Cable Triceps Pushdown', sets: 3, reps: 12, weight: 55 }, { name: 'Lateral Raise', sets: 3, reps: 15, weight: 17.5 }];
      const push0 = JSON.stringify(push);   // each call gets its own copy, as the model's JSON is
      const rb = executeCoachTool('update_routine_weeks', { weeks: [{ wk: currentWeek, bName: 'BUILD', bColor: '#0a43f5', push }] });
      r.rebuild = { ok: rb.ok, kept: rb.keptUserEdits, day: day(), next: day(c + 1), stored: JSON.stringify(rb.stored), prompt: line('Overhead Press') };
      openRoutines(); _rtUseCoach('Push', 'Overhead Press'); await wait(10); closeRoutines();
      r.useCoach = day();
      // a rewrite of next week that leaves Overhead Press out keeps it, as the main lift
      lsSet('kt_routine', JSON.parse(made));
      const lo = executeCoachTool('update_routine_weeks', { weeks: [{ wk: currentWeek + 1, bName: 'BUILD', bColor: '#0a43f5', push: coachPush(c + 1).filter(e => e.name !== 'Overhead Press') }] });
      r.leftOut = { kept: lo.keptUserEdits, day: day(c + 1) };
      // the coach regenerates every week from this one with its own main
      lsSet('kt_routine', JSON.parse(made));
      const weeks = [];
      for (let w = currentWeek; w <= getTotalWeeks(); w++) weeks.push({ wk: w, bName: 'BUILD', bColor: '#0a43f5', push: coachPush(w - 1) });
      executeCoachTool('update_routine_weeks', { weeks });
      r.regen = getCustomRoutine().weeks.slice(c).map(w => w.push.filter(e => e.isMain).map(e => e.name).join('+') + ':' + w.push.filter(e => e.rec).length);
      // the coach changes the owner's main lift itself (its version of that lift now), then rewrites the day
      lsSet('kt_routine', JSON.parse(made));
      executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Overhead Press', action: 'change', weight: 105 });
      r.edited = line('Overhead Press');
      executeCoachTool('update_routine_weeks', { weeks: [{ wk: currentWeek, bName: 'BUILD', bColor: '#0a43f5', push: JSON.parse(push0) }] });
      r.editedRebuild = day();
      return r;
    });
    assert(/\(main\) \[main lift chosen by the user\]$/.test(out.edited) && out.editedRebuild === 'Bench Press 4x6@165* | Overhead Press 4x6@105!* | Incline Dumbbell Press 3x10@60 | Cable Triceps Pushdown 3x12@55 | Lateral Raise 3x15@17.5', 'the coach\'s own change to that lift keeps it the owner\'s main: ' + JSON.stringify([out.edited, out.editedRebuild]));
    assert(out.made === 'Bench Press 4x8@160* | Overhead Press 4x8@100!* | Incline Dumbbell Press 3x10@60 | Cable Triceps Pushdown 3x12@55 | Lateral Raise 3x15@17.5', 'Make main: ' + out.made);
    assert(/\(main\) \[main lift chosen by the user\]$/.test(out.prompt[0]) && !/main lift chosen|edited by the user/.test(out.prompt[1]), 'the coach is told the main is the user\'s pick: ' + JSON.stringify(out.prompt));
    assert(out.rebuild.ok && out.rebuild.day === 'Bench Press 4x6@165* | Overhead Press 4x6@105!* | Incline Dumbbell Press 3x10@60 | Cable Triceps Pushdown 3x12@55 | Lateral Raise 3x15@17.5', 'the coach\'s numbers, the owner\'s main, both marked: ' + JSON.stringify(out.rebuild));
    assert(JSON.stringify(out.rebuild.kept) === '["Overhead Press"]' && /"Overhead Press 4×6 105 lb \(main lift: the user’s choice\)"/.test(out.rebuild.stored) && /\[main lift chosen by the user\]$/.test(out.rebuild.prompt), 'the readback and the prompt say whose main it is: ' + JSON.stringify(out.rebuild));
    assert(out.rebuild.next === 'Bench Press 4x8@162.5* | Overhead Press 4x8@102.5!* | Incline Dumbbell Press 3x10@62.5 | Cable Triceps Pushdown 3x12@57.5 | Lateral Raise 3x15@17.5', 'a week the call did not send is untouched: ' + out.rebuild.next);
    assert(out.useCoach === 'Bench Press 4x6@165! | Overhead Press 4x6@105 | Incline Dumbbell Press 3x10@60 | Cable Triceps Pushdown 3x12@55 | Lateral Raise 3x15@17.5', 'Use coach\'s gives the coach\'s main back, unmarked: ' + out.useCoach);
    assert(JSON.stringify(out.leftOut.kept) === '["Overhead Press"]' && out.leftOut.day === 'Bench Press 4x8@162.5* | Overhead Press 4x8@102.5!* | Incline Dumbbell Press 3x10@62.5 | Cable Triceps Pushdown 3x12@57.5 | Lateral Raise 3x15@17.5', 'a rewrite that leaves the owner\'s main out keeps it: ' + JSON.stringify(out.leftOut));
    assert(out.regen.every(x => x === 'Overhead Press:2'), 'a regeneration keeps the owner\'s main in every week: ' + JSON.stringify(out.regen));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// T02 (regression from R03): a superset opener came back unpaired, with nothing recorded, when its
// partner had been swapped (by the owner or by the coach) or a lift sat between them, and neither
// Use coach's nor Reset gave the coach's superset back; brought back one by one the other way
// round, the partner landed before its opener. The coach supersets Incline Dumbbell Press with
// Cable Triceps Pushdown.
seq('T02: a superset opener comes back beside its partner, or its swap; Use coach\'s and Reset give the coach\'s pair back', async () => {
  const r0 = JSON.parse(require('../lib/harness').SEED.kt_routine);
  r0.weeks.forEach(w => { w.push.find(e => e.name === 'Incline Dumbbell Press').ss = true; });
  const app = await boot({ native: true, seed: { kt_routine: JSON.stringify(r0) } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1, last = getTotalWeeks() - 1;
      const orig = localStorage.getItem('kt_routine');
      // ! = main, ~ = superset opener, + = added by the owner, * = marked
      const day = (j) => getCustomRoutine().weeks[j == null ? c : j].push.map(e => e.name + (e.isMain ? '!' : '') + (e.ss ? '~' : '') + (e.rec === null ? '+' : e.rec ? '*' : '')).join(' | ');
      const remove = async (n) => { openRoutines(); _rtOpenEdit('Push', n); _rtRemove(); await wait(5); document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(10); closeRoutines(); };
      const restore = async () => { openRoutines(); _rtRestoreRemoved('Push'); await wait(10); closeRoutines(); };
      const reset = async () => { openRoutines(); document.querySelector('#rt-card-Push .kt-rt-reset').click(); await wait(5); document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(10); closeRoutines(); };
      const runner = async () => { openDeckRunner('Push'); await wait(20); const x = runnerSession.exercises.map(e => e.name + (e.ss ? '~' : '')).join(' | '); closeDeckRunner(); runnerSession = null; localStorage.removeItem('kt_runner_draft'); return x; };
      r.coach = day();
      // the owner: removes the opener, swaps its partner, Restore, then Use coach's on the swap
      await remove('Incline Dumbbell Press');
      openRoutines(); _rtOpenEdit('Push', 'Cable Triceps Pushdown'); _rtEdit.swapTo = 'Skull Crusher'; _rtSave(); await wait(10); closeRoutines();
      await restore(); r.ownerSwap = day();
      openRoutines(); _rtUseCoach('Push', 'Skull Crusher'); await wait(10); closeRoutines();
      r.useCoach = [day(), day(last)];
      // the coach swaps the partner (the programme's version) while the opener is removed
      lsSet('kt_routine', JSON.parse(orig));
      await remove('Incline Dumbbell Press');
      executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Cable Triceps Pushdown', action: 'swap', rename_to: 'Skull Crusher' });
      await restore(); r.coachSwap = [day(), day(last)];
      // a lift the runner put in after Overhead Press, where the opener was
      lsSet('kt_routine', JSON.parse(orig));
      await remove('Incline Dumbbell Press');
      _commitRoutine(cr => _progAdd(cr, 'push', { name: 'Dips', sets: 3, reps: 10, rpe: 7, weight: 0 }, c, 'Overhead Press', { firstIsMain: false }), { noRender: true, scope: 'runner:test' });
      await restore(); r.between = day(); r.betweenRunner = await runner();
      await reset(); r.reset = [day(), day(last)];
      // removed one after the other, the opener added back alone, then its partner restored
      lsSet('kt_routine', JSON.parse(orig));
      await remove('Incline Dumbbell Press'); await remove('Cable Triceps Pushdown');
      _rtAddPick('Push', 'Incline Dumbbell Press'); await wait(10); r.alone = day();
      await restore(); r.after = [day(), day(last)];
      return r;
    });
    const C = 'Bench Press! | Overhead Press | Incline Dumbbell Press~ | Cable Triceps Pushdown | Lateral Raise';
    assert(out.coach === C, 'the coach\'s day: ' + out.coach);
    assert(out.ownerSwap === 'Bench Press! | Overhead Press | Incline Dumbbell Press~ | Skull Crusher* | Lateral Raise' && out.useCoach.every(x => x === C), 'paired with the owner\'s swap of its partner; Use coach\'s on it gives the coach\'s day in every week: ' + JSON.stringify([out.ownerSwap, out.useCoach]));
    assert(out.coachSwap.every(x => x === 'Bench Press! | Overhead Press | Incline Dumbbell Press~ | Skull Crusher | Lateral Raise'), 'paired with the coach\'s new partner: ' + JSON.stringify(out.coachSwap));
    assert(out.between === 'Bench Press! | Overhead Press | Dips+ | Incline Dumbbell Press~ | Cable Triceps Pushdown | Lateral Raise' && out.betweenRunner === 'Bench Press | Overhead Press | Dips | Incline Dumbbell Press~ | Cable Triceps Pushdown | Lateral Raise', 'back right before its partner, the lift put in stays where it is: ' + JSON.stringify([out.between, out.betweenRunner]));
    assert(out.reset.every(x => x === C), 'Reset gives the coach\'s day: ' + JSON.stringify(out.reset));
    assert(out.alone === 'Bench Press! | Overhead Press | Incline Dumbbell Press | Lateral Raise' && out.after.every(x => x === C), 'added back alone it waits unpaired; its partner comes back after it, paired: ' + JSON.stringify([out.alone, out.after]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// T02 (continued): a removed partner comes back beside its opener with another superset right
// after them, and a row brought back out of order never lands between a superset's two halves (it
// paired the opener with that row). The coach: Incline Dumbbell Press with Cable Triceps Pushdown,
// Lateral Raise with Cable Fly.
seq('T02: no row comes back between the halves of a superset; two supersets side by side stay paired', async () => {
  const r0 = JSON.parse(require('../lib/harness').SEED.kt_routine);
  r0.weeks.forEach(w => {
    w.push.find(e => e.name === 'Incline Dumbbell Press').ss = true;
    w.push.find(e => e.name === 'Lateral Raise').ss = true;
    w.push.push({ name: 'Cable Fly', sets: 3, reps: 12, weight: 30 });
  });
  const app = await boot({ native: true, seed: { kt_routine: JSON.stringify(r0) } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1, last = getTotalWeeks() - 1;
      const orig = localStorage.getItem('kt_routine');
      // ! = main, ~ = superset opener
      const day = (j) => getCustomRoutine().weeks[j == null ? c : j].push.map(e => e.name + (e.isMain ? '!' : '') + (e.ss ? '~' : '')).join(' | ');
      const remove = async (n) => { openRoutines(); _rtOpenEdit('Push', n); _rtRemove(); await wait(5); document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(10); closeRoutines(); };
      r.coach = day();
      await remove('Cable Triceps Pushdown');
      openRoutines(); _rtRestoreRemoved('Push'); await wait(10); closeRoutines();
      r.partner = [day(), day(last)];
      // one superset: Bench out, then Lateral Raise (fourth by then); Bench added back first, then
      // Lateral Raise (its place is between the superset's halves by then)
      const one = JSON.parse(orig);
      one.weeks.forEach(w => { w.push = w.push.filter(e => e.name !== 'Cable Fly'); w.push.find(e => e.name === 'Lateral Raise').ss = false; });
      lsSet('kt_routine', one);
      await remove('Bench Press'); await remove('Lateral Raise');
      _rtAddPick('Push', 'Bench Press'); await wait(10);
      _rtAddPick('Push', 'Lateral Raise'); await wait(10);
      r.order = [day(), day(last)];
      return r;
    });
    const C = 'Bench Press! | Overhead Press | Incline Dumbbell Press~ | Cable Triceps Pushdown | Lateral Raise~ | Cable Fly';
    assert(out.coach === C, 'the coach\'s day: ' + out.coach);
    assert(out.partner.every(x => x === C), 'the partner comes back beside its opener: ' + JSON.stringify(out.partner));
    assert(out.order.every(x => x === 'Bench Press! | Overhead Press | Incline Dumbbell Press~ | Cable Triceps Pushdown | Lateral Raise'), 'back out of order, a row lands after the superset, not inside it: ' + JSON.stringify(out.order));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// T04 (incomplete R03): removals made on a page before 20261006-1 have no ssTo, so an opener added
// back or restored still paired with whatever lift followed it. Its partner is read off a week
// that still has the pair (else the row removed after it from its place). The data such a page
// wrote: Incline Dumbbell Press (the opener) removed from week 6 on, then (a) its partner too,
// (b) nothing else, (c) its partner by the coach (no entry).
seq('T04: an opener removed on an older page comes back paired only with its own partner', async () => {
  const { SEED } = require('../lib/harness');
  const older = (v) => {
    const r0 = JSON.parse(SEED.kt_routine);
    r0.weeks.forEach((w, j) => {
      const inc = w.push.find(e => e.name === 'Incline Dumbbell Press'), pd = w.push.find(e => e.name === 'Cable Triceps Pushdown');
      inc.ss = true;
      if (j < 5) return;
      w.push = w.push.filter(e => e !== inc && (v === 'alone' || e !== pd));
      w.recOut = { push: v === 'both' ? [{ at: 2, row: inc }, { at: 2, row: pd }] : [{ at: 2, row: inc }] };
    });
    return JSON.stringify(r0);
  };
  const probe = async (v) => {
    const app = await boot({ native: true, seed: { kt_routine: older(v) } });
    try {
      const out = await app.page.evaluate(async () => {
        const wait = ms => new Promise(res => setTimeout(res, ms));
        const r = {}, c = currentWeek - 1, last = getTotalWeeks() - 1, orig = localStorage.getItem('kt_routine');
        // ~ = superset opener
        const day = (j) => getCustomRoutine().weeks[j == null ? c : j].push.map(e => e.name + (e.ss ? '~' : '')).join(' | ');
        _rtAddPick('Push', 'Incline Dumbbell Press'); await wait(10);
        r.add = [day(), day(last)];
        openDeckRunner('Push'); await wait(20);
        r.runner = runnerSession.exercises.map(e => e.name + (e.ss ? '~' : '')).join(' | ');
        closeDeckRunner(); runnerSession = null; localStorage.removeItem('kt_runner_draft');
        openRoutines(); _rtRestoreRemoved('Push'); await wait(10); closeRoutines();
        r.thenRestore = day();
        lsSet('kt_routine', JSON.parse(orig));
        openRoutines(); _rtRestoreRemoved('Push'); await wait(10); closeRoutines();
        r.restore = [day(), day(last)];
        return r;
      });
      assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
      return out;
    } finally { await app.close(); }
  };
  const C = 'Bench Press | Overhead Press | Incline Dumbbell Press~ | Cable Triceps Pushdown | Lateral Raise';
  const unpaired = 'Bench Press | Overhead Press | Incline Dumbbell Press | Lateral Raise';
  const both = await probe('both');
  assert(both.add.every(x => x === unpaired) && both.runner === unpaired, 'added back without its partner it pairs with nothing, in the runner too: ' + JSON.stringify(both));
  assert(both.thenRestore === C && both.restore.every(x => x === C), 'its partner restored after it, or both restored, pair again: ' + JSON.stringify(both));
  const alone = await probe('alone');
  assert(alone.add.every(x => x === C) && alone.runner === C && alone.restore.every(x => x === C), 'back beside its partner it pairs: ' + JSON.stringify(alone));
  const coach = await probe('coach');
  assert(coach.add.every(x => x === unpaired) && coach.restore.every(x => x === unpaired), 'its partner gone from the programme: unpaired: ' + JSON.stringify(coach));
});

// T03 + T48 (regression from R08): the switch to lb took the programme's undo point: a coach
// reply's PLAN CHANGES Undo disappeared and Restore previous programme gave back the programme from
// before the switch, not from before the reply. The switch is no undo point; the restore point
// moves onto the new plates with the programme (and back to its exact kg loads), and the switch's
// own Undo puts both back. A kg owner's coach reply moves Bench from 72.5 to 80 kg.
seq('T03 + T48: a units switch keeps a coach reply\'s Undo and the programme from before it', async () => {
  const { SEED } = require('../lib/harness');
  const LB = 2.2046226218, kgGrid = (lb) => Math.round(Math.max(1.25, Math.round(lb / LB / 1.25) * 1.25) * LB * 10) / 10;
  const kgR = JSON.parse(SEED.kt_routine);
  kgR.weeks.forEach(w => ['push', 'pull', 'legs'].forEach(k => (w[k] || []).forEach(e => { if (e.weight > 0) e.weight = kgGrid(e.weight); })));
  const app = await boot({ native: true, seed: { kt_routine: JSON.stringify(kgR), kt_unit_w: 'kg', kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1, sc = 'coach:turn:t03';
      const bench = (cr) => fmtW((cr || getCustomRoutine()).weeks[c].push.find(e => e.name === 'Bench Press').weight);
      const unit = async (u) => { switchTab('settings'); await wait(20); [...document.querySelectorAll('.kt-units-opt')].find(b => b.textContent === u).click(); await wait(30); };
      const offLb = (cr) => { let n = 0; cr.weeks.forEach(w => ['push', 'pull', 'legs'].forEach(k => (w[k] || []).forEach(e => { if (e.weight > 0 && Math.abs(Math.round(e.weight / 2.5) * 2.5 - e.weight) > 0.01) n++; }))); return n; };
      _coachTurnScope = sc;
      const input = { day: 'Push', exercise: 'Bench Press', action: 'change', weight: 80 };
      const res = executeCoachTool('edit_programme_exercise', input);
      _coachTurnScope = null;
      coachMessages.push({ role: 'assistant', content: 'Bench is 80 kg from this week.', _tools: [{ name: 'edit_programme_exercise', input, result: res, units: { w: 'kg', d: 'km' } }], _undo: sc });
      saveCoachHistory();
      const idx = coachMessages.length - 1, card = () => /Undo<\/button>/.test(_planChangeLedger(coachMessages[idx]._tools, idx));
      const reply = localStorage.getItem('kt_routine'), point = localStorage.getItem('kt_routine_backup');
      r.reply = { ok: res.ok, now: bench(), point: bench(lsGet('kt_routine_backup')), card: card() };
      await unit('lb');
      r.lb = { toast: document.getElementById('toast').textContent, card: card(), scope: localStorage.getItem('kt_routine_backup_scope'), now: bench(), point: bench(lsGet('kt_routine_backup')), off: offLb(getCustomRoutine()) + offLb(lsGet('kt_routine_backup')) };
      await unit('kg');
      r.kg = { card: card(), same: localStorage.getItem('kt_routine') === reply, pointSame: localStorage.getItem('kt_routine_backup') === point };
      // the switch's own Undo puts the programme and the restore point back as they were
      await unit('lb');
      document.querySelector('#toast .kt-toast-undo').click(); await wait(20);
      r.undone = { card: card(), same: localStorage.getItem('kt_routine') === reply, pointSame: localStorage.getItem('kt_routine_backup') === point };
      await unit('kg');
      // in lb the reply's Undo gives the programme from before the reply, on lb plates
      await unit('lb');
      _ledgerUndo(idx); document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(30);
      r.replyUndo = { now: bench(), off: offLb(getCustomRoutine()) };
      return r;
    });
    assert(out.reply.ok && out.reply.now === '80 kg' && out.reply.point === '72.5 kg' && out.reply.card, 'the reply, its Undo and its restore point: ' + JSON.stringify(out.reply));
    assert(/^Programme loads moved onto lb plates/.test(out.lb.toast) && out.lb.card && out.lb.scope === 'coach:turn:t03' && out.lb.now === '177.5 lb' && out.lb.point === '160 lb' && out.lb.off === 0, 'in lb the reply\'s Undo stays, its restore point on lb plates too: ' + JSON.stringify(out.lb));
    assert(out.kg.card && out.kg.same && out.kg.pointSame, 'back in kg both are exactly as they were: ' + JSON.stringify(out.kg));
    assert(out.undone.card && out.undone.same && out.undone.pointSame, 'the switch\'s Undo puts both back, the reply\'s Undo stays: ' + JSON.stringify(out.undone));
    assert(out.replyUndo.now === '160 lb' && out.replyUndo.off === 0, 'the reply undone in lb: the programme from before it, on lb plates: ' + JSON.stringify(out.replyUndo));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// T05 (incomplete R08): a lift a day lists twice (a top set and back-off sets) came back from lb
// with only its first row exact: the second stayed on lb plates (102.5 kg read 102). Every row and
// the restore point (a Routines visit before the switch) come back exactly.
seq('T05: kg to lb and back is exact for a lift listed twice on a day', async () => {
  const { SEED } = require('../lib/harness');
  const LB = 2.2046226218, kgW = (kg) => Math.round(kg * LB * 10) / 10;
  const kgR = JSON.parse(SEED.kt_routine);
  kgR.weeks.forEach((w, i) => {
    w.push = [{ name: 'Bench Press', sets: 1, reps: 3, weight: kgW(105 + i * 1.25), isMain: true },
      { name: 'Bench Press', sets: 3, reps: 6, weight: kgW(91.25 + i * 1.25) }, { name: 'Overhead Press', sets: 4, reps: 8, weight: kgW(46.25) }];
  });
  const app = await boot({ native: true, seed: { kt_routine: JSON.stringify(kgR), kt_unit_w: 'kg' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1;
      const unit = async (u) => { switchTab('settings'); await wait(20); [...document.querySelectorAll('.kt-units-opt')].find(b => b.textContent === u).click(); await wait(30); };
      // a Routines change first, so Restore previous programme holds the day as it was
      openRoutines(); _rtOpenEdit('Push', 'Overhead Press'); _rtEdit.w = 47.5; _rtSave(); await wait(10); closeRoutines();
      const prog = localStorage.getItem('kt_routine'), point = localStorage.getItem('kt_routine_backup');
      const onLb = () => getCustomRoutine().weeks.every(w => w.push.every(e => Math.abs(Math.round(e.weight / 2.5) * 2.5 - e.weight) < 0.01));
      r.kgDay = getCustomRoutine().weeks[c].push.map(e => fmtW(e.weight)).join(' | ');
      await unit('lb');
      r.onLb = onLb();
      openDeckRunner('Push'); await wait(20);
      const b = runnerSession.exercises[0], top = getCustomRoutine().weeks[c].push.map(e => e.weight);
      r.runner = b.name === 'Bench Press' && JSON.stringify(b.weights) === JSON.stringify([top[0], top[1], top[1], top[1]]);
      closeDeckRunner(); runnerSession = null; localStorage.removeItem('kt_runner_draft');
      await unit('kg');
      r.same = localStorage.getItem('kt_routine') === prog; r.pointSame = localStorage.getItem('kt_routine_backup') === point;
      r.day = getCustomRoutine().weeks[c].push.map(e => fmtW(e.weight)).join(' | ');
      return r;
    });
    assert(out.onLb && out.runner, 'in lb every row on lb plates, the runner\'s back-off sets too: ' + JSON.stringify(out));
    assert(out.same && out.pointSame && out.day === out.kgDay, 'back in kg the top set and the back-offs are exact, the restore point too: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// T06 (incomplete R08): only the switch moved a programme onto lb plates, so a kg-built programme
// put back after it (Programme History, Restore previous programme, a backup file) kept its kg
// plates for good in lb (148.8 lb, "+1.9 / side"; the launch sweep keeps a programme that reads as
// kg on its grid). Put back in lb it goes onto lb plates with no undo point, and the way back to
// kg gives it its exact kg loads. A kg owner: programme B now, A (built in kg) in Programme History.
seq('T06: a kg programme put back while the owner reads lb goes onto lb plates', async () => {
  const { SEED } = require('../lib/harness');
  const LB = 2.2046226218, kgGrid = (lb) => Math.round(Math.max(1.25, Math.round(lb / LB / 1.25) * 1.25) * LB * 10) / 10;
  const A = JSON.parse(SEED.kt_routine); A.name = 'Programme A';
  A.weeks.forEach(w => ['push', 'pull', 'legs'].forEach(k => (w[k] || []).forEach(e => { if (e.weight > 0) e.weight = kgGrid(e.weight); })));
  const B = JSON.parse(JSON.stringify(A)); B.name = 'Programme B';
  B.weeks.forEach(w => ['push', 'pull', 'legs'].forEach(k => (w[k] || []).forEach(e => { if (e.weight > 0) e.weight = kgGrid(e.weight * 1.05); })));
  const launch = async (seed, fn, arg) => {
    const app = await boot({ native: true, seed });
    try {
      const out = await app.page.evaluate(fn, arg);
      assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
      return out;
    } finally { await app.close(); }
  };
  // loads off the lb plate grid, programme-wide
  const OFF = `(cr) => { let n = 0; (cr.weeks || []).forEach(w => ['push', 'pull', 'legs'].forEach(k => (w[k] || []).forEach(e => { if (e.weight > 0 && Math.abs(Math.round(e.weight / 2.5) * 2.5 - e.weight) > 0.01) n++; }))); return n; }`;
  const a = await launch({ kt_routine: JSON.stringify(B), kt_unit_w: 'kg' }, async ({ A, OFF }) => {
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const off = eval(OFF), r = {};
    lsSet('kt_routine_archive', [{ id: 1111, archivedAt: addDays(todayISO(), -30), routine: A }]);
    switchTab('settings'); await wait(20); [...document.querySelectorAll('.kt-units-opt')].find(b => b.textContent === 'lb').click(); await wait(30);
    openRoutineArchiveModal(); await wait(10);
    [...document.querySelectorAll('#routine-archive-modal button')].find(b => b.textContent === 'Restore this programme').click(); await wait(10);
    document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(30);
    r.name = getCustomRoutine().name; r.off = off(getCustomRoutine()); r.scope = localStorage.getItem('kt_routine_backup_scope');
    openDeckRunner('Push'); await wait(20);
    r.runner = runnerSession.exercises.every(e => !(e.weight > 0) || Math.abs(Math.round(e.weight / 2.5) * 2.5 - e.weight) < 0.01);
    closeDeckRunner(); runnerSession = null; localStorage.removeItem('kt_runner_draft');
    r.keep = {}; ['kt_routine', 'kt_routine_backup', 'kt_routine_archive', 'kt_unit_regrid', 'kt_week', 'kt_week_monday'].forEach(k => { const v = localStorage.getItem(k); if (v != null) r.keep[k] = v; });
    return r;
  }, { A, OFF });
  assert(a.name === 'Programme A' && a.off === 0 && a.runner && /^history:/.test(a.scope), 'Programme History in lb: every load on lb plates, the runner too: ' + JSON.stringify(a));
  // relaunched in lb nothing moves; then Settings > Units > kg gives A its exact kg loads
  const back = await launch(Object.assign({ kt_unit_w: 'lb' }, a.keep), async (A) => {
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const r = { stored: localStorage.getItem('kt_routine') };
    switchTab('settings'); await wait(20); [...document.querySelectorAll('.kt-units-opt')].find(b => b.textContent === 'kg').click(); await wait(30);
    const diffs = [];
    getCustomRoutine().weeks.forEach((w, j) => ['push', 'pull', 'legs'].forEach(k => (w[k] || []).forEach((e, i) => { if (Math.abs(A.weeks[j][k][i].weight - e.weight) > 0.01) diffs.push((j + 1) + ' ' + e.name); })));
    r.diffs = diffs;
    return r;
  }, A);
  assert(back.stored === a.keep.kt_routine && !back.diffs.length, 'a relaunch keeps the lb plates; back in kg A is exactly as built: ' + JSON.stringify(back.diffs));
  // Restore previous programme in lb, the restore point on kg plates (taken before the switch on 20261006-1)
  const b = await launch({ kt_routine: JSON.stringify(B), kt_routine_backup: JSON.stringify(A), kt_routine_backup_scope: 'units', kt_unit_w: 'lb' }, async (OFF) => {
    const wait = ms => new Promise(res => setTimeout(res, ms));
    restoreRoutineBackup(); document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(30);
    return { name: getCustomRoutine().name, off: eval(OFF)(getCustomRoutine()) };
  }, OFF);
  assert(b.name === 'Programme A' && b.off === 0, 'Restore previous programme in lb: on lb plates: ' + JSON.stringify(b));
  // a backup file restored in lb: its programme and its restore point
  const c = await launch({ kt_unit_w: 'lb' }, async ({ A, B, OFF }) => {
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const data = buildBackupJSON(); data.kt_routine = A; data.kt_routine_backup = B; data.kt_unit_w = 'lb';
    const ok = _applyImportedData(data); await wait(20);
    return { ok, off: eval(OFF)(getCustomRoutine()), offPoint: eval(OFF)(lsGet('kt_routine_backup')) };
  }, { A, B, OFF });
  assert(c.ok && c.off === 0 && c.offPoint === 0, 'a backup file in lb: on lb plates: ' + JSON.stringify(c));
});

// U01 (incomplete T01): the owner's Make main was read off the coach's main still on the day,
// marked for its tag alone, so an edit of that lift (Routines, the coach's set_exercise_weight or
// edit_programme_exercise) or a day the coach wrote with no main lost the choice to the next
// rewrite, and the day could end with no main at all. The choice is now the row's own flag.
seq('U01: Make main stays the owner\'s through edits of the lift it replaced and on a day with no coach main; a day keeps one main', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1;
      // ! = main, + = added by the owner, * = marked
      const day = (k, j) => (getCustomRoutine().weeks[j == null ? c : j][k] || []).map(e => e.name + ' ' + e.sets + 'x' + e.reps + '@' + e.weight + (e.isMain ? '!' : '') + (e.rec === null ? '+' : e.rec ? '*' : '')).join(' | ');
      const mains = (k) => getCustomRoutine().weeks.slice(c).map(w => (w[k] || []).filter(e => e.isMain).map(e => e.name).join('+') || '-');
      const line = (n) => (buildSystemPrompt().match(new RegExp(' {2}' + n + ':[^\\n]*')) || [''])[0];
      const orig = localStorage.getItem('kt_routine');
      const coachPush = () => [{ name: 'Bench Press', sets: 4, reps: 6, weight: 165, isMain: true }, { name: 'Overhead Press', sets: 4, reps: 6, weight: 105 },
        { name: 'Incline Dumbbell Press', sets: 3, reps: 10, weight: 60 }, { name: 'Cable Triceps Pushdown', sets: 3, reps: 12, weight: 55 }, { name: 'Lateral Raise', sets: 3, reps: 15, weight: 17.5 }];
      const rewrite = (k, rows) => executeCoachTool('update_routine_weeks', { weeks: [{ wk: currentWeek, bName: 'BUILD', bColor: '#0a43f5', [k]: rows }] });
      const makeMain = async (slot, n) => { openRoutines(); _rtOpenEdit(slot, n); _rtMakeMain(); await wait(10); closeRoutines(); };
      // (A) Make main on Overhead Press, then Bench down to 3 sets (the secondary lift now)
      await makeMain('Push', 'Overhead Press');
      openRoutines(); _rtOpenEdit('Push', 'Bench Press'); _rtStep('sets', -1); _rtSave(); await wait(10); closeRoutines();
      r.A_prompt = line('Overhead Press');
      const a = rewrite('push', coachPush());
      r.A = { day: day('push'), kept: a.keptUserEdits, mains: mains('push'), stored: JSON.stringify(a.stored), prompt: [line('Bench Press'), line('Overhead Press')] };
      // (B') the coach sets Bench's load: not the owner's edit; the rewrite keeps the owner's main
      lsSet('kt_routine', JSON.parse(orig));
      await makeMain('Push', 'Overhead Press');
      executeCoachTool('set_exercise_weight', { name: 'Bench Press', weight: 170 });
      r.Bp_prompt = line('Bench Press');
      rewrite('push', coachPush());
      r.Bp = day('push');
      // (B) the coach changes Bench itself: Use coach's on the owner's main, and Reset, still leave one main
      lsSet('kt_routine', JSON.parse(orig));
      await makeMain('Push', 'Overhead Press');
      executeCoachTool('edit_programme_exercise', { day: 'Push', exercise: 'Bench Press', action: 'change', sets: 5, reps: 5 });
      const edited = localStorage.getItem('kt_routine');
      r.B_prompt = line('Overhead Press');
      openRoutines(); _rtUseCoach('Push', 'Overhead Press'); await wait(10); closeRoutines();
      r.B_useCoach = day('push');
      lsSet('kt_routine', JSON.parse(edited));
      openRoutines(); document.querySelector('#rt-card-Push .kt-rt-reset').click(); await wait(5); document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(10); closeRoutines();
      r.B_reset = day('push');
      lsSet('kt_routine', JSON.parse(edited));
      const b = rewrite('push', coachPush());
      r.B = { day: day('push'), kept: b.keptUserEdits, next: day('push', c + 1) };
      // (F) a Pull day the coach wrote with no main: the owner's Lat Pulldown stays main through a rewrite
      lsSet('kt_routine', JSON.parse(orig));
      const crF = getCustomRoutine(); crF.weeks.forEach(w => w.pull.forEach(e => { delete e.isMain; })); setCustomRoutine(crF);
      await makeMain('Pull', 'Lat Pulldown');
      const f = rewrite('pull', getCustomRoutine().weeks[c].pull.map(e => ({ name: e.name, sets: e.sets, reps: e.reps, weight: e.weight })));
      r.F = { day: day('pull'), kept: f.keptUserEdits, prompt: line('Lat Pulldown') };
      // Make main back on the coach's main: no marks are left
      lsSet('kt_routine', JSON.parse(orig));
      await makeMain('Push', 'Overhead Press'); await makeMain('Push', 'Bench Press');
      r.back = { day: day('push'), flags: getCustomRoutine().weeks.slice(c).some(w => w.push.some(e => e.mainBy)) };
      // a Make main saved by an older page (no flag) still holds through a rewrite
      lsSet('kt_routine', JSON.parse(orig));
      await makeMain('Push', 'Overhead Press');
      const crL = getCustomRoutine(); crL.weeks.forEach(w => w.push.forEach(e => { delete e.mainBy; })); setCustomRoutine(crL);
      r.L_prompt = line('Overhead Press');
      rewrite('push', coachPush());
      r.L = day('push');
      return r;
    });
    const rest = ' | Incline Dumbbell Press 3x10@60 | Cable Triceps Pushdown 3x12@55 | Lateral Raise 3x15@17.5';
    assert(/\(main\) \[main lift chosen by the user\]$/.test(out.A_prompt), 'the coach is told the main is the owner\'s pick after the edit: ' + out.A_prompt);
    assert(out.A.day === 'Bench Press 3x8@160* | Overhead Press 4x6@105!*' + rest && JSON.stringify(out.A.kept) === '["Bench Press","Overhead Press"]', 'the owner\'s Bench edit and their main both stand: ' + JSON.stringify(out.A));
    assert(out.A.mains.every(x => x === 'Overhead Press'), 'every week keeps one main, the owner\'s: ' + JSON.stringify(out.A.mains));
    assert(/"Overhead Press 4×6 105 lb \(main lift: the user’s choice\)"/.test(out.A.stored) && /\[main lift chosen by the user\]$/.test(out.A.prompt[1]), 'the readback and the prompt say so: ' + JSON.stringify(out.A));
    assert(/^ {2}Bench Press: 4×8 @ 170 lb RPE\S* *$/.test(out.Bp_prompt), 'the coach\'s load is not called the owner\'s edit: ' + out.Bp_prompt);
    assert(out.Bp === 'Bench Press 4x6@165* | Overhead Press 4x6@105!*' + rest, 'after set_exercise_weight the rewrite keeps the owner\'s main: ' + out.Bp);
    assert(/\[main lift chosen by the user\]$/.test(out.B_prompt), 'the coach\'s change to Bench keeps the owner\'s main theirs: ' + out.B_prompt);
    assert(out.B_useCoach === 'Bench Press 5x5@160! | Overhead Press 4x8@100' + rest && out.B_reset === out.B_useCoach, 'Use coach\'s and Reset give the day its main back: ' + JSON.stringify([out.B_useCoach, out.B_reset]));
    assert(out.B.day === 'Bench Press 4x6@165* | Overhead Press 4x6@105!*' + rest && JSON.stringify(out.B.kept) === '["Overhead Press"]' && /^Bench Press 5x5@162\.5\* \| Overhead Press 4x8@102\.5!\*/.test(out.B.next), 'the rewrite keeps the owner\'s main: ' + JSON.stringify(out.B));
    assert(out.F.day === 'Barbell Row 4x8@150 | Lat Pulldown 4x10@135!* | Seated Cable Row 3x12@115 | Face Pull 3x15@35 | Barbell Curl 3x10@70' && JSON.stringify(out.F.kept) === '["Lat Pulldown"]' && /\[main lift chosen by the user\]$/.test(out.F.prompt), 'a day with no coach main keeps the owner\'s: ' + JSON.stringify(out.F));
    assert(out.back.day === 'Bench Press 4x8@160! | Overhead Press 4x8@100' + rest && !out.back.flags, 'Make main back on the coach\'s main leaves no mark: ' + JSON.stringify(out.back));
    assert(/\[main lift chosen by the user\]$/.test(out.L_prompt) && out.L === 'Bench Press 4x6@165* | Overhead Press 4x6@105!*' + rest, 'an older page\'s Make main still holds: ' + JSON.stringify([out.L_prompt, out.L]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// U20 + U03 (regression from T20): the coach merge folded the coach's repeated rows of a lift into
// one when the stored day held that lift once with a mark that only moved the main tag (Make main,
// a removed main's tag handed on), where nothing of the owner's stands for them: a loaded row plus
// a bodyweight row lost the bodyweight row, a top set and its back-offs became one row at the top
// set's RPE, a superset partner between them was unpaired, and the readback the coach checks read
// every set at the top set's load. T20's own fold (an owner's row standing for the lift) still runs,
// and the readback prints each set's load.
seq('U20 + U03: a mark that only moved the main tag does not fold the coach\'s rows; the readback reads each set\'s load', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1;
      const fmt = e => e.name + ' ' + e.sets + 'x' + JSON.stringify(e.reps) + '@' + JSON.stringify(e.weights || e.weight) + (e.rpe ? ' rpe' + e.rpe : '') + (e.isMain ? ' main' : '') + (e.ss ? ' ss' : '');
      const day = (k) => (getCustomRoutine().weeks[c][k] || []).map(fmt);
      const orig = localStorage.getItem('kt_routine');
      const runner = async (slot) => { openDeckRunner(slot, true); await wait(20); const x = runnerSession.exercises.map(fmt); closeDeckRunner(); runnerSession = null; localStorage.removeItem('kt_runner_draft'); return x; };
      const makeMain = async (slot, n) => { openRoutines(); _rtOpenEdit(slot, n); _rtMakeMain(); await wait(10); closeRoutines(); };
      const rewrite = (k, rows) => executeCoachTool('update_routine_weeks', { weeks: [{ wk: currentWeek, bName: 'BUILD', bColor: '#0a43f5', [k]: rows }] });
      // the coach's Pull: weighted Pull Up (main), Barbell Row, Face Pull; the owner makes Barbell Row main
      const cr = getCustomRoutine();
      cr.weeks.forEach(w => { w.pull = [{ name: 'Pull Up', sets: 3, reps: 5, weight: 30, isMain: true }, { name: 'Barbell Row', sets: 4, reps: 8, weight: 140 }, { name: 'Face Pull', sets: 3, reps: 15, weight: 35 }]; });
      setCustomRoutine(cr);
      const pull = localStorage.getItem('kt_routine');
      await makeMain('Pull', 'Barbell Row');
      const a = rewrite('pull', [{ name: 'Pull Up', sets: 3, reps: 5, weight: 30, isMain: true }, { name: 'Barbell Row', sets: 4, reps: 8, weight: 140 }, { name: 'Pull Up', sets: 2, reps: 'AMRAP', weight: 0 }, { name: 'Face Pull', sets: 3, reps: 15, weight: 35 }]);
      r.made = { day: day('pull'), kept: a.keptUserEdits, runner: await runner('Pull') };
      // the owner removed the coach's main (its tag went to Barbell Row); the coach writes Barbell Row twice around a superset
      lsSet('kt_routine', JSON.parse(pull));
      openRoutines(); _rtOpenEdit('Pull', 'Pull Up'); _rtRemove(); await wait(5); document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(10); closeRoutines();
      const b = rewrite('pull', [{ name: 'Barbell Row', sets: 1, reps: 5, weight: 165, isMain: true }, { name: 'Face Pull', sets: 3, reps: 15, weight: 35, ss: true }, { name: 'Barbell Row', sets: 3, reps: 8, weight: 135 }]);
      r.handed = { day: day('pull'), kept: b.keptUserEdits };
      // U03: Make main on Overhead Press; the coach writes Bench as a top single plus back-offs
      lsSet('kt_routine', JSON.parse(orig));
      await makeMain('Push', 'Overhead Press');
      const d = rewrite('push', [{ name: 'Bench Press', sets: 1, reps: 3, weight: 185, rpe: 9, isMain: true }, { name: 'Bench Press', sets: 3, reps: 6, weight: 155, rpe: 7 }, { name: 'Overhead Press', sets: 4, reps: 6, weight: 105 }, { name: 'Lateral Raise', sets: 3, reps: 15, weight: 17.5 }]);
      r.top = { day: day('push'), stored: d.stored.weeks[currentWeek]['Push [Push]'] };
      // T20's own case: the runner's one row of five sets stands for the coach's two; the readback reads each set
      lsSet('kt_routine', JSON.parse(orig));
      const two = () => [{ name: 'Bench Press', sets: 1, reps: 3, weight: 225, isMain: true, rpe: 8 }, { name: 'Overhead Press', sets: 3, reps: 8, weight: 100, ss: true, rpe: 7 }, { name: 'Bench Press', sets: 3, reps: 8, weight: 185, rpe: 7 }, { name: 'Lateral Raise', sets: 3, reps: 15, weight: 20, rpe: 7 }];
      const cr4 = getCustomRoutine(); cr4.weeks.forEach(w => { w.push = two(); }); setCustomRoutine(cr4);
      _commitRoutine(x => { _progMergeLift(x.weeks[c], 'push', 'Bench Press'); return _progSetScheme(x, 'push', 'Bench Press', c, 'sets', 5, { markOwner: true }); }, { scope: 'runner:u20' });
      const e = rewrite('push', two());
      r.t20 = { day: day('push'), stored: e.stored.weeks[currentWeek]['Push [Push]'] };
      return r;
    });
    const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
    assert(same(out.made.day, ['Pull Up 3x5@30', 'Barbell Row 4x8@140 main', 'Pull Up 2x"AMRAP"@0', 'Face Pull 3x15@35']) && same(out.made.kept, ['Barbell Row']), 'both of the coach\'s Pull Up rows are stored; the owner\'s main stands: ' + JSON.stringify(out.made));
    assert(/^Pull Up 5x\[5,5,5,"AMRAP","AMRAP"\]@\[30,30,30,0,0\]/.test(out.made.runner[0]) && /^Barbell Row 4x8@140.* main$/.test(out.made.runner[1]), 'the runner trains all five Pull Up sets: ' + JSON.stringify(out.made.runner));
    assert(same(out.handed.day, ['Barbell Row 1x5@165 main', 'Face Pull 3x15@35 ss', 'Barbell Row 3x8@135']), 'a handed-on tag leaves the coach\'s rows as sent, the superset paired: ' + JSON.stringify(out.handed));
    assert(same(out.top.day.slice(0, 3), ['Bench Press 1x3@185 rpe9', 'Bench Press 3x6@155 rpe7', 'Overhead Press 4x6@105 main']), 'the top single and its back-offs stay two rows, each at its RPE: ' + JSON.stringify(out.top.day));
    assert(same(out.top.stored.slice(0, 2), ['Bench Press 1×3 185 lb', 'Bench Press 3×6 155 lb']), 'the readback reads both rows: ' + JSON.stringify(out.top.stored));
    assert(/^Bench Press 5x\[3,8,8,8\]@\[225,185,185,185\] rpe8 main$/.test(out.t20.day[0]) && out.t20.stored[0] === 'Bench Press 5×3,8,8,8 225/185/185/185 lb (user’s edit kept)', 'the owner\'s one row still stands for the coach\'s two, read set by set: ' + JSON.stringify(out.t20));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// U05 (incomplete T02): the coach merge re-recorded a removed opener's partner under the owner's
// swap of it (ssTo 'Skull Crusher'), where the owner's removal records the coach's lift: once Use
// coach's renamed the swap back, Restore and Reset brought the opener back unpaired. The coach
// supersets Incline Dumbbell Press with Cable Triceps Pushdown.
seq('U05: a coach rewrite keeps a removed opener\'s partner by the coach\'s name; Use coach\'s, Restore and Reset pair them again', async () => {
  const r0 = JSON.parse(require('../lib/harness').SEED.kt_routine);
  r0.weeks.forEach(w => { w.push.find(e => e.name === 'Incline Dumbbell Press').ss = true; });
  const app = await boot({ native: true, seed: { kt_routine: JSON.stringify(r0) } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, c = currentWeek - 1, last = getTotalWeeks() - 1;
      // ! = main, ~ = superset opener, + = added by the owner, * = marked
      const day = (j) => getCustomRoutine().weeks[j == null ? c : j].push.map(e => e.name + (e.isMain ? '!' : '') + (e.ss ? '~' : '') + (e.rec === null ? '+' : e.rec ? '*' : '')).join(' | ');
      const ssTo = () => (((getCustomRoutine().weeks[c].recOut || {}).push || []).find(e => e.row.name === 'Incline Dumbbell Press') || {}).ssTo;
      const remove = async (n) => { openRoutines(); _rtOpenEdit('Push', n); _rtRemove(); await wait(5); document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(10); closeRoutines(); };
      // the owner swaps the partner, then removes the opener; the coach rewrites the week as it wrote it
      openRoutines(); _rtOpenEdit('Push', 'Cable Triceps Pushdown'); _rtEdit.swapTo = 'Skull Crusher'; _rtSave(); await wait(10); closeRoutines();
      await remove('Incline Dumbbell Press');
      executeCoachTool('update_routine_weeks', { weeks: [{ wk: currentWeek, bName: 'BUILD', bColor: '#0a43f5', push: [{ name: 'Bench Press', sets: 4, reps: 8, weight: 160, isMain: true }, { name: 'Overhead Press', sets: 4, reps: 8, weight: 100 },
        { name: 'Incline Dumbbell Press', sets: 3, reps: 10, weight: 60, ss: true }, { name: 'Cable Triceps Pushdown', sets: 3, reps: 12, weight: 55 }, { name: 'Lateral Raise', sets: 3, reps: 15, weight: 17.5 }] }] });
      const rewritten = localStorage.getItem('kt_routine');
      r.kept = { day: day(), ssTo: ssTo() };
      openRoutines(); _rtUseCoach('Push', 'Skull Crusher'); await wait(10); _rtRestoreRemoved('Push'); await wait(10); closeRoutines();
      r.restored = [day(), day(last)];
      lsSet('kt_routine', JSON.parse(rewritten));
      openRoutines(); document.querySelector('#rt-card-Push .kt-rt-reset').click(); await wait(5); document.querySelector('.kt-close-sheet [id$="ok"]').click(); await wait(10); closeRoutines();
      r.reset = [day(), day(last)];
      return r;
    });
    const C = 'Bench Press! | Overhead Press | Incline Dumbbell Press~ | Cable Triceps Pushdown | Lateral Raise';
    assert(out.kept.day === 'Bench Press! | Overhead Press | Skull Crusher* | Lateral Raise' && out.kept.ssTo === 'Cable Triceps Pushdown', 'the rewrite keeps the owner\'s swap and the coach\'s partner name: ' + JSON.stringify(out.kept));
    assert(out.restored.every(x => x === C), 'Use coach\'s then Restore gives the coach\'s superset back in every week: ' + JSON.stringify(out.restored));
    assert(out.reset.every(x => x === C), 'Reset gives it back too: ' + JSON.stringify(out.reset));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
