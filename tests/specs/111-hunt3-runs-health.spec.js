// Hunt 3 (2026-10-04), runs, Apple Health and activity logs:
// - H12: an activity logged by hand (a ride, a match) absorbs its Apple Health twin, ledger or
//   not: Import from Health, auto-log and the quick-log card no longer add it a second time,
//   while a workout that began after the hand log was saved still comes in.
const { boot, assert, run } = require('../lib/harness');

// A TrovoHealth mock whose workouts a test sets in window.__hk (the harness leaves it out).
const HK_MOCK = `
  window.__hk = [];
  Capacitor.Plugins.TrovoHealth = {
    isAvailable: () => Promise.resolve({ available: true }), requestAuth: () => Promise.resolve({}),
    fetchRuns: ({ sinceMs }) => Promise.resolve({ runs: window.__hk.filter(r => new Date(r.startDate).getTime() >= (sinceMs || 0)) }),
  };`;

run('H12: a hand-logged activity absorbs its Apple Health twin (import, auto-log, card)', async () => {
  const app = await boot({ native: true, seed: { kt_sports: '[]', kt_runs: '[]' } });
  try {
    await app.page.evaluate(HK_MOCK);
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const yd = new Date(); yd.setDate(yd.getDate() - 1);
      const y = _ymdLocal(yd);
      const at = (h, m) => { const d = new Date(y + 'T00:00:00'); d.setHours(h, m, 0, 0); return d.getTime(); };
      const iso = ms => new Date(ms).toISOString();
      const hand = () => [
        // typed in after the ride (the id is the save time)
        { id: at(9, 0), date: y, type: 'Cycling', duration: 60, data: { distance: 24 }, notes: '' },
        // typed in today for yesterday's match
        { id: Date.now(), date: y, type: 'Tennis', duration: 90, data: {}, notes: 'Doubles' },
      ];
      const twins = [
        { uuid: 'ride-1', type: 'ride', startDate: iso(at(7, 0)), distanceKm: 24.1, durationSec: 61 * 60, avgHr: 140 },
        { uuid: 'tennis-1', type: 'Tennis', startDate: iso(at(17, 0)), durationSec: 88 * 60, avgHr: 130 },
      ];
      // an evening ride that began after the morning hand log was saved is a different workout
      const evening = { uuid: 'ride-2', type: 'ride', startDate: iso(at(18, 30)), distanceKm: 24, durationSec: 60 * 60, avgHr: 135 };
      const r = {};

      // A. first connect (no ledger): the twins are absorbed and burned, the evening ride comes in
      lsSet('kt_sports', hand()); lsDel('kt_hk_imported'); localStorage.removeItem('kt_hk_last_sync');
      window.__hk = twins.concat([evening]);
      importFromHealth(); await wait(300);
      r.first = { n: getSportLogs().length, health: getSportLogs().filter(l => l.notes === 'From Apple Health').map(l => l.startMs === at(18, 30)),
        ledger: (lsGet('kt_hk_imported') || []).slice().sort().join(), toast: document.getElementById('toast').textContent };

      // B. connected earlier (a ledger exists): auto-log adds only the evening ride
      lsSet('kt_sports', hand()); lsSet('kt_hk_imported', ['older-1']); localStorage.setItem('kt_hk_last_sync', String(Date.now() - 3 * 864e5));
      localStorage.setItem('kt_autolog_runs', '1');
      checkRecentHealthRun(Date.now() - 2 * 864e5); await wait(300);
      r.auto = { n: getSportLogs().length, health: getSportLogs().filter(l => l.notes === 'From Apple Health').length };

      // C. the quick-log card never offers a twin; logging one directly is a skipped duplicate
      lsSet('kt_sports', hand()); lsSet('kt_hk_imported', ['older-1']);
      localStorage.setItem('kt_autolog_runs', '0'); _hkPendingRun = null; _hkPendingDismissed = false;
      window.__hk = twins.slice();
      checkRecentHealthRun(Date.now() - 2 * 864e5); await wait(200);
      r.card = _hkPendingRun && _hkPendingRun.uuid;
      r.direct = _logHealthSport(twins[0], 'Cycling');
      r.directSeen = (lsGet('kt_hk_imported') || []).indexOf('ride-1') >= 0;
      r.cNo = getSportLogs().length;
      // a hand log far shorter than the workout is not its twin
      lsSet('kt_sports', [{ id: Date.now(), date: y, type: 'Tennis', duration: 30, data: {}, notes: '' }]);
      r.short = !!_healthSportDupe(twins[1], 'Tennis', null);
      return r;
    });
    assert(out.first.n === 3 && out.first.health.length === 1 && out.first.health[0] === true,
      'first connect keeps the two hand logs and adds only the evening ride: ' + JSON.stringify(out.first));
    assert(out.first.ledger === 'ride-1,ride-2,tennis-1', 'the absorbed twins are burned with the import: ' + out.first.ledger);
    assert(/1 activity imported/.test(out.first.toast), 'the toast counts only the new ride: ' + out.first.toast);
    assert(out.auto.n === 3 && out.auto.health === 1, 'auto-log adds only the evening ride: ' + JSON.stringify(out.auto));
    assert(out.card === null, 'the card does not offer a workout already logged by hand: ' + out.card);
    assert(out.direct === null && out.directSeen && out.cNo === 2, 'logging a twin is a skipped duplicate, marked seen: ' + JSON.stringify(out));
    assert(out.short === false, 'a 30-minute hand log is not a 88-minute workout');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
