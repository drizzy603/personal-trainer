// 134: the PWA reloads for a new service worker only when one replaces the worker the document started under
// (web 20261115-5).
// The page used to read "was a worker in charge?" inside its load handler and reload on any later controllerchange.
// A first install ends in clients.claim(): when the claim lands between that read and its controllerchange, the old
// page reloaded itself. Real trials of the old page as a PWA (a first install, then a reload 0 to 1 ms later):
// WebKit, the iPhone PWA's engine, gave that order in 5 of 252; Chromium in 0 of 120 (there the event comes before
// the load, or the reloaded document starts under the worker). So the rule protects a first visit in WebKit.
// What this spec is NOT: the cure for spec 108 M26's random failure, as its first header said. M26 runs in Chromium
// and fails the same way with service workers blocked: its evaluate lost its result to the inspector of Playwright's
// Chromium (spec 108, the comment in M26). What the rule says:
// - a controllerchange that leaves the same worker in charge reloads nothing (the old code reloaded on any such event
//   once it had seen a worker at load);
// - another worker taking over from the one the document started under reloads it (the update path);
// - a document that started with no worker (a first visit, a forced reload) never reloads, whatever claims it later,
//   a second worker included: it meets the new page at its next start;
// - the first install's real claim (sw.js precaches, skips waiting, claims) reloads nothing.
// The first two cases use a stand-in for the worker (a controller defined on the container, a synthetic
// controllerchange) in Chromium, which does not produce the first case's order by itself: they hold the rule's
// logic, not a browser's timing.
const { boot, assert, run } = require('../lib/harness');

// The worker each document started under, read at document start (before the page's scripts), and whether one is in
// charge now: the page's own reading (_swFirst) is held to it where the page has one.
const START = "window.__c0 = !!(navigator.serviceWorker && navigator.serviceWorker.controller);";

const J = (x) => JSON.stringify(x);
// Main-frame navigations from now on (a reload is one).
const navs = (app) => {
  const n = { count: 0 };
  app.page.on('framenavigated', (f) => { if (f === app.page.mainFrame()) n.count++; });
  return n;
};
// Another worker in charge: the container's controller reads as a new object from now on.
const OTHER = "(() => { const w = { scriptURL: 'sw.js#other' }; Object.defineProperty(navigator.serviceWorker, 'controller', { configurable: true, get: () => w }); })()";
const change = (app) => app.page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));
// A document under the worker from its start: the first install done and claimed, then a reload.
async function underTheWorker(app) {
  await app.page.evaluate(() => navigator.serviceWorker.ready);
  await app.page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  await app.page.reload({ waitUntil: 'load' });
  return app.page.evaluate(() => ({ c0: window.__c0, now: !!navigator.serviceWorker.controller,
    same: typeof _swFirst === 'undefined' ? null : navigator.serviceWorker.controller === _swFirst }));
}

run('a document that started with no worker (stand-in: a controller there by load, its controllerchange after the page\'s load handler): no reload, and none when a second worker takes over later', async () => {
  // the init script's load listener runs before the page's: the controller is there when the page's handler reads it
  const init = "addEventListener('load', function(){ var w={ scriptURL:'sw.js#claimed' }; Object.defineProperty(navigator.serviceWorker, 'controller', { configurable:true, get:function(){ return w; } }); window.__claimedAtLoad = true; });";
  const app = await boot({ init: START + init });
  try {
    const at = await app.page.evaluate(() => ({ claimed: !!window.__claimedAtLoad, c0: window.__c0, now: !!navigator.serviceWorker.controller,
      first: typeof _swFirst === 'undefined' ? 'none' : _swFirst }));
    assert(at.claimed && at.c0 === false && at.now && (at.first === null || at.first === 'none'), 'the document started with no worker, one in charge by load: ' + J(at));
    const n = navs(app);
    await app.page.evaluate(() => { window.__still = 1; });
    await change(app);
    await app.page.waitForTimeout(600);
    const still = await app.page.evaluate(() => window.__still === 1);
    assert(n.count === 0 && still, 'the late controllerchange reloads nothing: ' + J({ navs: n.count, still }));
    // a second worker takes over from the one that claimed this document: still no reload (it started with none)
    await app.page.evaluate(OTHER);
    await change(app);
    await app.page.waitForTimeout(600);
    const still2 = await app.page.evaluate(() => window.__still === 1);
    assert(n.count === 0 && still2, 'a second worker later reloads nothing either: ' + J({ navs: n.count, still2 }));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('a document that started under the worker: a late controllerchange with the same worker reloads nothing; another worker taking over reloads it', async () => {
  const app = await boot({ init: START });
  try {
    const w = await underTheWorker(app);
    assert(w.c0 && w.now && w.same !== false, 'the reloaded document started under the worker: ' + J(w));
    const n = navs(app);
    await app.page.evaluate(() => { window.__still = 1; });
    await change(app);
    await app.page.waitForTimeout(600);
    const still = await app.page.evaluate(() => window.__still === 1);
    assert(n.count === 0 && still, 'the same worker in charge: no reload: ' + J({ navs: n.count, still }));

    // another worker takes over: the page reloads (nothing open that a reload would lose)
    const loaded = app.page.waitForEvent('load', { timeout: 15000 });
    await app.page.evaluate(OTHER);
    await change(app);
    await loaded;
    assert(n.count === 1, 'one reload for the new worker: ' + J({ navs: n.count }));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('a document the network served sees the first install\'s real claim (precache, skip waiting, claim): no reload', async () => {
  const app = await boot({ init: START });
  try {
    const n = navs(app);
    const first = await app.page.evaluate(() => window.__c0);
    await app.page.evaluate(() => { window.__still = 1; window.__changes = 0; navigator.serviceWorker.addEventListener('controllerchange', () => { window.__changes++; }); });
    await app.page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
    await app.page.waitForTimeout(600);
    const out = await app.page.evaluate(() => ({ still: window.__still === 1, changes: window.__changes }));
    assert(first === false && out.still && n.count === 0, 'claimed with no reload: ' + J(Object.assign({ first, navs: n.count }, out)));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
