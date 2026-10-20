// fp-spec: self-shelled
// 126: the Coach tab's page-built models (build 61, plan task P6; contract 6.1, 6.2, 6.4, 3.7, I10).
// - CoachHomeModel v1 (_coachHomeModel) is the web Coach hub and connect screen it draws (_coachHomeHTML), in every
//   page-built fixture's state (tests/golden/dump-coach-home.js's SCENARIOS, set by its applyScenario, as the dump sets
//   them: the model is the fixture's, boot aside) and in the frozen hub cases the fixtures do not hold (setup with no
//   key, no name on either screen, an ASCII preview over 65 characters, a photo alone) and a few more: the meta label
//   and avatar, the hero, the key field's label and placeholder, the CTA, the help's lines, the starter link, and the
//   groups and rows (order, actions, titles, subs) equal the textContent of the elements on screen, drawn with no shell
//   and under the native bar (tabsWeb), one screen in both, and every handler on it names a function the page has.
//   hub-resume's page draws the setup chat over the hub: its model is held to the hub drawn from it. Rows appear
//   exactly when the web shows them (Build My Programme without a programme, Clear Chat History with messages,
//   Disconnect always; the starter link only without a programme) and Open Chat's sub has its three lines; resume is
//   true with a key in setup and with a key, a reply in flight and the chat view, false for a reply in flight on the
//   hub, with no key in setup (route connect) and in every page-built fixture but hub-resume.
// - The builders have no side effects: around every call, storage (and under STORE=shadow the store facade's and the
//   mock store's counters), the Coach and tab globals, the messages, _fp and the screen are unchanged; rev is the
//   caller's and boot the document's.
// - tokens.type is the chat's sizes plus the 16 home* sizes of the per-room table (contract 6.2), in a copy:
//   _COACH_TOKENS.type and every CoachModel (built now, and Fixtures/coach) hold none; connect.help is the two
//   paragraphs joined by one "\n".
// - The preview cuts in whole characters: a 65th character that is an emoji stays whole in the model and the HTML,
//   with no lone surrogate in either; ASCII is cut where the old 65-unit slice cut it.
// - Escaping (plan P-D4): a name and a block name holding a quote, & and markup draw as text (no <b> element) equal to
//   the model's, which is raw; the model never holds the key (saved, or typed and unsaved) nor its masked form.
// - TabsModel v1 (_tabsModel) per room: tint and idle are the web bar's selected and idle colours (Heavyweight
//   #0a43f5, Lime #f4f4f1; the room's --muted), the items' titles and a11y are #tabs' own, and the room follows
//   currentTheme, a dev.theme room (the test tools' room for a launch, never saved) included.
// - Golden: the page-built coachHome and tabs fixtures are what the page builds now, and the chat built under the
//   tabs shell is Fixtures/coach (tests/golden/dump-coach-home.js; spec 118 holds the chat's own drift).
// Every boot names its shell (the mark above): FP_SHELL_INERT runs skip this spec.
const fs = require('fs');
const path = require('path');
const { boot, assert, run, SHELLS } = require('../lib/harness');
const { CLOCK_INIT } = require('../golden/coach-cases');
const { SCENARIOS, applyScenario } = require('../golden/dump-coach-home');

// One case at a time: each starts its own browser.
let _chain = Promise.resolve();
function serial(name, fn) {
  const prev = _chain;
  let done;
  _chain = new Promise((r) => { done = r; });
  run(name, async () => { await prev; try { await fn(); } finally { done(); } });
}
const J = (x) => JSON.stringify(x);
const FIXTURES = path.join(__dirname, '..', '..', 'ios', 'App', 'FPKit', 'Tests', 'FPCoreTests', 'Fixtures');
const HAND_MADE = ['forward-compat.json', 'lone-surrogates.json', 'minimal.json'];
// Contract 6.2's table: the hub's sizes per room (Heavyweight, Lime).
const HOME = {
  homeMeta: [10, 10], homeAvatar: [13, 13], homeGreet: [15, 14], homeTitle: [74, 56], homeTitleMin: [54, 43], homeBody: [15, 14],
  homeGroupHead: [9, 9], homeRowTitle: [14, 14], homeRowSub: [11.5, 11.5], homeFieldLabel: [9, 9], homeField: [16, 16],
  homeCtaLabel: [9, 9], homeCtaTitle: [18, 18], homeCtaArrow: [22, 22], homeHelp: [12, 12], homeLink: [14, 14],
};
const ON = { openChat: 'openCoachChat()', startIntake: 'startRoutineIntake()', clearChat: '_confirmClearChat()', disconnect: 'clearApiKey()' };
const LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
// The dump's seed: the page-built fixtures' states are drawn on it, on its clock (CLOCK_INIT), so their models are the
// fixtures'.
const DUMP_SEED = { kt_apikey: 'sk-ant-golden', kt_coach_msgs: '[]' };

