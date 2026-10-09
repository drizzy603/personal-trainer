// Hunt 3, streak and week stats:
// - The days already lived keep the schedule they were lived under (kt_streak_days): a cadence
//   edit in Settings or by the coach, a new programme, archiving it and round 2's first Monday no
//   longer rewrite past days, so the streak survives them (M09, M10). The days between building
//   a programme and its first Monday never break the streak, and a log on one still counts.
// - The rest-day make-up counts the week's logs per lift: Push and Pull done on each other's
//   days leave nothing open (both were offered again, one after the other) (M48).
// - Progress shows one streak: with no programme its statband said 0 beside the hero's 4 (M49).
// - The week review (keyless sheet, banner, coach message) is about last calendar week against
//   that week's cadence: not a rolling 7 days against this week's ("DONE 7 of 6") (M50).
// - The shared week-wrap image carries the week the card is for: a Monday's poster said next
//   week's number over last week's stats (M51).
// - Parked on the final week, every parked week is the final week (weekForDate measures them
//   from kt_final_since): the streak no longer breaks on them, the Monday wrap says WEEK 12
//   with week 12's plan, and no date is ever past the last week, so a wrist session drained on
//   the round-swap morning is week 12, not "Week 13 of 12" (M01).
// - The streak chip asks the streak's own question: an empty lift day (BUILD YOUR ARMS DAY) is
//   not "TRAIN TODAY TO KEEP IT" (L33).
// - Progress THIS WEEK does not count an empty lift day as planned: 3 / 3, as Today says, not
//   3 / 4 for good (L34).
// Hunt 4 (regressions of the above):
// - Data from before 2026-10-04 has no kt_streak_days: the days before a first programme's week 1
//   read as week 1 there and as "no plan, every day due" since, so a streak that ran across a
//   programme switch made on that page dropped the moment it updated (26 -> 14). The first boot
//   (before the week clock moves) and every restore write down each such day the two pages read
//   differently as 2 (never ends the streak, a log counts), so no streak reads lower than either
//   page showed (writing the old page's rest day as 0 dropped the runs logged on it: 37 -> 23),
//   and a misreading the pages since froze goes back (R38). The same goes for the days before a
//   later round: round 2 swapped in on the old page read them as a previous round of exactly
//   twelve unparked weeks, so a round ended early or parked broke the streak (27 -> 3) (R39).
// - A whole programme replaced by another round (a Programme History restore, Restore Previous,
//   the next round started today) writes the lived days down under the outgoing round, before the
//   week clock moves: round 1's rest Fridays were frozen as missed days under round 2's clock
//   (79 -> 15), and "Start now" read the days before round 1 as a phantom earlier round (R58).
// - A schedule change writes down every day the streak can reach, not only the days it walks to
//   the first miss: that day filled in later (a log moved onto it, a late log) joined the streak
//   to days nobody had written down, read under the new schedule (11 -> 5) (R40).
// Hunt 5 (regressions of hunt 4):
// - The update's 2s go only inside the walk (old page's or this page's) that reaches further back:
//   a 2 on every day the two pages read differently ran the streak past days really missed where
//   the two broke on different days (11 as lived -> 38, and the boot awarded a 30-day milestone),
//   and the first boot's repair leaves a 1 past the old page's own break (T30).
// - The old page's reading takes week 1 as it was first written down: a schedule edit made on
//   20261004-1/5-1 rewrote week 1 under days the old page never read that way (26 -> 14) (T29).
// Clock-proof: each case pins the page clock to a weekday of a coming week, worked out from
// today, and builds its logs from there.
const { boot, assert, run, SEED } = require('../lib/harness');

// Functions read Date when they run, so swapping it in the page pins "now" for what follows.
const CLOCK = `(() => { if (window.__setNow) return; const R = Date; let off = 0;
  function F(...a) { if (!(this instanceof F)) return new R(R.now() + off).toString(); return a.length ? new R(...a) : new R(R.now() + off); }
  F.prototype = R.prototype; F.now = () => R.now() + off; F.parse = R.parse; F.UTC = R.UTC;
  window.Date = F; window.__setNow = (s) => { off = new R(s).getTime() - R.now(); _todayActMemo = null; }; })()`;
// Logs on the given days: [[date, type], …].
const LOGS = `(rows) => rows.map(([d, t], i) => ({ id: 1789000000000 + i, date: d, type: t, week: 0, prs: [],
  exercises: [{ name: 'Bench Press', sets: 3, reps: [8, 8, 8], weight: 150, weightLog: [150, 150, 150], rpe: 8 }] }))`;
const EMPTY = { kt_sessions: '[]', kt_runs: '[]', kt_sports: '[]', kt_skips: '[]' };
// One case at a time: eleven browsers at once is a lot for a CI runner.
let queue = Promise.resolve();
function runInTurn(name, fn) { queue = queue.then(() => new Promise(done => run(name, () => fn().finally(done)))); }
// The demo programme on a Mon/Wed/Fri cadence (every week reads the programme's own).
function mwf(sun) {
  const r = JSON.parse(SEED.kt_routine);
  r.weekPlan = ['Push', 'Rest', 'Pull', 'Rest', 'Legs', 'Rest', sun || 'Rest'];
  r.weeks.forEach(w => { delete w.weekPlan; });
  return r;
}

