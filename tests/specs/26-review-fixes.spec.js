// Pins for the adversarial-review fixes on the audit batches: superset
// return-index hygiene, pairs-only normalization, per-set-aware log-all and
// edit sheet, coach history flag persistence, restore shape/memory fixes,
// and duration-aware Health dedup.
const { boot, assert, run } = require('../lib/harness');

run('superset return index cannot teleport across navigation', async () => {
  const app = await boot({ seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      openDeckRunner('Push');
      const exs = runnerSession.exercises;
      exs[0].ss = true; exs[0].sets = 2; exs[1].sets = 2; exs[2].sets = 2;
      // A1 → handoff to B; B1 → rest with return armed at A.
      runnerEngaged = true;
      runnerCompleteSet(); // A1 → B
      runnerCompleteSet(); // B1 → rest, _ssReturnIdx = 0
      const armed = _ssReturnIdx === 0 && runnerResting;
      // User taps the rail for exercise C mid-rest — the return must die.
      runnerGoTo(2);
      const cleared = _ssReturnIdx === null && !runnerResting;
      // C's own rest ends: user stays on C, no teleport to A.
      runnerEngaged = true;
      runnerCompleteSet(); // C1 → plain rest
      runnerRestEndsAt = Date.now() - 1000; _resumeDayAndRest();
      const stayedOnC = runnerExIdx === 2;
      closeDeckRunner();
      return { armed, cleared, stayedOnC };
    });
    assert(out.armed, 'pair rest arms the return');
    assert(out.cleared, 'manual navigation clears the pending return');
    assert(out.stayedOnC, 'later rests do not teleport to the old partner');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('ss chains normalize to pairs; scalar edits drop target arrays', async () => {
  const app = await boot({ seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      // Chain A.ss + B.ss (+ last-exercise ss) normalizes at open.
      const cr = getCustomRoutine();
      const wk = cr.weeks[currentWeek - 1];
      const key = ['push','pull','legs'].find(k => (wk[k]||[]).length >= 3);
      wk[key][0].ss = true; wk[key][1].ss = true;
      wk[key][wk[key].length - 1].ss = true;
      setCustomRoutine(cr);
      openDeckRunner(key.charAt(0).toUpperCase() + key.slice(1));
      const exs = runnerSession.exercises;
      const pairOnly = exs[0].ss === true && exs[1].ss === false
        && exs[exs.length - 1].ss === false;
      // Scalar edit wipes stale per-set weight arrays.
      exs[0].weights = [225, 185, 185]; exs[0].sets = 3;
      openRunnerExEdit(0);
      _rExEditWeight = 135;
      saveRunnerExEdit();
      const arrayGone = exs[0].weights === undefined && exs[0].weight === 135;
      // Log-all honors per-set arrays.
      exs[1].sets = 3; exs[1].reps = [3, 8, 8]; exs[1].weights = [225, 185, 185];
      runnerGoTo(1);
      runnerWeights[exs[1].name] = 225;
      runnerLogAllAtTarget();
      const reps = runnerRepsLog[exs[1].name].join(',');
      const wts = runnerWeightsLog[exs[1].name].join(',');
      closeDeckRunner();
      return { pairOnly, arrayGone, reps, wts };
    });
    assert(out.pairOnly, 'consecutive/dangling ss flags normalize to pairs');
    assert(out.arrayGone, 'edit-sheet save deletes stale ex.weights');
    assert(out.reps === '3,8,8' && out.wts === '225,185,185', 'log-all records per-set targets, got ' + out.reps + ' @ ' + out.wts);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('coach flags persist; restore fixes; duration-aware dedup', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      // _local/_error survive the storage projection.
      coachMessages = [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'API error 529', _error: true, _local: true },
      ];
      saveCoachHistory();
      const stored = JSON.parse(localStorage.getItem('kt_coach_msgs'));
      const flagsKept = stored[1]._local === true && stored[1]._error === true;
      // kt_log_tabs restores as the array it is.
      const tabsOk = _backupValueOk('kt_log_tabs', ['run', 'body']);
      // Restore clears in-memory chat when the backup carries none.
      _applyImportedData({ kt_sessions: [], kt_week: 3 });
      const chatCleared = coachMessages.length === 0;
      const weekSet = currentWeek === 3;
      // Same date+distance but very different duration → NOT a dupe.
      lsSet('kt_runs', [{ id: 1, date: todayISO(), distance: 5.0, time: '40:00', note: '' }]);
      const diff = _manualRunDupe(todayISO(), 5.0, 1500);  // 25:00 HK run
      const same = _manualRunDupe(todayISO(), 5.0, 2450);  // ~40:50 HK run
      return { flagsKept, tabsOk, chatCleared, weekSet, diff, same };
    });
    assert(out.flagsKept, 'saveCoachHistory persists _local/_error');
    assert(out.tabsOk, 'kt_log_tabs validates as an array');
    assert(out.chatCleared && out.weekSet, 'restore resets in-memory chat + week');
    assert(out.diff === false && out.same === true, 'dedup requires duration agreement, got diff=' + out.diff + ' same=' + out.same);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
