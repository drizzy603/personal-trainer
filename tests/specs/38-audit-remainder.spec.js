// Audit batch A remainder (2026-09-10): coach log_run time validation, blank
// sport logs refused, corrupt JSON parked instead of discarded, coach-card
// buttons route somewhere real.
const { boot, assert, run } = require('../lib/harness');

run('log_run rejects unparseable times; blank sport logs are refused', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const before = getRuns().length;
      const bad = executeCoachTool('log_run', { distance_km: 5, time: '25 min' });
      const good = executeCoachTool('log_run', { distance_km: 5, time: '25:00' });
      const runsAfter = getRuns().length;
      switchTab('log'); switchLogSub('sport');
      pickSport('Yoga');
      const sportsBefore = getSportLogs().length;
      ['spDuration', 'spNotes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      saveSportLog();
      const toast = document.getElementById('toast').textContent;
      return { badOk: bad.ok, badErr: bad.error, goodOk: good.ok, runsAdded: runsAfter - before,
        sportsAdded: getSportLogs().length - sportsBefore, toast };
    });
    assert(out.badOk === false && /MM:SS/.test(out.badErr), '"25 min" refused: ' + out.badErr);
    assert(out.goodOk === true && out.runsAdded === 1, 'MM:SS accepted and logged once');
    assert(out.sportsAdded === 0 && /duration or a detail/.test(out.toast), 'empty sport log refused with a toast: ' + out.toast);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('corrupt JSON is parked under <key>_corrupt, never overwritten', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      localStorage.setItem('kt_probe', '{not json');
      delete _lsCache['kt_probe'];
      const read = lsGet('kt_probe');
      lsSet('kt_probe', { ok: true });
      return { read, parked: localStorage.getItem('kt_probe_corrupt'), now: localStorage.getItem('kt_probe') };
    });
    assert(out.read === null, 'unreadable value reads as null');
    assert(out.parked === '{not json', 'raw text preserved in kt_probe_corrupt');
    assert(out.now === '{"ok":true}', 'the key itself stays writable');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('coach-card buttons route: acknowledge dismisses, See pace opens Runs, AI labels become a chat turn', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(async () => {
      window.__sent = null;
      localStorage.setItem('kt_apikey', 'sk-ant-test-not-real');   // the chat composer only renders with a key
      window.sendCoachMessage = function () { window.__sent = document.getElementById('coach-input').value; };
      switchTab('log'); switchLogSub('workout');
      coachCardAction('Got it');
      const afterAck = { tab: currentTab, dismissed: coachCardDismissed };
      coachCardDismissed = false;
      coachCardAction('See pace');
      const afterPace = { tab: currentTab, sub: logSubTab };
      coachCardDismissed = false;
      coachCardAction('Swap squats for leg press today');
      await new Promise(r => setTimeout(r, 500));
      return { afterAck, afterPace, chat: { tab: currentTab, view: coachView, sent: window.__sent } };
    });
    assert(out.afterAck.dismissed === true && out.afterAck.tab === 'log', 'Got it only dismisses');
    assert(out.afterPace.tab === 'log' && out.afterPace.sub === 'run', 'See pace lands on the Run tab');
    assert(out.chat.tab === 'coach' && out.chat.view === 'chat' && out.chat.sent === 'Swap squats for leg press today', 'AI label is sent to the coach: ' + JSON.stringify(out.chat));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
