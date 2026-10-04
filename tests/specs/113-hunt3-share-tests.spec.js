// Hunt 3 fixes, share card and clock-proof specs:
// - M56: spec 94 no longer hardcodes 2026 in the day sheet's title (from 2027-01-01 the seed's
//   day reads "Tuesday, Jul 21, 2026" and the suite went red, blocking publish.sh). Pinned here:
//   the title names the year only for a day outside this year.
// - L45: the share card compares loads as it shows them. A kg owner's 72.5 kg stored as 160 and
//   159.8 lb (a programme load, then − and + on the stepper) read TOP SET 72.5 kg × 5 and −3 reps
//   (the reps of the set heavier only in storage) and split "72.5×5  72.5×6  72.5×6 kg"; now
//   72.5 kg × 6, −2 reps and "72.5 kg · 5, 6, 6 reps", and a record reads the same top set.
// - L46: a session is stamped with its week's block when it is filed (runner, wrist, the coach's
//   log_session), so its card keeps it after a new programme (an old week-4 BASE session read
//   WEEK 04 · BUILD). This round's sessions read the programme as it stands (and follow a log
//   moved to another week); an unstamped older one reads it only while no programme or round has
//   replaced it since, else no block.
const { boot, assert, run: run1 } = require('../lib/harness');

const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
// One browser at a time: each run starts when the one before it has finished.
let queue = Promise.resolve();
const run = (name, fn) => { queue = queue.then(() => new Promise(done => run1(name, () => fn().finally(done)))); };

