// Hunt 2026-09-26 "go" fixes, runner group (web 20260929-5):
// - START, the widget's trovo://start and the day buttons resume a workout under way instead of
//   rebuilding the runner and wiping every logged set; another day with sets logged asks first.
// - A lift already in the session is not added twice (two cards shared one set log).
// - A backdated finish never lowers today's working weights, and never overrides a newer log.
// - 'Log all at target' is not offered (and refuses) on 'Max'/'AMRAP' targets; a 0-rep set is
//   never a record.
const { boot, assert, run } = require('../lib/harness');

run('a workout under way is resumed, never wiped', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      switchTab('log'); switchLogSub('workout'); await wait(20);
      openDeckRunner('Push');
      const A = runnerSession.exercises[0].name;
      runnerSetWeight(185); runnerSetReps(5); runnerCompleteSet(); runnerCompleteSet(); runnerCompleteSet();
      const logged = () => (runnerRepsLog[A] || []).length;
      r.before = logged();
      // the widget link while the runner is up
      _handleDeepLink('trovo://start'); await wait(250);
      r.afterWidget = logged();
      // START from Today
      startTodaySession(); await wait(20);
      r.afterStart = logged();
      // the same day's button
      openDeckRunner('Push'); await wait(20);
      r.afterSameDay = [logged(), runnerOpen];
      // another day with sets logged asks first; Cancel keeps everything
      openDeckRunner('Pull'); await wait(20);
      const sheet = document.querySelector('.kt-close-sheet');
      r.asks = !!sheet && /Push is under way/.test(sheet.textContent) && /3 sets logged/.test(sheet.textContent);
      sheet.querySelector('button').click(); await wait(20);
      r.kept = [logged(), runnerSession.type];
      // a cold launch: the draft is restored quietly; START resumes it
      _flushRunnerDraft && _flushRunnerDraft();
      runnerOpen = false; runnerSession = null; runnerRepsLog = {}; runnerCompleted = {};
      r.restored = _restoreRunnerDraft();
      startTodaySession(); await wait(20);
      r.afterCold = [logged(), runnerOpen, runnerResumePending];
      // after the workout is closed, the session is not taken for one under way
      closeDeckRunner(); await wait(20);
      r.inProgressAfterClose = _runnerInProgress();
      // confirming another day discards and starts it
      openDeckRunner('Push'); runnerSetWeight(100); runnerSetReps(5); runnerCompleteSet();
      openDeckRunner('Pull'); await wait(20);
      const ok = [...document.querySelectorAll('.kt-close-sheet button')].find(b => /Discard and start/.test(b.textContent));
      ok.click(); await wait(20);
      r.switched = [runnerSession.type, Object.keys(runnerRepsLog).length];
      closeDeckRunner();
      return r;
    });
    assert(out.before === 3 && out.afterWidget === 3 && out.afterStart === 3, 'the widget link and START resume the workout: ' + JSON.stringify(out));
    assert(out.afterSameDay[0] === 3 && out.afterSameDay[1], 'the same day resumes: ' + JSON.stringify(out.afterSameDay));
    assert(out.asks && out.kept[0] === 3 && out.kept[1] === 'Push', 'another day asks first; Cancel keeps the sets: ' + JSON.stringify([out.asks, out.kept]));
    assert(out.restored && out.afterCold[0] === 3 && out.afterCold[1] && !out.afterCold[2], 'after a cold launch START resumes the restored draft: ' + JSON.stringify(out.afterCold));
    assert(!out.inProgressAfterClose, 'a closed workout is not in progress');
    assert(out.switched[0] === 'Pull' && out.switched[1] === 0, 'confirming another day starts it fresh: ' + JSON.stringify(out.switched));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('no duplicate cards; backdated finishes keep working weights; no 0-rep records', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      switchTab('log'); switchLogSub('workout'); await wait(20);
      // a lift already in today's session is refused
      openDeckRunner('Push');
      const A = runnerSession.exercises[0].name, n0 = runnerSession.exercises.length;
      openRunnerExEdit(runnerSession.exercises.length - 1); runnerExAddPick(A); await wait(20);
      r.dup = [runnerSession.exercises.filter(e => e.name === A).length, runnerSession.exercises.length === n0, (document.getElementById('toast') || {}).textContent];
      closeRunnerExEdit && closeRunnerExEdit(); closeDeckRunner();
      // backdated finish: a newer Bench log exists and today's weight is 190
      const w = getWeights(); w[A] = 190; lsSet('kt_weights', w);
      openDeckRunner('Push');
      runnerSession.exercises = runnerSession.exercises.filter(e => e.name === A);
      runnerSetWeight(135); runnerSetReps(5); runnerCompleteSet(); runnerCompleteSet();
      runnerSessionDate = '2026-06-01';
      runnerFinishSession(); await wait(150);
      closeCompleteSheet && closeCompleteSheet();
      r.backdated = [getSessions().find(s => s.date === '2026-06-01' && (s.exercises || []).some(e => e.name === A)) ? 'filed' : 'missing', getWeights()[A]];
      // a backdated heavier set with no newer log raises it
      const fresh = 'Zercher Squat';
      r.raise = (() => { _setWorkingWeights([{ name: fresh, weight: 225 }], '2026-06-02'); return getWeights()[fresh]; })();
      // today's finish still sets it, even lower
      _setWorkingWeights([{ name: fresh, weight: 205 }], todayISO());
      r.today = getWeights()[fresh];
      // Log all is not offered on a 'Max' target and refuses when called
      openDeckRunner('Push');
      runnerSession.exercises = [{ name: 'Pull Up', sets: 3, reps: 'Max', weight: 0, rpe: 8, isMain: false }];
      runnerExIdx = 0; runnerEngaged = true; paintRunner(); await wait(20);
      r.logAllShown = !!document.querySelector('.kt-eng-logall');
      runnerLogAllAtTarget(); await wait(20);
      r.logAll = [(runnerRepsLog['Pull Up'] || []).length, runnerCompleted['Pull Up'] || 0];
      closeDeckRunner();
      // a 0-rep set is never a record
      r.zeroTop = _prTop({ name: 'Barbell Row', sets: 2, reps: [0, 8], weight: 250, weightLog: [250, 150] });
      r.pending = _pendingPRs([{ name: 'Barbell Row', sets: 1, reps: [0], weight: 400, weightLog: [400] }]);
      return r;
    });
    assert(out.dup[0] === 1 && out.dup[1] && /already in today/.test(out.dup[2] || ''), 'a lift already in the session is not added again: ' + JSON.stringify(out.dup));
    assert(out.backdated[0] === 'filed' && out.backdated[1] === 190, 'a backdated finish is filed but leaves today\'s working weight: ' + JSON.stringify(out.backdated));
    assert(out.raise === 225 && out.today === 205, 'a backdated log can only raise; today\'s sets it: ' + JSON.stringify([out.raise, out.today]));
    assert(!out.logAllShown && out.logAll[0] === 0 && out.logAll[1] === 0, 'no Log all on a Max target: ' + JSON.stringify([out.logAllShown, out.logAll]));
    assert(out.zeroTop && out.zeroTop.w === 150 && out.zeroTop.r === 8 && out.pending.length === 0, 'a 0-rep set is not a record: ' + JSON.stringify([out.zeroTop, out.pending]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