// The states (applyScenario's data): every page-built coachHome fixture's, by its <folder>/<name>, then the frozen hub
// cases the fixtures do not hold (tests/golden/coach-cases.js's homes group) and this spec's own.
const CHAT = [
  { role: 'user', content: 'How was my week?', at: [-1, '18:00'] },
  { role: 'assistant', content: '%%type: Week review\nSolid week.\n%%metric: RUNS | 2 | of 3 | -1 | warn\n\nFour sessions and two runs, all done.\n%%action: Plan week 7 | Plan my week 7', at: [-1, '18:01'] },
  { role: 'user', content: 'And the runs?', at: [0, '07:30'] },
];
const LONG = 'Your bench has moved from 150 to 170 lb in six weeks: that is steady progress. Keep the runs easy.';
const STATES = {};
for (const name of Object.keys(SCENARIOS)) if (SCENARIOS[name].model === 'coachHome') STATES[name] = SCENARIOS[name];
Object.assign(STATES, {
  'connect-intake': { key: null, intake: true },
  'connect-noname': { key: null, name: null, routine: { name: 'Custom Plan' } },   // a placeholder first word: no name
  'hub-noname': { name: null, routine: { name: 'Custom Plan' } },
  'hub-long-preview': { msgs: [CHAT[0], { role: 'assistant', content: 'Four sessions logged.', at: [-1, '18:01'] }, { role: 'assistant', content: LONG, at: [0, '07:31'] }] },
  'hub-one-exchange': { msgs: CHAT.slice(0, 2) },
  'hub-odd': { msgs: CHAT },
  'hub-programme-empty': { routine: null },
  'hub-image': { msgs: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'R0lGODlhAQABAAAAACw=' } }], at: [0, '07:40'] }] },
});

// In the page: the helpers the cases share. __apply(o) is the dump's applyScenario; __state(o) sets a state and draws
// the Coach tab; __read(root) is what #screen (or root) shows; __home(rev) and __tabs(rev) build a model and note in
// __impure anything the build changed (__snap: storage, the facade's and the mock store's counters, the Coach and tab
// globals, the messages, _fp and the screen).
const HELPERS = '(() => {\n  window.__apply = (' + applyScenario.toString() + ');\n' + `
  window.__state = (o) => { __apply(o); if (currentTab !== 'coach') switchTab('coach'); else render(); };
  window.__routineWithBlock = (bName) => {
    const r = JSON.parse(JSON.stringify(lsGet('kt_routine'))), wk = Math.min(currentWeek, r.weeks.length);
    r.weeks[wk - 1].bName = bName;
    return r;
  };
  window.__read = (root) => {
    const s = root || document.getElementById('screen'), q = (sel) => s.querySelector(sel), t = (el) => (el ? el.textContent : null);
    const fn = (a) => { const x = /^([A-Za-z_$][\\w$]*)\\(\\)$/.exec(a || ''); return !!x && typeof window[x[1]] === 'function'; };
    const h1 = q('.kt-hero-headline'), cta = q('.kt-cta'), p = cta && cta.nextElementSibling && cta.nextElementSibling.tagName === 'P' ? cta.nextElementSibling : null;
    let help = null;
    if (p) { help = ['']; p.childNodes.forEach((n) => { if (n.nodeName === 'BR') help.push(''); else help[help.length - 1] += n.textContent; }); }
    const starter = s.querySelector('button[onclick="openStarterIntake()"]');
    const input = q('#coach-key-input');
    return {
      meta: { label: t(q('.kt-meta-label')), avatar: t(q('.kt-meta-ava')) },
      hero: { greet: t(q('.kt-hero-greet')), title: h1 && h1.firstChild ? h1.firstChild.textContent : null, accent: t(q('.kt-hero-headline .kt-line2.accent')), body: t(q('.kt-hero-body')) },
      connect: input ? { label: t(q('.field label')), placeholder: input.getAttribute('placeholder'), cta: { label: t(q('.kt-cta-label')), title: t(q('.kt-cta-title')) }, help, starter: starter ? starter.textContent : null } : null,
      groups: [...s.querySelectorAll('.settings-group')].map((g) => ({ head: t(g.querySelector('.settings-group-hd')),
        rows: [...g.querySelectorAll('.settings-row')].map((r) => ({ on: r.getAttribute('onclick'), title: t(r.querySelector('.settings-row-title')), sub: t(r.querySelector('.settings-row-sub')) })) })),
      handlers: [...s.querySelectorAll('[onclick]')].map((el) => el.getAttribute('onclick')).filter((a) => !fn(a)),
      bold: !!s.querySelector('b, i'),
      html: s.innerHTML,
    };
  };
  window.__snap = () => {
    const ls = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k); }
    const mk = window.__ktMock;
    return JSON.stringify({ ls, coachView, intakeMode, coachLoading, currentTab, currentTheme, currentWeek, logSubTab, coachMessages,
      pendingImage, runningTools: _runningTools, fp: _fp, boot: _fpBoot, screen: document.getElementById('screen').innerHTML,
      facade: window.__ktStoreState || null, mock: mk ? [mk.count('writes'), mk.log.length, mk.posts.length] : null });
  };
  window.__diff = (a, b) => {
    const x = JSON.parse(a), y = JSON.parse(b), out = [];
    for (const k of Object.keys(x)) {
      if (k === 'ls') { for (const key of new Set(Object.keys(x.ls).concat(Object.keys(y.ls)))) if (x.ls[key] !== y.ls[key]) out.push('localStorage ' + key); }
      else if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) out.push(k);
    }
    return out.join(', ');
  };
  window.__impure = [];
  window.__pure = (what, f) => { const b = __snap(), m = f(), a = __snap(); if (a !== b) __impure.push(what + ' changed ' + __diff(b, a)); return m; };
  window.__home = (rev) => __pure('_coachHomeModel(' + rev + ')', () => _coachHomeModel(rev));
  window.__tabs = (rev) => __pure('_tabsModel(' + rev + ')', () => _tabsModel(rev));
})()`;

