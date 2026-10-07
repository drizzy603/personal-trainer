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
// - M03: no log is filed ahead of today, as runs already were: the runner's finish (its date
//   field stops at today), the coach's log_session / log_sport / log_bodyweight, the + tab, the
//   pinned activity form, the activity editor, the day sheet's typed date, weigh-ins.
// - M44: activity tabs (Recent, My Activities, the pinned form's custom fields, the + tab's wells,
//   the coach's day note) and Progress › Sports show notes, opponents, WODs, types and custom
//   field labels / options / placeholders as text: "<Mike>" vanished and coach markup ran.
// - L29: a pace goal is "m:ss" in the unit on screen or nothing, from Progress › Runs, the Run
//   tab's goal line and the coach's set_run_goal ('9:00/mi' was stored as typed and read as
//   9:00 per km); paceToSec reads only a stored pace.
// - L30: the run review's VS RECENT heading names the distance in miles for a mile owner
//   (a 10 mi run read 'VS RECENT 16KS').
// - L31: with no programme, Log › Run plans no run (no "Easy run today", no coach run card, no
//   THIS WEEK list) and the widget summary carries no days and hasPlan:false, so the widget
//   asks to set up a plan instead of showing the hard-coded fallback week.
// - L32: before week 1 begins, Log › Run says when it starts (as Today's STARTS MON), offers
//   "Log a run" rather than today's run, and lists WEEK 1 with no day marked today.
// - Extra (found while fixing L32, in no cluster's list): the coach's run note in the Log › Run
//   hero body was inserted as HTML; the hero body is plain text now.
// Regressions and incomplete fixes from the 2026-10-06 review (_hkPlan reads a whole fetch):
// - R45: a hand log stands for the workout of its day it fits best, not the first within 15%;
//   one with no duration only on a day with one workout of its kind; identity comes first.
// - R46: a deleted Health run or ride does not come back as another app's copy: auto-log and the
//   card burn the copies with the one they log, and an activity is buried when any copy is.
// - R47: a run or ride typed in by hand that two apps also wrote to Health comes in from neither.
// - R48: auto-log and the quick-log card read their fetch whole too: one hand log no longer hides
//   every workout of its kind that day.
// - R49: a first import compares each workout only with the ones that began near it.
const { boot, assert, run, SEED } = require('../lib/harness');

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

