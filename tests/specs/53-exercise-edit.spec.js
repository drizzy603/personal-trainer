// Edit exercise: the picker knows every exercise (custom ones too), searches muscles and equipment,
// creates on the spot, adds after the current card, removes from today, and can write the edit
// into the programme from this week on. Day-suggestion lists only name real library entries.
const { boot, assert, run } = require('../lib/harness');

run('picker, create, add, remove, apply-to-programme, suggestion lists', async () => {
  const app = await boot({ seed: { kt_sessions: JSON.stringify([{ id: 1, date: '2026-09-14', week: 5, type: 'Push', prs: [],
    exercises: [{ name: 'Barbell Bench Press', sets: 3, reps: [8, 8, 8], weight: 185 }, { name: 'Cable Fly', sets: 3, reps: [12, 12, 12], weight: 30 }] }]),
    kt_custom_ex: JSON.stringify([{ name: 'Landmine Rotational Press', cat: 'Push', muscles: 'Chest, Front Delts, Obliques', equip: 'Landmine', desc: '', tips: [], _custom: true }]) } });
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      // suggestion lists resolve to real entries
      const names = new Set(getAllExercises().map(e => e.name));
      r.libMissing = [].concat(...Object.keys(EXERCISE_LIBRARY).map(k => EXERCISE_LIBRARY[k])).filter(n => !names.has(n));
      openDeckRunner('Push'); const first = runnerSession.exercises[0].name; const n0 = runnerSession.exercises.length;
      openRunnerExEdit(0); _openRunnerExPicker();
      const html0 = _buildExPickerItems('');
      r.picker = { custom: /Landmine Rotational Press/.test(html0) && /CUSTOM/.test(html0), recent: /Recent/.test(html0) && /Barbell Bench Press/.test(html0), subtitle: /Chest, Front Delts/.test(html0), count: /IN LIBRARY/.test(_buildRunnerExPickerHTML()) };
      r.muscleSearch = /Hip Thrust/.test(_buildExPickerItems('glute')) && !/Barbell Bench Press/.test(_buildExPickerItems('glute'));
      r.equipSearch = /Cable Fly/.test(_buildExPickerItems('cable'));
      runnerExPickerSetCat('Legs'); r.catChip = /Barbell Back Squat/.test(_buildExPickerItems('')) && !/Barbell Bench Press/.test(_buildExPickerItems('')); runnerExPickerSetCat('All');
      r.createRow = /Create “My Weird Move”/.test(_buildExPickerItems('My Weird Move'));
      runnerExCreateCustom('My Weird Move');
      r.created = { inLib: getCustomExercises().some(e => e.name === 'My Weird Move'), picked: _rExEditName === 'My Weird Move' };
      _rExEditName = first;                        // do not rename the card in this test
      // add after this
      _openRunnerExPicker('add'); runnerExAddPick('Face Pull');
      r.added = { n0: n0, len: runnerSession.exercises.length, at1: runnerSession.exercises[1].name, editIdx: runnerExEditIdx, sets: runnerSession.exercises[1].sets, reps: runnerSession.exercises[1].reps };
      // remove it again
      runnerExRemove();
      r.removed = { len: runnerSession.exercises.length, at1: runnerSession.exercises[1] ? runnerSession.exercises[1].name : null, sheetGone: !document.getElementById('runner-ex-edit-modal') };
      // rename + sets, applied to the programme from this week on
      const cr = getCustomRoutine(); const wkIdx = currentWeek - 1;
      const before = (cr.weeks[wkIdx].push || []).map(e => e.name);
      openRunnerExEdit(0); _rExEditName = 'Incline Dumbbell Press'; _rExEditSets = 4; _rExEditApply = true; saveRunnerExEdit();
      const cr2 = getCustomRoutine();
      const thisWk = (cr2.weeks[wkIdx].push || []).find(e => e.name === 'Incline Dumbbell Press');
      const nextWk = cr2.weeks[wkIdx + 1] ? (cr2.weeks[wkIdx + 1].push || []).find(e => e.name === 'Incline Dumbbell Press') : null;
      const prevWk = cr2.weeks[wkIdx - 1] ? (cr2.weeks[wkIdx - 1].push || []).some(e => e.name === first) : true;
      r.applied = { runner: runnerSession.exercises[0].name, before: before[0], first: first, thisWk: thisWk && thisWk.sets, nextWk: nextWk && nextWk.sets, prevUntouched: prevWk, backup: !!lsGet('kt_routine_backup') };
      closeDeckRunner();
      return r;
    });
    assert(out.libMissing.length === 0, 'every day-suggestion name exists in the library: ' + out.libMissing.join(', '));
    assert(out.picker.custom && out.picker.recent && out.picker.subtitle && out.picker.count, 'picker shows custom + recent + subtitles + count: ' + JSON.stringify(out.picker));
    assert(out.muscleSearch && out.equipSearch && out.catChip, 'search matches muscles and equipment; chips filter by category');
    assert(out.createRow && out.created.inLib && out.created.picked, 'typing an unknown name offers Create and selects it: ' + JSON.stringify(out.created));
    assert(out.added.len === out.added.n0 + 1 && out.added.at1 === 'Face Pull' && out.added.editIdx === 1 && out.added.sets === 3 && out.added.reps === 10, 'add inserts after the current card and opens its editor: ' + JSON.stringify(out.added));
    assert(out.removed.len === out.added.n0 && out.removed.at1 !== 'Face Pull' && out.removed.sheetGone, 'remove takes it out of today: ' + JSON.stringify(out.removed));
    assert(out.applied.runner === 'Incline Dumbbell Press' && out.applied.before === out.applied.first && out.applied.thisWk === 4 && out.applied.nextWk === 4 && out.applied.prevUntouched && out.applied.backup, 'apply writes the rename + sets into this week and later, snapshotting first: ' + JSON.stringify(out.applied));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
