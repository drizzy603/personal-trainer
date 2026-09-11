// Accessibility contract across the four tabs: every control is reachable
// and named, toggles read as switches, the active tab is announced, icon-only
// buttons carry a label, and inputs are labelled.
const { boot, assert, run } = require('../lib/harness');

run('every screen exposes named, focusable controls', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const problems = [];
      const audit = (where) => {
        const screen = document.getElementById('screen');
        // onclick divs must be keyboard-reachable with a role
        screen.querySelectorAll('[onclick]').forEach(el => {
          if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
          if (/^\s*event\.stopPropagation\(\)\s*;?\s*$/.test(el.getAttribute('onclick') || '')) return;
          if (!el.hasAttribute('role') || !el.hasAttribute('tabindex')) problems.push(where + ': unreachable onclick ' + el.className);
        });
        // buttons need a name
        screen.querySelectorAll('button').forEach(b => {
          const name = (b.textContent || '').trim() || b.getAttribute('aria-label') || b.getAttribute('title');
          if (!name) problems.push(where + ': unnamed button ' + (b.className || b.outerHTML.slice(0, 60)));
        });
        // inputs need a label, aria-label, placeholder or an associated <label>
        screen.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea,select').forEach(i => {
          const labelled = i.getAttribute('aria-label') || i.getAttribute('placeholder') || i.getAttribute('aria-labelledby')
            || (i.id && document.querySelector('label[for="' + i.id + '"]')) || i.closest('label')
            || (i.parentElement && i.parentElement.querySelector('label'));
          if (!labelled) problems.push(where + ': unlabelled field #' + (i.id || i.className));
        });
        // toggle rows are switches
        screen.querySelectorAll('.settings-row[onclick^="toggle"]').forEach(r => {
          if (r.getAttribute('role') !== 'switch' || !r.hasAttribute('aria-checked')) problems.push(where + ': toggle row without switch semantics');
        });
      };
      switchTab('log'); switchLogSub('workout'); audit('log/workout');
      switchLogSub('run'); openRunLog && openRunLog(); audit('log/run');
      switchLogSub('body'); audit('log/body');
      switchTab('progress'); audit('progress');
      switchTab('coach'); audit('coach');
      switchTab('settings'); audit('settings');
      const active = document.querySelectorAll('#tabs .tab[aria-current="page"]').length;
      const toast = document.getElementById('toast');
      return { problems: Array.from(new Set(problems)), active, toastRole: toast.getAttribute('role'), toastLive: toast.getAttribute('aria-live') };
    });
    assert(out.active === 1, 'exactly one tab announces itself as current, got ' + out.active);
    assert(out.toastRole === 'status' && out.toastLive, 'toast is a live status region');
    assert(out.problems.length === 0, 'a11y problems:\n  ' + out.problems.join('\n  '));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