// The model against the screen drawn from it (I10): every string the native hub draws is on the web's screen.
function sameAsScreen(name, m, d) {
  assert(m.meta.label === d.meta.label && m.meta.avatar === d.meta.avatar, name + ': the meta row ' + J([m.meta, d.meta]));
  for (const k of ['greet', 'title', 'accent', 'body']) assert(m.hero[k] === d.hero[k], name + ': hero.' + k + ' ' + J([m.hero[k], d.hero[k]]));
  assert(d.handlers.length === 0, name + ': every handler on the screen names a function the page has ' + J(d.handlers));
  if (m.route === 'connect') {
    assert(m.connect && d.connect && !d.groups.length && !m.groups.length, name + ': the connect screen has the field and no groups ' + J(d.groups));
    assert(m.connect.label === d.connect.label && m.connect.placeholder === d.connect.placeholder, name + ': the key field ' + J([m.connect, d.connect]));
    assert(J(m.connect.cta) === J(d.connect.cta), name + ': the CTA ' + J([m.connect.cta, d.connect.cta]));
    assert(J(m.connect.help.split('\n')) === J(d.connect.help), name + ': the help lines ' + J([m.connect.help, d.connect.help]));
    assert((m.connect.starter ? m.connect.starter.label : null) === d.connect.starter, name + ': the starter link ' + J([m.connect.starter, d.connect.starter]));
  } else {
    assert(m.route === 'hub' && m.connect === null && !d.connect, name + ': the hub has no key field');
    const mg = m.groups.map((g) => ({ head: g.head, rows: g.rows.map((r) => ({ on: ON[r.do], title: r.title, sub: r.sub })) }));
    assert(J(mg) === J(d.groups), name + ': the groups and rows ' + J(mg) + ' vs ' + J(d.groups));
  }
}

