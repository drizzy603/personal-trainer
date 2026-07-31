// Milestones: silent baseline on first run, one-shot gold toast on a live
// crossing, trophy shelf on Progress, and backup round-trip of kt_milestones.
const { boot, assert, run } = require('../lib/harness');

run('milestones baseline silently, celebrate live crossings once', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(async () => {
      // Boot already baselined the seed data (kt_milestones written, no toast).
      const baseline = lsGet('kt_milestones');
      const baselineKeys = Object.keys(baseline || {});
      // Every baselined entry must be silent (1), never dated.
      const allSilent = baselineKeys.every(k => baseline[k] === 1);

      // Force a live crossing: sit just under a session threshold, then log.
      const sessions = getSessions();
      const step = [10, 25, 50, 100, 200, 365].find(n => n > sessions.length + 1);
      while (getSessions().length < step - 1) {
        const s = getSessions();
        s.unshift({ id: Date.now() + s.length, date: '2026-01-01', type: 'Push', week: 1, exercises: [], prs: [] });
        lsSet('kt_sessions', s);
      }
      checkMilestones({ quiet: true }); // absorb the padding quietly
      const before = Object.keys(lsGet('kt_milestones')).length;

      const s2 = getSessions();
      s2.unshift({ id: Date.now(), date: todayISO(), type: 'Push', week: 1, exercises: [], prs: [] });
      lsSet('kt_sessions', s2);
      const fresh = checkMilestones({});
      const after = lsGet('kt_milestones');
      const key = 'sess-' + step;

      // A second check must not re-fire the same milestone.
      const again = checkMilestones({});

      switchTab('progress');
      const shelf = document.body.textContent.indexOf('MILESTONES') !== -1;
      const inBackup = BACKUP_KEYS.indexOf('kt_milestones') !== -1;

      return {
        baselineCount: baselineKeys.length, allSilent,
        freshCount: fresh.length, freshLabel: fresh[0] || '',
        dated: /^\d{4}-\d{2}-\d{2}$/.test(String(after[key])),
        grew: Object.keys(after).length === before + 1,
        refire: again.length, shelf, inBackup,
      };
    });
    assert(out.baselineCount > 0, 'seed data baselines at least one milestone');
    assert(out.allSilent, 'baseline entries are silent (1), not dated');
    assert(out.freshCount === 1, 'live crossing earns exactly one, got ' + out.freshCount);
    assert(/sessions logged/.test(out.freshLabel), 'label names the marker: ' + out.freshLabel);
    assert(out.dated, 'live crossing is stamped with a date');
    assert(out.grew, 'exactly one new key recorded');
    assert(out.refire === 0, 'same milestone never fires twice');
    assert(out.shelf, 'trophy shelf renders on Progress');
    assert(out.inBackup, 'kt_milestones registered in BACKUP_KEYS');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
