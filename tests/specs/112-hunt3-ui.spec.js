// Hunt 3 fixes, ui cluster:
// - Day names are cut by characters, never inside an emoji: the Settings chips, the watch plan,
//   its week ahead and the widget summary stay decodable (half an emoji made Swift's JSONDecoder
//   reject the whole payload), a name an older page already cut is mended on read, and every
//   native payload drops a stray half as a backstop (H10).
// - Short day names keep what tells days apart: Full Body A / B read Full A / Full B, Lower Body
//   reads Lower (no trailing space), and two names that shorten alike get their last initial (L44).
// - Progress > Strength opens the curve of a lift with an apostrophe (Farmer's Carry) (M40).
// - The runner's exercise picker swaps in, adds and creates a name with a double quote (Box Jump 30") (M41).
// - A custom CrossFit movement with an apostrophe (Devil's Press) can be picked again on the next WOD (M42).
// - Coach starter chips send their text whatever it holds (yesterday's, a quote, markup) and show it as
//   text (M43).
// - Log > Body keeps Log and the goal's Set on screen and tappable at Larger Text (zoom up to 1.25)
//   on 390/375-pt phones and on 320-pt layouts (M36).
// - The coach's block name, week note and programme name read as text on every screen: a note like
//   "Work up to <heavy single>" keeps its words and no markup renders (L52).
// - A first name that starts with an emoji shows the whole emoji as the avatar on every tab, and the
//   avatar letter is text (L53).
// - Escape closes the top sheet with focus inside it too (sheets without a listener of their own,
//   the Exercise library, confirms), a sheet that handles Escape itself closes alone, and focus
//   returns to what opened the sheet (L54).
// - Keyboard and VoiceOver reach outside #screen: Exercise library and week-ladder rows take Tab (a
//   library row keeps focus when Enter opens it), set inputs in Edit sets are named, glyph buttons
//   say what they do, and the active Log sub-tab is the current one (L55).
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
      const a = lifts[0] || 'Push', b = lifts[1] || (a === 'Push' ? 'Pull' : 'Push');
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
      // the live mirror keys its logs by lift name: a set logged on that lift
      openDeckRunner(a); runnerSetWeight(50); runnerSetReps(5); runnerCompleteSet();
      window.__mock.updateContext.length = 0; _lastWatchPlan = null; _pushWatchPlan(); await wait(30);
      r.live = (window.__mock.updateContext.slice(-1)[0] || {}).live || '';
      r.liveName = runnerSession.exercises[0].name;
      closeDeckRunner();
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
    assert(out.liveName === 'Goblet Squat \ud83d' && out.live && !LONE_ESC.test(out.live) && JSON.parse(out.live).reps['Goblet Squat '], 'the live mirror mends a lift name used as a key: ' + out.live.slice(0, 120));
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