runInTurn('a cadence edit or a new programme applies from today on: the days already lived keep their schedule (M09, M10)', async () => {
  const app = await boot({ seed: Object.assign({}, EMPTY, { kt_routine: JSON.stringify(mwf()), kt_week: '6' }) });
  try {
    const out = await app.page.evaluate(([CLOCK, LOGS]) => {
      eval(CLOCK); const logs = eval(LOGS), r = {};
      // A Wednesday evening, three trained Mon/Wed/Fri weeks and this Monday behind it.
      const W = addDays(_mostRecentMonday(), 7), rows = [];
      __setNow(addDays(W, 2) + 'T18:00:00');
      currentWeek = 6; lsSet('kt_week', 6); localStorage.setItem('kt_week_monday', W);
      [21, 14, 7].forEach(b => { rows.push([addDays(W, -b), 'Push'], [addDays(W, -b + 2), 'Pull'], [addDays(W, -b + 4), 'Legs']); });
      rows.push([W, 'Push']);
      lsSet('kt_sessions', logs(rows));
      r.before = calcStreakDays();
      // Settings > Schedule: Friday's Legs moves to Saturday.
      setWeekPlanDay(4, 'Rest'); setWeekPlanDay(5, 'Legs');
      const due = _streakDueFn();
      r.moved = { streak: calcStreakDays(), thisWeek: getWeekPlanForWeek(6).map(p => p.type).join(','),
        friAhead: due(addDays(W, 4)), satAhead: due(addDays(W, 5)), lastFri: due(addDays(W, -3)), lastSat: due(addDays(W, -2)) };
      setWeekPlanDay(5, 'Rest'); setWeekPlanDay(4, 'Legs');
      r.reverted = calcStreakDays();
      r.ledger = Object.keys(lsGet('kt_streak_days') || {}).length;
      r.inBackup = BACKUP_KEYS.indexOf('kt_streak_days') >= 0 && !!buildBackupJSON().kt_streak_days;
      // Each writer below must write the lived days down itself: back to Mon/Wed/Fri, nothing written.
      const base = localStorage.getItem('kt_routine');
      const reset = () => { lsSet('kt_routine', JSON.parse(base)); lsSet('kt_streak_days', {}); return calcStreakDays(); };
      // The coach swaps Monday and Tuesday for the whole programme (written in place, then saved).
      r.coachSwap = { base: reset(), ok: executeCoachTool('swap_cadence_days', { dayA: 'Mon', dayB: 'Tue', scope: 'global' }).ok,
        streak: calcStreakDays(), monAhead: _streakDueFn()(addDays(W, 7)), tueAhead: _streakDueFn()(addDays(W, 8)) };
      // The coach rewrites the cadence a day later (update_routine_weeks with a weekPlan).
      const w6 = getCustomRoutine().weeks[5];
      r.coachPlan = { base: reset(), ok: executeCoachTool('update_routine_weeks', { weekPlan: ['Rest', 'Push', 'Rest', 'Pull', 'Rest', 'Legs', 'Rest'],
        weeks: [{ wk: 6, bName: w6.bName, bColor: w6.bColor || '#888888' }] }).ok, streak: calcStreakDays() };
      // A new programme (from next Monday) leaves the ten days as they were (it used to wipe them).
      const b3 = reset();
      applyStarterRoutine({ goal: 'muscle', days: 4, runs: 0, equip: 'full', exp: 1 });
      r.newProgramme = { base: b3, started: _programmeStarted(), streak: calcStreakDays() };
      return r;
    }, [CLOCK, LOGS]);
    assert(out.before === 10, 'ten trained days behind a Wednesday evening: ' + JSON.stringify(out));
    assert(out.moved.streak === 10, 'moving Friday to Saturday keeps the streak (past Fridays were trained, past Saturdays were rest): ' + JSON.stringify(out.moved));
    assert(out.moved.thisWeek === 'Push,Rest,Pull,Rest,Rest,Legs,Rest' && out.moved.friAhead === 0 && out.moved.satAhead === 1,
      'the new cadence holds from today on: ' + JSON.stringify(out.moved));
    assert(out.moved.lastFri === 1 && out.moved.lastSat === 0, 'last week reads as it was lived: ' + JSON.stringify(out.moved));
    assert(out.reverted === 10, 'reverting changes nothing either: ' + out.reverted);
    assert(out.ledger > 0 && out.inBackup, 'the lived days are written down and travel in backups: ' + JSON.stringify(out));
    assert(out.coachSwap.base === 10 && out.coachSwap.ok && out.coachSwap.streak === 10 && out.coachSwap.monAhead === 0 && out.coachSwap.tueAhead === 1,
      'the coach swapping Monday and Tuesday keeps the streak and holds from today on: ' + JSON.stringify(out.coachSwap));
    assert(out.coachPlan.base === 10 && out.coachPlan.ok && out.coachPlan.streak === 10, 'the coach moving every day keeps it: ' + JSON.stringify(out.coachPlan));
    assert(out.newProgramme.base === 10 && !out.newProgramme.started && out.newProgramme.streak === 10, 'a new programme keeps the streak: ' + JSON.stringify(out.newProgramme));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

runInTurn('the days before a new programme starts never break the streak; archiving keeps it (M10)', async () => {
  const app = await boot({ seed: Object.assign({}, EMPTY, { kt_routine: '', kt_week: '1' }) });
  try {
    const out = await app.page.evaluate(([CLOCK, LOGS]) => {
      eval(CLOCK); const logs = eval(LOGS), r = {};
      const chip = () => { const d = document.createElement('div'); d.innerHTML = _streakChip(); return d.textContent; };
      // No programme; Monday to Wednesday trained; the starter plan is built Wednesday evening.
      const W = addDays(_mostRecentMonday(), 7);
      __setNow(addDays(W, 2) + 'T18:00:00');
      lsSet('kt_sessions', logs([[W, 'Push'], [addDays(W, 1), 'Pull'], [addDays(W, 2), 'Legs']]));
      r.before = calcStreakDays();
      applyStarterRoutine({ goal: 'muscle', days: 3, runs: 0, equip: 'full', exp: 1 });
      const S = addDays(W, 7), p1 = getWeekPlanForWeek(1);
      r.built = { anchor: localStorage.getItem('kt_week_monday'), S, started: _programmeStarted(), streak: calcStreakDays(), mondayLift: !!p1[0].isLift };
      // Before the start nothing is due: a rest never breaks the streak, a session still counts.
      __setNow(addDays(W, 3) + 'T18:00:00');
      lsSet('kt_sessions', getSessions().concat(logs([[addDays(W, 3), 'Push']]).map(s => Object.assign(s, { id: s.id + 50 }))));
      r.thu = calcStreakDays();
      __setNow(addDays(W, 5) + 'T10:00:00');
      r.sat = { streak: calcStreakDays(), chip: chip() };
      __setNow(S + 'T10:00:00');
      r.startDay = { streak: calcStreakDays(), chip: chip() };
      // Week 1's Monday was a training day and went by unlogged: that one ends it.
      __setNow(addDays(S, 1) + 'T10:00:00');
      r.missed = calcStreakDays();
      // Archiving the programme (no programme now) keeps what was lived under it.
      __setNow(addDays(W, 5) + 'T10:00:00');
      clearCustomRoutine();
      r.archived = calcStreakDays();
      return r;
    }, [CLOCK, LOGS]);
    assert(out.before === 3, 'three calendar days with no programme: ' + JSON.stringify(out));
    assert(out.built.anchor === out.built.S && !out.built.started && out.built.streak === 3, 'building the plan keeps the streak: ' + JSON.stringify(out.built));
    assert(out.thu === 4, 'a session before the start counts: ' + out.thu);
    assert(out.sat.streak === 4 && !/KEEP IT/.test(out.sat.chip), 'resting before the start keeps it and nothing nags: ' + JSON.stringify(out.sat));
    assert(out.startDay.streak === 4 && (out.built.mondayLift ? /TRAIN TODAY TO KEEP IT/.test(out.startDay.chip) : true), 'day 1 is on the line, not yet lost: ' + JSON.stringify(out.startDay));
    assert(out.built.mondayLift ? out.missed === 0 : out.missed === 4, 'a missed week-1 training day ends it: ' + out.missed);
    assert(out.archived === 4, 'archiving keeps the days lived under the programme: ' + out.archived);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

runInTurn('round 2\'s first Monday reads the days before it as round 1\'s last week (M10)', async () => {
  const app = await boot({ seed: Object.assign({}, EMPTY, { kt_routine: JSON.stringify(mwf('Legs')), kt_week: '6' }) });
  try {
    const out = await app.page.evaluate(([CLOCK, LOGS]) => {
      eval(CLOCK); const logs = eval(LOGS), r = {};
      const W = addDays(_mostRecentMonday(), 7), rows = [];
      __setNow(addDays(W, 2) + 'T18:00:00');
      // Week 12 (the last) began on W, Sundays are rest there and Legs everywhere else.
      const cr = getCustomRoutine(); cr.weeks[11].weekPlan = ['Push', 'Rest', 'Pull', 'Rest', 'Legs', 'Rest', 'Rest']; setCustomRoutine(cr);
      currentWeek = 12; lsSet('kt_week', 12); localStorage.setItem('kt_week_monday', W); localStorage.setItem('kt_final_since', W);
      lsSet('kt_streak_days', {});
      rows.push([addDays(W, -7), 'Push'], [addDays(W, -5), 'Pull'], [addDays(W, -3), 'Legs'], [addDays(W, -1), 'Legs'], [W, 'Push'], [addDays(W, 2), 'Pull']);
      lsSet('kt_sessions', logs(rows));
      // Round 2 set for the Monday after; Friday's Legs done; Sunday evening.
      lsSet('kt_routine_next', { startsOn: addDays(W, 7), at: addDays(W, 2) });
      __setNow(addDays(W, 4) + 'T18:00:00');
      lsSet('kt_sessions', getSessions().concat(logs([[addDays(W, 4), 'Legs']]).map(s => Object.assign(s, { id: s.id + 50 }))));
      __setNow(addDays(W, 6) + 'T20:00:00');
      r.sunday = calcStreakDays();
      // The round swaps in on its morning.
      __setNow(addDays(W, 7) + 'T08:00:00');
      const nb = _applyNextRound(false);
      r.round2 = { swapped: !!nb, week: currentWeek, cycle: getCustomRoutine().cycle, streak: calcStreakDays() };
      // With nothing written down (a round started on an older page), round 1's weeks still answer.
      lsDel('kt_streak_days');
      r.unwritten = calcStreakDays();
      return r;
    }, [CLOCK, LOGS]);
    assert(out.sunday === 7, 'seven trained days by the final Sunday: ' + out.sunday);
    assert(out.round2.swapped && out.round2.week === 1 && out.round2.cycle === 2 && out.round2.streak === 7,
      'round 2\'s first Monday keeps the streak (Sunday was a rest day in week 12): ' + JSON.stringify(out.round2));
    assert(out.unwritten === 7, 'the days before week 1 are read as round 1\'s weeks: ' + out.unwritten);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

runInTurn('a lift done on another day this week is not offered as a make-up (M48)', async () => {
  const r0 = JSON.parse(SEED.kt_routine);
  r0.weekPlan = ['Push', 'Pull', 'Rest', 'Legs', 'Rest', 'Rest', 'Rest'];
  r0.weeks.forEach(w => { delete w.weekPlan; });
  const app = await boot({ seed: Object.assign({}, EMPTY, { kt_routine: JSON.stringify(r0), kt_week: '6' }) });
  try {
    const out = await app.page.evaluate(([CLOCK, LOGS]) => {
      eval(CLOCK); const logs = eval(LOGS), r = {};
      const screen = () => { switchTab('log'); logSubTab = 'workout'; render(); return document.getElementById('screen').innerText; };
      // Wednesday (a rest day): Monday's Push and Tuesday's Pull were done on each other's days.
      const W = addDays(_mostRecentMonday(), 7);
      __setNow(addDays(W, 2) + 'T10:00:00');
      currentWeek = 6; lsSet('kt_week', 6); localStorage.setItem('kt_week_monday', W);
      lsSet('kt_sessions', logs([[W, 'Pull'], [addDays(W, 1), 'Push']]));
      const t1 = screen();
      r.swapped = { missed: _missedThisWeek(), open: /still open/i.test(t1), makeUp: /MAKE-UP/.test(t1) };
      // Only Monday's Pull: Monday's Push is the one still open, and skipping it settles the week.
      lsSet('kt_sessions', logs([[W, 'Pull']]));
      r.one = _missedThisWeek();
      if (r.one) skipMissed(r.one.date, r.one.type);
      r.afterSkip = _missedThisWeek();
      // Two Push days, one done (on its own day): the other is the open one.
      const cr = getCustomRoutine(); cr.weekPlan = ['Push', 'Rest', 'Rest', 'Push', 'Rest', 'Rest', 'Rest']; setCustomRoutine(cr);
      lsSet('kt_skips', []);
      __setNow(addDays(W, 4) + 'T10:00:00');
      lsSet('kt_sessions', logs([[addDays(W, 3), 'Push']]));
      r.twoPush = _missedThisWeek();
      return r;
    }, [CLOCK, LOGS]);
    assert(out.swapped.missed === null && !out.swapped.open && !out.swapped.makeUp, 'swapped days leave nothing open: ' + JSON.stringify(out.swapped));
    assert(out.one && out.one.type === 'Push' && out.one.dow === 0, 'Monday\'s Push is still open: ' + JSON.stringify(out.one));
    assert(out.afterSkip === null, 'skipping it leaves nothing open (Pull was done on Monday): ' + JSON.stringify(out.afterSkip));
    assert(out.twoPush && out.twoPush.type === 'Push' && out.twoPush.dow === 0, 'the Push day not done is the open one: ' + JSON.stringify(out.twoPush));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

runInTurn('with no programme the Progress statband shows the same streak as the hero (M49)', async () => {
  const app = await boot({ seed: Object.assign({}, EMPTY, { kt_routine: '' }) });
  try {
    const out = await app.page.evaluate(([LOGS]) => {
      const logs = eval(LOGS);
      lsSet('kt_sessions', logs([0, 1, 2, 3].map(n => [addDays(todayISO(), -n), 'Push'])));
      switchTab('progress'); setProgressTab('lifts');
      const band = Array.from(document.querySelectorAll('#screen .kt-statband > div')).find(d => /Streak/i.test(d.textContent));
      return { routine: hasCustomRoutine(), streak: calcStreakDays(), band: band ? band.querySelector('.kt-statband-val').textContent : null };
    }, [LOGS]);
    assert(!out.routine && out.streak === 4 && out.band === '4days', 'four days in a row, on the hero and the statband alike: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

runInTurn('the week review is about last calendar week, against its own plan (M50)', async () => {
  // The demo cadence: Cycling, Run, Push, Pull, Rest, Cycling, Legs (six planned days).
  const app = await boot({ seed: Object.assign({}, EMPTY, { kt_week: '7', kt_apikey: '' }) });
  try {
    const out = await app.page.evaluate(([CLOCK, LOGS]) => {
      eval(CLOCK); const logs = eval(LOGS), r = {};
      localStorage.removeItem('kt_apikey');
      const sheet = () => { lsDel('kt_last_review_week'); openLocalWeekReview(); const el = document.getElementById('weekReviewOverlay'); const t = el ? el.innerText.replace(/\s+/g, ' ') : ''; closeLocalWeekReview(); lsDel('kt_last_review_week'); return t; };
      const banner = () => { lsSet('kt_last_weekwrap', _mostRecentMonday()); switchTab('log'); logSubTab = 'workout'; render(); const t = document.getElementById('screen').innerText.replace(/\s+/g, ' '); const i = t.indexOf('WRAPPED'); return i < 0 ? '' : t.slice(Math.max(0, i - 12), i + 7); };
      // Monday evening of week 7: week 6 done as planned, and today's ride logged.
      const W = addDays(_mostRecentMonday(), 7);
      __setNow(W + 'T19:00:00');
      currentWeek = 7; lsSet('kt_week', 7); localStorage.setItem('kt_week_monday', W);
      lsSet('kt_sessions', logs([[addDays(W, -5), 'Push'], [addDays(W, -4), 'Pull'], [addDays(W, -1), 'Legs']]));
      lsSet('kt_runs', [{ id: 1789000000200, date: addDays(W, -6), distance: 5, time: '30:00', type: 'easy', week: 6 }]);
      lsSet('kt_sports', [{ id: 1789000000300, date: addDays(W, -7), type: 'Cycling', duration: 40, week: 6 },
        { id: 1789000000301, date: addDays(W, -2), type: 'Cycling', duration: 40, week: 6 },
        { id: 1789000000302, date: W, type: 'Cycling', duration: 40, week: 7 }]);
      r.monday = { due: (lsDel('kt_last_review_week'), _weekReviewDue()), banner: banner(), sheet: sheet(), msg: _buildWeekReviewMsg() };
      // An empty lift day in week 6 is not a planned day.
      const cr = getCustomRoutine(); cr.weeks[5].weekPlan = ['Cycling', 'Run', 'Push', 'Pull', 'Arms', 'Cycling', 'Legs']; setCustomRoutine(cr);
      r.emptyDay = _lastWeekReview().planned;
      // Thursday after a week 6 with nothing in it: four lifts this week are not last week's.
      __setNow(addDays(W, 3) + 'T19:00:00');
      lsSet('kt_sessions', logs([[W, 'Push'], [addDays(W, 1), 'Pull'], [addDays(W, 2), 'Legs'], [addDays(W, 3), 'Push']]));
      lsSet('kt_runs', []); lsSet('kt_sports', []);
      lsDel('kt_last_review_week');
      r.thursday = { due: _weekReviewDue(), sheet: sheet() };
      return r;
    }, [CLOCK, LOGS]);
    assert(out.monday.due && /WEEK 6 WRAPPED/.test(out.monday.banner), 'Monday offers week 6\'s review: ' + JSON.stringify(out.monday));
    assert(/WEEK 6 WRAPPED/.test(out.monday.sheet) && /DONE 6 of 6 planned/.test(out.monday.sheet), 'week 6 done as planned, today\'s ride left out: ' + out.monday.sheet);
    assert(/week 6/.test(out.monday.msg) && /Done: 3 lifts \(.*\), 1 run, 2 sport sessions vs 6 planned activity days/.test(out.monday.msg), 'the coach is sent the same week: ' + out.monday.msg);
    assert(out.emptyDay === 6, 'an empty lift day is not planned: ' + out.emptyDay);
    assert(!out.thursday.due && /DONE 0 of 6 planned/.test(out.thursday.sheet), 'this week\'s lifts are not last week\'s: ' + JSON.stringify(out.thursday));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// The Today week-wrap card, then its shared image: header, card label and file name.
const WRAP = `async () => {
  const texts = [], orig = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { texts.push(String(t)); return orig.call(this, t, ...a); };
  let file = null; window._shareFile = (f) => { file = f.name; };
  switchTab('log'); logSubTab = 'workout'; render();
  const scr = document.getElementById('screen').innerText.replace(/\\s+/g, ' '), i = scr.indexOf('· WRAPPED');
  const due = _weekWrapDue();
  if (due) { _shareWeekCard(); await new Promise(res => setTimeout(res, 400)); }
  CanvasRenderingContext2D.prototype.fillText = orig;
  return { due, card: i < 0 ? '' : scr.slice(Math.max(0, i - 9), i + 9), png: texts.find(t => /WRAPPED/.test(t)) || '', file };
}`;

runInTurn('a Monday\'s shared week wrap carries last week\'s number, as the card does (M51)', async () => {
  const app = await boot({ seed: Object.assign({}, EMPTY, { kt_week: '7' }) });
  try {
    const out = await app.page.evaluate(async ([CLOCK, LOGS, WRAP]) => {
      eval(CLOCK); const logs = eval(LOGS);
      const W = addDays(_mostRecentMonday(), 7);
      __setNow(W + 'T08:00:00');
      currentWeek = 7; lsSet('kt_week', 7); localStorage.setItem('kt_week_monday', W);
      lsSet('kt_last_weekwrap', addDays(W, -14)); lsSet('kt_last_review_week', 7);
      lsSet('kt_sessions', logs([[addDays(W, -5), 'Push'], [addDays(W, -4), 'Pull']]));
      return Object.assign({ W }, await eval(WRAP)());
    }, [CLOCK, LOGS, WRAP]);
    assert(out.due && /WEEK 6 · WRAPPED/.test(out.card), 'Monday wraps week 6: ' + JSON.stringify(out));
    assert(/WEEK 6 · WRAPPED/.test(out.png) && out.file === 'fitness-programmer-week-' + addDaysNode(out.W, -7) + '-wrapped.png', 'the shared image says week 6 too: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
// addDays for a YYYY-MM-DD string, here in Node (calendar math only, no time zone involved).
function addDaysNode(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

// Weeks 1-11 train Tue/Thu/Sat/Sun; the final week has its own Mon/Wed/Fri.
function parkedRoutine() {
  const r = JSON.parse(SEED.kt_routine);
  r.weekPlan = ['Rest', 'Push', 'Rest', 'Pull', 'Rest', 'Legs', 'Push'];
  r.weeks.forEach(w => { delete w.weekPlan; });
  r.weeks[11].weekPlan = ['Push', 'Rest', 'Pull', 'Rest', 'Legs', 'Rest', 'Rest'];
  return r;
}

runInTurn('parked on the final week, every parked week is week 12: streak, Monday wrap, stamps (M01)', async () => {
  const app = await boot({ seed: Object.assign({}, EMPTY, { kt_routine: JSON.stringify(parkedRoutine()), kt_week: '12' }) });
  try {
    const out = await app.page.evaluate(async ([CLOCK, LOGS, WRAP]) => {
      eval(CLOCK); const logs = eval(LOGS), r = {};
      // The final week began on W and repeated twice; the anchor follows the calendar meanwhile.
      const W = addDays(_mostRecentMonday(), 7), rows = [];
      __setNow(addDays(W, 20) + 'T20:00:00');
      currentWeek = 12; lsSet('kt_week', 12); localStorage.setItem('kt_week_monday', addDays(W, 14)); localStorage.setItem('kt_final_since', W);
      lsSet('kt_streak_days', {});
      [0, 7, 14].forEach(b => { rows.push([addDays(W, b), 'Push'], [addDays(W, b + 2), 'Pull'], [addDays(W, b + 4), 'Legs']); });
      lsSet('kt_sessions', logs(rows));
      r.weeks = [weekForDate(addDays(W, -3)), weekForDate(W), weekForDate(addDays(W, 9)), weekForDate(addDays(W, 16)), weekForDate(addDays(W, 35))];
      r.streak = calcStreakDays();
      // The Monday after the first final week: its wrap is week 12's, at week 12's plan.
      __setNow(addDays(W, 7) + 'T08:00:00');
      localStorage.setItem('kt_week_monday', addDays(W, 7));
      lsSet('kt_sessions', logs([[addDays(W, 2), 'Pull'], [addDays(W, 4), 'Legs']]));
      lsSet('kt_last_weekwrap', addDays(W, -7)); lsSet('kt_last_review_week', 12);
      r.wrap = await eval(WRAP)();
      r.snap = _wwSnap && { weekNo: _wwSnap.weekNo, count: _wwSnap.count, planned: _wwSnap.planned };
      return r;
    }, [CLOCK, LOGS, WRAP]);
    assert(JSON.stringify(out.weeks) === '[11,12,12,12,12]', 'the week before is 11, every parked week (and the future) is 12: ' + JSON.stringify(out.weeks));
    assert(out.streak === 9, 'nine final-week days trained in a row: ' + out.streak);
    // (Today leads with PROGRAMME DONE there, so the wrap card may sit behind its WRAPPED chip.)
    assert(out.wrap.due && (!out.wrap.card || /WEEK 12 · WRAPPED/.test(out.wrap.card)) && /WEEK 12 · WRAPPED/.test(out.wrap.png), 'the Monday wrap is week 12\'s: ' + JSON.stringify(out.wrap));
    assert(out.snap && out.snap.weekNo === 12 && out.snap.count === 2 && out.snap.planned === 3, 'at week 12\'s plan (2 of 3, not 2 of 4): ' + JSON.stringify(out.snap));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

runInTurn('a wrist session drained on the round-swap morning is week 12, never 13 (M01)', async () => {
  const app = await boot({ native: true, seed: Object.assign({}, EMPTY, { kt_routine: JSON.stringify(parkedRoutine()), kt_week: '12' }) });
  try {
    const out = await app.page.evaluate(async ([CLOCK]) => {
      eval(CLOCK); const r = {};
      const W = addDays(_mostRecentMonday(), 7), S = addDays(W, 7);
      const wrist = (n) => JSON.stringify({ dayName: 'Push', slot: 'Push', startedAt: new Date(S + 'T0' + n + ':00:00').toISOString(), loggedAt: new Date(S + 'T0' + n + ':50:00').toISOString(),
        exercises: [{ name: 'Bench Press', reps: [8, 8, 8], weight: 150, weightLog: [150, 150, 150] }] });
      // Round 2 starts on S; the watch queue drains before the swap (the clock still on round 1).
      for (const stale of [0, 3]) {
        __setNow(S + 'T09:55:00');
        currentWeek = 12; lsSet('kt_week', 12); localStorage.setItem('kt_week_monday', addDays(W, -7 * stale)); localStorage.setItem('kt_final_since', addDays(W, -7 * stale));
        lsSet('kt_sessions', []);
        window.__mock.pending = [wrist(stale ? 7 : 8)];
        await drainWatchSessions();
        const s = getSessions()[0];
        r['away' + stale] = { date: s && s.date, week: s && s.week, today: weekForDate(S) };
      }
      return r;
    }, [CLOCK]);
    assert(out.away0.week === 12 && out.away0.today === 12, 'the swap morning\'s session is week 12: ' + JSON.stringify(out.away0));
    assert(out.away3.week === 12 && out.away3.today === 12, 'and after three weeks away, still 12 (it was 15): ' + JSON.stringify(out.away3));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

runInTurn('an empty lift day does not put the streak on the line (L33)', async () => {
  // Thursday is Arms, which this programme never wrote: an empty day.
  const r0 = JSON.parse(SEED.kt_routine);
  r0.weekPlan = ['Push', 'Pull', 'Legs', 'Arms', 'Rest', 'Rest', 'Rest'];
  r0.weeks.forEach(w => { delete w.weekPlan; delete w.arms; });
  const app = await boot({ seed: Object.assign({}, EMPTY, { kt_routine: JSON.stringify(r0), kt_week: '6' }) });
  try {
    const out = await app.page.evaluate(([CLOCK, LOGS]) => {
      eval(CLOCK); const logs = eval(LOGS), r = {};
      const chip = () => { const d = document.createElement('div'); d.innerHTML = _streakChip(); return d.textContent; };
      const W = addDays(_mostRecentMonday(), 7);
      currentWeek = 6; lsSet('kt_week', 6); localStorage.setItem('kt_week_monday', W);
      // Wednesday morning, Legs still to do: that one is on the line.
      __setNow(addDays(W, 2) + 'T10:00:00');
      lsSet('kt_sessions', logs([[W, 'Push'], [addDays(W, 1), 'Pull']]));
      r.legsDay = chip();
      // Thursday, the empty Arms day: nothing to do, nothing at risk; Friday the streak is whole.
      lsSet('kt_sessions', logs([[W, 'Push'], [addDays(W, 1), 'Pull'], [addDays(W, 2), 'Legs']]));
      __setNow(addDays(W, 3) + 'T10:00:00');
      r.armsDay = { empty: _liftDayEmpty('Arms', 6), chip: chip() };
      __setNow(addDays(W, 4) + 'T10:00:00');
      r.friday = calcStreakDays();
      return r;
    }, [CLOCK, LOGS]);
    assert(/2-DAY STREAK · TRAIN TODAY TO KEEP IT/.test(out.legsDay), 'a training day is on the line: ' + out.legsDay);
    assert(out.armsDay.empty && /3-DAY STREAK/.test(out.armsDay.chip) && !/KEEP IT/.test(out.armsDay.chip), 'the empty Arms day does not nag: ' + JSON.stringify(out.armsDay));
    assert(out.friday === 3, 'skipping it left the streak whole: ' + out.friday);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

runInTurn('Progress THIS WEEK leaves an empty lift day out of the planned days (L34)', async () => {
  const r0 = JSON.parse(SEED.kt_routine);
  r0.weekPlan = ['Push', 'Pull', 'Legs', 'Arms', 'Rest', 'Rest', 'Rest'];
  r0.weeks.forEach(w => { delete w.weekPlan; delete w.arms; });
  const app = await boot({ seed: Object.assign({}, EMPTY, { kt_routine: JSON.stringify(r0), kt_week: '6' }) });
  try {
    const out = await app.page.evaluate(([CLOCK, LOGS]) => {
      eval(CLOCK); const logs = eval(LOGS);
      const W = addDays(_mostRecentMonday(), 7);
      __setNow(addDays(W, 3) + 'T18:00:00');
      currentWeek = 6; lsSet('kt_week', 6); localStorage.setItem('kt_week_monday', W);
      lsSet('kt_sessions', logs([[W, 'Push'], [addDays(W, 1), 'Pull'], [addDays(W, 2), 'Legs']]));
      switchTab('progress'); setProgressTab('lifts');
      const m = document.getElementById('screen').innerText.replace(/\s+/g, ' ').match(/THIS WEEK \d+ \/ \d+ DAYS/);
      return { row: m ? m[0] : '', today: _weekStats().planned };
    }, [CLOCK, LOGS]);
    assert(/THIS WEEK 3 \/ 3 DAYS/.test(out.row) && out.today === 3, 'three of three, as Today counts: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// ── Hunt 4 ──
// A clock that survives a cold boot (as spec 108's): the storage the app left is snapshotted and
// put back before the page scripts run (the harness re-seeds on every load).
const BOOTCLOCK = () => {
  try {
    const snap = sessionStorage.getItem('__ls');
    if (snap) { const o = JSON.parse(snap); localStorage.clear(); Object.keys(o).forEach(k => localStorage.setItem(k, o[k])); sessionStorage.removeItem('__ls'); }
  } catch (e) {}
  if (window.__setNow) return;
  const R = Date; let off = 0;
  const t = sessionStorage.getItem('__now'); if (t) off = new R(t).getTime() - R.now();
  function F(...a) { if (!(this instanceof F)) return new R(R.now() + off).toString(); return a.length ? new R(...a) : new R(R.now() + off); }
  F.prototype = R.prototype; F.now = () => R.now() + off; F.parse = R.parse; F.UTC = R.UTC;
  window.Date = F;
  window.__setNow = (iso) => { off = new R(iso).getTime() - R.now(); sessionStorage.setItem('__now', iso); try { _todayActMemo = null; } catch (e) {} };
};
async function coldBoot(app) {
  await app.page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } sessionStorage.setItem('__ls', JSON.stringify(o)); });
  await app.page.reload({ waitUntil: 'load' });
  await app.page.waitForFunction(() => typeof window.render === 'function');
}
// What the pages from 20261004-1 froze on a schedule or week change: the days the streak walked,
// to the first miss, as they read then.
const OLDFREEZE = `() => { const due = _streakDueFn(), led = Object.assign({}, lsGet('kt_streak_days') || {}), d = new Date(todayISO() + 'T00:00:00');
  for (let i = 0; i < 400; i++) { const iso = _ymdLocal(d), lg = _loggedOn(iso), v = due(iso);
    if (i > 0 || (lg && v)) { if (led[iso] == null) led[iso] = v; if (v === 1 && !lg) break; } d.setDate(d.getDate() - 1); }
  lsSet('kt_streak_days', led); }`;
// A switch made on the old page: B (Mon/Wed/Fri) began on S and is on week 4; A (Mon/Wed/Fri too)
// ran the five weeks before and sits in Programme History. Every Mon/Wed/Fri is logged to S + 23.
const SWITCHED = `(S) => {
  currentWeek = 4; lsSet('kt_week', 4); localStorage.setItem('kt_week_monday', addDays(S, 21));
  lsSet('kt_routine_archive', [{ id: 1789400000000, archivedAt: addDays(S, -2), routine: getCustomRoutine() }]);
  const rows = []; for (let i = -35; i <= 23; i++) { const dw = ((i % 7) + 7) % 7; if (dw === 0 || dw === 2 || dw === 4) rows.push([addDays(S, i), ['Push', '', 'Pull', '', 'Legs'][dw]]); }
  return rows; }`;

runInTurn('the update keeps the streak the old page showed across a programme switch, after an old backup too, and repairs a misreading frozen since (R38)', async () => {
  const app = await boot({ seed: Object.assign({}, EMPTY, { kt_routine: JSON.stringify(mwf()), kt_week: '4' }) });
  try {
    const out = await app.page.evaluate(([CLOCK, LOGS, SWITCHED, OLDFREEZE]) => {
      eval(CLOCK); const logs = eval(LOGS), r = {};
      const S = addDays(_mostRecentMonday(), 7);
      __setNow(addDays(S, 23) + 'T18:00:00');
      lsSet('kt_sessions', logs(eval(SWITCHED)(S)));
      // As the old page left it: nothing written down. Read since as "no plan" before week 1.
      lsDel('kt_streak_days'); localStorage.removeItem('kt_streak_seeded');
      r.misread = calcStreakDays();
      // The pages since 20261004-1 froze that misreading on their first freeze: A's rest Sunday as missed.
      eval(OLDFREEZE)();
      r.frozen = { streak: calcStreakDays(), sun: lsGet('kt_streak_days')[addDays(S, -8)] };
      // The first boot of this page.
      _streakUpgrade();
      const due = _streakDueFn();
      r.upgraded = { streak: calcStreakDays(), flag: localStorage.getItem('kt_streak_seeded'), sun: lsGet('kt_streak_days')[addDays(S, -8)],
        days: [-7, -8, -9, -10, -11, -12, -13].map(n => due(addDays(S, n))).join('') };
      // An old backup of the same data (no kt_streak_days) restored here.
      const bk = buildBackupJSON(); delete bk.kt_streak_days;
      r.restored = { ok: _applyImportedData(JSON.parse(JSON.stringify(bk))), streak: calcStreakDays() };
      // And the first schedule edit after it keeps the streak.
      setWeekPlanDay(6, 'Run');
      r.edited = calcStreakDays();
      return r;
    }, [CLOCK, LOGS, SWITCHED, OLDFREEZE]);
    assert(out.misread === 14 && out.frozen.streak === 14 && out.frozen.sun === 1, 'the drop this guards against (14 of 26), frozen on a rest Sunday: ' + JSON.stringify(out));
    assert(out.upgraded.streak === 26 && out.upgraded.flag === '1', 'after the update the streak runs across the switch, as the old page showed: ' + JSON.stringify(out.upgraded));
    // Mon/Wed/Fri are due on both pages; the other days were rest on the old page and due since: 2,
    // never ending the streak (the frozen Sunday too).
    assert(out.upgraded.sun === 2 && out.upgraded.days === '1221212', 'A\'s weeks read by week 1\'s Mon/Wed/Fri, the frozen Sunday too: ' + JSON.stringify(out.upgraded));
    assert(out.restored.ok && out.restored.streak === 26, 'an old backup restored here reads the same: ' + JSON.stringify(out.restored));
    assert(out.edited === 26, 'a schedule edit after the update keeps it: ' + out.edited);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

runInTurn('the first boot writes the days before week 1 down before anything else runs (R38)', async () => {
  const app = await boot({ seed: Object.assign({}, EMPTY, { kt_routine: JSON.stringify(mwf()), kt_week: '4' }) });
  try {
    await app.page.addInitScript(BOOTCLOCK); await app.page.evaluate(BOOTCLOCK);
    const first = await app.page.evaluate(() => localStorage.getItem('kt_streak_seeded'));
    await app.page.evaluate(([LOGS, SWITCHED]) => {
      const logs = eval(LOGS), S = addDays(_mostRecentMonday(), 7);
      __setNow(addDays(S, 23) + 'T18:00:00');
      lsSet('kt_sessions', logs(eval(SWITCHED)(S)));
      lsDel('kt_streak_days'); localStorage.removeItem('kt_streak_seeded'); localStorage.removeItem('kt_last_open');
    }, [LOGS, SWITCHED]);
    await coldBoot(app);
    const out = await app.page.evaluate(() => ({ week: currentWeek, streak: calcStreakDays(), flag: localStorage.getItem('kt_streak_seeded') }));
    assert(first === '1', 'every boot of this page has run it once: ' + first);
    assert(out.week === 4 && out.streak === 26 && out.flag === '1', 'booted on the old data, the streak is the old page\'s: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R38: the old page's reading written as 0 (its rest days) left out the runs logged on them before
// week 1, which the pages since count: the update took a 37-day streak to 23.
runInTurn('the update never lowers a streak the pages since 2026-10-04 showed: logs on rest weekdays before week 1 still count (R38)', async () => {
  const app = await boot({ seed: Object.assign({}, EMPTY, { kt_routine: JSON.stringify(mwf()), kt_week: '3' }) });
  try {
    const out = await app.page.evaluate(([CLOCK, LOGS]) => {
      eval(CLOCK); const logs = eval(LOGS), r = {};
      // Mon/Wed/Fri from S; every day logged for the 30 days before it. Wednesday of week 3, not yet logged.
      const S = addDays(_mostRecentMonday(), 7), rows = [];
      __setNow(addDays(S, 16) + 'T18:00:00');
      currentWeek = 3; lsSet('kt_week', 3); localStorage.setItem('kt_week_monday', addDays(S, 14));
      for (let i = -30; i < 16; i++) { const dw = ((i % 7) + 7) % 7; if (i < 0 || dw === 0 || dw === 2 || dw === 4) rows.push([addDays(S, i), ['Push', 'Push', 'Pull', 'Push', 'Legs', 'Push', 'Push'][dw]]); }
      lsSet('kt_sessions', logs(rows));
      lsDel('kt_streak_days'); localStorage.removeItem('kt_streak_seeded');
      r.since = calcStreakDays();
      _streakUpgrade();
      const due = _streakDueFn();
      r.upgraded = { streak: calcStreakDays(), days: [-7, -8, -9, -10, -11, -12, -13].map(n => due(addDays(S, n))).join('') };
      const bk = buildBackupJSON(); delete bk.kt_streak_days;
      r.restored = { ok: _applyImportedData(JSON.parse(JSON.stringify(bk))), streak: calcStreakDays() };
      return r;
    }, [CLOCK, LOGS]);
    assert(out.since === 37, 'the pages since count every logged day before week 1: ' + JSON.stringify(out));
    assert(out.upgraded.streak === 37 && out.upgraded.days === '1221212', 'and so does this one, a rest weekday reading 2 (it was 23): ' + JSON.stringify(out.upgraded));
    assert(out.restored.ok && out.restored.streak === 37, 'an old backup restored here keeps it: ' + JSON.stringify(out.restored));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R58: a whole programme replaced by another round froze the streak under the new round on the old
// clock (the schedule signature left the round out, so only _setWeek froze, after the write).
runInTurn('a Programme History restore of another round, Restore Previous and a round started today keep the streak (R58)', async () => {
  // Friday is the cadence's rest day.
  const plan = ['Push', 'Pull', 'Legs', 'Push', 'Rest', 'Pull', 'Legs'];
  const app = await boot({ seed: Object.assign({}, EMPTY, { kt_routine: JSON.stringify(mwf()), kt_week: '6' }) });
  try {
    const out = await app.page.evaluate(([CLOCK, LOGS, plan]) => {
      eval(CLOCK); const logs = eval(LOGS), r = {};
      const confirm = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
      const every = (from, to) => { const rows = []; for (let d = from; d <= to; d = addDays(d, 1)) { const t = plan[(new Date(d + 'T00:00:00').getDay() + 6) % 7]; if (t !== 'Rest') rows.push([d, t]); } return rows; };
      const r1 = getCustomRoutine(); r1.weekPlan = plan.slice(); delete r1.cycle;
      // Round 2 began on S (swapped in by a page older than the ledger); round 1 ran the twelve
      // weeks before it and sits in Programme History. Every non-Friday is logged since round 1's
      // week 1; it is Monday of round 2's week 2.
      const S = addDays(_mostRecentMonday(), 7);
      __setNow(addDays(S, 7) + 'T10:00:00');
      lsSet('kt_routine', Object.assign(JSON.parse(JSON.stringify(r1)), { cycle: 2 }));
      lsSet('kt_routine_archive', [{ id: 1789400000000, archivedAt: S, routine: r1 }]);
      currentWeek = 2; lsSet('kt_week', 2); localStorage.setItem('kt_week_monday', addDays(S, 7)); localStorage.removeItem('kt_final_since');
      lsSet('kt_sessions', logs(every(addDays(S, -84), addDays(S, 7))));
      lsDel('kt_streak_days');
      const probe = () => ({ streak: calcStreakDays(), week: currentWeek, cycle: parseInt(getCustomRoutine().cycle, 10) || 1, fri: (lsGet('kt_streak_days') || {})[addDays(S, -10)] });
      r.before = probe();
      restoreArchivedRoutine(1789400000000); confirm();
      r.restored = probe();
      restoreRoutineBackup(); confirm();
      r.previous = probe();
      // Round 1 on its final week, a Wednesday: "Start now" swaps round 2 in on this week's Monday.
      // Logged since three weeks before round 1, which had no plan then.
      const T = addDays(_mostRecentMonday(), 7);
      __setNow(addDays(T, 2) + 'T10:00:00');
      lsSet('kt_routine', JSON.parse(JSON.stringify(r1))); lsSet('kt_routine_archive', []); lsDel('kt_routine_backup'); lsDel('kt_routine_next');
      currentWeek = 12; lsSet('kt_week', 12); localStorage.setItem('kt_week_monday', T); localStorage.setItem('kt_final_since', T);
      lsSet('kt_sessions', logs(every(addDays(T, -97), addDays(T, 2))));
      lsDel('kt_streak_days');
      r.final = calcStreakDays();
      r.today = { ok: setNextRound('today'), cycle: getCustomRoutine().cycle, week: currentWeek, streak: calcStreakDays() };
      return r;
    }, [CLOCK, LOGS, plan]);
    assert(out.before.streak === 79 && out.before.cycle === 2 && out.before.week === 2, 'round 2, every non-Friday since round 1 began: ' + JSON.stringify(out.before));
    assert(out.restored.streak === 79 && out.restored.cycle === 1 && out.restored.fri === 0,
      'restoring round 1 keeps it; its rest Friday is not frozen as a missed day (it was 15): ' + JSON.stringify(out.restored));
    assert(out.previous.streak === 79 && out.previous.cycle === 2, 'Restore Previous brings round 2 back with the same streak: ' + JSON.stringify(out.previous));
    assert(out.final === 77 && out.today.ok && out.today.cycle === 2 && out.today.week === 1 && out.today.streak === 77,
      'a round started today leaves the days before round 1 as they read (no phantom round): ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R39: round 2 swapped in on the old page (nothing written down) read the days before its week 1
// as a previous round of exactly twelve unparked weeks, ending the day before.
runInTurn('round 2 swapped in on the old page: a round ended early or parked keeps the streak the old page showed, never lower (R39)', async () => {
  const app = await boot({ seed: Object.assign({}, EMPTY, { kt_routine: JSON.stringify(mwf()), kt_week: '1' }) });
  try {
    const out = await app.page.evaluate(([CLOCK, LOGS, plans]) => {
      eval(CLOCK); const logs = eval(LOGS), r = {};
      const MWF = ['Push', 'Rest', 'Pull', 'Rest', 'Legs', 'Rest', 'Rest'], TTS = ['Rest', 'Push', 'Rest', 'Pull', 'Rest', 'Legs', 'Rest'];
      // Round 2's week 1 began on S, a Monday; it is that week's Sunday evening, every day trained as
      // lived: lived(i) is the cadence the day S + i was trained under, from round 1's week 1 (S + from).
      const S = addDays(_mostRecentMonday(), 7);
      const swapped = (r2, from, lived) => {
        __setNow(addDays(S, 6) + 'T20:00:00');
        lsSet('kt_routine', Object.assign(JSON.parse(JSON.stringify(r2)), { cycle: 2 }));
        currentWeek = 1; lsSet('kt_week', 1); localStorage.setItem('kt_week_monday', S); localStorage.removeItem('kt_final_since');
        const rows = [];
        for (let i = from; i <= 6; i++) { const t = lived(i)[(new Date(addDays(S, i) + 'T00:00:00').getDay() + 6) % 7]; if (t !== 'Rest') rows.push([addDays(S, i), t]); }
        lsSet('kt_sessions', logs(rows));
        lsDel('kt_streak_days'); localStorage.removeItem('kt_streak_seeded');
        const since = calcStreakDays();
        _streakUpgrade();
        const due = _streakDueFn(); let week = ''; for (let i = -7; i < 0; i++) week += due(addDays(S, i));
        return { since, now: calcStreakDays(), weekBefore: week };
      };
      // (a) Round 1 ended at week 8 (weeks 1-8 Mon/Wed/Fri, 9-12 Tue/Thu/Sat); round 2 started that Monday.
      const early = JSON.parse(plans.mwf); early.weeks.forEach((w, i) => { if (i >= 8) w.weekPlan = TTS.slice(); });
      r.early = swapped(early, -56, () => MWF);
      // (b) One cadence, week 12 parked three weeks: round 1 ran fourteen weeks.
      r.parked = swapped(JSON.parse(plans.mwf), -98, () => MWF);
      // (c) Weeks 1-11 Tue/Thu/Sat/Sun, week 12 Mon/Wed/Fri, parked three weeks.
      r.split = swapped(JSON.parse(plans.parked), -98, i => (i >= -21 && i < 0) ? MWF : ['Rest', 'Push', 'Rest', 'Pull', 'Rest', 'Legs', 'Push']);
      return r;
    }, [CLOCK, LOGS, { mwf: JSON.stringify(mwf()), parked: JSON.stringify(parkedRoutine()) }]);
    assert(out.early.since === 3 && out.early.now === 27 && out.early.weekBefore === '2222220',
      'round 1\'s week 8 read as week 12 ended it at once; now as the old page showed, 2 where the pages disagree: ' + JSON.stringify(out.early));
    assert(out.parked.since === 39 && out.parked.now === 45, 'a round longer than twelve weeks reads back to its start, as the old page showed: ' + JSON.stringify(out.parked));
    assert(out.split.since === 7 && out.split.now === 7, 'where this page read better than the old one (4), it still does: ' + JSON.stringify(out.split));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R40: a schedule edit wrote down only the days the streak walked, back to the first missed one.
runInTurn('a missed day filled in after a schedule edit joins the streak to the days lived before it, as they were lived (R40)', async () => {
  const app = await boot({ seed: Object.assign({}, EMPTY, { kt_routine: JSON.stringify(mwf()), kt_week: '6' }) });
  try {
    const out = await app.page.evaluate(([CLOCK, LOGS, base]) => {
      eval(CLOCK); const logs = eval(LOGS), r = {};
      // A Wednesday evening of week 6 (Mon/Wed/Fri): three trained weeks behind it, this Monday and
      // today logged, last Friday's Legs not on Friday (filed on Thursday by mistake, or not yet logged).
      const W = addDays(_mostRecentMonday(), 7);
      const setup = (thursday) => {
        __setNow(addDays(W, 2) + 'T18:00:00');
        lsSet('kt_routine', JSON.parse(base));
        currentWeek = 6; lsSet('kt_week', 6); localStorage.setItem('kt_week_monday', W);
        const rows = [];
        [21, 14, 7].forEach(b => { rows.push([addDays(W, -b), 'Push'], [addDays(W, -b + 2), 'Pull']); if (b > 7) rows.push([addDays(W, -b + 4), 'Legs']); });
        if (thursday) rows.push([addDays(W, -4), 'Legs']);
        rows.push([W, 'Push'], [addDays(W, 2), 'Pull']);
        lsSet('kt_sessions', logs(rows)); lsSet('kt_runs', []);
        lsSet('kt_streak_days', {});
        const before = calcStreakDays();
        // Settings > Schedule: Friday's Legs moves to Saturday.
        setWeekPlanDay(4, 'Rest'); setWeekPlanDay(5, 'Legs');
        return { before, edited: calcStreakDays() };
      };
      // The Thursday log moved to Friday from the calendar sheet.
      r.moved = setup(true);
      const legs = getSessions().find(s => s.date === addDays(W, -4));
      moveSession(legs.id, addDays(W, -3), addDays(W, -4));
      r.moved.filled = calcStreakDays();
      const due = _streakDueFn();
      r.moved.read = [due(addDays(W, -10)), due(addDays(W, -9))].join('');
      // A run on that Friday logged late (through the coach).
      r.backdated = setup(false);
      r.backdated.ok = executeCoachTool('log_run', { distance: 5, time: '30:00', date: addDays(W, -3) }).ok;
      r.backdated.filled = calcStreakDays();
      return r;
    }, [CLOCK, LOGS, JSON.stringify(mwf())]);
    assert(out.moved.before === 2 && out.moved.edited === 2, 'the missed Friday ends it, before and after the edit: ' + JSON.stringify(out.moved));
    assert(out.moved.filled === 11 && out.moved.read === '10', 'filled in, the streak runs back over Fridays trained and Saturdays rested (it was 5): ' + JSON.stringify(out.moved));
    assert(out.backdated.ok && out.backdated.filled === 11, 'a late log on that Friday joins it the same way: ' + JSON.stringify(out.backdated));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// ── Hunt 5 ──
// T30: round 1 trained Mon/Wed/Fri in weeks 1-8 and Tue/Thu/Sat in weeks 9-12, and week 10's Tuesday
// and Thursday were really missed. Round 2 (Mon/Wed/Fri) was swapped in on the old page, which wrote
// nothing down: it read every day before round 2 as round 2's week 1 (4 days), the pages since as
// round 1's own weeks (11). The update wrote 2 on every day the two read differently: 38, and the
// boot's milestone baseline awarded the 30-day streak.
const R39SPLIT = `(S, r1j) => {
  const r1 = JSON.parse(r1j), MWF = ['Push', 'Rest', 'Pull', 'Rest', 'Legs', 'Rest', 'Rest'], TTS = ['Rest', 'Push', 'Rest', 'Pull', 'Rest', 'Legs', 'Rest'];
  r1.weeks.forEach((w, i) => { if (i >= 8) w.weekPlan = TTS.slice(); });
  lsSet('kt_routine', Object.assign(JSON.parse(JSON.stringify(r1)), { cycle: 2 }));
  lsSet('kt_routine_archive', [{ id: 1789400000000, archivedAt: addDays(S, -2), routine: r1 }]);
  currentWeek = 2; lsSet('kt_week', 2); localStorage.setItem('kt_week_monday', addDays(S, 7)); localStorage.removeItem('kt_final_since');
  const rows = [];
  for (let i = -84; i <= 7; i++) {
    const wk = i < 0 ? Math.floor((i + 84) / 7) + 1 : 0, t = (wk >= 9 ? TTS : MWF)[(new Date(addDays(S, i) + 'T00:00:00').getDay() + 6) % 7];
    if (t !== 'Rest' && !(wk === 10 && t !== 'Legs')) rows.push([addDays(S, i), t]);
  }
  return rows; }`;
runInTurn('round 2 swapped in on the old page: the update keeps the streak as lived, never runs past a day really missed, and awards no milestone never reached (T30)', async () => {
  const app = await boot({ seed: Object.assign({}, EMPTY, { kt_routine: JSON.stringify(mwf()), kt_week: '1' }) });
  try {
    await app.page.addInitScript(BOOTCLOCK); await app.page.evaluate(BOOTCLOCK);
    // Wednesday morning of round 2's week 2; Monday logged. As the old page left it: nothing written down.
    const before = await app.page.evaluate(([LOGS, R39SPLIT, r1j]) => {
      const logs = eval(LOGS), S = addDays(_mostRecentMonday(), 7);
      __setNow(addDays(S, 9) + 'T07:30:00');
      lsSet('kt_sessions', logs(eval(R39SPLIT)(S, r1j)));
      lsDel('kt_streak_days'); localStorage.removeItem('kt_streak_seeded'); localStorage.removeItem('kt_last_open');
      lsSet('kt_milestones', { 'sess-10': 1, 'streak-7': 1, 'streak-14': 1 });
      return { S, since: calcStreakDays() };
    }, [LOGS, R39SPLIT, JSON.stringify(mwf())]);
    // The first boot of this page.
    await coldBoot(app);
    const out = await app.page.evaluate(([S, OLDFREEZE]) => {
      const ms = lsGet('kt_milestones') || {}, due = _streakDueFn(), r = {};
      r.boot = { streak: calcStreakDays(), flag: localStorage.getItem('kt_streak_seeded'), ms: Object.keys(ms).filter(k => /^streak-/.test(k)).sort().join(','),
        week10: [0, 1, 2, 3, 4, 5, 6].map(n => due(addDays(S, -21 + n))).join('') };
      // The pages since froze the walk to its first miss first (week 10's Thursday, written as 1):
      // the repair leaves it, past the old page's own break (round 1's last Friday).
      lsDel('kt_streak_days'); localStorage.removeItem('kt_streak_seeded');
      eval(OLDFREEZE)();
      r.frozen = { streak: calcStreakDays(), thu: lsGet('kt_streak_days')[addDays(S, -18)] };
      _streakUpgrade();
      r.repaired = { streak: calcStreakDays(), thu: lsGet('kt_streak_days')[addDays(S, -18)], tue: _streakDueFn()(addDays(S, -20)) };
      return r;
    }, [before.S, OLDFREEZE]);
    assert(before.since === 11, 'as lived: round 2\'s four days, round 1\'s weeks 12 and 11, week 10\'s Saturday: ' + JSON.stringify(before));
    assert(out.boot.streak === 11 && out.boot.flag === '1', 'the update keeps 11, not every day the pages read differently (it was 38): ' + JSON.stringify(out.boot));
    assert(out.boot.ms === 'streak-14,streak-7', 'no 30-day milestone was ever reached: ' + JSON.stringify(out.boot));
    assert(/^.1.1/.test(out.boot.week10), 'week 10\'s Tuesday and Thursday are still training days missed: ' + JSON.stringify(out.boot));
    assert(out.frozen.streak === 11 && out.frozen.thu === 1 && out.repaired.streak === 11 && out.repaired.thu === 1 && out.repaired.tue === 1,
      'a real miss frozen since is not repaired into a rest day (the streak ran on past both misses): ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// T29: on 20261004-1/5-1 a schedule edit froze the streak's walk (A's rest Sunday before the switch
// written as a missed day), then rewrote week 1. The first boot read the days before week 1 by the
// edited week 1, which the old page never ran with: the repair and the 2s stopped at the first of
// A's rest days the edit made a training day, and the streak stayed at 14.
runInTurn('a schedule edit made on the pages before this one does not reach back: the first boot keeps the streak the old page showed across a programme switch (T29)', async () => {
  const app = await boot({ seed: Object.assign({}, EMPTY, { kt_routine: JSON.stringify(mwf()), kt_week: '4' }) });
  try {
    const out = await app.page.evaluate(([CLOCK, LOGS, SWITCHED, OLDFREEZE]) => {
      eval(CLOCK); const logs = eval(LOGS), r = {};
      const S = addDays(_mostRecentMonday(), 7), base = localStorage.getItem('kt_routine');
      const edits = { satLegs: p => { p[4] = 'Rest'; p[5] = 'Legs'; }, sunRun: p => { p[6] = 'Run'; } };
      Object.keys(edits).forEach(k => {
        __setNow(addDays(S, 23) + 'T18:00:00');
        lsSet('kt_routine', JSON.parse(base));
        lsSet('kt_sessions', logs(eval(SWITCHED)(S)));
        lsDel('kt_streak_days'); localStorage.removeItem('kt_streak_seeded');
        // Settings > Schedule on 20261005-1: its freeze (to the first miss), then the new cadence.
        eval(OLDFREEZE)();
        const cr = getCustomRoutine(); edits[k](cr.weekPlan); lsSet('kt_routine', cr);
        const before = calcStreakDays();
        // The first boot of this page.
        _streakUpgrade();
        const due = _streakDueFn();
        r[k] = { before, streak: calcStreakDays(), wk1: getWeekPlanForWeek(1).map(p => p.isRest ? '-' : p.type[0]).join(''),
          days: [-7, -8, -9, -10, -11, -12, -13].map(n => due(addDays(S, n))).join('') };
      });
      return r;
    }, [CLOCK, LOGS, SWITCHED, OLDFREEZE]);
    assert(out.satLegs.before === 14 && out.satLegs.wk1 === 'P-P--L-', 'the drop, with Friday\'s Legs on Saturday from now on: ' + JSON.stringify(out.satLegs));
    assert(out.satLegs.streak === 26 && out.satLegs.days === '1221212', 'the first boot reads the days before week 1 as the old page did, not by the edit (it was 14): ' + JSON.stringify(out.satLegs));
    assert(out.sunRun.before === 14 && out.sunRun.wk1 === 'P-P-L-R' && out.sunRun.streak === 26 && out.sunRun.days === '1221212',
      'Sunday made a run day the same: A\'s rest Sunday frozen as missed is repaired (it was 14): ' + JSON.stringify(out.sunRun));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
