// Rest days are not dead ends: a missed lift this week is offered as a make-up (or skipped),
// a starter who installs on a rest day is pointed at the first session, every rest day says
// what tomorrow holds, and a programme nobody has trained yet stays on week 1.
const { boot, assert, run } = require('../lib/harness');

run('missed-session make-up, first-session pointer, tomorrow row, week-1 anchor', async () => {
  const app = await boot({ seed: { kt_sessions: '[]', kt_skips: '[]', kt_runs: '[]', kt_sports: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      const dow = (new Date().getDay() + 6) % 7;                 // Monday = 0
      const cr = getCustomRoutine();
      // Today = Rest, yesterday = Push (when there is a yesterday in this week), tomorrow = Pull.
      // On a Sunday "tomorrow" is NEXT week's Monday, so it goes in a week-2 override rather
      // than wrapping to index 0 — index 0 is six days PAST on a Sunday, and writing Pull
      // there would leave a second missed session that the skip assertions below do not expect.
      const plan = ['Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest'];
      plan[dow] = 'Rest'; if (dow > 0) plan[dow - 1] = 'Push';
      if (dow < 6) plan[dow + 1] = 'Pull';
      cr.weekPlan = plan; (cr.weeks || []).forEach(w => { delete w.weekPlan; });
      if (dow === 6) {
        const nextPlan = plan.slice(); nextPlan[0] = 'Pull';
        if (cr.weeks && cr.weeks[currentWeek]) cr.weeks[currentWeek].weekPlan = nextPlan;
      }
      setCustomRoutine(cr);
      r.dow = dow;
      // first-session pointer (no sessions ever)
      const missed0 = _missedThisWeek();
      switchTab('log');
      let txt = document.getElementById('screen').innerText;
      r.first = { missed: missed0, hasFirst: /FIRST SESSION/.test(txt), tomorrow: /TOMORROW · PULL/.test(txt), rest: /Rest day\./i.test(txt) };
      if (dow > 0) {
        r.missed = _missedThisWeek();
        r.makeup = { open: /still open/i.test(txt), cta: /MAKE-UP/.test(txt), btn: !!Array.from(document.querySelectorAll('button')).find(b => /Do .*Push now/.test(b.textContent)) };
        skipMissed(r.missed.date, r.missed.type);
        txt = document.getElementById('screen').innerText;
        r.afterSkip = { missed: _missedThisWeek(), open: /still open/i.test(txt), skips: getSkips().length };
      }
      // week-1 anchor guard: two Mondays ago, nothing trained → stays on week 1, re-anchors
      const twoMondaysAgo = addDays(_mostRecentMonday(), -14);
      currentWeek = 1; lsSet('kt_week', 1); localStorage.setItem('kt_week_monday', twoMondaysAgo);
      autoAdvanceWeek();
      r.anchor = { week: currentWeek, monday: localStorage.getItem('kt_week_monday') === _mostRecentMonday() };
      // with a session logged the calendar advances as before
      lsSet('kt_sessions', [{ id: 1, date: addDays(_mostRecentMonday(), -10), week: 1, type: 'Push', exercises: [{ name: 'Bench Press', sets: 3, reps: [8, 8, 8], weight: 100 }], prs: [] }]);
      currentWeek = 1; lsSet('kt_week', 1); localStorage.setItem('kt_week_monday', twoMondaysAgo);
      autoAdvanceWeek();
      r.advanced = currentWeek;
      return r;
    });
    assert(out.first.rest && out.first.tomorrow, 'rest day shows the TOMORROW row: ' + JSON.stringify(out.first));
    if (out.dow > 0) {
      assert(out.missed && out.missed.type === 'Push', 'yesterday\'s unlogged Push is the missed session: ' + JSON.stringify(out.missed));
      assert(out.makeup.open && out.makeup.cta && out.makeup.btn, 'rest day offers the make-up: ' + JSON.stringify(out.makeup));
      assert(out.afterSkip.missed === null && !out.afterSkip.open && out.afterSkip.skips === 1, 'skipping it clears the make-up: ' + JSON.stringify(out.afterSkip));
    } else {
      assert(out.first.missed === null && out.first.hasFirst, 'on a Monday nothing can be missed; the first-session pointer shows: ' + JSON.stringify(out.first));
    }
    assert(out.anchor.week === 1 && out.anchor.monday, 'an untrained programme stays on week 1 and re-anchors: ' + JSON.stringify(out.anchor));
    assert(out.advanced === 3, 'with a session logged the calendar still advances two weeks: ' + out.advanced);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
