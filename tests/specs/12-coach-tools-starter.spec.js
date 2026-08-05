// The AI Coach's edit tools were only ever exercised against AI-generated
// routines. This pins that they work identically on a starter-built one:
// week edits, cadence swaps, week jumps, and weight updates that the Today
// screen then reflects.
const { boot, assert, run } = require('../lib/harness');

run('coach tools operate on a starter-built routine', async () => {
  const app = await boot({ seed: { kt_sessions: '[]', kt_routine: '', kt_week: '1' } });
  try {
    const out = await app.page.evaluate(() => {
      localStorage.removeItem('kt_routine');
      applyStarterRoutine({ goal: 'muscle', days: 3, runs: 1, equip: 'full', exp: 0 });
      const before = getCustomRoutine();

      // 1. Rewrite week 8 (the deload) the way the coach's tool call would.
      const r1 = executeCoachTool('update_routine_weeks', { weeks: [{
        wk: 8, block: 4, bName: 'DELOAD', bColor: '#a78bfa', wkNote: 'Coach-tuned deload.',
        push: [{ name: 'Push Up', sets: 2, reps: 15, rpe: 5, weight: 0, isMain: true }],
      }] });
      const wk8 = getCustomRoutine().weeks[7];

      // 2. Swap two cadence days — default scope is a this-week-only
      // override, so assert on the resolved week-1 plan, not cr.weekPlan.
      const planBefore = getWeekPlanForWeek(1).map(p => p.type).join(',');
      const r2 = executeCoachTool('swap_cadence_days', { dayA: 'Mon', dayB: 'Tue' });

      // 3. Jump the programme week.
      const r3 = executeCoachTool('set_current_week', { week: 4 });

      // 4. Weight update lands in kt_weights and reaches Today's exercises.
      const r4 = executeCoachTool('set_exercise_weight', { name: 'barbell bench press', weight: 100 });
      const todayExs = _todayLiftExercises('Push');
      const bench = todayExs.find(e => e.name === 'Barbell Bench Press');

      return {
        starterName: before.name, weeksLen: before.weeks.length,
        r1ok: r1.ok, wk8Note: wk8.wkNote, wk8Main: (wk8.push || [])[0] && wk8.push[0].name,
        wk8RunsKept: Object.keys(wk8.runs || {}).length,
        r2ok: r2 && r2.ok === true,
        planChanged: getWeekPlanForWeek(1).map(p => p.type).join(',') !== planBefore,
        wk1Swapped: getWeekPlanForWeek(1)[1].type === 'Push',
        r3ok: r3.ok, week: currentWeek,
        r4ok: r4.ok, benchW: bench ? bench.weight : -1,
      };
    });
    assert(out.starterName === 'Your starter block' && out.weeksLen === 8, 'starter routine in place');
    assert(out.r1ok, 'update_routine_weeks accepts a starter routine');
    assert(out.wk8Note === 'Coach-tuned deload.', 'week 8 rewritten, got: ' + out.wk8Note);
    assert(out.wk8Main === 'Push Up', 'week 8 exercises replaced');
    assert(out.r2ok && out.planChanged && out.wk1Swapped, 'swap_cadence_days overrides week 1 (Tue becomes Push)');
    assert(out.r3ok && out.week === 4, 'set_current_week jumps to 4, got ' + out.week);
    assert(out.r4ok && out.benchW === 100, 'weight update reaches Today, got ' + out.benchW);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
