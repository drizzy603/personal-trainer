// Hunt 3 fixes, share card and clock-proof specs:
// - M56: spec 94 no longer hardcodes 2026 in the day sheet's title (from 2027-01-01 the seed's
//   day reads "Tuesday, Jul 21, 2026" and the suite went red, blocking publish.sh). Pinned here:
//   the title names the year only for a day outside this year.
// - L45: the share card compares loads as it shows them. A kg owner's 72.5 kg stored as 160 and
//   159.8 lb (a programme load, then − and + on the stepper) read TOP SET 72.5 kg × 5 and −3 reps
//   (the reps of the set heavier only in storage) and split "72.5×5  72.5×6  72.5×6 kg"; now
//   72.5 kg × 6, −2 reps and "72.5 kg · 5, 6, 6 reps", and a record reads the same top set.
// - L46: a session is stamped with its week's block when it is filed (runner, wrist, the coach's
//   log_session: bName, and bWk for the week it was filed in), so its card keeps it after a new
//   programme, even one started the same week (an old week-4 BASE session read WEEK 04 · BUILD).
//   A log with no stamp, or moved to another week, reads the programme as it stands only if it
//   belongs to it (this round, or no programme or round has replaced it since), else no block.
// - L47: the card's duration rounds to whole minutes before it splits off the hours: the last
//   30 s of every hour read "1 h 60 min" (and 59:30 read "60 min").
// - L48: a 0-load set on a loaded lift reads 0 in the card's set list ("0×10  20×10  20×10 lb",
//   as the day sheet has it); BW is for bodyweight lifts only.
// - L49: the card's font wait asks for latin-ext too (document.fonts.load() fetches only the
//   subsets its sample text needs), so a day named Ściąganie is drawn in Anton/Archivo (Inter in
//   Lime) on the first share, not with a fallback Ś and ą until the second.
// - L57: specs 31 and 32 step back calendar days (addDays(todayISO(), -1 / -7)), not 24 h: on the
//   Sunday the clocks go back (Los Angeles, London), from 23:00 "yesterday" was still today and
//   "last week" was this Monday, and both failed for that hour. Pinned here: addDays counts
//   calendar days across that night.
// - R55 (L45 follow-up): the most reps at the heaviest shown load is _prTop's rule, so in kg the
//   COMPLETE sheet's PR row, RECORD HISTORY, the exercise PR row and the ledger read the record
//   the share card does (72.5 kg × 6 on 160 × 5 and 159.8 × 6, 6; they said × 5 while the card
//   said × 6). A lift logged twice in one session is one top on the same rule; lb is unchanged.
// - R56 (L46 follow-up): the Coach tab's Regenerate archives nowhere, so old cards read the next
//   programme's blocks (WEEK 04 · BUILD on a BASE week) and logs filed late (the coach's, a stale
//   wrist session) were stamped with its week 1 for good. A programme built from nothing (the
//   starter, the coach's first write) is in use from the day it was put in (routine.inUseFrom):
//   it names no older log's block, and a log filed late from before it is not stamped.
const { boot, assert, run: run1 } = require('../lib/harness');

// One browser at a time: each run starts when the one before it has finished.
let queue = Promise.resolve();
const run = (name, fn) => { queue = queue.then(() => new Promise(done => run1(name, () => fn().finally(done)))); };

