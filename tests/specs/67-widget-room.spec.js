// The Home Screen widget wears the phone's room: the summary carries the room's own tokens
// (Heavyweight sends paper + its blue, Lime sends near-black + lime), while the Live Activity's
// `accent` stays the Lime in every room because that surface is always dark.
const { boot, assert, run } = require('../lib/harness');

run('widget summary carries the room; Live Activity accent stays lime', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const r = {};
      Capacitor.Plugins.TrovoWidget = Object.assign(Capacitor.Plugins.TrovoWidget || {}, {
        updateSummary: (p) => { window._sum = p; return Promise.resolve({}); },
      });
      const grab = () => { _lastNativeSummary = null; _runNativeSync(); return JSON.parse(window._sum.json); };
      applyTheme('heavyweight');
      r.heavy = grab();
      applyTheme('dark');
      r.lime = grab();
      applyTheme('heavyweight');
      return r;
    });
    const h = out.heavy.theme, l = out.lime.theme;
    assert(h && h.room === 'heavyweight' && h.paper === true && h.bg === '#f7f5ef' && h.accent === '#0a43f5' && h.onAccent === '#ffffff' && h.earnedInk === '#4f7000',
      'Heavyweight sends paper and its own blue: ' + JSON.stringify(h));
    assert(l && l.room === 'dark' && l.paper === false && l.accent === '#d8ff63' && /^#0/.test(l.bg),
      'Lime sends the near-black room: ' + JSON.stringify(l));
    assert(out.heavy.accent === '#d8ff63' && out.lime.accent === '#d8ff63',
      'the Live Activity accent stays lime in both rooms: ' + JSON.stringify([out.heavy.accent, out.lime.accent]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
