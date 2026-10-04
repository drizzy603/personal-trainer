// Hunt 3 (2026-10-04) fixes, runner group:
// - H05 one card per lift: a swap (picker or Save) onto a lift another card holds is refused, and
//   a day that lists a lift twice (top set + back-off as two rows) is one card with per-set targets,
//   saved once.
// - M02 a workout that runs past midnight is filed on the day it began (Log date, week, after a cold
//   launch too), its wrist copy folds into it, and Save lifts to Health still writes it.
// - M31 undoing the top set of a top-set/back-off scheme puts the weight stepper back on the top
//   set's load (it stayed on the back-off load and the redone set was filed at it).
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
