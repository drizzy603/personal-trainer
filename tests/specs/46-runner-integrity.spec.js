// The core loop can take things back: undo a logged set, undo Log all, confirm before a
// last-card skip ends the session, keep a half-typed ledger edit when rest hits zero,
// add one more set to a finished exercise, and record real per-set RPE.
const { boot, assert, run } = require('../lib/harness');

run('a logged set and a Log-all are undoable; a typed correction survives the rest clock', async () => {
  const app = await boot({ seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      openDeckRunner('Push'); const ex = runnerSession.exercises[0];
      runnerEngaged = true; runnerReps[ex.name] = 8; runnerWeights[ex.name] = 100; paintRunner();
      runnerCompleteSet();
      r.afterLog = { done: runnerCompleted[ex.name], resting: runnerResting, toast: document.getElementById('toast').textContent, hasUndo: !!document.querySelector('#toast .kt-toast-undo') };
      _toastUndo();
      r.afterUndo = { done: runnerCompleted[ex.name] || 0, logs: (runnerRepsLog[ex.name] || []).length, resting: runnerResting, engaged: runnerEngaged, idx: runnerExIdx };
      // Log all → undo restores the empty state
      runnerLogAllAtTarget();
      r.afterAll = { done: runnerCompleted[ex.name], toast: document.getElementById('toast').textContent };
      _toastUndo();
      r.afterAllUndo = { done: runnerCompleted[ex.name] || 0, logs: (runnerRepsLog[ex.name] || []).length, engaged: runnerEngaged };
      // non-main log-all button asks first
      const nonMain = runnerSession.exercises.find(e => !e.isMain) || ex;
      r.logAllMarkup = _renderRunnerEngagedBody(nonMain, 0);
      // rest-time edit survives _restFinish
      runnerEngaged = true; runnerReps[ex.name] = 8; runnerCompleteSet();
      runnerEditSetIdx = 0; runnerEditSetEx = ex.name; paintRunner();
      const rEl = document.getElementById('kt-edit-r'); rEl.value = '7';
      _restFinish();
      const rEl2 = document.getElementById('kt-edit-r');
      r.editKept = { exists: !!rEl2, value: rEl2 ? rEl2.value : null, editIdx: runnerEditSetIdx };
      runnerCancelEditSet();
      closeDeckRunner();
      return r;
    });
    assert(out.afterLog.done === 1 && out.afterLog.resting && out.afterLog.hasUndo && /Set 1 logged/.test(out.afterLog.toast), 'logging a set rests and offers Undo: ' + JSON.stringify(out.afterLog));
    assert(out.afterUndo.done === 0 && out.afterUndo.logs === 0 && !out.afterUndo.resting && out.afterUndo.engaged && out.afterUndo.idx === 0, 'undo removes the set, stops the rest and re-opens the steppers: ' + JSON.stringify(out.afterUndo));
    assert(out.afterAll.done > 0 && /logged at target/.test(out.afterAll.toast), 'Log all offers Undo: ' + JSON.stringify(out.afterAll));
    assert(out.afterAllUndo.done === 0 && out.afterAllUndo.logs === 0 && out.afterAllUndo.engaged, 'Log-all undo restores the empty exercise: ' + JSON.stringify(out.afterAllUndo));
    assert(/_confirmRunnerLogAll\(\)/.test(out.logAllMarkup) && !/onclick="event.stopPropagation\(\);runnerLogAllAtTarget\(\)"/.test(out.logAllMarkup), 'every Log all button confirms first');
    assert(out.editKept.exists && out.editKept.value === '7' && out.editKept.editIdx === 0, 'a typed ledger correction survives the rest reaching zero: ' + JSON.stringify(out.editKept));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('skipping the last exercise asks first; a finished exercise takes one more set; RPE chips record real effort', async () => {
  const app = await boot({ seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      openDeckRunner('Push');
      const last = runnerSession.exercises.length - 1;
      runnerGoTo(last);
      skipRunnerExercise();
      r.skip = { open: runnerOpen, confirmText: (document.querySelector('.kt-close-sheet') || document.body).innerText.slice(0, 400), sessions: getSessions().length };
      // dismiss whatever confirm rendered without finishing
      document.querySelectorAll('.kt-close-sheet').forEach(el => el.remove());
      runnerGoTo(0); const ex = runnerSession.exercises[0];
      runnerEngaged = true; paintRunner();
      r.chips = Array.from(document.querySelectorAll('.kt-rpe-chip')).map(b => b.textContent + (b.classList.contains('on') ? '*' : ''));
      const chip9 = Array.from(document.querySelectorAll('.kt-rpe-chip')).find(b => b.textContent === '9'); chip9.click();
      r.rpeAfterTap = runnerRpe[ex.name];
      runnerReps[ex.name] = 8; runnerWeights[ex.name] = 100; runnerCompleteSet();
      r.rpeLogged = (runnerRpeLog[ex.name] || [])[0];
      _toastUndo();
      // finish the exercise, then take one more
      runnerLogAllAtTarget();
      paintRunner();
      r.doneBody = { meta: (document.querySelector('.kt-done-meta') || {}).textContent, more: !!document.querySelector('.kt-done-more') };
      runnerExtraSet();
      r.extraOpen = { engaged: runnerEngaged, steppers: !!document.querySelector('.kt-eng') };
      runnerReps[ex.name] = 6; runnerCompleteSet();
      r.extraLogged = { done: runnerCompleted[ex.name], sets: ex.sets, resting: runnerResting, logs: runnerRepsLog[ex.name].length };
      _restFinish(); runnerEngaged = false; paintRunner();
      r.metaAfter = (document.querySelector('.kt-done-meta') || {}).textContent;
      closeDeckRunner();
      return r;
    });
    assert(out.skip.open && out.skip.sessions === 0 && /Finish session/.test(out.skip.confirmText), 'skip on the last card confirms instead of finishing: ' + JSON.stringify(out.skip));
    assert(out.chips.join(',') === '6,7*,8,9,10' || /\*/.test(out.chips.join(',')), 'RPE chips render with the target selected: ' + out.chips.join(','));
    assert(out.rpeAfterTap === 9 && out.rpeLogged === 9, 'tapping 9 records RPE 9 on the set: ' + out.rpeAfterTap + '/' + out.rpeLogged);
    assert(/^3\/3|^\d+\/\d+ SETS LOGGED/.test(out.doneBody.meta) && out.doneBody.more, 'done card shows the count and a +1 set control: ' + JSON.stringify(out.doneBody));
    assert(out.extraOpen.engaged && out.extraOpen.steppers, '+1 set re-opens the steppers');
    assert(out.extraLogged.done === out.extraLogged.sets + 1 && out.extraLogged.resting && out.extraLogged.logs === out.extraLogged.sets + 1, 'the extra set logs and rests: ' + JSON.stringify(out.extraLogged));
    assert(new RegExp('^' + (out.extraLogged.sets + 1) + '/' + out.extraLogged.sets).test(out.metaAfter), 'done card counts the extra set: ' + out.metaAfter);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
