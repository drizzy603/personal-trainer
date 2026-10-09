// Hunt 5 fixes, the restore clock:
// - T07 (T42, T44, T10, T14, T18, T21, T27, T31, T33, T36 the same): Restore previous programme puts
//   a programme set aside whole back on the week it was on, counted from this Monday (hunt 4's
//   R16: the weeks spent on another programme are not counted). Every earlier date moved with it:
//   a stale wrist session or the coach's backfill from before the swap, filed after a restore made a
//   Monday or more later, landed one week early per week away and was stamped with that week's
//   block for good (WEEK 04 · BASE on a BUILD session; spec 113's R57 'previous' case held only for
//   a restore in the swap's own week, where base named no block). The weeks away are noted on the
//   programme put back (routine.away): weekForDate reads every date before the Monday after the week
//   it was set aside in on the clock it was trained on, and _roundStartISO is the Monday its week 1
//   really began, so such a log is filed in its own week with its own block, a calendar move lands
//   on the week it was trained, and the round keeps its first weeks. The note holds only on the
//   clock it was taken on: round trips add up, the weeks moving on keep it, the week stepper and the
//   next round read their own clock. A backup written by 20261006-1..20261009-1 (_clock with week,
//   monday, finalSince) restores the same way.
const { boot, assert, run: run1 } = require('../lib/harness');

// One browser at a time: each run starts when the one before it has finished.
let queue = Promise.resolve();
const run = (name, fn) => { queue = queue.then(() => new Promise(done => run1(name, () => fn().finally(done)))); };

// A wall clock the spec can move (local 'YYYY-MM-DDTHH:MM:SS', always computed in the page from
// the real today). Installed for later loads too; a cold boot keeps the storage the app left
// (the harness re-seeds on every load, so the storage is snapshotted and put back first).
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
async function withClock(app) { await app.page.addInitScript(CLOCK); await app.page.evaluate(CLOCK); }
async function coldBoot(app) {
  await app.page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } sessionStorage.setItem('__ls', JSON.stringify(o)); });
  await app.page.reload({ waitUntil: 'load' });
  await app.page.waitForFunction(() => typeof window.render === 'function');
}

// In-page helpers: confirm a sheet, set the programme aside whole (Start new, then the starter
// plan), Restore Previous, move the clock to a day (the app's own Monday roll), read a log.
const H = `
  var wait = ms => new Promise(res => setTimeout(res, ms));
  var ok = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
  var swapOut = async () => { startNewProgramme(); ok(); await wait(20); applyStarterRoutine({ goal: 'muscle', days: 3, runs: 0, equip: 'full', exp: 1 }); await wait(20); };
  var restorePrev = async () => { restoreRoutineBackup(); await wait(10); ok(); await wait(30); };
  var at = (d) => { __setNow(d + 'T10:00:00'); _lastSeenDay = todayISO(); autoAdvanceWeek(); };
  var filed = (s) => s ? [String(s.date).slice(0, 10), Number(s.week), s.bName || '', _shareCardModel(s).phase] : null;
  var wrist = (dayName, d, name, w) => window.__mock.pending.push(JSON.stringify({ dayName, loggedAt: d + 'T07:00:00', exercises: [{ name, reps: [5, 5, 5], weight: w }] }));
`;

