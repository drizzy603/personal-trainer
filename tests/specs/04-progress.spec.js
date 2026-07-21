// Progress tab visuals: week dots, charts, and history render from the seed.
const { boot, assert, run } = require('../lib/harness');

run('progress tab renders charts and history', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      switchTab('progress');
      const text = document.body.textContent;
      return {
        svgs: document.querySelectorAll('svg').length,
        weekDots: /\d+\s*\/\s*\d+\s*days/i.test(text),
        history: text.indexOf('History') !== -1 || text.indexOf('Recent') !== -1,
      };
    });
    assert(out.svgs > 0, 'at least one chart SVG should render, got ' + out.svgs);
    assert(out.weekDots, 'week dots card shows "N / M days"');
    assert(out.history, 'history section renders');
    assert(app.errors.length === 0, 'no page errors, got: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
