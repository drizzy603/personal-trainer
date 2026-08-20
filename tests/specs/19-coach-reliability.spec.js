// Coach failure UX: trailing errors get a Try again chip that re-runs the
// turn, Stop abandons an in-flight turn while keeping executed tool pills,
// and local error bubbles never re-enter the API history.
const { boot, assert, run } = require('../lib/harness');

run('retry chip, stop, and local-message hygiene', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(async () => {
      localStorage.setItem('kt_apikey', 'sk-ant-test-not-real');
      coachMessages = [
        { role: 'user', content: 'build me a plan' },
        { role: 'assistant', content: 'Could not connect. Check your internet connection.', _error: true, _local: true },
      ];
      switchTab('coach'); coachView = 'chat'; render();
      const screen = document.getElementById('screen');
      const chipShown = screen.innerHTML.indexOf('Try again →') !== -1;

      // Stop while "thinking" keeps already-executed tool pills.
      coachLoading = true;
      _runningTools = [{ name: 'set_current_week', input: { week: 4 }, result: { ok: true } }];
      render();
      const stopShown = document.getElementById('screen').innerHTML.indexOf('coachStop()') !== -1;
      const genBefore = _coachGen;
      coachStop();
      const afterStop = coachMessages[coachMessages.length - 1];
      const stopped = !coachLoading && _coachGen === genBefore + 1
        && afterStop._local && afterStop._tools && afterStop._tools.length === 1;

      // Retry pops trailing local bubbles and re-runs the turn (stubbed).
      coachMessages = [
        { role: 'user', content: 'build me a plan' },
        { role: 'assistant', content: 'API error 529', _error: true, _local: true },
      ];
      const realTurn = runCoachTurn;
      runCoachTurn = async () => { coachMessages.push({ role: 'assistant', content: 'Recovered.' }); };
      await coachRetryLast();
      runCoachTurn = realTurn;
      const tail = coachMessages.map(m => String(m.content));
      return { chipShown, stopShown, stopped, tail, len: coachMessages.length };
    });
    assert(out.chipShown, 'trailing error renders a Try again chip');
    assert(out.stopShown, 'thinking indicator carries a Stop button');
    assert(out.stopped, 'stop bumps the generation and keeps tool pills in a local note');
    assert(out.len === 2 && out.tail[1] === 'Recovered.', 'retry pops the error and re-runs the turn, got ' + JSON.stringify(out.tail));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
