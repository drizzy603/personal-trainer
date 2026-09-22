// A superset pairs with the card below it, so the only partner you could ever get was
// whichever exercise happened to sit next in the list. The edit sheet now lets you choose,
// and choosing moves that lift into place.
const { boot, assert, run } = require('../lib/harness');

run('choosing a superset partner moves it into the pair', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      const names = () => runnerSession.exercises.map(e => e.name);
      const flags = () => runnerSession.exercises.map(e => (e.ss ? 1 : 0));

      // A session with four distinct lifts, nothing paired.
      runnerSession = { type: 'Push', exercises: [
        { name: 'Barbell Bench Press', sets: 3, reps: 8, weight: 185, isMain: true },
        { name: 'Incline DB Press', sets: 3, reps: 10, weight: 60 },
        { name: 'Cable Fly', sets: 3, reps: 12, weight: 30 },
        { name: 'Tricep Pushdown', sets: 3, reps: 12, weight: 50 },
      ] };
      runnerExIdx = 0; runnerCompleted = {}; runnerWeights = {}; runnerReps = {};
      runnerWeightsLog = {}; runnerRepsLog = {}; runnerRpeLog = {}; runnerRpe = {}; _wristStamps = {};

      // Open the sheet on the FIRST lift and pick a partner two slots away.
      openRunnerExEdit(0);
      r.sheetOpen = !!document.getElementById('runner-ex-edit-sheet');
      r.seeded = { with: _rExEditSSWith, on: _rExEditSS };
      runnerExEditPickSS();
      r.picking = _rExSSPicking;
      const pickerHTML = _buildRunnerExEditHTML();
      r.picker = {
        listsOthers: ['Incline DB Press', 'Cable Fly', 'Tricep Pushdown'].every(n => pickerHTML.indexOf(n) >= 0),
        excludesSelf: pickerHTML.indexOf('Barbell Bench Press') < 0,
        hasNone: /No superset/.test(pickerHTML),
      };
      runnerExEditSetSSIdx(2);                  // Cable Fly — two below, not adjacent
      r.chosen = { with: _rExEditSSWith, on: _rExEditSS, backOnMainSheet: !_rExSSPicking };
      // A pending superset return holds a raw index into the array the save is
      // about to splice. A finished card shows the done body even while its
      // rest runs, so Edit is reachable mid-pair and the index would go stale.
      _ssReturnIdx = 3;
      saveRunnerExEdit();
      r.ssReturnCleared = _ssReturnIdx === null;
      r.afterSave = { names: names(), flags: flags(), engaged: runnerExIdx };

      // Clearing it again unpairs without moving anything back.
      openRunnerExEdit(0);
      r.reopened = _rExEditSSWith;
      runnerExEditSetSSIdx(-1);
      saveRunnerExEdit();
      r.afterClear = { names: names(), flags: flags() };

      // Open on the SECOND half of a pair: it shows the opener, and choosing another
      // partner dissolves that pair rather than chaining a third lift onto it.
      runnerSession.exercises[0].ss = true;                 // Bench -> Cable Fly
      openRunnerExEdit(1);                                  // the sheet on Cable Fly
      r.secondHalf = { seeded: _rExEditSSWith, asSecond: _rExEditSSAsSecond };
      runnerExEditSetSSIdx(3);                              // pick Tricep Pushdown instead
      saveRunnerExEdit();
      r.afterSecond = { names: names(), flags: flags() };
      return r;
    });

    assert(out.sheetOpen && out.seeded.with === '' && !out.seeded.on,
      'an unpaired lift opens with no partner: ' + JSON.stringify(out.seeded));
    assert(out.picking && out.picker.listsOthers && out.picker.excludesSelf && out.picker.hasNone,
      'the picker lists every other lift, not itself, plus No superset: ' + JSON.stringify(out.picker));
    assert(out.chosen.with === 'Cable Fly' && out.chosen.on && out.chosen.backOnMainSheet,
      'choosing a partner returns to the sheet: ' + JSON.stringify(out.chosen));
    assert(out.afterSave.names[0] === 'Barbell Bench Press' && out.afterSave.names[1] === 'Cable Fly',
      'the partner moved directly below: ' + JSON.stringify(out.afterSave.names));
    assert(out.afterSave.flags[0] === 1 && out.afterSave.flags[1] === 0,
      'the first opens the pair and the partner does not open another: ' + JSON.stringify(out.afterSave.flags));
    assert(out.afterSave.names.length === 4 && out.afterSave.names.indexOf('Incline DB Press') >= 0,
      'nothing was lost in the move: ' + JSON.stringify(out.afterSave.names));
    assert(out.afterSave.engaged === 0, 'the engaged card still points at the same lift: ' + out.afterSave.engaged);
    assert(out.ssReturnCleared, 'the reorder invalidates a pending superset return index');
    assert(out.reopened === 'Cable Fly', 'reopening shows the current partner: ' + out.reopened);
    assert(out.afterClear.flags[0] === 0 && out.afterClear.names[1] === 'Cable Fly',
      'clearing unpairs and leaves the order alone: ' + JSON.stringify(out.afterClear));
    assert(out.secondHalf.seeded === 'Barbell Bench Press' && out.secondHalf.asSecond, 'the sheet on the second half shows the opener: ' + JSON.stringify(out.secondHalf));
    assert(out.afterSecond.flags[0] === 0 && out.afterSecond.names[1] === 'Cable Fly' && out.afterSecond.names[2] === 'Tricep Pushdown' && out.afterSecond.flags[1] === 1 && out.afterSecond.flags[2] === 0,
      'choosing another partner dissolves the old pair and does not chain: ' + JSON.stringify(out.afterSecond));
    assert(out.afterSecond.flags.filter(x => x).length === 1, 'exactly one pair opener remains: ' + JSON.stringify(out.afterSecond));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
