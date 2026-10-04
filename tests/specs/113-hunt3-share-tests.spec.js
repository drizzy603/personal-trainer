// Hunt 3 fixes, share card and clock-proof specs:
// - M56: spec 94 no longer hardcodes 2026 in the day sheet's title (from 2027-01-01 the seed's
//   day reads "Tuesday, Jul 21, 2026" and the suite went red, blocking publish.sh). Pinned here:
//   the title names the year only for a day outside this year.
// - L45: the share card compares loads as it shows them. A kg owner's 72.5 kg stored as 160 and
//   159.8 lb (a programme load, then − and + on the stepper) read TOP SET 72.5 kg × 5 and −3 reps
//   (the reps of the set heavier only in storage) and split "72.5×5  72.5×6  72.5×6 kg"; now
//   72.5 kg × 6, −2 reps and "72.5 kg · 5, 6, 6 reps", and a record reads the same top set.
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
