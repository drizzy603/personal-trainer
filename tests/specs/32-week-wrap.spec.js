// Pins for M&M item 11 (C1·C): the Sunday wrapped block — honest week stats
// (heaviest-week is earned against every prior week, never asserted), the
// bar-grammar strip, and dismiss retiring it for the week.
const { boot, assert, run } = require('../lib/harness');

run('week stats are honest; wrapped block renders and dismisses', async () => {
  const app = await boot({ seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      const dow = (new Date().getDay() + 6) % 7;
      // One session today; one much heavier session last week.
      const lastWk = new Date(Date.now() - 7 * 86400000);
      const lastISO = lastWk.getFullYear() + '-' + String(lastWk.getMonth() + 1).padStart(2, '0') + '-' + String(lastWk.getDate()).padStart(2, '0');
      lsSet('kt_sessions', [
        { id: 1, date: todayISO(), type: 'Push', week: 2,
          exercises: [{ name: 'Bench Press', sets: 3, reps: [8, 8, 8], weight: 100, isMain: true }], prs: ['Bench Press'] },
        { id: 2, date: lastISO, type: 'Push', week: 1,
          exercises: [{ name: 'Bench Press', sets: 5, reps: [10, 10, 10, 10, 10], weight: 200, isMain: true }], prs: [] },
      ]);
      const st1 = _weekStats();
      const honest = st1.count === 1 && st1.prs === 1 && st1.dayVol[dow] > 0 && st1.heaviest === false;
      // Drop the heavier prior week — now this one is genuinely heaviest.
      lsSet('kt_sessions', [{ id: 1, date: todayISO(), type: 'Push', week: 2,
        exercises: [{ name: 'Bench Press', sets: 3, reps: [8, 8, 8], weight: 100, isMain: true }], prs: [] }]);
      const st2 = _weekStats();
      const earned = st2.heaviest === true && st2.volume === 2400;
      // Force the due gate to see the block render, then dismiss it.
      const orig = window._weekWrapDue;
      window._weekWrapDue = () => true;
      switchTab('log');
      const t = document.getElementById('screen').textContent;
      const card = t.indexOf('WRAPPED') > -1 && t.indexOf('Heaviest week yet.') > -1
        && t.indexOf('Dismiss') > -1 && t.indexOf('Volume lb') > -1;
      window._weekWrapDue = orig;
      dismissWeekWrap();
      const retired = String(lsGet('kt_last_weekwrap')) === _mostRecentMonday()
        && document.getElementById('screen').textContent.indexOf('Heaviest week yet.') === -1;
      return { honest, earned, card, retired };
    });
    assert(out.honest, 'week stats count only this week; heavier past kills the claim');
    assert(out.earned, 'heaviest-week is earned when true, volume math holds');
    assert(out.card, 'wrapped block renders facts, strip, and both actions');
    assert(out.retired, 'dismiss retires it for the week');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
