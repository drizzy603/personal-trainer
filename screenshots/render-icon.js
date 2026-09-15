const { chromium } = require(require('path').join(__dirname, '..', 'tests', 'node_modules', 'playwright'));
const fs = require('fs'); const path = require('path');
const S = process.argv[2];
(async () => {
  const svg = fs.readFileSync(path.join(S, 'mark.svg'), 'utf8');
  const browser = await chromium.launch(); const page = await browser.newPage();
  const shot = async (w, h, html, out) => {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<html><body style="margin:0;background:#0a43f5">${html}</body></html>`);
    await page.screenshot({ path: path.join(S, out), clip: { x: 0, y: 0, width: w, height: h }, omitBackground: false });
  };
  // App icon 1024 (opaque)
  await shot(1024, 1024, svg.replace('width="1242" height="1242"', 'width="1024" height="1024"'), 'icon-1024.png');
  await shot(192, 192, svg.replace('width="1242" height="1242"', 'width="192" height="192"'), 'icon-192.png');
  await shot(180, 180, svg.replace('width="1242" height="1242"', 'width="180" height="180"'), 'apple-touch-180.png');
  // Splash 2732×2732: blue field, mark at ~34% width centred
  const markOnly = svg.replace(/<rect[^>]*\/>/, '');
  const inner = markOnly.replace('width="1242" height="1242"', 'width="930" height="930"');
  await shot(2732, 2732, `<div style="width:2732px;height:2732px;display:flex;align-items:center;justify-content:center">${inner}</div>`, 'splash-2732.png');
  await browser.close(); console.log('rendered');
})();
