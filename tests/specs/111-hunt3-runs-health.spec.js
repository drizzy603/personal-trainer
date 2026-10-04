// Hunt 3 (2026-10-04), runs, Apple Health and activity logs:
// - H12: an activity logged by hand (a ride, a match) absorbs its Apple Health twin, ledger or
//   not: Import from Health, auto-log and the quick-log card no longer add it a second time,
//   while a workout that began after the hand log was saved still comes in.
// - M37: once a run is logged today, Log › Run still offers "+ Log another run" (a second run or a
//   backfill), and the Health cards hide only for the workout already in the log, not for any
//   run or ride of the day.
// - M47: Progress › Runs reads a legacy time with no colon ('24.30', '30') as minutes, as the day
//   sheet and the run editor do: the all-time avg pace read it as hours (155:30 /km), and the
//   bests and the pace chart skipped or misread it.
// - M28: one run (or ride) written to Health by two apps (Watch + Strava/Garmin: start within a
//   minute, or mostly overlapping, with time and distance agreeing) is one record: a batch keeps
//   the richer copy and burns both UUIDs, auto-log and the card take it once, and a stored copy
//   absorbs the other even while the import ledger exists.
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

run('M37: Log › Run offers another run once one is logged; the Health cards wait only for their own workout', async () => {
  const app = await boot({ native: true, seed: { kt_runs: '[]', kt_sports: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      const scr = () => document.getElementById('screen');
      const more = () => [...scr().querySelectorAll('button')].find(b => /Log another run/.test(b.textContent));
      const fill = (dist, time, date) => {
        const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
        set('kt-rlog-dist', dist); set('kt-rlog-time', time); if (date) set('kt-rlog-date', date);
        document.querySelector('.kt-rlog-save').click();
      };
      switchTab('log'); switchLogSub('run'); await wait(50);
      scr().querySelector('.kt-cta').click(); await wait(50);
      fill('5', '28:00');
      r.saved = { strip: !!scr().querySelector('.kt-rconfirm'), more: !!more() };
      // a second run (backfilled to yesterday) from the strip
      more().click(); await wait(50);
      r.formOpen = !!document.getElementById('kt-rlog-dist');
      const y = addDays(todayISO(), -1);
      fill('8', '45:00', y);
      r.runs = getRuns().map(x => x.date + ' ' + x.distance).sort().join();
      r.expect = [y + ' 8', todayISO() + ' 5'].sort().join();
      // later (the stored-run strip): still a way to log another
      switchTab('progress'); switchTab('log'); switchLogSub('run'); await wait(50);
      r.later = { strip: (scr().querySelector('.kt-rconfirm-t') || {}).textContent || '', more: !!more() };
      // Health: the run already typed in today is not offered again, a different run is
      const mid = new Date(todayISO() + 'T00:00:00').getTime();
      const st = mid + Math.min(30 * 60e3, (Date.now() - mid) / 2);   // today, before the hand log was saved
      const iso = new Date(st).toISOString();
      _hkPendingDismissed = false;
      _hkPendingRun = { uuid: 'twin-1', type: 'run', startDate: iso, distanceKm: 5.02, durationSec: 28 * 60 + 10, avgHr: 150 };
      render(); await wait(30);
      r.twinCard = !!scr().querySelector('[onclick*="logPendingHealthRun"]');
      _hkPendingRun = { uuid: 'other-1', type: 'run', startDate: iso, distanceKm: 10, durationSec: 55 * 60, avgHr: 150 };
      render(); await wait(30);
      r.otherCard = !!scr().querySelector('[onclick*="logPendingHealthRun"]');
      // the + tab and Today's banner: a second ride of the day is offered, the twin of a logged one is not
      lsSet('kt_sports', [{ id: Date.now(), date: todayISO(), type: 'Cycling', duration: 60, data: {}, notes: '' }]);
      _hkPendingRun = { uuid: 'ride-twin', type: 'ride', startDate: iso, distanceKm: 20, durationSec: 61 * 60 };
      r.rideTwin = _healthCardSlot() !== '';
      _hkPendingRun = { uuid: 'ride-2', type: 'ride', startDate: iso, distanceKm: 8, durationSec: 25 * 60 };
      r.rideOther = _healthCardSlot() !== '';
      _hkPendingRun = null; render();
      return r;
    });
    assert(out.saved.strip && out.saved.more, 'the saved strip offers another run: ' + JSON.stringify(out.saved));
    assert(out.formOpen && out.runs === out.expect, 'a second run can be logged and backfilled: ' + out.runs + ' vs ' + out.expect);
    assert(/Run logged/.test(out.later.strip) && out.later.more, 'the logged strip offers another run: ' + JSON.stringify(out.later));
    assert(out.twinCard === false, 'the card does not offer the run already typed in');
    assert(out.otherCard === true, 'the card offers a different Health run on a day with a run logged');
    assert(out.rideTwin === false && out.rideOther === true, 'the sport card: twin hidden, second ride offered: ' + JSON.stringify([out.rideTwin, out.rideOther]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('M47: Progress › Runs reads a legacy time with no colon as minutes (avg pace, bests, pace chart)', async () => {
  const app = await boot({ native: true, seed: { kt_runs: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      const d2 = addDays(todayISO(), -2), d3 = addDays(todayISO(), -3);
      lsSet('kt_runs', [
        { id: 1785000000002, date: d2, distance: 5, time: '24.30', week: weekForDate(d2), note: '', hr: 0, type: 'easy' },   // 24:30, typed before the time field was checked
        { id: 1785000000001, date: d3, distance: 5, time: '25:00', week: weekForDate(d3), note: '', hr: 0, type: 'easy' },
      ]);
      const seen = [], real = window._paceSeries;
      window._paceSeries = arr => { seen.push((arr || []).map(x => x.val)); return real(arr); };
      progressTab = 'runs'; switchTab('progress');
      window._paceSeries = real;
      const txt = document.getElementById('screen').textContent.replace(/\s+/g, ' ');
      return { band: (document.querySelector('.kt-statband') || {}).textContent || '', txt, chart: seen[seen.length - 1] };
    });
    assert(/4:57\s*\/km\s*Avg pace/i.test(out.band), 'avg pace is (25:00 + 24:30) / 10 km = 4:57 /km: ' + out.band);
    assert(/4:54 \/kmbest 5k pace/i.test(out.txt) && /4:54 \/kmfastest pace/i.test(out.txt), 'the legacy run is the best 5k and the fastest pace: ' + (out.txt.match(/Bests.{0,120}/) || [''])[0]);
    assert(JSON.stringify(out.chart) === '[300,294]', 'the pace chart reads 24:30 as 294 s/km: ' + JSON.stringify(out.chart));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('M28: one run written to Health by two apps is one run (batch, auto-log, card, stored copy)', async () => {
  const app = await boot({ native: true, seed: { kt_runs: '[]', kt_sports: '[]' } });
  try {
    await app.page.evaluate(HK_MOCK);
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const yd = new Date(); yd.setDate(yd.getDate() - 1);
      const y = _ymdLocal(yd);
      const at = (h, m, s) => { const d = new Date(y + 'T00:00:00'); d.setHours(h, m, s || 0, 0); return d.getTime(); };
      const iso = ms => new Date(ms).toISOString();
      // the Watch's copy (with heart rate) and Strava's (none), 20 s apart
      const watch = { uuid: 'watch-1', type: 'run', startDate: iso(at(7, 0, 20)), distanceKm: 8.02, durationSec: 44 * 60 + 58, avgHr: 152 };
      const strava = { uuid: 'strava-1', type: 'run', startDate: iso(at(7, 0, 0)), distanceKm: 8.0, durationSec: 45 * 60, avgHr: 0 };
      // Garmin started 3 minutes late and stopped with the others: most of the run overlaps
      const garmin = { uuid: 'garmin-1', type: 'run', startDate: iso(at(7, 3, 0)), distanceKm: 7.5, durationSec: 42 * 60 };
      // the run straight after (no overlap) and an evening run are different runs
      const next = { uuid: 'next-1', type: 'run', startDate: iso(at(7, 46, 0)), distanceKm: 8, durationSec: 45 * 60, avgHr: 150 };
      const eve = { uuid: 'eve-1', type: 'run', startDate: iso(at(18, 0, 0)), distanceKm: 5, durationSec: 27 * 60, avgHr: 160 };
      // two copies of a ride, 30 s apart
      const ride = { uuid: 'ride-w', type: 'ride', startDate: iso(at(12, 0, 30)), distanceKm: 30, durationSec: 3600, avgHr: 140 };
      const rideB = { uuid: 'ride-s', type: 'ride', startDate: iso(at(12, 0, 0)), distanceKm: 30.2, durationSec: 3610 };
      const r = {};
      const day = () => getRuns().filter(x => x.date === y).map(x => x.distance + '@' + x.hr).sort().join();

      // A. a batch import (first connect): one record per run, from the richer copy; every UUID burned
      lsDel('kt_hk_imported'); localStorage.removeItem('kt_hk_last_sync');
      window.__hk = [watch, strava, garmin, next, eve, ride, rideB];
      importFromHealth(); await wait(300);
      r.batch = { runs: day(), rides: getSportLogs().filter(x => x.date === y).map(x => x.duration + '@' + (x.data && x.data.avgHR)).join(),
        ledger: (lsGet('kt_hk_imported') || []).slice().sort().join(), toast: document.getElementById('toast').textContent };

      // B. connected earlier, auto-log: the copies are logged once
      lsSet('kt_runs', []); lsSet('kt_sports', []); lsSet('kt_hk_imported', ['older-1']); localStorage.setItem('kt_hk_last_sync', String(Date.now() - 3 * 864e5));
      localStorage.setItem('kt_autolog_runs', '1');
      window.__hk = [strava, watch, ride, rideB];
      checkRecentHealthRun(Date.now() - 2 * 864e5); await wait(300);
      r.auto = { runs: day(), rides: getSportLogs().length };

      // C. the card offers the richer copy once; after logging it the other is not offered, and logging it is a skipped duplicate
      lsSet('kt_runs', []); lsSet('kt_sports', []); lsSet('kt_hk_imported', ['older-1']);
      localStorage.setItem('kt_autolog_runs', '0'); _hkPendingRun = null; _hkPendingDismissed = false;
      window.__hk = [strava, watch];
      checkRecentHealthRun(Date.now() - 2 * 864e5); await wait(200);
      r.card1 = _hkPendingRun && _hkPendingRun.uuid;
      logPendingHealthRun(); await wait(50);
      _hkPendingRun = null; _hkPendingDismissed = false;
      checkRecentHealthRun(Date.now() - 2 * 864e5); await wait(200);
      r.card2 = _hkPendingRun && _hkPendingRun.uuid;
      r.again = _logHealthRun(strava);
      r.cRuns = day();
      r.cSeen = (lsGet('kt_hk_imported') || []).indexOf('strava-1') >= 0;
      // the rule itself: same start but different runs, back to back, minute-rounded sport logs
      const t = at(7, 0, 0);
      r.rule = [_hkSameActivity(t, 900, 3, t, 1200, 4), _hkSameActivity(t, 1800, 5, t + 1800e3, 1800, 5),
        _hkSameActivity(t, 120, 0, t + 20e3, 90, 0), _hkSameActivity(t, 2700, 8, t + 20e3, 2698, 8.02)];
      return r;
    });
    assert(JSON.stringify(out.rule) === '[false,false,true,true]', 'same activity: different runs at one start, back to back, a rounded 2-min log, copies: ' + JSON.stringify(out.rule));
    assert(out.batch.runs === ['5@160', '8.02@152', '8@150'].sort().join(), 'the batch keeps one record per run, the richer copy: ' + out.batch.runs);
    assert(out.batch.rides === '60@140', 'the two ride copies are one ride, the one with heart rate: ' + out.batch.rides);
    assert(out.batch.ledger === 'eve-1,garmin-1,next-1,ride-s,ride-w,strava-1,watch-1', 'every copy is burned: ' + out.batch.ledger);
    assert(/3 runs · 1 activity imported/.test(out.batch.toast), 'the toast counts runs, not copies: ' + out.batch.toast);
    assert(out.auto.runs === '8.02@152' && out.auto.rides === 1, 'auto-log logs each activity once: ' + JSON.stringify(out.auto));
    assert(out.card1 === 'watch-1' && out.card2 === null, 'the card offers the richer copy, then nothing: ' + JSON.stringify([out.card1, out.card2]));
    assert(out.again === null && out.cSeen && out.cRuns === '8.02@152', 'the other copy is a skipped duplicate: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
