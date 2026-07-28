// Watch bridge: pending wrist sessions drain into kt_sessions, and the
// double-log guard keeps one entry per (date, day-type) in both directions —
// drain skips what the phone already logged; a phone finish replaces the
// watch-synced copy of the same session.
const { boot, assert, run } = require('../lib/harness');

const watchPayload = (iso) => JSON.stringify({
  dayName: 'Push',
  loggedAt: iso + 'T10:00:00',
  exercises: [{ name: 'Barbell Bench Press', reps: [8, 8, 8], weight: 145 }],
});

const phoneSession = (iso, note) => JSON.stringify([{
  id: 1, date: iso, type: 'Push', week: 8, note: note,
  exercises: [{ name: 'Barbell Bench Press', isMain: true, sets: 3, reps: [8, 8, 8], weight: 150, weightLog: [150, 150, 150], rpe: 7 }],
  prs: [],
}]);

const todayLocal = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

run('watch session drains into the log', async () => {
  const iso = todayLocal();
  const app = await boot({ native: true, seed: { kt_sessions: '[]' }, watchPending: [watchPayload(iso)] });
  try {
    await app.page.waitForFunction(() => window.__mock.pending.length === 0 && getSessions().length === 1, { timeout: 8000 });
    const out = await app.page.evaluate(() => ({
      top: getSessions()[0],
      planPushed: window.__mock.updateContext.length,
    }));
    assert(out.top.note === 'From Apple Watch', 'drained session marked as watch-synced');
    assert(out.top.type === 'Push' && out.top.date === (await app.page.evaluate(() => todayISO())), 'type/date preserved');
    assert(out.top.exercises[0].sets === 3 && out.top.exercises[0].weight === 145, 'sets and weight carried over');
    assert(out.planPushed >= 1, 'today\'s plan should be pushed to the watch');
    assert(app.errors.length === 0, 'no page errors, got: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('guard: drain skips a session the phone already logged', async () => {
  const iso = todayLocal();
  const app = await boot({
    native: true,
    seed: { kt_sessions: phoneSession(iso, '') },
    watchPending: [watchPayload(iso)],
  });
  try {
    await app.page.waitForFunction(() => window.__mock.pending.length === 0, { timeout: 8000 });
    const out = await app.page.evaluate(() => ({ count: getSessions().length, note: getSessions()[0].note, weight: getSessions()[0].exercises[0].weight }));
    assert(out.count === 1, 'still exactly one session, got ' + out.count);
    assert(out.note === '', 'the surviving entry is the phone log');
    assert(out.weight === 150, 'phone data untouched');
    assert(app.errors.length === 0, 'no page errors, got: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('live wrist mirror: banner follows watchLive events', async () => {
  const app = await boot({ native: true, seed: { kt_sessions: '[]' } });
  try {
    await app.page.waitForFunction(() => window.__mock.listeners.some((l) => l.name === 'watchLive'), { timeout: 8000 });
    const shown = await app.page.evaluate(() => {
      const fire = (p) => window.__mock.listeners
        .filter((l) => l.name === 'watchLive')
        .forEach((l) => l.fn({ json: JSON.stringify(p) }));
      fire({ dayName: 'Push', startedAt: Date.now(), reps: { 'Barbell Bench Press': [8, 8] }, weights: {}, ended: false });
      // #screen holds the rendered UI — body.textContent would also match the
      // page's own inline script source.
      const t = document.getElementById('screen').textContent;
      return t.includes('LIVE ON WATCH') && t.includes('2 sets');
    });
    assert(shown, 'banner appears with the live set count');
    const cleared = await app.page.evaluate(() => {
      window.__mock.listeners
        .filter((l) => l.name === 'watchLive')
        .forEach((l) => l.fn({ json: JSON.stringify({ dayName: 'Push', startedAt: Date.now(), reps: {}, weights: {}, ended: true }) }));
      return !document.getElementById('screen').textContent.includes('LIVE ON WATCH');
    });
    assert(cleared, 'ended payload clears the banner');
    assert(app.errors.length === 0, 'no page errors, got: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('guard: phone finish replaces the watch copy', async () => {
  const iso = todayLocal();
  const app = await boot({ native: true, seed: { kt_sessions: phoneSession(iso, 'From Apple Watch') } });
  try {
    const out = await app.page.evaluate(() => {
      openDeckRunner('Push');
      runnerCompleteSet();
      runnerFinishSession();
      const s = getSessions();
      return { count: s.length, top: s[0] };
    });
    assert(out.count === 1, 'watch copy replaced, not duplicated — got ' + out.count + ' sessions');
    assert(out.top.note === '', 'surviving entry is the richer phone log');
    assert(out.top.type === 'Push', 'type preserved');
    assert(app.errors.length === 0, 'no page errors, got: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
