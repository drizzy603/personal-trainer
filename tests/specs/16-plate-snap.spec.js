// Real plates only: every prescribed or AI-written load snaps to 2.5 lb —
// at tool ingestion (update_routine_weeks, set_exercise_weight), in the
// boot migration for routines already on the phone, and in the offline
// overload hint. User-logged session history is never rewritten.
const { boot, assert, run } = require('../lib/harness');

run('AI-written loads snap to 2.5 lb everywhere', async () => {
  const app = await boot({ seed: { kt_sessions: '[]', kt_routine: '', kt_week: '1' } });
  try {
    const out = await app.page.evaluate(() => {
      localStorage.removeItem('kt_routine');
      applyStarterRoutine({ goal: 'muscle', days: 3, runs: 0, equip: 'full', exp: 0 });

      // Tool ingestion: a sloppy model writes 151.3 / 62.6 — storage gets 152.5 / 62.5.
      const r1 = executeCoachTool('update_routine_weeks', { weeks: [{
        wk: 8, block: 4, bName: 'DELOAD', bColor: '#a78bfa',
        push: [
          { name: 'Barbell Bench Press', sets: 3, reps: 8, weight: 151.3, isMain: true },
          { name: 'Lateral Raise', sets: 3, reps: 15, weight: 62.6 },
        ],
      }] });
      const wk8 = getCustomRoutine().weeks[7];

      const r2 = executeCoachTool('set_exercise_weight', { name: 'Barbell Bench Press', weight: 98.7 });
      const cached = parseFloat(getWeights()['Barbell Bench Press']);

      // Boot migration: plant a fractional prescription + run the sweep body.
      const cr = getCustomRoutine();
      cr.weeks[0].push[0].weight = 133.8;
      setCustomRoutine(cr);
      ['push','pull','legs','legs2','arms'].forEach(k => {
        (cr.weeks[0][k] || []).forEach(e => {
          const ew = parseFloat(e && e.weight);
          if (ew > 0) e.weight = _snap25(ew);
        });
      });
      setCustomRoutine(cr);
      const migrated = getCustomRoutine().weeks[0].push[0].weight;

      // Overload hint: fractional logged history still proposes a real plate.
      lsSet('kt_sessions', [{ id: 1, date: todayISO(), type: 'Push', week: 1,
        exercises: [{ name: 'Overhead Press', sets: 3, reps: [8,8,8], weight: 91.3, rpe: 6 }] }]);
      const sugg = _overloadSuggestion({ name: 'Overhead Press', reps: 8, sets: 3 });

      // The prompt teaches the rule.
      const prompted = buildSystemPrompt().indexOf('multiple of 2.5 lb') !== -1;

      return {
        r1ok: r1.ok, benchW: wk8.push[0].weight, latW: wk8.push[1].weight,
        r2ok: r2.ok, cached, migrated,
        suggTo: sugg && sugg.to, prompted,
        helper: [_snap25(1.3), _snap25(151.3), _snap25(62.6), _snap25(0)].join(','),
      };
    });
    assert(out.helper === '2.5,152.5,62.5,0', 'snap helper rounds to plates, got ' + out.helper);
    assert(out.r1ok && out.benchW === 152.5 && out.latW === 62.5, 'routine ingestion snaps, got ' + out.benchW + '/' + out.latW);
    assert(out.r2ok && out.cached === 97.5, 'set_exercise_weight snaps, got ' + out.cached);
    assert(out.migrated === 135, 'migration sweep snaps stored prescriptions, got ' + out.migrated);
    // Barbell lift: 91.3 + 5 = 96.3 → snaps to the 97.5 plate.
    assert(out.suggTo === 97.5, 'overload hint lands on a plate, got ' + out.suggTo);
    assert(out.prompted, 'system prompt carries the 2.5 lb rule');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
