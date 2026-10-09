// Hunt 3, rounds and the week clock:
// - M06 A round started "Today" is anchored on this week's Monday and a set round is swapped in
//   when the app first opens on its morning (after the watch drains), so the previous round's
//   sessions dated inside week 1 were offered as Carry forward against the new, lower start (one
//   tap undid the re-base) and counted in the following round's best. A round now records when
//   it began (routine.startedAt) and only logs that began after it are its own.
// - M07 From week 2 of a new round the plateau card judged the deliberate re-base by round 1's
//   peak ("stalled 21 days", a further 10% deload every week). A round is judged by its own logs.
// - M25 A set round first opened weeks after its start date (away, app closed) was anchored on
//   the old date, so the week clock landed on week 3-4 of a round nobody saw, with no round intro.
//   It now starts this week as "Today" does (days gone are not owed) and says ROUND 2 · WEEK 1.
// - M26 The welcome-back check measured from the last cold boot: a resident app used every day
//   offered "WELCOME BACK · 10 DAYS, Back to week 7" at the next relaunch, and one resumed after
//   weeks moved on with no offer. The last visit is stamped at launch, return and departure, and
//   a return runs the same check (a banner left up into another week names the week now).
// - L06 A round set on the programme's last week still fired on its date after the coach added
//   weeks 13-16 (or the week was stepped back), so those weeks were never trained. A round set
//   to follow the programme now starts the Monday after its final week as it stands (Today, the
//   sheet and the coach say the new date); one set mid-programme still ends it early.
// - L07 A lift first given a load after week 1 ("your load" before) was never re-based for the
//   next round and left off its sheet. It is re-based from the first week that has a load.
// - L08 A weighted Max/AMRAP row was re-based as a single (+20%) and the sheet said "× 1". It is
//   judged at the reps its best set was done for.
// - L23 The next-round sheet painted before midnight (or left on screen overnight) set the round
//   a week late when tapped after it. It starts on the Monday it showed (now, if that has come).
// - L20 A screen kept on across midnight never rolled the day: Monday showed last week's week and
//   loads and pushed the watch last week's plan. A minute clock rolls it as a return would.
// - L21 On the final week's Sunday "TOMORROW · …" read a week 13 that does not exist (the
//   routine-wide cadence). It reads the week Monday holds: the final week again, or week 1 of a
//   next round starting tomorrow.
// - L22 After "Start week 1 today" on a rest day, Today named a first session from the week
//   before the programme ("Push, is Monday" beside "TOMORROW · PULL"). The walk starts no earlier
//   than the programme and reads each day from its own week.
// - L56 The coach header's "DAY n" lost a day on the Saturday and Sunday of a week whose clocks
//   change on a Friday (Israel, Egypt): a 23-hour day was floored. It is rounded.
// Hunt 4 (regressions of the above):
// - R35 (R59) The minute clock (L20) swapped a round due on Monday in at midnight while a Sunday-night
//   workout was still on screen: round 2 was re-based without it and it was filed as round 2's
//   week 1. A due round waits for a workout under way (the runner, a draft that can be resumed,
//   LIVE ON WATCH) and is built with it once it is saved; discarded, it starts without it.
// - R36 The sheet painted on week 11's Sunday night ("Starting the next round ends it early") and
//   tapped after the night rolled into week 12 set a round to follow the programme: it started a
//   week after the Monday shown while the toast named that Monday. The sheet's own state decides,
//   and the toast names the day Today shows.
// - R37 After L22 the first session came from next week's cadence while the rest-day text found
//   its weekday in this week's plan ("Legs, is Friday" with Legs on Monday). Both read each day
//   from its own week.
// Hunt 5 (regressions of hunt 4's fixes):
// - T50 The R35 hold was checked once, before the watch-drain wait: START tapped during that wait
//   (a launch or a return on the round's Monday) opened round 1's last week, the swap landed under
//   it, and that workout was filed as round 2's week 1. The hold is checked again when the wait ends.
// - T24 A draft holding round 2 on its Monday was discarded by "Discard and start <day>" (or replaced
//   with nothing logged) without letting the round start: the new workout was built from round 1's
//   final week and filed into it. The round starts first, and the new workout is its week 1.
// - T26 LIVE ON WATCH held the round only through the banner's state: a cold launch decided before
//   the shell's live cache was read, a phone locked for half an hour had heard nothing, and Hide
//   cleared it. The wrist's workout is kept apart, read with the queue, and holds until its copy is
//   filed (at most 6 h from its start).
// - T25 While a draft held round 2 on its Monday, the phone sent the wrist round 1's parked week for
//   today; a wrist workout trained on it was then claimed as round 2's week 1 when the round swapped
//   in. Until the swap the wrist is sent the round's own day, as its week ahead (and the widget) said.
// - T46 "Start round 2 today" with a final-week draft waiting: the resumed workout was filed as round
//   2's week 1 BASE (and left out of round 2), since "today" anchors week 1 on this Monday and the
//   backstop compared dates. It compares the time the round came in with the time the workout began,
//   and the workout keeps its week and that week's block in the round it began in.
// - T49 A round held for a workout swapped in (on the phone, after the watch queue) under the COMPLETE
//   sheet, whose "Carry ... forward" was judged against round 1: the tap wrote round 1's carry into
//   round 2 as the owner's edit and took the swap's restore point. The offer is judged again at the tap.
// - T47 After R37, with nothing logged Today said "Your first session, Legs, is Monday" (and Sunday
//   "TOMORROW · LEGS") from next week's cadence, while Monday keeps week 1 (R44) and the app, the
//   widget and the watch gave Push. Later weeks are read as the app will show them (_planWeekFor).
const { boot, assert, run } = require('../lib/harness');

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

// Session builders used inside the page.
const LOGS = `
  var X = (name, reps, w) => ({ name, sets: reps.length, reps, weight: w, weightLog: reps.map(() => w) });
  var at = (d, hm) => new Date(d + 'T' + hm + ':00').getTime();
  var addSession = (s) => { const a = getSessions(); a.unshift(Object.assign({ label: s.type, prs: [], week: currentWeek }, s)); lsSet('kt_sessions', a); return a[0]; };
  var txt = () => document.getElementById('screen').textContent.replace(/\\s+/g, ' ');
  var chips = () => [...document.querySelectorAll('#screen .kt-util-chip .lbl')].map(e => e.textContent);
`;
// Leaving a resident app and coming back to it (the page keeps running in between).
const VIS = `
  var setVis = (state) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state }); document.dispatchEvent(new Event('visibilitychange')); };
  var leave = () => setVis('hidden');
  var back = () => setVis('visible');
`;

