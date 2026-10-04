// Hunt 3 (2026-10-04), watch and native surfaces:
// - H06: a lift renamed or removed on the phone mid-workout stays gone. The live payload sends it
//   as an empty log with its `own` stamp (the wrist drops the mirrored sets), and a wrist copy that
//   still holds them (out of range) never files them again, whoever finishes first. Sets the wrist
//   logs after it dropped the lift are still its own; an exercise undone to zero stays at zero.
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
