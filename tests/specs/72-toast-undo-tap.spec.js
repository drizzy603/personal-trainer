// The 6 s Undo on toasts must be TAPPABLE: #toast lets taps through (pointer-events:none,
// inherited) and its button never opted back in, so from 20260910 every Undo was dead and the tap
// hit whatever was underneath (in the runner, the strip pill for exercise 4). Earlier specs called
// _toastUndo() directly; this one clicks the real button, in both rooms. Also pins the Edit
// Exercise sheet staying on screen at 320 pt and with 125% text.
const { boot, assert, run } = require('../lib/harness');

for (const room of ['heavyweight', 'dark']) {
  run('toast Undo is tappable (' + room + ')', async () => {
    const app = await boot({ native: true, seed: { kt_theme: room } });
    try {
      const p = app.page;
      // 1. runner: log a set, tap Undo for real (notifications granted, or the harness's 'rest alerts are off'
      //    warning replaces the Undo toast)
      await p.evaluate(() => { const LN = Capacitor.Plugins.LocalNotifications; LN.checkPermissions = () => Promise.resolve({ display: 'granted' }); LN.requestPermissions = LN.checkPermissions; localStorage.setItem('kt_notif_asked', '1'); });
      await p.evaluate(() => { openDeckRunner('Push'); const ex = runnerSession.exercises[0]; runnerReps[ex.name] = 8; runnerEngaged = true; paintRunner(); runnerCompleteSet(); });
      await p.waitForTimeout(400);
      const before = await p.evaluate(() => { const ex = runnerSession.exercises[0]; return { done: runnerCompleted[ex.name] || 0, ex: runnerExIdx }; });
      await p.click('#toast .kt-toast-undo', { timeout: 3000 });
      await p.waitForTimeout(150);
      const after = await p.evaluate(() => { const ex = runnerSession.exercises[0]; return { done: runnerCompleted[ex.name] || 0, ex: runnerExIdx }; });
      assert(before.done === 1 && after.done === 0 && after.ex === before.ex, 'the set is undone and the deck did not move: ' + JSON.stringify([before, after]));
      await p.evaluate(() => { closeDeckRunner(); runnerSession = null; });
      // 2. delete a run, tap Undo for real
      await p.waitForTimeout(6500);   // let the first toast expire
      const n0 = await p.evaluate(() => { const r = getRuns(); deleteRun(r[0].id); return r.length; });
      await p.waitForTimeout(400);
      const n1 = await p.evaluate(() => getRuns().length);
      await p.click('#toast .kt-toast-undo', { timeout: 3000 });
      await p.waitForTimeout(150);
      const n2 = await p.evaluate(() => getRuns().length);
      assert(n1 === n0 - 1 && n2 === n0, 'the run comes back: ' + JSON.stringify([n0, n1, n2]));
      assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  });
}

run('Edit Exercise sheet stays on screen at 320 pt and with 125% text', async () => {
  const app = await boot({ native: true });
  try {
    const p = app.page;
    const out = [];
    for (const [w, h, z] of [[320, 568, ''], [375, 667, '1.25'], [390, 844, '1.25']]) {
      await p.setViewportSize({ width: w, height: h });
      out.push(await p.evaluate(z => {
        document.documentElement.style.zoom = z;
        closeRunnerExEdit(); openDeckRunner('Push'); openRunnerExEdit(0);
        const sheet = document.getElementById('runner-ex-edit-sheet');
        const x = sheet.querySelector('button[onclick="closeRunnerExEdit()"]');
        const top = x.getBoundingClientRect().top;
        sheet.scrollTop = 99999;
        const save = Array.from(sheet.querySelectorAll('button')).find(b => /Save Changes/.test(b.textContent));
        const sr = save.getBoundingClientRect(), vh = window.innerHeight;
        const res = { size: innerWidth + 'x' + innerHeight + '@' + (z || 1), closeTop: Math.round(top), saveBottom: Math.round(sr.bottom), vh: Math.round(vh) };
        closeRunnerExEdit(); closeDeckRunner(); runnerSession = null; document.documentElement.style.zoom = '';
        return res;
      }, z));
    }
    assert(out.every(o => o.closeTop >= 0 && o.saveBottom <= o.vh + 1), 'title/close reachable and Save reachable by scrolling: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