// Drawn twice: with no shell (the browser, the PWA and every shell before 60: the page as it always was) and under
// build 61's bar over the web Coach tab ('tabsWeb'). The model is the screen in each, and the two screens are the same.
// One boot per shell on the dump's seed, and one for each set of boot keys a state names (hub-resume boots in setup).
serial('the Coach home model is the web hub and connect screen drawn from it in every fixture\'s state, with no shell and under the native bar; rows, Open Chat\'s sub-lines and resume', async () => {
  const groups = [];
  for (const name of Object.keys(STATES)) {
    const keys = STATES[name].boot || null, id = J(keys);
    let g = groups.find((x) => x.id === id);
    if (!g) groups.push(g = { id, keys, names: [] });
    g.names.push(name);
  }
  const drawn = { none: {}, tabsWeb: {} };
  for (const shell of ['none', 'tabsWeb']) {
    const S = shell + ': ', res = {};
    let more = null;
    for (const g of groups) {
      const app = await boot({ native: true, shell, page: { timezoneId: 'UTC' }, init: CLOCK_INIT, seed: Object.assign({}, DUMP_SEED, g.keys || {}) });
      try {
        const out = await app.page.evaluate(({ HELPERS, states, names, chat, main }) => {
          eval(HELPERS);
          const booted = { setup: !!intakeMode, programme: hasCustomRoutine() };
          const res = {};
          for (const name of names) {
            const s = states[name], rev = s.rev || 7;
            __state(s);
            const m = __home(rev);
            // setup draws the chat over the hub: the hub is read where the page would draw it, from the model
            const chatUp = !!document.querySelector('#screen .coach-chat-body');
            let d;
            if (chatUp) { const box = document.createElement('div'); box.innerHTML = _coachHomeHTML(m); d = __read(box); } else d = __read();
            res[name] = { m, json: _nativeJSON(m), d, chatUp, msgs: coachMessages.length, programme: hasCustomRoutine(), pure: m.rev === rev && m.boot === _fpBoot && m.v === 1 };
          }
          if (!main) return { booted, res, impure: __impure, flag: !!_fpShellFlag() };
          // resume: the page pushes the chat on the next Coach selection exactly when its own rule would
          const resume = {};
          const at = (name, o) => { __state(o); const m = __home(0); resume[name] = { resume: m.resume, route: m.route }; };
          at('key, setup', { intake: true });
          at('key, a reply in flight, the chat view', { msgs: chat, loading: true, view: 'chat' });
          at('key, a reply in flight, the hub', { msgs: chat, loading: true, view: 'home' });
          at('no key, setup', { key: null, intake: true });
          at('key, the chat view, nothing in flight', { msgs: chat, view: 'chat' });
          // even where getWkData() would clamp: currentWeek past the programme's end is read, not written (__home
          // notes a write)
          __state({});
          const was = currentWeek; currentWeek = 99;
          const past = __home(0).meta.label, after = currentWeek;
          currentWeek = was;
          __state({});
          return { booted, res, resume, past, after, total: getTotalWeeks(), impure: __impure, flag: !!_fpShellFlag() };
        }, { HELPERS, states: STATES, names: g.names, chat: CHAT, main: !g.keys });
        assert(out.flag === (shell !== 'none'), S + 'the boot runs under its shell (a flag only under tabsWeb)');
        assert(out.impure.length === 0, S + 'the builder has no side effects: ' + out.impure.join(' | '));
        if (g.keys && g.keys.kt_intake) assert(out.booted.setup && !out.booted.programme, S + g.names.join(', ') + ': the page booted in setup ' + J(out.booted));
        Object.assign(res, out.res);
        if (out.resume) more = out;
      } finally { await app.close(); }
    }
    for (const name of Object.keys(res)) {
      const { m, json, d, chatUp, msgs, programme, pure } = res[name];
      drawn[shell][name] = d;
      sameAsScreen(S + name, m, d);
      assert(pure, S + name + ': rev is the caller\'s and boot the document\'s');
      assert(chatUp === (name === 'coachHome/hub-resume'), S + name + ': ' + (chatUp ? 'the chat' : 'the hub or the connect screen') + ' on screen');
      // a fixture's state: its model is the fixture (built here with no shell or under the native bar, the dump under
      // the tabs shell), boot aside
      if (SCENARIOS[name]) {
        const file = JSON.parse(fs.readFileSync(path.join(FIXTURES, name + '.json'), 'utf8'));
        const built = Object.assign(JSON.parse(json), { boot: file.boot });
        assert(J(built) === J(file), S + name + ': the model is the fixture\'s ' + J(built).slice(0, 300) + ' vs ' + J(file).slice(0, 300));
      }
      // rows exactly when the web shows them
      const rows = m.groups.flatMap((g) => g.rows.map((r) => r.do));
      if (m.route === 'hub') {
        assert(J(m.groups.map((g) => g.head)) === J(['Conversation'].concat(programme ? [] : ['Programme'], ['Account'])), S + name + ': the groups ' + J(m.groups.map((g) => g.head)));
        assert(J(rows) === J(['openChat'].concat(programme ? [] : ['startIntake'], msgs ? ['clearChat'] : [], ['disconnect'])), S + name + ': the rows ' + J(rows));
        assert(m.groups.every((g) => g.rows.every((r) => (r.do === 'openChat' || r.do === 'startIntake') === (typeof r.sub === 'string'))), S + name + ': only Open Chat and Build My Programme have a sub');
      } else {
        assert(J(m.groups) === '[]' && (m.connect.starter === null) === programme, S + name + ': the starter link only without a programme ' + J(m.connect.starter));
      }
      assert(m.resume === (name === 'coachHome/hub-resume'), S + name + ': resume ' + m.resume + ' (true only in setup with a key)');
    }
    const sub = (name) => res[name].m.groups[0].rows[0].sub;
    assert(sub('coachHome/hub-replying') === 'Coach is replying…', S + 'a reply in flight: ' + sub('coachHome/hub-replying'));
    assert(sub('coachHome/hub-empty') === 'No messages yet — tap to start' && sub('hub-programme-empty') === sub('coachHome/hub-empty'), S + 'no messages: ' + sub('coachHome/hub-empty'));
    assert(sub('coachHome/hub-history') === '2 exchanges · Great work this week: every session done and the squat is moving💪…' && !LONE.test(res['coachHome/hub-history'].d.html),
      S + 'the 65th character an emoji, cut whole, %% lines dropped: ' + J(sub('coachHome/hub-history')));
    assert(sub('hub-long-preview') === '2 exchanges · ' + LONG.slice(0, 65) + '…', S + 'ASCII over 65 characters, cut where the 65-unit slice cut it: ' + sub('hub-long-preview'));
    assert(sub('hub-one-exchange') === '1 exchange · Solid week. Four sessions and two runs, all done.', S + 'one exchange, %% lines dropped: ' + sub('hub-one-exchange'));
    assert(sub('hub-odd') === '2 exchanges · And the runs?' && res['hub-odd'].m.hero.body === '2 exchanges so far. Pick up where you left off, or start a new thread.', S + 'three messages are two exchanges: ' + sub('hub-odd'));
    assert(sub('hub-image') === '1 exchange · [Image]', S + 'a photo alone: ' + sub('hub-image'));
    const conn = res['coachHome/connect-heavyweight'], lime = res['coachHome/connect-lime'];
    assert(res['connect-intake'].m.route === 'connect' && J(res['connect-intake'].d) === J(conn.d), S + 'no key during setup: the connect screen wins');
    assert(lime.m.room === 'dark' && lime.m.dynTypeOn === false && conn.m.room === 'heavyweight' && conn.m.dynTypeOn === true && J(lime.d) === J(conn.d),
      S + 'the connect screen is one markup in both rooms (the room is CSS): ' + J([lime.m.room, lime.m.dynTypeOn]));
    for (const name of ['connect-noname', 'hub-noname']) {
      assert(res[name].m.hero.greet === 'Welcome.' && res[name].m.meta.avatar === '?', S + name + ': no name, Welcome. and ? ' + J([res[name].m.hero.greet, res[name].m.meta.avatar]));
    }
    const want = { 'key, setup': true, 'key, a reply in flight, the chat view': true, 'key, a reply in flight, the hub': false, 'no key, setup': false, 'key, the chat view, nothing in flight': false };
    for (const k of Object.keys(want)) assert(more.resume[k].resume === want[k], S + 'resume ' + k + ': ' + J(more.resume[k]));
    assert(more.resume['no key, setup'].route === 'connect' && more.resume['key, setup'].route === 'hub', S + 'routes: ' + J(more.resume));
    assert(more.past === 'COACH · WK ' + more.total + ' / ' + more.total + ' · DELOAD' && more.after === 99, S + 'a week past the end reads as the last, unwritten: ' + J([more.past, more.after]));
  }
  // one screen whichever host draws the bar: the web hub and connect screen do not depend on the shell
  for (const name of Object.keys(drawn.none)) {
    assert(J(drawn.none[name]) === J(drawn.tabsWeb[name]), name + ': the same screen with no shell and under the native bar ' + J([drawn.none[name].html.slice(0, 200), drawn.tabsWeb[name].html.slice(0, 200)]));
  }
  // every page-built fixture: resume a boolean, true only in hub-resume; and each is a state drawn above
  const built = fs.readdirSync(path.join(FIXTURES, 'coachHome')).filter((f) => HAND_MADE.indexOf(f) < 0);
  assert(built.length === 8, 'eight page-built coachHome fixtures: ' + J(built));
  for (const f of built) {
    const m = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'coachHome', f), 'utf8'));
    assert(typeof m.resume === 'boolean' && m.resume === (f === 'hub-resume.json'), f + ': resume ' + J(m.resume));
    assert(m.route === (/^connect-/.test(f) ? 'connect' : 'hub'), f + ': route ' + m.route);
    assert(drawn.none['coachHome/' + f.slice(0, -5)], f + ': its state is one the case draws (SCENARIOS)');
  }
});

