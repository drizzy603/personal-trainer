// Clocks & calendars: programme weeks are Monday-boundary math, streaks
// survive New Year, and the rest timer is wall-clock anchored so locking the
// phone between sets can no longer freeze it or desync it from the Live
// Activity / rest-done alert.
const { boot, assert, run } = require('../lib/harness');

run('weekForDate uses Monday boundaries, streaks cross New Year', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      // weekForDate: same programme week for every day Mon..Sun of this week,
      // previous week for the Sunday before this Monday.
      const monNow = _mostRecentMonday();
      const mon = new Date(monNow + 'T00:00:00');
      const iso = d => _ymdLocal(d);
      const sunBefore = new Date(mon); sunBefore.setDate(mon.getDate() - 1);
      const sunOfWeek = new Date(mon); sunOfWeek.setDate(mon.getDate() + 6);
      const wk = {
        mon: weekForDate(iso(mon)),
        sunSame: weekForDate(iso(sunOfWeek)),
        sunPrev: weekForDate(iso(sunBefore)),
        today: weekForDate(todayISO()),
      };
      // calcStreak: one session per calendar week spanning New Year — the
      // Dec-31 week and the Jan-mid weeks must chain into one streak.
      const mk = (d) => ({ id: Math.random(), date: d, type: 'Push', week: 1, exercises: [] });
      const days = [];
      const cursor = new Date();
      for (let w = 0; w < 30; w++) { days.push(_ymdLocal(cursor)); cursor.setDate(cursor.getDate() - 7); }
      const streak = calcStreak(days.map(mk));
      return { wk, streak, cur: currentWeek };
    });
    assert(out.wk.mon === out.wk.today && out.wk.sunSame === out.wk.today, 'Mon..Sun share the current programme week');
    assert(out.wk.sunPrev === Math.max(1, out.wk.today - 1), 'the Sunday before Monday is last week, got ' + out.wk.sunPrev);
    assert(out.streak >= 26, '30 consecutive weekly sessions cross any year seam, got ' + out.streak);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('rest timer derives from a wall-clock deadline', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(async () => {
      openDeckRunner('Push');
      runnerEngaged = true; paintRunner();
      runnerCompleteSet();
      const started = runnerResting && runnerRestEndsAt > Date.now();
      const startLeft = runnerRestLeft;
      // +30s adjusts against the wall-clock remainder and re-anchors.
      runnerAddRest(30);
      const adjusted = Math.abs((runnerRestEndsAt - Date.now()) / 1000 - runnerRestLeft) < 2
        && runnerRestLeft > startLeft + 20;
      // Simulate the phone being locked past the deadline: rewind the anchor
      // and run the resume path — the finish must fire, not phantom rest.
      runnerRestEndsAt = Date.now() - 4000;
      _resumeDayAndRest();
      const finished = !runnerResting && runnerRestEndsAt === 0;
      // Skip clears the anchor too.
      runnerCompleteSet();
      const resting2 = runnerResting && runnerRestEndsAt > 0;
      runnerSkipRest();
      const skipped = !runnerResting && runnerRestEndsAt === 0;
      closeDeckRunner();
      return { started, adjusted, finished, resting2, skipped };
    });
    assert(out.started, 'completing a set arms a future wall-clock deadline');
    assert(out.adjusted, '+30s re-anchors the deadline to match the displayed clock');
    assert(out.finished, 'resume after a background-elapsed rest runs the finish path');
    assert(out.resting2 && out.skipped, 'skip clears the wall-clock anchor');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
