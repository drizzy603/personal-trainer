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
//   (before the week clock moves) and every restore write them down as the old page read them,
//   and a misreading the pages since froze goes back (R38).
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

runInTurn('the update reads the days before week 1 as the old page did, after an old backup too, and repairs a misreading frozen since (R38)', async () => {
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
    assert(out.upgraded.sun === 0 && out.upgraded.days === '1001010', 'A\'s weeks read as week 1 (Mon/Wed/Fri), the frozen Sunday too: ' + JSON.stringify(out.upgraded));
    assert(out.restored.ok && out.restored.streak === 26, 'an old backup restored here reads the same: ' + JSON.stringify(out.restored));
    assert(out.edited === 26, 'a schedule edit after the update keeps it: ' + out.edited);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

runInTurn('the first boot writes the old page\'s reading down before anything else runs (R38)', async () => {
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