// R50: the L44 rule kept only the first word ("Day", "Week", an emoji) and then the last
// word's initial, so "Day 1 - Push" / "Day 2 - Pull" both read "Day P" on the chips, the
// watch and the widget, and one named day alone read "Day" or just its emoji.
run('short day names tell coach-style names apart: Day 1 / Day 2, Week A / B, emoji-led (R50)', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      window.__widget = [];
      Capacitor.Plugins.TrovoWidget.updateSummary = (a) => { window.__widget.push(a); return Promise.resolve({}); };
      await wait(300);
      const M = '\u{1F4AA}';
      const name = (a, b, c) => { setDayName('Push', a || 'Push'); setDayName('Pull', b || 'Pull'); setDayName('Legs', c || 'Legs'); };
      const three = () => [_dayShort('Push'), _dayShort('Pull'), _dayShort('Legs')];
      const r = {};
      name('Day 1 - Push', 'Day 2 - Pull', 'Day 3 - Legs'); r.dash = three();
      switchTab('settings'); await wait(20);
      r.chips = Array.from(document.querySelectorAll('.kt-day-chip')).map(b => b.querySelector('.kt-day-chip-t').textContent);
      r.plan = getWeekPlan().map(e => e.type);
      window.__mock.updateContext.length = 0; window.__widget.length = 0; _lastNativeSummary = null; _lastWatchPlan = null; _runNativeSync(); await wait(30);
      const ctx = window.__mock.updateContext.slice(-1)[0] || {};
      r.week = JSON.parse(ctx.week || '[]').filter(d => d.type === 'lift').map(d => d.slot + '=' + d.short);
      r.widget = JSON.parse((window.__widget.slice(-1)[0] || {}).json || '{"days":[]}').days.filter(d => LIFT_TYPES.indexOf(d.type) >= 0).map(d => d.type + '=' + d.short);
      name('Day 1: Upper Strength', 'Day 2: Lower Strength', 'Day 3: Upper Hypertrophy'); r.colon = three();
      name('Day 1 Upper', 'Day 3 Upper'); r.mid = three();
      name('Week A Upper', 'Week B Upper'); r.weekAB = three();
      name(M + ' Upper Body', M + ' Lower Body'); r.emoji = three();
      name('Upper Power', 'Upper Pull'); r.initial = three();
      name(M + ' Upper Body'); r.aloneEmoji = _dayShort('Push');
      name('Day 1 Upper'); r.aloneDay = _dayShort('Push');
      name('Week A Upper Body'); r.aloneWeek = _dayShort('Push');
      name('Full Body A', 'Full Body B', 'Lower Body'); r.ab = three();
      name('Ab + Bi + Tri + Calf + Neck'); r.many = _dayShort('Push');   // five initials would be nine characters
      // only days the programme can show count: the seed has no Arms day, until a cadence
      // (spelled in lower case, as a coach may) schedules one
      name('Arms Day'); r.unused = _dayShort('Push');
      const cr = getCustomRoutine(); cr.weekPlan = cr.weekPlan.map(v => v === 'Rest' ? 'arms' : v); lsSet('kt_routine', cr);
      r.used = [_dayShort('Push'), _dayShort('Arms')];
      return r;
    });
    const M = '\u{1F4AA}';
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const apart = (a) => a.every((s, i) => a.indexOf(s) === i);
    assert(eq(out.dash, ['Day 1', 'Day 2', 'Day 3']), 'Day 1 - Push / Day 2 - Pull / Day 3 - Legs: ' + JSON.stringify(out.dash));
    const chipOf = { Push: 'Day 1', Pull: 'Day 2', Legs: 'Day 3' };
    assert(out.plan.every((t, i) => !chipOf[t] || out.chips[i] === chipOf[t]), 'the Settings chips read Day 1 / Day 2 / Day 3: ' + JSON.stringify([out.plan, out.chips]));
    const slotsApart = (list) => { const m = {}; list.forEach(x => { const [k, v] = x.split('='); m[k] = v; }); const v = Object.keys(m).map(k => m[k]); return v.length >= 2 && apart(v) && v.every(s => /^Day \d$/.test(s)); };
    assert(slotsApart(out.week), 'the watch week keeps the days apart: ' + JSON.stringify(out.week));
    assert(slotsApart(out.widget), 'the widget summary keeps the days apart: ' + JSON.stringify(out.widget));
    assert(eq(out.colon, ['Day 1', 'Day 2', 'Day 3']), 'Day 1: Upper Strength / Day 2: Lower Strength: ' + JSON.stringify(out.colon));
    assert(eq(out.mid, ['Day 1', 'Day 3', 'Legs']), 'Day 1 Upper / Day 3 Upper: ' + JSON.stringify(out.mid));
    assert(eq(out.weekAB, ['Week A', 'Week B', 'Legs']), 'Week A Upper / Week B Upper: ' + JSON.stringify(out.weekAB));
    assert(eq(out.emoji, [M + ' Upper', M + ' Lower', 'Legs']), 'an emoji and Upper Body / Lower Body: ' + JSON.stringify(out.emoji));
    assert(apart(out.initial) && out.initial.slice(0, 2).every(s => /^Up/.test(s)), 'Upper Power / Upper Pull still differ: ' + JSON.stringify(out.initial));
    assert(out.aloneEmoji === M + ' Upper' && out.aloneDay === 'Day 1' && out.aloneWeek === 'Week A', 'one named day alone keeps its meaning: ' + JSON.stringify([out.aloneEmoji, out.aloneDay, out.aloneWeek]));
    assert(eq(out.ab, ['Full A', 'Full B', 'Lower']), 'Full A / Full B / Lower as before: ' + JSON.stringify(out.ab));
    assert(out.unused === 'Arms' && out.used[1] === 'Arms' && out.used[0] !== 'Arms' && /^Arms /.test(out.used[0]), 'a day the programme never shows does not crowd a name, a scheduled one does: ' + JSON.stringify([out.unused, out.used]));
    assert(out.many === 'A+B+T+C', 'initials stop at seven characters: ' + out.many);
    const all = [].concat(out.dash, out.colon, out.mid, out.weekAB, out.emoji, out.initial, out.chips, [out.aloneEmoji, out.aloneDay, out.aloneWeek, out.many], out.used);
    assert(all.every(s => s === s.trim() && Array.from(s).length <= 7), 'every short name is trimmed and at most seven characters: ' + JSON.stringify(all));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// T37: R50 offered a name whose first word differs from its rival's only one more letter of
// that word, so "Deadlifts" / "Deadlift Accessories" (and Shoulders / Shoulder Prehab) both
// read "Deadlif" on the chips, the watch week and the widget. The next word's initial tells
// them apart again, as before R50: "Deadl A".
run('plural and singular first words stay apart: Deadlifts / Deadlift Accessories (T37)', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      window.__widget = [];
      Capacitor.Plugins.TrovoWidget.updateSummary = (a) => { window.__widget.push(a); return Promise.resolve({}); };
      await wait(300);
      // cleared first: a name another day still holds is refused
      const pair = (a, b) => { setDayName('Push', ''); setDayName('Pull', ''); setDayName('Push', a); setDayName('Pull', b); return [_dayShort('Push'), _dayShort('Pull'), _dayShort('Legs')]; };
      const r = {};
      r.shoulders = pair('Shoulders', 'Shoulder Prehab');
      r.flipped = pair('Shoulder Prehab', 'Shoulders');
      r.hamstrings = pair('Hamstrings', 'Hamstring Focus');
      r.accessories = pair('Accessories', 'Accessory Work');
      r.squats = pair('Squats', 'Squat Accessories');
      r.deadlifts = pair('Deadlifts', 'Deadlift Accessories');
      switchTab('settings'); await wait(20);
      r.plan = getWeekPlan().map(e => e.type);
      r.chips = Array.from(document.querySelectorAll('.kt-day-chip')).map(b => b.querySelector('.kt-day-chip-t').textContent);
      window.__mock.updateContext.length = 0; window.__widget.length = 0; _lastNativeSummary = null; _lastWatchPlan = null; _runNativeSync(); await wait(30);
      const ctx = window.__mock.updateContext.slice(-1)[0] || {};
      r.week = JSON.parse(ctx.week || '[]').filter(d => d.type === 'lift').map(d => d.slot + '=' + d.short);
      r.widget = JSON.parse((window.__widget.slice(-1)[0] || {}).json || '{"days":[]}').days.filter(d => LIFT_TYPES.indexOf(d.type) >= 0).map(d => d.type + '=' + d.short);
      return r;
    });
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    assert(eq(out.shoulders, ['Shoulde', 'Shoul P', 'Legs']) && eq(out.flipped, ['Shoul P', 'Shoulde', 'Legs']), 'Shoulders / Shoulder Prehab: ' + JSON.stringify([out.shoulders, out.flipped]));
    assert(eq(out.hamstrings, ['Hamstri', 'Hamst F', 'Legs']) && eq(out.accessories, ['Accesso', 'Acces W', 'Legs']), 'Hamstrings / Hamstring Focus, Accessories / Accessory Work: ' + JSON.stringify([out.hamstrings, out.accessories]));
    assert(eq(out.squats, ['Squats', 'Squat', 'Legs']), 'Squats / Squat Accessories as before: ' + JSON.stringify(out.squats));
    assert(eq(out.deadlifts, ['Deadlif', 'Deadl A', 'Legs']), 'Deadlifts / Deadlift Accessories: ' + JSON.stringify(out.deadlifts));
    const want = { Push: 'Deadlif', Pull: 'Deadl A' };
    assert(out.plan.some(t => want[t]) && out.plan.every((t, i) => !want[t] || out.chips[i] === want[t]), 'the Settings chips read Deadlif / Deadl A: ' + JSON.stringify([out.plan, out.chips]));
    const read = (list) => { const m = {}; list.forEach(x => { const [k, v] = x.split('='); m[k] = v; }); return m; };
    const wk = read(out.week), wg = read(out.widget);
    assert((wk.Push || wk.Pull) && Object.keys(want).every(k => !wk[k] || wk[k] === want[k]), 'the watch week keeps the two days apart: ' + JSON.stringify(out.week));
    assert((wg.Push || wg.Pull) && Object.keys(want).every(k => !wg[k] || wg[k] === want[k]), 'the widget summary keeps the two days apart: ' + JSON.stringify(out.widget));
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

