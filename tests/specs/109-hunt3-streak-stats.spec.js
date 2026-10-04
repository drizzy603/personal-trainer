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
// The demo programme on a Mon/Wed/Fri cadence (every week reads the programme's own).
function mwf(sun) {
  const r = JSON.parse(SEED.kt_routine);
  r.weekPlan = ['Push', 'Rest', 'Pull', 'Rest', 'Legs', 'Rest', sun || 'Rest'];
  r.weeks.forEach(w => { delete w.weekPlan; });
  return r;
}

run('a cadence edit or a new programme applies from today on: the days already lived keep their schedule (M09, M10)', async () => {
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
      // The coach swaps Monday and Tuesday for the whole programme (written in place, then saved).
      const res = executeCoachTool('swap_cadence_days', { dayA: 'Mon', dayB: 'Tue', scope: 'global' });
      r.coach = { ok: res && res.ok, streak: calcStreakDays(), monAhead: _streakDueFn()(addDays(W, 7)), tueAhead: _streakDueFn()(addDays(W, 8)) };
      r.ledger = Object.keys(lsGet('kt_streak_days') || {}).length;
      r.inBackup = BACKUP_KEYS.indexOf('kt_streak_days') >= 0 && !!buildBackupJSON().kt_streak_days;
      // A new programme (from next Monday) leaves the ten days as they were (it used to wipe them).
      applyStarterRoutine({ goal: 'muscle', days: 4, runs: 0, equip: 'full', exp: 1 });
      r.newProgramme = { started: _programmeStarted(), streak: calcStreakDays() };
      return r;
    }, [CLOCK, LOGS]);
    assert(out.before === 10, 'ten trained days behind a Wednesday evening: ' + JSON.stringify(out));
    assert(out.moved.streak === 10, 'moving Friday to Saturday keeps the streak (past Fridays were trained, past Saturdays were rest): ' + JSON.stringify(out.moved));
    assert(out.moved.thisWeek === 'Push,Rest,Pull,Rest,Rest,Legs,Rest' && out.moved.friAhead === 0 && out.moved.satAhead === 1,
      'the new cadence holds from today on: ' + JSON.stringify(out.moved));
    assert(out.moved.lastFri === 1 && out.moved.lastSat === 0, 'last week reads as it was lived: ' + JSON.stringify(out.moved));
    assert(out.reverted === 10, 'reverting changes nothing either: ' + out.reverted);
    assert(out.coach.ok && out.coach.streak === 10 && out.coach.monAhead === 0 && out.coach.tueAhead === 1,
      'the coach swapping Monday and Tuesday keeps the streak and holds from today on: ' + JSON.stringify(out.coach));
    assert(out.ledger > 0 && out.inBackup, 'the lived days are written down and travel in backups: ' + JSON.stringify(out));
    assert(!out.newProgramme.started && out.newProgramme.streak === 10, 'a new programme keeps the streak: ' + JSON.stringify(out.newProgramme));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('the days before a new programme starts never break the streak; archiving keeps it (M10)', async () => {
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

run('round 2\'s first Monday reads the days before it as round 1\'s last week (M10)', async () => {
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

run('a lift done on another day this week is not offered as a make-up (M48)', async () => {
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

run('with no programme the Progress statband shows the same streak as the hero (M49)', async () => {
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

run('the week review is about last calendar week, against its own plan (M50)', async () => {
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

run('a Monday\'s shared week wrap carries last week\'s number, as the card does (M51)', async () => {
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
