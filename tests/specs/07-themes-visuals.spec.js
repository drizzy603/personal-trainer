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
    // Signal v4 (2026-08-25) retuned the Studio room's lime to #d8ff63.
    assert(out.dark.ink === '#d8ff63', 'dark ink equals the Signal accent');
    assert(out.heavyweight.bg === '#f7f5ef' && out.heavyweight.ink === '#0a43f5', 'Heavyweight is paper + blue');
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
    assert(/^Saved as supero-|^Sharing not supported here$/.test(out || ''), 'draw path completed (headless: PNG download fallback), got: ' + out);
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

run('Heavyweight room: scoped by attribute, poster type, two colours, reversible', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      applyTheme('heavyweight');
      const cs = getComputedStyle(document.documentElement);
      const hero = document.querySelector('.kt-hero-headline');
      const tabs = document.getElementById('tabs');
      const hw = {
        room: document.documentElement.getAttribute('data-room'),
        earned: cs.getPropertyValue('--earned').trim(), earnedInk: cs.getPropertyValue('--earned-ink').trim(),
        heroFont: hero ? getComputedStyle(hero).fontFamily : '', heroTransform: hero ? getComputedStyle(hero).textTransform : '',
        bodyFont: getComputedStyle(document.body).fontFamily,
        tabsLeft: Math.round(tabs.getBoundingClientRect().left), tabsBottom: Math.round(innerHeight - tabs.getBoundingClientRect().bottom),
        ctaBg: (function(){ const c = document.querySelector('.kt-cta') || document.querySelector('.log-subtab.active'); return c ? getComputedStyle(c).backgroundColor : null; })(),
        stored: localStorage.getItem('kt_theme'),
      };
      applyTheme('dark');
      const back = {
        room: document.documentElement.getAttribute('data-room'),
        earned: getComputedStyle(document.documentElement).getPropertyValue('--earned').trim(),
        heroFont: hero ? getComputedStyle(document.querySelector('.kt-hero-headline')).fontFamily : '',
        tabsLeft: Math.round(document.getElementById('tabs').getBoundingClientRect().left),
      };
      return { hw, back };
    });
    assert(out.hw.room === 'heavyweight' && out.hw.stored === 'heavyweight', 'room attribute + persisted choice');
    assert(out.hw.earned === '#b7f000' && out.hw.earnedInk === '#5f8500', 'earned tokens split from the action colour');
    assert(/Anton/.test(out.hw.heroFont) && out.hw.heroTransform === 'uppercase', 'hero wears Anton poster caps: ' + out.hw.heroFont);
    assert(/Archivo/.test(out.hw.bodyFont), 'body is Archivo');
    assert(out.hw.tabsLeft === 0 && out.hw.tabsBottom === 0, 'tab bar is fixed full-width at the bottom');
    assert(out.hw.ctaBg === 'rgb(10, 67, 245)', 'the action surface is blue: ' + out.hw.ctaBg);
    assert(out.back.room === 'dark' && out.back.earned === '#d8ff63' && !/Anton/.test(out.back.heroFont) && out.back.tabsLeft > 0, 'switching back removes every room rule');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
