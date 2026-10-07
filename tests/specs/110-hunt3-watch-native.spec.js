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
//
// Hunt 4 (2026-10-06), regressions of the above:
// - R41: a lift removed (or renamed away) and brought back into the session, a case-only rename,
//   and an undo followed by more sets: the wrist mirrors every set logged here after the
//   correction, so its copy (out of range, or a restored draft) never files those sets again.
// - R42: since M08 the wrist trains a set round's own days from its start Monday. A session it
//   logged there (watch build 53+: per-set RPE) is the new round's week 1 with its block, drained
//   before the swap or after it; it counts for the new round (carry forward, its best) and stays
//   out of the old round's best, so the round built is the one the wrist was shown. A session from
//   an older watch (no per-set RPE: it kept the last plan sent) is still the old round's (spec 108),
//   and so is one logged before a round set on its own Monday is tapped in (a sheet painted the
//   night before): the wrist had only the old round's parked week.
// - R43: a late wrist copy that adds sets to a lift the phone filed moves its working weight only
//   while that is still what the phone's finish left: a +5, a deload or the coach's weight set since
//   stands; a backdated session's heavier set may still raise it.
// - R44: a started programme with nothing logged stays on its week when Monday comes
//   (autoAdvanceWeek), so the widget, the wrist's week ahead and the reminders give later weeks'
//   days this week's number and cadence until something is logged.
const { boot, assert, run } = require('../lib/harness');

// A wall clock the spec can move (spec 108's): local 'YYYY-MM-DDTHH:MM:SS', computed in the page
// from the real today; a cold boot keeps the storage the app left (the harness re-seeds each load).
const CLOCK = () => {
  try {
    const snap = sessionStorage.getItem('__ls');
    if (snap) { const o = JSON.parse(snap); localStorage.clear(); Object.keys(o).forEach(k => localStorage.setItem(k, o[k])); sessionStorage.removeItem('__ls'); }
  } catch (e) {}
  if (window.__setNow) return;
  const RealDate = Date; let offset = 0;
  const t = sessionStorage.getItem('__now'); if (t) offset = new RealDate(t).getTime() - RealDate.now();
  function FakeDate(...a) {
    if (!(this instanceof FakeDate)) return new RealDate(RealDate.now() + offset).toString();
    if (a.length === 0) return new RealDate(RealDate.now() + offset);
    return new RealDate(...a);
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = () => RealDate.now() + offset;
  FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
  window.Date = FakeDate;
  window.__setNow = (iso) => { offset = new RealDate(iso).getTime() - RealDate.now(); sessionStorage.setItem('__now', iso); };
};
async function coldBoot(app) {
  await app.page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } sessionStorage.setItem('__ls', JSON.stringify(o)); });
  await app.page.reload({ waitUntil: 'load' });
  await app.page.waitForFunction(() => typeof window.render === 'function');
}