serial('tokens.type is the chat\'s plus the home* table, in a copy; whole-character previews; escaping; never the key', async () => {
  const app = await boot({ native: true, shell: 'tabsWeb', page: { timezoneId: 'UTC' }, seed: { kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate((HELPERS) => {
      eval(HELPERS);
      const r = {};
      // sizes per room, the chat's sizes untouched, _COACH_TOKENS and CoachModel without a home* key
      r.rooms = {};
      for (const room of ['heavyweight', 'dark']) {
        currentTheme = room;
        const m = __home(0), c = _coachModel();
        r.rooms[room] = { type: m.tokens.type, room: m.room, paper: m.paper, coachType: Object.keys(c.tokens.type), chat: _COACH_TOKENS.type, color: m.tokens.color, coachColor: c.tokens.color };
      }
      currentTheme = 'heavyweight';
      r.chatKeys = Object.keys(_COACH_TOKENS.type);
      r.dyn = (() => { localStorage.setItem('kt_dyn_type', '0'); const a = __home(0).dynTypeOn; localStorage.removeItem('kt_dyn_type'); return [a, __home(0).dynTypeOn]; })();
      // the connect screen's help
      __state({ key: null });
      r.help = __home(0).connect.help;
      // a 65th character that is an emoji; an ASCII text over 65 characters
      const before = 'Great work this week: every session done and the squat is moving';
      __state({ msgs: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: before + '💪 and the runs are easy.' }] });
      const em = __home(0);
      r.emoji = { before: before.length, sub: em.groups[0].rows[0].sub, json: _nativeJSON(em), text: __read().groups[0].rows[0].sub, html: _coachHomeHTML(em), screen: document.getElementById('screen').innerHTML };
      const ascii = 'Your bench has moved from 150 to 170 lb in six weeks: that is steady progress. Keep the runs easy.';
      __state({ msgs: [{ role: 'assistant', content: ascii }] });
      r.ascii = { sub: __home(0).groups[0].rows[0].sub, want: '1 exchange · ' + ascii.slice(0, 65) + '…' };
      // a name and a block name with a quote, & and markup (the first word is the name: the markup is joined to it)
      const block = __routineWithBlock('Strength & <b>Power</b>');
      r.esc = {};
      for (const [k, o] of [['hub', {}], ['connect', { key: null }]]) {
        __state(Object.assign({ name: 'O\'Brien<b>x</b> Smith', routine: block, msgs: [{ role: 'assistant', content: 'Bench & <i>squat</i>, "done"' }] }, o));
        const m = __home(0);
        r.esc[k] = { m, d: __read(), html: _coachHomeHTML(m) };
      }
      // the key: saved (hub), and typed but not saved (connect)
      __state({ key: 'sk-ant-api03-SECRETVALUE-126' });
      r.saved = _nativeJSON(__home(0));
      __state({ key: null });
      const box = document.getElementById('coach-key-input'); box.value = 'sk-ant-typed-SECRET-126';
      r.typed = _nativeJSON(__home(0));
      box.value = '';
      __state({});
      r.impure = __impure;
      return r;
    }, HELPERS);
    assert(out.impure.length === 0, 'the builder has no side effects: ' + out.impure.join(' | '));
    // sizes: the table per room, the chat's sizes kept, a copy
    const hw = out.rooms.heavyweight, lime = out.rooms.dark;
    for (const [room, i] of [['heavyweight', 0], ['dark', 1]]) {
      const t = out.rooms[room].type, homeKeys = Object.keys(t).filter((k) => /^home/.test(k));
      assert(J(homeKeys) === J(Object.keys(HOME)), room + ': the 16 home* keys in the contract\'s order ' + J(homeKeys));
      for (const k of Object.keys(HOME)) assert(t[k] === HOME[k][i], room + ': ' + k + ' ' + t[k] + ' (contract 6.2: ' + HOME[k][i] + ')');
      for (const k of out.chatKeys) assert(t[k] === out.rooms[room].chat[k], room + ': the chat\'s ' + k + ' unchanged');
      assert(Object.keys(t).length === out.chatKeys.length + 16, room + ': the chat\'s sizes and the hub\'s, nothing else');
      assert(!out.rooms[room].coachType.some((k) => /^home/.test(k)), room + ': CoachModel holds no home* size');
      assert(J(out.rooms[room].color) === J(out.rooms[room].coachColor), room + ': the palette is the chat\'s');
    }
    assert(hw.room === 'heavyweight' && hw.paper === true && lime.room === 'dark' && lime.paper === false, 'room and paper: ' + J([hw.room, hw.paper, lime.room, lime.paper]));
    assert(out.chatKeys.length === 26 && !out.chatKeys.some((k) => /^home/.test(k)), '_COACH_TOKENS.type is the chat\'s 26 sizes, after building both rooms: ' + J(out.chatKeys));
    assert(J(out.dyn) === J([false, true]), 'dynTypeOn follows kt_dyn_type: ' + J(out.dyn));
    for (const f of fs.readdirSync(path.join(FIXTURES, 'coach')).filter((x) => /\.json$/.test(x))) {
      const m = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'coach', f), 'utf8'));
      assert(!Object.keys((m.tokens && m.tokens.type) || {}).some((k) => /^home/.test(k)), 'Fixtures/coach/' + f + ' holds no home* size');
    }
    assert(out.help.split('\n').length === 2 && out.help.split('\n').every((x) => x.trim().length > 20), 'connect.help: two paragraphs, one \\n: ' + J(out.help));
    // the preview's emoji whole, nowhere a lone surrogate
    const e = out.emoji;
    assert(e.before === 64 && e.sub === '1 exchange · Great work this week: every session done and the squat is moving💪…', 'the emoji is the 65th character, kept whole: ' + J(e.sub));
    assert(e.text === e.sub && !LONE.test(e.sub) && !LONE.test(e.json) && !LONE.test(e.html) && !LONE.test(e.screen), 'no lone surrogate in the model, its JSON, the HTML or the screen');
    assert(e.html.indexOf('moving💪…</div>') > 0, 'the HTML has the whole emoji');
    assert(out.ascii.sub === out.ascii.want, 'ASCII is cut where the 65-unit slice cut it: ' + J(out.ascii));
    // escaping: the web text is the model's (raw), no markup element, & and < written as entities, a quote as itself
    for (const k of ['hub', 'connect']) {
      const { m, d, html } = out.esc[k];
      sameAsScreen('escape ' + k, m, d);
      assert(m.hero.greet === 'Hi O\'Brien<b>x</b>.' && m.meta.avatar === 'O', k + ': the raw name ' + J([m.hero.greet, m.meta.avatar]));
      assert(/ · STRENGTH & <B>POWER<\/B>$/.test(m.meta.label), k + ': the raw block name ' + J(m.meta.label));
      assert(!d.bold, k + ': no <b> or <i> element on screen');
      assert(html.indexOf('Hi O\'Brien&lt;b&gt;x&lt;/b&gt;.') > 0 && html.indexOf('STRENGTH &amp; &lt;B&gt;POWER&lt;/B&gt;') > 0, k + ': text escaped for text (P-D4) ' + html.slice(0, 300));
      if (k === 'hub') assert(m.groups[0].rows[0].sub === '1 exchange · Bench & <i>squat</i>, "done"' && html.indexOf('Bench &amp; &lt;i&gt;squat&lt;/i&gt;, "done"') > 0, 'the preview is text: ' + m.groups[0].rows[0].sub);
    }
    // the key, its masked form and an unsaved typed key never reach the model ('sk-ant-...' is the field's placeholder)
    assert(out.saved.indexOf('SECRETVALUE') < 0 && out.saved.indexOf('sk-ant-') < 0 && out.saved.indexOf('•') < 0, 'a saved key never reaches the model');
    assert(out.typed.indexOf('SECRET') < 0 && out.typed.indexOf('•') < 0 && out.typed.split('sk-ant-').length === 2 && out.typed.indexOf('"placeholder":"sk-ant-..."') > 0, 'a typed key never reaches the model; sk-ant- only in the placeholder');
  } finally { await app.close(); }
});

