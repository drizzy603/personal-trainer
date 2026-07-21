// Session runner: engage an ad-hoc Push session, log a set, finish, and the
// session lands in kt_sessions with today's date.
const { boot, assert, run } = require('../lib/harness');

run('runner logs a session', async () => {
  const app = await boot({ seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      openDeckRunner('Push');
      const opened = runnerOpen && runnerSession && runnerSession.dayName === 'Push';
      runnerCompleteSet();
      runnerFinishSession();
      const s = getSessions();
      return { opened, count: s.length, top: s[0], today: todayISO() };
    });
    assert(out.opened, 'runner should open for Push');
    assert(out.count === 1, 'exactly one session logged, got ' + out.count);
    assert(out.top.type === 'Push', 'session type is Push');
    assert(out.top.date === out.today, 'session dated today');
    assert(out.top.note === '', 'phone session carries no note');
    assert(out.top.exercises.length >= 1 && out.top.exercises[0].sets === 1, 'one completed set recorded');
    assert(app.errors.length === 0, 'no page errors, got: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
