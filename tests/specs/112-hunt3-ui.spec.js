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
