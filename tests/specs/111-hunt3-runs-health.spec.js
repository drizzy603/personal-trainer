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
// - M29: deleting a Health run or activity leaves a tombstone (kt_hk_gone: kind + start time, or
//   date + size for an old import; no UUIDs or readings) that rides in the iCloud copy, so a
//   restore and an import no longer bring deleted workouts back; Undo takes it back, the coach's
//   delete leaves one, Reset import clears them.
// - M35: a pinned sport tab's selects start on "—" (every pickup game was a Win), an empty tap
//   files nothing, and the form starts over after a save so a second tap does not duplicate it.
// - M39: on an activity tab, another activity's "Log +" card opens it (its own tab, or the + tab
//   with it picked; Other for a type outside the catalogue) instead of doing nothing, and a
//   coach-logged type with an apostrophe no longer breaks the card's handler.
// - M55: My Activities counts days between local midnights: today's ride read 'Yesterday' from
//   noon on, and the 2-week count dropped its edge day.
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

run('M29: a Health run or ride the owner deleted stays deleted after a restore from the iCloud copy', async () => {
  const app = await boot({ native: true, seed: { kt_runs: '[]', kt_sports: '[]' } });
  try {
    await app.page.evaluate(HK_MOCK);
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const iso = (daysAgo, h) => { const d = new Date(addDays(todayISO(), -daysAgo) + 'T00:00:00'); d.setHours(h, 0, 0, 0); return d.toISOString(); };
      window.__hk = [
        { uuid: 'r-8', type: 'run', startDate: iso(6, 7), distanceKm: 8, durationSec: 2700, avgHr: 150 },
        { uuid: 'r-5', type: 'run', startDate: iso(4, 7), distanceKm: 5, durationSec: 1650, avgHr: 148 },
        { uuid: 'walk', type: 'run', startDate: iso(3, 12), distanceKm: 1.1, durationSec: 900, avgHr: 100 },
        { uuid: 'junk-ride', type: 'ride', startDate: iso(2, 18), distanceKm: 2, durationSec: 600, avgHr: 95 },
        { uuid: 'old', type: 'run', startDate: iso(5, 9), distanceKm: 3, durationSec: 1000 },
      ];
      const r = {};
      const state = () => ({ runs: getRuns().map(x => x.distance).sort((a, b) => a - b).join(), sports: getSportLogs().length });
      lsDel('kt_hk_imported'); localStorage.removeItem('kt_hk_last_sync');
      importFromHealth(); await wait(300);
      // the 3 km run as an import from before start times were kept
      lsSet('kt_runs', getRuns().map(x => x.distance === 3 ? Object.assign({}, x, { startMs: undefined }) : x));
      const idOf = km => getRuns().find(x => x.distance === km).id;
      // a delete taken back with Undo leaves no tombstone
      deleteRun(idOf(8)); await wait(20);
      document.querySelector('#toast .kt-toast-undo').click(); await wait(20);
      r.undo = { runs: state().runs, gone: (lsGet('kt_hk_gone') || []).length };
      // the misread walk, the old 3 km and the junk ride are deleted
      deleteRun(idOf(1.1)); deleteRun(idOf(3)); deleteSportLog(getSportLogs()[0].id); await wait(20);
      r.tombs = (lsGet('kt_hk_gone') || []).map(t => Object.keys(t).sort().join('')).sort().join(' ');
      // the iCloud copy carries the tombstones but not the ledger; restoring it on a new phone and importing brings nothing back
      const icloud = JSON.parse(_sanitizeForICloud(JSON.stringify(buildBackupJSON())));
      r.icloud = { ledger: 'kt_hk_imported' in icloud, gone: (icloud.kt_hk_gone || []).length };
      delete icloud._manifest;
      _applyImportedData(icloud); await wait(50);
      r.restored = state();
      importFromHealth(); await wait(300);
      r.afterImport = Object.assign(state(), { toast: document.getElementById('toast').textContent });
      // the coach's delete leaves a tombstone too; Reset import clears them with the ledger
      executeCoachTool('delete_log', { store: 'run', id: idOf(5) });
      r.coach = (lsGet('kt_hk_gone') || []).length;
      lsSet('kt_hk_imported', []); localStorage.removeItem('kt_hk_last_sync');
      importFromHealth(); await wait(300);
      r.coachAfter = state().runs;
      resetHealthImport(); document.querySelector('.kt-close-sheet button[id$="ok"]').click(); await wait(50);
      r.reset = lsGet('kt_hk_gone');
      return r;
    });
    assert(out.undo.runs === '1.1,3,5,8' && out.undo.gone === 0, 'Undo of a delete takes its tombstone back: ' + JSON.stringify(out.undo));
    assert(out.tombs === 'dkn ks ks', 'tombstones hold only the kind and the start (or date and size): ' + out.tombs);
    assert(out.icloud.ledger === false && out.icloud.gone === 3, 'the iCloud copy carries the tombstones, not the ledger: ' + JSON.stringify(out.icloud));
    assert(out.restored.runs === '5,8' && out.restored.sports === 0, 'the restore holds what the owner kept: ' + JSON.stringify(out.restored));
    assert(out.afterImport.runs === '5,8' && out.afterImport.sports === 0 && /Already up to date/.test(out.afterImport.toast),
      'importing after the restore brings no deleted workout back: ' + JSON.stringify(out.afterImport));
    assert(out.coach === 4 && out.coachAfter === '8', 'a run the coach deleted stays deleted: ' + JSON.stringify([out.coach, out.coachAfter]));
    assert(out.reset === null, 'Reset import clears the tombstones: ' + JSON.stringify(out.reset));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('M35: a pinned sport tab saves only what was chosen, refuses an empty tap and starts over after a save', async () => {
  const app = await boot({ native: true, seed: { kt_sports: '[]', kt_log_tabs: JSON.stringify(['Basketball', 'run', 'body']) } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      const tap = () => [...document.querySelectorAll('#screen button')].find(b => /^Log Basketball$/.test(b.textContent.trim())).click();
      switchTab('log'); switchLogSub('Basketball'); await wait(50);
      r.selects = [...document.querySelectorAll('#screen select')].map(s => s.id + '=' + s.value).join();
      tap(); await wait(30);
      r.empty = { n: getSportLogs().length, toast: document.getElementById('toast').textContent };
      const y = addDays(todayISO(), -1);
      document.getElementById('spDate').value = y;
      document.getElementById('spDuration').value = '45';
      document.getElementById('sp_points').value = '12';
      document.getElementById('sp_result').value = 'Loss';
      tap(); await wait(30);
      r.saved = getSportLogs().map(l => [l.date === y, l.duration, JSON.stringify(l.data)]);
      r.form = ['spDuration', 'sp_points', 'sp_result', 'sp_gameType', 'spNotes'].map(id => document.getElementById(id).value).join('|') + ' date:' + (document.getElementById('spDate').value === todayISO());
      tap(); await wait(30);   // a second tap on the cleared form files nothing
      r.after = getSportLogs().length;
      return r;
    });
    assert(out.selects === 'sp_result=,sp_gameType=', 'selects start on "—": ' + out.selects);
    assert(out.empty.n === 0 && /Add a duration or a detail/.test(out.empty.toast), 'an empty tap files nothing: ' + JSON.stringify(out.empty));
    assert(JSON.stringify(out.saved) === JSON.stringify([[true, 45, '{"result":"Loss","points":12}']]), 'the save holds only what was chosen: ' + JSON.stringify(out.saved));
    assert(out.form === '|||| date:true', 'the form starts over after a save: ' + out.form);
    assert(out.after === 1, 'a second tap does not file the log again: ' + out.after);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('M39: an activity card opens its activity from another activity tab; a type with an apostrophe is safe', async () => {
  const app = await boot({ native: true, seed: { kt_sports: '[]', kt_log_tabs: JSON.stringify(['Cycling', 'Tennis', 'run']) } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const d = addDays(todayISO(), -1);
      lsSet('kt_sports', [
        { id: 1785000000003, date: d, type: 'Yoga', duration: 30, data: {}, notes: '' },
        { id: 1785000000002, date: d, type: 'Tennis', duration: 60, data: {}, notes: '' },
        { id: 1785000000001, date: d, type: 'Cycling', duration: 50, data: {}, notes: '' },
      ]);
      executeCoachTool('log_sport', { type: "Women's Rugby", duration: 80, date: d });
      const r = {};
      const card = t => [...document.querySelectorAll('#screen .kt-actcard')].find(c => c.getAttribute('data-sport') === t);
      const at = () => logSubTab + '/' + logSportType;
      switchTab('log'); switchLogSub('Cycling'); await wait(50);
      r.names = [...document.querySelectorAll('#screen .kt-actcard')].map(c => c.getAttribute('data-sport') + '=' + c.children[1].textContent).sort().join();
      card('Cycling').click(); await wait(30); r.own = at();
      card('Tennis').click(); await wait(30); r.pinned = at();
      switchLogSub('Cycling'); await wait(30);
      card('Yoga').click(); await wait(30); r.unpinned = at() + (sportTabPicked ? ' picked' : '');
      switchLogSub('Cycling'); await wait(30);
      card("Women's Rugby").click(); await wait(30); r.custom = at();
      return r;
    });
    assert(out.names === "Cycling=Cycling,Tennis=Tennis,Women's Rugby=Women's Rugby,Yoga=Yoga", 'cards carry and show the type as text: ' + out.names);
    assert(out.own === 'Cycling/Cycling', 'the tab\'s own card stays put: ' + out.own);
    assert(out.pinned === 'Tennis/Tennis', 'a pinned activity\'s card opens its tab: ' + out.pinned);
    assert(out.unpinned === 'sport/Yoga picked', 'another activity\'s card opens the + tab with it picked: ' + out.unpinned);
    assert(out.custom === 'sport/Other', 'an activity outside the catalogue opens as Other: ' + out.custom);
    assert(app.errors.length === 0, 'no page errors (the apostrophe used to throw): ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('M55: My Activities says Today for today\'s activity in the afternoon, and counts the 2-week edge day', async () => {
  const app = await boot({ native: true, seed: { kt_sports: '[]', kt_log_tabs: JSON.stringify(['Cycling', 'run', 'body']) } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const t = todayISO();
      lsSet('kt_sports', [
        { id: 1785000000004, date: t, type: 'Cycling', duration: 45, data: {}, notes: '' },
        { id: 1785000000003, date: addDays(t, -1), type: 'Yoga', duration: 30, data: {}, notes: '' },
        { id: 1785000000002, date: addDays(t, -14), type: 'Yoga', duration: 30, data: {}, notes: '' },
      ]);
      // The wall clock at a given local hour of today (the page reads Date when it renders).
      const RealDate = Date;
      const at = h => { const d = new RealDate(t + 'T00:00:00'); d.setHours(h, 30, 0, 0); return d.getTime(); };
      const clock = ms => {
        const off = ms - RealDate.now();
        function FakeDate(...a) { if (!(this instanceof FakeDate)) return new RealDate(RealDate.now() + off).toString(); return a.length ? new RealDate(...a) : new RealDate(RealDate.now() + off); }
        FakeDate.prototype = RealDate.prototype; FakeDate.now = () => RealDate.now() + off; FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
        window.Date = FakeDate;
      };
      const read = () => [...document.querySelectorAll('#screen .kt-actcard')].map(c => c.getAttribute('data-sport') + ':' + c.querySelector('.kt-actcard-when').textContent + ':' + (/(\d+)× last 2 wks/.exec(c.textContent) || [0, 0])[1]).sort().join(' ');
      const r = {};
      switchTab('log'); switchLogSub('Cycling');
      for (const h of [9, 15, 23]) { clock(at(h)); render(); await wait(20); r['h' + h] = read(); }
      window.Date = RealDate; render();
      return r;
    });
    const want = 'Cycling:Today:1 Yoga:Yesterday:2';
    assert(out.h9 === want && out.h15 === want && out.h23 === want, 'the cards read the same at 09:30, 15:30 and 23:30: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
