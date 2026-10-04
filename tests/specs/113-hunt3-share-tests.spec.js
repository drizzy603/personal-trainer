// Hunt 3 fixes, share card and clock-proof specs:
// - M56: spec 94 no longer hardcodes 2026 in the day sheet's title (from 2027-01-01 the seed's
//   day reads "Tuesday, Jul 21, 2026" and the suite went red, blocking publish.sh). Pinned here:
//   the title names the year only for a day outside this year.
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
