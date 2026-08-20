// History set editing: reps/weights are correctable after the fact, legacy
// nested shapes normalize on save, and the PR book recomputes so a typo'd
// record doesn't outlive its session (delete recomputes too).
const { boot, assert, run } = require('../lib/harness');

run('edit corrects sets and PRs recompute both ways', async () => {
  const app = await boot({ seed: { kt_sessions: '[]', kt_prs: '{}', kt_weights: '{}' } });
  try {
    const out = await app.page.evaluate(() => {
      // Fat-fingered 1850 became a "permanent" PR under the old code.
      const sessions = [];
      sessions.push({ id: 11, date: '2026-08-17', type: 'Push', week: 1,
        exercises: [{ name: 'Barbell Bench Press', isMain: true, sets: 3, reps: [8,8,8], weight: 1850, weightLog: [185,185,1850], rpe: 8 }] });
      // Legacy nested shape to prove normalize-on-save.
      sessions.push({ id: 12, date: '2026-08-10', type: 'Push', week: 1,
        exercises: [{ name: 'Overhead Press', sets: [{reps:8,weight:95,rpe:7},{reps:8,weight:95,rpe:7}] }] });
      lsSet('kt_sessions', sessions);
      checkAndUpdatePRs(sessions[0].exercises);
      const prBefore = getPRs()['Barbell Bench Press'];

      switchTab('progress'); render();
      openSessionEditor(11);
      const sheet = !!document.getElementById('sessEditOverlay');
      document.getElementById('se_0_2_w').value = '185'; // fix the typo
      saveSessionEdit();
      const s = getSessions().find(x => x.id === 11);
      const prAfter = getPRs()['Barbell Bench Press'];

      // Legacy shape: edit + save normalizes to the flat shape.
      openSessionEditor(12);
      document.getElementById('se_0_1_r').value = '6';
      saveSessionEdit();
      const legacy = getSessions().find(x => x.id === 12).exercises[0];

      // Delete recomputes too: drop the bench session, PR entry vanishes.
      lsSet('kt_sessions', getSessions().filter(x => x.id !== 11));
      recomputePRs();
      const prGone = getPRs()['Barbell Bench Press'] === undefined;

      return { sheet, prBefore, prAfter, top: s.exercises[0].weight,
        legacyReps: legacy.reps, legacySets: legacy.sets, legacyW: legacy.weight, prGone };
    });
    assert(out.sheet, 'editor sheet opens from history');
    assert(out.prBefore === 1850 && out.prAfter === 185, 'PR recomputes down after the fix, got ' + out.prAfter);
    assert(out.top === 185, 'exercise top weight follows the corrected sets');
    assert(String(out.legacyReps) === '8,6' && out.legacySets === 2 && out.legacyW === 95, 'legacy nested shape normalizes on save');
    assert(out.prGone, 'deleting the only source of a PR removes it');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
