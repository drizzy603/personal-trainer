// Hunt 2026-09-25, watch and data integrity (web 20260925-4): wrist sets always carry a weight (an
// untouched lift's wrist sets arrived with none, so later phone sets landed on the wrong index and
// a null went back to the watch, killing the live mirror); a wrist copy the phone already has is
// drained (it came back after a delete); a late wrist session never folds a different phone draft;
// coach tools report storage full instead of success; a rejected update_routine_weeks leaves the
// names and the undo point alone; a backdated coach log never lowers today's weight; a coach-logged
// session is never taken for a wrist copy.
const { boot, assert, run } = require('../lib/harness');
const wristLive = (A) => JSON.stringify({ dayName: 'Push', slot: 'Push', startedAt: Date.now() - 10 * 60000,
  reps: { [A]: [8, 8] }, weights: {}, rlog: { [A]: [7, 8] }, at: { [A]: Date.now() }, ack: {}, hk: true, ended: false });

run('wrist sets carry a weight; logs stay aligned; no null reaches the watch', async () => {
  const out = {};
  for (const sc of ['A', 'B']) {
    const app = await boot({ native: true });
    try {
      out[sc] = await app.page.evaluate(async ([sc, mk]) => {
        const wait = ms => new Promise(res => setTimeout(res, ms));
        openDeckRunner('Push'); await wait(30);
        const A = runnerSession.exercises[0].name, plan = runnerSession.exercises[0].weight;
        _onWatchLive(JSON.parse(mk.replace(/__A__/g, A))); await wait(30);
        const r = { plan, merged: (runnerWeightsLog[A] || []).slice() };
        runnerExIdx = 0;
        if (sc === 'A') { runnerWeights[A] = plan + 25; runnerReps[A] = 5; runnerCompleteSet(); }
        else { runnerStartEditSet(1); await wait(20); document.getElementById('kt-edit-w').value = String(wDisp(plan - 25)); runnerSaveEditSet(); }
        r.wlog = (_buildWatchLive().wlog || {})[A] || null;
        runnerFinishSession(); await wait(100);
        const e = getSessions().find(x => x.date === todayISO() && x.type === 'Push').exercises.find(x => x.name === A);
        r.filed = { reps: e.reps, weightLog: e.weightLog };
        return r;
      }, [sc, wristLive('__A__')]);
    } finally { await app.close(); }
  }
  const A = out.A, B = out.B, p = A.plan;
  assert(JSON.stringify(A.merged) === JSON.stringify([p, p]), 'wrist sets take the weight the wrist showed: ' + JSON.stringify(A));
  assert(JSON.stringify(A.filed.reps) === '[8,8,5]' && JSON.stringify(A.filed.weightLog) === JSON.stringify([p, p, p + 25]), 'a phone set lands on its own index: ' + JSON.stringify(A.filed));
  assert(JSON.stringify(B.wlog) === JSON.stringify([p, p - 25]) && JSON.stringify(B.filed.weightLog) === JSON.stringify([p, p - 25]), 'an edit leaves no hole and no null: ' + JSON.stringify(B));
});

