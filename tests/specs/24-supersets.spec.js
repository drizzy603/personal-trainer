// Supersets: ex.ss pairs an exercise with the next one — the first movement
// hands off with no rest, the partner rests once, the pair returns to the
// first movement, and the saved session carries the SS indices the history
// rail already knew how to draw.
const { boot, assert, run } = require('../lib/harness');

run('superset alternates, shares one rest, and saves the rail', async () => {
  const app = await boot({ seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      openDeckRunner('Push');
      // Pair exercises 0+1 (2 sets each keeps the walk short).
      const A = runnerSession.exercises[0], B = runnerSession.exercises[1];
      A.ss = true; A.sets = 2; B.sets = 2;
      // The ⇄ chip lives on the idle card (M&M recomposition).
      paintRunner();
      const tagged = document.getElementById('runner-root').innerHTML.indexOf('SUPERSET') !== -1;
      runnerEngaged = true; paintRunner();

      // A set 1 → hands off to B with no rest.
      runnerCompleteSet();
      const handoff = runnerExIdx === 1 && !runnerResting && runnerEngaged;
      // B set 1 → rests once, then returns to A.
      runnerCompleteSet();
      const rested = runnerResting === true;
      runnerRestEndsAt = Date.now() - 1000; _resumeDayAndRest();
      const backOnA = runnerExIdx === 0 && !runnerResting;
      // A set 2 → hands off again; B set 2 finishes B.
      runnerCompleteSet();
      const handoff2 = runnerExIdx === 1;
      runnerCompleteSet();
      const bDone = (runnerCompleted[B.name] || 0) === 2;

      runnerFinishSession();
      const s = getSessions()[0];
      return { tagged, handoff, rested, backOnA, handoff2, bDone,
        ss: s.supersets, exSS: s.exercises[0].ss === true,
        aSets: s.exercises[0].sets, bSets: s.exercises[1].sets };
    });
    assert(out.tagged, 'runner card shows the SUPERSET tag');
    assert(out.handoff, 'first movement hands off with no rest');
    assert(out.rested && out.backOnA, 'partner rests once, rest-end returns to the first movement');
    assert(out.handoff2 && out.bDone, 'alternation continues through both sets');
    assert(String(out.ss) === '0' && out.exSS, 'saved session carries superset indices + flags, got ' + JSON.stringify(out.ss));
    assert(out.aSets === 2 && out.bSets === 2, 'both movements saved their sets');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