run('M56: the day sheet title names the year only for a day outside this year', async () => {
  const app = await boot({ native: true });
  try {
    // 400 days back is always in an earlier calendar year; Jan 1 is always in this one.
    const old = daysAgo(400), jan1 = new Date().getFullYear() + '-01-01';
    const out = await app.page.evaluate(({ old, jan1 }) => ({
      today: _calDayName(todayISO(), true), jan1: _calDayName(jan1, true), old: _calDayName(old, true), oldShort: _calDayName(old),
    }), { old, jan1 });
    const y = old.slice(0, 4);
    assert(!/\d{4}/.test(out.today) && !/\d{4}/.test(out.jan1), 'this year\'s days read without a year: ' + JSON.stringify(out));
    assert(out.old.endsWith(', ' + y) && out.oldShort.endsWith(', ' + y), 'a day in another year names it: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L45: the kg share card reads its top set, vs last and the scheme on the shown loads', async () => {
  const app = await boot({ native: true, seed: { kt_unit_w: 'kg' } });
  try {
    const out = await app.page.evaluate(() => {
      const now = Date.now(), day = 86400000;
      const X = (reps, wl) => ({ name: 'Bench Press', sets: reps.length, reps, weight: wl[0], weightLog: wl });
      // 72.5 kg three times: 160 lb from the programme, then 159.8 after − and + on the stepper
      const s = { id: now, date: todayISO(), type: 'Push', week: 2, prs: [], exercises: [X([5, 6, 6], [160, 159.8, 159.8])] };
      const prev = { id: now - 7 * day, date: addDays(todayISO(), -7), type: 'Push', week: 1, prs: [], exercises: [X([8, 8, 8], [160, 160, 160])] };
      lsSet('kt_sessions', [s, prev]);
      const row = _shareCardModel(s).rows[0];
      // the same sets as a record over 150 lb: the record reads the shown top set too
      const rec = Object.assign({}, s, { prs: ['Bench Press'] });
      const old = { id: now - 14 * day, date: addDays(todayISO(), -14), type: 'Push', week: 1, prs: [], exercises: [X([8, 8], [150, 150])] };
      lsSet('kt_sessions', [rec, old]);
      const m = _shareCardModel(rec);
      // in lb the loads really read differently, so the sets stay apart
      localStorage.setItem('kt_unit_w', 'lb');
      const lb = _shareCardModel(rec).rows[0];
      localStorage.setItem('kt_unit_w', 'kg');
      return { row, rec: m.records[0], recRow: m.rows[0], lb };
    });
    assert(out.row.scheme === '72.5 kg · 5, 6, 6 reps' && out.row.top === '72.5 kg × 6' && out.row.delta === '−2 reps' && !out.row.up, 'one shown load is one load: ' + JSON.stringify(out.row));
    assert(out.rec.set === '72.5 kg × 6' && out.rec.gain === '+4.5 kg' && out.recRow.top === '72.5 kg × 6' && out.recRow.delta === '+4.5 kg', 'the record and its row agree: ' + JSON.stringify([out.rec, out.recRow]));
    assert(out.lb.scheme === '160×5  159.8×6  159.8×6 lb' && out.lb.top === '160 lb × 5', 'lb shows what was stored: ' + JSON.stringify(out.lb));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L46: a shared card keeps the block its session was trained in', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, cr = getCustomRoutine();
      r.live = String(cr.weeks[currentWeek - 1].bName);
      // every writer stamps the week's block: the coach's log, the wrist and the runner
      executeCoachTool('log_session', { type: 'Pull', date: todayISO(), exercises: [{ name: 'Barbell Row', sets: 3, reps: 8, weight: 135 }] });
      window.__mock.pending.push(JSON.stringify({ dayName: 'Legs', loggedAt: todayISO() + 'T07:00:00', exercises: [{ name: 'Back Squat', reps: [5, 5, 5], weight: 185 }] }));
      await drainWatchSessions(); await wait(30);
      openDeckRunner('Push'); await wait(30);
      if (!runnerEngaged) runnerToggleEngaged();
      runnerSetReps(8); runnerCompleteSet(); runnerFinishSession(); await wait(30);
      const today = getSessions().filter(s => s.date === todayISO());
      const filed = [today.find(s => s.source === 'coach'), today.find(s => s.note === 'From Apple Watch'), today.find(s => s.type === 'Push' && s.note === '')];
      r.stamps = filed.map(s => s && s.bName);
      // a log from before the stamp, older than this round: the programme still answers for it
      const legacy = getSessions().find(s => !s.bName && s.week && s.date < _roundStartISO() && (s.exercises || []).length);
      r.legacy0 = _shareCardModel(legacy).phase === String(cr.weeks[legacy.week - 1].bName).toUpperCase();
      // a new programme whose blocks are named otherwise (as the starter intake swaps it in)
      const nr = JSON.parse(JSON.stringify(cr));
      nr.weeks.forEach((w, i) => { w.bName = 'NEW' + (i + 1); });
      archiveCurrentRoutine(); setCustomRoutine(nr); _startProgramme();
      r.after = filed.map(s => _shareCardModel(getSessions().find(x => x.id === s.id)).phase);
      r.legacy = _shareCardModel(legacy).phase;
      // in the new programme's own weeks a card reads it as it stands, and follows a log to another week
      _setWeek(2, _mostRecentMonday());
      executeCoachTool('log_session', { type: 'Legs', date: todayISO(), exercises: [{ name: 'Leg Press', sets: 3, reps: 10, weight: 200 }] });
      const fresh = getSessions().find(s => s.source === 'coach' && s.type === 'Legs');
      r.fresh = [fresh.bName, _shareCardModel(fresh).phase];
      const ss = getSessions(); ss.find(x => x.id === fresh.id).week = 1; lsSet('kt_sessions', ss);
      r.moved = _shareCardModel(getSessions().find(x => x.id === fresh.id)).phase;
      return r;
    });
    assert(out.stamps.every(b => b === out.live), 'the coach, the wrist and the runner stamp this week\'s block: ' + JSON.stringify(out));
    assert(out.legacy0, 'an old unstamped log reads the programme while it is still the one it was logged in');
    assert(out.after.every(p => p === out.live.toUpperCase()) && out.legacy === '', 'after a new programme, a stamped card keeps its block and an unstamped one claims none: ' + JSON.stringify([out.after, out.legacy]));
    assert(out.fresh[0] === 'NEW2' && out.fresh[1] === 'NEW2' && out.moved === 'NEW1', 'the current programme\'s weeks read live: ' + JSON.stringify([out.fresh, out.moved]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