run('M06: the previous round\'s sessions inside week 1 are not this round\'s (carry, next best)', async () => {
  const app = await boot({ native: true });
  try {
    await withClock(app);
    const out = await app.page.evaluate(async (LOGS) => {
      eval(LOGS);
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, mon = _mostRecentMonday(), wed = addDays(mon, 2);
      __setNow(wed + 'T10:00:00');
      _setWeek(8);
      // Round 1: Monday on the phone, and this morning on the wrist (it drains later).
      const a = addSession({ id: at(mon, '18:00'), date: mon, type: 'Push', startedAt: at(mon, '17:00'), exercises: [X('Bench Press', [8, 8, 8, 8], 200)] });
      const b = addSession({ id: at(wed, '07:50'), date: wed, type: 'Push', note: 'From Apple Watch', wristStartedAt: new Date(at(wed, '07:00')).toISOString(), exercises: [X('Bench Press', [8, 8, 8, 8], 195)] });
      r.started = setNextRound('today');
      const cr = getCustomRoutine();
      r.round = [cr.cycle, currentWeek, localStorage.getItem('kt_week_monday') === mon];
      r.bench1 = cr.weeks[0].push.find(e => e.name === 'Bench Press').weight;
      r.carryA = _carryCandidates(a).length; r.carryB = _carryCandidates(b).length;
      switchTab('log'); switchLogSub('workout'); await wait(30);
      promoteTodayItem('carry'); await wait(30);
      r.noOffer = chips().indexOf('CARRY FORWARD') < 0 && !/YOU LIFTED MORE THAN THE PLAN/.test(txt());
      // This evening's session is this round's: above the plan it can carry.
      __setNow(wed + 'T18:40:00');
      const c = addSession({ id: Date.now(), date: wed, type: 'Push', startedAt: at(wed, '17:30'), exercises: [X('Bench Press', [8, 8, 8, 8], r.bench1 + 10)] });
      r.carryC = _carryCandidates(c).map(k => [k.from, k.to]);
      // The round after this one is built from this round's own logs.
      const nb = _nextRoundBuild(getCustomRoutine());
      r.best3 = Math.round(nb.rows.find(x => x.slot === 'push' && x.name === 'Bench Press').best * 10) / 10;
      return r;
    }, LOGS);
    assert(out.started && out.round[0] === 2 && out.round[1] === 1 && out.round[2], 'round 2 starts now, anchored on this Monday: ' + JSON.stringify(out.round));
    assert(out.bench1 === 180, 'round 1\'s Monday counts in round 2\'s re-base (200 x 8 -> 180): ' + out.bench1);
    assert(out.carryA === 0 && out.carryB === 0, 'a round-1 session from Monday or from this morning is not offered against round 2: ' + JSON.stringify([out.carryA, out.carryB]));
    assert(out.noOffer, 'Today offers no Carry forward for them');
    assert(JSON.stringify(out.carryC) === JSON.stringify([[180, 190]]), 'a session after the start is this round\'s and can carry: ' + JSON.stringify(out.carryC));
    assert(out.best3 === 190, 'round 3 is re-based on round 2\'s own best (190 x 8), not round 1\'s 200: ' + out.best3);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('M06: a start-morning wrist session drained before the swap is the old round\'s', async () => {
  const app = await boot({ native: true, seed: { kt_week: '12' } });
  try {
    await withClock(app);
    await app.page.evaluate(() => {
      const mon = _mostRecentMonday(), last = addDays(mon, -7);
      localStorage.setItem('kt_week_monday', last); localStorage.setItem('kt_final_since', last);
      lsSet('kt_routine_next', { startsOn: mon, at: addDays(last, 3) });
      // The watch still held round 1's last week: Bench 180 x 8 at 08:00 on the start Monday.
      window.__mock.pending = [JSON.stringify({ dayName: 'Push', slot: 'Push', startedAt: new Date(mon + 'T08:00:00').toISOString(), loggedAt: new Date(mon + 'T09:00:00').toISOString(),
        exercises: [{ name: 'Bench Press', reps: [8, 8, 8, 8], weight: 180, weightLog: [180, 180, 180, 180] }] })];
      sessionStorage.setItem('__pending', JSON.stringify(window.__mock.pending));
      __setNow(mon + 'T12:00:00');
    });
    // The harness refills the queue it was given (none) on load: put the wrist session back first.
    await app.page.addInitScript(() => { const p = sessionStorage.getItem('__pending'); if (p && window.__mock) window.__mock.pending = JSON.parse(p); });
    await coldBoot(app);
    const out = await app.page.evaluate(async (LOGS) => {
      eval(LOGS);
      await new Promise(res => setTimeout(res, 500));
      const cr = getCustomRoutine(), s = getSessions().find(x => x.note === 'From Apple Watch');
      switchTab('log'); switchLogSub('workout'); render();
      return { cycle: cr.cycle, week: currentWeek, bench1: cr.weeks[0].push.find(e => e.name === 'Bench Press').weight, drained: !!s,
        carry: s ? _carryCandidates(s).length : -1, offer: chips().indexOf('CARRY FORWARD') >= 0 };
    }, LOGS);
    assert(out.cycle === 2 && out.week === 1 && out.drained, 'the round starts on its Monday after the wrist session drains: ' + JSON.stringify(out));
    assert(out.bench1 === 162.5, 'the wrist session is in round 2\'s re-base (180 x 8 -> 162.5): ' + JSON.stringify(out));
    assert(out.carry === 0 && !out.offer, 'and is not offered as Carry forward against round 2: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('M07: a new round is not a plateau; a stall inside the round still is', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async (LOGS) => {
      eval(LOGS);
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, mon = _mostRecentMonday(), today = todayISO(), seeded = getSessions().slice();
      const asRound = (week, startMon) => { _setWeek(week); const cr = getCustomRoutine(); cr.cycle = 2; cr.startedAt = at(startMon, '06:00'); setCustomRoutine(cr); };
      const bench = (date, w) => addSession({ id: at(date, '18:00'), date, type: 'Push', startedAt: at(date, '17:00'), exercises: [X('Bench Press', [8, 8, 8, 8], w)] });
      const benchPl = () => _plateauLifts().filter(x => x.name === 'Bench Press').map(x => [x.days, x.e1rm]);
      // Week 2 of round 2: round 1 peaked at 172.5 x 8 three to six weeks ago, round 2 restarted at 155.
      [-25, -32, -39, -46].forEach(d => bench(addDays(today, d), 172.5));
      bench(addDays(mon, -7), 155); bench(addDays(mon, -5), 157.5);
      asRound(2, addDays(mon, -7));
      lsSet('kt_last_plateau_week', 0);
      r.week2 = benchPl();
      r.due = _plateauFixDue();
      switchTab('log'); switchLogSub('workout'); await wait(30);
      r.card = /PLATEAU/.test(txt()) || chips().some(c => /PLATEAU/.test(c));
      const before = JSON.stringify(getCustomRoutine().weeks.map(w => (w.push.find(e => e.name === 'Bench Press') || {}).weight));
      applyPlateauFixLocal();
      r.untouched = JSON.stringify(getCustomRoutine().weeks.map(w => (w.push.find(e => e.name === 'Bench Press') || {}).weight)) === before;
      r.prompt = /PLATEAUS[^\n]*Bench Press/.test(buildSystemPrompt());
      // Week 5 of round 2: its own best (170 x 8) four weeks ago, three sessions under it since;
      // round 1's 190 x 8 does not count.
      lsSet('kt_sessions', seeded);
      bench(addDays(today, -40), 190);
      bench(addDays(mon, -28), 170); bench(addDays(mon, -21), 160); bench(addDays(mon, -14), 160); bench(addDays(mon, -7), 160);
      asRound(5, addDays(mon, -28));
      r.week5 = benchPl();
      r.days5 = Math.floor((Date.now() - new Date(addDays(mon, -28) + 'T00:00:00')) / 86400000);
      return r;
    }, LOGS);
    assert(out.week2.length === 0 && !out.due && !out.card, 'week 2 of round 2 is not a plateau of round 1\'s peak: ' + JSON.stringify(out));
    assert(out.untouched, 'the keyless fix has nothing to deload');
    assert(!out.prompt, 'the coach is not told Bench Press stalled');
    assert(out.week5.length === 1 && out.week5[0][1] === 215.3 && out.week5[0][0] === out.days5, 'a stall inside the round is judged by the round\'s own best (170 x 8): ' + JSON.stringify(out.week5));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('M25: a set round first opened weeks after its start begins this week, with its intro', async () => {
  // This week's Wednesday (week 1 is this week, Monday and Tuesday not owed) and its Sunday
  // (week 1 starts tomorrow, as "Today" does on a Sunday); on the phone and on the web.
  for (const dow of [2, 6]) for (const native of [true, false]) {
    const app = await boot({ native, seed: { kt_week: '12' } });
    try {
      await withClock(app);
      await app.page.evaluate((dow) => {
        const mon = _mostRecentMonday();
        __setNow(addDays(mon, dow) + 'T10:00:00');
        localStorage.setItem('kt_week_monday', addDays(mon, -21)); localStorage.setItem('kt_final_since', addDays(mon, -21));
        lsSet('kt_routine_next', { startsOn: addDays(mon, -14), at: addDays(mon, -16) });
        lsSet('kt_last_open', Date.now() - 18 * 86400000);
        lsSet('kt_skips', []);
      }, dow);
      await coldBoot(app);
      const out = await app.page.evaluate(async (LOGS) => {
        eval(LOGS);
        await new Promise(res => setTimeout(res, 500));
        const mon = _mostRecentMonday(), sunday = ((new Date().getDay() + 6) % 7) === 6, cr = getCustomRoutine();
        const owed = [], p1 = getWeekPlanForWeek(1), start = localStorage.getItem('kt_week_monday');
        for (let i = 0; i < 7; i++) { const d = addDays(start, i); if (d >= todayISO()) break; if (p1[i] && !p1[i].isRest && p1[i].type) owed.push(d + ' ' + p1[i].type); }
        const skipped = getSkips().map(k => k.date + ' ' + k.type);
        switchTab('log'); switchLogSub('workout'); promoteTodayItem('roundintro');
        return { sunday, owed: owed.length, cycle: cr.cycle, week: currentWeek, anchorOk: localStorage.getItem('kt_week_monday') === (sunday ? addDays(mon, 7) : mon),
          intro: !!_roundIntroCard() && /ROUND 2 · WEEK 1/.test(txt()), lapse: lapsePending,
          notOwed: owed.every(o => skipped.indexOf(o) >= 0), skips: skipped.length };
      }, LOGS);
      const tag = (native ? 'native' : 'web') + (dow === 6 ? ', Sunday' : ', Wednesday');
      assert(out.sunday === (dow === 6), tag + ': the clock is on the right day: ' + JSON.stringify(out));
      assert(out.cycle === 2 && out.week === 1 && out.anchorOk, tag + ': round 2 starts at week 1 this week, not weeks in: ' + JSON.stringify(out));
      assert(out.intro && !out.lapse, tag + ': Today says ROUND 2 · WEEK 1: ' + JSON.stringify(out));
      assert(out.notOwed && out.skips === out.owed && (dow === 6 || out.owed > 0), tag + ': the days of week 1 already gone are not owed: ' + JSON.stringify(out));
      assert(app.errors.length === 0, tag + ': no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});

run('M26: the welcome-back check measures from the last visit, at launch and on a return', async () => {
  // A: back in the app every evening for ten days across a Monday (never relaunched), then
  // relaunched the next Monday morning: not away, nothing to rewind.
  let app = await boot({ native: true });
  try {
    await withClock(app);
    const M = await app.page.evaluate(() => {
      const mon = _mostRecentMonday();
      __setNow(addDays(mon, -11) + 'T14:00:00');
      lsSet('kt_week', 6); localStorage.setItem('kt_week_monday', addDays(mon, -14)); localStorage.removeItem('kt_last_open');
      return mon;
    });
    await coldBoot(app);   // launched on a Thursday in week 6
    const daily = await app.page.evaluate(async ({ LOGS, VIS, M }) => {
      eval(LOGS); eval(VIS);
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = { launch: currentWeek };
      leave();
      for (let i = 10; i >= 1; i--) {
        __setNow(addDays(M, -i) + 'T18:00:00'); back(); await wait(20);
        addSession({ id: Date.now(), date: todayISO(), type: 'Push', startedAt: Date.now() - 3600000, exercises: [X('Bench Press', [8, 8, 8, 8], 150)] });
        __setNow(addDays(M, -i) + 'T19:00:00'); leave();
        if (lapsePending) r.lapseOn = todayISO();
      }
      r.week = currentWeek;
      return r;
    }, { LOGS, VIS, M });
    await app.page.evaluate((M) => __setNow(M + 'T07:30:00'), M);
    await coldBoot(app);
    const cold = await app.page.evaluate((LOGS) => {
      eval(LOGS); switchTab('log'); switchLogSub('workout');
      return { week: currentWeek, lapse: lapsePending, banner: /WELCOME BACK/.test(txt()) };
    }, LOGS);
    assert(daily.launch === 6 && daily.week === 7 && !daily.lapseOn, 'daily returns follow the calendar with no offer: ' + JSON.stringify(daily));
    assert(cold.week === 8 && !cold.lapse && !cold.banner, 'the relaunch after daily use is not a welcome back: ' + JSON.stringify(cold));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }

  // B: a resident app come back to after 22 days offers the rewind, and the banner left up into
  // the next week names that week; C: the same absence over a relaunch still offers it.
  for (const resident of [true, false]) {
    app = await boot({ native: false });
    try {
      await withClock(app);
      const M = await app.page.evaluate(() => {
        const mon = _mostRecentMonday();
        __setNow(addDays(mon, -23) + 'T10:00:00');
        lsSet('kt_week', 6); localStorage.setItem('kt_week_monday', addDays(mon, -28)); localStorage.removeItem('kt_last_open');
        return mon;
      });
      await coldBoot(app);   // launched on a Saturday in week 6
      await app.page.evaluate(({ VIS, M, resident }) => { eval(VIS); leave(); __setNow(addDays(M, -1) + 'T12:00:00'); if (resident) back(); }, { VIS, M, resident });
      if (!resident) await coldBoot(app);
      const out = await app.page.evaluate(async ({ LOGS, VIS, M, resident }) => {
        eval(LOGS); eval(VIS);
        const wait = ms => new Promise(res => setTimeout(res, ms));
        await wait(30);
        switchTab('log'); switchLogSub('workout');
        const t = txt(), r = { week: currentWeek, lapse: Object.assign({}, lapsePending), banner: /WELCOME BACK · 22 DAYS/.test(t) && /Stay on 9/.test(t) && /Back to week 6/.test(t) };
        leave(); __setNow(M + 'T09:00:00'); back(); await wait(30);
        r.next = { week: currentWeek, lapse: Object.assign({}, lapsePending), stay: /Stay on 10/.test(txt()) };
        if (resident) { lapseRewind(); r.rewound = currentWeek; }
        else {   // a new round started with the banner up: nothing of the old round's to go back to
          setNextRound('today');
          r.round = { cycle: getCustomRoutine().cycle, week: currentWeek, lapse: lapsePending, banner: /WELCOME BACK/.test(txt()) };
        }
        return r;
      }, { LOGS, VIS, M, resident });
      const tag = resident ? 'resident' : 'relaunched';
      assert(out.week === 9 && JSON.stringify(out.lapse) === JSON.stringify({ from: 6, to: 9, days: 22 }) && out.banner, tag + ': back after 22 days offers week 6 again: ' + JSON.stringify(out));
      assert(out.next.week === 10 && out.next.lapse && out.next.lapse.from === 6 && out.next.lapse.to === 10 && out.next.stay, tag + ': the banner a week later names week 10: ' + JSON.stringify(out.next));
      if (resident) assert(out.rewound === 6, tag + ': Back to week 6 rewinds: ' + out.rewound);
      else assert(out.round.cycle === 2 && out.round.week === 1 && !out.round.lapse && !out.round.banner, tag + ': starting round 2 drops the offer: ' + JSON.stringify(out.round));
      assert(app.errors.length === 0, tag + ': no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});

run('L06: a round set to follow the programme moves when weeks are added or the week steps back', async () => {
  const app = await boot({ native: false });
  try {
    await withClock(app);
    const out = await app.page.evaluate(async (LOGS) => {
      eval(LOGS);
      const r = {}, mon = _mostRecentMonday();
      const start = (week) => {
        lsDel('kt_routine_next'); setCustomRoutine(Object.assign(getCustomRoutine(), { cycle: 1 }));
        __setNow(addDays(mon, 2) + 'T10:00:00'); _setWeek(week, mon);
      };
      // Week 12 of 12: round 2 set for the Monday after it, then the coach adds weeks 13-16.
      start(12);
      setNextRound('monday');
      r.stored = lsGet('kt_routine_next');
      const w12 = getCustomRoutine().weeks[11];
      r.tool = executeCoachTool('update_routine_weeks', { weeks: [13, 14, 15, 16].map(wk => Object.assign(JSON.parse(JSON.stringify(w12)), { wk })) }).ok;
      r.moved = (_nextRoundSet() || {}).startsOn;
      switchTab('log'); switchLogSub('workout'); render();
      r.card = txt().indexOf('Round 2 starts ' + _nrDay(addDays(mon, 35))) >= 0;
      r.prompt = buildSystemPrompt().indexOf('set the next round to start ' + addDays(mon, 35)) >= 0;
      openNextRound();
      r.sheet = /after them/.test(document.getElementById('nrSheet').textContent) && /Keep it for/.test(document.getElementById('nrGo').textContent);
      closeNextRound();
      // Cancel and Undo put back what was set, not the moved date.
      cancelNextRound(); r.cancelled = _nextRoundSet() === null;
      const undo = [...document.querySelectorAll('button')].find(b => /^Undo$/i.test(b.textContent.trim()));
      if (undo) undo.click();
      r.undone = JSON.stringify(lsGet('kt_routine_next')) === JSON.stringify(r.stored);
      // Its old Monday: week 13, still set. The Monday after week 16: round 2.
      __setNow(addDays(mon, 7) + 'T08:00:00'); autoAdvanceWeek();
      r.mon1 = [getCustomRoutine().cycle, currentWeek, (_nextRoundSet() || {}).startsOn];
      for (let k = 2; k <= 5; k++) { __setNow(addDays(mon, 7 * k) + 'T08:00:00'); autoAdvanceWeek(); }
      r.after16 = [getCustomRoutine().cycle, currentWeek, getCustomRoutine().weeks.length, getRoutineArchive()[0] && getRoutineArchive()[0].routine ? getRoutineArchive()[0].routine.weeks.length : -1, _nextRoundSet()];
      // Stepped back from week 12 to 11: week 12 is trained first.
      setCustomRoutine(Object.assign(getCustomRoutine(), { weeks: getCustomRoutine().weeks.slice(0, 12) }));
      start(12); setNextRound('monday'); adjustWeek(-1);
      r.stepped = [currentWeek, (_nextRoundSet() || {}).startsOn];
      // Set mid-programme (week 10): it ends the programme early on its date, as the sheet says.
      start(10); setNextRound('monday');
      r.early = [lsGet('kt_routine_next').afterEnd, (_nextRoundSet() || {}).startsOn];
      __setNow(addDays(mon, 7) + 'T08:00:00'); autoAdvanceWeek();
      r.earlyMon = [getCustomRoutine().cycle, currentWeek];
      r.d = { 7: addDays(mon, 7), 14: addDays(mon, 14), 35: addDays(mon, 35) };
      return r;
    }, LOGS);
    const D = (n) => out.d[n];
    assert(out.stored.startsOn === D(7) && out.stored.afterEnd === true && out.tool, 'set on the last week, for the Monday after it: ' + JSON.stringify(out.stored));
    assert(out.moved === D(35) && out.card && out.prompt && out.sheet, 'with weeks 13-16 added it starts after week 16, and Today, the coach and the sheet say so: ' + JSON.stringify(out));
    assert(out.cancelled && out.undone, 'cancel and undo keep what was set: ' + JSON.stringify(out));
    assert(JSON.stringify(out.mon1) === JSON.stringify([1, 13, D(35)]), 'its old Monday is week 13 of the same round: ' + JSON.stringify(out.mon1));
    assert(out.after16[0] === 2 && out.after16[1] === 1 && out.after16[2] === 16 && out.after16[4] === null, 'the Monday after week 16 starts round 2: ' + JSON.stringify(out.after16));
    assert(JSON.stringify(out.stepped) === JSON.stringify([11, D(14)]), 'stepped back to week 11, it starts after week 12: ' + JSON.stringify(out.stepped));
    assert(!out.early[0] && out.early[1] === D(7) && JSON.stringify(out.earlyMon) === JSON.stringify([2, 1]), 'set mid-programme, it keeps its date: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L07/L08: the next round re-bases a lift first loaded in a later week, and a Max row at the reps logged', async () => {
  const app = await boot({ native: false });
  try {
    await withClock(app);
    const out = await app.page.evaluate(async (LOGS) => {
      eval(LOGS);
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const mon = _mostRecentMonday();
      __setNow(addDays(mon, 2) + 'T10:00:00');
      const cr = getCustomRoutine();
      cr.weeks.forEach((w, i) => {
        // "your load" in weeks 1-2, then the owner's 30 lb climbing from week 3; a weighted Max row
        w.push.push({ name: 'Cable Fly', sets: 3, reps: 12, rpe: 8, weight: i < 2 ? 0 : 30 + 2.5 * Math.floor((i - 2) / 2) });
        w.push.push({ name: 'Weighted Dip', sets: 3, reps: 'Max', rpe: 8, weight: 25 });
      });
      setCustomRoutine(cr); _setWeek(12, mon);
      lsSet('kt_sessions', []);
      const sess = (date, dip) => addSession({ id: at(date, '18:00'), date, type: 'Push', startedAt: at(date, '17:00'), exercises: [X('Cable Fly', [12, 12, 12], 40), X('Weighted Dip', dip[0], dip[1])] });
      sess(addDays(mon, -14), [[12, 10, 9], 25]); sess(addDays(mon, -7), [[11, 10, 9], 25]);
      const row = (nb, n) => { const x = nb.rows.find(y => y.name === n); return x ? { from: x.from, to: x.to, reps: x.reps } : null; };
      const loads = (nb, n) => nb.routine.weeks.map(w => (w.push.find(e => e.name === n) || {}).weight);
      const sheet = async (n) => { openNextRound(); await wait(20); const t = document.getElementById('nrSheet').textContent.replace(/\s+/g, ' '); closeNextRound(); return (t.match(new RegExp(n + '.{0,64}')) || [''])[0]; };
      let nb = _nextRoundBuild(getCustomRoutine());
      const r = { fly: row(nb, 'Cable Fly'), flyLoads: loads(nb, 'Cable Fly'), dip: row(nb, 'Weighted Dip'), dipLoads: loads(nb, 'Weighted Dip') };
      r.sheetFly = await sheet('Cable Fly'); r.sheetDip = await sheet('Weighted Dip');
      // Heavier dips later in the round: re-based from those, at their reps.
      sess(addDays(mon, -3), [[8, 8, 7], 45]);
      nb = _nextRoundBuild(getCustomRoutine());
      r.dip2 = row(nb, 'Weighted Dip'); r.dip2Load = loads(nb, 'Weighted Dip')[0];
      r.sheetDip2 = await sheet('Weighted Dip');
      return r;
    }, LOGS);
    assert(out.fly && out.fly.from === 30 && out.fly.to === 35 && out.fly.reps === 12, 'a lift loaded from week 3 is re-based from there (40 x 12 -> 35): ' + JSON.stringify(out.fly));
    assert(out.flyLoads[0] === 0 && out.flyLoads[1] === 0 && out.flyLoads[2] === 35 && out.flyLoads[3] >= 35, 'weeks 1-2 stay "your load", week 3 on climbs from 35: ' + JSON.stringify(out.flyLoads));
    assert(/Cable Fly30 lb → 35 lb · you reached about 40 lb × 12/.test(out.sheetFly), 'and it is on the sheet: ' + out.sheetFly);
    assert(out.dip && out.dip.to === 25 && out.dip.reps === 11 && out.dipLoads.every(w => w === 25), 'a Max row done for 11-12 reps at +25 is not re-based as a single (+20%): ' + JSON.stringify([out.dip, out.dipLoads]));
    assert(/Weighted Dipstays at 25 lb · not past where it started yet/.test(out.sheetDip), 'the sheet says it stays: ' + out.sheetDip);
    assert(out.dip2 && out.dip2.from === 25 && out.dip2.to === 40 && out.dip2.reps === 8 && out.dip2Load === 40, 'heavier dips (45 x 8) re-base it at 8 reps: ' + JSON.stringify(out.dip2));
    assert(/Weighted Dip25 lb → 40 lb · you reached about 45 lb × 8/.test(out.sheetDip2), 'and the sheet names the reps logged: ' + out.sheetDip2);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L23: the round starts on the Monday the sheet showed, tapped after midnight or after a night on screen', async () => {
  const app = await boot({ native: true });
  try {
    await withClock(app);
    const out = await app.page.evaluate(async ({ LOGS, VIS }) => {
      eval(LOGS); eval(VIS);
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const mon = _mostRecentMonday(), next = addDays(mon, 7), r = { next };
      const tap = async (paintAt, tapAt, week, resume) => {
        lsDel('kt_routine_next'); setCustomRoutine(Object.assign(getCustomRoutine(), { cycle: 1 }));
        __setNow(paintAt); _setWeek(week, mon); _lastSeenDay = todayISO();
        openNextRound(); await wait(20);
        const shown = document.getElementById('nrGo').textContent;
        if (resume) { leave(); __setNow(tapAt); back(); await wait(30); } else __setNow(tapAt);
        document.getElementById('nrGo').click(); await wait(20);
        return { shown, set: lsGet('kt_routine_next'), toast: (document.getElementById('toast') || {}).textContent, cycle: getCustomRoutine().cycle, week: currentWeek, anchor: localStorage.getItem('kt_week_monday') };
      };
      // The final week's Sunday, 23:58: tapped a minute after midnight, and the next morning.
      r.midnight = await tap(addDays(mon, 6) + 'T23:58:30', next + 'T00:01:10', 12, false);
      r.overnight = await tap(addDays(mon, 6) + 'T22:00:00', next + 'T07:30:00', 12, true);
      // Mid-programme, a Tuesday night into Wednesday: still that Monday, not the one after.
      r.midweek = await tap(addDays(mon, 1) + 'T23:58:30', addDays(mon, 2) + 'T00:01:10', 8, false);
      r.day = _nrDay(next);
      return r;
    }, { LOGS, VIS });
    for (const k of ['midnight', 'overnight']) {
      const o = out[k];
      assert(o.shown === 'Start round 2 on ' + out.day, k + ': the sheet showed the Monday after the final week: ' + o.shown);
      assert(o.set === null && o.cycle === 2 && o.week === 1 && o.anchor === out.next && /Round 2 started/.test(o.toast), k + ': round 2 starts on that Monday, now: ' + JSON.stringify(o));
    }
    const m = out.midweek;
    assert(m.shown === 'Start round 2 on ' + out.day && m.set && m.set.startsOn === out.next && m.cycle === 1 && m.week === 8 && /starts/.test(m.toast), 'mid-week: set for the Monday it showed: ' + JSON.stringify(m));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L20: a screen left on across midnight rolls the day, the week and the watch within a minute', async () => {
  const app = await boot({ native: true });
  try {
    // The page's timers are recorded, so its minute clock can run without waiting a minute.
    await app.page.addInitScript(() => { const si = window.setInterval; window.__ticks = []; window.setInterval = function (fn, ms) { window.__ticks.push({ fn, ms }); return si.apply(this, arguments); }; });
    await withClock(app);
    const M = await app.page.evaluate(() => {
      const mon = _mostRecentMonday();
      __setNow(addDays(mon, -1) + 'T23:58:00');
      lsSet('kt_week', 6); localStorage.setItem('kt_week_monday', addDays(mon, -7));
      return mon;
    });
    await coldBoot(app);   // Sunday 23:58 of week 6, Today on screen
    const out = await app.page.evaluate(async ({ LOGS, M }) => {
      eval(LOGS);
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const watch = () => { const u = window.__mock.updateContext; const j = u.length ? JSON.parse(u[u.length - 1].json) : {}; return [j.date, j.week]; };
      switchTab('log'); switchLogSub('workout'); await wait(1000);
      const r = { before: [todayISO(), currentWeek, watch()] };
      __setNow(M + 'T00:00:30');   // midnight passes with the screen on: no visibilitychange
      const ticks = window.__ticks.filter(t => t.ms === 60000);
      r.ticks = ticks.length;
      ticks.forEach(t => t.fn());
      await wait(1000);   // the watch push is debounced
      r.after = [todayISO(), currentWeek, /MON · WK 07/.test(txt()), watch()];
      return r;
    }, { LOGS, M });
    assert(out.before[1] === 6 && out.before[2][1] === 6, 'Sunday night: week 6 on the phone and the wrist: ' + JSON.stringify(out.before));
    assert(out.ticks >= 1, 'a minute clock runs: ' + out.ticks);
    assert(out.after[0] === M && out.after[1] === 7 && out.after[2], 'after midnight Today is Monday of week 7: ' + JSON.stringify(out.after));
    assert(out.after[3][0] === M && out.after[3][1] === 7, 'and the watch is sent Monday of week 7: ' + JSON.stringify(out.after[3]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L21: the final week\'s Sunday names what Monday holds, not a week 13', async () => {
  const app = await boot({ native: false });
  try {
    await withClock(app);
    const out = await app.page.evaluate(async (LOGS) => {
      eval(LOGS);
      const r = {}, mon = _mostRecentMonday();
      const sunday = (round) => {
        lsDel('kt_routine_next');
        const cr = getCustomRoutine(); cr.cycle = 1;
        // Week 12 has its own cadence (Push on Monday), week 1 another (Legs); the routine-wide one says Cycling.
        cr.weeks[11].weekPlan = ['Push', 'Rest', 'Pull', 'Rest', 'Legs', 'Rest', 'Rest'];
        cr.weeks[0].weekPlan = ['Legs', 'Rest', 'Push', 'Rest', 'Pull', 'Rest', 'Rest'];
        setCustomRoutine(cr);
        __setNow(addDays(mon, 6) + 'T10:00:00'); _setWeek(12, mon);
        if (round) setNextRound('monday');
        switchTab('log'); switchLogSub('workout'); render();
        const shown = (txt().match(/TOMORROW · [A-Z]+/) || [''])[0];
        __setNow(addDays(mon, 7) + 'T08:00:00'); autoAdvanceWeek(); _todayActMemo = null;
        const a = getTodayActivity();
        return { shown, monday: [getCustomRoutine().cycle, currentWeek, a.dayName] };
      };
      r.repeat = sunday(false);
      r.round = sunday(true);
      return r;
    }, LOGS);
    assert(out.repeat.shown === 'TOMORROW · PUSH' && JSON.stringify(out.repeat.monday) === JSON.stringify([1, 12, 'Push']), 'week 12 repeats: tomorrow is its Monday: ' + JSON.stringify(out.repeat));
    assert(out.round.shown === 'TOMORROW · LEGS' && JSON.stringify(out.round.monday) === JSON.stringify([2, 1, 'Legs']), 'round 2 starts tomorrow: its week 1 Monday: ' + JSON.stringify(out.round));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L22: "Start week 1 today" on a rest day names the first session of the programme, not of the week before', async () => {
  const app = await boot({ native: false, seed: { kt_sessions: '[]', kt_prs: '{}', kt_runs: '[]' } });
  try {
    await withClock(app);
    const out = await app.page.evaluate(async (LOGS) => {
      eval(LOGS);
      const mon = _mostRecentMonday();
      __setNow(addDays(mon, 1) + 'T10:00:00');   // Tuesday, a rest day in the starter's Push / Pull / Legs week
      setCustomRoutine(buildStarterRoutine({ equip: 'full', days: 3, runs: 0, goal: 'muscle', exp: 0 })); _startProgramme();
      const r = { plan: getWeekPlanForWeek(1).map(p => p.type).join(',') };
      startProgrammeNow();
      switchTab('log'); switchLogSub('workout'); render();
      const t = txt();
      r.next = getNextSession();
      r.body = (t.match(/Your first session[^.]*\./) || [''])[0];
      r.cta = (t.match(/FIRST SESSION ?Start [A-Za-z]+ today/) || [''])[0];
      r.tomorrow = (t.match(/TOMORROW · [A-Z]+/) || [''])[0];
      return r;
    }, LOGS);
    assert(out.plan === 'Push,Rest,Pull,Rest,Legs,Rest,Rest', 'the starter week this test assumes: ' + out.plan);
    assert(out.next === 'Pull' && out.body === 'Your first session, Pull, is Wednesday.' && /Start Pull today/.test(out.cta) && /TOMORROW · PULL/.test(out.tomorrow), 'Monday was not owed: the first session is Wednesday\'s Pull: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L56: the coach header counts the days of a week whose clocks change on a Friday', async () => {
  const app = await boot({ native: false, seed: { kt_apikey: 'sk-ant-test' } });
  try {
    // Israel moves its clocks on a Friday, so the 23-hour day falls inside the programme week.
    const cdp = await app.page.context().newCDPSession(app.page);
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Jerusalem' });
    await withClock(app);
    const out = await app.page.evaluate(async () => {
      // The next spring-forward day, found from the clock itself (no year written down).
      let d = todayISO(), shift = null;
      for (let i = 0; i < 400 && !shift; i++) { const n = addDays(d, 1); if (new Date(n + 'T00:00:00') - new Date(d + 'T00:00:00') < 86400000) shift = d; d = n; }
      const dow = (s) => (new Date(s + 'T00:00:00').getDay() + 6) % 7;
      const mon = addDays(shift, -dow(shift)), r = { shift, shiftDow: dow(shift), days: [] };
      for (let k = dow(shift) + 1; k <= 6; k++) {
        const day = addDays(mon, k);
        __setNow(day + 'T10:00:00'); _setWeek(3, mon);
        switchTab('coach'); openCoachChat(); render();
        const m = document.querySelector('.coach-head-meta');
        r.days.push([day, k + 1, m && m.textContent]);
      }
      return r;
    });
    assert(out.shiftDow === 4, 'the clocks change on a Friday in this zone: ' + JSON.stringify(out));
    assert(out.days.length === 2 && out.days.every(([, n, meta]) => meta === 'WK 03 · DAY ' + n), 'that Saturday is DAY 6 and that Sunday DAY 7: ' + JSON.stringify(out.days));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// Round 1's final week (12 of 12) with round 2 set for Monday; two squat days at 230 x 6 behind it.
// The spec's clock sits on Sunday 23:20 (sessionStorage __mon is the Monday week 12 began).
async function finalWeekSunday(app) {
  await app.page.addInitScript(() => { const si = window.setInterval; window.__ticks = []; window.setInterval = function (fn, ms) { window.__ticks.push({ fn, ms }); return si.apply(this, arguments); }; });
  await withClock(app);
  await app.page.evaluate((LOGS) => {
    eval(LOGS);
    const mon = _mostRecentMonday();
    sessionStorage.setItem('__mon', mon);
    __setNow(addDays(mon, 6) + 'T23:20:00');
    localStorage.setItem('kt_week_monday', mon); localStorage.setItem('kt_final_since', mon);
    lsSet('kt_routine_next', { startsOn: addDays(mon, 7), at: addDays(mon, 3), afterEnd: true });
    lsSet('kt_sessions', []);
    [[-7, 11], [2, 12]].forEach(([d, week]) => addSession({ id: at(addDays(mon, d), '18:00'), date: addDays(mon, d), type: 'Legs', week, startedAt: at(addDays(mon, d), '17:00'), exercises: [X('Back Squat', [6, 6, 6, 6], 230)] }));
  }, LOGS);
  await coldBoot(app);
}
// What the round and the workout came to (the 260 x 5 squats are the workout under way).
const ROUND_STATE = `
  var roundState = () => {
    const mon = sessionStorage.getItem('__mon'), cr = getCustomRoutine();
    const s = getSessions().find(x => x.exercises.some(e => e.name === 'Back Squat' && e.weight === 260));
    return { cycle: cr.cycle || 1, week: currentWeek, anchored: localStorage.getItem('kt_week_monday') === addDays(mon, 7),
      sq1: (cr.weeks[0].legs.find(e => e.name === 'Back Squat') || {}).weight,
      saved: s ? { sunday: s.date === addDays(mon, 6), week: s.week, bName: s.bName || '' } : null };
  };
`;

run('R35: a round due at midnight waits for the workout under way and is built with it', async () => {
  // tick: the screen stays on (the minute clock); return: locked during a rest, unlocked at 00:02;
  // killed: the app closed with the draft on disk and launched at 00:10 (Resume on Today).
  for (const native of [false, true]) for (const mode of ['tick', 'return', 'killed']) {
    const app = await boot({ native, seed: { kt_week: '12' } });
    const tag = (native ? 'native' : 'web') + ', ' + mode;
    try {
      await finalWeekSunday(app);
      const bName = await app.page.evaluate(() => getCustomRoutine().weeks[11].bName);
      const during = await app.page.evaluate(async ({ LOGS, VIS, ROUND_STATE, mode }) => {
        eval(LOGS); eval(VIS); eval(ROUND_STATE);
        const wait = ms => new Promise(res => setTimeout(res, ms));
        const next = addDays(sessionStorage.getItem('__mon'), 7);
        switchTab('log'); switchLogSub('workout'); await wait(30);
        openDeckRunner('Legs'); await wait(20);
        runnerEngaged = true; runnerSetWeight(260);
        [5, 5, 5].forEach(rep => { runnerSetReps(rep); runnerCompleteSet(); runnerSkipRest(); runnerEngaged = true; });
        _flushRunnerDraft();
        if (mode === 'tick') { __setNow(next + 'T00:00:40'); window.__ticks.filter(t => t.ms === 60000).forEach(t => t.fn()); }
        if (mode === 'return') { leave(); __setNow(next + 'T00:02:00'); back(); }
        if (mode === 'killed') __setNow(next + 'T00:10:00');
        await wait(800);
        return Object.assign(roundState(), { open: runnerOpen });
      }, { LOGS, VIS, ROUND_STATE, mode });
      if (mode === 'killed') await coldBoot(app);
      const out = await app.page.evaluate(async ({ LOGS, ROUND_STATE, mode }) => {
        eval(LOGS); eval(ROUND_STATE);
        const wait = ms => new Promise(res => setTimeout(res, ms));
        const next = addDays(sessionStorage.getItem('__mon'), 7), r = {};
        if (mode === 'killed') {
          await wait(800);
          switchTab('log'); switchLogSub('workout'); await wait(30);
          r.boot = Object.assign(roundState(), { banner: /WORKOUT IN PROGRESS/.test(txt()) });
          resumeRunnerDraft(); await wait(20);
          window.__ticks.filter(t => t.ms === 60000).forEach(t => t.fn()); await wait(300);   // a minute on: still waiting
          r.resumed = Object.assign(roundState(), { open: runnerOpen });
        }
        __setNow(next + 'T00:25:00');
        runnerFinishSession(); await wait(900);
        r.after = roundState();
        return r;
      }, { LOGS, ROUND_STATE, mode });
      if (mode === 'killed') {
        assert(out.boot.cycle === 1 && out.boot.week === 12 && out.boot.banner, tag + ': launched after midnight with the workout waiting, round 1 stays: ' + JSON.stringify(out.boot));
        assert(out.resumed.cycle === 1 && out.resumed.open, tag + ': and stays while it is resumed: ' + JSON.stringify(out.resumed));
      } else {
        assert(during.cycle === 1 && during.week === 12 && during.open, tag + ': past midnight with the runner open, round 1 stays: ' + JSON.stringify(during));
      }
      const a = out.after;
      assert(a.saved && a.saved.sunday && a.saved.week === 12 && a.saved.bName === bName, tag + ': the workout is filed on Sunday as week 12 (' + bName + '): ' + JSON.stringify(a.saved));
      // 260 x 5 is an e1RM of 303.3, about 252.8 at 6 reps: 10% under it is 227.5 (230 x 6 alone gives 212.5).
      assert(a.cycle === 2 && a.week === 1 && a.anchored && a.sq1 === 227.5, tag + ': round 2 starts once it is saved, built with it: ' + JSON.stringify(a));
      assert(app.errors.length === 0, tag + ': no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});

run('R35: a workout discarded after midnight lets the round start; one LIVE ON WATCH holds it until its copy drains', async () => {
  let app = await boot({ native: false, seed: { kt_week: '12' } });
  try {
    await finalWeekSunday(app);
    const out = await app.page.evaluate(async ({ LOGS, ROUND_STATE }) => {
      eval(LOGS); eval(ROUND_STATE);
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const next = addDays(sessionStorage.getItem('__mon'), 7);
      switchTab('log'); switchLogSub('workout'); await wait(30);
      openDeckRunner('Legs'); await wait(20);
      runnerEngaged = true; runnerSetWeight(260); runnerSetReps(5); runnerCompleteSet(); runnerSkipRest();
      __setNow(next + 'T00:00:40'); window.__ticks.filter(t => t.ms === 60000).forEach(t => t.fn()); await wait(100);
      const r = { held: roundState() };
      discardDeckRunner(); await wait(300);
      r.after = roundState();
      return r;
    }, { LOGS, ROUND_STATE });
    assert(out.held.cycle === 1, 'held while the runner is open: ' + JSON.stringify(out.held));
    assert(out.after.cycle === 2 && out.after.week === 1 && out.after.anchored && out.after.sq1 === 212.5 && !out.after.saved, 'discarded: round 2 starts at once, without it: ' + JSON.stringify(out.after));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }

  // The phone left on a stand, the workout on the wrist from 23:20 to 00:20.
  app = await boot({ native: true, seed: { kt_week: '12' } });
  try {
    await finalWeekSunday(app);
    const out = await app.page.evaluate(async ({ LOGS, ROUND_STATE }) => {
      eval(LOGS); eval(ROUND_STATE);
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const tick = () => window.__ticks.filter(t => t.ms === 60000).forEach(t => t.fn());
      const mon = sessionStorage.getItem('__mon'), sun = addDays(mon, 6), next = addDays(mon, 7), start = at(sun, '23:20');
      const live = (reps, ended) => _onWatchLive(JSON.stringify({ dayName: 'Legs', slot: 'Legs', startedAt: start, reps: { 'Back Squat': reps }, ended }));
      switchTab('log'); switchLogSub('workout'); await wait(30);
      __setNow(sun + 'T23:50:00'); live([5, 5]);
      __setNow(next + 'T00:00:40'); tick(); await wait(300);
      const r = { held: roundState() };
      __setNow(next + 'T00:20:00');
      window.__mock.pending = [JSON.stringify({ dayName: 'Legs', slot: 'Legs', startedAt: new Date(start).toISOString(), loggedAt: new Date().toISOString(),
        exercises: [{ name: 'Back Squat', reps: [5, 5, 5], weight: 260, weightLog: [260, 260, 260] }] })];
      live([5, 5, 5], true); await wait(3500);
      r.drained = roundState();
      __setNow(next + 'T00:21:00'); tick(); await wait(900);
      r.after = roundState();
      return r;
    }, { LOGS, ROUND_STATE });
    assert(out.held.cycle === 1 && out.held.week === 12, 'LIVE ON WATCH at midnight: round 1 stays: ' + JSON.stringify(out.held));
    assert(out.drained.cycle === 1 && out.drained.saved && out.drained.saved.sunday && out.drained.saved.week === 12, 'the wrist\'s copy drains as Sunday\'s week 12: ' + JSON.stringify(out.drained));
    assert(out.after.cycle === 2 && out.after.week === 1 && out.after.sq1 === 227.5, 'the next minute round 2 starts, built with it: ' + JSON.stringify(out.after));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('R36: the sheet painted on week 11\'s Sunday starts the round on the Monday it showed, tapped after the roll into week 12', async () => {
  const app = await boot({ native: true });
  try {
    await app.page.addInitScript(() => { const si = window.setInterval; window.__ticks = []; window.setInterval = function (fn, ms) { window.__ticks.push({ fn, ms }); return si.apply(this, arguments); }; });
    await withClock(app);
    await coldBoot(app);   // the minute clock is recorded from the next load
    const out = await app.page.evaluate(async ({ LOGS, VIS }) => {
      eval(LOGS); eval(VIS);
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const mon = _mostRecentMonday(), next = addDays(mon, 7), r = { day: _nrDay(next), next };
      const tap = async (paintAt, roll) => {
        lsDel('kt_routine_next'); setCustomRoutine(Object.assign(getCustomRoutine(), { cycle: 1 })); localStorage.removeItem('kt_final_since');
        __setNow(paintAt); _setWeek(11, mon); _lastSeenDay = todayISO();
        openNextRound(); await wait(20);
        const o = { shown: document.getElementById('nrGo').textContent, early: /ends it early/.test(document.getElementById('nrSheet').textContent) };
        await roll();
        o.weekAtTap = currentWeek;
        document.getElementById('nrGo').click(); await wait(30);
        Object.assign(o, { toast: (document.getElementById('toast') || {}).textContent, set: lsGet('kt_routine_next'), cycle: getCustomRoutine().cycle, week: currentWeek, anchor: localStorage.getItem('kt_week_monday') });
        return o;
      };
      // Week 11's Sunday, 23:58: tapped after the minute clock rolled into week 12, and the next morning.
      r.tick = await tap(addDays(mon, 6) + 'T23:58:30', async () => { __setNow(next + 'T00:01:10'); window.__ticks.filter(t => t.ms === 60000).forEach(t => t.fn()); await wait(30); });
      r.overnight = await tap(addDays(mon, 6) + 'T22:00:00', async () => { leave(); __setNow(next + 'T07:30:00'); back(); await wait(30); });
      // Painted on the last week, then the coach adds weeks 13-16 before the tap: the round follows
      // them, and the toast says the day Today says.
      lsDel('kt_routine_next'); setCustomRoutine(Object.assign(getCustomRoutine(), { cycle: 1, weeks: getCustomRoutine().weeks.slice(0, 12) }));
      __setNow(addDays(mon, 2) + 'T10:00:00'); _setWeek(12, mon); _lastSeenDay = todayISO();
      openNextRound(); await wait(20);
      const w12 = getCustomRoutine().weeks[11];
      executeCoachTool('update_routine_weeks', { weeks: [13, 14, 15, 16].map(wk => Object.assign(JSON.parse(JSON.stringify(w12)), { wk })) });
      document.getElementById('nrGo').click(); await wait(30);
      switchTab('log'); switchLogSub('workout'); render();
      r.later = { toast: (document.getElementById('toast') || {}).textContent, starts: (_nextRoundSet() || {}).startsOn, card: (txt().match(/Round 2 starts [A-Za-z]+, [A-Za-z]+ \d+/) || [''])[0], d35: addDays(mon, 35), day35: _nrDay(addDays(mon, 35)) };
      return r;
    }, { LOGS, VIS });
    for (const k of ['tick', 'overnight']) {
      const o = out[k];
      assert(o.shown === 'Start round 2 on ' + out.day && o.early && o.weekAtTap === 12, k + ': the sheet said the round ends week 11\'s programme early, on ' + out.day + ': ' + JSON.stringify(o));
      assert(o.set === null && o.cycle === 2 && o.week === 1 && o.anchor === out.next && /Round 2 started/.test(o.toast), k + ': round 2 starts on that Monday, now: ' + JSON.stringify(o));
    }
    const l = out.later;
    assert(l.starts === l.d35 && l.toast === 'Round 2 starts ' + l.day35 && l.card === 'Round 2 starts ' + l.day35, 'the toast names the start Today shows (after weeks 13-16): ' + JSON.stringify(l));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('R37/T47: "Start week 1 today" on a Saturday names the first session on the day that holds it, as Monday will show it', async () => {
  // Nothing logged: Monday keeps week 1 (autoAdvanceWeek), so the first session is week 1's Monday
  // Push, as the widget and the watch say (T47). A run logged this week moves Monday to week 2, whose
  // cadence opens with Legs (R37: the text names the weekday that holds it).
  for (const ran of [false, true]) {
    const app = await boot({ native: false, seed: { kt_sessions: '[]', kt_prs: '{}', kt_runs: '[]' } });
    const tag = ran ? 'a run logged' : 'nothing logged';
    try {
      await withClock(app);
      const out = await app.page.evaluate(async ({ LOGS, ran }) => {
        eval(LOGS);
        const mon = _mostRecentMonday();
        __setNow(addDays(mon, 5) + 'T10:00:00');   // Saturday: week 1's lift days are gone
        const cr = buildStarterRoutine({ equip: 'full', days: 3, runs: 0, goal: 'muscle', exp: 0 });
        cr.weeks[1].weekPlan = ['Legs', 'Rest', 'Push', 'Rest', 'Pull', 'Rest', 'Rest'];   // week 2 opens with Legs
        setCustomRoutine(cr); _startProgramme();
        const r = { plan: getWeekPlanForWeek(1).map(p => p.type).join(',') };
        startProgrammeNow();
        if (ran) lsSet('kt_runs', [{ id: at(addDays(mon, 2), '07:00'), date: addDays(mon, 2), distance: 5, time: '25:00', type: 'easy', note: '' }]);
        switchTab('log'); switchLogSub('workout'); render();
        const t = txt(), next = addDays(mon, 7);
        r.next = getNextSession();
        r.body = (t.match(/Your first session[^.]*\./) || [''])[0];
        r.cta = (t.match(/FIRST SESSION ?Start [A-Za-z]+ today/) || [''])[0];
        r.widget = (_nativeSummaryDays() || []).filter(d => d.date === next).map(d => d.type + ' ' + d.week)[0];
        r.watch = (p => p.dayName + ' ' + p.week)(_watchPlanForDate(next));
        __setNow(addDays(mon, 6) + 'T10:00:00'); render();   // Sunday
        r.tomorrow = [...document.querySelectorAll('#screen .kt-marquee-reps')].map(e => e.textContent.trim()).find(s => /^TOMORROW/.test(s));
        __setNow(next + 'T08:00:00'); autoAdvanceWeek(); _todayActMemo = null;
        r.monday = getTodayActivity().dayName + ' ' + currentWeek;
        return r;
      }, { LOGS, ran });
      const day = ran ? 'Legs' : 'Push', wk = ran ? 2 : 1;
      assert(out.plan === 'Push,Rest,Pull,Rest,Legs,Rest,Rest', tag + ': the starter week this test assumes: ' + out.plan);
      assert(out.next === day && out.body === 'Your first session, ' + day + ', is Monday.' && new RegExp('Start ' + day + ' today').test(out.cta), tag + ': the first session is Monday\'s ' + day + ': ' + JSON.stringify(out));
      assert(out.tomorrow === 'TOMORROW · ' + day.toUpperCase(), tag + ': Sunday says so too: ' + JSON.stringify(out));
      assert(out.monday === day + ' ' + wk && out.widget === day + ' ' + wk && out.watch === day + ' ' + wk, tag + ': as Monday, the widget and the watch: ' + JSON.stringify(out));
      assert(app.errors.length === 0, tag + ': no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});

// The 260 x 5 squat workout as it was filed, wherever it landed.
const FILED = `
  var filed = () => {
    const s = getSessions().find(x => x.exercises.some(e => e.name === 'Back Squat' && e.weight === 260));
    return s ? { date: s.date, week: s.week, bName: s.bName || '', inRound: _roundTest(getCustomRoutine())(s.date, _cmpT(s)) } : null;
  };
`;

run('T50: a workout opened during the round\'s drain wait holds the round, and is filed in the week it was built from', async () => {
  const app = await boot({ native: true, seed: { kt_week: '12' } });
  try {
    await finalWeekSunday(app);
    const bName = await app.page.evaluate(() => getCustomRoutine().weeks[11].bName);
    const out = await app.page.evaluate(async ({ LOGS, ROUND_STATE, FILED }) => {
      eval(LOGS); eval(ROUND_STATE); eval(FILED);
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const next = addDays(sessionStorage.getItem('__mon'), 7);
      await wait(1500);   // past the boot's own drain
      // A slow bridge: the queue answers after 400 ms.
      Capacitor.Plugins.TrovoWatch.getPendingSessions = () => new Promise(res => setTimeout(() => res({ sessions: [] }), 400));
      __setNow(next + 'T07:00:00');
      autoAdvanceWeek();   // the round's morning: the swap waits for the queue
      const r = { waiting: !!_nrDrainWait };
      switchTab('log'); switchLogSub('workout');
      openDeckRunner('Legs'); await wait(20);   // START, before the queue has answered
      r.built = runnerSession.week;
      runnerEngaged = true; runnerSetWeight(260); runnerSetReps(5); runnerCompleteSet(); runnerSkipRest();
      await wait(900);
      r.during = Object.assign(roundState(), { open: runnerOpen, held: _nrHeld });
      __setNow(next + 'T07:45:00');
      runnerFinishSession(); await wait(1200);
      r.after = roundState(); r.filed = filed(); r.next = next;
      return r;
    }, { LOGS, ROUND_STATE, FILED });
    assert(out.waiting && out.built === 12, 'START during the wait opened round 1\'s week 12: ' + JSON.stringify(out));
    assert(out.during.cycle === 1 && out.during.week === 12 && out.during.open && out.during.held, 'the wait ends with the runner open: round 1 is held, not swapped under it: ' + JSON.stringify(out.during));
    assert(out.filed && out.filed.date === out.next && out.filed.week === 12 && out.filed.bName === bName && !out.filed.inRound, 'the workout is filed as week 12 (' + bName + '), round 1\'s: ' + JSON.stringify(out.filed));
    assert(out.after.cycle === 2 && out.after.week === 1 && out.after.anchored && out.after.sq1 === 227.5, 'round 2 starts once it is saved, built with it: ' + JSON.stringify(out.after));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('T24: another day started over the workout that held the round starts the round first, and is its week 1', async () => {
  // Sunday night's Legs left as a draft (two sets, or none), the app killed; launched Monday 05:30,
  // the owner starts Push instead ("Discard and start Push", or no question with nothing logged).
  for (const native of [false, true]) for (const logged of [true, false]) {
    const app = await boot({ native, seed: { kt_week: '12' } });
    const tag = (native ? 'native' : 'web') + (logged ? ', sets logged' : ', nothing logged');
    try {
      await finalWeekSunday(app);
      await app.page.evaluate(async ({ LOGS, logged }) => {
        eval(LOGS);
        const wait = ms => new Promise(res => setTimeout(res, ms));
        switchTab('log'); switchLogSub('workout'); await wait(30);
        openDeckRunner('Legs'); await wait(20);
        if (logged) { runnerEngaged = true; runnerSetWeight(260); [5, 5].forEach(rep => { runnerSetReps(rep); runnerCompleteSet(); runnerSkipRest(); runnerEngaged = true; }); }
        _flushRunnerDraft();
        __setNow(addDays(sessionStorage.getItem('__mon'), 7) + 'T05:30:00');
      }, { LOGS, logged });
      await coldBoot(app);
      const out = await app.page.evaluate(async ({ LOGS, ROUND_STATE }) => {
        eval(LOGS); eval(ROUND_STATE);
        const wait = ms => new Promise(res => setTimeout(res, ms));
        const next = addDays(sessionStorage.getItem('__mon'), 7);
        await wait(1500);
        // A slow bridge on the phone: the swap lands 400 ms after the tap.
        if (window.__mock) Capacitor.Plugins.TrovoWatch.getPendingSessions = () => new Promise(res => setTimeout(() => res({ sessions: [] }), 400));
        switchTab('log'); switchLogSub('workout'); render(); await wait(30);
        const r = { boot: Object.assign(roundState(), { held: _nrHeld, banner: /WORKOUT IN PROGRESS/.test(txt()) }) };
        const pill = [...document.querySelectorAll('.kt-adhoc-pill')].find(b => /^push$/i.test(b.textContent.trim()));
        r.pill = !!pill;
        if (pill) pill.click(); else openDeckRunner('Push');
        await wait(30);
        const ok = document.querySelector('.kt-close-sheet [id$="ok"]'); r.confirm = ok ? ok.textContent.trim() : null; if (ok) ok.click();
        await wait(900);
        const cr = getCustomRoutine();
        r.runner = { open: runnerOpen, day: runnerSession && runnerSession.dayName, week: runnerSession && runnerSession.week,
          bench: runnerSession ? (runnerSession.exercises.find(e => e.name === 'Bench Press') || {}).weight : null,
          planned: (cr.weeks[0].push.find(e => e.name === 'Bench Press') || {}).weight };
        r.round = roundState();
        runnerEngaged = true; runnerSetReps(5); runnerCompleteSet(); runnerSkipRest();
        __setNow(next + 'T06:30:00');
        runnerFinishSession(); await wait(900);
        const s = getSessions().find(x => x.date === next && x.type === 'Push');
        const cr2 = getCustomRoutine();
        r.saved = s ? { week: s.week, bName: s.bName || '', inRound: _roundTest(cr2)(s.date, _cmpT(s)), w1: cr2.weeks[0].bName } : null;
        r.legs = getSessions().some(x => x.date === addDays(next, -1) && x.type === 'Legs' && x.exercises.some(e => e.weight === 260));
        return r;
      }, { LOGS, ROUND_STATE });
      assert(out.boot.cycle === 1 && out.boot.week === 12 && out.boot.held && out.boot.banner, tag + ': launched with the draft waiting, round 1 is held: ' + JSON.stringify(out.boot));
      assert(logged ? out.confirm === 'Discard and start Push' : out.confirm === null, tag + ': the confirm (only with sets logged): ' + out.confirm);
      assert(out.round.cycle === 2 && out.round.week === 1 && out.round.anchored, tag + ': the draft gone, round 2 starts: ' + JSON.stringify(out.round));
      assert(out.runner.open && out.runner.day === 'Push' && out.runner.week === 1 && out.runner.bench === out.runner.planned, tag + ': Push opens from round 2\'s week 1: ' + JSON.stringify(out.runner));
      assert(out.saved && out.saved.week === 1 && out.saved.bName === out.saved.w1 && out.saved.inRound, tag + ': and is filed as round 2\'s week 1: ' + JSON.stringify(out.saved));
      assert(!out.legs, tag + ': Sunday\'s discarded sets are not filed');
      assert(app.errors.length === 0, tag + ': no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});

run('T26: a workout on the wrist holds the round at a cold launch, on a return after a long lock, after Hide, until its copy is filed', async () => {
  // The wrist runs Legs from Sunday 23:20. killed: the phone app launched at 00:05 (the shell's live
  // cache says so); return: a live set seen at 23:25, locked at 23:30, back at 00:05 with no message;
  // hide: held at midnight, then the banner's Hide; abandoned: never finished on the wrist.
  for (const mode of ['killed', 'return', 'hide', 'abandoned']) {
    const app = await boot({ native: true, seed: { kt_week: '12' } });
    try {
      await app.page.addInitScript(() => { if (window.__mock) Capacitor.Plugins.TrovoWatch.getLiveState = () => Promise.resolve({ json: sessionStorage.getItem('__live') || '' }); });
      await finalWeekSunday(app);
      await app.page.evaluate(async ({ LOGS, VIS, mode }) => {
        eval(LOGS); eval(VIS);
        const wait = ms => new Promise(res => setTimeout(res, ms));
        await wait(1500);
        const mon = sessionStorage.getItem('__mon'), sun = addDays(mon, 6), next = addDays(mon, 7), start = at(sun, '23:20');
        sessionStorage.setItem('__start', String(start));
        __setNow(sun + (mode === 'return' ? 'T23:25:00' : 'T23:50:00'));
        const live = JSON.stringify({ dayName: 'Legs', slot: 'Legs', startedAt: start, reps: { 'Back Squat': [5, 5] } });
        sessionStorage.setItem('__live', live);
        _onWatchLive(live);
        if (mode === 'return') { __setNow(sun + 'T23:30:00'); leave(); __setNow(next + 'T00:05:00'); back(); }
        if (mode === 'killed' || mode === 'abandoned') __setNow(next + 'T00:05:00');
        if (mode === 'hide') { __setNow(next + 'T00:00:40'); window.__ticks.filter(t => t.ms === 60000).forEach(t => t.fn()); }
        await wait(300);
      }, { LOGS, VIS, mode });
      if (mode === 'killed' || mode === 'abandoned') await coldBoot(app);
      const out = await app.page.evaluate(async ({ LOGS, ROUND_STATE, mode }) => {
        eval(LOGS); eval(ROUND_STATE);
        const wait = ms => new Promise(res => setTimeout(res, ms));
        const tick = () => window.__ticks.filter(t => t.ms === 60000).forEach(t => t.fn());
        const next = addDays(sessionStorage.getItem('__mon'), 7), start = Number(sessionStorage.getItem('__start'));
        await wait(1500);
        switchTab('log'); switchLogSub('workout'); render();
        const r = { held: Object.assign(roundState(), { banner: /from your wrist/.test(txt()) }) };
        if (mode === 'hide') { hideWatchLive(); r.hidden = !/from your wrist/.test(txt()); __setNow(next + 'T00:01:40'); tick(); await wait(1200); r.afterHide = roundState(); }
        __setNow(next + 'T00:15:00'); tick(); await wait(1200);
        r.later = roundState();
        if (mode === 'abandoned') {
          __setNow(next + 'T05:21:00'); tick(); await wait(1500);   // 6 h from its start
          r.after = roundState();
          return r;
        }
        // 00:20: the wrist finishes; its copy arrives on the queue and drains.
        __setNow(next + 'T00:20:00');
        sessionStorage.removeItem('__live');
        window.__mock.pending = [JSON.stringify({ dayName: 'Legs', slot: 'Legs', startedAt: new Date(start).toISOString(), loggedAt: new Date().toISOString(),
          exercises: [{ name: 'Back Squat', reps: [5, 5, 5], weight: 260, weightLog: [260, 260, 260] }] })];
        _onWatchLive(JSON.stringify({ dayName: 'Legs', slot: 'Legs', startedAt: start, reps: { 'Back Squat': [5, 5, 5] }, ended: true }));
        await wait(3500);
        r.drained = roundState();
        __setNow(next + 'T00:21:00'); tick(); await wait(1500);
        r.after = roundState();
        return r;
      }, { LOGS, ROUND_STATE, mode });
      assert(out.held.cycle === 1 && out.held.week === 12 && out.held.banner, mode + ': past midnight with the wrist workout under way, round 1 stays: ' + JSON.stringify(out.held));
      if (mode === 'hide') assert(out.hidden && out.afterHide.cycle === 1, mode + ': Hide puts the banner away, not the workout: ' + JSON.stringify(out.afterHide));
      assert(out.later.cycle === 1, mode + ': and it stays with no message for a while: ' + JSON.stringify(out.later));
      if (mode === 'abandoned') {
        assert(out.after.cycle === 2 && out.after.week === 1 && out.after.sq1 === 212.5, mode + ': a wrist workout never finished stops holding it 6 h from its start: ' + JSON.stringify(out.after));
      } else {
        assert(out.drained.cycle === 1 && out.drained.saved && out.drained.saved.sunday && out.drained.saved.week === 12, mode + ': the wrist\'s copy drains as Sunday\'s week 12: ' + JSON.stringify(out.drained));
        assert(out.after.cycle === 2 && out.after.week === 1 && out.after.anchored && out.after.sq1 === 227.5, mode + ': then round 2 starts, built with it: ' + JSON.stringify(out.after));
      }
      assert(app.errors.length === 0, mode + ': no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});

run('T26: the phone finishing the workout the wrist began lets the round start at once', async () => {
  // The wrist starts Legs at 23:30; after midnight the phone opens Legs and mirrors it, and finishes.
  const app = await boot({ native: true, seed: { kt_week: '12' } });
  try {
    await finalWeekSunday(app);
    const out = await app.page.evaluate(async ({ LOGS, ROUND_STATE }) => {
      eval(LOGS); eval(ROUND_STATE);
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const tick = () => window.__ticks.filter(t => t.ms === 60000).forEach(t => t.fn());
      await wait(1500);
      const mon = sessionStorage.getItem('__mon'), sun = addDays(mon, 6), next = addDays(mon, 7), start = at(sun, '23:30');
      const live = (reps) => _onWatchLive(JSON.stringify({ dayName: 'Legs', slot: 'Legs', startedAt: start, reps: { 'Back Squat': reps }, weights: { 'Back Squat': 260 } }));
      __setNow(sun + 'T23:40:00'); live([5]);
      __setNow(next + 'T00:00:40'); tick(); await wait(500);
      const r = { held: roundState() };
      __setNow(next + 'T00:05:00');
      switchTab('log'); switchLogSub('workout');
      openDeckRunner('Legs'); await wait(20);
      live([5, 5]); await wait(50);
      r.mirrored = (runnerRepsLog['Back Squat'] || []).length;
      runnerEngaged = true; runnerSetWeight(260); runnerSetReps(5); runnerCompleteSet(); runnerSkipRest();
      __setNow(next + 'T00:30:00');
      runnerFinishSession(); await wait(1500);
      r.after = roundState();
      return r;
    }, { LOGS, ROUND_STATE });
    assert(out.held.cycle === 1 && out.mirrored === 2, 'held by the wrist, then mirrored on the phone: ' + JSON.stringify(out));
    assert(out.after.cycle === 2 && out.after.week === 1 && out.after.sq1 === 227.5, 'the phone\'s finish ends it on the wrist too: round 2 starts, built with it: ' + JSON.stringify(out.after));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('T25: while a draft holds round 2 on its Monday the wrist is sent the round\'s own day, so a workout trained there is its week 1', async () => {
  const app = await boot({ native: true, seed: { kt_week: '12' } });
  try {
    await finalWeekSunday(app);
    // Push on Monday in round 1's last week and in week 1; Sunday night's Legs is left as a draft.
    const sun = await app.page.evaluate(async (LOGS) => {
      eval(LOGS);
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const cr = getCustomRoutine(), cad = ['Push', 'Rest', 'Pull', 'Rest', 'Legs', 'Rest', 'Legs'];
      cr.weeks[11].weekPlan = cad.slice(); cr.weeks[0].weekPlan = cad.slice(); setCustomRoutine(cr);
      switchTab('log'); switchLogSub('workout'); await wait(30);
      openDeckRunner('Legs'); await wait(20);
      runnerEngaged = true; runnerSetWeight(260);
      [5, 5].forEach(rep => { runnerSetReps(rep); runnerCompleteSet(); runnerSkipRest(); runnerEngaged = true; });
      _flushRunnerDraft();
      await wait(1200);   // the debounced push: Monday in the week ahead
      const u = window.__mock.updateContext, wk = u.length ? JSON.parse(u[u.length - 1].week || '[]') : [], m = wk[0] || {};
      __setNow(addDays(sessionStorage.getItem('__mon'), 7) + 'T05:30:00');
      return { week: m.week, dayName: m.dayName, bench: ((m.exercises || []).find(e => e.name === 'Bench Press') || {}).weight,
        r1: (getCustomRoutine().weeks[11].push.find(e => e.name === 'Bench Press') || {}).weight };
    }, LOGS);
    await coldBoot(app);   // killed overnight, launched Monday 05:30: the draft holds round 2
    const out = await app.page.evaluate(async ({ LOGS, ROUND_STATE }) => {
      eval(LOGS); eval(ROUND_STATE);
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const next = addDays(sessionStorage.getItem('__mon'), 7);
      await wait(2500);
      const u = window.__mock.updateContext, today = u.length ? JSON.parse(u[u.length - 1].json) : {};
      const r = { held: Object.assign(roundState(), { held: _nrHeld }),
        wrist: { date: today.date, week: today.week, dayName: today.dayName, bench: ((today.exercises || []).find(e => e.name === 'Bench Press') || {}).weight } };
      // 06:00-06:40 Push on the watch at the load it shows, with per-set RPE; drained at 06:45.
      const w = r.wrist.bench;
      __setNow(next + 'T06:45:00');
      window.__mock.pending = [JSON.stringify({ dayName: 'Push', slot: 'Push', startedAt: new Date(next + 'T06:00:00').toISOString(), loggedAt: new Date().toISOString(),
        exercises: [{ name: 'Bench Press', reps: [8, 8, 8], weight: w, weightLog: [w, w, w], rpeLog: [8, 8, 8], rpe: 8 }] })];
      await drainWatchSessions(); await wait(100);
      // 07:00 Sunday's draft is discarded on Today: round 2 starts.
      __setNow(next + 'T07:00:00');
      discardRunnerDraft(); await wait(30);
      [...document.querySelectorAll('#kt-discard-draft-sheet button')].find(b => /Discard/.test(b.textContent)).click();
      await wait(1500);
      const cr = getCustomRoutine(), s = getSessions().find(x => x.date === next && x.type === 'Push' && x.note === 'From Apple Watch');
      r.after = { cycle: cr.cycle || 1, week: currentWeek, w1: cr.weeks[0].bName, planned: (cr.weeks[0].push.find(e => e.name === 'Bench Press') || {}).weight,
        filed: s ? { week: s.week, bName: s.bName || '', bench: (s.exercises.find(e => e.name === 'Bench Press') || {}).weight, inRound: _roundTest(cr)(s.date, _cmpT(s)) } : null };
      r.next = next;
      return r;
    }, { LOGS, ROUND_STATE });
    assert(sun.week === 1 && sun.dayName === 'Push' && sun.bench > 0 && sun.bench !== sun.r1, 'Sunday: the week ahead gives Monday as round 2\'s week 1, at another load than round 1\'s week 12: ' + JSON.stringify(sun));
    assert(out.held.cycle === 1 && out.held.week === 12 && out.held.held, 'Monday 05:30: the draft holds round 1: ' + JSON.stringify(out.held));
    assert(out.wrist.date === out.next && out.wrist.week === 1 && out.wrist.dayName === 'Push' && out.wrist.bench === sun.bench, 'the wrist is sent the round\'s Monday as it showed since midnight, not round 1\'s week 12: ' + JSON.stringify(out.wrist));
    assert(out.after.cycle === 2 && out.after.week === 1, 'the draft discarded, round 2 starts: ' + JSON.stringify(out.after));
    assert(out.after.filed && out.after.filed.week === 1 && out.after.filed.bName === out.after.w1 && out.after.filed.inRound && out.after.filed.bench === out.after.planned, 'the wrist workout is round 2\'s week 1, trained at its own load: ' + JSON.stringify(out.after));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('T25: a round first opened after its start week claims nothing, so while it is held the wrist keeps the old round\'s day', async () => {
  // Round 2 was set for last Monday and the phone app not opened since; this Monday 07:00 it opens
  // while the wrist runs Legs (the shell's live cache): the round is held, and starts this week.
  const app = await boot({ native: true, seed: { kt_week: '12' } });
  try {
    await app.page.addInitScript(() => { if (window.__mock) Capacitor.Plugins.TrovoWatch.getLiveState = () => Promise.resolve({ json: sessionStorage.getItem('__live') || '' }); });
    await withClock(app);
    await app.page.evaluate(() => {
      const mon = _mostRecentMonday();
      sessionStorage.setItem('__mon', mon);
      __setNow(mon + 'T07:00:00');
      localStorage.setItem('kt_week_monday', addDays(mon, -14)); localStorage.setItem('kt_final_since', addDays(mon, -14));
      lsSet('kt_routine_next', { startsOn: addDays(mon, -7), at: addDays(mon, -10), afterEnd: true });
      sessionStorage.setItem('__live', JSON.stringify({ dayName: 'Legs', slot: 'Legs', startedAt: new Date(mon + 'T06:30:00').getTime(), reps: { 'Back Squat': [5, 5] } }));
    });
    await coldBoot(app);
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      await wait(2500);
      const u = window.__mock.updateContext, today = u.length ? JSON.parse(u[u.length - 1].json) : {};
      return { cycle: getCustomRoutine().cycle || 1, week: currentWeek, held: _nrHeld, wrist: { date: today.date, week: today.week, day: today.slot }, today: todayISO(), act: getTodayActivity().dayName };
    });
    assert(out.cycle === 1 && out.week === 12 && out.held, 'the wrist workout holds the late round: ' + JSON.stringify(out));
    assert(out.wrist.date === out.today && out.wrist.week === 12 && out.wrist.day === out.act, 'the wrist is sent the old round\'s day, as the phone shows it (nothing it trains is claimed): ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('T46: a final-week draft resumed after "Start round 2 today" keeps its week and its block', async () => {
  const app = await boot({ native: false, seed: { kt_week: '12' } });
  try {
    await withClock(app);
    // Thursday 17:00 of the final week: Legs begun, three sets, the app killed.
    await app.page.evaluate(() => {
      const mon = _mostRecentMonday();
      sessionStorage.setItem('__mon', mon);
      __setNow(addDays(mon, 3) + 'T17:00:00');
      localStorage.setItem('kt_week_monday', mon); localStorage.setItem('kt_final_since', mon);
    });
    await coldBoot(app);
    const pre = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      switchTab('log'); switchLogSub('workout'); await wait(30);
      openDeckRunner('Legs', true); await wait(20);
      runnerEngaged = true; runnerSetWeight(260);
      [5, 5, 5].forEach(rep => { runnerSetReps(rep); runnerCompleteSet(); runnerSkipRest(); runnerEngaged = true; });
      _flushRunnerDraft();
      __setNow(todayISO() + 'T17:30:00');
      return { week: currentWeek, bName: getCustomRoutine().weeks[11].bName };
    });
    await coldBoot(app);
    const out = await app.page.evaluate(async (FILED) => {
      eval(FILED);
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = { resumable: runnerResumePending };
      r.started = setNextRound('today'); await wait(50);
      // The coach renames round 2's last week before the workout is finished.
      const cr = getCustomRoutine(); cr.weeks[11].bName = 'PEAK'; setCustomRoutine(cr);
      r.round = [getCustomRoutine().cycle, currentWeek, localStorage.getItem('kt_week_monday') === sessionStorage.getItem('__mon')];
      resumeRunnerDraft(); await wait(20);
      __setNow(todayISO() + 'T18:00:00');
      runnerFinishSession(); await wait(300); try { closeCompleteSheet(); } catch (e) {}
      r.filed = filed(); r.today = todayISO();
      return r;
    }, FILED);
    assert(pre.week === 12, 'the draft was begun on week 12: ' + JSON.stringify(pre));
    assert(out.resumable && out.started && out.round[0] === 2 && out.round[1] === 1 && out.round[2], 'round 2 starts today, its week 1 anchored on this Monday: ' + JSON.stringify(out));
    assert(out.filed && out.filed.date === out.today && out.filed.week === 12 && out.filed.bName === pre.bName && !out.filed.inRound, 'the resumed workout is round 1\'s week 12 (' + pre.bName + '), not round 2\'s week 1 or its renamed week 12: ' + JSON.stringify(out.filed));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('T49: a Carry forward offered before a held round swapped in is not written into the new round', async () => {
  const app = await boot({ native: true, seed: { kt_week: '12' } });
  try {
    await withClock(app);
    // Wednesday of a final week that tests (no deload): Bench Press 3 x 5 at 200 all programme long.
    await app.page.evaluate(() => {
      const mon = _mostRecentMonday();
      __setNow(addDays(mon, 2) + 'T17:00:00');
      localStorage.setItem('kt_week_monday', mon); localStorage.setItem('kt_final_since', mon);
      const cr = getCustomRoutine();
      cr.weeks[11].bName = 'TEST';
      cr.weeks.forEach(w => (w.push || []).forEach(e => { if (e.name === 'Bench Press') { e.weight = 200; e.reps = 5; e.sets = 3; delete e.weights; } }));
      setCustomRoutine(cr);
    });
    await coldBoot(app);
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const bench = (w) => { const e = (getCustomRoutine().weeks[w].push || []).find(x => x.name === 'Bench Press'); return e ? { w: e.weight, edited: e.rec !== undefined } : null; };
      await wait(1500);
      // A slow bridge: the queue answers 400 ms after the finish, after the sheet has painted.
      Capacitor.Plugins.TrovoWatch.getPendingSessions = () => new Promise(res => setTimeout(() => res({ sessions: [] }), 400));
      switchTab('log'); switchLogSub('workout'); await wait(20);
      openDeckRunner('Push', true); await wait(20);
      // Round 2 comes due under the workout (set for this Monday, before it): held.
      lsSet('kt_routine_next', { startsOn: _mostRecentMonday(), at: addDays(_mostRecentMonday(), -3) });
      autoAdvanceWeek(); await wait(20);
      const r = { held: [_nrHeld, getCustomRoutine().cycle || 1] };
      runnerGoTo(runnerSession.exercises.findIndex(e => e.name === 'Bench Press'));
      runnerEngaged = true; runnerSetWeight(210);
      [5, 5, 5].forEach(rep => { runnerSetReps(rep); runnerCompleteSet(); runnerSkipRest(); runnerEngaged = true; });
      runnerFinishSession(); await wait(200);
      const btn = [...document.querySelectorAll('.kt-carry-row button')][0];
      r.offer = btn ? btn.textContent : null;
      r.cycleAtOffer = getCustomRoutine().cycle || 1;
      await wait(900);   // round 2 swaps in under the sheet
      r.swapped = [getCustomRoutine().cycle || 1, currentWeek];
      r.before = bench(11); r.scope0 = localStorage.getItem('kt_routine_backup_scope');
      const b2 = [...document.querySelectorAll('.kt-carry-row button')][0];
      if (b2) b2.click();
      await wait(50);
      r.after = bench(11); r.week1 = bench(0);
      r.scope = localStorage.getItem('kt_routine_backup_scope');
      r.gone = !document.querySelector('.kt-carry-row');
      r.toast = (document.getElementById('toast') || {}).textContent;
      return r;
    });
    assert(out.held[0] && out.held[1] === 1, 'held while the workout is under way: ' + JSON.stringify(out.held));
    assert(out.offer === 'Carry 210 lb forward on Bench Press' && out.cycleAtOffer === 1, 'the sheet offers the carry, judged against round 1: ' + JSON.stringify(out));
    assert(out.swapped[0] === 2 && out.swapped[1] === 1 && /^round:/.test(out.scope0), 'round 2 swaps in under the sheet: ' + JSON.stringify(out));
    assert(JSON.stringify(out.after) === JSON.stringify(out.before) && !out.after.edited && out.scope === out.scope0, 'the stale tap writes nothing into round 2 and keeps the swap\'s restore point: ' + JSON.stringify(out));
    assert(out.gone && /Not carried/.test(out.toast), 'the offer goes, and says why: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
