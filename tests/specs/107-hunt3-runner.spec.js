// Hunt 3 (2026-10-04) fixes, runner group:
// - H05 one card per lift: a swap (picker or Save) onto a lift another card holds is refused, and
//   a day that lists a lift twice (top set + back-off as two rows) is one card with per-set targets,
//   saved once.
// - M02 a workout that runs past midnight is filed on the day it began (Log date, week, after a cold
//   launch too), its wrist copy folds into it, and Save lifts to Health still writes it.
// - M31 undoing the top set of a top-set/back-off scheme puts the weight stepper back on the top
//   set's load (it stayed on the back-off load and the redone set was filed at it).
// - M32 removing the second half of a superset unpairs the first half: it rests, it never pairs
//   with the lift that moved up, no superset is filed, and a pending pair return is dropped.
// - M34 the runner Edit sheet on a 'Max' row: the reps field is empty with 'Max' as its hint, a swap
//   or a load change saves and keeps 'Max' (in the programme too, with Apply), typed reps are still
//   an edit; untouched reps keep a range or per-set reps, an untouched load keeps per-set loads
//   (on the same lift: a swap drops them, R28).
// - M33 kg: a load that reads the same as the record (a programme load from the lb grid, a coach
//   load) is not a new record: no live beat, no PR on the session, one RECORD HISTORY line; a real
//   step up still is, lb is unchanged, and the records follow a unit switch.
// - L12 the COMPLETE sheet's 'Vs last' and insight compare a backdated workout with the same day
//   logged before it (the share card's rule), and read '—' when there is none.
// - L13 kg: the runner Edit sheet's weight stepper steps from the exact load onto the 0.25 kg grid,
//   like the runner's own stepper (it stepped from the 0.5 kg display: 80 kg + 3 steps stored 83.25).
// - L14 a correction typed on a superset partner's set during the shared rest stays with that set:
//   the first lift's EDIT shows its own numbers and ✓ keeps them; the partner's card still has it;
//   a typed correction on a plain card still survives the rest's end.
// - L15 the PR toast at finish names the record's load (it showed the working weight, which a
//   backdated finish leaves alone, or nothing without one); a bodyweight lift shows its added load.
// - L16 after '+1 set' the rest Live Activity and the rest alert name the set the runner names
//   (set 6 past a 4-set plan, no 'of 4'; build 57's view drops 'OF m' itself), and +30s resends it.
// Review of those fixes (2026-10-06):
// - R27 the watch gets the folded card too (today and the week ahead, each row's load resolved
//   first, the cached routine untouched), and a wrist session that sends a lift's log under two
//   rows is filed once, as the main lift.
// - R28 a swap in the Edit sheet drops the old lift's per-set loads (it keeps the per-set reps): the
//   new lift's stepper stays where it is set after each set and after Undo, the wrist gets no old
//   loads, and the sets are filed (and the record set) at the new lift's load.
// - R29 'Also update my programme' on a card folded from two rows reaches every row: the lift
//   becomes one row with the card's per-set targets from this week on (+1 set is one more
//   back-off set, a swap takes every set, a removal takes every row and Restore brings it back
//   whole, Use coach's gives the coach's sets back); rows that cannot be one are left alone.
// - R30 a workout that ran past midnight, filed on the day it began, is no backfill: a lighter one
//   sets the working weight; a day picked before it still only raises one, and a newer log stands.
// - R31 Save lifts to Health writes a workout filed on the day before only while it is live (a set
//   within the hour): a draft left in the evening and finished after midnight is not written, and
//   the window ends with the last set (Log all and sets from the wrist count), not at Finish.
const { boot, assert, run } = require('../lib/harness');

