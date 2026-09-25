// Phone side of the 2026-09-22 watch audit: an undo on the phone sticks, a wrist copy of the
// same session is merged (never dropped, never duplicated), the 'ended' signal carries what was
// saved and lasts, a discard reaches the wrist, a finished session is not re-announced as live,
// a restored draft keeps the wrist on its session, and a failed save never clears the queue.
const { boot, assert, run } = require('../lib/harness');

run('watch bridge: undo sticks, merges instead of drops, ended/discard reach the wrist', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      // 'A few minutes ago', but never before 00:01 today: sessions file by their start, so a run
      // just after midnight would otherwise land on yesterday and miss the today-based lookups.
      const recent = m => Math.min(Date.now() - 1000, Math.max(new Date().setHours(0, 1, 0, 0), Date.now() - m * 60000));   // never in the future (00:00-00:01)
      const W = Capacitor.Plugins.TrovoWatch;
      let cleared = 0, pending = [], ctx = null;
      W.getPendingSessions = () => Promise.resolve({ sessions: pending.slice() });
      W.clearPendingSessions = () => { cleared++; pending = []; return Promise.resolve({}); };
      W.updateContext = (p) => { ctx = p; return Promise.resolve({ sent: true }); };
      const today = todayISO();
      const pushName = _dayLabel('Push');

      // A. an undo on the phone is not put back by the wrist
      openDeckRunner('Push');
      const A = runnerSession.exercises[0].name;
      runnerRepsLog[A] = [8, 8, 8]; runnerWeightsLog[A] = [100, 100, 100]; runnerCompleted[A] = 3;
      runnerUndoSet(A, 2);
      const ownAt = runnerSession.ownAt && runnerSession.ownAt[A];
      const live1 = {}; live1[A] = [8, 8, 8];
      _onWatchLive({ dayName: pushName, slot: 'Push', startedAt: Date.now(), reps: live1, weights: {} });   // an older watch echoes the undone set
      r.undoKept = runnerRepsLog[A].slice(0, runnerCompleted[A]);
      const lv = _buildWatchLive();
      r.liveOwn = !!(lv && lv.own && lv.own[A]);
      r.wlog = lv && lv.wlog && lv.wlog[A];
      const live2 = {}; live2[A] = [8, 8, 10]; const at2 = {}; at2[A] = ownAt + 5; const w2 = {}; w2[A] = 105;
      _onWatchLive({ dayName: pushName, slot: 'Push', startedAt: Date.now(), reps: live2, weights: w2, at: at2 });   // build 51 logged after adopting
      r.afterWrist = runnerRepsLog[A].slice(0, runnerCompleted[A]);

      // B. the phone's finish merges the wrist copy instead of deleting it; the copy's 4th set
      //    (logged on the wrist after the correction, never received here) is kept
      const s0 = getSessions();
      s0.unshift({ id: Date.now() - 1000, date: today, type: 'Push', label: pushName, week: currentWeek, note: 'From Apple Watch', prs: [],
        exercises: [{ name: 'Wrist Curl', sets: 2, reps: [12, 12], weight: 30, weightLog: [30, 30] },
                    { name: A, sets: 4, reps: [8, 8, 10, 10], weight: 100, weightLog: [100, 100, 100, 100] }] });
      lsSet('kt_sessions', s0);
      runnerFinishSession();
      await wait(150);
      const recs = getSessions().filter(x => x.date === today && x.type === 'Push');
      const rec = recs[0];
      r.finish = { count: recs.length, names: rec.exercises.map(e => e.name), aReps: (rec.exercises.find(e => e.name === A) || {}).reps, owned: rec.phoneOwned };
      const ended = _buildWatchLive();
      r.ended = { ended: !!(ended && ended.ended), reps: ended && ended.reps && ended.reps[A], curl: !!(ended && ended.reps && ended.reps['Wrist Curl']), endedAt: !!(ended && ended.endedAt) };
      r.endedRepeats = !!_buildWatchLive();
      _watchEndedPayload.endedAt -= 31 * 60 * 1000;
      r.endedExpires = _buildWatchLive() === null;
      document.querySelectorAll('.kt-complete-sheet, #kt-complete-sheet').forEach(e => e.remove());

      // C. a finished session is not re-announced as live; a new one is
      const liveOld = {}; liveOld[A] = [8];
      _onWatchLive({ dayName: pushName, slot: 'Push', startedAt: recent(60), reps: liveOld, weights: {} });
      r.ghost = _watchLive;
      _onWatchLive({ dayName: pushName, slot: 'Push', startedAt: Date.now() + 10, reps: liveOld, weights: {} });
      r.fresh = _watchLive && _watchLive.dayName;
      _watchLive = null;

      // D. the drain merges into the logged session; draining it again changes nothing
      // started before the phone finished, so it is a copy of the same session (one begun after would be its own record)
      const wristSess = JSON.stringify({ dayName: pushName, slot: 'Push', startedAt: new Date(recent(5)).toISOString(),
        exercises: [{ name: 'Wrist Curl', reps: [12, 12, 12], weight: 30 }, { name: A, reps: [1, 1, 1, 1], weight: 10 }, { name: 'New Lift', reps: [5], weight: 50 }] });
      pending = [wristSess]; cleared = 0;
      drainWatchSessions(); await wait(300);
      const recD = getSessions().filter(x => x.date === today && x.type === 'Push');
      const dr = recD[0];
      r.drain = { count: recD.length, curl: (dr.exercises.find(e => e.name === 'Wrist Curl') || {}).reps, a: (dr.exercises.find(e => e.name === A) || {}).reps,
        newLift: !!dr.exercises.find(e => e.name === 'New Lift'), cleared };
      const before = JSON.stringify(getSessions());
      pending = [wristSess];
      drainWatchSessions(); await wait(300);
      r.redrainSame = JSON.stringify(getSessions()) === before;

      // E. a save that fails (storage full) never clears the watch's queue, and leaves no phantom
      const realSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (k === 'kt_sessions') throw new Error('QuotaExceededError'); return realSetItem.call(this, k, v); };
      pending = [JSON.stringify({ dayName: _dayLabel('Pull'), slot: 'Pull', startedAt: new Date().toISOString(), exercises: [{ name: 'Row X', reps: [8], weight: 50 }] })];
      cleared = 0;
      drainWatchSessions(); await wait(200);
      drainWatchSessions(); await wait(200);   // a second drain (boot / resume timers) must not see a phantom
      r.phantom = getSessions().some(x => x.date === today && x.type === 'Pull');
      Storage.prototype.setItem = realSetItem;
      r.queueKept = cleared === 0 && pending.length === 1;
      r.queueDbg = { cleared, pending: pending.length, log: JSON.parse(localStorage.getItem('kt_wch_log') || '[]').slice(0, 6) };
      pending = [];

      // F. a restored draft keeps the wrist on its session, not today's Rest
      const cr = getCustomRoutine(); cr.weekPlan = ['Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest']; (cr.weeks || []).forEach(w => { delete w.weekPlan; }); setCustomRoutine(cr);
      openDeckRunner('Pull');
      const P0 = runnerSession.exercises[0].name;
      runnerRepsLog[P0] = [8]; runnerWeightsLog[P0] = [80]; runnerCompleted[P0] = 1;
      runnerOpen = false; runnerResumePending = true;   // a cold launch: the draft is restored, the runner closed
      _lastWatchPlan = ''; _pushWatchPlan();
      const planF = ctx && JSON.parse(ctx.json);
      r.draftPlan = planF && { slot: planF.slot, type: planF.type, n: planF.exercises.length };

      // G. discarding reaches the wrist
      runnerOpen = true; runnerResumePending = false;
      discardDeckRunner();
      const disc = _buildWatchLive();
      r.discard = disc && { ended: disc.ended, discarded: disc.discarded, slot: disc.slot };
      return r;
    });
    assert(JSON.stringify(out.undoKept) === '[8,8]', 'an older watch echoing the undone set does not put it back: ' + JSON.stringify(out.undoKept));
    assert(out.liveOwn && JSON.stringify(out.wlog) === '[100,100]', 'the live payload marks the phone edit and carries per-set weights: ' + JSON.stringify([out.liveOwn, out.wlog]));
    assert(JSON.stringify(out.afterWrist) === '[8,8,10]', 'a wrist set logged after the undo is taken: ' + JSON.stringify(out.afterWrist));
    assert(out.finish.count === 1 && out.finish.names.indexOf('Wrist Curl') >= 0 && JSON.stringify(out.finish.aReps) === '[8,8,10,10]' && JSON.stringify(out.finish.owned) === JSON.stringify([out.finish.names[0]]),
      'finishing merges the wrist copy (its Wrist Curl and its later 4th set kept; the undone set stays gone): ' + JSON.stringify(out.finish));
    assert(out.ended.ended && JSON.stringify(out.ended.reps) === '[8,8,10,10]' && out.ended.curl && out.ended.endedAt, 'the ended signal carries what was saved and when: ' + JSON.stringify(out.ended));
    assert(out.endedRepeats && out.endedExpires, 'the ended signal rides every push for 30 minutes, then stops');
    assert(out.ghost === null && out.fresh === 'Push', 'a finished session is not re-announced; a later one is: ' + JSON.stringify([out.ghost, out.fresh]));
    assert(out.drain.count === 1 && JSON.stringify(out.drain.curl) === '[12,12,12]' && JSON.stringify(out.drain.a) === '[8,8,10,10]' && out.drain.newLift && out.drain.cleared === 1,
      'the drain merges: longer wrist log kept, phone-corrected lift untouched, new lift added, queue cleared: ' + JSON.stringify(out.drain));
    assert(out.redrainSame, 'draining the same wrist session twice changes nothing');
    assert(out.queueKept && !out.phantom, 'a failed save keeps the watch queue and leaves no phantom session: ' + JSON.stringify([out.phantom, out.queueDbg]));
    assert(out.draftPlan && out.draftPlan.slot === 'Pull' && out.draftPlan.type === 'lift' && out.draftPlan.n > 0, 'a restored draft keeps the wrist on its session: ' + JSON.stringify(out.draftPlan));
    assert(out.discard && out.discard.ended && out.discard.discarded && out.discard.slot === 'Pull', 'a discard reaches the wrist: ' + JSON.stringify(out.discard));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
