// The watch follows the phone's look: the plan payload carries the room's tokens, and picking a
// theme schedules the push that delivers them.
const { boot, assert, run } = require('../lib/harness');

run('watch plan payload carries the theme; changing the theme pushes it', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      Capacitor.Plugins.TrovoWatch = { updateContext: (p) => { window._ctx = p; return Promise.resolve({ sent: true }); } };
      applyTheme('heavyweight'); _lastWatchPlan = ''; _pushWatchPlan();
      r.hw = JSON.parse(window._ctx.json).theme;
      applyTheme('dark'); _lastWatchPlan = ''; _pushWatchPlan();
      r.dark = JSON.parse(window._ctx.json).theme;
      // a theme change schedules the debounced native sync that carries the push
      _nativeSyncTimer = null; applyTheme('heavyweight'); r.scheduled = !!_nativeSyncTimer;
      // and the payload signature changes with the theme, so the dedupe lets it through
      _lastWatchPlan = ''; _pushWatchPlan(); const sig1 = _lastWatchPlan; applyTheme('dark'); _pushWatchPlan(); r.sigChanged = _lastWatchPlan !== sig1;
      applyTheme('heavyweight');
      return r;
    });
    assert(out.hw && out.hw.room === 'heavyweight' && out.hw.paper === true && out.hw.accent === '#4d7cff' && out.hw.earned === '#b7f000' && out.hw.bg === '#f7f5ef' && out.hw.onAccent === '#ffffff', 'Heavyweight tokens ride the plan: ' + JSON.stringify(out.hw));
    assert(out.dark && out.dark.room === 'dark' && out.dark.paper === false && out.dark.accent === '#d8ff63' && out.dark.earned === '#d8ff63' && out.dark.bg === '#0b0b0c', 'Lime tokens ride the plan: ' + JSON.stringify(out.dark));
    assert(out.scheduled && out.sigChanged, 'a theme change schedules the push and changes the payload: ' + JSON.stringify({ scheduled: out.scheduled, sigChanged: out.sigChanged }));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
