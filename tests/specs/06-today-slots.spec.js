// Today slot system (screen 04): one banner max, losers become chips,
// tapping a chip promotes it, dismissal drops the chip.
const { boot, assert, run } = require('../lib/harness');

run('slot system packs the Today stack', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      lsSet('kt_readiness', { date: todayISO(), score: 64, zone: 'steady', parts: { sleep: 6.1, hrvDelta: -8, rhrDelta: 0 } });
      lsSet('kt_debrief', { id: 7, date: todayISO(), text: 'Solid session.' });
      lapsePending = { days: 5, to: 7, from: 6 };
      switchLogSub('workout'); render();
      const q = (sel) => document.querySelectorAll(sel).length;
      const banner = () => (document.querySelector('.kt-resume-banner') || {}).textContent || '';
      const s1 = { strips: q('.kt-util-strip'), chips: q('.kt-util-chip'), banners: q('.kt-resume-banner'), text: banner() };
      promoteTodayItem('debrief');
      const s2 = { banners: q('.kt-resume-banner'), text: banner() };
      lapsePending = null; todayBannerOverride = null;
      lsSet('kt_debrief_seen', 7); render();
      const s3 = { chips: q('.kt-util-chip'), banners: q('.kt-resume-banner') };
      lsDel('kt_readiness'); lsDel('kt_debrief'); lsDel('kt_debrief_seen'); render();
      return { s1, s2, s3 };
    });
    assert(out.s1.strips === 1 && out.s1.banners === 1, 'one strip, one banner');
    assert(out.s1.text.indexOf('WELCOME BACK') > -1, 'lapse outranks debrief');
    assert(out.s1.chips === 2, 'readiness + debrief chips, got ' + out.s1.chips);
    assert(out.s2.banners === 1 && out.s2.text.indexOf('DEBRIEF') > -1, 'chip promotion swaps the banner');
    assert(out.s3.banners === 0 && out.s3.chips === 1, 'dismissed item drops its chip');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