// A model of the build-58 wrist runner (SuperoWatchApp.swift: logSet, pushLive, merge,
// hasSetsBeyond, finish, the 'ended' branch), fed by the page's own _buildWatchLive/_onWatchLive.
const WRIST = `
window.Wrist = function(slot){ Object.assign(this, { dayName: _dayLabel(slot), slot, reps: {}, wlog: {}, rlog: {}, at: {}, ack: {}, startedAt: 0 }); };
Wrist.prototype.push = function(){ const c = o => JSON.parse(JSON.stringify(o));
  return { dayName: this.dayName, slot: this.slot, startedAt: this.startedAt, reps: c(this.reps), weights: {}, rlog: c(this.rlog), at: c(this.at), ack: c(this.ack), hk: true }; };
Wrist.prototype.logSet = function(n, r, w){   // returns the wrist's live push (deliver it, or drop it: out of range)
  this.at[n] = Math.max(Date.now(), (this.at[n] || 0) + 1);
  this.reps[n] = (this.reps[n] || []).concat([r]); this.wlog[n] = (this.wlog[n] || []).concat([w]); this.rlog[n] = (this.rlog[n] || []).concat([7]);
  return this.push(); };
Wrist.prototype.merge = function(live){
  const inc = JSON.parse(JSON.stringify(live.reps || {})); let ahead = false;
  Object.keys(live.own || {}).forEach(n => { if (inc[n] === undefined) inc[n] = []; });
  Object.keys(inc).forEach(n => { const a = inc[n], l = this.reps[n] || [];
    const edit = ((live.own || {})[n] || 0) > (this.at[n] || 0) && JSON.stringify(a) !== JSON.stringify(l);
    if (edit || a.length > l.length) { this.reps[n] = a.slice(); this.wlog[n] = ((live.wlog || {})[n] || a.map(() => (live.weights || {})[n] || 0)).slice(); this.rlog[n] = a.map(() => 7);
      if (edit && live.own[n]) { this.at[n] = live.own[n]; this.ack[n] = live.own[n]; } }
    else if (l.length > a.length) ahead = true; });
  Object.keys(this.reps).forEach(n => { if (this.reps[n].length && inc[n] === undefined) ahead = true; });
  return ahead ? this.push() : null; };
Wrist.prototype.copy = function(){ const iso = ms => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(/\\.\\d{3}Z$/, 'Z');
  return JSON.stringify({ dayName: this.dayName, slot: this.slot, startedAt: iso(this.startedAt), loggedAt: iso(Date.now()),
    exercises: Object.keys(this.reps).filter(n => this.reps[n].length).map(n => ({ name: n, weight: Math.max(...this.wlog[n]), reps: this.reps[n],
      weightLog: this.wlog[n], rpe: 7, rpeLog: this.rlog[n] })) }); };
Wrist.prototype.ended = function(live){   // sets beyond the phone's final log go as a wrist copy
  const r = live.reps || {}; return Object.keys(this.reps).some(n => this.reps[n].length > (r[n] || []).length) ? this.copy() : null; };
window.toWrist = wr => { const lv = _buildWatchLive(); const back = lv && !lv.ended ? wr.merge(lv) : null; if (back) _onWatchLive(back); };
window.phoneSet = (n, r, w) => { const i = runnerSession.exercises.findIndex(e => e.name === n); if (i !== runnerExIdx) runnerGoTo(i);
  runnerEngaged = true; runnerReps[n] = r; runnerWeights[n] = w; runnerCompleteSet(); runnerSkipRest(); };
`;

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

