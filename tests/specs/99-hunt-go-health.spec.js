// Hunt 2026-09-26 "go" fixes, Apple Health (web 20260930-3):
// - A quick-logged or auto-logged workout no longer moves the batch import's cursor to now:
//   "Import from Health" then skipped every older workout that was never imported.
// - A workout a batch import took retires its quick-log card, and logging an already imported
//   workout is refused (the card wrote a second copy).
const { boot, assert, run } = require('../lib/harness');

run('a quick-log keeps the import cursor; a batch import retires the card; no second copy', async () => {
  const app = await boot({ native: true, seed: { kt_runs: '[]', kt_sports: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const day = 86400e3, now = Date.now();
      const mk = (id, agoMs, km) => ({ uuid: id, startDate: new Date(now - agoMs).toISOString(), distanceKm: km, durationSec: km * 330, avgHr: 150 });
      const health = [mk('u6', 6 * day, 5), mk('u4', 4 * day, 6), mk('u3', 3 * day, 7), mk('u0', 3 * 3600e3, 5.5)];
      Capacitor.Plugins.TrovoHealth = {
        isAvailable: () => Promise.resolve({ available: true }), requestAuth: () => Promise.resolve({}),
        fetchRuns: ({ sinceMs }) => Promise.resolve({ runs: health.filter(r => new Date(r.startDate).getTime() >= (sinceMs || 0)) }),
      };
      const r = {};
      const cursor0 = String(now - 7 * day);
      localStorage.setItem('kt_hk_last_sync', cursor0); lsSet('kt_hk_imported', []);
      // today's run is offered on the Run tab and logged with one tap
      checkRecentHealthRun(); await wait(80);
      r.card = _hkPendingRun && _hkPendingRun.uuid;
      logPendingHealthRun(); await wait(40);
      r.cursorAfterQuick = localStorage.getItem('kt_hk_last_sync') === cursor0;
      // a batch import still fetches the older runs, and does not duplicate today's
      importFromHealth(); await wait(300);
      const runs = getRuns();
      r.batch = { n: runs.length, u: runs.map(x => Math.round(x.distance * 10) / 10).sort().join(','), cursorMoved: localStorage.getItem('kt_hk_last_sync') !== cursor0 };
      // a card for a workout the batch takes is retired, and an imported workout is never logged again
      health.push(mk('u9', 2 * 3600e3, 4));
      _hkPendingRun = health[health.length - 1];
      importFromHealth(); await wait(300);
      r.cardGone = _hkPendingRun === null;
      r.again = _logHealthRun(health[health.length - 1]);
      r.final = getRuns().length;
      return r;
    });
    assert(out.card === 'u0', 'today\'s run is offered: ' + out.card);
    assert(out.cursorAfterQuick, 'a quick-log leaves the batch cursor where it was');
    assert(out.batch.n === 4 && out.batch.u === '5,5.5,6,7' && out.batch.cursorMoved, 'the batch imports the older runs once and moves the cursor: ' + JSON.stringify(out.batch));
    assert(out.cardGone && out.again === null && out.final === 5, 'the batch retires the card; an imported run is not logged twice: ' + JSON.stringify([out.cardGone, out.again, out.final]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
