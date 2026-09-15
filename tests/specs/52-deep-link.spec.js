// Native bridge payloads for build 44: the watch learns whether a programme exists, the widget
// summary carries the day streak, and the widget's trovo://start deep link opens today's session.
const { boot, assert, run } = require('../lib/harness');

run('watch plan hasPlan, widget streakDays, trovo://start deep link', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const r = {};
      Capacitor.Plugins.TrovoWatch = { updateContext: (p) => { window._ctx = p; return Promise.resolve({ sent: true }); } };
      Capacitor.Plugins.TrovoWidget = Object.assign(Capacitor.Plugins.TrovoWidget || {}, {
        updateSummary: (p) => { window._sum = p; return Promise.resolve({}); },
        consumeDeepLink: () => { window._consumed = (window._consumed || 0) + 1; return Promise.resolve({ url: '' }); },
      });
      // with a programme
      _lastWatchPlan = ''; _pushWatchPlan();
      r.withPlan = JSON.parse(window._ctx.json);
      _lastNativeSummary = null; _runNativeSync();
      r.summary = JSON.parse(window._sum.json);
      // today = Push so the deep link has a session to open
      const dow = (new Date().getDay() + 6) % 7; const cr = getCustomRoutine();
      const plan = ['Rest','Rest','Rest','Rest','Rest','Rest','Rest']; plan[dow] = 'Push'; cr.weekPlan = plan; (cr.weeks || []).forEach(w => { delete w.weekPlan; }); setCustomRoutine(cr);
      switchTab('progress');
      r.handled = _handleDeepLink('trovo://start');
      await new Promise(res => setTimeout(res, 300));
      r.afterLink = { tab: currentTab, sheet: !!document.getElementById('sessionOverviewOverlay'), runner: !!runnerOpen, consumed: window._consumed || 0 };
      closeSessionOverview(); if (runnerOpen) closeDeckRunner();
      r.other = _handleDeepLink('mailto:someone@example.com');
      // without a programme
      lsDel('kt_routine'); _lastWatchPlan = ''; _pushWatchPlan();
      r.noPlan = JSON.parse(window._ctx.json);
      return r;
    });
    assert(out.withPlan.hasPlan === true && out.withPlan.type !== 'none', 'watch payload says a programme exists: ' + JSON.stringify({ hasPlan: out.withPlan.hasPlan, type: out.withPlan.type }));
    assert(typeof out.summary.streakDays === 'number' && typeof out.summary.streak === 'number', 'widget summary carries streakDays alongside the legacy weeks: ' + JSON.stringify({ d: out.summary.streakDays, w: out.summary.streak }));
    assert(out.handled && out.afterLink.tab === 'log' && (out.afterLink.sheet || out.afterLink.runner) && out.afterLink.consumed >= 1, 'trovo://start lands on Log and opens today\'s session, clearing the parked link: ' + JSON.stringify(out.afterLink));
    assert(out.other === false, 'unknown links are ignored');
    assert(out.noPlan.hasPlan === false && out.noPlan.type === 'none' && out.noPlan.dayName === 'No plan', 'with no programme the watch is told so: ' + JSON.stringify(out.noPlan));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