run('list buttons survive an apostrophe: CrossFit movements and coach chips (M42, M43)', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-ant-api03-test', kt_coach_msgs: '[]' } });
  try {
    const p = app.page;
    // M42: add "Devil's Press" once, then pick it from the list on the next WOD
    await p.evaluate(() => { switchTab('log'); switchLogSub('sport'); pickSport('CrossFit'); });
    await p.locator('#screen button', { hasText: '+ Add movement' }).first().click();
    await p.locator('#cfPickerSearch').fill("Devil's Press");
    await p.locator('#cfPickerList button', { hasText: '+ Add' }).click();
    await p.evaluate(() => { cfDraftMoves = []; render(); });
    await p.locator('#screen button', { hasText: '+ Add movement' }).first().click();
    await p.locator('#cfPickerSearch').fill('devil');
    await p.locator('#cfPickerList button', { hasText: "Devil's Press" }).first().click();
    const cf = await p.evaluate(() => ({ moves: cfDraftMoves.map(m => m.name), open: !!document.getElementById('cfPickerOverlay') }));
    assert(cf.moves.length === 1 && cf.moves[0] === "Devil's Press" && !cf.open, 'the saved movement is picked and the picker closes: ' + JSON.stringify(cf));
    // M43: every starter chip sends exactly its text
    const CH = ["Recovery tips after yesterday's Pull?", 'Is a 30" box jump <b>too</b> high?', 'Am I progressing on track?'];
    await p.evaluate((CH) => {
      window.__sent = [];
      window.sendCoachMessage = function () { const i = document.getElementById('coach-input'); window.__sent.push(i ? i.value : '(no input)'); };
      window.getCoachChips = function () { return CH.slice(); };
      switchTab('coach'); openCoachChat();
    }, CH);
    const chips = p.locator('#screen button[onclick^="sendCoachChip"]');
    const shown = await chips.allTextContents();
    for (let i = 0; i < CH.length; i++) await chips.nth(i).click();
    const sent = await p.evaluate(() => window.__sent);
    assert(JSON.stringify(shown) === JSON.stringify(CH), 'chips show their text as text: ' + JSON.stringify(shown));
    assert(JSON.stringify(sent) === JSON.stringify(CH), 'each chip sends its own text: ' + JSON.stringify(sent));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('Log > Body keeps Log and Set on screen at Larger Text and on 320-pt layouts (M36)', async () => {
  const app = await boot({ native: true });
  try {
    const p = app.page;
    const out = [];
    for (const [w, h, z] of [[390, 844, 1], [390, 844, 1.25], [375, 667, 1.12], [375, 667, 1.25], [320, 568, 1], [320, 568, 1.25]]) {
      await p.setViewportSize({ width: w, height: h });
      out.push(await p.evaluate((z) => {
        document.documentElement.style.zoom = z === 1 ? '' : String(z);
        switchTab('log'); switchLogSub('body');
        const sc = document.getElementById('screen');
        const btn = (t) => Array.from(sc.querySelectorAll('button')).find(x => x.textContent.trim() === t);
        const tappable = (el) => {
          el.scrollIntoView({ block: 'center' }); sc.scrollLeft = 0;   // the screen never scrolls sideways on a phone
          const q = el.getBoundingClientRect(), at = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
          return !!at && (at === el || el.contains(at));
        };
        const res = { size: innerWidth + '@' + z, log: tappable(btn('Log')), set: tappable(btn('Set')), overflow: sc.scrollWidth - sc.clientWidth };
        document.documentElement.style.zoom = '';
        return res;
      }, z));
    }
    assert(out.every(o => o.log && o.set && o.overflow <= 1), 'Log and Set are tappable and nothing overflows sideways: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('coach-written block name, week note and programme name read as text (L52)', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-ant-api03-test' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const cr = getCustomRoutine();
      cr.name = 'Block <b data-leak="name">X</b> & Co';
      cr.weeks.forEach(w => { w.bName = 'Peak <i data-leak="bname">A</i>'; w.wkNote = 'Work up to <heavy single> then <u data-leak="note">3x5</u>'; });
      lsSet('kt_routine', cr);
      const leaks = [];
      const scan = (where) => { const el = document.querySelector('[data-leak]'); if (el) leaks.push(where + ':' + el.getAttribute('data-leak')); };
      const sport = getLogTabs().find(t => _isSportTab(t)) || 'Cycling';   // a sport tab shows the week header
      const r = { leaks };
      switchTab('log'); switchLogSub(sport); await wait(20); scan('log/' + sport);
      r.header = (document.querySelector('#screen .hero-card') || {}).textContent || '';
      for (const t of ['progress', 'coach', 'settings']) { switchTab(t); await wait(20); scan(t); }
      openProgrammeModal(); await wait(20); scan('programme');
      r.modal = document.getElementById('prog-modal').textContent;
      closeProgrammeModal();
      return r;
    });
    assert(out.leaks.length === 0, 'no coach-written markup renders: ' + out.leaks.join(', '));
    assert(out.header.indexOf('Work up to <heavy single> then') >= 0 && out.header.indexOf('Peak <i') >= 0, 'the week header keeps every word: ' + out.header);
    assert(out.modal.indexOf('Block <b data-leak="name">X</b> & Co') >= 0 && out.modal.indexOf('Peak <i data-leak="bname">A</i>') >= 0, 'the programme sheet shows the names as typed: ' + out.modal.slice(0, 160));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R54: L52 escaped the block name and the week note, but a coach-written rep target (free
// text in the schema: "8-10", "Max", or anything) still went out as markup on Today's lift
// ledger and in Programme > Week by week, which pre-renders every week when it opens.
run('a coach-written rep target reads as text on Today and in the week ladder (R54)', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-ant-api03-test' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      window.__xss = 0;
      const REP = 'Work up to <heavy single> then <b data-leak="reps">3</b> <img src="x-missing.png" data-leak="img" onerror="window.__xss++">';
      const cr = getCustomRoutine();
      const dow = (new Date(todayISO() + 'T00:00:00').getDay() + 6) % 7;
      cr.weeks.forEach(w => {
        const plan = (Array.isArray(w.weekPlan) && w.weekPlan.length === 7 ? w.weekPlan : (cr.weekPlan || DEFAULT_WEEK_PLAN.map(p => p.type))).slice();
        plan[dow] = 'Push'; w.weekPlan = plan;
        (w.push || []).forEach((e, i) => { if (i === 0) { e.reps = REP; e.rpe = '8 <i data-leak="rpe">hard</i>'; } });
      });
      lsSet('kt_routine', cr);
      const r = {};
      switchTab('log'); switchLogSub('workout'); await wait(60);
      r.today = Array.from(document.querySelectorAll('#screen .kt-marquee-reps')).map(e => e.textContent);
      r.todayLeak = Array.from(document.querySelectorAll('#screen [data-leak]')).map(e => e.getAttribute('data-leak'));
      openProgrammeModal(); await wait(60);
      const m = document.getElementById('prog-modal');
      r.ladder = Array.from(m.querySelectorAll('.wk-ex-meta')).map(e => e.textContent).filter(t => /heavy single/.test(t)).slice(0, 2);
      r.ladderLeak = Array.from(m.querySelectorAll('[data-leak]')).map(e => e.getAttribute('data-leak'));
      closeProgrammeModal();
      await wait(150);
      r.xss = window.__xss;
      return r;
    });
    assert(out.today.some(t => t.indexOf('Work up to <heavy single> then <b data-leak="reps">3</b>') >= 0), 'Today shows the rep target as typed: ' + JSON.stringify(out.today));
    assert(out.todayLeak.length === 0, 'no rep-target markup renders on Today: ' + JSON.stringify(out.todayLeak));
    assert(out.ladder.length && out.ladder.every(t => t.indexOf('<heavy single>') >= 0 && t.indexOf('RPE 8 <i data-leak="rpe">hard</i>') >= 0), 'the week ladder shows the rep target and RPE as typed: ' + JSON.stringify(out.ladder));
    assert(out.ladderLeak.length === 0, 'no rep-target or RPE markup renders in the week ladder: ' + JSON.stringify(out.ladderLeak));
    assert(out.xss === 0, 'no coach-written handler runs: ' + out.xss);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// T38: R54's spec main lift had a logged RPE, so Today's hero quoted that. A main lift never
// logged (or logged without RPE) quotes the plan's "target RPE", which went out as markup.
run("Today's hero quotes a never-logged main lift's coach-written target RPE as text (T38)", async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-ant-api03-test' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      window.__xss = 0;
      const RPE = '8 <b data-leak="rpe-b">hard</b> <img src="x-missing.png" data-leak="rpe-img" onerror="window.__xss++">';
      // the coach puts today's day on Push, led by a lift never logged, through its own tool
      const dow = (new Date(todayISO() + 'T00:00:00').getDay() + 6) % 7;
      const cr = getCustomRoutine();
      const plan = (cr.weekPlan || DEFAULT_WEEK_PLAN.map(p => p.type)).slice();
      if (plan[dow] !== 'Push') { plan[plan.indexOf('Push')] = plan[dow]; plan[dow] = 'Push'; }
      const wk = getWkData();
      const res = executeCoachTool('update_routine_weeks', {
        weekPlan: plan,
        weeks: [{ wk: currentWeek, bName: wk.bName || 'Block', bColor: wk.bColor || '#0a43f5', wkNote: '',
          push: [{ name: 'Landmine Press', sets: 4, reps: '8', weight: 60, rpe: RPE, isMain: true }, { name: 'Dumbbell Fly', sets: 3, reps: '12', weight: 25, rpe: 7 }] }],
      });
      const r = { ok: res && res.ok, today: getTodayActivity().dayName, logged: !!getLastSessionData('Landmine Press'), deload: isDeloadWeek() };
      switchTab('log'); switchLogSub('workout'); await wait(60);
      const body = () => (document.querySelector('#screen .kt-hero-body') || {}).textContent || '';
      r.hero = body();
      r.leaks = Array.from(document.querySelectorAll('#screen .kt-hero-body [data-leak]')).map(e => e.getAttribute('data-leak'));
      // words in angle brackets are kept, not swallowed as a tag
      const cr2 = getCustomRoutine(); cr2.weeks[currentWeek - 1].push[0].rpe = '7-8 <leave 2 in the tank>'; lsSet('kt_routine', cr2); render(); await wait(30);
      r.hero2 = body();
      await wait(150);
      r.xss = window.__xss;
      return r;
    });
    assert(out.ok && out.today === 'Push' && !out.logged && !out.deload, 'today is the coach\'s Push day, led by a lift never logged: ' + JSON.stringify(out));
    assert(out.hero.indexOf('target RPE 8 <b data-leak="rpe-b">hard</b> <img') >= 0, 'the hero quotes the target RPE as typed: ' + out.hero);
    assert(out.leaks.length === 0 && out.xss === 0, 'no RPE markup renders and no handler runs: ' + JSON.stringify([out.leaks, out.xss]));
    assert(out.hero2.indexOf('target RPE 7-8 <leave 2 in the tank>.') >= 0, 'a note in angle brackets keeps its words: ' + out.hero2);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('an emoji first name is a whole avatar on every tab (L53)', async () => {
  const app = await boot({ native: true, seed: { kt_user_name: '\u{1F98A}Fox', kt_apikey: 'sk-ant-api03-test' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const avatars = () => Array.from(document.querySelectorAll('.kt-meta-ava,.screen-avatar,.profile-ava')).map(e => e.textContent);
      const seen = {};
      const visit = async (k, fn) => { fn(); await wait(20); seen[k] = avatars(); };
      await visit('log', () => { switchTab('log'); switchLogSub('workout'); });
      await visit('run', () => switchLogSub('run'));
      await visit('body', () => switchLogSub('body'));
      await visit('progress', () => switchTab('progress'));
      await visit('coach', () => switchTab('coach'));
      await visit('chat', () => openCoachChat());
      await visit('settings', () => switchTab('settings'));
      // a name that starts with markup: the letter is text
      localStorage.setItem('kt_user_name', '<i>Bo'); render(); await wait(20);
      const lt = { avatars: avatars(), injected: !!document.querySelector('.profile-ava i, .kt-meta-ava i, .screen-avatar i') };
      return { seen, lt };
    });
    const all = Object.keys(out.seen).map(k => [k, out.seen[k]]);
    assert(all.every(([, a]) => a.length >= 1 && a.every(t => t === '\u{1F98A}')), 'every avatar shows the whole fox: ' + JSON.stringify(out.seen));
    assert(out.lt.avatars.every(t => t === '<') && !out.lt.injected, 'a name starting with markup shows its first character as text: ' + JSON.stringify(out.lt));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R52: L53 took the first code point, so a flag showed one regional-indicator letter, a
// skin-toned thumb lost its tone and a family showed only the man. The avatar (and a short
// day name) now takes the first grapheme.
run('a flag, a skin tone or a joined emoji is a whole avatar too (R52)', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-ant-api03-test' } });
  try {
    const out = await app.page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const FLAG = '\u{1F1FA}\u{1F1F8}', THUMB = '\u{1F44D}\u{1F3FD}', FAM = '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}', HEART = '\u{2764}\u{FE0F}';
      const r = { want: [FLAG, FLAG, THUMB, FAM, HEART], seen: [] };
      for (const n of [FLAG + 'Sam', FLAG + ' Sam', THUMB + 'Bo', FAM + 'Fam', HEART + ' Ana']) {
        localStorage.setItem('kt_user_name', n);
        const got = {};
        switchTab('settings'); await wait(10); got.settings = (document.querySelector('.profile-ava') || {}).textContent;
        switchTab('progress'); await wait(10); got.progress = Array.from(document.querySelectorAll('.kt-meta-ava,.screen-avatar')).map(e => e.textContent);
        switchTab('coach'); await wait(10); got.coach = Array.from(document.querySelectorAll('.kt-meta-ava,.screen-avatar')).map(e => e.textContent);
        r.seen.push(got);
      }
      setDayName('Push', FLAG + ' Upper Body'); setDayName('Pull', FLAG + ' + Legs');
      r.short = [_dayShort('Push'), _dayShort('Pull')];
      // without a segmenter (iOS before 14.5) the first code point is still a whole one
      _graphSeg = false; r.noSeg = _initialOf(FLAG + 'Sam'); _graphSeg = null;
      return r;
    });
    out.seen.forEach((g, i) => {
      const w = out.want[i], all = [g.settings].concat(g.progress, g.coach);
      assert(all.length >= 2 && all.every(t => t === w), 'every avatar shows the whole ' + JSON.stringify(w) + ': ' + JSON.stringify(g));
    });
    assert(out.short[0] === '\u{1F1FA}\u{1F1F8} Upper' && out.short[1].indexOf('\u{1F1FA}\u{1F1F8}+') === 0, 'a short day name keeps the flag whole: ' + JSON.stringify(out.short));
    assert(out.noSeg === '\u{1F1FA}' && !LONE.test(out.noSeg), 'without a segmenter the avatar is a whole code point: ' + JSON.stringify(out.noSeg));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('Escape closes the top sheet with focus inside it, and focus goes back to the opener (L54)', async () => {
  const app = await boot({ native: true });
  try {
    const p = app.page;
    const ev = (fn) => p.evaluate(fn);
    const esc = async () => { await p.keyboard.press('Escape'); await p.waitForTimeout(30); };
    const state = () => ev(() => ({
      theme: !!document.getElementById('themeSheetOverlay'), lib: !!document.getElementById('exlibOverlay'),
      profile: !!document.getElementById('profileOverlay'), confirm: !!document.querySelector('.kt-close-sheet'),
      pr: !!document.getElementById('prHistOverlay'), focus: (document.activeElement && document.activeElement.id) || (document.activeElement && document.activeElement.tagName),
    }));
    await ev(() => { switchTab('settings'); const b = document.createElement('button'); b.id = '__opener'; b.textContent = 'opener'; document.body.appendChild(b); });
    const r = {};
    // a sheet with no Escape listener of its own, focus on its ✕
    await ev(() => { document.getElementById('__opener').focus(); openThemeSheet(); document.querySelector('#themeSheetOverlay button').focus(); });
    await esc(); r.theme = await state();
    // the Exercise library, focus inside it, then focus on <body>
    await ev(() => { document.getElementById('__opener').focus(); openExLib(); document.getElementById('exlibAddBtn').focus(); });
    await esc(); r.libInside = await state();
    await ev(() => { openExLib(); document.activeElement && document.activeElement.blur(); });
    await esc(); r.libBody = await state();
    // a confirm over a sheet: Escape takes the confirm, the next one the sheet
    await ev(() => { document.getElementById('__opener').focus(); openProfileSheet(); document.querySelector('#profileOverlay button').focus(); _ktConfirm({ title: 'Sure?', confirmLabel: 'Yes', onConfirm: function () {} }); });
    await esc(); r.confirm = await state();
    await esc(); r.profile = await state();
    // a sheet with its own listener over the library closes alone, for a real key and a synthetic one
    await ev(() => { openExLib(); openPRHistory('Bench Press'); });
    await esc(); r.prReal = await state();
    await ev(() => { openPRHistory('Bench Press'); document.getElementById('prHistOverlay').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await p.waitForTimeout(30); r.prSynthetic = await state();
    await esc(); r.libLast = await state();
    assert(!r.theme.theme && r.theme.focus === '__opener', 'a sheet closes with focus inside it, and focus returns to the opener: ' + JSON.stringify(r.theme));
    assert(!r.libInside.lib && r.libInside.focus === '__opener' && !r.libBody.lib, 'the Exercise library closes on Escape: ' + JSON.stringify([r.libInside, r.libBody]));
    assert(!r.confirm.confirm && r.confirm.profile && !r.profile.profile && r.profile.focus === '__opener', 'Escape closes the top sheet only: ' + JSON.stringify([r.confirm, r.profile]));
    assert(!r.prReal.pr && r.prReal.lib && !r.prSynthetic.pr && r.prSynthetic.lib && !r.libLast.lib, 'a sheet that handles Escape closes alone: ' + JSON.stringify([r.prReal, r.prSynthetic, r.libLast]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R51: L55 gave each library row role=button, and the row wrapped its open detail and the
// custom lift's ✕: a button's content is one flat label to VoiceOver, so the PR history
// button and Delete could not be reached. Only the header line is the control now.
run("a library row's control is its header: the open detail, PR history and Delete stay reachable (R51)", async () => {
  const app = await boot({ native: true });
  try {
    const p = app.page;
    const out = await p.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      saveCustomExercise({ name: 'Zercher Hold', cat: 'Legs', muscles: 'core, quads', equip: 'Barbell', desc: 'Hold it.', tips: ['Brace'], _custom: true });
      switchTab('settings');
      const lift = getAllExercises().find(e => _prHead(e.name)).name;
      openExLib(lift); await wait(20);
      const ov = document.getElementById('exlibOverlay');
      const head = (n) => Array.from(ov.querySelectorAll('#exlibList [data-n]')).find(x => x.dataset.n === n && x.tagName !== 'BUTTON');
      const wrapped = () => Array.from(ov.querySelectorAll('#exlibList [role=button]')).filter(b => b.querySelector('button, input, [role=button], [onclick]')).length;
      const r = { lift };
      const h = head(lift), pr = ov.querySelector('#exlibList .kt-ex-pr');
      r.open = { role: h && h.getAttribute('role'), tab: h && h.getAttribute('tabindex'), expanded: h && h.getAttribute('aria-expanded'), name: h ? h.textContent : '',
        pr: !!pr, prFree: !!pr && !pr.closest('[role=button]'), wrapped: wrapped() };
      _libSearch = 'Zercher Hold'; _libExpanded = 'Zercher Hold'; _updateExLibList(); await wait(10);
      const x = Array.from(ov.querySelectorAll('#exlibList button[data-n]')).find(b => b.dataset.n === 'Zercher Hold');
      r.custom = { x: !!x, xFree: !!x && !x.closest('[role=button]'), label: x && x.getAttribute('aria-label'), wrapped: wrapped() };
      // a tap on the header still opens and closes the row
      head('Zercher Hold').click(); await wait(10); r.closed = _libExpanded === '';
      head('Zercher Hold').click(); await wait(10); r.reopened = _libExpanded === 'Zercher Hold';
      closeExLib();
      return r;
    });
    assert(out.open.role === 'button' && out.open.tab === '0' && out.open.expanded === 'true', 'the header line is a button that says it is open: ' + JSON.stringify(out.open));
    assert(!/CUES|HISTORY|PR ·|TOP SET/.test(out.open.name), 'the button is named by its header, not the whole detail: ' + out.open.name.slice(0, 120));
    assert(out.open.pr && out.open.prFree && out.open.wrapped === 0, 'the PR history button is outside any button: ' + JSON.stringify(out.open));
    assert(out.custom.x && out.custom.xFree && out.custom.label === 'Delete Zercher Hold' && out.custom.wrapped === 0, 'the custom lift\'s Delete is its own button: ' + JSON.stringify(out.custom));
    assert(out.closed && out.reopened, 'tapping the header opens and closes the row: ' + JSON.stringify(out));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// R53: L54 left the runner's Edit sheet out of the sheets Escape closes, so mid-workout
// Escape did nothing there and closing it never gave focus back to the card.
run("Escape closes the runner's Edit sheet and focus goes back to the card's Edit (R53)", async () => {
  const app = await boot({ native: true });
  try {
    const p = app.page;
    const esc = async () => { await p.keyboard.press('Escape'); await p.waitForTimeout(30); };
    const state = () => p.evaluate(() => {
      const a = document.activeElement;
      return { open: !!document.getElementById('runner-ex-edit-modal'), runner: !!document.getElementById('runner-root'),
        onEdit: !!(a && /openRunnerExEdit/.test(a.getAttribute('onclick') || '')) };
    });
    await p.evaluate(() => { switchTab('log'); openDeckRunner('Push'); });
    const edit = p.locator('#runner-root button[onclick*="openRunnerExEdit"]').first();
    const r = {};
    // opened from the card with the keyboard, focus on the sheet's ✕
    await edit.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(30);
    r.opened = await state();
    await p.evaluate(() => document.querySelector('#runner-ex-edit-modal button[onclick^="closeRunnerExEdit"]').focus());
    await esc(); r.inside = await state();
    // focus on <body>
    await edit.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(30);
    await p.evaluate(() => document.activeElement && document.activeElement.blur());
    await esc(); r.body = await state();
    // in the exercise picker's search field: Escape steps back to the sheet (T39; this case
    // asserted the bug, the whole sheet closing), the next one closes it
    await edit.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(30);
    await p.evaluate(() => { _openRunnerExPicker(); document.getElementById('runner-ex-picker-q').focus(); });
    await esc(); r.picker = await state();
    r.picker.sheet = await p.evaluate(() => !!document.getElementById('runner-ex-sets-input') && !document.getElementById('runner-ex-picker-q'));
    await esc(); r.pickerThen = await state();
    await p.evaluate(() => closeDeckRunner());
    assert(r.opened.open, 'Enter on the card opens the Edit sheet: ' + JSON.stringify(r.opened));
    assert(!r.inside.open && r.inside.runner && r.inside.onEdit, 'Escape with focus inside closes it and focus returns to Edit: ' + JSON.stringify(r.inside));
    assert(!r.body.open && r.body.runner, 'Escape with focus on the page closes it, the runner stays: ' + JSON.stringify(r.body));
    assert(r.picker.open && r.picker.sheet && !r.pickerThen.open && r.pickerThen.runner && r.pickerThen.onEdit, 'Escape in the picker steps back to the sheet, the next closes it: ' + JSON.stringify([r.picker, r.pickerThen]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

// T39: R53 put the Edit sheet among the sheets Escape closes, so Escape in its exercise or
// superset picker (views painted inside the sheet, with their own ‹ / Back) closed the whole
// sheet and dropped its unsaved sets and weight. It steps back one level now, as Routines does.
run("Escape in the runner Edit sheet's pickers steps back and keeps the unsaved edits (T39)", async () => {
  const app = await boot({ native: true });
  try {
    const p = app.page;
    const esc = async () => { await p.keyboard.press('Escape'); await p.waitForTimeout(40); };
    const state = () => p.evaluate(() => {
      const v = (id) => { const e = document.getElementById(id); return e ? e.value : null; };
      const a = document.activeElement;
      return { open: !!document.getElementById('runner-ex-edit-modal'), picker: !!document.getElementById('runner-ex-picker-q'),
        sets: v('runner-ex-sets-input'), weight: v('runner-ex-weight-input'), focus: (a && a.getAttribute('onclick')) || (a && a.tagName) };
    });
    await p.evaluate(() => { switchTab('log'); openDeckRunner('Push'); });
    const edit = p.locator('#runner-root button[onclick*="openRunnerExEdit"]').first();
    const openEdit = async () => { await edit.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(30); };
    const sheetBtn = (frag) => p.locator('#runner-ex-edit-modal button[onclick*="' + frag + '"]').first();
    const r = {};
    await openEdit();
    r.seed = await state();
    await sheetBtn('runnerExEditStepSets(1)').click(); await sheetBtn('runnerExEditStepWeight(2.5)').click();   // the seed is in lb
    r.edited = await state();
    // Exercise › Change ›, type in the search field, Escape
    await sheetBtn('_openRunnerExPicker()').click();
    await p.locator('#runner-ex-picker-q').click(); await p.keyboard.type('lat');
    r.inPicker = await state();
    await esc(); r.swap = await state();
    // + Add exercise after, focus dropped to the page, Escape
    await sheetBtn("_openRunnerExPicker('add')").click();
    await p.evaluate(() => document.activeElement && document.activeElement.blur());
    await esc(); r.add = await state();
    // Superset with › (its view takes focus off the sheet), Escape
    await sheetBtn('runnerExEditPickSS()').click();
    r.inSS = await p.evaluate(() => _rExSSPicking && !document.getElementById('runner-ex-sets-input'));
    await esc(); r.ss = await state();
    r.ssPicking = await p.evaluate(() => _rExSSPicking);
    // from the sheet itself Escape closes it, focus back on the card's Edit
    await esc(); r.closed = await state();
    r.session = await p.evaluate(() => { const e = runnerSession.exercises[0]; return { sets: e.sets, name: e.name }; });
    await p.evaluate(() => closeDeckRunner());
    const kept = (s) => s.open && !s.picker && s.sets === r.edited.sets && s.weight === r.edited.weight;
    assert(r.edited.sets !== r.seed.sets && r.edited.weight !== r.seed.weight, 'the sheet holds unsaved sets and weight: ' + JSON.stringify([r.seed, r.edited]));
    assert(r.inPicker.picker, 'the exercise picker is open: ' + JSON.stringify(r.inPicker));
    assert(kept(r.swap) && /_openRunnerExPicker\(\)/.test(r.swap.focus), 'Escape in the picker steps back to the sheet, edits kept, focus on Change: ' + JSON.stringify(r.swap));
    assert(kept(r.add) && /_openRunnerExPicker\('add'\)/.test(r.add.focus), 'Escape in the add picker steps back, focus on + Add exercise after: ' + JSON.stringify(r.add));
    assert(r.inSS && kept(r.ss) && !r.ssPicking && /runnerExEditPickSS\(\)/.test(r.ss.focus), 'Escape in the superset picker steps back, focus on Superset with: ' + JSON.stringify(r.ss));
    assert(!r.closed.open && /openRunnerExEdit/.test(r.closed.focus || ''), 'Escape from the sheet closes it, focus on the card\'s Edit: ' + JSON.stringify(r.closed));
    assert(String(r.session.sets) === String(r.seed.sets), 'nothing was saved without Save: ' + JSON.stringify([r.session, r.seed]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('library and week-ladder rows take Tab, set inputs and glyph buttons are named, the sub-tab is current (L55)', async () => {
  const app = await boot({ native: true });
  try {
    const p = app.page;
    // a clickable element a keyboard cannot reach: not a control, no tabindex or no role
    const UNREACH = `(root) => Array.from(root.querySelectorAll('[onclick]')).filter(e => !/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(e.tagName) && !/^\\s*event\\.stopPropagation\\(\\)\\s*;?\\s*$/.test(e.getAttribute('onclick') || '') && (!e.hasAttribute('tabindex') || !e.hasAttribute('role'))).length`;
    const GLYPHS = `(root) => Array.from(root.querySelectorAll('button')).filter(b => !b.getAttribute('aria-label') && !b.getAttribute('title') && /^[\\u2715\\u00d7\\u2191\\u2193+\\u2212]$/.test((b.textContent || '').trim())).map(b => (b.getAttribute('onclick') || '').slice(0, 30))`;
    // Exercise library from its Settings row, with the keyboard
    await p.evaluate(() => switchTab('settings'));
    await p.locator('.settings-row[onclick="openExLib()"]').first().click();
    const lib = await p.evaluate(([U, G]) => { const ov = document.getElementById('exlibOverlay'); return { unreach: eval(U)(ov), glyphs: eval(G)(ov) }; }, [UNREACH, GLYPHS]);
    await p.locator('#exlibSearch').focus();
    let row = null;
    for (let i = 0; i < 40 && !row; i++) {
      await p.keyboard.press('Tab');
      row = await p.evaluate(() => { const a = document.activeElement; return a && a.closest('#exlibList') && a.tagName === 'DIV' ? a.getAttribute('data-n') : null; });
    }
    await p.keyboard.press('Enter');
    const opened = await p.evaluate(() => { const a = document.activeElement; return { name: _libExpanded, focus: a && a.getAttribute('data-n'), expanded: a && a.getAttribute('aria-expanded') }; });
    await p.evaluate(() => closeExLib());
    // the week ladder
    const ladder = await p.evaluate(([U, G]) => { openProgrammeModal(); const ov = document.getElementById('prog-modal'); const r = { unreach: eval(U)(ov), glyphs: eval(G)(ov), rows: ov.querySelectorAll('.wk-row[tabindex]').length }; closeProgrammeModal(); return r; }, [UNREACH, GLYPHS]);
    // Edit sets, Log sub-tabs, Body and Progress glyph buttons, the sport fields editor
    const rest = await p.evaluate(([U, G]) => {
      const r = {};
      const s = getSessions()[0];
      openSessionEditor(s.id);
      r.inputs = Array.from(document.querySelectorAll('#sessEditOverlay input[id^="se_0_0_"]')).map(i => i.getAttribute('aria-label'));
      r.first = s.exercises[0].name;
      closeSessionEditor();
      switchTab('log'); switchLogSub('body');
      r.subtabs = Array.from(document.querySelectorAll('.log-subtab')).map(b => ({ t: b.textContent, active: b.classList.contains('active'), current: b.getAttribute('aria-current'), label: b.getAttribute('aria-label') }));
      r.body = eval(G)(document.getElementById('screen'));
      switchTab('progress');
      r.progress = eval(G)(document.getElementById('screen'));
      openSportFieldsEditor('CrossFit');
      r.fields = eval(G)(document.getElementById('sportFieldsOverlay'));
      closeSportFieldsEditor();
      ['openSwapModal(2)', 'openRoutineArchiveModal()'].forEach(o => { eval(o); const ov = document.querySelector('.ex-modal-bg'); r[o] = eval(G)(ov); ov.remove(); });
      return r;
    }, [UNREACH, GLYPHS]);
    assert(lib.unreach === 0 && lib.glyphs.length === 0, 'every library row takes Tab and its ✕ is named: ' + JSON.stringify(lib));
    assert(row && opened.name === row && opened.focus === row && opened.expanded === 'true', 'Tab reaches a library row and Enter opens it with focus kept: ' + JSON.stringify([row, opened]));
    assert(ladder.unreach === 0 && ladder.rows > 0 && ladder.glyphs.length === 0, 'the week ladder rows take Tab: ' + JSON.stringify(ladder));
    assert(rest.inputs.length === 2 && rest.inputs.every(l => l && l.indexOf(rest.first + ', set 1') === 0), 'set inputs say which lift and set: ' + JSON.stringify(rest.inputs));
    const act = rest.subtabs.filter(t => t.active);
    assert(act.length === 1 && act[0].current === 'page' && rest.subtabs.filter(t => t.current).length === 1, 'the active sub-tab, and only it, is current: ' + JSON.stringify(rest.subtabs));
    assert(rest.subtabs.some(t => t.t === '+' && t.label), 'the + sub-tab is named: ' + JSON.stringify(rest.subtabs));
    assert(!rest.body.length && !rest.progress.length && !rest.fields.length && !rest['openSwapModal(2)'].length && !rest['openRoutineArchiveModal()'].length, 'glyph buttons are named: ' + JSON.stringify(rest));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
