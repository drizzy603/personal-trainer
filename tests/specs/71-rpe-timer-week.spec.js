// Page halves of watch build 53: per-set RPE from the wrist (drain, live mirror, record merge),
// the next set on the Lock Screen rest timer (in the user's units, superset-aware), and the week
// ahead pushed to the watch (six dated plans in the watch's WatchPlan shape).
const { boot, assert, run } = require('../lib/harness');

run('per-set RPE from the wrist, next set on the rest timer, the week ahead for the watch', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      const W = Capacitor.Plugins.TrovoWatch;
      let pending = [], ctx = null;
      W.getPendingSessions = () => Promise.resolve({ sessions: pending.slice() });
      W.clearPendingSessions = () => { pending = []; return Promise.resolve({}); };
      W.updateContext = (p) => { ctx = p; return Promise.resolve({ sent: true }); };
      const timer = [];
      Capacitor.Plugins.TrovoTimer = { startTimer: (o) => { timer.push(o); return Promise.resolve(); }, endTimer: () => Promise.resolve() };
      const today = todayISO(), pushName = _dayLabel('Push');

      // ── A. the drain keeps the wrist's per-set RPE; rpe stays the mean ──
      pending = [JSON.stringify({ dayName: pushName, slot: 'Push', startedAt: new Date(Date.now() - 30 * 60000).toISOString(), loggedAt: new Date().toISOString(),
        exercises: [{ name: 'Bench Press', reps: [8, 8, 6], weight: 100, weightLog: [100, 100, 105], rpe: 8, rpeLog: [7, 8, 9] },
                    { name: 'Row', reps: [10], weight: 80, rpe: 7 }] })];
      drainWatchSessions(); await wait(300);
      const rec = getSessions().find(x => x.date === today && x.type === 'Push');
      r.drain = { bench: rec && rec.exercises.find(e => e.name === 'Bench Press'), row: rec && rec.exercises.find(e => e.name === 'Row') };

      // ── B. live mirror: phone RPE rides to the wrist; wrist RPE lands in the runner ──
      lsSet('kt_sessions', []);
      openDeckRunner('Push');
      const A = runnerSession.exercises[0].name;
      runnerRepsLog[A] = [8, 8]; runnerWeightsLog[A] = [100, 100]; runnerRpeLog[A] = [7, 8]; runnerCompleted[A] = 2;
      const lv = _buildWatchLive();
      r.liveRlog = lv.rlog && lv.rlog[A];
      const inc = {}; inc[A] = [8, 8, 6]; const rl = {}; rl[A] = [7, 8, 10];
      _onWatchLive({ dayName: pushName, slot: 'Push', startedAt: Date.now(), reps: inc, weights: {}, rlog: rl });
      r.adopted = runnerRpeLog[A].slice(0, runnerCompleted[A]);

      // ── C. the record merge carries the wrist copy's per-set RPE ──
      const rec2 = { exercises: [{ name: 'Bench Press', sets: 2, reps: [8, 8], weight: 100, weightLog: [100, 100], rpeLog: [7, 7] }] };
      _mergeWristExercises(rec2, [{ name: 'Bench Press', reps: [8, 8, 6], weight: 105, weightLog: [100, 100, 105], rpeLog: [7, 8, 9] }]);
      r.merged = rec2.exercises[0].rpeLog;

      // ── D. the rest timer: the next set in the user's units, superset-aware ──
      runnerWeights[A] = 100; runnerReps[A] = 8;
      runnerRestLeft = 90; _ssReturnIdx = null;
      _trovoTimerStart(runnerSession.exercises[0], 3);
      r.timerLb = timer[timer.length - 1];
      localStorage.setItem('kt_unit_w', 'kg');
      _trovoTimerStart(runnerSession.exercises[0], 3);
      r.timerKg = timer[timer.length - 1];
      localStorage.setItem('kt_unit_w', 'lb');
      const B = runnerSession.exercises[1];
      runnerWeights[B.name] = 60; runnerReps[B.name] = 12; runnerCompleted[B.name] = 1;
      _ssReturnIdx = 1;
      _trovoTimerStart(runnerSession.exercises[0], 3);
      r.timerSs = timer[timer.length - 1];
      r.timerSsExpect = B.name;
      _ssReturnIdx = null;
      closeDeckRunner(); runnerSession = null;

      // ── E. the week ahead: six dated plans after today in the watch's shape ──
      const cr = getCustomRoutine(); cr.weekPlan = ['Push', 'Run', 'Rest', 'Pull', 'Push', 'Run', 'Rest']; (cr.weeks || []).forEach(w => { delete w.weekPlan; }); setCustomRoutine(cr);
      _lastWatchPlan = ''; _pushWatchPlan();
      const week = ctx && ctx.week ? JSON.parse(ctx.week) : null;
      r.week = week && week.map(p => ({ date: p.date, type: p.type, slot: p.slot, n: p.exercises.length, keys: Object.keys(p).sort().join(',') }));
      r.dates = []; for (let i = 1; i <= 6; i++) r.dates.push(addDays(today, i));
      const firstLift = week && week.find(p => p.type === 'lift');
      if (firstLift) {
        const wk = firstLift.week; const slotKey = firstLift.slot.toLowerCase();
        r.liftExpect = (getCustomRoutine().weeks[wk - 1][slotKey] || []).length;
        r.liftGot = firstLift.exercises.length;
        r.liftEx = firstLift.exercises[0];
      }
      // a programme that starts next Monday: days before it are rest
      const mondayNext = _nextMonday ? _nextMonday() : null;
      if (mondayNext) {
        localStorage.setItem('kt_week_monday', mondayNext);
        _lastWatchPlan = ''; _pushWatchPlan();
        const w2 = JSON.parse(ctx.week);
        r.preStart = w2.filter(p => p.date < mondayNext).every(p => p.type === 'rest');
        r.preStartSome = w2.some(p => p.date < mondayNext);
      }
      // no programme: no week sent
      lsDel('kt_routine'); _lastWatchPlan = ''; _pushWatchPlan();
      r.noPlanWeek = ctx.week;
      return r;
    });
    assert(out.drain.bench && JSON.stringify(out.drain.bench.rpeLog) === '[7,8,9]' && out.drain.bench.rpe === 8, 'the drain keeps per-set RPE and the mean: ' + JSON.stringify(out.drain.bench));
    assert(out.drain.row && out.drain.row.rpeLog === undefined && out.drain.row.rpe === 7, 'an older watch still files one RPE: ' + JSON.stringify(out.drain.row));
    assert(JSON.stringify(out.liveRlog) === '[7,8]', 'the phone\'s per-set RPE rides to the wrist: ' + JSON.stringify(out.liveRlog));
    assert(JSON.stringify(out.adopted) === '[7,8,10]', 'a wrist set brings its RPE into the runner: ' + JSON.stringify(out.adopted));
    assert(JSON.stringify(out.merged) === '[7,8,9]', 'the record merge takes the wrist\'s per-set RPE with its sets: ' + JSON.stringify(out.merged));
    assert(out.timerLb && out.timerLb.detail === '100 lb × 8' && out.timerLb.nextSet === 3, 'the rest timer carries the next set: ' + JSON.stringify(out.timerLb));
    assert(out.timerKg && /kg × 8$/.test(out.timerKg.detail) && !/lb/.test(out.timerKg.detail), 'the timer detail follows kg: ' + JSON.stringify(out.timerKg));
    assert(out.timerSs && out.timerSs.detail.indexOf(out.timerSsExpect + ' · 60 lb × 12') === 0 && out.timerSs.nextSet === 2,
      'a superset return names the other exercise and its set: ' + JSON.stringify(out.timerSs));
    assert(out.week && out.week.length === 6 && JSON.stringify(out.week.map(p => p.date)) === JSON.stringify(out.dates), 'six dated plans after today: ' + JSON.stringify(out.week));
    assert(out.week.every(p => /date/.test(p.keys) && /dayName/.test(p.keys) && /exercises/.test(p.keys) && /week/.test(p.keys) && /type/.test(p.keys)),
      'every day has the fields the watch requires: ' + JSON.stringify(out.week.map(p => p.keys)));
    assert(out.liftGot === out.liftExpect && out.liftGot > 0 && out.liftEx && typeof out.liftEx.weight === 'number' && out.liftEx.sets > 0 && out.liftEx.reps > 0,
      'a lift day carries that week\'s exercises with loads: ' + JSON.stringify([out.liftGot, out.liftExpect, out.liftEx]));
    assert(out.preStart && out.preStartSome, 'days before a programme\'s start are rest days');
    assert(out.noPlanWeek === '', 'no programme, no week');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
