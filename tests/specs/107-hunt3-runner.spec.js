// Hunt 3 (2026-10-04) fixes, runner group:
// - H05 one card per lift: a swap (picker or Save) onto a lift another card holds is refused, and
//   a day that lists a lift twice (top set + back-off as two rows) is one card with per-set targets,
//   saved once.
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
