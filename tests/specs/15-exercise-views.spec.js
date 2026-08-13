// Exercise views (Premium spec 12): library rows carry MAIN tags + last-used
// loads under muscle-group eyebrows, the detail expansion shows history +
// cues, and the in-workout cue sheet persists a note-for-today on close.
const { boot, assert, run } = require('../lib/harness');

run('library rows, grouping, and detail render from logs', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      // Pin a fresh session so the last-used column is exercised regardless
      // of how old the seed dump has grown (rows go stale past 21 days).
      const sessions = getSessions();
      sessions.unshift({ id: 991, date: todayISO(), type: 'Push', week: currentWeek,
        exercises: [{ name: 'Barbell Bench Press', sets: 4, reps: [8,8,8,8], weight: 160, rpe: 8, isMain: true }] });
      lsSet('kt_sessions', sessions);
      openExLib();
      const list = document.getElementById('exlibList');
      const flat = list.innerHTML;
      // Expand the first exercise that has logged history.
      const withHist = getAllExercises().find(e => _exSessionHistory(e.name, 1).length);
      let detail = '';
      if (withHist) { toggleLibEx(withHist.name); detail = document.getElementById('exlibList').innerHTML; }
      const res = {
        eyebrows: ['PUSH', 'PULL', 'LEGS'].every(c => flat.indexOf(c) !== -1),
        mainTag: flat.indexOf('kt-main-tag') !== -1,
        lastUsed: /· \d+(\.\d+)? LB</.test(flat),
        histLedger: detail.indexOf('HISTORY') !== -1,
        cuesNumbered: detail.indexOf('CUES') !== -1,
        exName: withHist ? withHist.name : '',
      };
      closeExLib();
      // Prefill path: cue-sheet's "open in library" expands the exercise.
      openExLib(res.exName);
      res.prefilled = document.getElementById('exlibSearch').value === res.exName
        && document.getElementById('exlibList').innerHTML.indexOf('HISTORY') !== -1;
      closeExLib();
      return res;
    });
    assert(out.eyebrows, 'browsing groups under muscle-group eyebrows');
    assert(out.mainTag, 'programme MAIN tags carry over to library rows');
    assert(out.lastUsed, 'rows carry last-used load in mono');
    assert(out.histLedger && out.cuesNumbered, 'detail shows history ledger + cues');
    assert(out.prefilled, 'openExLib(name) prefills search and expands detail');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('cue sheet opens over the runner and persists a note', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      openDeckRunner('Push');
      const ex = _runnerEx();
      // Inline cues live on the fresh idle card and yield once a set logs.
      const root = () => document.getElementById('runner-root').innerHTML;
      const cuesOnCard = root().indexOf('CUES') !== -1;
      runnerCompleted[ex.name] = 1; paintRunner();
      const cuesGoneAfterSet = root().indexOf('CUES') === -1;
      runnerCompleted[ex.name] = 0; paintRunner();
      openRunnerCueSheet();
      const sheet = document.getElementById('runnerCueOverlay');
      const opened = !!sheet && sheet.textContent.indexOf('CUES') !== -1;
      const hasBack = sheet.textContent.indexOf('Back to the set') !== -1;
      document.getElementById('runnerCueNote').value = 'Chalked up, felt strong';
      closeRunnerCueSheet();
      const saved = (lsGet('kt_ex_notes') || {})[ex.name];
      // Re-open: today's note prefills the well; no LAST NOTE section yet.
      openRunnerCueSheet();
      const refill = document.getElementById('runnerCueNote').value;
      const noLast = document.getElementById('runnerCueOverlay').textContent.indexOf('LAST NOTE') === -1;
      // Clearing the well on close deletes today's note.
      document.getElementById('runnerCueNote').value = '';
      closeRunnerCueSheet();
      const cleared = !(lsGet('kt_ex_notes') || {})[ex.name];
      closeDeckRunner();
      return { opened, hasBack, saved: saved && saved.text, savedDate: saved && saved.date, refill, noLast, cleared,
        cuesOnCard, cuesGoneAfterSet,
        inBackup: BACKUP_KEYS.indexOf('kt_ex_notes') !== -1 };
    });
    assert(out.cuesOnCard, 'fresh idle card carries inline cues');
    assert(out.cuesGoneAfterSet, 'inline cues yield to logged-set rows');
    assert(out.opened && out.hasBack, 'sheet opens with cues + back-to-set CTA');
    assert(out.saved === 'Chalked up, felt strong' && out.savedDate, 'closing saves the note with a date');
    assert(out.refill === 'Chalked up, felt strong' && out.noLast, 'same-day note prefills the well, not LAST NOTE');
    assert(out.cleared, 'emptying the well on close deletes the note');
    assert(out.inBackup, 'kt_ex_notes rides backups');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
