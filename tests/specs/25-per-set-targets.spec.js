// Per-set targets: reps [3,8,8] with weights [225,185,185] seed each set's
// steppers in the runner (top-set/back-off programming), displays collapse
// uniform arrays, and prescribed target arrays plate-snap on tool ingestion.
const { boot, assert, run } = require('../lib/harness');

run('top-set/back-off arrays drive the runner set by set', async () => {
  const app = await boot({ seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      openDeckRunner('Push');
      const ex = runnerSession.exercises[0];
      ex.sets = 3; ex.reps = [3, 8, 8]; ex.weights = [225, 185, 185]; ex.weight = 225;
      // Re-seed set 1 targets the way openDeckRunner would.
      runnerWeights[ex.name] = ex.weights[0];
      runnerReps[ex.name] = ex.reps[0];
      runnerEngaged = true; paintRunner();
      const set1 = { r: runnerReps[ex.name], w: runnerWeights[ex.name] };
      runnerCompleteSet(); runnerSkipRest();
      const set2 = { r: runnerReps[ex.name], w: runnerWeights[ex.name] };
      runnerCompleteSet(); runnerSkipRest();
      const set3 = { r: runnerReps[ex.name], w: runnerWeights[ex.name] };
      const pill = document.getElementById('runner-root').innerHTML.indexOf('3×(3/8/8)') !== -1;
      closeDeckRunner();
      const fmt = [_fmtRepTarget([8, 8, 8]), _fmtRepTarget([3, 8, 8]), _fmtRepTarget('8-10')].join('|');
      // Tool ingestion snaps per-set target arrays to plates.
      const r = executeCoachTool('update_routine_weeks', { weeks: [{
        wk: 8, block: 4, bName: 'DELOAD', bColor: '#a78bfa',
        push: [{ name: 'Barbell Bench Press', sets: 3, reps: [3, 8, 8], weight: 226.3, weights: [226.3, 183.8, 183.8], isMain: true }],
      }] });
      const wk8ex = getCustomRoutine().weeks[7].push[0];
      return { set1, set2, set3, pill, fmt, ok: r.ok, snapped: wk8ex.weights, topSnapped: wk8ex.weight };
    });
    assert(out.set1.r === 3 && out.set1.w === 225, 'set 1 seeds the top set, got ' + JSON.stringify(out.set1));
    assert(out.set2.r === 8 && out.set2.w === 185, 'set 2 seeds the back-off, got ' + JSON.stringify(out.set2));
    assert(out.set3.r === 8 && out.set3.w === 185, 'set 3 holds the back-off, got ' + JSON.stringify(out.set3));
    assert(out.pill, 'runner pill renders 3×(3/8/8)');
    assert(out.fmt === '8|(3/8/8)|8-10', 'formatter collapses uniform arrays, got ' + out.fmt);
    assert(out.ok && String(out.snapped) === '227.5,185,185' && out.topSnapped === 227.5, 'target arrays plate-snap, got ' + out.snapped);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