run('H05 a swap onto a lift already in the session is refused', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      const snap = n => [runnerCompleted[n] || 0, (runnerRepsLog[n] || []).slice(), (runnerWeightsLog[n] || []).slice()];
      switchTab('log'); switchLogSub('workout'); await wait(20);
      openDeckRunner('Push'); await wait(20);
      const A = runnerSession.exercises[0].name, B = runnerSession.exercises[1].name;
      runnerEngaged = true; runnerSetWeight(185);
      [5, 8, 8].forEach(rep => { runnerSetReps(rep); runnerCompleteSet(); runnerSkipRest(); runnerEngaged = true; });
      runnerGoTo(1); runnerEngaged = true; runnerSetWeight(60);
      [10, 8].forEach(rep => { runnerSetReps(rep); runnerCompleteSet(); runnerSkipRest(); runnerEngaged = true; });
      r.A = A; r.B = B;
      r.before = { A: snap(A), B: snap(B) };
      // Edit on the second card > Change > the first card's lift
      runnerEngaged = false; paintRunner(); await wait(20);
      openRunnerExEdit(1); await wait(20);
      const change = [...document.querySelectorAll('#runner-ex-edit-sheet button')].find(b => /Change/.test(b.textContent) && b.textContent.indexOf(B) >= 0);
      change.click(); await wait(20);
      const pick = [...document.querySelectorAll('#runner-ex-picker-list button')].find(b => (b.querySelector('div > div') || {}).textContent === A);
      pick.click(); await wait(20);
      r.toast = (document.getElementById('toast') || {}).textContent;
      r.pickerOpen = !!document.getElementById('runner-ex-picker-list');
      r.editName = _rExEditName;
      // Save refuses it too, whatever route set the name
      _closeRunnerExPicker(); _rExEditName = A; saveRunnerExEdit(); await wait(20);
      r.sheetOpenAfterSave = !!document.getElementById('runner-ex-edit-sheet');
      r.after = { cards: runnerSession.exercises.map(e => e.name), A: snap(A), B: snap(B) };
      // a free lift is still a swap, and its logs follow the card
      _rExEditName = 'Arnold Press'; saveRunnerExEdit(); await wait(20);
      r.swapped = { cards: runnerSession.exercises.map(e => e.name), C: snap('Arnold Press'), A: snap(A) };
      runnerFinishSession(); await wait(250);
      closeCompleteSheet();
      r.saved = getSessions()[0].exercises.map(e => e.name + ' ' + JSON.stringify(e.reps));
      return r;
    });
    assert(/already in today/.test(out.toast) && out.pickerOpen && out.editName === out.B, 'the picker refuses the lift another card holds: ' + JSON.stringify([out.toast, out.pickerOpen, out.editName]));
    assert(out.sheetOpenAfterSave, 'Save refuses it and keeps the sheet open');
    assert(JSON.stringify(out.after.A) === JSON.stringify(out.before.A) && JSON.stringify(out.after.B) === JSON.stringify(out.before.B),
      'neither card\'s sets moved: ' + JSON.stringify([out.before, out.after]));
    assert(out.after.cards.filter(n => n === out.A).length === 1, 'one card per lift: ' + JSON.stringify(out.after.cards));
    assert(out.swapped.cards[1] === 'Arnold Press' && JSON.stringify(out.swapped.C[1]) === '[10,8]' && JSON.stringify(out.swapped.A) === JSON.stringify(out.before.A),
      'a free lift still swaps and keeps the card\'s sets: ' + JSON.stringify(out.swapped));
    assert(out.saved.length === 2 && out.saved[0] === out.A + ' [5,8,8]' && out.saved[1] === 'Arnold Press [10,8]', 'each lift saved once: ' + JSON.stringify(out.saved));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('H05 a lift listed twice on a day is one card with per-set targets', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      // A coach top set + back-off written as two rows, with the back-off row paired from above
      const cr = getCustomRoutine();
      cr.weeks[currentWeek - 1].push = [
        { name: 'Bench Press', sets: 1, reps: 3, weight: 225, isMain: true, rpe: 8 },
        { name: 'Overhead Press', sets: 3, reps: 8, weight: 100, ss: true, rpe: 7 },
        { name: 'Bench Press', sets: 3, reps: 8, weight: 185, rpe: 7 },
        { name: 'Lateral Raise', sets: 3, reps: 15, weight: 20, rpe: 7 }
      ];
      setCustomRoutine(cr);
      switchTab('log'); switchLogSub('workout'); await wait(20);
      openDeckRunner('Push'); await wait(20);
      r.cards = runnerSession.exercises.map(e => [e.name, e.sets, e.reps, e.weights || null, !!e.ss]);
      r.seed = [runnerWeights['Bench Press'], runnerReps['Bench Press']];
      runnerEngaged = true; runnerCompleteSet(); if (runnerResting) runnerSkipRest();
      r.next = [runnerWeights['Bench Press'], runnerReps['Bench Press']];
      runnerEngaged = true;
      [8, 8, 8].forEach(() => { runnerCompleteSet(); if (runnerResting) runnerSkipRest(); runnerEngaged = true; });
      r.done = runnerCompleted['Bench Press'];
      runnerFinishSession(); await wait(250);
      closeCompleteSheet();
      r.saved = getSessions()[0].exercises.map(e => [e.name, e.reps, e.weightLog]);
      return r;
    });
    assert(JSON.stringify(out.cards) === JSON.stringify([
      ['Bench Press', 4, [3, 8, 8, 8], [225, 185, 185, 185], false],
      ['Overhead Press', 3, 8, null, false],
      ['Lateral Raise', 3, 15, null, false]
    ]), 'the repeat folds into the first card and its partner above is no longer paired: ' + JSON.stringify(out.cards));
    assert(JSON.stringify(out.seed) === '[225,3]' && JSON.stringify(out.next) === '[185,8]', 'the top set, then the back-off: ' + JSON.stringify([out.seed, out.next]));
    assert(out.done === 4, 'four sets on the one card: ' + out.done);
    assert(JSON.stringify(out.saved) === JSON.stringify([['Bench Press', [3, 8, 8, 8], [225, 185, 185, 185]]]), 'saved once, set by set: ' + JSON.stringify(out.saved));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('M02 a workout that runs past midnight is filed on the day it began', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      // began at 23:30 yesterday, finished now
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 30).getTime();
      const startISO = _ymdLocal(new Date(start));
      r.startISO = startISO; r.week = weekForDate(startISO);
      window.__hk = [];
      Capacitor.Plugins.TrovoHealth = { saveLift: a => { window.__hk.push(a); return Promise.resolve({}); } };
      localStorage.setItem('kt_health_write', '1');
      switchTab('log'); switchLogSub('workout'); await wait(20);
      openDeckRunner('Push'); await wait(20);
      runnerSession.startedAt = start;
      const A = runnerSession.exercises[0].name, last = runnerSession.exercises.length - 1;
      runnerEngaged = true; runnerSetWeight(185);
      [5, 8, 8].forEach(rep => { runnerSetReps(rep); runnerCompleteSet(); runnerSkipRest(); runnerEngaged = true; });
      // the wrist finished first: the drain filed its copy by its start, with a set the phone missed
      const sess = getSessions();
      sess.unshift({ id: Date.now(), date: startISO, type: 'Push', label: 'Push', week: r.week, note: 'From Apple Watch', prs: [],
        wristStartedAt: new Date(start).toISOString(),
        exercises: [{ name: A, sets: 4, reps: [5, 8, 8, 6], weight: 185, weightLog: [185, 185, 185, 185], rpe: 7 }] });
      lsSet('kt_sessions', sess);
      // a cold launch after midnight: the draft comes back and is resumed
      _flushRunnerDraft();
      runnerOpen = false; runnerSession = null; runnerCompleted = {}; runnerRepsLog = {}; runnerWeightsLog = {};
      r.restored = _restoreRunnerDraft(); resumeRunnerDraft(); await wait(20);
      runnerGoTo(last); runnerLogAllAtTarget(); await wait(20);
      r.field = (document.getElementById('runner-date') || {}).value;
      runnerFinishSession(); await wait(250);
      closeCompleteSheet();
      r.recs = getSessions().filter(s => s.startedAt === start || (s.note === 'From Apple Watch' && s.date >= startISO))
        .map(s => ({ date: s.date, week: s.week, note: s.note, A: (s.exercises.find(e => e.name === A) || {}).reps }));
      r.hk = window.__hk.length;
      return r;
    });
    assert(out.restored && out.field === out.startISO, 'the Log date is the day it began: ' + JSON.stringify([out.restored, out.field, out.startISO]));
    assert(out.recs.length === 1, 'one record, the wrist copy folded in: ' + JSON.stringify(out.recs));
    const rec = out.recs[0];
    assert(rec.date === out.startISO && rec.week === out.week && rec.note === '' && JSON.stringify(rec.A) === '[5,8,8,6]',
      'filed on that day and week with the wrist\'s extra set: ' + JSON.stringify([rec, out.startISO, out.week]));
    assert(out.hk === 1, 'Save lifts to Health still writes it: ' + out.hk);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('M31 undoing a top set puts the stepper back on its load', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      const cr = getCustomRoutine();
      cr.weeks[currentWeek - 1].push.forEach(e => { if (e.name === 'Bench Press') { e.sets = 3; e.reps = [3, 8, 8]; e.weights = [225, 185, 185]; e.weight = 225; } });
      setCustomRoutine(cr);
      switchTab('log'); switchLogSub('workout'); await wait(20);
      openDeckRunner('Push'); await wait(20);
      const st = () => [runnerWeights['Bench Press'], runnerReps['Bench Press']];
      runnerEngaged = true; runnerCompleteSet(); await wait(20);
      r.afterTop = st();
      runnerUndoSet('Bench Press', 0); await wait(20);
      r.afterUndo = st();
      r.inputs = [...document.querySelectorAll('#runner-root .kt-eng-row input')].map(i => i.value);
      r.target = (document.querySelector('#runner-root .kt-eng-target') || {}).textContent;
      runnerCompleteSet(); await wait(20);
      r.relogged = [runnerWeightsLog['Bench Press'].slice(), runnerRepsLog['Bench Press'].slice()];
      r.next = st();
      closeDeckRunner();
      return r;
    });
    assert(JSON.stringify(out.afterTop) === '[185,8]', 'logging the top set moves on to the back-off: ' + JSON.stringify(out.afterTop));
    assert(JSON.stringify(out.afterUndo) === '[225,3]' && out.inputs[0] === '225' && out.inputs[1] === '3' && /225/.test(out.target),
      'Undo puts the steppers back on the top set: ' + JSON.stringify([out.afterUndo, out.inputs, out.target]));
    assert(JSON.stringify(out.relogged) === '[[225],[3]]' && JSON.stringify(out.next) === '[185,8]', 'the redone top set is filed at its load: ' + JSON.stringify([out.relogged, out.next]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('M32 removing the second half of a superset unpairs the first', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      const cr = getCustomRoutine();
      cr.weeks[currentWeek - 1].push.forEach(e => { if (e.name === 'Bench Press' || e.name === 'Incline Dumbbell Press') e.ss = true; });
      setCustomRoutine(cr);
      switchTab('log'); switchLogSub('workout'); await wait(20);
      openDeckRunner('Push'); await wait(20);
      const names = () => runnerSession.exercises.map(e => e.name + (e.ss ? '(ss)' : ''));
      r.before = names();
      // 1. Overhead Press (Bench's partner) removed before any set
      openRunnerExEdit(1); runnerExRemove(); await wait(20);
      r.after1 = names();
      runnerGoTo(0); runnerEngaged = true; runnerCompleteSet(); await wait(20);
      r.benchSet = { card: _runnerEx().name, resting: runnerResting };
      runnerSkipRest();
      // 2. Incline + Pushdown: the pushdown's set starts the pair's rest, then it is removed
      const ii = runnerSession.exercises.findIndex(e => e.name === 'Incline Dumbbell Press');
      runnerGoTo(ii); runnerEngaged = true; runnerCompleteSet(); await wait(20);
      r.handoff = _runnerEx().name;
      runnerCompleteSet(); await wait(20);
      r.pairRest = { resting: runnerResting, returnsTo: _ssReturnIdx };
      openRunnerExEdit(runnerExIdx); runnerExRemove(); await wait(20);
      const ok = [...document.querySelectorAll('.kt-close-sheet button')].find(b => /^\s*Remove\s*$/.test(b.textContent));
      ok.click(); await wait(20);
      r.after2 = { names: names(), card: _runnerEx().name, returnsTo: _ssReturnIdx };
      runnerEngaged = true; runnerCompleteSet(); await wait(20);
      runnerSkipRest(); await wait(20);
      r.afterRest = _runnerEx().name;
      runnerFinishSession(); await wait(250);
      closeCompleteSheet();
      const s = getSessions()[0];
      r.saved = { supersets: s.supersets || null, ss: s.exercises.filter(e => e.ss).map(e => e.name) };
      return r;
    });
    assert(JSON.stringify(out.after1) === JSON.stringify(['Bench Press', 'Incline Dumbbell Press(ss)', 'Cable Triceps Pushdown', 'Lateral Raise']),
      'the first half is unpaired: ' + JSON.stringify([out.before, out.after1]));
    assert(out.benchSet.card === 'Bench Press' && out.benchSet.resting, 'its set rests instead of jumping to the next lift: ' + JSON.stringify(out.benchSet));
    assert(out.handoff === 'Cable Triceps Pushdown' && out.pairRest.resting && out.pairRest.returnsTo != null, 'the pair still runs as a pair: ' + JSON.stringify([out.handoff, out.pairRest]));
    assert(JSON.stringify(out.after2.names) === JSON.stringify(['Bench Press', 'Incline Dumbbell Press', 'Lateral Raise']) && out.after2.card === 'Lateral Raise' && out.after2.returnsTo === null,
      'removing the second half mid-rest unpairs the first and drops the return: ' + JSON.stringify(out.after2));
    assert(out.afterRest === 'Lateral Raise', 'the next rest stays on the card it was on: ' + out.afterRest);
    assert(out.saved.supersets === null && out.saved.ss.length === 0, 'no superset is filed: ' + JSON.stringify(out.saved));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('M34 the Edit sheet saves a swap or a load change on a Max row and keeps Max', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      const toasts = []; const ot = window.showToast; window.showToast = function (m) { toasts.push(m); return ot.apply(this, arguments); };
      // a coach-written Pull Up 3 x Max from this week on
      const cr = getCustomRoutine(), c = currentWeek - 1;
      for (let i = c; i < cr.weeks.length; i++) (cr.weeks[i].pull = cr.weeks[i].pull || []).splice(1, 0, { name: 'Pull Up', sets: 3, reps: 'Max', weight: 0, rpe: 8 });
      setCustomRoutine(cr);
      switchTab('log'); switchLogSub('workout'); await wait(20);
      openDeckRunner('Pull'); await wait(20);
      runnerGoTo(runnerSession.exercises.findIndex(e => e.name === 'Pull Up')); await wait(20);
      [...document.querySelectorAll('#runner-root button')].find(b => /^Edit( exercise)?$/.test(b.textContent.trim())).click(); await wait(20);
      const ri = document.getElementById('runner-ex-reps-input');
      r.field = [ri.value, ri.placeholder];
      // Change > Chin Up, Also update my programme, Save
      [...document.querySelectorAll('#runner-ex-edit-sheet button')].find(b => /Change/.test(b.textContent) && /Pull Up/.test(b.textContent)).click(); await wait(20);
      const q = document.getElementById('runner-ex-picker-q'); q.value = 'Chin'; q.dispatchEvent(new Event('input', { bubbles: true })); await wait(20);
      [...document.querySelectorAll('#runner-ex-picker-list button')].find(b => /^Chin Up/.test(b.textContent.trim())).click(); await wait(20);
      [...document.querySelectorAll('#runner-ex-edit-sheet button')].find(b => /Also update my programme/.test(b.textContent)).click(); await wait(20);
      [...document.querySelectorAll('#runner-ex-edit-sheet button')].find(b => /Save Changes/.test(b.textContent)).click(); await wait(50);
      r.swap = { card: _runnerEx().name, reps: _runnerEx().reps, sheetOpen: !!document.getElementById('runner-ex-edit-modal'), refused: toasts.some(t => /at least 1/.test(t)), logAllOk: _logAllOk(_runnerEx()) };
      const cr2 = getCustomRoutine();
      r.programme = cr2.weeks.slice(c).map(w => (w.pull || []).filter(e => /Pull Up|Chin Up/.test(e.name)).map(e => e.name + ' ' + e.sets + 'x' + e.reps).join(','));
      // a load change alone (weighted chins)
      openRunnerExEdit(runnerExIdx); runnerExEditStepWeight(wDisp(10)); saveRunnerExEdit(); await wait(20);
      r.load = { reps: _runnerEx().reps, loaded: _runnerEx().weight > 0, sheetOpen: !!document.getElementById('runner-ex-edit-modal') };
      // a cleared field is no edit; typed reps are
      openRunnerExEdit(runnerExIdx); runnerExEditSetReps(''); saveRunnerExEdit(); await wait(20);
      r.cleared = _runnerEx().reps;
      openRunnerExEdit(runnerExIdx); runnerExEditSetReps('10'); saveRunnerExEdit(); await wait(20);
      r.typed = [_runnerEx().reps, runnerReps['Chin Up']];
      // untouched reps keep per-set reps on a swap, but never the old lift's loads (R28); an edited load drops them too
      const ex0 = runnerSession.exercises[0];
      ex0.sets = 3; ex0.reps = [3, 8, 8]; ex0.weights = [225, 185, 185]; ex0.weight = 225;
      runnerWeights[ex0.name] = 225; runnerReps[ex0.name] = 3; runnerGoTo(0);
      openRunnerExEdit(0); _rExEditName = 'Pendlay Row'; saveRunnerExEdit(); await wait(20);
      r.perSet = [runnerSession.exercises[0].name, runnerSession.exercises[0].reps, runnerSession.exercises[0].weights || null];
      openRunnerExEdit(0); _rExEditWeight = 135; saveRunnerExEdit(); await wait(20);
      r.perSetLoad = [runnerSession.exercises[0].reps, runnerSession.exercises[0].weights || null, runnerSession.exercises[0].weight];
      // a range stays a range when only the sets change; a bumped stepper stays bumped
      const ex2 = runnerSession.exercises[2];
      ex2.reps = '8-10'; runnerReps[ex2.name] = 10;
      openRunnerExEdit(2); _rExEditSets = 4; saveRunnerExEdit(); await wait(20);
      r.range = [runnerSession.exercises[2].sets, runnerSession.exercises[2].reps, runnerReps[runnerSession.exercises[2].name]];
      window.showToast = ot;
      closeDeckRunner();
      return r;
    });
    assert(out.field[0] === '' && out.field[1] === 'Max', 'the reps field is empty with Max as its hint: ' + JSON.stringify(out.field));
    assert(out.swap.card === 'Chin Up' && out.swap.reps === 'Max' && !out.swap.sheetOpen && !out.swap.refused && !out.swap.logAllOk,
      'the swap saves and keeps Max (no Log all): ' + JSON.stringify(out.swap));
    assert(out.programme.length > 0 && out.programme.every(t => t === 'Chin Up 3xMax'), 'the programme keeps Max: ' + JSON.stringify(out.programme));
    assert(out.load.reps === 'Max' && out.load.loaded && !out.load.sheetOpen, 'a load change saves and keeps Max: ' + JSON.stringify(out.load));
    assert(out.cleared === 'Max', 'a cleared field is no edit: ' + out.cleared);
    assert(JSON.stringify(out.typed) === '[10,10]', 'typed reps are an edit: ' + JSON.stringify(out.typed));
    assert(JSON.stringify(out.perSet) === JSON.stringify(['Pendlay Row', [3, 8, 8], null]), 'a swap keeps the per-set reps, not the old lift’s loads: ' + JSON.stringify(out.perSet));
    assert(JSON.stringify(out.perSetLoad) === JSON.stringify([[3, 8, 8], null, 135]), 'an edited load replaces the per-set loads: ' + JSON.stringify(out.perSetLoad));
    assert(JSON.stringify(out.range) === JSON.stringify([4, '8-10', 10]), 'a range stays a range: ' + JSON.stringify(out.range));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('M33 kg: a load that reads the same as the record is not a new record', async () => {
  const app = await boot({ native: true, seed: { kt_unit_w: 'kg', kt_weights: '{}', kt_prs: '{}', kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      // the record: 61 kg typed a week ago; the programme still says 135 lb (written on the lb grid)
      const rec = wStore('61');
      lsSet('kt_sessions', [{ id: Date.now() - 7 * 864e5, date: addDays(todayISO(), -7), type: 'Push', label: 'Push', week: currentWeek, note: '', prs: ['Bench Press'],
        exercises: [{ name: 'Bench Press', isMain: true, sets: 1, reps: [5], weight: rec, weightLog: [rec], rpe: 8, rpeLog: [8] }] }]);
      recomputePRs();
      const cr = getCustomRoutine();
      cr.weeks[currentWeek - 1].push.forEach(e => { if (e.name === 'Bench Press') { e.weight = 135; delete e.weights; } });
      setCustomRoutine(cr);
      switchTab('log'); switchLogSub('workout'); await wait(20);
      openDeckRunner('Push'); await wait(20);
      r.shown = [fmtW(runnerWeights['Bench Press']), fmtW(getPRs()['Bench Press'])];
      runnerSession.exercises = runnerSession.exercises.filter(e => e.name === 'Bench Press');
      runnerExIdx = 0; runnerEngaged = true; runnerSetReps(5); runnerCompleteSet(); await wait(20);
      r.beat = !!_runnerPrBeat;
      r.eyebrow = !!document.querySelector('#runner-root .kt-pr-eyebrow');
      runnerFinishSession(); await wait(250);
      closeCompleteSheet();
      r.prs = getSessions()[0].prs;
      r.history = (_prChain('Bench Press') || []).length;
      // the coach's 61.25 kg is stored as 135 lb and reads 61 kg too; a real step up is a record
      r.coach = _prBeats(_coachLoadIn(61.25), rec);
      r.up = _prBeats(wStore('62.5'), rec);
      // the records follow a unit switch (lb counts the 135 over the 134.5)
      setUnitW('lb'); await wait(20);
      r.lb = { history: (_prChain('Bench Press') || []).length, cache: getPRs()['Bench Press'], beats: _prBeats(135, rec) };
      setUnitW('kg'); await wait(20);
      r.kgAgain = { history: (_prChain('Bench Press') || []).length, cache: getPRs()['Bench Press'] };
      return r;
    });
    assert(out.shown[0] === out.shown[1], 'the programme load reads the same as the record: ' + JSON.stringify(out.shown));
    assert(!out.beat && !out.eyebrow, 'no live record beat: ' + JSON.stringify([out.beat, out.eyebrow]));
    assert(Array.isArray(out.prs) && out.prs.length === 0 && out.history === 1, 'no PR filed and one RECORD HISTORY line: ' + JSON.stringify([out.prs, out.history]));
    assert(out.coach === false && out.up === true, 'a coach load that reads the same is not a record, a real step up is: ' + JSON.stringify([out.coach, out.up]));
    assert(out.lb.history === 2 && out.lb.cache === 135 && out.lb.beats === true, 'in lb the heavier load is a record: ' + JSON.stringify(out.lb));
    assert(out.kgAgain.history === 1 && out.kgAgain.cache === 134.5, 'back in kg the ledger and the cache follow: ' + JSON.stringify(out.kgAgain));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L12 the COMPLETE sheet compares a backdated workout with the day before it', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      const pushes = getSessions().filter(s => s.type === 'Push' && (s.exercises || []).length).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id);
      r.pushes = pushes.map(s => s.date);
      const finishOn = async (date) => {
        openDeckRunner('Push', true); await wait(20);
        runnerSession.exercises = runnerSession.exercises.slice(0, 1);
        runnerSessionDate = date;
        runnerExIdx = 0; runnerEngaged = true; runnerSetWeight(135);
        [8, 8, 8].forEach(rep => { runnerSetReps(rep); runnerCompleteSet(); if (runnerResting) runnerSkipRest(); runnerEngaged = true; });
        const df = document.getElementById('runner-date'); if (df) df.value = date;
        runnerFinishSession(); await wait(250);
        const sh = document.getElementById('completeSheetOverlay');
        const o = {
          tile: sh ? [...sh.querySelectorAll('.kt-cmp-tile')].map(t => t.textContent.replace(/\s+/g, ' ').trim()).find(t => /^Vs last/.test(t)) : null,
          insight: (document.getElementById('kt-complete-insight') || {}).textContent || ''
        };
        closeCompleteSheet();
        const rec = getSessions().filter(s => s.date === date && s.type === 'Push').sort((a, b) => b.id - a.id)[0];
        o.date = rec && rec.date; o.vsLast = rec ? _shareCardModel(rec).vsLast : 'none';
        o.vol = rec ? calcVolume(rec.exercises) : 0;
        return o;
      };
      // before every logged Push: nothing to compare with
      r.first = await finishOn(addDays(pushes[0].date, -7));
      // between the first two: compared with the first, as the share card does
      const mid = addDays(pushes[0].date, 1);
      r.midOk = mid < pushes[1].date;
      r.mid = await finishOn(mid);
      const pv = calcVolume(pushes[0].exercises);
      r.expect = Math.round((r.mid.vol - pv) / pv * 100);
      return r;
    });
    assert(out.pushes.length >= 2 && out.midOk, 'the demo seed has two Push days a few days apart: ' + JSON.stringify(out.pushes));
    assert(out.first.date && /^Vs last .*\u2014$/.test(out.first.tile) && out.first.vsLast === null && !/Lighter than last time|Volume up/.test(out.first.insight),
      'no earlier day reads \u2014 and the insight compares nothing: ' + JSON.stringify(out.first));
    const pct = (out.expect > 0 ? '+' : '') + out.expect + '%';
    assert(out.mid.tile && out.mid.tile.endsWith(pct) && out.mid.vsLast === out.expect,
      'a day between two is compared with the one before it, like the share card: ' + JSON.stringify([out.mid, out.expect]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L13 kg: the Edit sheet weight stepper lands where the runner stepper does', async () => {
  const app = await boot({ native: true, seed: { kt_unit_w: 'kg' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      switchTab('log'); switchLogSub('workout'); await wait(20);
      openDeckRunner('Push'); await wait(20);
      const n = runnerSession.exercises[0].name;
      runnerWeights[n] = wStore('80'); runnerExIdx = 0;
      openRunnerExEdit(0); await wait(20);
      [1, 2, 3].forEach(() => runnerExEditStepWeight(1.25));
      r.sheet = _rExEditWeight;
      r.shown = document.getElementById('runner-ex-weight-input').value;
      runnerExEditStepWeight(1.25); runnerExEditStepWeight(-1.25);
      r.roundTrip = _rExEditWeight;
      saveRunnerExEdit(); await wait(20);
      r.saved = runnerWeights[n];
      runnerWeights[n] = wStore('80');
      [1, 2, 3].forEach(() => runnerStepWeight(wStepLb()));
      r.runner = runnerWeights[n];
      r.grid = wStore('83.75'); r.gridShown = String(wDisp(r.grid));
      closeDeckRunner();
      return r;
    });
    assert(out.sheet === out.grid && out.runner === out.grid && out.saved === out.grid, 'three 1.25 kg steps from 80 kg store 83.75 kg, as the runner stepper does: ' + JSON.stringify(out));
    assert(out.roundTrip === out.grid, 'a step up and back lands on the same load: ' + JSON.stringify(out));
    assert(out.shown === out.gridShown, 'the field shows the load: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L14 a correction typed on a superset partner stays with that set', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      const cr = getCustomRoutine();
      cr.weeks[currentWeek - 1].push.forEach(e => { if (e.name === 'Bench Press') e.ss = true; });
      setCustomRoutine(cr);
      switchTab('log'); switchLogSub('workout'); await wait(20);
      const field = () => [(document.getElementById('kt-edit-w') || {}).value, (document.getElementById('kt-edit-r') || {}).value];
      const editRow = i => [...document.querySelectorAll('#runner-root .kt-lr-act')][i];
      const tick = () => [...document.querySelectorAll('#runner-root button')].find(b => b.textContent.trim() === '\u2713');
      const restEnds = async () => { runnerRestEndsAt = Date.now() - 1000; _restFinish(); await wait(20); };
      const pairSet = async (wa, ra, wb, rb) => {
        runnerEngaged = true; runnerSetWeight(wa); runnerSetReps(ra); runnerCompleteSet(); await wait(20);
        runnerSetWeight(wb); runnerSetReps(rb); runnerCompleteSet(); await wait(20);
      };
      openDeckRunner('Push'); await wait(20);
      const A = runnerSession.exercises[0].name, B = runnerSession.exercises[1].name;
      await pairSet(185, 5, 95, 8);
      r.pairRest = [_runnerEx().name, runnerResting];
      // during the shared rest: EDIT on the partner's S1, a correction typed, then the rest ends
      editRow(0).click(); await wait(20);
      document.getElementById('kt-edit-w').value = '100'; document.getElementById('kt-edit-r').value = '9';
      await restEnds();
      r.back = _runnerEx().name;
      // back on the first lift: its EDIT shows its own set, and the tick keeps it
      runnerEngaged = false; paintRunner(); await wait(20);
      editRow(0).click(); await wait(20);
      r.firstField = field();
      tick().click(); await wait(20);
      r.first = [runnerWeightsLog[A][0], runnerRepsLog[A][0]];
      r.partner = [runnerWeightsLog[B][0], runnerRepsLog[B][0]];
      // second round: the partner's typed correction is still on its own card after the jump back
      runnerGoTo(0); await pairSet(185, 5, 95, 8);
      editRow(1).click(); await wait(20);
      document.getElementById('kt-edit-w').value = '97.5'; document.getElementById('kt-edit-r').value = '7';
      await restEnds();
      r.back2 = _runnerEx().name;
      runnerGoTo(1); await wait(20);
      r.partnerField = field();
      // a plain card: a typed correction survives the rest's end
      const ii = runnerSession.exercises.findIndex((e, i) => i > 1 && !e.ss && !(runnerSession.exercises[i - 1] || {}).ss);
      runnerGoTo(ii); runnerEngaged = true; runnerSetWeight(50); runnerSetReps(10); runnerCompleteSet(); await wait(20);
      r.plainRest = runnerResting;
      editRow(0).click(); await wait(20);
      document.getElementById('kt-edit-w').value = '55'; document.getElementById('kt-edit-r').value = '11';
      await restEnds();
      r.plainField = field();
      closeDeckRunner();
      r.A = A; r.B = B;
      return r;
    });
    assert(out.pairRest[0] === out.B && out.pairRest[1] === true && out.back === out.A && out.back2 === out.A, 'the pair rests on the partner and lands back on the first lift: ' + JSON.stringify([out.pairRest, out.back, out.back2]));
    assert(JSON.stringify(out.firstField) === '["185","5"]' && JSON.stringify(out.first) === '[185,5]', 'the first lift\'s EDIT shows its own set and keeps it: ' + JSON.stringify([out.firstField, out.first]));
    assert(JSON.stringify(out.partner) === '[95,8]', 'the partner\'s set is unchanged: ' + JSON.stringify(out.partner));
    assert(JSON.stringify(out.partnerField) === '["97.5","7"]', 'the partner\'s card still has its typed correction: ' + JSON.stringify(out.partnerField));
    assert(out.plainRest && JSON.stringify(out.plainField) === '["55","11"]', 'a typed correction on a plain card survives the rest: ' + JSON.stringify([out.plainRest, out.plainField]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

const prToast = async (weights, lift) => {
  const app = await boot({ native: true, seed: { kt_weights: weights } });
  try {
    const out = await app.page.evaluate(async (lift) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      const benchDates = getSessions().filter(s => (s.exercises || []).some(e => e.name === 'Bench Press')).map(s => s.date).sort();
      const date = addDays(benchDates[0], -3);   // before every Bench log: the working weight stays
      r.workingBefore = getWeights()['Bench Press'] || null;
      switchTab('log'); switchLogSub('workout'); await wait(20);
      openDeckRunner('Push'); await wait(20);
      runnerSession.exercises = [Object.assign({}, lift)];
      runnerWeights = {}; runnerReps = {}; runnerWeights[lift.name] = lift.weight; runnerReps[lift.name] = lift.reps;
      runnerSessionDate = date;
      runnerExIdx = 0; runnerEngaged = true;
      for (let i = 0; i < lift.sets; i++) { runnerCompleteSet(); if (runnerResting) runnerSkipRest(); runnerEngaged = true; }
      const df = document.getElementById('runner-date'); if (df) df.value = date;
      const seen = []; const ot = window.showToast; window.showToast = function (m, k) { seen.push(m); return ot.apply(this, arguments); };
      runnerFinishSession(); await wait(250);
      window.showToast = ot;
      closeCompleteSheet();
      r.toast = seen.find(t => /^PR/.test(t)) || seen.join(' | ');
      r.record = getPRs()[lift.name];
      r.workingAfter = getWeights()['Bench Press'] || null;
      return r;
    }, lift);
    out.errors = app.errors.slice();
    return out;
  } finally { await app.close(); }
};

run('L15 the PR toast at finish names the record\'s load', async () => {
  const bench = { name: 'Bench Press', sets: 2, reps: 5, weight: 180, rpe: 8 };
  const a = await prToast('{"Bench Press":160}', bench);
  assert(a.workingBefore === 160 && a.workingAfter === 160 && a.record === 180, 'a backdated record leaves the working weight: ' + JSON.stringify(a));
  assert(a.toast === 'PR · Bench Press 180 lb', 'the toast names the record\'s load, not the working weight: ' + JSON.stringify(a));
  const b = await prToast('{}', bench);
  assert(b.toast === 'PR · Bench Press 180 lb', 'with no working weight the toast still names the load: ' + JSON.stringify(b));
  const c = await prToast('{}', { name: 'Pull Up', sets: 2, reps: 6, weight: 25, rpe: 8 });
  assert(c.toast === 'PR · Pull Up +25 lb', 'a bodyweight lift names its added load: ' + JSON.stringify(c));
  assert(!a.errors.length && !b.errors.length && !c.errors.length, 'no page errors: ' + a.errors.concat(b.errors, c.errors).join('|'));
});

run('L16 after +1 set the Live Activity and the alert name the next set past the plan', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      window.__tt = []; window.__ln = [];
      Capacitor.Plugins.TrovoTimer = { startTimer: a => { window.__tt.push(a); return Promise.resolve({}); }, endTimer: () => Promise.resolve({}) };
      Capacitor.Plugins.LocalNotifications.checkPermissions = () => Promise.resolve({ display: 'granted' });
      Capacitor.Plugins.LocalNotifications.schedule = a => { window.__ln.push(a); return Promise.resolve({}); };
      const last = () => { const a = window.__tt[window.__tt.length - 1], n = window.__ln[window.__ln.length - 1]; return { set: a && a.nextSet, of: a && a.totalSets, alert: n && n.notifications[0].body }; };
      switchTab('log'); switchLogSub('workout'); await wait(20);
      openDeckRunner('Push'); await wait(20);
      const ex = runnerSession.exercises[0];
      r.name = ex.name; r.planned = ex.sets;
      runnerEngaged = true; runnerCompleteSet(); await wait(30);
      r.inPlan = last();
      runnerSkipRest(); runnerEngaged = true;
      for (let i = 1; i < ex.sets; i++) { runnerCompleteSet(); if (runnerResting) runnerSkipRest(); runnerEngaged = true; }
      runnerEngaged = false; paintRunner(); await wait(20);
      // +1 set on the done card, logged: the rest that follows
      [...document.querySelectorAll('#runner-root button')].find(b => b.textContent.trim() === '+1 set').click(); await wait(20);
      window.__tt.length = 0; window.__ln.length = 0;
      runnerCompleteSet(); await wait(30);
      r.extra = last();
      r.card = [...document.querySelectorAll('#runner-root div')].map(d => d.textContent.trim()).find(t => /^UP NEXT · SET \d+$/.test(t)) || '';
      window.__tt.length = 0; window.__ln.length = 0;
      runnerAddRest(30); await wait(30);
      r.plus30 = last();
      closeDeckRunner();
      return r;
    });
    const n = out.planned;
    assert(out.inPlan.set === 2 && out.inPlan.of === n && out.inPlan.alert === out.name + ' \u2014 set 2 of ' + n, 'an in-plan rest is unchanged: ' + JSON.stringify(out.inPlan));
    assert(out.card === 'UP NEXT · SET ' + (n + 2), 'the rest card names the set after the extra one: ' + out.card);
    assert(out.extra.set === n + 2 && out.extra.of === n, 'the Live Activity gets that set, past the plan: ' + JSON.stringify(out.extra));
    assert(out.extra.alert === out.name + ' \u2014 set ' + (n + 2), 'the alert names it with no "of": ' + JSON.stringify(out.extra));
    assert(JSON.stringify(out.plus30) === JSON.stringify(out.extra), '+30s resends the same set: ' + JSON.stringify(out.plus30));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R27: the H05 fold covered the phone runner only; the watch still got both rows and filed the lift twice.
run('R27 a lift listed twice is one card on the watch and is filed once from it', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      // every day a Push that lists Bench twice; the back-off row has no load (the working weight's)
      const cr = getCustomRoutine();
      cr.weekPlan = ['Push', 'Push', 'Push', 'Push', 'Push', 'Push', 'Push'];
      cr.weeks.forEach(w => {
        delete w.weekPlan;
        w.push = [
          { name: 'Bench Press', sets: 1, reps: 3, weight: 225, isMain: true, rpe: 8 },
          { name: 'Overhead Press', sets: 3, reps: 8, weight: 100, ss: true, rpe: 7 },
          { name: 'Bench Press', sets: 3, reps: 8, weight: 0, rpe: 7 },
          { name: 'Lateral Raise', sets: 3, reps: 15, weight: 20, rpe: 7 }
        ];
      });
      setCustomRoutine(cr);
      lsSet('kt_weights', Object.assign({}, getWeights(), { 'Bench Press': 190 }));
      await wait(30);
      const fmt = e => e.name + ' ' + e.sets + 'x' + (e.repsList ? JSON.stringify(e.repsList) : e.reps) + '@' + (e.weights ? JSON.stringify(e.weights) : e.weight)
        + (e.repsList ? ' first ' + e.reps + '@' + e.weight : '');
      _lastWatchPlan = ''; _pushWatchPlan(); await wait(20);
      const ctx = __mock.updateContext[__mock.updateContext.length - 1];
      const plan = JSON.parse(ctx.json), week = JSON.parse(ctx.week || '[]');
      r.today = [plan.type, plan.exercises.map(fmt)];
      r.ahead = week.filter(d => d.type === 'lift').map(d => JSON.stringify(d.exercises.map(fmt)));
      r.cache = getCustomRoutine().weeks[currentWeek - 1].push.map(e => e.name + ' ' + e.sets + 'x' + e.reps + '@' + e.weight + (e.ss ? ' ss' : ''));
      openDeckRunner('Push'); await wait(20);
      r.phone = runnerSession.exercises.map(e => e.name);
      closeDeckRunner(); await wait(20);
      // a watch that still holds the unfolded plan sends Bench's one log under both rows
      const iso = ms => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const startMs = Date.now() - 3600e3;
      const bench = { name: 'Bench Press', weight: 225, reps: [3, 8, 8, 8], weightLog: [225, 190, 190, 190], rpe: 8, rpeLog: [8, 8, 8, 8] };
      __mock.pending = [JSON.stringify({ dayName: _dayLabel('Push'), slot: 'Push', startedAt: iso(startMs), loggedAt: iso(Date.now() - 60e3),
        exercises: [bench, { name: 'Overhead Press', weight: 100, reps: [8, 8, 8], weightLog: [100, 100, 100], rpe: 7, rpeLog: [7, 7, 7] },
          Object.assign({}, bench, { weightLog: [225, 225, 225, 225] }),
          { name: 'Lateral Raise', weight: 20, reps: [15, 15, 15], weightLog: [20, 20, 20], rpe: 7, rpeLog: [7, 7, 7] }] })];
      window.showToast = () => {};
      await drainWatchSessions(); await wait(50);
      const s = getSessions()[0];
      r.saved = s ? s.exercises.map(e => e.name + ' ' + JSON.stringify(e.reps) + '@' + JSON.stringify(e.weightLog) + (e.isMain ? ' main' : '')) : null;
      r.queue = __mock.pending.length;
      return r;
    });
    const card = ['Bench Press 4x[3,8,8,8]@[225,190,190,190] first 3@225', 'Overhead Press 3x8@100', 'Lateral Raise 3x15@20'];
    assert(out.today[0] === 'lift' && JSON.stringify(out.today[1]) === JSON.stringify(card),
      'today’s wrist plan has one Bench card with its per-set targets: ' + JSON.stringify(out.today));
    assert(out.ahead.length === 6 && out.ahead.every(d => d === JSON.stringify(card)), 'so does every day of the week ahead: ' + JSON.stringify(out.ahead));
    assert(JSON.stringify(out.phone) === JSON.stringify(['Bench Press', 'Overhead Press', 'Lateral Raise']), 'the phone runner shows the same cards: ' + JSON.stringify(out.phone));
    assert(JSON.stringify(out.cache) === JSON.stringify(['Bench Press 1x3@225', 'Overhead Press 3x8@100 ss', 'Bench Press 3x8@0', 'Lateral Raise 3x15@20']),
      'the programme itself is untouched: ' + JSON.stringify(out.cache));
    assert(JSON.stringify(out.saved) === JSON.stringify(['Bench Press [3,8,8,8]@[225,190,190,190] main', 'Overhead Press [8,8,8]@[100,100,100]', 'Lateral Raise [15,15,15]@[20,20,20]']) && out.queue === 0,
      'the doubled wrist log is filed once, as the main lift: ' + JSON.stringify(out.saved));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R28: M34 kept per-set loads whenever the load was untouched, a swap included.
run('R28 a swap drops the old lift’s per-set loads', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      const toasts = []; const ot = window.showToast; window.showToast = function (m) { toasts.push(m); return ot.apply(this, arguments); };
      const M = 'Machine Chest Press';
      const cr = getCustomRoutine();
      cr.weeks[currentWeek - 1].push.forEach(e => { if (e.name === 'Bench Press') { e.sets = 3; e.reps = [3, 8, 8]; e.weights = [225, 185, 185]; e.weight = 225; } });
      setCustomRoutine(cr);
      switchTab('log'); switchLogSub('workout'); await wait(20);
      openDeckRunner('Push'); await wait(20);
      const i = runnerSession.exercises.findIndex(e => e.name === 'Bench Press');
      runnerGoTo(i); await wait(20);
      // the bench is taken: Edit > Change > the machine, the load left alone
      openRunnerExEdit(i); await wait(20);
      _rExEditName = M; saveRunnerExEdit(); await wait(20);
      const ex = runnerSession.exercises[i];
      r.swapped = [ex.name, ex.reps, ex.weights || null];
      _lastWatchPlan = ''; _pushWatchPlan(); await wait(20);
      const wr = JSON.parse(__mock.updateContext[__mock.updateContext.length - 1].json).exercises.find(e => e.name === M) || {};
      r.wrist = [wr.repsList || null, wr.weights || null];
      // the machine set to 100: set 1, Undo, then all three
      runnerEngaged = true; runnerSetWeight(100); runnerCompleteSet(); await wait(20);
      r.afterSet = runnerWeights[M];
      runnerUndoSet(M, 0); await wait(20);
      r.afterUndo = runnerWeights[M];
      [0, 1, 2].forEach(() => { runnerCompleteSet(); if (runnerResting) runnerSkipRest(); runnerEngaged = true; });
      runnerFinishSession(); await wait(250);
      closeCompleteSheet();
      r.filed = (getSessions()[0].exercises.find(e => e.name === M) || {}).weightLog;
      r.record = getPRs()[M];
      r.prToast = toasts.filter(t => /^PR/.test(t) && t.indexOf(M) >= 0);
      window.showToast = ot;
      return r;
    });
    assert(JSON.stringify(out.swapped) === JSON.stringify(['Machine Chest Press', [3, 8, 8], null]), 'the swap keeps the per-set reps, not the bench loads: ' + JSON.stringify(out.swapped));
    assert(JSON.stringify(out.wrist) === JSON.stringify([[3, 8, 8], null]), 'the wrist gets the reps and no bench loads: ' + JSON.stringify(out.wrist));
    assert(out.afterSet === 100 && out.afterUndo === 100, 'the stepper stays on the machine’s load after a set and after Undo: ' + JSON.stringify([out.afterSet, out.afterUndo]));
    assert(JSON.stringify(out.filed) === '[100,100,100]' && out.record === 100 && JSON.stringify(out.prToast) === JSON.stringify(['PR · Machine Chest Press 100 lb']),
      'filed and recorded at the machine’s load: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R29: the H05 card stood for both rows, but 'Also update my programme' wrote to the first row only.
const r29 = async (edit, mixed) => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async ({ edit, mixed }) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const toasts = []; const ot = window.showToast; window.showToast = function (m) { toasts.push(m); return ot.apply(this, arguments); };
      // every week's Push lists Bench twice: a top set, then back-off sets below Overhead Press's pair
      const rows = [
        { name: 'Bench Press', sets: 1, reps: 3, weight: 225, isMain: true, rpe: 8 },
        { name: 'Overhead Press', sets: 3, reps: 8, weight: 100, ss: true, rpe: 7 },
        { name: 'Bench Press', sets: 3, reps: 8, weight: mixed ? 0 : 185, rpe: 7 },
        { name: 'Lateral Raise', sets: 3, reps: 15, weight: 20, rpe: 7 }
      ];
      const cr = getCustomRoutine(), c = currentWeek - 1;
      cr.weeks.forEach(w => { w.push = JSON.parse(JSON.stringify(rows)); });
      setCustomRoutine(cr);
      if (edit.machine) lsSet('kt_weights', Object.assign({}, getWeights(), { 'Machine Chest Press': edit.machine }));
      const fmt = e => e.name + ' ' + e.sets + 'x' + JSON.stringify(e.reps) + '@' + JSON.stringify(e.weights || e.weight) + (e.isMain ? ' main' : '') + (e.ss ? ' ss' : '');
      const day = j => (getCustomRoutine().weeks[j].push || []).map(fmt);
      switchTab('log'); switchLogSub('workout'); await wait(20);
      openDeckRunner('Push'); await wait(20);
      const r = { c, dl: getCustomRoutine().weeks.map(w => _isDeloadWk(w)), card: fmt(runnerSession.exercises[0]) };
      // Edit on the folded card, 'Also update my programme' on
      openRunnerExEdit(0); await wait(20);
      if (edit.sets) _rExEditSets = edit.sets;
      if (edit.name) _rExEditName = edit.name;
      _rExEditApply = true;
      if (edit.remove) runnerExRemove(); else saveRunnerExEdit();
      await wait(20);
      r.session = fmt(runnerSession.exercises[0]);
      r.weeks = getCustomRoutine().weeks.map((w, j) => day(j));
      r.toasts = toasts.filter(t => /rogramme/.test(t));
      closeDeckRunner(); await wait(20);
      if (edit.next) { openDeckRunner('Push', true); await wait(20); r.next = fmt(runnerSession.exercises[0]); closeDeckRunner(); await wait(20); }
      if (edit.remove) { _rtRestoreRemoved('Push'); await wait(20); r.restored = day(c); }
      if (edit.useCoach) { _rtUseCoach('Push', 'Bench Press'); await wait(20); r.coach = day(c); }
      window.showToast = ot;
      return r;
    }, { edit, mixed: !!mixed });
    out.errors = app.errors.slice();
    return out;
  } finally { await app.close(); }
};