run('M03: nothing is filed ahead of today (runner, coach logs, activity forms and editor, day sheet moves, body)', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]', kt_sports: '[]', kt_runs: '[]', kt_log_tabs: JSON.stringify(['Cycling', 'run', 'body']) } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const t = todayISO(), tm = addDays(t, 1), y = addDays(t, -1);
      const toast = () => document.getElementById('toast').textContent;
      const r = {};
      // the runner: a slipped date wheel is refused and the workout stays open to fix it
      openDeckRunner('Push'); runnerCompleteSet();
      r.runnerMax = /id="runner-date"[^>]*max="(\d{4}-\d{2}-\d{2})"/.exec(_renderRunnerDoneBody(runnerSession.exercises[0], true));
      r.runnerMax = r.runnerMax && r.runnerMax[1] === t;
      runnerSessionDate = tm; runnerFinishSession();
      r.runner = { filed: getSessions().length, open: !!runnerSession && runnerOpen, toast: toast() };
      runnerSessionDate = null; runnerFinishSession();
      r.runnerToday = getSessions().map(s => s.date).join();
      closeDeckRunner && closeDeckRunner();
      // the coach's log tools refuse a future date, as log_run does
      const ex = [{ name: 'Bench Press', sets: 3, reps: 8, weight: 185 }];
      r.coach = [executeCoachTool('log_session', { type: 'Push', date: tm, exercises: ex }), executeCoachTool('log_sport', { type: 'Cycling', duration: 40, date: tm }),
        executeCoachTool('log_bodyweight', { weight: 180, date: tm }), executeCoachTool('log_run', { distance: 5, time: '25:00', date: tm })].map(x => x.ok);
      r.coachToday = executeCoachTool('log_sport', { type: 'Cycling', duration: 40, date: y }).ok;
      r.coachStored = { s: getSessions().filter(s => s.date === tm).length, sp: getSportLogs().filter(s => s.date === tm).length, bw: getBodyWeights().filter(b => b.date === tm).length };
      // the + tab form and the pinned tab's form
      switchTab('log'); switchLogSub('sport'); pickSport('Yoga'); await wait(30);
      r.plusMax = (document.querySelector('.kt-sport-date') || {}).max === t;
      sportLogDraft.duration = '30'; sportLogDraft.date = tm; saveSportEditorial();
      r.plus = { n: getSportLogs().length, toast: toast() };
      switchLogSub('Cycling'); await wait(30);
      r.pinMax = document.getElementById('spDate').max === t;
      document.getElementById('spDate').value = tm; document.getElementById('spDuration').value = '45';
      saveSportLog();
      r.pin = { n: getSportLogs().length, toast: toast() };
      // the activity editor
      const sid = getSportLogs()[0].id;
      openSportLogEditor(sid); await wait(20);
      r.edMax = document.getElementById('sleDate').max === t;
      document.getElementById('sleDate').value = tm; saveSportLogEdit(sid);
      r.ed = { date: getSportLogs()[0].date, open: !!document.getElementById('sportLogEditOverlay') };
      closeSportLogEditor();
      // the day sheet's typed date
      lsSet('kt_runs', [{ id: 1785000000009, date: y, distance: 5, time: '25:00', week: weekForDate(y), note: '', hr: 0, type: 'easy' }]);
      const sessId = getSessions()[0].id;
      moveRun(1785000000009, tm); moveSession(sessId, tm); moveSport(sid, tm);
      r.moves = { run: getRuns()[0].date === y, sess: getSessions()[0].date === t, sport: getSportLogs()[0].date === y, toast: toast() };
      moveRun(1785000000009, addDays(t, -2));
      r.moveBack = getRuns()[0].date === addDays(t, -2);
      // body weight and measurements
      switchLogSub('body'); await wait(30);
      const n0 = getBodyWeights().length;
      document.getElementById('bwVal').value = '181'; document.getElementById('bwDate').value = tm; saveBodyWeight();
      r.bw = getBodyWeights().length - n0;
      r.t = t; r.tm = tm;
      return r;
    });
    assert(out.runnerMax, 'the runner\'s date field stops at today');
    assert(out.runner.filed === 0 && out.runner.open && /earlier date/.test(out.runner.toast), 'a workout dated ahead is refused and stays open: ' + JSON.stringify(out.runner));
    assert(out.runnerToday === out.t, 'the same workout files on today: ' + out.runnerToday);
    assert(JSON.stringify(out.coach) === '[false,false,false,false]' && out.coachToday === true, 'the coach\'s log tools refuse a future date: ' + JSON.stringify(out.coach));
    assert(out.coachStored.s + out.coachStored.sp + out.coachStored.bw === 0, 'nothing was stored ahead: ' + JSON.stringify(out.coachStored));
    assert(out.plusMax && out.plus.n === 1 && /earlier date/.test(out.plus.toast), 'the + tab refuses a future date: ' + JSON.stringify(out.plus));
    assert(out.pinMax && out.pin.n === 1 && /earlier date/.test(out.pin.toast), 'the pinned tab refuses a future date: ' + JSON.stringify(out.pin));
    assert(out.edMax && out.ed.open && out.ed.date !== out.tm, 'the editor refuses a future date and stays open: ' + JSON.stringify(out.ed));
    assert(out.moves.run && out.moves.sess && out.moves.sport && /earlier date/.test(out.moves.toast), 'a typed future date moves nothing: ' + JSON.stringify(out.moves));
    assert(out.moveBack, 'a past date still moves the run');
    assert(out.bw === 0, 'a weigh-in ahead is refused');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('M44: activity tabs show notes, opponents, WODs, types and custom fields as text, never markup', async () => {
  const XSS = '<img src=x onerror="window.__ran=(window.__ran||0)+1">';
  const app = await boot({ native: true, seed: {
    kt_sports: '[]', kt_log_tabs: JSON.stringify(['Cycling', 'run', 'body']),
    kt_sport_fields: JSON.stringify({
      Cycling: [{ id: 'c_waves', label: '<i>Waves</i>', type: 'select', opts: ['<u>Big</u>', 'Small'] }, { id: 'c_cad', label: 'Cadence', type: 'number', unit: '<s>rpm</s>', ph: '"9" <b>' }],
      Yoga: [{ id: 'c_mood', label: '<i>Mood</i> & feel', type: 'text', ph: '<b>calm</b>' }],
    }) } });
  try {
    const out = await app.page.evaluate(async (XSS) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const d = addDays(todayISO(), -1);
      lsSet('kt_sports', [
        { id: 1785000000005, date: d, type: 'Cycling', duration: 45, data: { c_waves: '<u>Big</u>' }, notes: 'Rode with <Mike> and Sam ' + XSS },
        { id: 1785000000004, date: d, type: 'Pickleball', duration: 60, data: { setsWon: 2, setsLost: 1, opponent: 'Tom & Ana <the twins>' }, notes: '' },
        { id: 1785000000003, date: d, type: 'CrossFit', duration: 20, data: { wodName: '<b>Fran</b>', score: '3:10' + XSS }, notes: '' },
        { id: 1785000000002, date: d, type: '<b>Rugby</b>' + XSS, duration: 80, data: {}, notes: '' },
      ]);
      // a coach-written note on this week's Cycling day
      const cr = getCustomRoutine(), wk = cr.weeks[currentWeek - 1];
      wk.sports = Object.assign({}, wk.sports || {}, { Mon: { type: 'Cycling', note: 'Spin <b>easy</b>' + XSS } });
      setCustomRoutine(cr);
      const scr = () => document.getElementById('screen');
      // elements built from the logged text (the page's own <b>s say other things)
      const tags = () => scr().querySelectorAll('img[src="x"]').length +
        [...scr().querySelectorAll('i, u, s, b')].filter(e => /^(Waves|Big|rpm|Fran|Rugby|easy|calm|Mood)$/.test(e.textContent.trim())).length;
      const r = { pages: {} };
      switchTab('log'); switchLogSub('Cycling'); await wait(50);
      r.pages.cycling = { tags: tags(), text: scr().textContent };
      switchLogSub('sport'); pickSport('Yoga'); await wait(50);
      r.pages.plus = { tags: tags(), text: scr().textContent, ph: (scr().querySelector('.kt-sport-well-input[placeholder*="calm"]') || {}).placeholder || '' };
      progressTab = 'sports'; switchTab('progress'); await wait(50);
      r.pages.progress = { tags: tags(), text: scr().textContent };
      progressTab = 'lifts';
      r.ran = window.__ran || 0;
      return r;
    }, XSS);
    const c = out.pages.cycling, p = out.pages.plus, g = out.pages.progress;
    assert(out.ran === 0, 'no logged or coach-written markup runs: ' + out.ran);
    assert(c.tags === 0 && p.tags === 0 && g.tags === 0, 'no element is made from log text: ' + JSON.stringify([c.tags, p.tags, g.tags]));
    assert(c.text.includes('Rode with <Mike> and Sam') && c.text.includes('vs Tom & Ana <the twins>'), 'notes and opponents read as typed on the activity tab');
    assert(c.text.includes('<b>Rugby</b>') && c.text.includes('<b>Fran</b>'), 'types and WOD names read as typed in the cards and Recent');
    assert(c.text.includes('<I>WAVES</I>') || c.text.includes('<i>Waves</i>'), 'a custom field label reads as typed on the pinned form');
    assert(c.text.includes('<u>Big</u>') && c.text.includes('Spin <b>easy</b>'), 'custom options and the coach\'s day note read as typed');
    assert(p.text.includes('<I>MOOD</I> & FEEL') && p.ph === '<b>calm</b>', 'the + tab well label and placeholder read as typed: ' + p.ph);
    assert(g.text.includes('<b>Fran</b>') && g.text.includes('<b>Rugby</b>'), 'Progress › Sports shows the WOD and the type as typed');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L29: a pace goal is "m:ss" in the unit on screen or nothing (Progress › Runs, the Run tab, the coach)', async () => {
  const app = await boot({ native: true, seed: { kt_unit_d: 'mi', kt_run_goal: '9:00/mi' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      // a goal stored as typed by an older page is no pace at all (it read as 9:00 per km)
      r.legacy = paceToSec(getRunGoal());
      r.legacyChip = /GOAL /.test(renderRunReview(1.609344, '9:30'));
      progressTab = 'runs'; switchTab('progress'); await wait(50);
      const set = v => { const el = [...document.querySelectorAll('#screen input[type="text"]')].find(i => i.placeholder === '6:00'); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
      localStorage.removeItem('kt_run_goal');
      set('9:00/mi'); await wait(20);
      r.typedUnit = { stored: localStorage.getItem('kt_run_goal'), toast: document.getElementById('toast').textContent };
      set('abc'); await wait(20);
      r.typedText = localStorage.getItem('kt_run_goal');
      set('9:00'); await wait(20);
      r.ok = { stored: localStorage.getItem('kt_run_goal'), sec: paceToSec(getRunGoal()) };
      // a run of a mile in 9:30 is slower than the 9:00 /mi goal
      r.chip = (/GOAL [^<]*/.exec(renderRunReview(1.609344, '9:30')) || [''])[0];
      // the Run tab's goal line and the coach take the same rule
      commitRunGoal({ target: { value: 'quick' } });
      r.line = localStorage.getItem('kt_run_goal');
      r.coach = [executeCoachTool('set_run_goal', { pace: 'fast' }).ok, localStorage.getItem('kt_run_goal'), executeCoachTool('set_run_goal', { pace: '8:30' }).ok];
      progressTab = 'lifts';
      return r;
    });
    assert(out.legacy === 0 && out.legacyChip === false, 'a stored "9:00/mi" is not read as 9:00 per km: ' + JSON.stringify([out.legacy, out.legacyChip]));
    assert(out.typedUnit.stored === null && /5:30/.test(out.typedUnit.toast), 'typing "9:00/mi" is refused with a hint: ' + JSON.stringify(out.typedUnit));
    assert(out.typedText === null, 'text that is no pace is never stored');
    assert(out.ok.stored === '5:35.5' && Math.abs(out.ok.sec - 335.5) < 0.01, '9:00 per mile is stored per km: ' + JSON.stringify(out.ok));
    assert(/9:00 → 9:30 · \+30 S\/MI/.test(out.chip), 'the review compares in miles: ' + out.chip);
    assert(out.line === '5:35.5', 'the Run tab\'s goal line keeps the goal when the text is no pace: ' + out.line);
    assert(out.coach[0] === false && out.coach[1] === '5:35.5' && out.coach[2] === true, 'the coach\'s set_run_goal takes only a pace: ' + JSON.stringify(out.coach));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L30: the run review heading names the distance in the owner\'s unit', async () => {
  const app = await boot({ native: true, seed: { kt_runs: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      const d1 = addDays(todayISO(), -7), d2 = addDays(todayISO(), -14);
      lsSet('kt_runs', [
        { id: 1785000000001, date: d1, distance: 16.09, time: '1:30:00', week: weekForDate(d1), note: '', hr: 0, type: 'long' },
        { id: 1785000000002, date: d2, distance: 16.2, time: '1:31:10', week: weekForDate(d2), note: '', hr: 0, type: 'long' },
      ]);
      const head = () => { const m = /kt-ledger-hd"><span class="l">([^<]*)</.exec(renderRunReview(16.09, '1:28:00')); return m && m[1]; };
      const r = { km: head() };
      localStorage.setItem('kt_unit_d', 'mi');
      r.mi = head();
      localStorage.setItem('kt_unit_d', 'km');
      return r;
    });
    assert(out.km === 'VS RECENT 16KS', 'km owners read kilometres: ' + out.km);
    assert(out.mi === 'VS RECENT 10 MI', 'mile owners read miles: ' + out.mi);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L31: with no programme, Log › Run plans no run and the widget shows no week', async () => {
  const app = await boot({ native: true, seed: { kt_routine: 'null', kt_runs: '[]', kt_log_tabs: 'null' } });
  try {
    const out = await app.page.evaluate(async (seedRoutine) => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      const widget = () => {
        const sent = []; const real = Capacitor.Plugins.TrovoWidget.updateSummary;
        Capacitor.Plugins.TrovoWidget.updateSummary = a => { sent.push(JSON.parse(a.json)); return Promise.resolve({}); };
        _lastNativeSummary = null; _runNativeSync();
        Capacitor.Plugins.TrovoWidget.updateSummary = real;
        return sent[0] ? { days: sent[0].days.length, hasPlan: sent[0].hasPlan } : null;
      };
      switchTab('log'); switchLogSub('run'); await wait(50);
      const scr = document.getElementById('screen');
      // on a day the fallback week calls a run day, no coach run card either
      const realAct = window.getTodayActivity;
      window.getTodayActivity = () => ({ type: 'run', dayName: 'Run', weekday: 'Tuesday', km: 0, hr: 150, note: '' });
      render(); await wait(20);
      const coach = !!scr.querySelector('.kt-coach-card');
      window.getTodayActivity = realAct; render(); await wait(20);
      r.none = { focus: getRunFocus(), runs: getThisWeekRuns().length, coach: coach,
        list: /THIS WEEK/.test(scr.textContent), hero: (scr.querySelector('.kt-hero') || {}).textContent || '', widget: widget() };
      // with a programme the plan comes back
      setCustomRoutine(JSON.parse(seedRoutine)); render(); await wait(30);
      r.plan = { widget: widget() };
      return r;
    }, SEED.kt_routine).catch(e => ({ err: String(e) }));
    assert(!out.err, out.err);
    assert(out.none.focus === null && out.none.runs === 0, 'no planned run without a programme: ' + JSON.stringify(out.none));
    assert(!out.none.coach && !out.none.list, 'no coach run card and no THIS WEEK list: ' + JSON.stringify(out.none));
    assert(/No programme yet/.test(out.none.hero) && !/today/i.test(out.none.hero), 'the hero says there is no programme: ' + out.none.hero);
    assert(out.none.widget && out.none.widget.days === 0 && out.none.widget.hasPlan === false, 'the widget gets no week: ' + JSON.stringify(out.none.widget));
    assert(out.plan.widget && out.plan.widget.days === 7 && out.plan.widget.hasPlan === true, 'with a programme the widget gets the week: ' + JSON.stringify(out.plan.widget));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('L32: before week 1 begins, Log › Run says when it starts and plans no run today', async () => {
  const app = await boot({ native: true, seed: { kt_runs: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const dow = (new Date().getDay() + 6) % 7;
      // week 1 has a 5 km run on today's weekday, and begins next Monday
      const cr = getCustomRoutine(), w1 = cr.weeks[0];
      const plan = ['Push', 'Rest', 'Pull', 'Rest', 'Legs', 'Rest', 'Rest']; plan[dow] = 'Run';
      w1.weekPlan = plan; w1.runs = {}; w1.runs[DOW_NAMES[dow]] = { km: 5, type: 'easy' };
      setCustomRoutine(cr);
      const scr = () => document.getElementById('screen');
      const read = () => ({ hero: (scr().querySelector('.kt-hero') || {}).textContent || '', cta: (scr().querySelector('.kt-cta') || {}).textContent || '',
        list: (scr().querySelector('.kt-run-row') ? scr().querySelector('.kt-marquee-hd').textContent : ''), today: !!scr().querySelector('.kt-marquee-idx.main') });
      localStorage.setItem('kt_week', '1'); currentWeek = 1;
      localStorage.setItem('kt_week_monday', addDays(_mostRecentMonday(), 7));
      switchTab('log'); switchLogSub('run'); await wait(50);
      const r = { pre: read(), started: _programmeStarted() };
      // once week 1 is under way, today's run is today's again
      localStorage.setItem('kt_week_monday', _mostRecentMonday()); render(); await wait(30);
      r.on = read();
      return r;
    });
    assert(out.started === false, 'the programme has not started');
    assert(/Week 1 starts(tomorrow|Monday)\./.test(out.pre.hero) && !/today/i.test(out.pre.hero), 'the hero says when week 1 starts: ' + out.pre.hero);
    assert(/Log a run/.test(out.pre.cta) && !/Start run/.test(out.pre.cta), 'the CTA logs a run, it does not start today\'s: ' + out.pre.cta);
    assert(out.pre.list === 'WEEK 1' && out.pre.today === false, 'the list is week 1 with no day marked today: ' + JSON.stringify(out.pre));
    assert(/today\./.test(out.on.hero) && /Start run/.test(out.on.cta) && out.on.list === 'THIS WEEK' && out.on.today, 'once started, today\'s run is today\'s: ' + JSON.stringify(out.on));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('extra (found with L32): the coach\'s run note in the Log › Run hero shows as text', async () => {
  const app = await boot({ native: true, seed: { kt_runs: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const dow = (new Date().getDay() + 6) % 7;
      const cr = getCustomRoutine(), w = cr.weeks[currentWeek - 1];
      const plan = ['Push', 'Rest', 'Pull', 'Rest', 'Legs', 'Rest', 'Rest']; plan[dow] = 'Run';
      w.weekPlan = plan; w.runs = {}; w.runs[DOW_NAMES[dow]] = { km: 5, note: 'Strides <b>x6</b> <img src=x onerror="window.__ran=(window.__ran||0)+1">' };
      setCustomRoutine(cr);
      switchTab('log'); switchLogSub('run'); await wait(80);
      const hero = document.querySelector('#screen .kt-hero-body');
      return { ran: window.__ran || 0, tags: hero.querySelectorAll('b, img').length, text: hero.textContent };
    });
    assert(out.ran === 0 && out.tags === 0 && /Strides <b>x6<\/b>/.test(out.text), 'the note reads as written and runs nothing: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R45 (regression of H12): a hand-logged activity took the first workout of its day within 15%
// (any, with no duration): the match it was typed for came in again and the other was burned
// without ever being imported, for good. It now takes the one it fits best.
run('R45: a hand log stands for the workout it fits best; the day\'s other one is imported', async () => {
  const app = await boot({ native: true, seed: { kt_sports: '[]', kt_runs: '[]' } });
  try {
    await app.page.evaluate(HK_MOCK);
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const y = addDays(todayISO(), -1);
      const at = (h, m) => { const d = new Date(y + 'T00:00:00'); d.setHours(h, m, 0, 0); return d.getTime(); };
      const iso = ms => new Date(ms).toISOString();
      const health = x => x === 'From Apple Health';
      const show = () => getSportLogs().map(l => l.type + ' ' + l.duration + ' ' + (health(l.notes) ? 'Health@' + new Date(l.startMs).getHours() : l.notes || JSON.stringify(l.data))).sort().join(' | ');
      const led = () => (lsGet('kt_hk_imported') || []).filter(u => u !== 'older-1').sort().join();
      const toast = () => document.getElementById('toast').textContent;
      const ledger = on => {
        if (on) { lsSet('kt_hk_imported', ['older-1']); localStorage.setItem('kt_hk_last_sync', String(Date.now() - 3 * 864e5)); }
        else { lsDel('kt_hk_imported'); localStorage.removeItem('kt_hk_last_sync'); }
      };
      const r = {};
      // tennis at 9:00 (55 min) and 16:00 (60 min); 'Singles, 60 min' typed in at 18:00: first
      // connect and connected before
      for (const L of [false, true]) {
        lsSet('kt_sports', [{ id: at(18, 0), date: y, type: 'Tennis', duration: 60, data: {}, notes: 'Singles' }]);
        ledger(L);
        window.__hk = [{ uuid: 'tennis-am', type: 'Tennis', startDate: iso(at(9, 0)), durationSec: 55 * 60, avgHr: 130 },
                       { uuid: 'tennis-pm', type: 'Tennis', startDate: iso(at(16, 0)), durationSec: 60 * 60, avgHr: 135 }];
        importFromHealth(); await wait(300);
        const k = L ? 'ledger' : 'first';
        r[k] = { logs: show(), ledger: led(), toast: toast() };
        importFromHealth(); await wait(300);
        r[k].again = toast();
      }
      // 'Win, 18 pts' with no duration, typed in at 21:00: on a day with two games it stands for
      // neither (both come in), on a day with one it stands for that one
      const bb = () => lsSet('kt_sports', [{ id: at(21, 0), date: y, type: 'Basketball', duration: 0, data: { result: 'Win', points: 18 }, notes: '' }]);
      const pm = { uuid: 'bb-pm', type: 'Basketball', startDate: iso(at(19, 0)), durationSec: 95 * 60, avgHr: 140 };
      bb(); ledger(true);
      window.__hk = [{ uuid: 'bb-am', type: 'Basketball', startDate: iso(at(9, 0)), durationSec: 25 * 60, avgHr: 120 }, pm];
      importFromHealth(); await wait(300);
      r.two = { logs: show(), ledger: led() };
      bb(); ledger(true);
      window.__hk = [pm];
      importFromHealth(); await wait(300);
      r.one = { logs: show(), ledger: led(), toast: toast() };
      // no ledger: the 9:00 match keeps its own Health record, so the hand log stored ahead of it
      // stands for the 15:00 match and nothing comes in twice
      lsSet('kt_sports', [{ id: at(16, 30), date: y, type: 'Tennis', duration: 60, data: {}, notes: 'hand' },
                          { id: at(10, 30), startMs: at(9, 0), date: y, type: 'Tennis', duration: 62, data: {}, notes: 'From Apple Health' }]);
      ledger(false);
      window.__hk = [{ uuid: 't9', type: 'Tennis', startDate: iso(at(9, 0)), durationSec: 62 * 60, avgHr: 130 },
                     { uuid: 't15', type: 'Tennis', startDate: iso(at(15, 0)), durationSec: 60 * 60, avgHr: 135 }];
      importFromHealth(); await wait(300);
      r.identity = { logs: show(), ledger: led(), toast: toast() };
      // runs too: two 5 km runs, the evening one typed in by hand
      lsSet('kt_sports', []);
      lsSet('kt_runs', [{ id: at(19, 0), date: y, distance: 5, time: '26:00', week: weekForDate(y), note: 'evening', hr: 0, type: 'easy' }]);
      ledger(true);
      window.__hk = [{ uuid: 'r-am', type: 'run', startDate: iso(at(7, 0)), distanceKm: 5, durationSec: 25 * 60, avgHr: 150 },
                     { uuid: 'r-pm', type: 'run', startDate: iso(at(18, 0)), distanceKm: 5, durationSec: 26 * 60, avgHr: 152 }];
      importFromHealth(); await wait(300);
      r.runs = { runs: getRuns().map(x => x.time + ' ' + (health(x.note) ? 'Health@' + new Date(x.startMs).getHours() : x.note)).sort().join(' | '), ledger: led() };
      return r;
    });
    for (const k of ['first', 'ledger']) {
      const o = out[k];
      assert(o.logs === 'Tennis 55 Health@9 | Tennis 60 Singles', k + ': the 16:00 match is the one typed in; the 9:00 match is imported: ' + o.logs);
      assert(o.ledger === 'tennis-am,tennis-pm' && /1 activity imported/.test(o.toast) && /Already up to date/.test(o.again), k + ': both are burned, once: ' + JSON.stringify(o));
    }
    assert(out.two.logs === 'Basketball 0 {"result":"Win","points":18} | Basketball 25 Health@9 | Basketball 95 Health@19' && out.two.ledger === 'bb-am,bb-pm',
      'a log with no duration takes neither of two games: ' + JSON.stringify(out.two));
    assert(out.one.logs === 'Basketball 0 {"result":"Win","points":18}' && out.one.ledger === 'bb-pm' && /Already up to date/.test(out.one.toast),
      'it stands for the day\'s only game: ' + JSON.stringify(out.one));
    assert(out.identity.logs === 'Tennis 60 hand | Tennis 62 Health@9' && out.identity.ledger === 't15,t9' && /Already up to date/.test(out.identity.toast),
      'a stored Health record keeps its own workout before a hand log is weighed: ' + JSON.stringify(out.identity));
    assert(out.runs.runs === '25:00 Health@7 | 26:00 evening' && out.runs.ledger === 'r-am,r-pm', 'a hand-logged run takes its own run, the other comes in: ' + JSON.stringify(out.runs));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R46 (M28 with M29): auto-log and the card burned only the copy they logged, and a tombstone
// covers a start within a minute: once the run or ride was deleted, the other app's copy (started
// 3 min later) came back on the next check, and after an iCloud restore an import brought it in.
run('R46: a deleted Health run or ride does not come back as its other copy', async () => {
  const app = await boot({ native: true, seed: { kt_sports: '[]', kt_runs: '[]' } });
  try {
    await app.page.evaluate(HK_MOCK);
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const y = addDays(todayISO(), -1);
      const at = (h, m) => { const d = new Date(y + 'T00:00:00'); d.setHours(h, m, 0, 0); return d.getTime(); };
      const iso = ms => new Date(ms).toISOString();
      const watch = { uuid: 'watch-1', type: 'run', startDate: iso(at(7, 0)), distanceKm: 8.0, durationSec: 45 * 60, avgHr: 152 };
      const garmin = { uuid: 'garmin-1', type: 'run', startDate: iso(at(7, 3)), distanceKm: 7.6, durationSec: 42 * 60 };
      const rideW = { uuid: 'ride-w', type: 'ride', startDate: iso(at(12, 0)), distanceKm: 30, durationSec: 60 * 60, avgHr: 140 };
      const rideG = { uuid: 'ride-g', type: 'ride', startDate: iso(at(12, 4)), distanceKm: 29, durationSec: 56 * 60 };
      const state = () => getRuns().map(x => x.distance + '@' + x.hr).join() + ' / ' + getSportLogs().map(x => x.type + ' ' + x.duration).join();
      const led = () => (lsGet('kt_hk_imported') || []).filter(u => u !== 'older-1').sort().join();
      const toast = () => document.getElementById('toast').textContent;
      const delAll = async () => { deleteRun(getRuns()[0].id); deleteSportLog(getSportLogs()[0].id); await wait(30); };
      const check = async () => { _hkPendingRun = null; _hkPendingDismissed = false; checkRecentHealthRun(Date.now() - 2 * 864e5); await wait(300); };
      const r = {};
      // A. connected, auto-log on: the Watch copies are logged, the late ones burned with them
      lsSet('kt_hk_imported', ['older-1']); localStorage.setItem('kt_hk_last_sync', String(Date.now() - 3 * 864e5));
      localStorage.setItem('kt_autolog_runs', '1');
      window.__hk = [rideG, rideW, garmin, watch];
      await check();
      r.auto = { state: state(), ledger: led() };
      await delAll();
      await check();
      r.afterDelete = state();
      window.__hk = [rideG, garmin];   // the Watch copies gone from Health: the others stay burned
      await check();
      r.alone = state();
      importFromHealth(); await wait(300);
      r.aloneImport = { state: state(), toast: toast() };
      // B. the card: logging the Watch copy burns the late one too
      lsSet('kt_hk_imported', ['older-1']); lsDel('kt_hk_gone'); localStorage.setItem('kt_autolog_runs', '0');
      window.__hk = [garmin, watch];
      await check();
      r.card = _hkPendingRun && _hkPendingRun.uuid;
      logPendingHealthRun(); await wait(50);
      r.cardLedger = led();
      // C. iCloud: a first import keeps one record per activity; both are deleted, the iCloud copy
      // (no ledger) is restored, and an import brings neither copy back
      lsSet('kt_runs', []); lsSet('kt_sports', []); lsDel('kt_hk_gone'); lsDel('kt_hk_imported'); localStorage.removeItem('kt_hk_last_sync');
      window.__hk = [watch, garmin, rideW, rideG];
      importFromHealth(); await wait(300);
      r.batch = { state: state(), ledger: led() };
      await delAll();
      const icloud = JSON.parse(_sanitizeForICloud(JSON.stringify(buildBackupJSON())));
      delete icloud._manifest;
      _applyImportedData(icloud); await wait(50);
      r.restored = { state: state(), ledger: lsGet('kt_hk_imported'), gone: (lsGet('kt_hk_gone') || []).length };
      importFromHealth(); await wait(300);
      r.icloud = { state: state(), toast: toast() };
      return r;
    });
    assert(out.auto.state === '8@152 / Cycling 60' && out.auto.ledger === 'garmin-1,ride-g,ride-w,watch-1',
      'auto-log logs the richer copies and burns the others with them: ' + JSON.stringify(out.auto));
    assert(out.afterDelete === ' / ' && out.alone === ' / ', 'after the delete neither copy comes back: ' + JSON.stringify([out.afterDelete, out.alone]));
    assert(out.aloneImport.state === ' / ' && /Already up to date/.test(out.aloneImport.toast), 'nor from Import from Health: ' + JSON.stringify(out.aloneImport));
    assert(out.card === 'watch-1' && out.cardLedger === 'garmin-1,watch-1', 'the card logs the Watch copy and burns the other: ' + JSON.stringify([out.card, out.cardLedger]));
    assert(out.batch.state === '8@152 / Cycling 60' && out.batch.ledger === 'garmin-1,ride-g,ride-w,watch-1', 'a first import keeps one record per activity: ' + JSON.stringify(out.batch));
    assert(out.restored.state === ' / ' && out.restored.ledger === null && out.restored.gone === 2, 'the iCloud copy holds the tombstones, not the ledger: ' + JSON.stringify(out.restored));
    assert(out.icloud.state === ' / ' && /Already up to date/.test(out.icloud.toast), 'after the restore an import brings back neither copy: ' + JSON.stringify(out.icloud));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R47 (H12 with M28): a run or ride typed in by hand that the Watch and Strava both wrote to
// Health: the first copy was absorbed, the second found nothing to fold into and came in.
run('R47: a hand-logged run or ride with two Health copies is not imported again', async () => {
  const app = await boot({ native: true, seed: { kt_sports: '[]', kt_runs: '[]' } });
  try {
    await app.page.evaluate(HK_MOCK);
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const y = addDays(todayISO(), -1);
      const at = (h, m, s) => { const d = new Date(y + 'T00:00:00'); d.setHours(h, m, s || 0, 0); return d.getTime(); };
      const iso = ms => new Date(ms).toISOString();
      const hand = () => {
        lsSet('kt_runs', [{ id: at(8, 0), date: y, distance: 8, time: '45:00', week: weekForDate(y), note: 'hand', hr: 0, type: 'easy' }]);
        lsSet('kt_sports', [{ id: at(13, 30), date: y, type: 'Cycling', duration: 60, data: {}, notes: 'hand' }]);
      };
      window.__hk = [
        { uuid: 'run-s', type: 'run', startDate: iso(at(7, 0, 0)), distanceKm: 8.0, durationSec: 45 * 60 },
        { uuid: 'run-w', type: 'run', startDate: iso(at(7, 0, 20)), distanceKm: 8.02, durationSec: 44 * 60 + 58, avgHr: 152 },
        { uuid: 'ride-s', type: 'ride', startDate: iso(at(12, 0, 0)), distanceKm: 30.2, durationSec: 3610 },
        { uuid: 'ride-w', type: 'ride', startDate: iso(at(12, 0, 30)), distanceKm: 30, durationSec: 3600, avgHr: 140 },
      ];
      const r = {};
      for (const L of [false, true]) {
        hand();
        if (L) { lsSet('kt_hk_imported', ['older-1']); localStorage.setItem('kt_hk_last_sync', String(Date.now() - 3 * 864e5)); }
        else { lsDel('kt_hk_imported'); localStorage.removeItem('kt_hk_last_sync'); }
        importFromHealth(); await wait(300);
        r[L ? 'ledger' : 'first'] = { runs: getRuns().map(x => x.distance + '/' + x.note).join(), sports: getSportLogs().map(x => x.duration + '/' + x.notes).join(),
          ledger: (lsGet('kt_hk_imported') || []).filter(u => u !== 'older-1').sort().join(), toast: document.getElementById('toast').textContent };
      }
      return r;
    });
    for (const k of ['first', 'ledger']) {
      const o = out[k];
      assert(o.runs === '8/hand' && o.sports === '60/hand', k + ': neither copy comes in: ' + JSON.stringify(o));
      assert(o.ledger === 'ride-s,ride-w,run-s,run-w' && /Already up to date/.test(o.toast), k + ': both copies are burned with the hand log: ' + JSON.stringify(o));
    }
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R48 (regression of H12): auto-log and the card weighed each workout alone, so one hand-logged
// match hid every match of that sport that day; the other one was never logged or offered.
run('R48: one hand log stands for one workout; auto-log and the card still take the day\'s other one', async () => {
  const app = await boot({ native: true, seed: { kt_sports: '[]', kt_runs: '[]' } });
  try {
    await app.page.evaluate(HK_MOCK);
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const y = addDays(todayISO(), -1);
      const at = (h, m) => { const d = new Date(y + 'T00:00:00'); d.setHours(h, m, 0, 0); return d.getTime(); };
      const iso = ms => new Date(ms).toISOString();
      const am = { uuid: 'am', type: 'Tennis', startDate: iso(at(9, 0)), durationSec: 60 * 60, avgHr: 130 };
      const pm = { uuid: 'pm', type: 'Tennis', startDate: iso(at(15, 0)), durationSec: 62 * 60, avgHr: 135 };
      // the morning match, typed in at 16:30
      const hand = () => { lsSet('kt_sports', [{ id: at(16, 30), date: y, type: 'Tennis', duration: 60, data: {}, notes: 'AM doubles' }]); lsSet('kt_hk_imported', ['older-1']); };
      const sports = () => getSportLogs().map(x => x.duration + '/' + (x.notes === 'From Apple Health' ? 'Health@' + new Date(x.startMs).getHours() : x.notes)).sort().join(' | ');
      const toast = () => document.getElementById('toast').textContent;
      const r = {};
      localStorage.setItem('kt_hk_last_sync', String(Date.now() - 3 * 864e5));
      window.__hk = [pm, am];   // Health lists newest first
      hand(); localStorage.setItem('kt_autolog_runs', '1');
      checkRecentHealthRun(Date.now() - 2 * 864e5); await wait(300);
      r.auto = { sports: sports(), ledger: lsGet('kt_hk_imported').slice().sort().join(), toast: toast() };
      hand(); localStorage.setItem('kt_autolog_runs', '0'); _hkPendingRun = null; _hkPendingDismissed = false;
      checkRecentHealthRun(Date.now() - 2 * 864e5); await wait(300);
      r.card = _hkPendingRun && _hkPendingRun.uuid;
      r.slot = /Log this Tennis/.test(_healthCardSlot());
      logPendingHealthRun(); await wait(50);
      r.tap = { sports: sports(), toast: toast(), hidden: _hkPendingLogged(pm) };
      // runs: two 5 km runs, the evening one typed in by hand at 19:00
      lsSet('kt_sports', []); lsSet('kt_hk_imported', ['older-1']);
      lsSet('kt_runs', [{ id: at(19, 0), date: y, distance: 5, time: '26:00', week: weekForDate(y), note: 'evening', hr: 0, type: 'easy' }]);
      localStorage.setItem('kt_autolog_runs', '1');
      window.__hk = [{ uuid: 'r-pm', type: 'run', startDate: iso(at(18, 0)), distanceKm: 5, durationSec: 26 * 60, avgHr: 152 },
                     { uuid: 'r-am', type: 'run', startDate: iso(at(7, 0)), distanceKm: 5, durationSec: 25 * 60, avgHr: 150 }];
      checkRecentHealthRun(Date.now() - 2 * 864e5); await wait(300);
      r.runs = getRuns().map(x => x.time + '/' + (x.note === 'From Apple Health' ? 'Health@' + new Date(x.startMs).getHours() : x.note)).sort().join(' | ');
      localStorage.setItem('kt_autolog_runs', '0');
      return r;
    });
    assert(out.auto.sports === '60/AM doubles | 62/Health@15' && out.auto.ledger === 'older-1,pm' && /Tennis logged from Apple Health/.test(out.auto.toast),
      'auto-log logs the afternoon match; the hand log stands for the morning one: ' + JSON.stringify(out.auto));
    assert(out.card === 'pm' && out.slot, 'the card offers the afternoon match: ' + JSON.stringify([out.card, out.slot]));
    assert(out.tap.sports === '60/AM doubles | 62/Health@15' && /Tennis logged from Apple Health/.test(out.tap.toast) && out.tap.hidden,
      'the card logs it (not "skipped the duplicate") and then hides: ' + JSON.stringify(out.tap));
    assert(out.runs === '25:00/Health@7 | 26:00/evening', 'runs too: auto-log takes the morning run: ' + out.runs);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R49: _hkBatchTwin scanned the whole batch for every workout, so a first import of a long
// history was quadratic (about 1 s at 6000 workouts). A copy is looked for only among workouts
// that began within the longest workout's reach.
run('R49: a first import compares each workout only with the ones that began near it', async () => {
  const app = await boot({ native: true, seed: { kt_sports: '[]', kt_runs: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const N = 2400, list = [];
      for (let i = 0; i < N; i++) {
        const d = new Date(addDays(todayISO(), -(i + 1)) + 'T00:00:00'); d.setHours(7 + i % 5, 0, 0, 0);
        const ride = i % 3 === 2, w = { type: ride ? 'ride' : 'run', distanceKm: ride ? 25 + i % 10 : 5 + i % 10, durationSec: ride ? 3000 + i % 900 : 1500 + i % 1200 };
        list.push(Object.assign({ uuid: 'w' + i, startDate: d.toISOString(), avgHr: 140 }, w));
        // every 100th workout was also written by a second app, 20 s later
        if (i % 100 === 0) list.push(Object.assign({ uuid: 'c' + i, startDate: new Date(d.getTime() + 20e3).toISOString() }, w));
      }
      Capacitor.Plugins.TrovoHealth = { isAvailable: () => Promise.resolve({ available: true }), requestAuth: () => Promise.resolve({}),
        fetchRuns: () => Promise.resolve({ runs: list.slice().reverse() }) };
      const real = window._hkSameActivity; let calls = 0;
      window._hkSameActivity = function () { calls++; return real.apply(this, arguments); };
      lsDel('kt_hk_imported'); localStorage.removeItem('kt_hk_last_sync');
      importFromHealth();
      for (let t = 0; t < 100 && !/imported/.test(document.getElementById('toast').textContent); t++) await wait(50);
      window._hkSameActivity = real;
      return { calls, runs: getRuns().length, sports: getSportLogs().length, hr: getRuns().every(x => x.hr === 140), ledger: (lsGet('kt_hk_imported') || []).length,
        toast: document.getElementById('toast').textContent };
    });
    assert(out.runs === 1600 && out.sports === 800 && out.hr && out.ledger === 2424 && /1600 runs · 800 activities imported/.test(out.toast),
      'every workout is imported once, copies folded into their richer copy: ' + JSON.stringify(out));
    assert(out.calls < 200, 'each workout is compared only with its neighbours (24 copies): ' + out.calls + ' comparisons');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
