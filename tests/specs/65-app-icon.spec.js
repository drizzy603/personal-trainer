// The Home Screen icon follows the theme room: Heavyweight -> the primary icon, Lime ->
// "AppIcon-Lime". A shell without the TrovoIcon plugin (before build 51) must not error.
const { boot, assert, run } = require('../lib/harness');

run('the app icon follows the theme, and older shells are unaffected', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const r = {};
      const calls = [];
      Capacitor.Plugins.TrovoIcon = { set: (o) => { calls.push(o.name); return Promise.resolve({ changed: true }); } };
      applyTheme('dark');
      applyTheme('heavyweight');
      r.calls = calls.slice();
      r.map = { dark: _appIconFor('dark'), heavy: _appIconFor('heavyweight') };
      // a plugin rejection is logged, not thrown
      Capacitor.Plugins.TrovoIcon = { set: () => Promise.reject(new Error('not frontmost')) };
      applyTheme('dark'); await wait(20);
      r.logged = /app icon: not frontmost/.test(JSON.stringify(lsGet('kt_err_log') || []));
      // an older shell: no plugin at all
      delete Capacitor.Plugins.TrovoIcon;
      let threw = false; try { applyTheme('heavyweight'); _syncAppIcon(); } catch (e) { threw = true; }
      r.oldShellOk = !threw;
      return r;
    });
    assert(out.calls.join(',') === 'AppIcon-Lime,', 'Lime asks for the alternate, Heavyweight for the primary: ' + JSON.stringify(out.calls));
    assert(out.map.dark === 'AppIcon-Lime' && out.map.heavy === '', 'room -> icon map: ' + JSON.stringify(out.map));
    assert(out.logged, 'a refused switch is recorded in the error log');
    assert(out.oldShellOk, 'a shell without the plugin is unaffected');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