serial('the tabs model: the web bar\'s colours and labels per room; its room follows currentTheme and a dev.theme room', async () => {
  let app = await boot({ shell: 'none', page: { timezoneId: 'UTC' } });
  try {
    const out = await app.page.evaluate((HELPERS) => {
      eval(HELPERS);
      document.querySelectorAll('#tabs .tab').forEach((t) => { t.style.transition = 'none'; });
      const res = {};
      for (const room of ['dark', 'heavyweight']) {
        applyTheme(room);
        const m = __tabs(9);
        const tabs = [...document.querySelectorAll('#tabs .tab')];
        const active = tabs.find((t) => t.classList.contains('active')), idle = tabs.find((t) => !t.classList.contains('active'));
        res[room] = { m, pure: m.rev === 9 && m.boot === _fpBoot && m.v === 1,
          muted: getComputedStyle(document.documentElement).getPropertyValue('--muted').trim(),
          activeColor: getComputedStyle(active).color, idleColor: getComputedStyle(idle).color,
          tabs: tabs.map((t) => ({ id: t.getAttribute('data-tab'), title: t.textContent.trim(), a11y: t.getAttribute('aria-label') })) };
      }
      currentTheme = 'retired-room';
      res.unknown = __tabs(0).room;
      currentTheme = 'heavyweight';
      res.impure = __impure;
      return res;
    }, HELPERS);
    const rgb = (hex) => 'rgb(' + [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ') + ')';
    assert(out.impure.length === 0, 'the builder has no side effects: ' + out.impure.join(' | '));
    for (const [room, tint, idle] of [['heavyweight', '#0a43f5', '#6b6b66'], ['dark', '#f4f4f1', '#8c8c91']]) {
      const r = out[room];
      assert(r.pure, room + ': rev is the caller\'s and boot the document\'s');
      assert(r.m.room === room && r.m.paper === (room === 'heavyweight') && r.m.tint === tint && r.m.idle === idle, room + ': ' + J(r.m));
      assert(r.m.idle === r.muted, room + ': idle is the room\'s --muted ' + J([r.m.idle, r.muted]));
      assert(r.activeColor === rgb(r.m.tint) && r.idleColor === rgb(r.m.idle), room + ': tint and idle are the web bar\'s selected and idle colours ' + J([r.activeColor, r.idleColor]));
      assert(J(r.m.items) === J(r.tabs) && J(r.m.items.map((i) => i.id)) === J(['log', 'progress', 'coach', 'settings']), room + ': items are #tabs\' ids, titles and labels ' + J([r.m.items, r.tabs]));
    }
    assert(out.unknown === 'heavyweight', 'an unknown room reads as Heavyweight: ' + out.unknown);
  } finally { await app.close(); }
  // the test tools' room for a launch (dev.theme in the shell's flag): the models follow it, and it is never saved
  app = await boot({ native: true, shell: Object.assign({}, SHELLS.tabs, { dev: { theme: 'dark' } }), page: { timezoneId: 'UTC' } });
  try {
    const d = await app.page.evaluate((HELPERS) => {
      eval(HELPERS);
      return { room: currentTheme, tabs: __tabs(0), home: __home(0).room, saved: localStorage.getItem('kt_theme'), impure: __impure };
    }, HELPERS);
    assert(d.room === 'dark' && d.tabs.room === 'dark' && d.tabs.tint === '#f4f4f1' && d.tabs.idle === '#8c8c91' && d.home === 'dark' && d.saved === null, 'dev.theme: ' + J(d));
    assert(d.impure.length === 0, 'dev.theme: the builders have no side effects: ' + d.impure.join(' | '));
  } finally { await app.close(); }
});

