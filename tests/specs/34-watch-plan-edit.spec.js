// The wrist must see an exercise edited or swapped on the phone mid-workout.
// Phone half of the contract: every runner edit pushes runnerSession (not
// the routine) as the watch plan, with the live state alongside, and the
// renamed exercise's logs travel under the new name.
const { boot, assert, run } = require('../lib/harness');

run('mid-workout exercise edit reaches the watch plan push', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      openDeckRunner('Push');
      const ex = runnerSession.exercises[0];
      const oldName = ex.name;
      // One set logged under the old name, then the phone edit sheet swaps
      // the lift and its scheme.
      runnerEngaged = true;
      runnerCompleteSet();
      runnerSkipRest();
      openRunnerExEdit(0);
      _rExEditName = 'Incline Dumbbell Press';
      _rExEditSets = 4; _rExEditReps = 12; _rExEditWeight = 45;
      saveRunnerExEdit();
      window.__mock.updateContext.length = 0;
      _runNativeSync();
      const pushes = window.__mock.updateContext;
      const last = pushes[pushes.length - 1] || {};
      const plan = JSON.parse(last.json || '{}');
      const live = last.live ? JSON.parse(last.live) : null;
      const first = (plan.exercises || [])[0] || {};
      closeDeckRunner();
      return {
        pushed: pushes.length >= 1,
        swapped: first.name === 'Incline Dumbbell Press' && first.sets === 4 && first.reps === 12 && first.weight === 45,
        oldGone: !(plan.exercises || []).some(e => e.name === oldName),
        liveMoved: !!live && Array.isArray(live.reps['Incline Dumbbell Press'])
          && live.reps['Incline Dumbbell Press'].length === 1 && !live.reps[oldName],
        type: plan.type, day: plan.dayName,
      };
    });
    assert(out.pushed, 'runner edit schedules a watch push');
    assert(out.swapped, 'plan carries the edited exercise, not the routine copy');
    assert(out.oldGone, 'the old exercise name leaves the plan');
    assert(out.liveMoved, 'logged sets travel under the new name in the live payload');
    assert(out.type === 'lift' && out.day === 'Push', 'plan framed as the live session');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
