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