// A document that starts on the Coach tab (the flag's selected tab, as a reload under the native bar does) paints the
// hub or the connect screen before the script has defined _COACH_TOKENS: the web screen is drawn from
// _coachHomeScreen(), never the whole model, whose tokens would throw there (and under a 61 flag close() fails on any
// page error).
serial('the boot\'s first paint on the Coach tab draws the hub or the connect screen', async () => {
  const flag = Object.assign({}, SHELLS.tabsWeb, { tabs: Object.assign({}, SHELLS.tabsWeb.tabs, { selected: 'coach' }) });
  for (const key of ['sk-ant-api03-SPEC126-KEY', null]) {
    const app = await boot({ native: true, shell: flag, seed: key ? { kt_apikey: key } : {}, page: { timezoneId: 'UTC' } });
    try {
      const d = await app.page.evaluate(() => ({ tab: currentTab, route: _lastRenderedRoute,
        head: (document.querySelector('#screen .kt-hero-headline') || {}).textContent, model: _coachHomeModel(0).route }));
      assert(d.tab === 'coach' && d.route === 'coach/home' && d.head === (key ? 'Coachready.' : 'Connectyour coach.') && d.model === (key ? 'hub' : 'connect'),
        'the first paint on Coach (' + (key ? 'a key' : 'no key') + '): ' + J(d) + ' ' + app.errors.join(' | '));
      assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
    } finally { await app.close(); }
  }
});

serial('golden: the page-built coachHome and tabs fixtures are what the page builds, and the chat under tabs is Fixtures/coach', async () => {
  const bad = await require('../golden/dump-coach-home').drift();
  assert(bad.length === 0, 'the page builds different models for ' + bad.join(', ') + ': run node tests/golden/dump-coach-home.js, then swift test');
});