run('M56: the day sheet title names the year only for a day outside this year', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(() => {
      // 400 days back is always in an earlier calendar year; Jan 1 is always in this one.
      const old = addDays(todayISO(), -400), jan1 = todayISO().slice(0, 4) + '-01-01';
      return { y: old.slice(0, 4), today: _calDayName(todayISO(), true), jan1: _calDayName(jan1, true), old: _calDayName(old, true), oldShort: _calDayName(old) };
    });
    assert(!/\d{4}/.test(out.today) && !/\d{4}/.test(out.jan1), 'this year\'s days read without a year: ' + JSON.stringify(out));
    assert(out.old.endsWith(', ' + out.y) && out.oldShort.endsWith(', ' + out.y), 'a day in another year names it: ' + JSON.stringify(out));
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

// R55: every record view reads the card's record in kg (they read the reps of a set heavier only in storage).
run('R55: in kg the COMPLETE sheet, RECORD HISTORY, the PR row and the share card read one record', async () => {
  const app = await boot({ native: true, seed: { kt_unit_w: 'kg' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const now = Date.now(), day = 86400000, r = {};
      const X = (reps, wl) => ({ name: 'Bench Press', sets: reps.length, reps, weight: wl[0], weightLog: wl });
      // 72.5 kg three times (160 from the programme, then 159.8 after − and +), a record over 150 lb
      const rec = { id: now, date: todayISO(), type: 'Push', week: 2, prs: ['Bench Press'], exercises: [X([5, 6, 6], [160, 159.8, 159.8])] };
      const old = { id: now - 14 * day, date: addDays(todayISO(), -14), type: 'Push', week: 1, prs: [], exercises: [X([8, 8], [150, 150])] };
      lsSet('kt_sessions', [rec, old]);
      const views = async () => {
        const v = { head: _prSetTxt('Bench Press', _prHead('Bench Press')) };
        const m = _shareCardModel(getSessions().find(x => x.id === rec.id));
        v.card = m.records[0].set; v.row = m.rows[0].top;
        openCompleteSheet({ rec: getSessions().find(x => x.id === rec.id) }); await wait(30);
        v.complete = Array.from(document.querySelectorAll('#completeSheetOverlay .kt-cmp-pr')).map(e => e.textContent).join('|');
        closeCompleteSheet();
        openPRHistory('Bench Press'); await wait(20);
        const cur = document.querySelector('#prHistOverlay .kt-prh-cur-v'); v.history = cur ? cur.textContent : '';
        closePRHistory(true);
        const d = document.createElement('div'); d.innerHTML = _exDetailHTML({ name: 'Bench Press', equip: 'Barbell' }, [], false);
        const pr = d.querySelector('.kt-ex-pr .l'); v.prRow = pr ? pr.textContent : '';
        return v;
      };
      r.kg = await views();
      // the lift logged twice in the session: one top, the most reps at its shown load across both
      const two = getSessions(); two.find(x => x.id === rec.id).exercises = [X([5], [160]), X([7, 7], [159.8, 159.8])];
      lsSet('kt_sessions', two);
      r.twice = await views();
      // in lb the loads read apart, so the set at 160 decides as it always did
      localStorage.setItem('kt_unit_w', 'lb');
      const back = getSessions(); back.find(x => x.id === rec.id).exercises = [X([5, 6, 6], [160, 159.8, 159.8])];
      lsSet('kt_sessions', back);
      r.lb = await views();
      localStorage.setItem('kt_unit_w', 'kg');
      return r;
    });
    const ledger = (v, t) => v.head === t && v.card === t && v.history === t && v.prRow.indexOf('PR · ' + t) >= 0;
    const all = (v, t) => ledger(v, t) && v.row === t && v.complete.indexOf(t) >= 0;
    assert(all(out.kg, '72.5 kg × 6'), 'every record view reads 72.5 kg × 6: ' + JSON.stringify(out.kg));
    // (the runner folds a repeated lift into one card, so the COMPLETE sheet never lists one twice)
    assert(ledger(out.twice, '72.5 kg × 7'), 'a lift logged twice in one session is one record top: ' + JSON.stringify(out.twice));
    assert(all(out.lb, '160 lb × 5'), 'lb reads the stored loads apart: ' + JSON.stringify(out.lb));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L46: a shared card keeps the block its session was trained in', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, cr = getCustomRoutine();
      r.live = String(cr.weeks[currentWeek - 1].bName); r.week = currentWeek;
      // every writer stamps the week's block: the coach's log, the wrist and the runner
      executeCoachTool('log_session', { type: 'Pull', date: todayISO(), exercises: [{ name: 'Barbell Row', sets: 3, reps: 8, weight: 135 }] });
      window.__mock.pending.push(JSON.stringify({ dayName: 'Legs', loggedAt: todayISO() + 'T07:00:00', exercises: [{ name: 'Back Squat', reps: [5, 5, 5], weight: 185 }] }));
      await drainWatchSessions(); await wait(30);
      openDeckRunner('Push'); await wait(30);
      if (!runnerEngaged) runnerToggleEngaged();
      runnerSetReps(8); runnerCompleteSet(); runnerFinishSession(); await wait(30);
      const today = getSessions().filter(s => s.date === todayISO());
      const filed = [today.find(s => s.source === 'coach'), today.find(s => s.note === 'From Apple Watch'), today.find(s => s.type === 'Push' && s.note === '')];
      r.stamps = filed.map(s => s && [s.bName, s.bWk]);
      const phases = () => filed.map(s => _shareCardModel(getSessions().find(x => x.id === s.id)).phase);
      // a log from before stamps, older than this round: the programme still answers for it
      const legacy = getSessions().find(s => !s.bName && s.week && s.date < _roundStartISO() && (s.exercises || []).length);
      r.legacy0 = _shareCardModel(legacy).phase === String(cr.weeks[legacy.week - 1].bName).toUpperCase();
      // a new programme whose blocks are named otherwise, as the starter intake swaps it in
      const nr = JSON.parse(JSON.stringify(cr));
      nr.weeks.forEach((w, i) => { w.bName = 'NEW' + (i + 1); });
      archiveCurrentRoutine(); setCustomRoutine(nr); _startProgramme();
      r.after = phases(); r.legacy = _shareCardModel(legacy).phase;
      // started this week instead (Start week 1 today, a Monday start): today's earlier logs keep theirs
      _setWeek(1, _mostRecentMonday());
      r.afterNow = phases();
      // the new programme's own weeks read it as it stands, and a log moved to another week follows
      _setWeek(2, _mostRecentMonday());
      executeCoachTool('log_session', { type: 'Legs', date: todayISO(), exercises: [{ name: 'Leg Press', sets: 3, reps: 10, weight: 200 }] });
      const fresh = getSessions().find(s => s.source === 'coach' && s.type === 'Legs');
      r.fresh = [fresh.bName, _shareCardModel(fresh).phase];
      const ss = getSessions(); ss.find(x => x.id === fresh.id).week = 1; lsSet('kt_sessions', ss);
      r.moved = _shareCardModel(getSessions().find(x => x.id === fresh.id)).phase;
      return r;
    });
    const L = out.live.toUpperCase();
    assert(out.stamps.every(b => b && b[0] === out.live && b[1] === out.week), 'the coach, the wrist and the runner stamp this week\'s block: ' + JSON.stringify(out));
    assert(out.legacy0, 'an old unstamped log reads the programme while it is still the one it was logged in');
    assert(out.after.every(p => p === L) && out.legacy === '', 'after a new programme, a stamped card keeps its block and an unstamped one claims none: ' + JSON.stringify([out.after, out.legacy]));
    assert(out.afterNow.every(p => p === L), 'a programme started the same week leaves the day\'s earlier cards on their block: ' + JSON.stringify(out.afterNow));
    assert(out.fresh[0] === 'NEW2' && out.fresh[1] === 'NEW2' && out.moved === 'NEW1', 'the current programme\'s weeks read live: ' + JSON.stringify([out.fresh, out.moved]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R56: Regenerate (a reset, archived nowhere) no longer hands old cards and late logs the next programme's blocks.
run('R56: after Regenerate, old cards and logs filed late name no block of the programme built next', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const ok = () => { const b = document.querySelector('.kt-close-sheet [id$="ok"]'); if (b) b.click(); };
      const cr0 = getCustomRoutine(), r = {};
      // the seed's logs from before stamps, in weeks 2, 4 and 6: BASE, BASE, BUILD
      const legacy = [2, 4, 6].map(w => getSessions().find(s => Number(s.week) === w && !s.bName && (s.exercises || []).length));
      const phases = () => legacy.map(s => _shareCardModel(getSessions().find(x => x.id === s.id)).phase);
      r.before = phases();
      // Regenerate, then the coach's first write builds a programme whose blocks are named otherwise
      resetCustomRoutine(); ok(); await wait(20);
      const weeks = cr0.weeks.map((w, i) => Object.assign(JSON.parse(JSON.stringify(w)), { wk: i + 1, bName: 'NEW' + (i + 1) }));
      r.res = executeCoachTool('update_routine_weeks', { weeks, weekPlan: cr0.weekPlan });
      r.inUse = getCustomRoutine().inUseFrom === todayISO();
      r.coach = phases();
      // filed late from before it was put in: the coach's log of three weeks back, a stale wrist session
      executeCoachTool('log_session', { type: 'Pull', date: addDays(todayISO(), -21), exercises: [{ name: 'Barbell Row', sets: 3, reps: 8, weight: 135 }] });
      window.__mock.pending.push(JSON.stringify({ dayName: 'Legs', loggedAt: addDays(todayISO(), -10) + 'T07:00:00', exercises: [{ name: 'Back Squat', reps: [5, 5, 5], weight: 185 }] }));
      await drainWatchSessions(); await wait(30);
      const late = [getSessions().find(s => s.source === 'coach' && s.date === addDays(todayISO(), -21)), getSessions().find(s => s.note === 'From Apple Watch' && s.date === addDays(todayISO(), -10))];
      r.late = late.map(s => s ? [s.bName || '', _shareCardModel(s).phase] : null);
      // today's log is this programme's own: stamped with its week's block
      executeCoachTool('log_session', { type: 'Push', date: todayISO(), exercises: [{ name: 'Bench Press', sets: 3, reps: 8, weight: 135 }] });
      const t = getSessions().find(s => s.source === 'coach' && s.date === todayISO());
      r.today = [t.bName, _shareCardModel(t).phase, 'NEW' + t.week];
      // Regenerate again, then the starter: its week 4 is BUILD where the seed's was BASE
      resetCustomRoutine(); ok(); await wait(20);
      applyStarterRoutine({ goal: 'muscle', days: 3, runs: 0, equip: 'full', exp: 1 }); await wait(20);
      r.starterWk4 = getCustomRoutine().weeks[3].bName;
      r.starter = phases();
      r.todayKept = _shareCardModel(getSessions().find(s => s.id === t.id)).phase;
      return r;
    });
    assert(JSON.stringify(out.before) === '["BASE","BASE","BUILD"]', 'the old logs read their blocks: ' + JSON.stringify(out.before));
    assert(out.res && out.res.ok, 'the coach\'s first write saved the programme: ' + JSON.stringify(out.res && out.res.error));
    assert(out.coach.every(p => p === ''), 'old cards name none of the new programme\'s blocks (read NEW2/NEW4/NEW6): ' + JSON.stringify(out.coach));
    assert(out.late.every(x => x && x[0] === '' && x[1] === ''), 'logs filed late from before it are not stamped with its week 1: ' + JSON.stringify(out.late));
    assert(out.inUse, 'a programme built from nothing is in use from the day it was put in (routine.inUseFrom)');
    assert(out.today[0] === out.today[2] && out.today[1] === out.today[2], 'today\'s log is stamped with the programme\'s block: ' + JSON.stringify(out.today));
    assert(out.starterWk4 === 'BUILD' && out.starter.every(p => p === ''), 'after the starter the week-4 BASE card does not read BUILD: ' + JSON.stringify(out.starter));
    assert(out.todayKept === out.today[2], 'a stamped card keeps its block after the next Regenerate: ' + out.todayKept);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L47: the share card rounds the minutes before it splits off the hours', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(() => {
      const t = Date.now();
      const dur = sec => _shareCardModel({ id: t, startedAt: t - sec * 1000, date: todayISO(), type: 'Push', week: 1, prs: [], exercises: [] }).duration;
      // 1:59:40, 59:30, 1:00:10, 1:29:29, 64:00, 59:29
      return [7180, 3570, 3610, 5369, 3840, 3569].map(dur);
    });
    assert(JSON.stringify(out) === JSON.stringify(['2 h 0 min', '1 h 0 min', '1 h 0 min', '1 h 29 min', '1 h 4 min', '59 min']), 'never "1 h 60 min" or "60 min": ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L48: a 0-load set reads BW only on a bodyweight lift', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(() => {
      const X = (name, reps, wl) => ({ name, sets: reps.length, reps, weight: Math.max.apply(null, wl), weightLog: wl });
      // a starter plan's accessory at 0 for the first set, then 20 typed in
      const s = { id: Date.now(), date: todayISO(), type: 'Push', week: 1, prs: [],
        exercises: [X('Cable Fly', [10, 10, 10], [0, 20, 20]), X('Pull Up', [8, 8, 8], [0, 25, 25])] };
      const m = _shareCardModel(s);
      return m.rows.map(r => r.scheme);
    });
    assert(out[0] === '0×10  20×10  20×10 lb', 'a loaded lift\'s empty set reads 0: ' + out[0]);
    assert(out[1] === 'BW×8  +25×8  +25×8 lb', 'a bodyweight lift keeps BW and its added load: ' + out[1]);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L49: the first share card already draws latin-ext letters in the room\'s faces', async () => {
  for (const theme of ['heavyweight', 'dark']) {
    const app = await boot({ native: true, seed: { kt_theme: theme } });
    try {
      const out = await app.page.evaluate(async () => {
        const wait = ms => new Promise(res => setTimeout(res, ms));
        const P = _shareCardPalette(), fams = [P.display, P.body];
        const faces = () => Array.from(document.fonts).filter(f => fams.indexOf(f.family.replace(/"/g, '')) >= 0);
        setDayName('Pull', 'Ściąganie'); await wait(50);
        const s = getSessions().find(x => x.type === 'Pull' && (x.exercises || []).length);
        // share it twice, as two taps on Share card: the hero must not change between them
        const shareOnce = async () => {
          let canvas = null, shared = null;
          const paint = window._paintShareCard, send = window._shareFile;
          window._paintShareCard = function (m, P2) { canvas = paint(m, P2); return canvas; };
          window._shareFile = f => { shared = f; };
          shareSessionCard(s.id);
          for (let i = 0; i < 150 && !shared; i++) await wait(20);
          window._paintShareCard = paint; window._shareFile = send;
          const d = canvas.getContext('2d').getImageData(0, 150, 1080, 260).data;
          let h = 0; for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) >>> 0;
          return h;
        };
        // what the card waits for, before anything is drawn (drawing loads a face, too late)
        await _shareCardFonts(P);
        const loaded = faces().map(f => f.family.replace(/"/g, '') + ' ' + f.unicodeRange.slice(0, 9) + ':' + f.status);
        const first = await shareOnce();
        await wait(300);
        const second = await shareOnce();
        return { hero: _shareCardModel(s).label, same: first === second, loaded };
      });
      assert(out.hero === 'Ściąganie', theme + ': the card names the day: ' + out.hero);
      // Heavyweight draws in Anton and Archivo, Lime in Inter: latin and latin-ext of each
      assert(out.loaded.length === (theme === 'heavyweight' ? 4 : 2) && out.loaded.every(f => /:loaded$/.test(f)), theme + ': both subsets of every face the card uses are loaded before it draws: ' + JSON.stringify(out.loaded));
      assert(out.same, theme + ': the first card\'s hero is drawn as the second one is');
      assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});

run('L57: a calendar day or week back stays one across the night the clocks go back', async () => {
  const app = await boot({ native: true });
  try {
    const browser = app.page.context().browser(), url = app.page.url(), out = {};
    // this year's last Sunday of October (London) and first Sunday of November (Los Angeles)
    for (const [tz, month, pick] of [['Europe/London', 9, 'last'], ['America/Los_Angeles', 10, 'first']]) {
      const ctx = await browser.newContext({ timezoneId: tz });
      try {
        await ctx.route('**/*', (route) => (route.request().url().includes('127.0.0.1') ? route.continue() : route.abort()));
        const page = await ctx.newPage();
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof addDays === 'function', { timeout: 10000 });
        out[tz] = await page.evaluate(({ month, pick }) => {
          const y = new Date().getFullYear(), suns = [];
          for (let d = 1; d <= 31; d++) { const t = new Date(y, month, d); if (t.getMonth() === month && t.getDay() === 0) suns.push(t); }
          const day = _ymdLocal(pick === 'last' ? suns[suns.length - 1] : suns[0]);
          const back = n => { const t = new Date(day + 'T12:00:00'); t.setDate(t.getDate() - n); return _ymdLocal(t); };
          return { zone: Intl.DateTimeFormat().resolvedOptions().timeZone, day, got: [addDays(day, -1), addDays(day, -7), addDays(day, 1)], want: [back(1), back(7), back(-1)] };
        }, { month, pick });
      } finally { await ctx.close(); }
    }
    for (const tz of Object.keys(out)) {
      const o = out[tz];
      assert(o.zone === tz && JSON.stringify(o.got) === JSON.stringify(o.want), tz + ': addDays counts calendar days (specs 31 and 32 use it, not 24 h steps): ' + JSON.stringify(o));
    }
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