run('R29 an edit on a folded card with Also update my programme reaches every row of the lift', async () => {
  const two = ['Bench Press 1x3@225 main', 'Overhead Press 3x8@100 ss', 'Bench Press 3x8@185', 'Lateral Raise 3x15@20'];
  const early = o => o.weeks.slice(0, o.c).every(d => JSON.stringify(d) === JSON.stringify(two));
  // +1 set: one more back-off set (it made the top-set row 5x3@225, next to the back-off row)
  const a = await r29({ sets: 5, next: true, useCoach: true });
  assert(a.c > 0 && a.card === 'Bench Press 4x[3,8,8,8]@[225,185,185,185] main', 'the day folds into one card: ' + JSON.stringify([a.c, a.card]));
  const five = 'Bench Press 5x[3,8,8,8]@[225,185,185,185] main', rest = ['Overhead Press 3x8@100', 'Lateral Raise 3x15@20'];
  assert(a.weeks.slice(a.c).every((d, i) => JSON.stringify(d) === JSON.stringify([a.dl[a.c + i] ? 'Bench Press 4x[3,8,8,8]@[225,185,185,185] main' : five].concat(rest))),
    'from this week on the lift is one row with the extra back-off set (a deload keeps its sets): ' + JSON.stringify(a.weeks.slice(a.c)));
  assert(early(a), 'earlier weeks are untouched: ' + JSON.stringify(a.weeks.slice(0, a.c)));
  assert(a.next === five && JSON.stringify(a.toasts) === JSON.stringify(['Programme updated from this week on · keeps the climb']), 'the next session has the five sets: ' + JSON.stringify([a.next, a.toasts]));
  assert(JSON.stringify(a.coach) === JSON.stringify(['Bench Press 4x[3,8,8,8]@[225,185,185,185] main'].concat(rest)), 'Use coach’s gives the coach’s sets back: ' + JSON.stringify(a.coach));
  // a swap: every row of it (the back-off row stayed Bench Press and came back next time)
  const b = await r29({ name: 'Machine Chest Press', machine: 100 });
  assert(b.weeks.slice(b.c).every(d => JSON.stringify(d) === JSON.stringify(['Machine Chest Press 4x[3,8,8,8]@[100,82.5,82.5,82.5] main'].concat(rest))) && early(b),
    'the machine takes every set, at its own level: ' + JSON.stringify(b.weeks.slice(b.c)));
  // a removal: every row of it, and Restore brings the whole lift back
  const d = await r29({ remove: true });
  assert(d.weeks.slice(d.c).every(x => !x.some(t => /^Bench/.test(t))) && early(d), 'the lift leaves the day from this week on: ' + JSON.stringify(d.weeks.slice(d.c)));
  assert(JSON.stringify(d.restored) === JSON.stringify(['Bench Press 4x[3,8,8,8]@[225,185,185,185] main'].concat(rest)), 'Restore brings back every set of it: ' + JSON.stringify(d.restored));
  // rows that cannot be one (a load and 'your load'): the programme is left alone and says so
  const e = await r29({ sets: 5 }, true);
  assert(e.weeks.every(x => JSON.stringify(x) === JSON.stringify(two.map(t => t.replace('3x8@185', '3x8@0')))) && /^Bench Press 5x/.test(e.session)
    && JSON.stringify(e.toasts) === JSON.stringify(['Bench Press is on this day twice — the programme was not changed']),
    'a lift that cannot be one row is not half-written: ' + JSON.stringify([e.weeks[e.c], e.session, e.toasts]));
  assert(![a, b, d, e].some(o => o.errors.length), 'no page errors: ' + [a, b, d, e].map(o => o.errors.join('|')).join('|'));
});

