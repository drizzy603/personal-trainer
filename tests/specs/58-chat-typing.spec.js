// Typing in the coach chat should not leave the keyboard sitting a tab bar's height below
// the compose pill. While the chat input holds focus the dock stands down, the pill drops
// to the bottom edge, and the reclaimed space goes to the conversation. Leaving the tab or
// tapping the messages restores the dock.
const { boot, assert, run } = require('../lib/harness');

run('chat typing hides the dock, drops the pill, and restores on blur', async () => {
  const app = await boot({ seed: { kt_apikey: 'sk-ant-test-not-real', kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const r = {};
      const px = (el, prop) => parseFloat(getComputedStyle(el)[prop]) || 0;

      coachView = 'chat'; currentTab = 'coach'; render();
      const input = document.getElementById('coach-input');
      const row = document.querySelector('.coach-input-row');
      const tabs = document.getElementById('tabs');
      const msgs = document.querySelector('.coach-msgs-area');
      r.present = { input: !!input, row: !!row, tabs: !!tabs, msgs: !!msgs };
      if (!input || !row || !tabs || !msgs) return r;

      r.idle = {
        typing: document.documentElement.classList.contains('chat-typing'),
        rowBottom: px(row, 'bottom'),
        msgsPad: px(msgs, 'paddingBottom'),
        tabsEvents: getComputedStyle(tabs).pointerEvents,
      };

      input.focus();
      await wait(260);          // let the dock's opacity transition settle before reading it
      r.typing = {
        typing: document.documentElement.classList.contains('chat-typing'),
        rowBottom: px(row, 'bottom'),
        msgsPad: px(msgs, 'paddingBottom'),
        tabsEvents: getComputedStyle(tabs).pointerEvents,
        tabsOpacity: parseFloat(getComputedStyle(tabs).opacity),
      };

      // Blur restores, but only after the grace period that stops Send flashing the dock.
      input.blur();
      r.immediatelyAfterBlur = document.documentElement.classList.contains('chat-typing');
      await wait(300);
      r.afterBlur = document.documentElement.classList.contains('chat-typing');

      // Leaving the Coach tab with the keyboard up must not strand the dock offscreen.
      input.focus(); await wait(60);
      r.beforeSwitch = document.documentElement.classList.contains('chat-typing');
      switchTab('log');
      await wait(300);
      r.afterSwitch = document.documentElement.classList.contains('chat-typing');
      return r;
    });

    assert(out.present.input && out.present.row && out.present.tabs && out.present.msgs,
      'the chat view renders its parts: ' + JSON.stringify(out.present));
    assert(!out.idle.typing && out.idle.tabsEvents !== 'none', 'idle: dock is live: ' + JSON.stringify(out.idle));
    assert(out.typing.typing, 'focusing the input marks the page as typing');
    assert(out.typing.rowBottom < out.idle.rowBottom - 50,
      'the compose pill drops toward the keyboard: ' + out.idle.rowBottom + ' -> ' + out.typing.rowBottom);
    assert(out.typing.msgsPad < out.idle.msgsPad - 50,
      'the conversation reclaims the space: pad ' + out.idle.msgsPad + ' -> ' + out.typing.msgsPad);
    assert(out.typing.tabsEvents === 'none' && out.typing.tabsOpacity === 0,
      'the dock stands down: ' + JSON.stringify(out.typing));
    assert(out.immediatelyAfterBlur, 'the dock does not flash back on the blur that Send causes');
    assert(!out.afterBlur, 'the dock returns once focus is really gone');
    assert(out.beforeSwitch && !out.afterSwitch, 'leaving the tab restores the dock: ' + JSON.stringify({ before: out.beforeSwitch, after: out.afterSwitch }));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