// R41: the wrist mirrors the sets logged here after a correction; a removed or renamed lift that
// comes back (re-added, swapped back, a case-only rename) and an undo followed by more sets kept
// a baseline below them, so the wrist copy filed those sets twice (out of range, restored draft).
run('R41: a lift that comes back after a correction is not doubled by the wrist copy', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]' } });
  try {
    await app.page.evaluate(WRIST);
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      // 'Half an hour ago', but never before 00:01 today: sessions file by their start.
      const recent = () => Math.min(Date.now() - 1000, Math.max(new Date().setHours(0, 1, 0, 0), Date.now() - 30 * 60000));
      const W = Capacitor.Plugins.TrovoWatch; let pending = [];
      W.getPendingSessions = () => Promise.resolve({ sessions: pending.slice() });
      W.clearPendingSessions = (a) => { const d = (a && a.sessions) || []; pending = pending.filter(x => d.indexOf(x) < 0); return Promise.resolve({}); };
      window.showToast = () => {}; window.showUndoToast = () => {};
      const today = todayISO(), ALT = 'Spec Swap Press';
      const recs = () => getSessions().filter(s => s.date === today && s.type === 'Push')
        .map(s => s.exercises.map(e => e.name + ' ' + JSON.stringify(e.reps)).sort().join(' | '));
      const start = () => { lsSet('kt_sessions', []); _watchEndedPayload = null; openDeckRunner('Push', true); runnerSession.startedAt = recent();
        const w = new Wrist('Push'); w.startedAt = runnerSession.startedAt; return w; };
      const at = n => runnerSession.exercises.findIndex(e => e.name === n);
      const remove = n => { openRunnerExEdit(at(n)); runnerExRemove(); const ok = document.querySelector('.kt-close-sheet button[id$="ok"]'); if (ok) ok.click(); };
      const add = (after, n) => { openRunnerExEdit(at(after)); _openRunnerExPicker('add'); runnerExPickExercise(n); closeRunnerExEdit(); };
      const rename = (from, to) => { openRunnerExEdit(at(from)); _rExEditName = to; saveRunnerExEdit(); };
      // The phone finishes, its 'ended' reaches the wrist, which holds a set beyond it: its copy drains.
      const phoneFirst = async w => { runnerFinishSession(); await wait(120);
        document.querySelectorAll('.kt-complete-sheet, #kt-complete-sheet, .kt-close-sheet').forEach(e => e.remove());
        const c = w.ended(_buildWatchLive()); if (c) pending.push(c); await drainWatchSessions(); await wait(30); return recs(); };
      // The app is killed (its draft stays), the owner finishes on the wrist, the app relaunches and drains.
      const viaDraft = async w => { _flushRunnerDraft(); runnerOpen = false; runnerResumePending = true;
        pending.push(w.copy()); await drainWatchSessions(); await wait(30); runnerResumePending = false; runnerSession = null; return recs(); };
      const r = {};
      let wr = start(); const A = runnerSession.exercises[0].name, B = runnerSession.exercises[1].name, a = A.toLowerCase();
      const set3 = (n, reps) => { for (let i = 0; i < 3; i++) { phoneSet(n, reps, 185); toWrist(wr); } };
      // A with 2 mirrored sets is removed; the wrist drops it and acks with its next set (on B); A comes back for 3 sets.
      const readd = ack => { phoneSet(A, 8, 185); toWrist(wr); phoneSet(A, 8, 185); toWrist(wr); phoneSet(B, 10, 100); toWrist(wr);
        remove(A); toWrist(wr); if (ack) _onWatchLive(wr.logSet(B, 10, 100)); add(B, A); set3(A, 8); };
      readd(true); r.ackOwn = (runnerSession.ownLen || {})[A]; wr.logSet(B, 10, 100); r.readd = await phoneFirst(wr);
      wr = start(); readd(false); wr.logSet(B, 10, 100); r.readdNoAck = await phoneFirst(wr);
      wr = start(); readd(true); r.readdDraft = await viaDraft(wr);
      // ...and a set only the wrist logged on it afterwards is still its own
      wr = start(); readd(true); wr.logSet(A, 6, 185); r.readdWrist = await phoneFirst(wr);
      // A swapped for another lift and back (the wrist acks each drop), then one more set
      const swapBack = () => { phoneSet(A, 5, 185); toWrist(wr); phoneSet(A, 5, 185); toWrist(wr); rename(A, ALT); toWrist(wr);
        _onWatchLive(wr.logSet(B, 10, 100)); rename(ALT, A); toWrist(wr); _onWatchLive(wr.logSet(B, 10, 100)); phoneSet(A, 5, 185); toWrist(wr); };
      wr = start(); swapBack(); wr.logSet(B, 10, 100); r.swapBack = await phoneFirst(wr);
      wr = start(); swapBack(); r.swapBackDraft = await viaDraft(wr);
      // a case-only rename: the old spelling's baseline (0 after the ack) never sets the new one's
      wr = start(); phoneSet(A, 5, 185); toWrist(wr); phoneSet(A, 5, 185); toWrist(wr); rename(A, a); toWrist(wr);
      _onWatchLive(wr.logSet(B, 10, 100)); phoneSet(a, 5, 185); toWrist(wr); wr.logSet(B, 10, 100); r.caseOnly = await phoneFirst(wr);
      // an undo, then two more sets here: not doubled; an undo, a re-logged set and one only the wrist has: kept once
      wr = start(); set3(A, 8); runnerUndoSet(A, 2); toWrist(wr); phoneSet(A, 9, 185); toWrist(wr); phoneSet(A, 9, 185); toWrist(wr);
      wr.logSet(B, 10, 100); r.undoMore = await phoneFirst(wr);
      wr = start(); set3(A, 8); runnerUndoSet(A, 2); toWrist(wr); phoneSet(A, 9, 185); toWrist(wr); wr.logSet(A, 10, 185); r.undoWrist = await phoneFirst(wr);
      return Object.assign(r, { A, B, a });
    });
    const one = (k, want) => assert(out[k].length === 1 && out[k][0] === want.sort().join(' | '), k + ': ' + JSON.stringify(out[k]) + ' (want ' + JSON.stringify(want) + ')');
    const { A, B, a } = out;
    assert(out.ackOwn === 0, 'the wrist acked the drop: the removed lift’s baseline fell to what it holds (0): ' + out.ackOwn);
    one('readd', [A + ' [8,8,8]', B + ' [10,10,10]']);
    one('readdNoAck', [A + ' [8,8,8]', B + ' [10,10]']);
    one('readdDraft', [A + ' [8,8,8]', B + ' [10,10]']);
    one('readdWrist', [A + ' [8,8,8,6]', B + ' [10,10]']);
    one('swapBack', [A + ' [5,5,5]', B + ' [10,10,10]']);
    one('swapBackDraft', [A + ' [5,5,5]', B + ' [10,10]']);
    one('caseOnly', [a + ' [5,5,5]', B + ' [10,10]']);
    one('undoMore', [A + ' [8,8,9,9]', B + ' [10]']);
    one('undoWrist', [A + ' [8,8,9,10]']);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

