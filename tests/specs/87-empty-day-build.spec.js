// The owner's report (2026-09-25): "today i changed rest to arm day, tried starting but didnt
// have the start button anywhere". A lift day with no exercises (Arms on a Push/Pull/Legs plan)
// now says so on Today and offers BUILD YOUR ARMS DAY; the start link, the coach card, reminders,
// the week count and the streak treat it honestly; the schedule editor marks it empty; building it
// writes this week and every week after (deloads keep their own scheme), then Start appears and the
// watch and widget follow. Undo takes it all back.
const { boot, assert, run } = require('../lib/harness');

run('an empty Arms day: honest everywhere, built in a tap, then Start', async () => {
  const app = await boot({ native: true, seed: { kt_notif_daily: '1' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {}, dow = (new Date().getDay() + 6) % 7, c = currentWeek - 1;
      let ctx = null; const sched = [];
      Capacitor.Plugins.TrovoWatch.updateContext = (p) => { ctx = p; return Promise.resolve({ sent: true }); };
      Capacitor.Plugins.LocalNotifications = { schedule: (o) => { (o.notifications || []).forEach(n => sched.push(n)); return Promise.resolve(); }, cancel: () => Promise.resolve(),
        checkPermissions: () => Promise.resolve({ display: 'granted' }), requestPermissions: () => Promise.resolve({ display: 'granted' }), getPending: () => Promise.resolve({ notifications: [] }) };
      const orig = localStorage.getItem('kt_routine');
      const planned0 = _weekStats().planned;
      setWeekPlanDay(dow, 'Arms'); await wait(30);
      switchTab('log'); switchLogSub('workout'); await wait(30);
      const scr = document.getElementById('screen').textContent;
      r.today = { tapToStart: /Tap to start/.test(scr), nothing: /Nothing planned for Arms yet/.test(scr), cta: (document.querySelector('#screen .kt-cta') || {}).textContent };
      r.card = fallbackCoachCard(getTodayActivity()).message;
      r.planned = [planned0, _weekStats().planned];
      _syncReminders(); await wait(30);
      r.reminderToday = sched.some(n => n.schedule && new Date(n.schedule.at).toDateString() === new Date().toDateString());
      r.liftCount9 = _weekLiftCount(9, 'Arms');
      // the start link opens the builder
      startTodaySession(); await wait(30);
      r.startOpens = !!document.getElementById('buildDayOverlay');
      closeBuildDay();
      // the schedule editor marks the day empty and offers to build it
      switchTab('settings'); _schedPick(dow); await wait(30);
      const st = document.getElementById('screen').textContent;
      r.sched = { empty: /Arms · empty/.test(st), build: !!document.querySelector('.kt-sched-build') };
      _schedEditDow = null;
      // build it
      switchTab('log'); switchLogSub('workout'); await wait(30);
      openBuildDay('Arms'); await wait(30);
      r.suggested = [...document.querySelectorAll('.kt-bd-row')].map(b => b.textContent.replace(/\s+/g, ' ').trim());
      document.getElementById('bdGo').click(); await wait(80);
      const cr = getCustomRoutine();
      r.weeks = cr.weeks.map(w => (w.arms || []).length).join(',');
      r.first = cr.weeks[c].arms[0];
      r.deload = cr.weeks[11].arms && cr.weeks[11].arms.find(e => !e.isMain);
      r.after = { cta: (document.querySelector('#screen .kt-cta') || {}).textContent.replace(/\s+/g, ' ').trim(), widget: _nativeSummaryDays(1)[0].lifts, planned: _weekStats().planned };
      _lastWatchPlan = ''; _pushWatchPlan();
      r.watch = ctx && JSON.parse(ctx.json).exercises.length;
      await wait(400);
      document.querySelector('#toast .kt-toast-undo').click(); await wait(50);
      r.undone = !(getCustomRoutine().weeks[c].arms || []).length;
      return r;
    });
    assert(!out.today.tapToStart && out.today.nothing && /BUILD YOUR ARMS DAY/.test(out.today.cta), 'Today says the day is empty and offers to build it: ' + JSON.stringify(out.today));
    assert(!/No lifts, no runs/.test(out.card) && /no exercises/.test(out.card), 'the coach card does not call it a rest day: ' + out.card);
    assert(out.planned[1] === out.planned[0], 'the week count does not gain an empty session: ' + JSON.stringify(out.planned));
    assert(!out.reminderToday, 'no reminder for a day that cannot be started');
    assert(out.liftCount9 === 0, 'a week without the slot counts 0 lifts (it borrowed this week): ' + out.liftCount9);
    assert(out.startOpens, 'the start link opens the builder instead of refusing');
    assert(out.sched.empty && out.sched.build, 'the schedule editor marks the day empty with Build it: ' + JSON.stringify(out.sched));
    assert(out.suggested.length === 5 && /Close Grip Bench Press/.test(out.suggested[0]) && /MAIN/.test(out.suggested[0]), 'five arm suggestions, a barbell main first: ' + JSON.stringify(out.suggested));
    assert(out.weeks === '0,0,0,0,0,5,5,5,5,5,5,5' && out.first.isMain && out.first.rec === null, 'built into this week and every week after: ' + JSON.stringify([out.weeks, out.first]));
    assert(out.deload && out.deload.sets > 0 && out.deload.reps > 0, 'the deload week has its own scheme: ' + JSON.stringify(out.deload));
    assert(/START\s*Arms · 5 exercises/.test(out.after.cta) && out.after.widget === 5 && out.watch === 5, 'Start appears; the widget and watch follow: ' + JSON.stringify([out.after, out.watch]));
    assert(out.undone, 'Undo takes the built day back');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
