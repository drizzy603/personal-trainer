// Notifications: the iOS permission dialog never fires mid-set, the pre-session sheet asks
// once, the COMPLETE sheet offers reminders once, and reminders cover 28 days at an hour
// inferred from when the user actually trains.
const { boot, assert, run } = require('../lib/harness');

function at(daysAgo, hour) { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(hour, 30, 0, 0); return d; }

run('reminder horizon, inferred hour, and the two calm moments to ask', async () => {
  const sessions = [1, 3, 5].map((n, i) => ({ id: at(n, 18).getTime() + i, date: at(n, 18).toISOString().slice(0, 10), week: 1, type: 'Push',
    startedAt: at(n, 18).getTime(), exercises: [{ name: 'Bench Press', isMain: true, sets: 3, reps: [8, 8, 8], weight: 185, rpe: 7 }], prs: [] }));
  const app = await boot({ native: true, seed: { kt_sessions: JSON.stringify(sessions), kt_notif_daily: '1' } });
  try {
    const out = await app.page.evaluate(async () => {
      const r = {};
      localStorage.removeItem('kt_notif_hour'); localStorage.removeItem('kt_notif_asked'); localStorage.removeItem('kt_notif_offered');
      r.days7 = _nativeSummaryDays().length; r.days28 = _nativeSummaryDays(28).length;
      r.hourInferred = _reminderHour();
      localStorage.setItem('kt_notif_hour', '7'); r.hourChosen = _reminderHour(); localStorage.removeItem('kt_notif_hour');
      const LN = Capacitor.Plugins.LocalNotifications;
      LN.schedule = (p) => { window._sched = p; return Promise.resolve({}); };
      LN.cancel = (p) => { window._cancel = p; return Promise.resolve({}); };
      _syncReminders();
      r.cancelIds = (window._cancel && window._cancel.notifications || []).length;
      const n = (window._sched && window._sched.notifications) || [];
      r.sched = { count: n.length, idsOk: n.every(x => x.id >= 9101 && x.id <= 9128), hoursOk: n.every(x => new Date(x.schedule.at).getHours() === _reminderHour()), maxDays: n.length ? Math.round((new Date(n[n.length - 1].schedule.at) - Date.now()) / 86400000) : 0 };
      // mid-set never prompts; the sheet does
      LN.checkPermissions = () => Promise.resolve({ display: 'prompt' });
      LN.requestPermissions = () => { window._asked = (window._asked || 0) + 1; return Promise.resolve({ display: 'denied' }); };
      scheduleRestNotification({ name: 'Bench Press' }, 1, 60);
      await new Promise(res => setTimeout(res, 60));
      r.askedMidSet = window._asked || 0;
      openSessionOverview({ type: 'lift', dayName: 'Push', weekday: 'Mon', exercises: getSessionExercises('Push') });
      r.offerRow = !!document.getElementById('kt-ov-notif');
      _askRestAlerts();
      await new Promise(res => setTimeout(res, 60));
      r.askedFromSheet = window._asked || 0; r.askedFlag = localStorage.getItem('kt_notif_asked'); r.rowGone = !document.getElementById('kt-ov-notif');
      closeSessionOverview();
      openSessionOverview({ type: 'lift', dayName: 'Push', weekday: 'Mon', exercises: getSessionExercises('Push') });
      r.offerRowSecondTime = !!document.getElementById('kt-ov-notif');
      closeSessionOverview();
      // reminders offered once after a finished session
      localStorage.setItem('kt_notif_daily', '0'); localStorage.removeItem('kt_notif_offered');
      openCompleteSheet({ rec: getSessions()[0], planned: 3, startedAt: Date.now() - 60000 });
      r.remindOffer = { row: !!document.getElementById('kt-cmp-remind'), text: (document.getElementById('kt-cmp-remind') || {}).textContent || '', flag: localStorage.getItem('kt_notif_offered') };
      closeCompleteSheet();
      openCompleteSheet({ rec: getSessions()[0], planned: 3, startedAt: Date.now() - 60000 });
      r.remindOfferAgain = !!document.getElementById('kt-cmp-remind');
      closeCompleteSheet();
      // a finished runner session records when it started
      openDeckRunner('Push');
      runnerSession.exercises.forEach((e, i) => { runnerGoTo(i); runnerLogAllAtTarget(); });
      runnerFinishSession();
      r.startedAt = typeof getSessions()[0].startedAt === 'number';
      closeCompleteSheet();
      return r;
    });
    assert(out.days7 === 7 && out.days28 === 28, 'summary days default to 7, reminders ask for 28: ' + out.days7 + '/' + out.days28);
    assert(out.hourInferred === 17 && out.hourChosen === 7, 'hour is inferred from 18:30 sessions (17) or taken from the setting (7): ' + out.hourInferred + '/' + out.hourChosen);
    assert(out.cancelIds === 28 && out.sched.count > 0 && out.sched.count <= 28 && out.sched.idsOk && out.sched.hoursOk && out.sched.maxDays >= 14, 'reminders span up to 28 days at the inferred hour: ' + JSON.stringify(out.sched) + ' cancel=' + out.cancelIds);
    assert(out.askedMidSet === 0, 'scheduling a rest alert mid-set never opens the permission dialog');
    assert(out.offerRow && out.askedFromSheet === 1 && out.askedFlag === '1' && out.rowGone && !out.offerRowSecondTime, 'the pre-session sheet asks once: ' + JSON.stringify({ offerRow: out.offerRow, asked: out.askedFromSheet, flag: out.askedFlag, gone: out.rowGone, again: out.offerRowSecondTime }));
    assert(out.remindOffer.row && /17:00/.test(out.remindOffer.text) && out.remindOffer.flag === '1' && !out.remindOfferAgain, 'the COMPLETE sheet offers reminders once, at the inferred hour: ' + JSON.stringify(out.remindOffer) + ' again=' + out.remindOfferAgain);
    assert(out.startedAt, 'finished sessions record startedAt');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