// R42: the final week (12 of 12) began last Monday and round 2 is set for this Monday. On Sunday
// evening the phone pushed the week ahead (round 2's week 1 from Monday); the wrist trained Monday's
// Push from it at 07:00, heavier than planned, and the phone opens at 09:00 (the queue drains, then
// the swap). Then the same with the wrist's copy arriving only after the swap.
// tapped: no round is set on Sunday (the wrist trains round 1's parked week); the sheet painted that
// evening is tapped on Monday after the drain, so the round swaps in at the tap.
async function r42(late, tapped) {
  const app = await boot({ native: true, seed: { kt_sessions: '[]', kt_week: '12' } });
  try {
    await app.page.addInitScript(CLOCK); await app.page.evaluate(CLOCK);
    const pre = await app.page.evaluate(([late, tapped]) => {
      const mon = _mostRecentMonday(), last = addDays(mon, -7), old = addDays(last, -7);
      __setNow(addDays(mon, -1) + 'T20:00:00');
      const cr = getCustomRoutine();
      cr.weekPlan = ['Push', 'Rest', 'Pull', 'Rest', 'Legs', 'Rest', 'Rest']; cr.weeks.forEach(w => { delete w.weekPlan; });
      setCustomRoutine(cr);
      localStorage.setItem('kt_week_monday', last); localStorage.setItem('kt_final_since', last); lsSet('kt_week', 12); currentWeek = 12;
      lsSet('kt_sessions', [{ id: new Date(old + 'T18:00:00').getTime(), date: old, type: 'Push', label: 'Push', week: 11, prs: [], startedAt: new Date(old + 'T17:00:00').getTime(),
        exercises: [{ name: 'Bench Press', sets: 4, reps: [8, 8, 8, 8], weight: 185, weightLog: [185, 185, 185, 185] }] }]);
      if (!tapped) setNextRound('monday', mon);
      const plan = _watchPlanForDate(mon), bench = plan.exercises.find(e => e.name === 'Bench Press');
      const iso = ms => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const copy = JSON.stringify({ dayName: plan.dayName, slot: plan.slot, startedAt: iso(new Date(mon + 'T07:00:00').getTime()), loggedAt: iso(new Date(mon + 'T07:50:00').getTime()),
        exercises: [{ name: 'Bench Press', weight: bench.weight + 40, reps: [8, 8, 8, 8], weightLog: [1, 2, 3, 4].map(() => bench.weight + 40), rpe: 8, rpeLog: [8, 8, 8, 8] }] });
      sessionStorage.setItem('__pending', JSON.stringify(late ? [] : [copy])); sessionStorage.setItem('__late', late ? copy : '');
      sessionStorage.setItem('__tap', tapped ? mon : '');
      __setNow(mon + 'T09:00:00');
      return { week: plan.week, slot: plan.slot, bench: bench.weight };
    }, [late, !!tapped]);
    await app.page.addInitScript(() => { const p = sessionStorage.getItem('__pending'); if (p && window.__mock) window.__mock.pending = JSON.parse(p); });
    await coldBoot(app);
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      await wait(500);
      const lateCopy = sessionStorage.getItem('__late'), tapMon = sessionStorage.getItem('__tap');
      if (lateCopy) { window.__mock.pending = [lateCopy]; await drainWatchSessions(); await wait(50); }
      // Tapped after the boot drain (1 s); round 2's week-1 Bench with and without that session first.
      let built = null;
      if (tapMon) { await wait(1000); const b = u => _nextRoundBuild(getCustomRoutine(), u).routine.weeks[0].push.find(e => e.name === 'Bench Press').weight;
        built = { withIt: b(''), without: b(tapMon) }; window.showToast = () => {}; setNextRound('monday', tapMon); }
      const cr = getCustomRoutine(), rec = getSessions().find(s => s.wristStartedAt), card = rec && _shareCardModel(rec);
      return { cycle: cr.cycle, week: currentWeek, wk1: cr.weeks[0].bName, bench1: cr.weeks[0].push.find(e => e.name === 'Bench Press').weight, built,
        rec: rec && { week: rec.week, bName: rec.bName, bWk: rec.bWk }, card: card && { week: card.week, phase: card.phase },
        inRound: !!rec && _roundTest(cr)(rec.date, _cmpT(rec)), carry: rec ? _carryCandidates(rec).length : -1 };
    });
    return { pre, out, errors: app.errors };
  } finally { await app.close(); }
}
run('R42: a wrist session trained on a set round’s own days is that round’s week 1', async () => {
  for (const late of [false, true]) {
    const { pre, out, errors } = await r42(late), k = late ? 'drained after the swap' : 'drained before the swap';
    assert(pre.week === 1 && pre.slot === 'Push', 'the wrist was given round 2’s week 1 for the start Monday: ' + JSON.stringify(pre));
    assert(out.cycle === 2 && out.week === 1, k + ': round 2 started on its Monday: ' + JSON.stringify(out));
    assert(out.rec && out.rec.week === 1 && out.rec.bName === out.wk1 && out.rec.bWk === 1 && out.card.week === 1 && out.card.phase === out.wk1,
      k + ': the session is round 2’s week 1 with its block (not week 12, the deload): ' + JSON.stringify(out));
    assert(out.inRound && out.carry > 0, k + ': it counts for round 2 (above its plan, Carry forward offers it): ' + JSON.stringify(out));
    assert(out.bench1 === pre.bench, k + ': round 2 is the one the wrist was shown (the heavier session is not round 1’s best): ' + JSON.stringify([pre, out]));
    assert(errors.length === 0, 'no page errors: ' + errors.join(' | '));
  }
  // A round set on its Monday swaps in at the tap: the wrist had shown round 1's parked week, so a
  // session it logged that morning stays round 1's (week 12, its block) and is round 1's best.
  const { pre, out, errors } = await r42(false, true);
  assert(pre.week === 12, 'no round set yet: the wrist was given round 1’s parked week 12: ' + JSON.stringify(pre));
  assert(out.cycle === 2 && out.week === 1, 'tapped on Monday: round 2 started: ' + JSON.stringify(out));
  assert(out.rec && out.rec.week === 12 && out.rec.bWk === 12 && out.rec.bName !== out.wk1 && !out.inRound,
    'tapped on Monday: the wrist session trained before the tap is round 1’s week 12: ' + JSON.stringify(out));
  assert(out.built && out.built.withIt !== out.built.without && out.bench1 === out.built.withIt,
    'it is round 1’s best (round 2’s week 1 is re-based on it): ' + JSON.stringify([pre, out]));
  assert(errors.length === 0, 'no page errors: ' + errors.join(' | '));
});

