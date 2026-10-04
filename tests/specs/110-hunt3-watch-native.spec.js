// Hunt 3 (2026-10-04), watch and native surfaces:
// - H06: a lift renamed or removed on the phone mid-workout stays gone. The live payload sends it
//   as an empty log with its `own` stamp (the wrist drops the mirrored sets), and a wrist copy that
//   still holds them (out of range) never files them again, whoever finishes first. Sets the wrist
//   logs after it dropped the lift are still its own; an exercise undone to zero stays at zero.
// - M30: a top-set/back-off row reaches the wrist with its per-set targets (repsList, weights) in
//   today's plan, the week ahead and a live run; uniform rows send neither, and no entry is null.
// - M04: a drained wrist session sets working weights by the runner's rule (_setWorkingWeights):
//   a late session from days ago never tops a newer log, a newer lighter one sets it, and a merge
//   speaks only for the lifts it changed (a working weight changed since the phone's finish stands).
// - M08: with a next round set, its days (from its start Monday) reach the watch's week ahead, the
//   widget summary and the reminders as round 2's own weeks (its cadence, its re-based loads, week
//   1 then 2), not as round 1's final week repeating. The preview follows new logs and goes away
//   when the round is cancelled; the days before the start stay the current programme's.
// - L19: every widget summary day says what it is (kind: lift | run | sport | rest), so the widget
//   tells an empty lift day (kind lift, 0 lifts: "NO LIFTS YET · BUILD IT") from a cardio day and
//   never marks it done from a Health workout; the wrist gets the empty day as a lift plan with no
//   exercises, which it now says to build on the iPhone (it said Health would pick it up).
// - L17: every widget summary day carries its own programme week, so from Monday 00:00 the widget
//   shows the new week's number without the app running (it showed the summary's one week); the
//   final week's number holds past the end, and a set next round's days count from its week 1.
// - L18: the widget's done overlays now match what the page counts (the hub mirrors which slot a
//   wrist session was, Health workouts are matched to the day's kind and sport). This pins the
//   page side of that contract: a lift day is done only by its own slot, a run day by a run, a
//   sport day by its own sport, and a sport day's type is the SPORTS id a Health ride maps to.
// - L51: kt_ota_staged is squared with what the shell holds (TrovoOta.status) before each check.
//   A restored phone (the note and the shell's key came back, the folder did not) stages the page
//   again; a build the breaker threw out is remembered (kt_ota_rejected), never downloaded or
//   staged again, and About says it could not start instead of "applies on next launch"; a newer
//   build still stages; a staged folder that is there is left alone; a served page syncs the note.
// L04 (WatchSessionHub's pending-queue lock) and L05 (WorkoutManager.discard for a discarded
// session) are native only; the page already sent what they need (spec 68 pins `discarded`).
const { boot, assert, run } = require('../lib/harness');

