// A Health workout's UUID is the only thing standing between the user and a second
// chance at importing it. It must not be burned before the workout is on disk: a
// storage failure used to mark the run imported and then fail to save it, losing the
// workout for good. A deliberate skip (a run the user already logged by hand) is
// still marked, because that one must never re-offer.
const { boot, assert, run } = require('../lib/harness');

run('Health import marks a workout seen only once it is saved', async () => {
  const app = await boot({ seed: { kt_runs: '[]', kt_sports: '[]', kt_hk_imported: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      const today = todayISO();
      const at = today + 'T07:00:00';
      const seen = () => lsGet('kt_hk_imported') || [];

      // 1. the happy path: the run lands and the uuid is marked
      const ok = _logHealthRun({ uuid: 'u-ok', startDate: at, distanceKm: 5, durationSec: 1500, avgHr: 150 });
      r.ok = { rec: !!(ok && ok.distance === 5), runs: getRuns().length, marked: seen().indexOf('u-ok') >= 0 };

      // 2. a manual duplicate is a deliberate skip: null, not saved, but still marked
      lsSet('kt_runs', [{ id: 1, date: today, distance: 10, time: '50:00', type: 'easy' }]);
      const dupe = _logHealthRun({ uuid: 'u-dupe', startDate: at, distanceKm: 10, durationSec: 3000, avgHr: 150 });
      r.dupe = { ret: dupe, runs: getRuns().length, marked: seen().indexOf('u-dupe') >= 0 };

      // 3. storage full: false, nothing saved, and the uuid is NOT burned — so the
      //    next import still offers the workout instead of silently dropping it
      const realSet = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function (k, v) {
        if (k === 'kt_runs' || k === 'kt_sports') { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
        return realSet(k, v);
      };
      const full = _logHealthRun({ uuid: 'u-full', startDate: at, distanceKm: 7, durationSec: 2100, avgHr: 150 });
      const fullSport = _logHealthSport({ uuid: 'u-sport', startDate: at, durationSec: 1800, type: 'swim' }, 'swim');
      localStorage.setItem = realSet;
      r.full = { ret: full, sportRet: fullSport, marked: seen().indexOf('u-full') >= 0, sportMarked: seen().indexOf('u-sport') >= 0 };

      // 4. and the sport happy path still works, marked once, not twice
      const s = _logHealthSport({ uuid: 'u-s2', startDate: at, durationSec: 1800, type: 'swim' }, 'swim');
      _logHealthSport({ uuid: 'u-s2', startDate: at, durationSec: 1800, type: 'swim' }, 'swim');
      r.sport = { rec: !!(s && s.id), count: seen().filter(u => u === 'u-s2').length };
      return r;
    });

    assert(out.ok.rec && out.ok.runs === 1 && out.ok.marked, 'a saved run is logged and marked: ' + JSON.stringify(out.ok));
    assert(out.dupe.ret === null && out.dupe.runs === 1 && out.dupe.marked, 'a manual duplicate is skipped but still marked: ' + JSON.stringify(out.dupe));
    assert(out.full.ret === false && !out.full.marked, 'a failed save does not burn the run uuid: ' + JSON.stringify(out.full));
    assert(out.full.sportRet === false && !out.full.sportMarked, 'a failed save does not burn the sport uuid: ' + JSON.stringify(out.full));
    assert(out.sport.rec && out.sport.count === 1, 'a sport is marked exactly once: ' + JSON.stringify(out.sport));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