run('drain: duplicates cleared; a late wrist session keeps a different phone draft', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const W = Capacitor.Plugins.TrovoWatch; let pending = [];
      W.getPendingSessions = () => Promise.resolve({ sessions: pending.slice() });
      W.clearPendingSessions = (a) => { const d = (a && a.sessions) || []; pending = pending.filter(x => d.indexOf(x) < 0); return Promise.resolve({}); };
      const r = {}, today = todayISO(), A = getSessionExercises('Push')[0].name, S = Date.now() - 50 * 60000;
      // the phone already filed this session; the wrist's Finish arrives too
      lsSet('kt_sessions', [{ id: Date.now() - 60000, date: today, type: 'Push', label: _dayLabel('Push'), week: currentWeek, startedAt: S, prs: [], note: '',
        exercises: [{ name: A, sets: 3, reps: [8, 8, 8], weight: 100, weightLog: [100, 100, 100], isMain: true }] }]);
      pending = [JSON.stringify({ dayName: _dayLabel('Push'), slot: 'Push', startedAt: new Date(S + 60000).toISOString(), loggedAt: new Date().toISOString(),
        exercises: [{ name: A, weight: 100, reps: [8, 8, 8], weightLog: [100, 100, 100] }] }), 'not json', JSON.stringify({ exercises: [] })];
      drainWatchSessions(); await wait(300);
      r.queue = pending.length;
      deleteSession(getSessions()[0].id); drainWatchSessions(); await wait(300);
      r.afterDelete = getSessions().filter(s => s.date === today && s.type === 'Push').length;
      // a morning wrist session drains while a different evening phone session sits as a draft
      const morning = new Date(today + 'T00:05:00').getTime();
      openDeckRunner('Push'); const B = runnerSession.exercises[0].name;
      runnerRepsLog[B] = [5, 5]; runnerWeightsLog[B] = [200, 200]; runnerRpeLog[B] = [9, 9]; runnerCompleted[B] = 2;
      runnerOpen = true; _flushRunnerDraft(); runnerOpen = false; runnerResumePending = true;
      const d = JSON.parse(localStorage.getItem('kt_runner_draft')); d.session.startedAt = morning + 8 * 3600e3; d.savedAt = morning + 8.5 * 3600e3; localStorage.setItem('kt_runner_draft', JSON.stringify(d));
      pending = [JSON.stringify({ dayName: _dayLabel('Push'), slot: 'Push', startedAt: new Date(morning).toISOString(), loggedAt: new Date(morning + 3600e3).toISOString(),
        exercises: [{ name: B, reps: [8, 8, 8], weight: 150, weightLog: [150, 150, 150] }] })];
      drainWatchSessions(); await wait(300);
      const rec = getSessions().find(s => s.date === today && s.type === 'Push');
      r.fold = { draftKept: !!localStorage.getItem('kt_runner_draft'), resume: runnerResumePending, wristReps: rec && rec.exercises.find(e => e.name === B).reps };
      return r;
    });
    assert(out.queue === 0, 'a duplicate copy and unusable payloads are drained: ' + out.queue);
    assert(out.afterDelete === 0, 'a deleted session does not come back on the next foreground');
    assert(out.fold.draftKept && out.fold.resume && JSON.stringify(out.fold.wristReps) === '[8,8,8]', 'a late wrist session keeps a different phone draft: ' + JSON.stringify(out.fold));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('coach: storage full is reported; rejected calls change nothing; backdated logs; coach records', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      const realSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (/^kt_/.test(k)) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } return realSet.call(this, k, v); };
      const wk0 = currentWeek;
      r.full = ['log_bodyweight', 'save_profile', 'set_bench_goal', 'set_current_week', 'set_run_goal', 'set_exercise_weight'].map(t => {
        const inp = { log_bodyweight: { weight: 180 }, save_profile: { injuries: 'knee' }, set_bench_goal: { weight: 250 }, set_current_week: { week: 3 }, set_run_goal: { pace: '5:00' }, set_exercise_weight: { name: 'Bench Press', weight: 300 } }[t];
        const res = executeCoachTool(t, inp); return t + ':' + res.ok + ':' + /Storage is full/.test(res.error || '');
      });
      Storage.prototype.setItem = realSet;
      r.week = currentWeek === wk0;
      // a rejected update_routine_weeks renames nothing and keeps the undo point
      lsSet('kt_routine_backup', { name: 'UNDO-POINT', weeks: [{ wk: 1 }] });
      const bad = executeCoachTool('update_routine_weeks', { dayNames: { Push: 'Chest Day' }, weeks: [{ wk: 0 }] });
      r.names = { ok: bad.ok, label: _dayLabel('Push'), backup: lsGet('kt_routine_backup').name };
      executeCoachTool('swap_cadence_days', { dayA: 'Mon', dayB: 'Mon' });
      r.backupAfterSwap = lsGet('kt_routine_backup').name;
      // a backdated coach log never lowers today's working weight
      const w = getWeights(); w['Lateral Raise'] = 25; lsSet('kt_weights', w);
      executeCoachTool('log_session', { type: 'Push', date: addDays(todayISO(), -21), exercises: [{ name: 'Lateral Raise', sets: 3, reps: 15, weight: 15 }] });
      r.lateral = getWeights()['Lateral Raise'];
      // a coach-logged evening session is not taken for this morning's wrist copy
      const W = Capacitor.Plugins.TrovoWatch; let pending = [];
      W.getPendingSessions = () => Promise.resolve({ sessions: pending.slice() });
      W.clearPendingSessions = () => { pending = []; return Promise.resolve({}); };
      lsSet('kt_sessions', getSessions().filter(s => s.date !== todayISO()));
      executeCoachTool('log_session', { type: 'Push', date: todayISO(), exercises: [{ name: 'Bench Press', sets: 5, reps: 5, weight: 185 }] });
      const morning = new Date(Date.now() - 3 * 3600e3);
      pending = [JSON.stringify({ dayName: _dayLabel('Push'), slot: 'Push', startedAt: morning.toISOString(), loggedAt: new Date(morning.getTime() + 3600e3).toISOString(),
        exercises: [{ name: 'Bench Press', reps: [10, 10, 10], weight: 135, weightLog: [135, 135, 135] }] })];
      drainWatchSessions(); await wait(300);
      r.coachRec = getSessions().filter(s => s.date === todayISO() && s.type === 'Push').length;
      return r;
    });
    assert(out.full.every(x => /:false:true$/.test(x)), 'every tool reports storage full: ' + JSON.stringify(out.full));
    assert(out.week, 'a failed week change leaves the week in memory as it was');
    assert(out.names.ok === false && out.names.label !== 'Chest Day' && out.names.backup === 'UNDO-POINT' && out.backupAfterSwap === 'UNDO-POINT',
      'a rejected call renames nothing and keeps the undo point: ' + JSON.stringify([out.names, out.backupAfterSwap]));
    assert(out.lateral === 25, 'a backdated log does not lower the working weight: ' + out.lateral);
    assert(out.coachRec === 2, 'the wrist session and the coach-logged one stay separate: ' + out.coachRec);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
