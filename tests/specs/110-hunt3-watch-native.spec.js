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
      'wrist finished first: one record, with the phone’s corrections: ' + JSON.stringify(out.wristFirst));
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