// T07 and its ten duplicates: the same swap and Restore Previous on the same day (spec 113's case),
// a week later and two weeks later, each with a cold launch on the restore day.
run('T07: a log from before the swap, filed after Restore Previous a week or more later, reads the week and block it was trained in', async () => {
  const out = {};
  for (const G of [0, 1, 2]) {
    const app = await boot({ native: true });
    try {
      await withClock(app);
      const t = await app.page.evaluate(async (H) => {
        eval(H);
        // Wednesday of week 6 (BUILD; the seed's weeks 1-4 are BASE, 5-8 BUILD), which began on Monday
        const M = _mostRecentMonday(); at(addDays(M, 2)); _setWeek(6, M);
        const cr0 = getCustomRoutine(), days = { wk4: addDays(M, -13), wk5: addDays(M, -6), wk6: addDays(M, 1), coach5: addDays(M, -5) };
        const truth = {}; Object.keys(days).forEach(k => { const w = weekForDate(days[k]); truth[k] = [days[k], w, _weekBlock(cr0, w), _weekBlock(cr0, w)]; });
        const r = { M, days, truth, name: cr0.name, startBefore: _roundStartISO() };
        await swapOut();
        r.onB = getCustomRoutine().name !== cr0.name;
        return r;
      }, H);
      // G weeks later, on Wednesday, the app opens again and the owner taps Restore previous programme
      await app.page.evaluate(([M, G]) => __setNow(addDays(M, 7 * G + 2) + 'T10:00:00'), [t.M, G]);
      await coldBoot(app);
      const r = await app.page.evaluate(async ([H, t]) => {
        eval(H);
        await restorePrev();
        const r = { back: [getCustomRoutine().name === t.name, currentWeek, localStorage.getItem('kt_week_monday') === _mostRecentMonday()], startAfter: _roundStartISO() };
        // stale wrist sessions from weeks 4, 5 and 6 (the day before the swap) drain now
        wrist('Legs', t.days.wk4, 'Back Squat', 175); wrist('Legs', t.days.wk5, 'Back Squat', 185); wrist('Pull', t.days.wk6, 'Barbell Row', 135);
        await drainWatchSessions(); await wait(30);
        const w = (d) => getSessions().find(s => s.note === 'From Apple Watch' && s.date === d);
        r.filed = { wk4: filed(w(t.days.wk4)), wk5: filed(w(t.days.wk5)), wk6: filed(w(t.days.wk6)) };
        // the coach logs a session from week 5 the owner forgot
        r.coachOk = executeCoachTool('log_session', { type: 'Push', date: t.days.coach5, exercises: [{ name: 'Bench Press', sets: 3, reps: 8, weight: 150 }] }).ok;
        r.filed.coach5 = filed(getSessions().find(s => s.source === 'coach' && s.date === t.days.coach5));
        return r;
      }, [H, t]);
      out[G] = Object.assign(t, r, { errors: app.errors.join('|') });
    } finally { await app.close(); }
  }
  for (const G of [0, 1, 2]) {
    const o = out[G], k = 'restore ' + G + ' week(s) after the swap: ';
    assert(o.onB && o.back[0] && o.back[1] === 6 && o.back[2], k + 'the programme comes back on week 6, counted from this Monday (R16): ' + JSON.stringify(o.back));
    assert(JSON.stringify(o.truth.wk5.slice(1, 3)) === '[5,"BUILD"]' && JSON.stringify(o.truth.wk4.slice(1, 3)) === '[4,"BASE"]', k + 'seed: week 5 is BUILD, week 4 BASE: ' + JSON.stringify(o.truth));
    assert(o.coachOk, k + 'the coach logged it: ' + JSON.stringify(o));
    for (const d of ['wk4', 'wk5', 'wk6', 'coach5']) {
      assert(JSON.stringify(o.filed[d]) === JSON.stringify(o.truth[d]), k + d + ' is filed in the week it was trained, with that week\'s block: ' + JSON.stringify({ filed: o.filed[d], trained: o.truth[d] }));
    }
    assert(o.startAfter === o.startBefore, k + 'the round still began on the Monday of its week 1: ' + JSON.stringify([o.startBefore, o.startAfter]));
    assert(o.errors === '', k + 'no page errors: ' + o.errors);
  }
});

