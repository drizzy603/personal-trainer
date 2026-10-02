// The rest Live Activity wears the room (web 20261001-1, build 57): every TrovoTimer.startTimer
// carries the rest granted so far (total; it grows with +30s and holds through -15s, like the
// in-app bar's denominator) and the room's tokens (theme), so the Lock Screen card is paper/ink
// with the blue bar in Heavyweight and near-black with the lime bar in Lime, and the always-black
// Dynamic Island takes the accent tuned for black.
const { boot, assert, run } = require('../lib/harness');

for (const room of ['heavyweight', 'dark']) {
  run('rest timer payload carries the total and the ' + room + ' room', async () => {
    const app = await boot({ native: true, seed: { kt_theme: room } });
    try {
      const out = await app.page.evaluate(async () => {
        const wait = ms => new Promise(res => setTimeout(res, ms));
        const sent = [];
        Capacitor.Plugins.TrovoTimer = { startTimer: (o) => { sent.push(JSON.parse(JSON.stringify(o))); return Promise.resolve(); }, endTimer: () => Promise.resolve() };
        switchTab('log'); switchLogSub('workout'); await wait(20);
        openDeckRunner('Push');
        runnerSetWeight(160); runnerSetReps(8); runnerCompleteSet(); await wait(30);
        const first = sent[sent.length - 1];
        // -15s: the remainder drops, the granted total holds
        runnerAddRest(-15); await wait(10);
        const minus = sent[sent.length - 1];
        // +30s twice: past the original total, the total grows with it
        runnerAddRest(30); runnerAddRest(30); await wait(10);
        const plus = sent[sent.length - 1];
        closeDeckRunner();
        return { first, minus, plus, n: sent.length };
      });
      const T = out.first && out.first.theme;
      assert(out.first && out.first.seconds > 0 && out.first.total === out.first.seconds, 'a fresh rest: total = seconds: ' + JSON.stringify(out.first));
      assert(out.minus.seconds === out.first.seconds - 15 && out.minus.total === out.first.total, '-15s keeps the total: ' + JSON.stringify([out.minus.seconds, out.minus.total]));
      assert(out.plus.seconds === out.minus.seconds + 60 && out.plus.total === out.plus.seconds && out.plus.total > out.first.total, '+30s past the total grows it: ' + JSON.stringify([out.plus.seconds, out.plus.total]));
      if (room === 'heavyweight') {
        assert(T && T.room === 'heavyweight' && T.paper === true && T.bg === '#f7f5ef' && T.card === '#ffffff' && T.text === '#0f0f0f' && T.muted === '#6b6b66' &&
          T.accent === '#0a43f5' && T.onAccent === '#ffffff' && T.earned === '#b7f000' && T.earnedInk === '#4f7000' && T.satAccent === '#4d7cff', 'Heavyweight tokens: ' + JSON.stringify(T));
      } else {
        assert(T && T.room === 'dark' && T.paper === false && T.bg === '#0b0b0c' && T.card === '#151517' && T.text === '#f4f4f1' && T.muted === '#8c8c91' &&
          T.accent === '#d8ff63' && T.earned === '#d8ff63' && T.earnedInk === '#d8ff63' && T.satAccent === '#d8ff63', 'Lime tokens: ' + JSON.stringify(T));
      }
      assert(out.plus.theme && out.plus.theme.room === T.room, 'every restart carries the room');
      assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  });
}

run('dev nav runner/rest starts a real rest and its Live Activity (for checking in the simulator)', async () => {
  const app = await boot({ native: true });
  try {
    // The route fires 120 ms into boot: the timer mock must exist before the page's scripts run.
    await app.page.addInitScript(() => {
      window.__sent = [];
      window.Capacitor.Plugins.TrovoTimer = { startTimer: (o) => { window.__sent.push(o); return Promise.resolve(); }, endTimer: () => Promise.resolve() };
    });
    await app.page.evaluate(() => localStorage.setItem('kt_dev_nav', 'runner/rest'));
    await app.page.reload({ waitUntil: 'load' });
    await app.page.waitForFunction(() => typeof window.render === 'function');
    await app.page.waitForTimeout(700);
    const out = await app.page.evaluate(() => ({ open: runnerOpen, resting: runnerResting, left: runnerRestLeft, logged: Object.values(runnerCompleted).reduce((a, b) => a + b, 0),
      sent: window.__sent.length, theme: window.__sent[0] && window.__sent[0].theme && window.__sent[0].theme.room, consumed: localStorage.getItem('kt_dev_nav') === null }));
    assert(out.open && out.resting && out.left > 0 && out.logged === 1 && out.consumed, 'the route opens the runner and starts a rest after one set: ' + JSON.stringify(out));
    assert(out.sent === 1 && out.theme === 'heavyweight', 'the rest reaches the Live Activity with the room: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