run('H06: a lift renamed or removed mid-workout is not brought back by the wrist', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      // 'A few minutes ago', but never before 00:01 today: sessions file by their start.
      const recent = m => Math.min(Date.now() - 1000, Math.max(new Date().setHours(0, 1, 0, 0), Date.now() - m * 60000));
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const W = Capacitor.Plugins.TrovoWatch; let pending = [];
      W.getPendingSessions = () => Promise.resolve({ sessions: pending.slice() });
      W.clearPendingSessions = (a) => { const d = (a && a.sessions) || []; pending = pending.filter(x => d.indexOf(x) < 0); return Promise.resolve({}); };
      window.showToast = () => {};
      const today = todayISO(), pushName = _dayLabel('Push'), NEW = 'Spec Swap Press';
      const isoS = ms => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const wristCopy = (start, exs) => JSON.stringify({ dayName: pushName, slot: 'Push', startedAt: isoS(start), loggedAt: isoS(Date.now()),
        exercises: Object.keys(exs).map(n => ({ name: n, weight: exs[n].w, reps: exs[n].r, weightLog: exs[n].r.map(() => exs[n].w), rpe: 7, rpeLog: exs[n].r.map(() => 7) })) });
      const dayRecs = () => getSessions().filter(s => s.date === today && s.type === 'Push')
        .map(s => s.exercises.map(e => e.name + ' ' + JSON.stringify(e.reps)).sort().join(' | '));
      const closeSheets = () => document.querySelectorAll('.kt-complete-sheet, #kt-complete-sheet, .kt-close-sheet').forEach(e => e.remove());
      // Phone: A [5,8,8] and B [8,8] logged and mirrored to the wrist, then A swapped for NEW and B removed.
      const setup = () => {
        openDeckRunner('Push', true);
        runnerSession.startedAt = recent(20);
        const A = runnerSession.exercises[0].name, B = runnerSession.exercises[1].name;
        runnerRepsLog[A] = [5, 8, 8]; runnerWeightsLog[A] = [185, 185, 185]; runnerRpeLog[A] = [7, 8, 8]; runnerCompleted[A] = 3;
        runnerRepsLog[B] = [8, 8]; runnerWeightsLog[B] = [100, 100]; runnerRpeLog[B] = [7, 7]; runnerCompleted[B] = 2;
        _onWatchLive({ dayName: pushName, slot: 'Push', startedAt: runnerSession.startedAt, reps: { [A]: [5, 8, 8], [B]: [8, 8] }, weights: {} });
        openRunnerExEdit(0); _rExEditName = NEW; saveRunnerExEdit();
        openRunnerExEdit(runnerSession.exercises.findIndex(e => e.name === B)); runnerExRemove();
        const ok = document.querySelector('.kt-close-sheet button[id$="ok"]'); if (ok) ok.click();
        return { A, B, start: runnerSession.startedAt };
      };
      const r = {};

      // 1. in range: the live payload tells the wrist both lifts now have no sets
      lsSet('kt_sessions', []);
      let s = setup();
      const lv = _buildWatchLive();
      r.live = { cards: runnerSession.exercises.map(e => e.name).indexOf(s.B) < 0, a: lv.reps[s.A], b: lv.reps[s.B], swap: lv.reps[NEW],
        ownA: !!(lv.own && lv.own[s.A]), ownB: !!(lv.own && lv.own[s.B]) };

      // 2. out of range, the phone finishes first: the wrist's copy still holds A and B
      runnerFinishSession(); await wait(150); closeSheets();
      pending = [wristCopy(s.start, { [s.A]: { w: 185, r: [5, 8, 8] }, [s.B]: { w: 100, r: [8, 8] } })];
      await drainWatchSessions(); await wait(50);
      r.phoneFirst = { recs: dayRecs(), queue: pending.length };
      _watchEndedPayload = null;

      // 3. out of range, the wrist finishes first: the phone keeps its runner and its corrections win
      lsSet('kt_sessions', []);
      s = setup();
      const copy3 = wristCopy(s.start, { [s.A]: { w: 185, r: [5, 8, 8] }, [s.B]: { w: 100, r: [8, 8] } });
      pending = [copy3];
      _onWatchLive({ dayName: pushName, slot: 'Push', startedAt: s.start, reps: { [s.A]: [5, 8, 8], [s.B]: [8, 8] }, weights: {}, ended: true });
      r.wristFirst = { runnerKept: runnerOpen };
      await drainWatchSessions(); await wait(50);
      r.wristFirst.filed = dayRecs();
      runnerFinishSession(); await wait(150); closeSheets();
      r.wristFirst.after = dayRecs();
      _watchEndedPayload = null;

      // 4. the wrist dropped B (its ack), then logged a new set for it: that set is kept
      lsSet('kt_sessions', []);
      s = setup();
      const own = runnerSession.ownAt || {};
      _onWatchLive({ dayName: pushName, slot: 'Push', startedAt: s.start, reps: { [NEW]: [5, 8, 8], [s.A]: [], [s.B]: [] }, weights: {}, ack: { [s.A]: own[s.A], [s.B]: own[s.B] } });
      _onWatchLive({ dayName: pushName, slot: 'Push', startedAt: s.start, reps: { [NEW]: [5, 8, 8], [s.A]: [], [s.B]: [10] }, weights: {}, ack: { [s.A]: own[s.A], [s.B]: own[s.B] } });
      runnerFinishSession(); await wait(150); closeSheets();
      pending = [wristCopy(s.start, { [NEW]: { w: 185, r: [5, 8, 8] }, [s.B]: { w: 100, r: [10] } })];
      await drainWatchSessions(); await wait(50);
      r.later = { recs: dayRecs(), B: s.B };
      _watchEndedPayload = null;

      // 5. same root: an exercise undone to zero (the wrist never reported) is not re-added by its copy
      lsSet('kt_sessions', []);
      openDeckRunner('Push', true);
      runnerSession.startedAt = recent(20);
      const C = runnerSession.exercises[0].name, D = runnerSession.exercises[1].name;
      runnerRepsLog[C] = [8, 8]; runnerWeightsLog[C] = [150, 150]; runnerCompleted[C] = 2;
      runnerRepsLog[D] = [10]; runnerWeightsLog[D] = [50]; runnerCompleted[D] = 1;
      runnerUndoSet(C, 1); runnerUndoSet(C, 0);
      const start5 = runnerSession.startedAt;
      runnerFinishSession(); await wait(150); closeSheets();
      pending = [wristCopy(start5, { [C]: { w: 150, r: [8, 8] }, [D]: { w: 50, r: [10] } })];
      await drainWatchSessions(); await wait(50);
      r.undoZero = { recs: dayRecs(), C, D };
      return r;
    });
    assert(out.live.cards && JSON.stringify(out.live.a) === '[]' && JSON.stringify(out.live.b) === '[]' && JSON.stringify(out.live.swap) === '[5,8,8]' && out.live.ownA && out.live.ownB,
      'the live payload sends the renamed and removed lifts as empty logs with their own stamps: ' + JSON.stringify(out.live));
    assert(out.phoneFirst.recs.length === 1 && out.phoneFirst.recs[0] === 'Spec Swap Press [5,8,8]' && out.phoneFirst.queue === 0,
      'phone finished first: the wrist copy adds neither lift back (3 sets, not 8): ' + JSON.stringify(out.phoneFirst));
    assert(out.wristFirst.runnerKept, 'wrist finished first while holding the dropped lifts: the phone keeps its runner');
    assert(out.wristFirst.after.length === 1 && out.wristFirst.after[0] === 'Spec Swap Press [5,8,8]',
      'wrist finished first: one record, with the phone\u2019s corrections: ' + JSON.stringify(out.wristFirst));
    assert(out.later.recs.length === 1 && out.later.recs[0] === [out.later.B + ' [10]', 'Spec Swap Press [5,8,8]'].sort().join(' | '),
      'a set the wrist logged after it dropped the lift is kept: ' + JSON.stringify(out.later));
    assert(out.undoZero.recs.length === 1 && out.undoZero.recs[0] === out.undoZero.D + ' [10]',
      'an exercise undone to zero is not re-added by the wrist copy: ' + JSON.stringify(out.undoZero));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('M30: per-set targets reach the wrist (today, the week ahead, a live run)', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const cr = getCustomRoutine();
      cr.weekPlan = ['Push', 'Push', 'Push', 'Push', 'Push', 'Push', 'Push'];
      (cr.weeks || []).forEach(w => {
        delete w.weekPlan;
        if (!w.push || w.push.length < 3) return;
        Object.assign(w.push[0], { sets: 3, reps: [3, 8, 8], weights: [225, 185, 185], weight: 225 });
        Object.assign(w.push[1], { sets: 3, reps: [8, 8, 'Max'], weights: [100, 100, 100], weight: 100 });
        Object.assign(w.push[2], { sets: 3, reps: [10, 10, 10] }); delete w.push[2].weights;
      });
      setCustomRoutine(cr); await wait(50);
      const last = () => __mock.updateContext[__mock.updateContext.length - 1];
      const pick = e => e && { repsList: e.repsList, weights: e.weights, reps: e.reps, weight: e.weight };
      _lastWatchPlan = ''; _pushWatchPlan(); await wait(20);
      const ctx = last(), plan = JSON.parse(ctx.json), week = JSON.parse(ctx.week || '[]');
      const ahead = week.find(d => d.type === 'lift' && d.exercises.length >= 3);
      openDeckRunner('Push', true); await wait(20);
      _lastWatchPlan = ''; _pushWatchPlan(); await wait(20);
      const ctx2 = last(), live = JSON.parse(ctx2.json);
      closeDeckRunner();
      return { type: plan.type, today: plan.exercises.slice(0, 3).map(pick), ahead: ahead && ahead.exercises.slice(0, 3).map(pick),
        live: live.exercises.slice(0, 3).map(pick), nulls: /null/.test(ctx.json + ctx.week + ctx2.json) };
    });
    assert(out.type === 'lift' && out.ahead, 'today and a day ahead are lift days: ' + JSON.stringify(out));
    for (const k of ['today', 'ahead', 'live']) {
      const [top, max, flat] = out[k];
      assert(JSON.stringify(top.repsList) === '[3,8,8]' && JSON.stringify(top.weights) === '[225,185,185]' && top.reps === 3 && top.weight === 225,
        k + ': the top-set/back-off row carries its per-set targets (and the first set for older watches): ' + JSON.stringify(top));
      assert(JSON.stringify(max.repsList) === '[8,8,8]' && max.weights === undefined, k + ': a Max entry is a number; a flat load list is not sent: ' + JSON.stringify(max));
      assert(flat.repsList === undefined && flat.weights === undefined, k + ': a uniform row sends no lists: ' + JSON.stringify(flat));
    }
    assert(!out.nulls, 'no null anywhere in the plan, the week or the live plan (the wrist would reject it)');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('M04: drained wrist sessions set working weights by the runner\u2019s rule', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const W = Capacitor.Plugins.TrovoWatch; let pending = [];
      W.getPendingSessions = () => Promise.resolve({ sessions: pending.slice() });
      W.clearPendingSessions = (a) => { const d = (a && a.sessions) || []; pending = pending.filter(x => d.indexOf(x) < 0); return Promise.resolve({}); };
      window.showToast = () => {};
      const today = todayISO(), L = 'Bench Press', X = 'Spec Wrist Fly', pushName = _dayLabel('Push');
      const iso = ms => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const at = (day, h) => new Date(day + 'T' + String(h).padStart(2, '0') + ':00:00').getTime();
      const nowish = Math.max(at(today, 0) + 60e3, Date.now() - 3600e3);
      const wrist = (startMs, exs) => JSON.stringify({ dayName: pushName, slot: 'Push', startedAt: iso(startMs), loggedAt: iso(Math.min(Date.now(), startMs + 3600e3)),
        exercises: exs.map(([n, w, reps]) => ({ name: n, weight: w, reps, weightLog: reps.map(() => w), rpe: 8, rpeLog: reps.map(() => 8) })) });
      const rec = (date, w, start) => ({ id: start + 1800e3, date, type: 'Push', label: pushName, week: currentWeek, note: '', prs: [], startedAt: start,
        exercises: [{ name: L, sets: 3, reps: [5, 5, 5], weight: w, weightLog: [w, w, w] }] });
      const r = {};
      // (a) the newest log is today's phone session at 185; a wrist session from two days ago at 200 drains late
      lsSet('kt_sessions', [rec(today, 185, nowish)]); lsSet('kt_weights', { [L]: 185 });
      pending = [wrist(at(addDays(today, -2), 9), [[L, 200, [5, 5, 5]]])];
      await drainWatchSessions(); await wait(50);
      r.stale = { w: getWeights()[L], filed: getSessions().length };
      // (b) a lighter wrist session today is the newest log (the phone's was three days ago at 185)
      lsSet('kt_sessions', [rec(addDays(today, -3), 185, at(addDays(today, -3), 11))]); lsSet('kt_weights', { [L]: 185 });
      pending = [wrist(nowish, [[L, 155, [8, 8, 8]]])];
      await drainWatchSessions(); await wait(50);
      r.lighter = getWeights()[L];
      // (c) the phone filed today's session at 185, the working weight moved to 190 since; the wrist's copy
      //     of the same session adds only another lift: 190 stands, the new lift gets its weight
      lsSet('kt_sessions', [rec(today, 185, nowish)]); lsSet('kt_weights', { [L]: 190 });
      pending = [wrist(nowish + 1000, [[L, 185, [5, 5, 5]], [X, 40, [12, 12]]])];
      await drainWatchSessions(); await wait(50);
      const recC = getSessions().find(x => x.date === today);
      r.merge = { w: getWeights()[L], x: getWeights()[X], merged: getSessions().length === 1 && !!(recC && recC.exercises.find(e => e.name === X)) };
      return r;
    });
    assert(out.stale.w === 185 && out.stale.filed === 2, 'a late wrist session from days ago does not top today\u2019s newer log: ' + JSON.stringify(out.stale));
    assert(out.lighter === 155, 'a newer, lighter wrist session sets the working weight (as a phone finish would): ' + out.lighter);
    assert(out.merge.merged && out.merge.w === 190 && out.merge.x === 40, 'a merge speaks only for the lifts it changed: ' + JSON.stringify(out.merge));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('M08: a set next round reaches the watch week, the widget and the reminders as its own weeks', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]', kt_notif_daily: '1' } });
  try {
    const out = await app.page.evaluate(async () => {
      const cr = getCustomRoutine();
      cr.weekPlan = ['Push', 'Rest', 'Pull', 'Rest', 'Legs', 'Rest', 'Rest'];
      cr.weeks.forEach(w => { delete w.weekPlan; });
      cr.weeks[cr.weeks.length - 1].weekPlan = ['Legs', 'Rest', 'Push', 'Rest', 'Pull', 'Rest', 'Rest'];   // the final week has its own cadence
      setCustomRoutine(cr);
      _setWeek(cr.weeks.length);   // parked on the final week, which began this Monday
      const mon = _mostRecentMonday(), start = addDays(mon, 7), L = 'Bench Press';
      const sess = (date, w) => ({ id: new Date(date + 'T10:00:00').getTime(), date, type: 'Push', label: 'Push', week: 10, prs: [],
        exercises: [{ name: L, sets: 4, reps: [8, 8, 8, 8], weight: w, weightLog: [w, w, w, w] }] });
      lsSet('kt_sessions', [sess(addDays(mon, -14), 185)]);
      lsSet('kt_routine_next', { startsOn: start, at: todayISO() });
      const bench = p => ((p && p.exercises) || []).filter(e => e.name === L).map(e => e.weight)[0];
      const oracle = () => (_nextRoundBuild(getCustomRoutine()).routine.weeks[0].push || []).filter(e => e.name === L).map(e => e.weight)[0];
      const r = { lastWk: cr.weeks.length, lastBench: (cr.weeks[cr.weeks.length - 1].push || []).filter(e => e.name === L).map(e => e.weight)[0] };
      const m1 = _watchPlanForDate(start), w2 = _watchPlanForDate(addDays(start, 9)), before = _watchPlanForDate(addDays(start, -3));
      r.mon = { week: m1.week, slot: m1.slot, bench: bench(m1), want: oracle() };
      r.wk2 = { week: w2.week, slot: w2.slot };
      r.before = { week: before.week, slot: before.slot || before.type };
      const day = _nativeSummaryDays(14).find(d => d.date === start);
      r.widget = { type: day.type, lifts: day.lifts, want: (_nextRoundBuild(getCustomRoutine()).routine.weeks[0].push || []).length };
      const LN = Capacitor.Plugins.LocalNotifications; let sched = null;
      LN.schedule = (p) => { sched = p; return Promise.resolve({}); };
      _syncReminders();
      const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const rem = ((sched && sched.notifications) || []).find(n => ymd(new Date(n.schedule.at)) === start);
      r.reminder = rem ? rem.title : null; r.pushTitle = 'Today is ' + _dayLabel('Push').toLowerCase() + ' day';
      _lastWatchPlan = ''; _pushWatchPlan();
      const ctx = __mock.updateContext[__mock.updateContext.length - 1], week = JSON.parse((ctx && ctx.week) || '[]');
      r.pushed = { n: week.length, after: week.filter(d => d.date >= start).every(d => d.week === 1),
        beforeOk: week.filter(d => d.date < start).every(d => d.week === r.lastWk) };
      // a heavier log this round re-bases the preview again; cancelling the round takes it away
      lsSet('kt_sessions', [sess(todayISO(), 205)].concat(getSessions()));
      r.relog = { bench: bench(_watchPlanForDate(start)), want: oracle() };
      lsDel('kt_routine_next');
      const c = _watchPlanForDate(start);
      r.cancelled = { week: c.week, slot: c.slot };
      return r;
    });
    assert(out.mon.week === 1 && out.mon.slot === 'Push' && out.mon.bench === out.mon.want && out.mon.want !== out.lastBench,
      'the start Monday is round 2 week 1 with its re-based load, not the final week: ' + JSON.stringify(out));
    assert(out.wk2.week === 2 && out.wk2.slot === 'Pull', 'nine days in is round 2 week 2 (its Wednesday): ' + JSON.stringify(out.wk2));
    assert(out.before.week === out.lastWk, 'the days before the start stay the current programme\u2019s final week: ' + JSON.stringify(out.before));
    assert(out.widget.type === 'Push' && out.widget.lifts === out.widget.want, 'the widget summary shows round 2\u2019s day on the start Monday: ' + JSON.stringify(out.widget));
    assert(out.reminder === out.pushTitle, 'the start Monday\u2019s reminder names round 2\u2019s day: ' + out.reminder);
    assert(out.pushed.n === 6 && out.pushed.after && out.pushed.beforeOk, 'the pushed week ahead: round 2 week 1 from the start, the final week before it: ' + JSON.stringify(out.pushed));
    assert(out.relog.bench === out.relog.want && out.relog.bench > out.mon.bench, 'a heavier log this round re-bases the preview: ' + JSON.stringify(out.relog));
    assert(out.cancelled.week === out.lastWk, 'a cancelled round leaves the final week in place: ' + JSON.stringify(out.cancelled));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('L19: an empty lift day reaches the widget as a lift day and the wrist as a lift plan with nothing in it', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const cr = getCustomRoutine(), dow = (new Date().getDay() + 6) % 7, seq = ['Arms', 'Run', 'Cycling', 'Push', 'Rest', 'Pull', 'Yoga'];
      cr.weeks.forEach(w => { delete w.weekPlan; delete w.arms; });   // no week has an Arms day built
      cr.weekPlan = [0, 1, 2, 3, 4, 5, 6].map(i => seq[(i - dow + 7) % 7]);   // today Arms, then Run, Cycling…
      setCustomRoutine(cr);
      const days = _nativeSummaryDays(7);
      _lastWatchPlan = ''; _pushWatchPlan();
      const plan = JSON.parse(__mock.updateContext[__mock.updateContext.length - 1].json);
      // before a programme's start every day is a rest day, and says so
      localStorage.setItem('kt_week_monday', addDays(_mostRecentMonday(), 7));
      const pre = _nativeSummaryDays(1)[0];
      return { kinds: days.map(d => d.kind), types: days.map(d => d.type), lifts: days.map(d => d.lifts), rest: days.map(d => d.isRest),
        watch: { type: plan.type, slot: plan.slot, n: plan.exercises.length }, pre: { kind: pre.kind, isRest: pre.isRest } };
    });
    assert(JSON.stringify(out.kinds) === '["lift","run","sport","lift","rest","lift","sport"]', 'each day says what it is: ' + JSON.stringify(out));
    assert(out.types[0] === 'Arms' && out.lifts[0] === 0 && out.rest[0] === false && out.lifts[3] > 0,
      'the empty Arms day is a lift day with 0 lifts (not a rest or cardio day); a built day keeps its count: ' + JSON.stringify(out));
    assert(out.watch.type === 'lift' && out.watch.slot === 'Arms' && out.watch.n === 0, 'the wrist gets the empty day as a lift plan with no exercises: ' + JSON.stringify(out.watch));
    assert(out.pre.kind === 'rest' && out.pre.isRest, 'a day before the programme starts is a rest day: ' + JSON.stringify(out.pre));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('L17: each widget summary day carries its own programme week', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const r = {}, total = getTotalWeeks();
      // mid-programme: week 6 began this Monday
      _setWeek(6);
      const mon = _mostRecentMonday(), next = addDays(mon, 7);
      const wk = days => days.map(d => (d.date < next ? 'a' : d.date < addDays(next, 7) ? 'b' : 'c') + d.week);
      let sum = null; Capacitor.Plugins.TrovoWidget.updateSummary = (o) => { sum = JSON.parse(o.json); return Promise.resolve({}); };
      _lastNativeSummary = null; _runNativeSync();
      r.mid = { weeks: wk(_nativeSummaryDays(15)), top: sum && sum.week, sent: sum && sum.days.map(d => d.week) };
      // parked on the final week: the days after its end keep the final week's number
      _setWeek(total);
      r.parked = _nativeSummaryDays(15).map(d => d.week);
      // a next round set for next Monday: its days count from its week 1
      lsSet('kt_routine_next', { startsOn: next, at: todayISO() });
      r.round = _nativeSummaryDays(15).map(d => (d.date < next ? 'old' : 'new') + d.week);
      return Object.assign(r, { total });
    });
    const ok = (arr, f) => arr.every(f);
    assert(ok(out.mid.weeks, s => ({ a: 'a6', b: 'b7', c: 'c8' })[s[0]] === s), 'this week\u2019s days are week 6, next week\u2019s 7, the one after 8: ' + JSON.stringify(out.mid));
    assert(out.mid.top === 6 && out.mid.sent.length === 7 && out.mid.sent.every(w => w === 6 || w === 7),
      'the widget gets each day\u2019s week; the summary\u2019s own week stays the current week (older widgets read it): ' + JSON.stringify(out.mid));
    assert(ok(out.parked, w => w === out.total), 'past the final week the days keep its number: ' + JSON.stringify(out.parked));
    assert(ok(out.round, s => s === 'old' + out.total || s === 'new1' || s === 'new2') && out.round.indexOf('new1') >= 0,
      'a set next round counts its days from its week 1: ' + JSON.stringify(out.round));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('L18: a summary day is done only by what that day asks for (the rule the widget overlays mirror)', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]', kt_runs: '[]', kt_sports: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const dow = (new Date().getDay() + 6) % 7, today = todayISO(), r = {};
      const day = () => { const d = _nativeSummaryDays(1)[0]; return d.kind + ':' + d.type + ':' + d.done; };
      const sess = type => ({ id: Date.now() + Math.random(), date: today, type, label: type, week: currentWeek, prs: [],
        exercises: [{ name: 'Spec Lift', sets: 1, reps: [5], weight: 100, weightLog: [100] }] });
      const sport = type => ({ id: Date.now() + Math.random(), date: today, type, duration: 40, data: {} });
      // a lift day: another slot's session does not count, its own does
      setWeekPlanDay(dow, 'Legs'); lsSet('kt_sessions', [sess('Pull')]);
      r.liftOther = day(); lsSet('kt_sessions', [sess('Pull'), sess('Legs')]); r.liftOwn = day();
      // a run day: a ride (filed as Cycling) does not count, a run does
      setWeekPlanDay(dow, 'Run'); lsSet('kt_sessions', []); lsSet('kt_sports', [sport('Cycling')]);
      r.runRide = day(); lsSet('kt_runs', [{ id: Date.now(), date: today, km: 5, time: '25:00' }]); r.runRun = day();
      // a sport day: a run or another sport does not count, its own sport does
      setWeekPlanDay(dow, 'Cycling'); lsSet('kt_sports', [sport('Yoga')]);
      r.sportOther = day(); lsSet('kt_sports', [sport('Yoga'), sport('Cycling')]); r.sportOwn = day();
      r.rideMapsTo = _hkSportId({ type: 'ride' });
      return r;
    });
    assert(out.liftOther === 'lift:Legs:false' && out.liftOwn === 'lift:Legs:true', 'a lift day is done by its own slot only: ' + JSON.stringify(out));
    assert(out.runRide === 'run:Run:false' && out.runRun === 'run:Run:true', 'a run day is done by a run, not a ride: ' + JSON.stringify(out));
    assert(out.sportOther === 'sport:Cycling:false' && out.sportOwn === 'sport:Cycling:true' && out.rideMapsTo === 'Cycling',
      'a sport day is done by its own sport; its type is the id a Health ride maps to: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('L51: the staged-page note follows what the shell holds (restore, breaker, newer build, served page)', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const p = APP_BUILD.split('-'), X = p[0] + '-' + (parseInt(p[1], 10) + 50), Y = p[0] + '-' + (parseInt(p[1], 10) + 51);
      window.showToast = () => {};
      let shell = {}, stages = [], pages = 0, published = X;
      // the shell, stateful as TrovoOtaPlugin is: a stage writes liveBuild (and staged on shells that report it)
      Capacitor.Plugins.TrovoOta = {
        status: () => Promise.resolve(Object.assign({ bundleBuild: APP_BUILD }, shell)),
        stage: (o) => { stages.push(o.build); shell.liveBuild = o.build; if ('staged' in shell) shell.staged = true; return Promise.resolve({ staged: true, build: o.build }); },
        confirm: () => Promise.resolve(),
      };
      window.fetch = (u) => {
        if (/build\.txt/.test(String(u))) return Promise.resolve({ ok: true, text: () => Promise.resolve(published + '\n') });
        pages++;
        return Promise.resolve({ ok: true, text: () => Promise.resolve('<!doctype html><html><head><meta name="build" content="' + published + '"></head><body>' + 'x'.repeat(20000) + '</body></html>') });
      };
      const about = () => { switchTab('settings'); const row = [...document.querySelectorAll('.settings-row')].find(r => /App build/.test(r.textContent)); return row ? row.textContent.replace(/\s+/g, ' ') : ''; };
      const reset = (s, note) => { shell = s; stages = []; pages = 0; published = X; localStorage.removeItem('kt_ota_rejected'); localStorage.setItem('kt_last_seen_build', X);
        if (note) localStorage.setItem('kt_ota_staged', note); else localStorage.removeItem('kt_ota_staged'); };
      const check = async () => { await _otaSyncStaged(); _checkLiveStamp(); await wait(60); };
      const r = {};
      // a restored phone on a shell that cannot say whether the folder is there; then on one that can
      reset({ liveBuild: X, active: false }, X); await check();
      r.restoredOld = { stages: stages.slice(), note: localStorage.getItem('kt_ota_staged') };
      reset({ liveBuild: X, active: false, staged: false }, X); await check(); await check();
      r.restoredNew = { stages: stages.slice(), note: localStorage.getItem('kt_ota_staged'), about: about() };
      // staged this session, the folder is there: left alone
      reset({ liveBuild: X, active: false, staged: true }, X); await check();
      r.inStep = { stages: stages.slice(), pages, note: localStorage.getItem('kt_ota_staged') };
      // the breaker threw X out: remembered, not downloaded or staged again, About says so
      reset({ liveBuild: '', active: false, staged: false }, X); await check(); await check();
      r.breaker = { stages: stages.slice(), pages, note: localStorage.getItem('kt_ota_staged'), rejected: localStorage.getItem('kt_ota_rejected'), about: about() };
      // a newer build after that still stages
      published = Y; localStorage.setItem('kt_last_seen_build', Y); await check();
      r.newer = { stages: stages.slice(), note: localStorage.getItem('kt_ota_staged') };
      // the served page: the note follows the shell
      reset({ liveBuild: X, active: true, staged: true }, ''); await _otaSyncStaged();
      r.served = localStorage.getItem('kt_ota_staged');
      return Object.assign(r, { X, Y });
    });
    assert(JSON.stringify(out.restoredOld.stages) === JSON.stringify([out.X]) && out.restoredOld.note === out.X, 'a restored phone stages the page again (older shell): ' + JSON.stringify(out.restoredOld));
    assert(JSON.stringify(out.restoredNew.stages) === JSON.stringify([out.X]) && out.restoredNew.note === out.X && /applies on next launch/.test(out.restoredNew.about),
      'a restored phone stages it again once (a shell that reports the folder): ' + JSON.stringify(out.restoredNew));
    assert(out.inStep.stages.length === 0 && out.inStep.pages === 0 && out.inStep.note === out.X, 'a staged page whose folder is there is left alone: ' + JSON.stringify(out.inStep));
    assert(out.breaker.stages.length === 0 && out.breaker.pages === 0 && out.breaker.note === null && out.breaker.rejected === out.X && /couldn\u2019t start/.test(out.breaker.about) && !/applies on next launch/.test(out.breaker.about),
      'a build the breaker threw out is not fetched or staged again, and About says so: ' + JSON.stringify(out.breaker));
    assert(JSON.stringify(out.newer.stages) === JSON.stringify([out.Y]) && out.newer.note === out.Y, 'a newer build still stages: ' + JSON.stringify(out.newer));
    assert(out.served === out.X, 'a served page syncs the note to it: ' + out.served);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