// T07 follow-through: the note holds on the clock it was taken on, so the weeks away add up over a
// second round trip, the weeks moving on (into the final week) keep every reading, a week stepped and
// stepped back reads as before, and the next round reads its own clock. A calendar move (T14, T44)
// lands on the week the day was trained, and a backup in the shape 20261006-1 wrote restores the same.
run('T07: the weeks away add up over round trips, hold as the weeks move on, and the next round reads its own clock', async () => {
  const out = {};
  const cases = {
    // set aside on week 6, back a week later; set aside again on week 7, back two weeks later
    trip: async () => {
      const M = _mostRecentMonday(); at(addDays(M, 2)); _setWeek(6, M);
      const start = _roundStartISO();
      await swapOut(); at(addDays(M, 9)); await restorePrev();
      at(addDays(M, 15));
      const r = { start, wk7: currentWeek };
      await restorePrev(); r.onB = !!getCustomRoutine() && currentWeek === 1;
      at(addDays(M, 30)); await restorePrev();
      r.back = [currentWeek, _roundStartISO()];
      r.read = [addDays(M, -6), addDays(M, 1), addDays(M, 8), addDays(M, 15), addDays(M, 29)].map(weekForDate);
      wrist('Legs', addDays(M, 1), 'Back Squat', 185); wrist('Pull', addDays(M, 15), 'Barbell Row', 135);
      await drainWatchSessions(); await wait(30);
      r.filed = [addDays(M, 1), addDays(M, 15)].map(d => filed(getSessions().find(s => s.note === 'From Apple Watch' && s.date === d)));
      return r;
    },
    // set aside on week 11, back a week later; the final week comes, a stepped week comes back, round 2
    onward: async () => {
      const M = _mostRecentMonday(); at(addDays(M, 2)); _setWeek(11, M);
      const start = _roundStartISO();
      await swapOut(); at(addDays(M, 9)); await restorePrev();
      const r = { start, back: currentWeek };
      adjustWeek(1); adjustWeek(-1); r.stepped = [currentWeek, weekForDate(addDays(M, -6)), _roundStartISO()];
      at(addDays(M, 16));
      const ri = _roundInfo();
      r.final = [currentWeek, ri && ri.since === addDays(M, 14), _roundStartISO()];
      r.read = [addDays(M, -6), addDays(M, 1), addDays(M, 8), addDays(M, 16)].map(weekForDate);
      setNextRound('today'); await wait(30);
      r.round2 = [parseInt(getCustomRoutine().cycle, 10), currentWeek, _roundStartISO() === _mostRecentMonday(), weekForDate(addDays(M, 1)), weekForDate(addDays(M, 8))];
      return r;
    },
    // a stamped week-5 log moved after the restore (a week later) to week 6, then to week 4
    move: async () => {
      const M = _mostRecentMonday(); at(addDays(M, 2)); _setWeek(6, M);
      const s = { id: 9100001, date: addDays(M, -6), week: weekForDate(addDays(M, -6)), type: 'Push', exercises: [{ name: 'Bench Press', reps: [8, 8, 8], weight: 150 }], prs: [] };
      _stampBlock(s); lsSet('kt_sessions', [s].concat(getSessions()));
      await swapOut(); at(addDays(M, 9)); await restorePrev();
      const r = { stamped: [s.week, s.bName] };
      const one = () => getSessions().find(x => x.id === 9100001);
      moveSession(9100001, addDays(M, 1), addDays(M, -6)); r.toWk6 = filed(one()).slice(1, 2).concat(_sessBlock(one()));
      moveSession(9100001, addDays(M, -13), addDays(M, 1)); r.toWk4 = filed(one()).slice(1, 2).concat(_sessBlock(one()));
      return r;
    },
    // the backup holds what 20261006-1..20261009-1 wrote with a programme set aside whole
    oldShape: async () => {
      const M = _mostRecentMonday(); at(addDays(M, 2)); _setWeek(6, M);
      await swapOut();
      const keys = Object.keys(lsGet('kt_routine_backup')._clock || {}).sort().join(',');
      at(addDays(M, 9)); await restorePrev();
      wrist('Legs', addDays(M, -6), 'Back Squat', 185);
      await drainWatchSessions(); await wait(30);
      return { keys, filed: filed(getSessions().find(s => s.note === 'From Apple Watch' && s.date === addDays(M, -6))) };
    },
  };
  for (const name of Object.keys(cases)) {
    const app = await boot({ native: true });
    try {
      await withClock(app);
      out[name] = await app.page.evaluate(new Function('return (async () => {' + H + 'return (' + cases[name].toString() + ')(); })()'));
      out[name].errors = app.errors.join('|');
    } finally { await app.close(); }
  }
  const { trip, onward, move, oldShape } = out;
  assert(JSON.stringify(trip.read) === '[5,6,6,7,7]', 'each day reads the week it was trained in, before, between and after both round trips: ' + JSON.stringify(trip.read));
  assert(JSON.stringify(trip.filed.map(f => f && f.slice(1, 3))) === '[[6,"BUILD"],[7,"BUILD"]]', 'stale wrist sessions from each stretch are filed in their own week and block: ' + JSON.stringify(trip.filed));
  assert(trip.wk7 === 7 && trip.onB && trip.back[0] === 7 && trip.back[1] === trip.start, 'back on week 7 a second time, the round still from its week 1: ' + JSON.stringify(trip));
  assert(onward.back === 11 && JSON.stringify(onward.stepped) === JSON.stringify([11, 10, onward.start]), 'a week stepped and stepped back reads as before: ' + JSON.stringify(onward));
  assert(onward.final[0] === 12 && onward.final[1] && onward.final[2] === onward.start, 'the final week comes on the restored clock, the round still from its week 1: ' + JSON.stringify(onward.final));
  assert(JSON.stringify(onward.read) === '[10,11,11,12]', 'on the final week every earlier day keeps its week: ' + JSON.stringify(onward.read));
  assert(JSON.stringify(onward.round2) === '[2,1,true,1,1]', 'round 2 reads its own clock: every day before it is before its week 1: ' + JSON.stringify(onward.round2));
  assert(JSON.stringify(move.stamped) === '[5,"BUILD"]', 'seed: the log is week 5, BUILD: ' + JSON.stringify(move.stamped));
  assert(JSON.stringify(move.toWk6) === '[6,"BUILD"]' && JSON.stringify(move.toWk4) === '[4,"BASE"]', 'a move lands on the week the day was trained, with its block: ' + JSON.stringify(move));
  assert(oldShape.keys === 'finalSince,monday,plateau,prog,week', 'the backup carries only what 20261006-1 wrote: ' + oldShape.keys);
  assert(JSON.stringify(oldShape.filed && oldShape.filed.slice(1, 3)) === '[5,"BUILD"]', 'and restores the same: ' + JSON.stringify(oldShape.filed));
  for (const k of Object.keys(out)) assert(out[k].errors === '', k + ': no page errors: ' + out[k].errors);
});
