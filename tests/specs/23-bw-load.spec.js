// Bodyweight+load modeling: effective load = latest body weight + added,
// feeding volume and e1RM — with the honest fallback (no weigh-in on file →
// old behavior, nothing invented).
const { boot, assert, run } = require('../lib/harness');

run('bodyweight lifts count via effective load', async () => {
  const app = await boot({ seed: { kt_sessions: '[]', kt_bw: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      const ex = [{ name: 'Pull Up', sets: 3, reps: [8, 8, 8], weight: 25, weightLog: [25, 25, 25] }];
      // No weigh-in on file: added load only (old behavior, honest).
      const volNoBW = calcVolume(ex);
      lsSet('kt_bw', [{ date: todayISO(), weight: 180 }]);
      const volBW = calcVolume(ex);
      // Barbell lifts are untouched by the body weight.
      const bench = calcVolume([{ name: 'Barbell Bench Press', sets: 2, reps: [5, 5], weight: 200, weightLog: [200, 200] }]);
      // e1RM uses effective load too.
      lsSet('kt_sessions', [{ id: 1, date: todayISO(), type: 'Pull', week: 1, exercises: ex }]);
      const series = _e1rmSeries()['Pull Up'];
      const e1 = series && series[0] && series[0].e1rm;
      // Pure bodyweight (0 added) now registers volume instead of vanishing.
      const pushups = calcVolume([{ name: 'Push Up', sets: 2, reps: [15, 15], weight: 0 }]);
      return { volNoBW, volBW, bench, e1, pushups,
        isBW: _isBodyweightLift('Weighted Pull-Up'), notBW: _isBodyweightLift('Barbell Row') };
    });
    assert(out.volNoBW === 600, 'no weigh-in → added-only volume, got ' + out.volNoBW);
    assert(out.volBW === 4920, 'BW 180 + 25 across 24 reps, got ' + out.volBW);
    assert(out.bench === 2000, 'barbell volume untouched, got ' + out.bench);
    assert(out.e1 && Math.abs(out.e1 - (205 * (1 + 8 / 30))) < 1, 'e1RM on effective load, got ' + out.e1);
    assert(out.pushups === 5400, 'pure bodyweight reps register, got ' + out.pushups);
    assert(out.isBW && !out.notBW, 'heuristic classifies correctly');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
