// Hunt 3 fixes, ui cluster:
// - Day names are cut by characters, never inside an emoji: the Settings chips, the watch plan,
//   its week ahead and the widget summary stay decodable (half an emoji made Swift's JSONDecoder
//   reject the whole payload), a name an older page already cut is mended on read, and every
//   native payload drops a stray half as a backstop (H10).
// - Short day names keep what tells days apart: Full Body A / B read Full A / Full B, Lower Body
//   reads Lower (no trailing space), and two names that shorten alike get their last initial (L44).
// - Progress > Strength opens the curve of a lift with an apostrophe (Farmer's Carry) (M40).
// - The runner's exercise picker swaps in, adds and creates a name with a double quote (Box Jump 30") (M41).
const { boot, assert, run, SEED } = require('../lib/harness');

// A lone UTF-16 half, raw or as the \udXXX escape JSON.stringify writes for it.
const LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(^|[^\ud800-\udbff])[\udc00-\udfff]/;
const LONE_ESC = /\\ud[89ab][0-9a-f]{2}(?!\\ud[c-f][0-9a-f]{2})|(?<!\\ud[89ab][0-9a-f]{2})\\ud[c-f][0-9a-f]{2}/i;

run('emoji day names never reach the watch or the widget cut in half (H10)', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      window.__widget = [];
      Capacitor.Plugins.TrovoWidget.updateSummary = (a) => { window.__widget.push(a); return Promise.resolve({}); };
      await wait(300);
      const push = () => { window.__mock.updateContext.length = 0; window.__widget.length = 0; _lastNativeSummary = null; _lastWatchPlan = null; _runNativeSync(); };
      const last = () => ({ ctx: window.__mock.updateContext.slice(-1)[0] || {}, sum: (window.__widget.slice(-1)[0] || {}).json || '' });
      // the lift days the next week holds, whichever weekday today is
      const lifts = _nativeSummaryDays().filter(d => d.lifts > 0 || LIFT_TYPES.indexOf(d.type) >= 0).map(d => d.type)
        .filter((t, i, a) => a.indexOf(t) === i);
      const a = lifts[0], b = lifts[1] || (lifts[0] === 'Push' ? 'Pull' : 'Push');
      const r = { a, b };
      // a name whose seventh unit is the first half of an emoji, and a 24-character one ending in an emoji
      setDayName(a, 'Push \u{1F4AA} day');
      setDayName(b, 'Upper Body Strength Day\u{1F4AA}');
      r.storedB = getCustomRoutine().dayNames[b];
      r.shortA = _dayShort(a); r.shortB = _dayShort(b);
      r.coachCut = _cleanDayLabel('\u{1F4AA}'.repeat(30));
      switchTab('settings'); await wait(50);
      r.chips = Array.from(document.querySelectorAll('.kt-day-chip-t')).map(e => e.textContent);
      push(); await wait(30);
      let l = last();
      r.fresh = { plan: l.ctx.json || '', week: l.ctx.week || '', live: l.ctx.live || '', sum: l.sum };
      r.sumDays = JSON.parse(l.sum).days.map(d => ({ type: d.type, label: d.label, short: d.short }));
      // what an older page stored (a name cut inside its emoji), and half an emoji in a lift's name
      const cr = getCustomRoutine();
      cr.dayNames[a] = 'Legs Day \ud83e';
      cr.weeks.forEach(w => { const arr = w[a.toLowerCase()]; if (arr && arr[0]) arr[0].name = 'Goblet Squat \ud83d'; });
      lsSet('kt_routine', cr);
      r.legacyLabel = _dayLabel(a);
      push(); await wait(30);
      l = last();
      r.legacy = { plan: l.ctx.json || '', week: l.ctx.week || '', sum: l.sum };
      return r;
    });
    const anyLone = (o) => Object.keys(o).filter(k => LONE_ESC.test(o[k]) || LONE.test(o[k]));
    assert(out.storedB === 'Upper Body Strength Day\u{1F4AA}', 'a 24-character name keeps its last emoji whole: ' + JSON.stringify(out.storedB));
    assert(!LONE.test(out.shortA) && !LONE.test(out.shortB), 'short names are whole characters: ' + JSON.stringify([out.shortA, out.shortB]));
    assert(Array.from(out.coachCut).length === 24 && !LONE.test(out.coachCut), 'a long coach name is cut at 24 characters, between emoji: ' + out.coachCut.length);
    assert(out.chips.every(c => !LONE.test(c)), 'Settings chips show no half characters: ' + JSON.stringify(out.chips));
    assert(anyLone(out.fresh).length === 0, 'watch plan, week, live and widget summary carry no half characters: ' + anyLone(out.fresh));
    ['plan', 'week', 'sum'].forEach(k => { if (out.fresh[k]) JSON.parse(out.fresh[k]); });
    const dayB = out.sumDays.find(d => d.type === out.b);
    assert(!dayB || dayB.label === 'Upper Body Strength Day\u{1F4AA}', 'the widget gets the whole name: ' + JSON.stringify(dayB));
    assert(out.legacyLabel === 'Legs Day', 'a name an older page cut in half is mended on read: ' + JSON.stringify(out.legacyLabel));
    assert(anyLone(out.legacy).length === 0, 'a stray half anywhere in a payload is dropped before the shell sees it: ' + anyLone(out.legacy));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('short day names keep what tells days apart (L44)', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const r = {};
      setDayName('Push', 'Full Body A'); setDayName('Pull', 'Full Body B'); setDayName('Legs', 'Lower Body');
      r.ab = [_dayShort('Push'), _dayShort('Pull'), _dayShort('Legs')];
      setDayName('Push', 'Upper Power'); setDayName('Pull', 'Upper Volume'); setDayName('Legs', 'Chest + Back');
      r.clash = [_dayShort('Push'), _dayShort('Pull'), _dayShort('Legs')];
      setDayName('Pull', 'Pull');   // back to the stock name: Push no longer clashes
      r.alone = _dayShort('Push');
      switchTab('settings');
      r.chips = Array.from(document.querySelectorAll('.kt-day-chip-t')).map(e => e.textContent);
      return r;
    });
    assert(JSON.stringify(out.ab) === JSON.stringify(['Full A', 'Full B', 'Lower']), 'A and B stay apart, no trailing space: ' + JSON.stringify(out.ab));
    assert(JSON.stringify(out.clash) === JSON.stringify(['Upper P', 'Upper V', 'C+B']), 'names that shorten alike get their last initial: ' + JSON.stringify(out.clash));
    assert(out.alone === 'Upper', 'without a clash the first word is enough: ' + out.alone);
    assert(out.chips.every(c => c === c.trim() && Array.from(c).length <= 7), 'chips are trimmed and at most seven characters: ' + JSON.stringify(out.chips));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('a lift with an apostrophe opens its Strength curve (M40)', async () => {
  const sessions = JSON.parse(SEED.kt_sessions);
  sessions.forEach((s) => { if (Array.isArray(s.exercises)) s.exercises.push({ name: "Farmer's Carry", sets: 3, reps: ['12', '12', '12'], weight: 70 }); });
  const app = await boot({ native: true, seed: { kt_sessions: JSON.stringify(sessions) } });
  try {
    const p = app.page;
    await p.evaluate(() => switchTab('progress'));
    const row = p.locator('#screen [onclick^="toggleStrengthChart"]').filter({ hasText: "Farmer's Carry" }).first();
    await row.scrollIntoViewIfNeeded();
    await row.click();
    const open = await p.evaluate(() => ({ open: strengthChartOpen, curve: !!Array.from(document.querySelectorAll('#screen [onclick^="toggleStrengthChart"]')).find(r => /Farmer/.test(r.textContent) && r.nextElementSibling && r.nextElementSibling.querySelector('svg')) }));
    assert(open.open === "Farmer's Carry" && open.curve, 'the row opens its curve: ' + JSON.stringify(open));
    await p.locator('#screen [onclick^="toggleStrengthChart"]').filter({ hasText: "Farmer's Carry" }).first().click();
    assert(await p.evaluate(() => strengthChartOpen) === null, 'a second tap closes it');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('the runner picker takes a name with a double quote (M41)', async () => {
  const app = await boot({ native: true });
  try {
    const p = app.page;
    await p.evaluate(() => {
      saveCustomExercise({ name: 'Box Jump 30"', cat: 'Legs', muscles: 'Not specified', equip: 'Not specified', desc: '', tips: [], _custom: true });
      switchTab('log'); openDeckRunner('Push'); openRunnerExEdit(1); _openRunnerExPicker();
    });
    // swap: Choose Exercise
    await p.locator('#runner-ex-picker-q').fill('Box Jump');
    await p.locator('#runner-ex-picker-list button', { hasText: 'Box Jump 30' }).first().click();
    const swapped = await p.evaluate(() => _rExEditName);
    // add: + Add exercise after
    await p.evaluate(() => { closeRunnerExEdit(); openRunnerExEdit(0); _openRunnerExPicker('add'); });
    await p.locator('#runner-ex-picker-q').fill('Box Jump');
    await p.locator('#runner-ex-picker-list button', { hasText: 'Box Jump 30' }).first().click();
    const added = await p.evaluate(() => runnerSession.exercises.map(e => e.name));
    // create: a typed name that is not in the library yet
    await p.evaluate(() => { closeRunnerExEdit(); openRunnerExEdit(0); _openRunnerExPicker('add'); });
    await p.locator('#runner-ex-picker-q').fill(' Box Jump 24" ');
    await p.locator('#runner-ex-picker-list button', { hasText: 'Create' }).first().click();
    const created = await p.evaluate(() => ({ session: runnerSession.exercises.map(e => e.name), custom: getCustomExercises().map(e => e.name) }));
    assert(swapped === 'Box Jump 30"', 'swap picks the quoted name: ' + JSON.stringify(swapped));
    assert(added[1] === 'Box Jump 30"', 'add puts it after the card: ' + JSON.stringify(added));
    assert(created.session[1] === 'Box Jump 24"' && created.custom.indexOf('Box Jump 24"') >= 0, 'Create files and adds the typed name, trimmed: ' + JSON.stringify(created));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
