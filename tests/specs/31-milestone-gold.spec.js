// Pins for M&M item 10 (C1·B): a milestone crossed today gilds the surfaces
// where its number already lives — gold eyebrow + factual line on the done
// card, gold ◆ streak chip — and stands down the next day. Nothing modal.
const { boot, assert, run } = require('../lib/harness');

run('milestones gild the done card and streak chip in place, today only', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      // Today is a Push lift day with a completed Push session.
      const cr = getCustomRoutine();
      const dow = (new Date().getDay() + 6) % 7;
      cr.weekPlan = cr.weekPlan || [];
      cr.weekPlan[dow] = 'Push';
      setCustomRoutine(cr);
      const sessions = getSessions();
      sessions.unshift({ id: 9e12, date: todayISO(), type: 'Push', week: currentWeek,
        exercises: [{ name: 'Bench Press', sets: 3, reps: [8, 8, 8], weight: 135, isMain: true }], prs: [] });
      lsSet('kt_sessions', sessions);
      // Milestones: one session-count and one streak threshold stamped today.
      lsSet('kt_milestones', { 'sess-10': todayISO(), 'streak-7': todayISO() });
      switchTab('log');
      const t = document.getElementById('screen').textContent;
      const html = document.getElementById('screen').innerHTML;
      const eyebrow = t.indexOf('◆ 10 SESSIONS LOGGED') > -1;
      const context = t.indexOf('10 sessions since') > -1;
      const chipGold = html.indexOf('◆ ') > -1 && !!document.querySelector('.kt-streak-chip .kt-milestone-tick');
      // Stamped yesterday → everything stands down.
      const y = new Date(Date.now() - 86400000);
      const yISO = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
      lsSet('kt_milestones', { 'sess-10': yISO, 'streak-7': yISO });
      render();
      const t2 = document.getElementById('screen').textContent;
      const stoodDown = t2.indexOf('◆ 10 SESSIONS LOGGED') === -1
        && !document.querySelector('.kt-streak-chip .kt-milestone-tick');
      return { eyebrow, context, chipGold, stoodDown };
    });
    assert(out.eyebrow, 'done card carries the gold milestone eyebrow');
    assert(out.context, 'one factual context line, no adjectives');
    assert(out.chipGold, 'streak chip goes gold with ◆ on the crossing day');
    assert(out.stoodDown, 'gold stands down the next day');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
