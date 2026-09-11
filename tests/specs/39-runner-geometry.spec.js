// Runner geometry at the two viewports that matter: the engaged card must not
// scroll internally, its footer must stay inside the card, and the exercise
// strip must clear the dock. Ported from the audit's geom.js probe.
const { boot, assert, run } = require('../lib/harness');

for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  run('runner fits ' + vp.width + '×' + vp.height + ' without clipping', async () => {
    const app = await boot({ seed: { kt_sessions: '[]' } });
    try {
      await app.page.setViewportSize(vp);
      const out = await app.page.evaluate(() => {
        openDeckRunner('Push');
        // Entrance motion translates the runner for ~400ms; measure the resting layout.
        document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} });
        const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }; };
        const card = document.querySelector('.kt-r-card:not(.peek1):not(.peek2)');
        const foot = card && card.querySelector('.kt-r-card-foot');
        const fb = foot ? foot.getBoundingClientRect() : null, cb = card ? card.getBoundingClientRect() : null;
        return { root: r('#runner-root'), strip: r('.kt-r-strip'), tabs: r('#tabs'),
          cardOverflow: card ? card.scrollHeight - card.clientHeight : null,
          footClipped: (fb && cb) ? Math.round(fb.bottom - cb.bottom) : null };
      });
      assert(out.root && out.strip && out.tabs, 'runner, strip and dock render');
      assert(out.strip.bottom <= out.root.bottom - 8, 'strip clears the dock by ≥8px (strip ' + out.strip.bottom + ', root ' + out.root.bottom + ')');
      assert(out.root.bottom <= out.tabs.top, 'runner root ends above the dock');
      assert(out.cardOverflow === 0, 'engaged card has no internal overflow, got ' + out.cardOverflow);
      assert(out.footClipped !== null && out.footClipped <= 0, 'card footer stays inside the card, got ' + out.footClipped);
      assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  });
}