// R43: the wrist's late copy of a session the phone filed adds a set to a lift whose working weight
// was changed since the finish (the keyless +5, a deload): the change stands. Still the finish's
// load, a heavier merged set moves it; a backdated session's heavier set can still raise it.
run('R43: a late wrist copy never undoes a working weight changed since the phone’s finish', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const W = Capacitor.Plugins.TrovoWatch; let pending = [];
      W.getPendingSessions = () => Promise.resolve({ sessions: pending.slice() });
      W.clearPendingSessions = (a) => { const d = (a && a.sessions) || []; pending = pending.filter(x => d.indexOf(x) < 0); return Promise.resolve({}); };
      window.showToast = () => {};
      const today = todayISO(), L = 'Bench Press', pushName = _dayLabel('Push');
      const iso = ms => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const at = (day, h) => new Date(day + 'T' + String(h).padStart(2, '0') + ':00:00').getTime();
      const nowish = Math.max(at(today, 0) + 60e3, Date.now() - 3600e3), d2 = addDays(today, -2);
      const wrist = (startMs, wl) => JSON.stringify({ dayName: pushName, slot: 'Push', startedAt: iso(startMs), loggedAt: iso(Math.min(Date.now(), startMs + 3600e3)),
        exercises: [{ name: L, weight: Math.max(...wl), reps: wl.map(() => 5), weightLog: wl, rpe: 8, rpeLog: wl.map(() => 8) }] });
      // The phone filed the session at `phoneW` (its finish set the working weight, or left a heavier one
      // for a backdated session); `since` changes it after; the wrist's copy then adds a set at `extra`.
      const go = async (date, start, phoneW, kt, since, extra) => {
        lsSet('kt_sessions', [{ id: start + 1800e3, date, type: 'Push', label: pushName, week: currentWeek, note: '', prs: [], startedAt: start,
          exercises: [{ name: L, sets: 3, reps: [5, 5, 5], weight: phoneW, weightLog: [phoneW, phoneW, phoneW] }] }]);
        lsSet('kt_weights', { [L]: kt }); if (since) _writeLoadLocal(L, since);
        pending = [wrist(start + 1000, [phoneW, phoneW, phoneW, extra])]; await drainWatchSessions(); await wait(30);
        const s = getSessions(); return { w: getWeights()[L], merged: s.length === 1 && s[0].exercises[0].reps.length === 4 };
      };
      return { plus5: await go(today, nowish, 185, 185, 190, 185), deload: await go(today, nowish, 185, 185, 166.5, 185),
        heavier: await go(today, nowish, 185, 185, 0, 195), backHeavier: await go(d2, at(d2, 9), 180, 185, 0, 190), backSame: await go(d2, at(d2, 9), 180, 185, 0, 180) };
    });
    assert(Object.keys(out).every(k => out[k].merged), 'each copy merged into the phone’s record: ' + JSON.stringify(out));
    assert(out.plus5.w === 190 && out.deload.w === 166.5, 'a +5 or a deload made since the finish stands (it was set back to 185): ' + JSON.stringify(out));
    assert(out.heavier.w === 195, 'still the finish’s load, the copy’s heavier set moves it: ' + JSON.stringify(out.heavier));
    assert(out.backHeavier.w === 190 && out.backSame.w === 185, 'a backdated session only raises it: ' + JSON.stringify([out.backHeavier, out.backSame]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

// R44: a started programme with nothing logged stays on its week when Monday comes (autoAdvanceWeek),
// so the widget, the wrist's week ahead and the reminders give next week's days this week's number
// and cadence, as the app will show them; once anything is logged, the weeks count on (L17).
run('R44: with nothing logged, next week’s days keep this week’s number and cadence', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]', kt_runs: '[]', kt_sports: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const cr = getCustomRoutine();
      cr.weekPlan = ['Push', 'Rest', 'Pull', 'Rest', 'Legs', 'Rest', 'Rest']; cr.weeks.forEach(w => { delete w.weekPlan; });
      cr.weeks[1].weekPlan = ['Legs', 'Rest', 'Push', 'Rest', 'Pull', 'Rest', 'Rest'];   // week 2 has its own cadence
      setCustomRoutine(cr);
      _setWeek(1);   // week 1 began this Monday
      const next = addDays(_mostRecentMonday(), 7);
      const look = () => ({ days: _nativeSummaryDays(15).filter(d => d.date >= next).map(d => (d.date < addDays(next, 7) ? 'b' : 'c') + d.week),
        mon: (() => { const p = _watchPlanForDate(next); return p.week + ':' + p.slot; })() });
      let sum = null; Capacitor.Plugins.TrovoWidget.updateSummary = (o) => { sum = JSON.parse(o.json); return Promise.resolve({}); };
      _lastNativeSummary = null; _runNativeSync();
      const none = Object.assign(look(), { sent: sum && sum.days.map(d => d.week) });
      lsSet('kt_runs', [{ id: Date.now(), date: todayISO(), distance: 5, time: '25:00', type: 'easy' }]);
      return { none, logged: look() };
    });
    assert(out.none.days.length >= 7 && out.none.days.every(s => s.slice(1) === '1') && out.none.mon === '1:Push' && out.none.sent.every(w => w === 1),
      'nothing logged: next week’s days are week 1 with week 1’s cadence (widget, wrist, reminders): ' + JSON.stringify(out.none));
    assert(out.logged.days.every(s => s === 'b2' || s === 'c3') && out.logged.mon === '2:Legs',
      'once something is logged the weeks count on: ' + JSON.stringify(out.logged));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
