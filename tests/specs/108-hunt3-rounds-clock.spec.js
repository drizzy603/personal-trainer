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
