// Boot smoke: the app comes up on the demo seed with no JS errors, the
// routine is live, and all four tabs render.
const { boot, assert, run } = require('../lib/harness');

run('boot + tab smoke', async () => {
  const app = await boot();
  try {
    const state = await app.page.evaluate(() => ({
      routine: !!getCustomRoutine(),
      sessions: getSessions().length,
      tab: currentTab,
      body: document.body.innerHTML.length,
    }));
    assert(state.routine, 'routine should load from seed');
    assert(state.sessions > 0, 'seed sessions should be visible');
    assert(state.tab === 'log', 'boots on Log tab');
    assert(state.body > 5000, 'Log tab should render content');

    for (const tab of ['progress', 'coach', 'settings', 'log']) {
      const len = await app.page.evaluate((t) => { switchTab(t); return document.body.innerHTML.length; }, tab);
      assert(len > 3000, tab + ' tab should render content');
    }

    const noMic = await app.page.evaluate(() => typeof window.voiceLogSet === 'undefined');
    assert(noMic, 'voice logging must stay removed');
    assert(app.errors.length === 0, 'no page errors, got: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
