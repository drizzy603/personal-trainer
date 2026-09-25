// Log › Run on a sport-first plan (web 20260924-11). The demo seed's hybrid block leads with
// Cycling and also schedules runs: it gets a Run tab next to Bike, and Log › Run always renders
// the Run segment (it used to render the Cycling log, so Today's run CTA, the coach's run link
// and the Health card's undo all landed there). An unpinned tab reached by a route shows for the
// visit; a scheduled sport day's CTA opens that sport's tab; a Health run logged off the Run tab
// carries its own Undo.
const { boot, assert, run } = require('../lib/harness');

run('Log › Run: a Run tab for hybrid plans, the Run segment always, sport CTA, Health undo', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const r = {};
      const bar = () => [...document.querySelectorAll('.log-subtabs .log-subtab')].map(b => b.textContent + (b.classList.contains('active') ? '*' : '')).join(' ');
      r.primary = getPrimaryActivity();
      r.tabs = getLogTabs();
      switchTab('log'); switchLogSub('run'); await wait(30);
      r.runBar = bar();
      r.runSeg = !!document.querySelector('#screen .kt-hero-headline') && !document.querySelector('#screen .kt-sport-allrow') && /run|km|mi/i.test(document.querySelector('#screen').textContent);
      r.cyclingSchedule = /Cycling Schedule/i.test(document.getElementById('screen').textContent);
      switchLogSub('Cycling'); await wait(30);
      r.bikeBar = bar(); r.bikeSchedule = /Cycling/i.test(document.getElementById('screen').textContent);

      // pinned tabs without Run: a route into Run shows it for the visit
      lsSet('kt_log_tabs', ['Cycling', 'body']);
      switchLogSub('run'); await wait(30);
      r.transient = bar();
      switchLogSub('body'); await wait(30);
      r.afterLeave = bar();
      lsDel('kt_log_tabs');

      // plans: Run-first keeps Run + Body; a sport plan with no runs has no Run tab
      const cr = getCustomRoutine(); (cr.weeks || []).forEach(w => { delete w.weekPlan; });
      cr.weekPlan = ['Push', 'Run', 'Pull', 'Run', 'Rest', 'Cycling', 'Legs']; setCustomRoutine(cr);
      r.runFirst = getLogTabs();
      cr.weekPlan = ['Push', 'Cycling', 'Pull', 'Cycling', 'Rest', 'Rest', 'Legs']; setCustomRoutine(cr);
      r.sportOnly = getLogTabs();

      // a scheduled sport day's Today CTA opens that sport's tab
      const dow = (new Date().getDay() + 6) % 7;
      const plan = ['Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest']; plan[dow] = 'Cycling';
      cr.weekPlan = plan; setCustomRoutine(cr);
      switchLogSub('workout'); await wait(30);
      const cta = document.querySelector('#screen .kt-cta');
      r.sportCta = cta ? { onclick: cta.getAttribute('onclick'), title: cta.querySelector('.kt-cta-title').textContent } : null;

      // a Health run logged from another tab: the toast carries the Undo
      _hkPendingRun = { uuid: 'hk-79', type: 'run', distanceKm: 5.2, durationSec: 1560, startDate: new Date().toISOString(), avgHr: 0 };
      const before = getRuns().length;
      logPendingHealthRun(); await wait(30);
      r.logged = getRuns().length === before + 1;
      const undo = document.querySelector('#toast .kt-toast-undo');
      r.toast = document.getElementById('toast').textContent;
      if (undo) undo.click();
      await wait(30);
      r.undone = getRuns().length === before && !runLogConfirmed;
      return r;
    });
    assert(out.primary === 'Cycling' && JSON.stringify(out.tabs) === '["Cycling","run","body"]', 'a Cycling-first plan with run days gets Bike, Run, Body: ' + JSON.stringify([out.primary, out.tabs]));
    assert(out.runBar === 'Workout Bike Run* Body +' && out.runSeg && !out.cyclingSchedule, 'Log › Run is the Run segment with Run active: ' + JSON.stringify(out));
    assert(out.bikeBar === 'Workout Bike* Run Body +' && out.bikeSchedule, 'the sport keeps its own tab: ' + out.bikeBar);
    assert(out.transient === 'Workout Bike Body Run* +' && out.afterLeave === 'Workout Bike Body* +', 'an unpinned tab shows only while you are on it: ' + JSON.stringify([out.transient, out.afterLeave]));
    assert(JSON.stringify(out.runFirst) === '["run","body"]' && JSON.stringify(out.sportOnly) === '["Cycling","body"]', 'defaults follow the plan: ' + JSON.stringify([out.runFirst, out.sportOnly]));
    assert(out.sportCta && /switchLogSub\('Cycling'\)/.test(out.sportCta.onclick) && out.sportCta.title === 'Bike tab', "a sport day's CTA opens the sport's tab: " + JSON.stringify(out.sportCta));
    assert(out.logged && /run logged from Apple Health/.test(out.toast) && !/undo on the Run tab/.test(out.toast) && out.undone, 'the Health toast carries a working Undo: ' + JSON.stringify([out.logged, out.toast, out.undone]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
