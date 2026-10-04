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
//   an edit; untouched reps keep a range or per-set reps, an untouched load keeps per-set loads.
// - M33 kg: a load that reads the same as the record (a programme load from the lb grid, a coach
//   load) is not a new record: no live beat, no PR on the session, one RECORD HISTORY line; a real
//   step up still is, lb is unchanged, and the records follow a unit switch.
// - L12 the COMPLETE sheet's 'Vs last' and insight compare a backdated workout with the same day
//   logged before it (the share card's rule), and read '—' when there is none.
// - L13 kg: the runner Edit sheet's weight stepper steps from the exact load onto the 0.25 kg grid,
//   like the runner's own stepper (it stepped from the 0.5 kg display: 80 kg + 3 steps stored 83.25).
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
      // untouched reps keep per-set reps and loads on a swap; an edited load drops the per-set loads
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
    assert(JSON.stringify(out.perSet) === JSON.stringify(['Pendlay Row', [3, 8, 8], [225, 185, 185]]), 'a swap keeps a per-set scheme: ' + JSON.stringify(out.perSet));
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
