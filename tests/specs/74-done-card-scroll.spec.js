// The done card on short or zoomed screens: EDIT on a lower set keeps the scroller where the
// user put it and brings the editor into view (a repaint used to reset it to the top), a
// background repaint of the same card keeps the scroll, and the last exercise's card is centred
// like the others (the Log date wrapper's bottom margin used to pin it to the bottom).
const { boot, assert, run } = require('../lib/harness');

run('done card keeps its scroll on EDIT and repaint; the last card is centred', async () => {
  const app = await boot({ native: true });
  const p = app.page;
  try {
    const finish = (idx, n) => p.evaluate(([idx, n]) => {
      if (!runnerSession) openDeckRunner('Push');
      runnerExIdx = idx; const ex = runnerSession.exercises[idx];
      ex.sets = n; runnerRepsLog[ex.name] = Array(n).fill(8); runnerWeightsLog[ex.name] = Array(n).fill(100);
      runnerCompleted[ex.name] = n; runnerEngaged = false; runnerResting = false; runnerEditSetIdx = null;
      if (_runnerAdvanceTO) { clearTimeout(_runnerAdvanceTO); _runnerAdvanceTO = null; }
      paintRunner();
      return !!document.querySelector('#runner-root .kt-done-scroll');
    }, [idx, n]);

    // A. 375x667 at 125% text: a 6-set done card overflows; EDIT on the last set
    await p.setViewportSize({ width: 375, height: 667 });
    await p.evaluate(() => { document.documentElement.style.zoom = '1.25'; });
    const shown = await finish(0, 6);
    const a = await p.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const sc = () => document.querySelector('#runner-root .kt-done-scroll');
      const r = { overflows: sc().scrollHeight > sc().clientHeight + 1 };
      sc().scrollTop = sc().scrollHeight;
      const before = sc().scrollTop;
      runnerStartEditSet(5); await wait(50);
      const ed = document.querySelector('#runner-root .kt-done-scroll input');
      const box = sc().getBoundingClientRect(), ib = ed && ed.getBoundingClientRect();
      r.kept = sc().scrollTop > 0; r.before = before; r.after = sc().scrollTop;
      r.inView = !!(ib && ib.top >= box.top - 1 && ib.bottom <= box.bottom + 1);
      // a background repaint of the same card (a watch set, a Health import) keeps the scroll
      runnerCancelEditSet(); sc().scrollTop = sc().scrollHeight; const s2 = sc().scrollTop;
      _lastRunnerSig = ''; paintRunner();
      r.repaintKept = Math.abs(sc().scrollTop - s2) <= 1 && s2 > 0;
      return r;
    });
    await p.evaluate(() => { document.documentElement.style.zoom = ''; closeDeckRunner(); runnerSession = null; });

    // B. 430x932: the last exercise's done card is centred (top and bottom slack match)
    await p.setViewportSize({ width: 430, height: 932 });
    const lastIdx = await p.evaluate(() => { openDeckRunner('Push'); return runnerSession.exercises.length - 1; });
    await finish(lastIdx, 2);
    const b = await p.evaluate(() => {
      const sc = document.querySelector('#runner-root .kt-done-scroll');
      const kids = [...sc.children], sb = sc.getBoundingClientRect();
      const top = kids[0].getBoundingClientRect().top - sb.top, bottom = sb.bottom - kids[kids.length - 1].getBoundingClientRect().bottom;
      return { top: Math.round(top), bottom: Math.round(bottom), hasDate: !!sc.querySelector('#runner-date') };
    });
    assert(shown && a.overflows, 'the 6-set done card overflows at 375x667@125%: ' + JSON.stringify(a));
    assert(a.kept && a.inView, 'EDIT on the last set keeps the scroller down and the editor in view: ' + JSON.stringify(a));
    assert(a.repaintKept, 'a repaint of the same card keeps the scroll: ' + JSON.stringify(a));
    assert(b.hasDate && Math.abs(b.top - b.bottom) <= 4 && b.top > 8, 'the last done card is centred: ' + JSON.stringify(b));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
