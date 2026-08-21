// Pins for M&M items 5-6: the runner card recomposition (dark token cards,
// mono meta line, target hero, hairline ledger) and the in-runner PR beat
// (gold eyebrow during the rest, gold ◆ persisting on the ledger row, and
// self-correcting gold when a set is edited back down).
const { boot, assert, run } = require('../lib/harness');

run('runner cards are token surfaces with the recomposed grammar', async () => {
  const app = await boot({ seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      openDeckRunner('Push');
      const exs = runnerSession.exercises;
      exs[0].isMain = true;
      paintRunner();
      const root = document.getElementById('runner-root');
      const limeCards = root.querySelectorAll('.kt-r-card.lime').length;
      const idleTxt = root.textContent;
      const mainChip = idleTxt.indexOf('◆ MAIN LIFT') > -1;
      const targetHero = !!root.querySelector('.kt-r-target');
      const metaLine = !!root.querySelector('.kt-r-card-meta');
      // Engage: steppers flank the editable numeral; CTA reads Log set 1.
      runnerEngaged = true; paintRunner();
      const row = root.querySelector('.kt-step-row');
      const shape = row && row.children.length === 3
        && row.children[0].classList.contains('kt-step-btn')
        && row.children[1].classList.contains('kt-step-input')
        && row.children[2].classList.contains('kt-step-btn');
      const cta = root.querySelector('.kt-eng-done');
      const ctaLabel = cta ? cta.textContent : '';
      // Log a set, skip rest, re-engage: the hairline ledger appears.
      runnerCompleteSet();
      runnerSkipRest();
      runnerEngaged = true; paintRunner();
      const ledger = !!root.querySelector('.kt-ledger .kt-lr');
      closeDeckRunner();
      return { limeCards, mainChip, targetHero, metaLine, shape, ctaLabel, ledger };
    });
    assert(out.limeCards === 0, 'no card surface goes accent any more');
    assert(out.mainChip, 'main lift is marked by the ◆ chip');
    assert(out.targetHero && out.metaLine, 'idle carries target hero + mono meta line');
    assert(out.shape, 'stepper wells flank the editable numeral');
    assert(out.ctaLabel.indexOf('Log set 1') > -1, 'engaged CTA says Log set 1, got ' + out.ctaLabel);
    assert(out.ledger, 'engaged shows the hairline ledger once sets exist');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('PR beat: gold owns the rest slot, persists only on the ledger row', async () => {
  const app = await boot({ seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      openDeckRunner('Push');
      const ex = runnerSession.exercises[0];
      ex.sets = 3;
      // Stored best sits below what we're about to log.
      const prs = getPRs(); prs[ex.name] = 100; lsSet('kt_prs', prs);
      runnerWeights[ex.name] = 105;
      runnerEngaged = true;
      runnerCompleteSet(); // 105 beats 100 → beat + rest
      const root = document.getElementById('runner-root');
      const beatSet = _runnerPrBeat && _runnerPrBeat.ex === ex.name && _runnerPrBeat.best === 100;
      const eyebrow = !!root.querySelector('.kt-pr-eyebrow');
      const hero = root.querySelector('.kt-pr-hero');
      const heroTxt = hero ? hero.textContent : '';
      const clockStillRuns = !!root.querySelector('.kt-rest-mini .kt-rest-time');
      const goldRow = !!root.querySelector('.kt-lr.gold');
      // Rest ends: the beat dies, the ledger row stays gold.
      runnerSkipRest();
      const beatCleared = _runnerPrBeat === null;
      const goldSurvives = !!root.querySelector('.kt-lr.gold');
      const eyebrowGone = !root.querySelector('.kt-pr-eyebrow');
      // Editing the set back below the best takes the gold away.
      runnerStartEditSet(0);
      document.getElementById('kt-edit-w').value = '95';
      runnerSaveEditSet();
      const goldRevoked = !root.querySelector('.kt-lr.gold');
      // A first-ever lift (no stored best) stays quiet.
      runnerGoTo(1);
      const ex2 = runnerSession.exercises[1];
      delete prs[ex2.name]; lsSet('kt_prs', prs);
      ex2.sets = 3;
      runnerEngaged = true;
      runnerCompleteSet();
      const quietFirst = _runnerPrBeat === null;
      closeDeckRunner();
      return { beatSet, eyebrow, heroTxt, clockStillRuns, goldRow,
        beatCleared, goldSurvives, eyebrowGone, goldRevoked, quietFirst };
    });
    assert(out.beatSet, 'beat state records the old best');
    assert(out.eyebrow, 'rest shows the gold eyebrow');
    assert(out.heroTxt.indexOf('105') > -1, 'gold hero shows the new record, got ' + out.heroTxt);
    assert(out.clockStillRuns, 'clock compresses but keeps running');
    assert(out.goldRow, 'ledger row goes gold with the beat');
    assert(out.beatCleared && out.eyebrowGone, 'beat dies with the rest');
    assert(out.goldSurvives, 'gold survives on the ledger row');
    assert(out.goldRevoked, 'editing below the best takes the gold back');
    assert(out.quietFirst, 'first-ever lift has nothing to beat — stays quiet');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
