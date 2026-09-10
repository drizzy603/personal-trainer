// Audit pins for the coach reliability batch: the replay window always opens
// on a user turn, an empty reply never commits content:'', Restore Previous
// snapshots the PRE-edit routine, and a cold boot actually fetches the coach
// card instead of freezing the synchronous fallback into the global.
const { boot, assert, run } = require('../lib/harness');

run('replay window opens on a user turn after Stop notices', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(async () => {
      // 11 exchanges + one local Stop notice → 23 entries; the old
      // slice(-20)-then-filter opened the window on an assistant turn.
      coachMessages = [];
      for (let i = 0; i < 11; i++) {
        coachMessages.push({ role: 'user', content: 'q' + i });
        coachMessages.push({ role: 'assistant', content: 'a' + i });
        if (i === 5) coachMessages.push({ role: 'assistant', content: 'Stopped.', _local: true });
      }
      // Capture the request body the loop would send.
      let sent = null;
      const realFetch = window.fetch;
      window.fetch = async (url, opts) => {
        sent = JSON.parse(opts.body);
        return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: {} }),
          { status: 200, headers: { 'content-type': 'application/json' } });
      };
      try {
        localStorage.setItem('kt_apikey', 'sk-test');
        coachMessages.push({ role: 'user', content: 'q11' });
        await runCoachTurn('sys', 'claude-haiku-4-5', 512);
      } finally { window.fetch = realFetch; }
      const msgs = (sent && sent.messages) || [];
      return { firstRole: msgs.length ? msgs[0].role : null, len: msgs.length,
        noLocals: !msgs.some(m => typeof m.content === 'string' && m.content === 'Stopped.') };
    });
    assert(out.firstRole === 'user', 'window opens on a user turn, got ' + out.firstRole);
    assert(out.len > 0 && out.len <= 20, 'window is bounded, got ' + out.len);
    assert(out.noLocals, 'local Stop notice is not replayed');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('an empty reply becomes a local notice, never content:""', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(async () => {
      coachMessages = [{ role: 'user', content: 'hello' }];
      const realFetch = window.fetch;
      window.fetch = async () => new Response(JSON.stringify({ content: [], stop_reason: 'refusal', usage: {} }),
        { status: 200, headers: { 'content-type': 'application/json' } });
      try {
        localStorage.setItem('kt_apikey', 'sk-test');
        await runCoachTurn('sys', 'claude-haiku-4-5', 512);
      } finally { window.fetch = realFetch; }
      const last = coachMessages[coachMessages.length - 1];
      return { emptyCommitted: coachMessages.some(m => m.role === 'assistant' && m.content === ''),
        localNotice: !!(last && last._local && last._error && /no reply/i.test(last.content)) };
    });
    assert(!out.emptyCommitted, 'no empty assistant message committed');
    assert(out.localNotice, 'a local no-reply notice is pushed instead');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('Restore Previous snapshots the routine BEFORE the Coach edits it', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const before = JSON.parse(JSON.stringify(getCustomRoutine()));
      const i = currentWeek - 1;               // past weeks are locked by the tool
      const wk = before.weeks[i];
      const exName = (wk.push && wk.push[0] && wk.push[0].name) || 'Barbell Bench Press';
      const r = executeCoachTool('update_routine_weeks', { weeks: [{
        wk: currentWeek, block: wk.block || 1, bName: 'REWRITTEN', bColor: '#ffffff',
        push: [{ name: exName, sets: 5, reps: 5, weight: 100, isMain: true }],
      }] });
      const backup = lsGet('kt_routine_backup');
      const now = getCustomRoutine();
      // Cache must hold two distinct objects, and the backup must be the pre-edit week.
      const distinct = backup !== now;
      const backupIsOld = backup && backup.weeks[i].bName === wk.bName && backup.weeks[i].bName !== 'REWRITTEN';
      const liveIsNew = now.weeks[i].bName === 'REWRITTEN';
      // Second mutating call re-snapshots (no once-per-session gate).
      executeCoachTool('set_exercise_weight', { name: exName, weight: 105 });
      const backup2 = lsGet('kt_routine_backup');
      const resnapped = backup2 && backup2.weeks[i].bName === 'REWRITTEN';
      return { ok: r.ok, err: r.error, distinct, backupIsOld, liveIsNew, resnapped };
    });
    assert(out.ok, 'tool wrote the week: ' + out.err);
    assert(out.distinct && out.backupIsOld && out.liveIsNew, 'backup is the pre-edit routine, live is the new one');
    assert(out.resnapped, 'every mutating tool call takes a fresh snapshot');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('cold boot fetches the coach card instead of freezing the fallback', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(async () => {
      // Force a lift day so the card path is live, then stub the fetcher.
      const cr = getCustomRoutine();
      const dow = (new Date().getDay() + 6) % 7;
      cr.weekPlan = cr.weekPlan || []; cr.weekPlan[dow] = 'Push'; setCustomRoutine(cr);
      localStorage.setItem('kt_apikey', 'sk-test');
      let fetched = 0;
      const realFetch = fetchCoachCard;
      window.fetchCoachCard = async () => { fetched++; return { message: 'From Haiku.', actions: [{ label: 'Got it', primary: true }] }; };
      coachCard = null; coachCardLoading = false; coachCardDismissed = false;
      // Drop any cached card for today so the lifecycle must fetch.
      Object.keys(localStorage).filter(k => k.indexOf('kt_coach_card_') === 0).forEach(k => localStorage.removeItem(k));
      switchTab('log');
      const globalUntouchedByPaint = coachCard === null || coachCardLoading === true || (coachCard && coachCard.message === 'From Haiku.');
      await new Promise(r => setTimeout(r, 300));
      const t = document.getElementById('screen').textContent;
      window.fetchCoachCard = realFetch;
      return { fetched, globalUntouchedByPaint, shows: t.indexOf('From Haiku.') > -1 };
    });
    assert(out.fetched >= 1, 'lifecycle fetched the card on boot, calls=' + out.fetched);
    assert(out.globalUntouchedByPaint, 'paint path never assigned the fallback to the global');
    assert(out.shows, 'the fetched card replaces the fallback');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
