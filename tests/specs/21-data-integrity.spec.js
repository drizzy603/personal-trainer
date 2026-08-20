// Data integrity: logs stay newest-first through any writer, restore is a
// true replace that rejects corrupt shapes but keeps device opt-ins, and
// Health import skips runs the user already logged by hand.
const { boot, assert, run } = require('../lib/harness');

run('newest-first invariant holds through backdating and moves', async () => {
  const app = await boot({ seed: { kt_sessions: '[]', kt_runs: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      // Backdated unshift lands in the right position via the lsSet sort.
      const s = getSessions();
      s.unshift({ id: 1, date: '2026-08-18', type: 'Push', week: 1, exercises: [] });
      lsSet('kt_sessions', s);
      const s2 = getSessions();
      s2.unshift({ id: 2, date: '2026-08-01', type: 'Pull', week: 1, exercises: [] });
      lsSet('kt_sessions', s2);
      const order1 = getSessions().map(x => x.id).join(',');
      // A date-move re-sorts on write.
      const s3 = getSessions();
      s3[1].date = '2026-08-20';
      lsSet('kt_sessions', s3);
      const order2 = getSessions().map(x => x.id).join(',');
      return { order1, order2 };
    });
    assert(out.order1 === '1,2', 'backdated entry sinks below newer, got ' + out.order1);
    assert(out.order2 === '2,1', 'date-move resurfaces the entry, got ' + out.order2);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('restore replaces, rejects corrupt shapes, keeps device opt-ins', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      lsSet('kt_milestones', { 'sess-10': '2026-08-01' });
      localStorage.setItem('kt_readiness_on', '1');
      localStorage.setItem('kt_user_name', 'Roberto');
      const runsBefore = getRuns().length;
      _applyImportedData({
        kt_sessions: [{ id: 9, date: '2026-08-10', type: 'Push', week: 1, exercises: [] }],
        kt_runs: 'CORRUPT-NOT-AN-ARRAY',
        kt_weights: { 'Bench Press': 150 },
      });
      return {
        sessions: getSessions().length,
        // Corrupt value → never applied; the device's own sane array stays.
        runsSane: Array.isArray(getRuns()) && getRuns().length === runsBefore,
        milestonesGone: getMilestones() === null,
        readinessKept: localStorage.getItem('kt_readiness_on') === '1',
        nameGone: !localStorage.getItem('kt_user_name'),
      };
    });
    assert(out.sessions === 1, 'backup sessions land');
    assert(out.runsSane, 'corrupt kt_runs is dropped, app keeps a sane array');
    assert(out.milestonesGone, 'keys absent from the backup are removed (true replace)');
    assert(out.readinessKept, 'device opt-ins survive a restore');
    assert(out.nameGone, 'data-ish raw keys clear when absent from the backup');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('health import skips runs already logged by hand', async () => {
  const app = await boot({ seed: { kt_runs: '[]', kt_hk_imported: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      const runs = getRuns();
      runs.unshift({ id: 5, date: todayISO(), distance: 5.0, time: '40:38', note: '' });
      lsSet('kt_runs', runs);
      const hk = { uuid: 'abc-123', startDate: new Date().toISOString(), distanceKm: 5.05, durationSec: 2438 };
      const rec = _logHealthRun(hk);
      const seen = lsGet('kt_hk_imported') || [];
      // A genuinely different run still imports.
      const rec2 = _logHealthRun({ uuid: 'def-456', startDate: new Date().toISOString(), distanceKm: 8.0, durationSec: 3000 });
      return { skipped: rec === null, seen: seen.indexOf('abc-123') !== -1,
        count: getRuns().length, imported: !!rec2 };
    });
    assert(out.skipped, 'same-day same-distance manual run blocks the import');
    assert(out.seen, 'the uuid is still marked seen so it never re-offers');
    assert(out.imported && out.count === 2, 'different runs still import, got ' + out.count);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
