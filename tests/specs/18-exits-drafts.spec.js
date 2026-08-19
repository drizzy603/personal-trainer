// Leaving early saves instead of forcing a discard, and the chat composer
// survives background renders (mid-turn tool loops land while users type).
const { boot, assert, run } = require('../lib/harness');

run('leave sheet offers Save & finish early once sets exist', async () => {
  const app = await boot({ seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      openDeckRunner('Push');
      // No sets yet: sheet must NOT offer a save.
      runnerGoTo(1);
      confirmCloseRunner();
      const sheet1 = document.getElementById('kt-close-runner-sheet');
      const noSave = sheet1 && sheet1.textContent.indexOf('Save & finish early') === -1;
      sheet1.remove();
      // Log one set, then leave: save button appears and actually saves.
      runnerGoTo(0);
      runnerEngaged = true;
      runnerCompleteSet();
      runnerSkipRest();
      confirmCloseRunner();
      const sheet2 = document.getElementById('kt-close-runner-sheet');
      const hasSave = sheet2 && sheet2.textContent.indexOf('Save & finish early') !== -1;
      const btn = Array.from(sheet2.querySelectorAll('button'))
        .find(b => b.textContent.indexOf('Save & finish early') !== -1);
      btn.click();
      const saved = getSessions()[0];
      return { noSave, hasSave, closed: !runnerOpen,
        savedSets: saved && (saved.exercises||[]).reduce((n,e)=>n+(e.sets||0),0) };
    });
    assert(out.noSave, 'no save option before any set is logged');
    assert(out.hasSave, 'save option appears once a set exists');
    assert(out.closed && out.savedSets === 1, 'save & finish persists the partial session, got ' + out.savedSets);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('chat draft survives a background render', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      localStorage.setItem('kt_apikey', 'sk-ant-test-not-real');
      coachMessages = [{ role: 'assistant', content: 'Hey.' }];
      switchTab('coach'); coachView = 'chat'; render();
      const inp = document.getElementById('coach-input');
      inp.value = 'should my deload week keep the runs?';
      inp.focus();
      render(); // simulates a mid-turn tool-loop render
      const after = document.getElementById('coach-input');
      const survived = after.value;
      // A cleared input (post-send) must NOT resurrect the old draft.
      after.value = '';
      _coachDraft = { v:'', s:0, e:0, focus:false };
      render();
      const stayedEmpty = document.getElementById('coach-input').value === '';
      return { survived, stayedEmpty };
    });
    assert(out.survived === 'should my deload week keep the runs?', 'draft survives, got "' + out.survived + '"');
    assert(out.stayedEmpty, 'sent/cleared input does not resurrect');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
