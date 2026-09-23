// Regenerate every icon and launch-screen asset from one master PNG.
//
//   node screenshots/render-icon.js assets/icon-master.png
//
// Writes, from the repo root:
//   app-icon-1024.png · app-icon-192.png · assets/icon-only.png   (web + PWA)
//   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
//   ios/App/SuperoWatch/Assets.xcassets/AppIcon.appiconset/watch-icon-1024.png
//   ios/App/App/Assets.xcassets/Splash.imageset/Default@{1,2,3}x…{,-dark}.png
//   assets/splash.png · assets/splash-dark.png
//
// The launch screen is the paper field the app itself opens on (matching
// LaunchScreen.storyboard's background) with the icon as a rounded tile at 26%
// width. Light and dark are the same image on purpose: the default room is
// paper, so a black launch screen would flash before the app painted.
const { chromium } = require(require('path').join(__dirname, '..', 'tests', 'node_modules', 'playwright'));
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const master = path.resolve(process.argv[2] || path.join(ROOT, 'assets', 'icon-master.png'));
const masterDark = path.resolve(process.argv[3] || path.join(ROOT, 'assets', 'icon-master-dark.png'));
if (!fs.existsSync(master)) { console.error('no master icon at ' + master); process.exit(1); }
const uri = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const dataUri = uri(master);
const darkUri = fs.existsSync(masterDark) ? uri(masterDark) : null;

const PAPER = '#f7f5ef';           // --bg of the default room
const ICONS = [
  ['app-icon-1024.png', 1024],
  ['app-icon-192.png', 192],
  ['assets/icon-only.png', 1024],
  ['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024],
  // The watch icon matches the phone's DEFAULT room (Heavyweight). watchOS has
  // no runtime alternate-icon API, so it cannot follow a theme switch; the
  // complication follows the theme instead (watchThemeAccent in the App Group).
  ['ios/App/SuperoWatch/Assets.xcassets/AppIcon.appiconset/watch-icon-1024.png', 1024],
];
// The black/lime colourway: iOS 18's dark-appearance icon.
const DARK_ICONS = [
  ['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-dark.png', 1024],
  ['assets/icon-dark-1024.png', 1024],
];
const SPLASHES = [
  ['ios/App/App/Assets.xcassets/Splash.imageset/Default@1x~universal~anyany.png', 1366],
  ['ios/App/App/Assets.xcassets/Splash.imageset/Default@1x~universal~anyany-dark.png', 1366],
  ['ios/App/App/Assets.xcassets/Splash.imageset/Default@2x~universal~anyany.png', 2732],
  ['ios/App/App/Assets.xcassets/Splash.imageset/Default@2x~universal~anyany-dark.png', 2732],
  ['ios/App/App/Assets.xcassets/Splash.imageset/Default@3x~universal~anyany.png', 4098],
  ['ios/App/App/Assets.xcassets/Splash.imageset/Default@3x~universal~anyany-dark.png', 4098],
  ['assets/splash.png', 2732],
  ['assets/splash-dark.png', 2732],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const shoot = async (w, h, body, out) => {
    await page.setViewportSize({ width: Math.min(w, 4098), height: Math.min(h, 4098) });
    await page.setContent(`<html><body style="margin:0">${body}</body></html>`);
    await page.waitForFunction(() => Array.from(document.images).every(i => i.complete && i.naturalWidth > 0));
    const abs = path.join(ROOT, out);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    await page.screenshot({ path: abs, clip: { x: 0, y: 0, width: w, height: h }, omitBackground: false });
    console.log('  ' + out + '  ' + w + '×' + h);
  };

  console.log('icons (square, opaque, no baked corners — iOS masks them):');
  for (const [out, size] of ICONS) {
    await shoot(size, size, `<img src="${dataUri}" style="display:block;width:${size}px;height:${size}px">`, out);
  }

  if (darkUri) {
    console.log('dark colourway (iOS dark appearance + the watch):');
    for (const [out, size] of DARK_ICONS) {
      await shoot(size, size, `<img src="${darkUri}" style="display:block;width:${size}px;height:${size}px">`, out);
    }
  }

  console.log('launch screens (paper field, icon tile at 26%):');
  for (const [out, size] of SPLASHES) {
    const tile = Math.round(size * 0.26);
    await shoot(size, size,
      `<div style="width:${size}px;height:${size}px;background:${PAPER};display:flex;align-items:center;justify-content:center">` +
      `<img src="${dataUri}" style="width:${tile}px;height:${tile}px;border-radius:${Math.round(tile * 0.225)}px;display:block">` +
      `</div>`, out);
  }

  await browser.close();
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
