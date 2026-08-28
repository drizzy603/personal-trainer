// Sheet system (R2): all six overlay sheets mount on the shared shell —
// --card surface, .60 scrim, ✕ circle, and the swipe-dismiss grabber.
const { boot, assert, run } = require('../lib/harness');

run('sheets share the R2 shell + grabber', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const res = {};
      const tokenProbe = document.createElement('div');
      tokenProbe.style.background = 'var(--card)';
      document.body.appendChild(tokenProbe);
      res.cardSurface = getComputedStyle(tokenProbe).backgroundColor;
      tokenProbe.remove();
      function probe(name, openFn, overlayId, closeFn) {
        openFn();
        const ov = document.getElementById(overlayId);
        const sheet = ov && ov.querySelector('.kt-sheet');
        res[name] = sheet ? {
          surface: getComputedStyle(sheet).backgroundColor,
          scrim: getComputedStyle(ov).backgroundColor,
          x: !!ov.querySelector('.kt-sheet-x'),
          grab: !!ov.querySelector('.kt-sheet-grab'),
        } : 'missing';
        closeFn();
      }
      probe('theme', openThemeSheet, 'themeSheetOverlay', closeThemeSheet);
      probe('health', openHealthSettings, 'healthSheetOverlay', closeHealthSettings);
      probe('logTabs', openLogTabsEditor, 'logTabsOverlay', closeLogTabsEditor);
      probe('sportFields', () => openSportFieldsEditor('CrossFit'), 'sportFieldsOverlay', closeSportFieldsEditor);
      probe('cfPicker', openCFMovePicker, 'cfPickerOverlay', closeCFMovePicker);
      probe('errLog', openErrorLogSheet, 'errLogOverlay', closeErrorLogSheet);
      probe('sportCatalog', openSportCatalogSheet, 'sportCatalogOverlay', closeSportCatalogSheet);
      return res;
    });
    const expectedCard = out.cardSurface;
    delete out.cardSurface;
    for (const [name, r] of Object.entries(out)) {
      assert(r !== 'missing', name + ' sheet mounts');
      assert(r.surface === expectedCard, name + ' surface is --card, got ' + r.surface);
      assert(r.scrim === 'rgba(0, 0, 0, 0.6)', name + ' scrim .60');
      assert(r.x && r.grab, name + ' has ✕ + grabber');
    }
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
