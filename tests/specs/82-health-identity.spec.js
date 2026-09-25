// Hunt 2026-09-25, runs and Apple Health (web 20260925-1): a Health record is its own workout by
// start time (a same-day evening run used to claim the morning run's record after a restore or
// Reset import, losing the evening run and duplicating the morning one; rides too); a moved Health
// ride keeps its identity; a half-failed batch import burns only what saved and keeps its cursor;
// a run typed before a workout began cannot swallow it; failed run saves say so; the sport editor
// never re-converts a field that was not touched.
const { boot, assert, run } = require('../lib/harness');
const D = '2026-09-20';
const at = (d, hm) => new Date(d + 'T' + hm + ':00').getTime();

run('Health identity by start time; moved rides; half-failed imports; manual runs; failed saves; sport editor', async () => {
  const app = await boot({ native: true, seed: {
    kt_runs: JSON.stringify([{ id: 601, date: D, startMs: at(D, '07:00'), distance: 5, time: '25:00', week: 1, note: 'From Apple Health', hr: 150, type: 'easy' }]),
    kt_sports: JSON.stringify([{ id: 701, date: D, startMs: at(D, '09:00'), type: 'Cycling', duration: 60, data: { distance: 25 }, notes: 'From Apple Health' }]) } });
  try {
    const out = await app.page.evaluate(async ([D, am, ride, eve, eveRide]) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      let fetched = [], since = [];
      Capacitor.Plugins.TrovoHealth = { isAvailable: () => Promise.resolve({ available: true }), requestAuth: () => Promise.resolve({}),
        fetchRuns: (o) => { since.push(o.sinceMs); return Promise.resolve({ runs: fetched.filter(w => !(o.sinceMs > 0) || new Date(w.startDate).getTime() >= o.sinceMs) }); } };
      const realSet = Storage.prototype.setItem;
      const full = key => { Storage.prototype.setItem = function (k, v) { if (k === key) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } return realSet.call(this, k, v); }; };
      const ok = () => { Storage.prototype.setItem = realSet; };
      const iso = ms => new Date(ms).toISOString();

      // A. after a restore (no ledger): Health lists the evening run and ride first
      lsDel('kt_hk_imported'); localStorage.removeItem('kt_hk_last_sync');
      fetched = [{ uuid: 'hk-eve', type: 'run', startDate: iso(eve), distanceKm: 5.1, durationSec: 1560, avgHr: 162 },
                 { uuid: 'hk-eride', type: 'ride', startDate: iso(eveRide), distanceKm: 30, durationSec: 3300, avgHr: 140 },
                 { uuid: 'hk-ride', type: 'ride', startDate: iso(ride), distanceKm: 25, durationSec: 3600, avgHr: 130 },
                 { uuid: 'hk-am', type: 'run', startDate: iso(am), distanceKm: 5, durationSec: 1500, avgHr: 150 }];
      importFromHealth(); await wait(300);
      const rs = getRuns().filter(x => x.date === D), sp = getSportLogs().filter(x => x.date === D);
      r.restore = { runs: rs.map(x => x.distance).sort().join(), hr162: rs.some(x => x.hr === 162), rides: sp.map(x => x.duration).sort().join(), newest: getRuns()[0].distance };

      // B. moving a Health ride to another day keeps it Health: Reset + import brings no twin
      moveSport(701, '2026-09-19');
      r.moved = getSportLogs().find(x => x.id === 701).hkOrig;
      resetHealthImport(); document.querySelector('.kt-close-sheet button[id$="ok"]').click(); await wait(50);
      fetched = [{ uuid: 'hk-ride', type: 'ride', startDate: iso(ride), distanceKm: 25, durationSec: 3600, avgHr: 130 }];
      importFromHealth(); await wait(300);
      r.afterReset = getSportLogs().filter(x => x.type === 'Cycling' && Math.round(x.duration) === 60).length;

      // C. a batch whose sports save fails: the runs that saved are burned, the ride is not; the retry adds only the ride
      lsSet('kt_runs', []); lsSet('kt_sports', []); lsSet('kt_hk_imported', ['hk-old']); localStorage.setItem('kt_hk_last_sync', String(Date.now() - 3600e3));
      fetched = [{ uuid: 'hk-r1', type: 'run', startDate: iso(Date.now() - 864e5), distanceKm: 8, durationSec: 2700 },
                 { uuid: 'hk-s1', type: 'ride', startDate: iso(Date.now() - 800e5), distanceKm: 30, durationSec: 3600 }];
      full('kt_sports'); importFromHealth(); await wait(300); ok();
      r.half = { ledger: lsGet('kt_hk_imported').slice().sort().join() };
      importFromHealth(); await wait(300);
      r.retry = { runs: getRuns().length, sports: getSportLogs().length };
      // a first import that fails entirely keeps no cursor, so the retry asks for everything again
      lsSet('kt_runs', []); lsDel('kt_hk_imported'); localStorage.removeItem('kt_hk_last_sync'); since = [];
      fetched = [{ uuid: 'hk-a', type: 'run', startDate: iso(Date.now() - 30 * 864e5), distanceKm: 10, durationSec: 3000 }];
      full('kt_runs'); importFromHealth(); await wait(300); ok();
      r.firstFail = { cursor: localStorage.getItem('kt_hk_last_sync'), runs: getRuns().length };
      importFromHealth(); await wait(300);
      r.firstRetry = { runs: getRuns().length, since: since.slice() };

      // D. a run typed in before a workout began does not swallow it
      const typedAt = Date.now() - 6 * 3600e3;
      lsSet('kt_runs', [{ id: typedAt, date: todayISO(), distance: 5, time: '25:00', week: 1, note: 'treadmill', type: 'easy' }]);
      r.manualSwallow = _manualRunDupe(todayISO(), 5.1, 1560, null, Date.now() - 3600e3);
      r.manualBackdated = _manualRunDupe(todayISO(), 5.1, 1560, null, typedAt - 3600e3);   // logged after the workout: still a twin

      // E. failed run saves say so
      full('kt_runs');
      const lr = executeCoachTool('log_run', { distance: 5, time: '25:00' });
      switchTab('log'); switchLogSub('run'); openRunLog(); await wait(50);
      document.getElementById('kt-rlog-dist').value = '5'; document.getElementById('kt-rlog-time').value = '25:00'; saveInlineRun();
      ok();
      r.failSave = { coach: lr.ok, err: lr.error, formOpen: runLogOpen, strip: !!runLogConfirmed };
      runLogOpen = false;

      // F. miles: the sport editor leaves untouched fields exactly as stored
      localStorage.setItem('kt_unit_d', 'mi');
      lsSet('kt_sports', [{ id: 801, date: D, type: 'Cycling', duration: 60, data: { distance: 10, avgSpeed: 30.1 }, notes: 'From Apple Health' }]);
      openSportLogEditor(801); await wait(30);
      document.getElementById('sleNotes').value = 'hills'; saveSportLogEdit(801);
      const e1 = getSportLogs().find(x => x.id === 801);
      r.untouched = { d: e1.data.distance, s: e1.data.avgSpeed, notes: e1.notes };
      openSportLogEditor(801); await wait(30);
      document.getElementById('sle_distance').value = '7'; saveSportLogEdit(801);
      r.touched = getSportLogs().find(x => x.id === 801).data.distance;
      localStorage.setItem('kt_unit_d', 'km');
      return r;
    }, [D, at(D, '07:00'), at(D, '09:00'), at(D, '19:00'), at(D, '17:00')]);
    assert(out.restore.runs === '5,5.1' && out.restore.hr162 && out.restore.rides === '55,60' && out.restore.newest === 5.1,
      'after a restore each Health record keeps its own workout; the evening run and ride import: ' + JSON.stringify(out.restore));
    assert(out.moved && out.moved.date === '2026-09-20' && out.afterReset === 1, 'a moved Health ride keeps its identity through Reset import: ' + JSON.stringify([out.moved, out.afterReset]));
    assert(out.half.ledger === 'hk-old,hk-r1' && out.retry.runs === 1 && out.retry.sports === 1, 'a half-failed batch burns only what saved; the retry adds only the ride: ' + JSON.stringify([out.half, out.retry]));
    assert(out.firstFail.cursor === null && out.firstFail.runs === 0 && out.firstRetry.runs === 1 && out.firstRetry.since.every(x => !(x > 0)),
      'a failed first import keeps no cursor, so the retry fetches everything: ' + JSON.stringify([out.firstFail, out.firstRetry]));
    assert(out.manualSwallow === false && out.manualBackdated === true, 'a run typed before the workout is not its twin; one typed after still is: ' + JSON.stringify([out.manualSwallow, out.manualBackdated]));
    assert(out.failSave.coach === false && /Storage is full/.test(out.failSave.err) && out.failSave.formOpen && !out.failSave.strip,
      'failed run saves say so and show no Run saved strip: ' + JSON.stringify(out.failSave));
    assert(out.untouched.d === 10 && out.untouched.s === 30.1 && out.untouched.notes === 'hills' && Math.abs(out.touched - 11.27) < 0.01,
      'the sport editor keeps untouched fields exactly and converts a typed one: ' + JSON.stringify([out.untouched, out.touched]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
