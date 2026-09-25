// Restoring an iCloud backup (which never carries the Health import ledger) and importing again
// must not duplicate Health runs or sports: each restored record stands in for its own workout,
// one workout each, while a genuinely new same-day workout still imports. A batch import that
// hits 'storage full' leaves no phantom records in memory. Also: the run review's goal chip in
// miles, and a date move that fails to save changes nothing.
const { boot, assert, run } = require('../lib/harness');

const D = '2026-09-20';
run('iCloud restore then import: no Health twins; batch copy; goal chip in miles; moveRun save check', async () => {
  const app = await boot({ seed: {
    kt_runs: JSON.stringify([
      { id: 601, date: D, startMs: new Date(D + 'T07:00:00').getTime(), distance: 5, time: '25:00', week: 1, note: 'From Apple Health', hr: 150, type: 'easy' },
      { id: 602, date: D, distance: 10, time: '55:00', week: 1, note: 'Evening', hr: 0, type: 'long' }]),
    kt_sports: JSON.stringify([{ id: 701, date: D, type: 'Cycling', duration: 60, data: { distance: 25, avgHR: 130 }, notes: 'From Apple Health' }]),
    kt_hk_imported: JSON.stringify(['hk-601', 'hk-701']) } });
  try {
    const out = await app.page.evaluate(async (D) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      const health = (extra) => ({ uuid: 'x', type: 'run', startDate: D + 'T07:00:00', distanceKm: 5, durationSec: 1500, avgHr: 150, ...extra });
      let fetched = [];
      window.Capacitor = { Plugins: { TrovoHealth: {
        isAvailable: () => Promise.resolve({ available: true }), requestAuth: () => Promise.resolve({}),
        fetchRuns: () => Promise.resolve({ runs: fetched }) } } };
      // the iCloud copy: no ledger, no Health HR
      const icloud = JSON.parse(_sanitizeForICloud(JSON.stringify(buildBackupJSON())));
      r.icloudHasLedger = 'kt_hk_imported' in icloud;
      _applyImportedData(icloud);
      r.ledgerAfterRestore = lsGet('kt_hk_imported');
      // Health still has the 07:00 run and the ride, plus a second 5 km run that evening (new)
      fetched = [health({ uuid: 'hk-601' }),
                 health({ uuid: 'hk-603', startDate: D + 'T19:00:00', durationSec: 1520 }),
                 { uuid: 'hk-701', type: 'ride', startDate: D + 'T09:00:00', distanceKm: 25, durationSec: 3600, avgHr: 130 }];
      importFromHealth(); await wait(300);
      const runsD = getRuns().filter(x => x.date === D);
      r.after = { runs: runsD.length, fives: runsD.filter(x => x.distance === 5).length, rides: getSportLogs().filter(x => x.date === D && x.type === 'Cycling').length,
        ledger: (lsGet('kt_hk_imported') || []).slice().sort().join() };
      // importing again changes nothing
      const snap = localStorage.getItem('kt_runs') + localStorage.getItem('kt_sports');
      importFromHealth(); await wait(300);
      r.again = snap === localStorage.getItem('kt_runs') + localStorage.getItem('kt_sports');

      // storage full during a batch import: no phantom run in memory, the ledger is not burned
      lsDel('kt_hk_imported'); localStorage.removeItem('kt_hk_last_sync');
      fetched = [health({ uuid: 'hk-new', startDate: '2026-09-21T07:00:00', distanceKm: 7, durationSec: 2400 })];
      const before = getRuns().length;
      const realSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) { if (k === 'kt_runs') throw new Error('QuotaExceededError'); return realSet.call(this, k, v); };
      importFromHealth(); await wait(300);
      Storage.prototype.setItem = realSet;
      r.full = { same: getRuns().length === before, noSeven: !getRuns().some(x => x.distance === 7), ledger: lsGet('kt_hk_imported') };

      // the goal chip speaks miles
      localStorage.setItem('kt_unit_d', 'mi'); setRunGoal('5:00');
      const chipBox = document.createElement('div'); chipBox.innerHTML = renderRunReview(5, '24:00', 999999); r.chip = chipBox.textContent;
      localStorage.setItem('kt_unit_d', 'km');

      // a date move that cannot be saved changes nothing
      Storage.prototype.setItem = function (k, v) { if (k === 'kt_runs') throw new Error('QuotaExceededError'); return realSet.call(this, k, v); };
      moveRun(602, '2026-09-19');
      Storage.prototype.setItem = realSet;
      r.move = getRuns().find(x => x.id === 602).date;
      moveRun(602, '2026-09-19');
      r.moved = getRuns().find(x => x.id === 602).date;
      return r;
    }, D);
    assert(!out.icloudHasLedger && out.ledgerAfterRestore === null, 'the iCloud copy has no ledger and the restore clears it: ' + JSON.stringify([out.icloudHasLedger, out.ledgerAfterRestore]));
    assert(out.after.runs === 3 && out.after.fives === 2 && out.after.rides === 1 && out.after.ledger === 'hk-601,hk-603,hk-701',
      'the restored run and ride absorb their own workouts; the new evening run imports once: ' + JSON.stringify(out.after));
    assert(out.again, 'a second import changes nothing');
    assert(out.full.same && out.full.noSeven && !(out.full.ledger || []).includes('hk-new'), 'storage full leaves no phantom and keeps the workout importable: ' + JSON.stringify(out.full));
    assert(/GOAL 8:03 → 7:43 · −20 S\/MI/.test(out.chip) && !/KM/.test(out.chip), 'the goal chip is in miles: ' + out.chip);
    assert(out.move === D && out.moved === '2026-09-19', 'a failed date move keeps the run where it was: ' + JSON.stringify([out.move, out.moved]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
