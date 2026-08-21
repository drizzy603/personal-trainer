// Pins for M&M items 7-8: the starter intake's statement recomposition with
// its segmented rail and device-storage promise, the reveal's statband +
// real-week ledger, and the active motion set (M-05 tick, M-07 card
// advance, M-08 final-10 breathing).
const { boot, assert, run } = require('../lib/harness');

run('starter intake speaks statements; reveal shows the real week', async () => {
  const app = await boot({ seed: { kt_routine: 'null', kt_sessions: '[]', kt_runs: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      openStarterIntake();
      const ov = document.getElementById('starterOverlay');
      const q1 = ov.textContent.indexOf('QUESTION 1') > -1
        && ov.textContent.indexOf('What are you chasing?') > -1;
      const promise = ov.textContent.indexOf('NO ACCOUNT · NO KEY · STORED ON DEVICE') > -1;
      const railSegs = ov.innerHTML.split('height:3px').length - 1 >= 5;
      // Walk the five answers to the reveal.
      _siPick('muscle'); _siPick(3); _siPick(1); _siPick('db'); _siPick(0);
      const t = ov.textContent;
      const reveal = t.indexOf('BUILT FOR YOU · JUST NOW') > -1
        && t.indexOf('Push / pull / legs') > -1
        && t.indexOf('Starts light on purpose') > -1;
      const band = t.indexOf('Lifts / day') > -1 && t.indexOf('Per session') > -1;
      const week = t.indexOf('PRESS FOCUS') > -1 && t.indexOf('EASY RUN') > -1;
      const settle = !!ov.querySelector('.kt-si-settle.d60');
      // Apply still builds the same routine.
      applyStarterIntake();
      const built = getCustomRoutine();
      return { q1, promise, railSegs, reveal, band, week, settle,
        weeks: built ? built.weeks.length : 0 };
    });
    assert(out.q1, 'question screen carries the statement pair');
    assert(out.promise, 'device-storage promise on the intake');
    assert(out.railSegs, 'segmented progress rail renders');
    assert(out.reveal, 'reveal names the split honestly');
    assert(out.band && out.week, 'reveal statband + real week rows');
    assert(out.settle, 'reveal groups carry the M-03 settle');
    assert(out.weeks === 8, 'apply still builds the 8-week block');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('active motion set: M-05 tick, M-07 advance, M-08 final ten', async () => {
  const app = await boot({ seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      openDeckRunner('Push');
      const root = document.getElementById('runner-root');
      // M-07: same-card repaint must NOT animate; a deck move must.
      paintRunner();
      const still = !root.querySelector('.kt-card-in');
      runnerGoTo(1);
      const advanced = !!root.querySelector('.kt-card-in');
      // M-05: the header % readout changed with the deck move → it ticks.
      const pctTicked = !!root.querySelector('.kt-r-pct.kt-num-tick');
      runnerGoTo(0);
      const ex = runnerSession.exercises[0];
      ex.sets = 2;
      runnerEngaged = true;
      runnerCompleteSet(); // set 1 → resting
      // M-08: clock breathes only inside 0:10.
      const calm = !root.querySelector('.kt-rest-time.kt-final10');
      runnerRestLeft = 8; _paintRestClock();
      const breathing = !!document.querySelector('#runner-root .kt-rest-time.kt-final10');
      runnerRestLeft = 30; _paintRestClock();
      const calmAgain = !document.querySelector('#runner-root .kt-rest-time.kt-final10');
      runnerSkipRest();
      closeDeckRunner();
      return { still, advanced, pctTicked, calm, breathing, calmAgain };
    });
    assert(out.still, 'same-card repaint stays still');
    assert(out.advanced, 'deck move rises from the peek (M-07)');
    assert(out.pctTicked, 'changed % readout ticks in (M-05)');
    assert(out.calm && out.breathing && out.calmAgain, 'final-10 class tracks the clock (M-08)');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
