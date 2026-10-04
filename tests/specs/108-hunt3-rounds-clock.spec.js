// Hunt 3, rounds and the week clock:
// - M06 A round started "Today" is anchored on this week's Monday and a set round is swapped in
//   when the app first opens on its morning (after the watch drains), so the previous round's
//   sessions dated inside week 1 were offered as Carry forward against the new, lower start (one
//   tap undid the re-base) and counted in the following round's best. A round now records when
//   it began (routine.startedAt) and only logs that began after it are its own.
// - M07 From week 2 of a new round the plateau card judged the deliberate re-base by round 1's
//   peak ("stalled 21 days", a further 10% deload every week). A round is judged by its own logs.
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
