// Post-run review (Premium spec screen C): the goal-pace delta chip is lime
// only when the goal was beaten, comparable runs filter to ±10% distance with
// today at the bottom, and BEST only appears when it's true.
const { boot, assert, run } = require('../lib/harness');

run('post-run review compares honestly', async () => {
  const app = await boot({ seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      localStorage.setItem('kt_run_goal', '8:15');
      lsSet('kt_runs', [
        { id: 1, date: '2026-07-15', distance: 5.0, time: '40:55' },
        { id: 2, date: '2026-07-22', distance: 5.1, time: '41:12', notes: 'From Apple Health' },
        { id: 3, date: '2026-07-08', distance: 10.0, time: '84:00' }, // not comparable
      ]);
      // 5.01 km in 40:38 → 487 s/km pace vs 495 goal → beat it by 8 s/km.
      const html = renderRunReview(5.01, '40:38', null);
      const beatGoal = html.indexOf('− 8 S/KM'.replace(' ', '')) !== -1 || /−8 S\/KM/.test(html);
      // Slower run: 5 km in 43:20 → 520 s/km → +25 over goal, no lime chip.
      const slow = renderRunReview(5.0, '43:20', null);
      // Best detection: today's 40:38 beats 40:55 and 41:12.
      const hasBest = /BEST/.test(html) && !/VS BEST/.test(html);
      const slowNotBest = /VS BEST/.test(slow);
      return {
        beatGoal,
        limeChip: html.indexOf('var(--accent-dim)') !== -1,
        slowChipPlain: slow.indexOf('var(--accent-dim)') === -1 && /\+25 S\/KM/.test(slow),
        comparables: (html.match(/height:42px/g) || []).length,
        excludesTenK: html.indexOf('84') === -1 && html.indexOf('1:24:00') === -1,
        healthTag: html.indexOf('HEALTH') !== -1,
        hasBest, slowNotBest,
        emptyOnNoData: renderRunReview(0, '', null) === '',
      };
    });
    assert(out.beatGoal, 'goal delta computes −8 s/km');
    assert(out.limeChip, 'beaten goal renders the lime chip');
    assert(out.slowChipPlain, 'missed goal renders plain +25 s/km chip');
    assert(out.comparables === 3, '2 comparable rows + today, got ' + out.comparables);
    assert(out.excludesTenK, '10K run excluded from a 5K comparison');
    assert(out.healthTag, 'imported run carries the HEALTH tag');
    assert(out.hasBest && out.slowNotBest, 'BEST only when true');
    assert(out.emptyOnNoData, 'no data renders nothing');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
