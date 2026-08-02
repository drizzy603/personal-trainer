// Rest-timer ticks must not eat an in-progress past-set edit: the countdown
// updates its digits in place instead of rebuilding the runner DOM, so the
// edit inputs keep their focus and typed value across ticks.
const { boot, assert, run } = require('../lib/harness');

run('editing a past set survives rest-timer ticks', async () => {
  const app = await boot({ seed: { kt_sessions: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      openDeckRunner('Push');
      const ex = runnerSession.exercises[0].name;
      runnerCompleteSet();               // set 1 done → rest timer starts
      const resting = runnerResting;
      runnerStartEditSet(0);             // open the past-set edit inline
      const rEl = document.getElementById('kt-edit-r');
      if (!rEl) return { resting, noInput: true };
      rEl.focus();
      rEl.value = '12';                  // typed but not yet saved
      const clockBefore = document.querySelector('#runner-root .kt-rest-time').textContent;
      await new Promise(r => setTimeout(r, 2300));   // let two ticks land
      const rEl2 = document.getElementById('kt-edit-r');
      const clockAfter = document.querySelector('#runner-root .kt-rest-time').textContent;
      const surviving = {
        sameNode: rEl2 === rEl,
        value: rEl2 ? rEl2.value : null,
        focused: document.activeElement && document.activeElement.id === 'kt-edit-r',
        clockMoved: clockAfter !== clockBefore,
      };
      runnerSaveEditSet();               // commit the edit
      const saved = (runnerRepsLog[ex] || [])[0];
      runnerSkipRest();                  // full repaint on explicit transition
      return { resting, surviving, saved, stillResting: runnerResting };
    });
    assert(!out.noInput, 'past-set edit input mounts during rest');
    assert(out.resting, 'rest timer is running after the first set');
    assert(out.surviving.sameNode, 'tick must not rebuild the edit input');
    assert(out.surviving.value === '12', 'typed value survives ticks, got ' + out.surviving.value);
    assert(out.surviving.focused, 'keyboard focus survives ticks');
    assert(out.surviving.clockMoved, 'countdown digits still update in place');
    assert(out.saved === 12, 'saving commits the edited reps, got ' + out.saved);
    assert(!out.stillResting, 'skip rest still transitions out of resting');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
