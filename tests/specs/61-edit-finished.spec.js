// Picking the wrong exercise and only noticing after the last set used to be permanent:
// a finished card kept its set ledger editable but lost the Edit button, and once the
// session reached history the editor could fix every number in it while leaving it filed
// under the wrong lift.
const { boot, assert, run } = require('../lib/harness');

run('a finished exercise is still editable, in the runner and in history', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const r = {};

      // ── in the runner: finish every set, then look for a way back in ──────
      runnerSession = { type: 'Arms', dayName: 'Arms', weekday: 'MON', exercises: [
        { name: 'Barbell Curl', sets: 2, reps: 10, weight: 45, isMain: true },
        { name: 'Tricep Pushdown', sets: 3, reps: 12, weight: 50 },
      ] };
      runnerExIdx = 0; runnerEngaged = false; runnerResting = false;
      runnerCompleted = { 'Barbell Curl': 2 };
      runnerWeightsLog = { 'Barbell Curl': [45, 45] };
      runnerRepsLog = { 'Barbell Curl': [10, 10] };
      runnerWeights = {}; runnerReps = {}; runnerRpe = {}; runnerRpeLog = {}; _wristStamps = {};

      const card = renderDeckRunner();
      r.runner = {
        saysDone: /2\/2 SETS LOGGED/.test(card),
        hasExerciseEdit: /openRunnerExEdit\(0\)/.test(card),
        stillHasSetEdit: /runnerStartEditSet\(/.test(card),
      };
      // and the sheet actually opens on a finished exercise
      openRunnerExEdit(0);
      r.sheetOpens = !!document.getElementById('runner-ex-edit-sheet') && _rExEditName === 'Barbell Curl';
      // renaming carries the logged sets across
      _rExEditName = 'Barbell Curl (21s)';
      saveRunnerExEdit();
      r.renamed = {
        name: runnerSession.exercises[0].name,
        completed: runnerCompleted['Barbell Curl (21s)'],
        oldGone: runnerCompleted['Barbell Curl'] === undefined,
        log: (runnerWeightsLog['Barbell Curl (21s)'] || []).length,
      };

      // ── in history: the same mistake, already filed ───────────────────────
      const id = 90210;
      lsSet('kt_sessions', [{ id: id, date: todayISO(), week: currentWeek, type: 'Arms',
        exercises: [{ name: 'Barbell Curl', sets: 2, reps: [10, 10], weight: 45, weightLog: [45, 45] }],
        prs: [] }]);
      openSessionEditor(id);
      const nameEl = document.getElementById('se_0_name');
      r.history = { hasNameField: !!nameEl, seeded: nameEl ? nameEl.value : '' };
      if (nameEl) nameEl.value = 'Barbell Curl (21s)';
      const wEl = document.getElementById('se_0_0_w');
      if (wEl) wEl.value = String(wDisp(65));
      saveSessionEdit();
      const saved = getSessions().find(s => s.id === id);
      r.saved = { name: saved.exercises[0].name, firstSet: (saved.exercises[0].weightLog || [])[0] };
      return r;
    });

    assert(out.runner.saysDone && out.runner.stillHasSetEdit, 'the finished card renders with its set ledger: ' + JSON.stringify(out.runner));
    assert(out.runner.hasExerciseEdit, 'a finished exercise still offers Edit: ' + JSON.stringify(out.runner));
    assert(out.sheetOpens, 'the edit sheet opens on a finished exercise');
    assert(out.renamed.name === 'Barbell Curl (21s)' && out.renamed.completed === 2 && out.renamed.oldGone && out.renamed.log === 2,
      'renaming a finished exercise carries its logged sets: ' + JSON.stringify(out.renamed));
    assert(out.history.hasNameField && out.history.seeded === 'Barbell Curl',
      'the history editor exposes the exercise name: ' + JSON.stringify(out.history));
    assert(out.saved.name === 'Barbell Curl (21s)' && out.saved.firstSet === 65,
      'history saves the corrected name and weight: ' + JSON.stringify(out.saved));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
