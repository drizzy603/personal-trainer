// Theme rooms + share card + empty states (screens 01/02/06/07/09).
const { boot, assert, run } = require('../lib/harness');

run('theme rooms apply their tokens', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const res = {};
      for (const id of Object.keys(THEMES)) {
        applyTheme(id);
        const cs = getComputedStyle(document.documentElement);
        res[id] = {
          bg: cs.getPropertyValue('--bg').trim(),
          ink: cs.getPropertyValue('--accent-ink').trim(),
          yellow: cs.getPropertyValue('--yellow').trim(),
        };
      }
      applyTheme('dark');
      return res;
    });
    assert(out.midnight.bg === '#050a14', 'midnight is navy');
    assert(out.carbon.bg === '#060607', 'carbon near-black');
    assert(out.light.bg === '#f4f2ec' && out.light.ink === '#3f6a00', 'light paper + dark accent-ink');
    assert(out.gold.yellow === '#ffb340', 'gold PR-yellow exception');
    assert(out.dark.ink === '#c8ff00', 'dark ink equals accent');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('share card draws through toBlob', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(async () => {
      const sess = getSessions().find(s => (s.exercises || []).length);
      shareSessionCard(sess.id);
      await new Promise(r => setTimeout(r, 800));
      const t = document.getElementById('toast');
      return t ? t.textContent : null;
    });
    assert(out === 'Sharing not supported here', 'draw path completed (headless has no share sheet), got: ' + out);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('empty states speak the editorial voice', async () => {
  const app = await boot({ seed: { kt_routine: 'null', kt_sessions: '[]', kt_runs: '[]', kt_sports: '[]', kt_bw: '[]', kt_prs: '{}', kt_5k_goal: '0', kt_bench_goal: '0', kt_squat_goal: '0', kt_bw_goal: '0' } });
  try {
    const out = await app.page.evaluate(() => {
      const logText = document.body.textContent;
      switchTab('progress');
      const progText = document.body.textContent;
      return {
        hero: logText.indexOf('your programme.') > -1,
        restore: logText.indexOf('Restore a backup') > -1,
        // M&M F1·D — honest day-zero: statement pair + dashed payoff ladder,
        // and the planless CTA. No fake charts or sample numbers.
        prog: progText.indexOf('Nothing yet.') > -1
          && progText.indexOf('That’s correct.') > -1
          && progText.indexOf('AFTER SESSION 1') > -1
          && progText.indexOf('AFTER YOUR FIRST PR') > -1
          && progText.indexOf('Build a plan') > -1,
      };
    });
    assert(out.hero && out.restore, 'log first-run hero + restore line');
    assert(out.prog, 'progress day-zero honest empty (F1·D)');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