// R30: M02 files a workout that ran past midnight on the day it began, which made it read as backdated.
run('R30 a lighter workout that ran past midnight sets the working weight', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]', kt_weights: '{"Bench Press":185}' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const cr = getCustomRoutine();
      cr.weeks[currentWeek - 1].push.forEach(e => { if (e.name === 'Bench Press') { e.weight = 0; delete e.weights; } });   // the working weight's
      setCustomRoutine(cr);
      const now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 30).getTime(), startISO = _ymdLocal(new Date(start));
      // began at 23:30 yesterday, three sets at 165, finished now; date: as filed, or a day the owner picked
      const finish = async (picked, newer) => {
        lsSet('kt_weights', { 'Bench Press': 185 });
        lsSet('kt_sessions', newer ? [{ id: Date.now() - 600e3, date: todayISO(), type: 'Pull', label: 'Pull', week: currentWeek, note: '', prs: [],
          exercises: [{ name: 'Bench Press', sets: 1, reps: [5], weight: 175, weightLog: [175] }] }] : []);
        switchTab('log'); switchLogSub('workout'); await wait(20);
        openDeckRunner('Push', true); await wait(20);
        runnerSession.startedAt = start;
        if (picked) runnerSessionDate = picked;
        runnerGoTo(runnerSession.exercises.findIndex(e => e.name === 'Bench Press')); runnerEngaged = true; runnerSetWeight(165);
        [0, 1, 2].forEach(() => { runnerCompleteSet(); if (runnerResting) runnerSkipRest(); runnerEngaged = true; });
        const df = document.getElementById('runner-date'); if (df && picked) df.value = picked;
        runnerFinishSession(); await wait(250);
        closeCompleteSheet();
        const s = getSessions().find(x => x.type === 'Push');
        return { filed: s && s.date, ww: getWeights()['Bench Press'], next: (_todayLiftExercises('Push').find(e => e.name === 'Bench Press') || {}).weight };
      };
      return { startISO, live: await finish(null, false), backfill: await finish(addDays(startISO, -1), false), newer: await finish(null, true) };
    });
    assert(out.live.filed === out.startISO && out.live.ww === 165 && out.live.next === 165,
      'filed on the day it began, it is the newest log and sets the working weight: ' + JSON.stringify(out));
    assert(out.backfill.filed !== out.startISO && out.backfill.ww === 185, 'a day picked before it is a backfill and only raises: ' + JSON.stringify(out.backfill));
    assert(out.newer.ww === 185, 'a newer log of the lift still stands: ' + JSON.stringify(out.newer));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// Functions read Date when they run, so swapping it in the page pins "now" for what follows (spec 109's).
const CLOCK = `(() => { if (window.__setNow) return; const R = Date; let off = 0;
  function F(...a) { if (!(this instanceof F)) return new R(R.now() + off).toString(); return a.length ? new R(...a) : new R(R.now() + off); }
  F.prototype = R.prototype; F.now = () => R.now() + off; F.parse = R.parse; F.UTC = R.UTC;
  window.Date = F; window.__setNow = (s) => { off = new R(s).getTime() - R.now(); _todayActMemo = null; }; })()`;

// R31: M02's start-day exception let a draft resumed after midnight into Apple Health, written at
// the time of finishing (or through the hours the app was closed).
run('R31 a workout resumed after midnight is not written to Health; a live one ends at its last set', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]', kt_health_write: '1' } });
  try {
    const out = await app.page.evaluate(async (CLOCK) => {
      eval(CLOCK);
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const today = todayISO(), yday = addDays(today, -1);
      const hm = ms => { const d = new Date(ms); return _ymdLocal(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
      // began at `from`, sets at `sets`, Log all at `logAll`, sets mirrored in from the wrist at
      // `wrist`, a cold launch at `resume` (the draft restored and resumed), Finish at `fin`
      const go = async (o) => {
        lsSet('kt_sessions', []); localStorage.removeItem('kt_runner_draft');
        window.__hk = [];
        Capacitor.Plugins.TrovoHealth = { saveLift: a => { window.__hk.push(a); return Promise.resolve({}); } };
        __setNow(o.from);
        switchTab('log'); switchLogSub('workout'); await wait(20);
        openDeckRunner('Push', true); await wait(20);
        runnerEngaged = true;
        for (const t of o.sets || []) { __setNow(t); runnerCompleteSet(); if (runnerResting) runnerSkipRest(); runnerEngaged = true; }
        if (o.logAll) { __setNow(o.logAll); runnerGoTo(runnerSession.exercises.length - 1); runnerLogAllAtTarget(); }
        const B = runnerSession.exercises[1].name;
        (o.wrist || []).forEach((t, i) => {
          __setNow(t); runnerEngaged = false;
          _onWatchLive(JSON.stringify({ dayName: _dayLabel('Push'), slot: 'Push', startedAt: runnerSession.startedAt, reps: { [B]: Array(i + 1).fill(10) }, weights: { [B]: 50 } }));
        });
        if (o.resume) {
          _flushRunnerDraft(); __setNow(o.resume);
          runnerOpen = false; runnerSession = null; runnerCompleted = {}; runnerRepsLog = {}; runnerWeightsLog = {};
          if (!_restoreRunnerDraft()) return { restored: false };
          resumeRunnerDraft(); await wait(20);
        }
        __setNow(o.fin);
        if (o.pick) runnerSessionDate = o.pick;
        runnerFinishSession(); await wait(250);
        closeCompleteSheet();
        const s = getSessions().find(x => x.type === 'Push');
        return { filed: s && s.date, hk: window.__hk.map(a => hm(a.startMs) + ' -> ' + hm(a.endMs)) };
      };
      const at = (d, t) => d + 'T' + t + ':00';
      const six = (d, h) => ['00', '09', '18', '27', '36', '45'].map(m => at(d, h + ':' + m));
      const night = [at(yday, '23:35'), at(yday, '23:50'), at(today, '00:05'), at(today, '00:20')];
      return { today, yday,
        // an evening workout never finished; the draft resumed and finished after midnight
        resume0400: await go({ from: at(yday, '20:00'), sets: six(yday, '20'), resume: at(today, '04:00'), fin: at(today, '04:01') }),
        resume0030: await go({ from: at(yday, '20:00'), sets: six(yday, '20'), resume: at(today, '00:30'), fin: at(today, '00:31') }),
        // a workout that ran past midnight: finished at once, 40 min after its last set, by Log all, on the wrist
        live: await go({ from: at(yday, '23:30'), sets: night, fin: at(today, '00:25') }),
        idle: await go({ from: at(yday, '23:30'), sets: night, fin: at(today, '01:00') }),
        logAll: await go({ from: at(yday, '23:30'), logAll: at(today, '00:40'), fin: at(today, '00:42') }),
        wrist: await go({ from: at(yday, '23:30'), sets: night.slice(0, 2), wrist: [at(today, '00:30'), at(today, '00:45')], fin: at(today, '00:52') }),
        // today: a draft resumed hours later ends at its last set; a backdated log is still not written
        sameDay: await go({ from: at(today, '08:00'), sets: six(today, '08'), resume: at(today, '12:00'), fin: at(today, '12:01') }),
        backdated: await go({ from: at(today, '18:00'), sets: [at(today, '18:05'), at(today, '18:20')], fin: at(today, '18:30'), pick: yday }) };
    }, CLOCK);
    const Y = out.yday, T = out.today, one = (o, s) => JSON.stringify(o.hk) === JSON.stringify([s]);
    assert(out.resume0400.filed === Y && out.resume0400.hk.length === 0, 'resumed at 04:00: filed on its evening, no Health workout at 04:00: ' + JSON.stringify(out.resume0400));
    assert(out.resume0030.filed === Y && out.resume0030.hk.length === 0, 'resumed at 00:30: no workout through the hours the app was closed: ' + JSON.stringify(out.resume0030));
    assert(out.live.filed === Y && one(out.live, Y + ' 23:30 -> ' + T + ' 00:25'), 'past midnight, finished at once: written as it ran: ' + JSON.stringify(out.live));
    assert(one(out.idle, Y + ' 23:30 -> ' + T + ' 00:30'), 'finished 40 min after the last set: ends ten minutes after it: ' + JSON.stringify(out.idle));
    assert(one(out.logAll, Y + ' 23:30 -> ' + T + ' 00:42'), 'Log all is a set: ' + JSON.stringify(out.logAll));
    assert(one(out.wrist, Y + ' 23:30 -> ' + T + ' 00:52'), 'sets mirrored in from the wrist count: ' + JSON.stringify(out.wrist));
    assert(out.sameDay.filed === T && one(out.sameDay, T + ' 08:00 -> ' + T + ' 08:55'), 'a same-day draft resumed at noon ends at its last set: ' + JSON.stringify(out.sameDay));
    assert(out.backdated.filed === Y && out.backdated.hk.length === 0, 'a backdated log is not written: ' + JSON.stringify(out.backdated));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
