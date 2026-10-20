#!/usr/bin/env node
// dump-coach-home.js: the page's own Coach home and tab bar models, written as FPCore's golden fixtures (build 61,
// plan task P6, contract 6.4).
//
//   node tests/golden/dump-coach-home.js          write the page-built files of ios/App/FPKit/Tests/FPCoreTests/
//                                                 Fixtures/coachHome and Fixtures/tabs
//   node tests/golden/dump-coach-home.js --check  exit 1 when a fixture differs from what the page builds now, or
//                                                 when the chat's models built under the tabs shell differ from
//                                                 Fixtures/coach
//
// Each fixture is _coachHomeModel(rev) (CoachHomeModel v1, contract 6.2) or _tabsModel(rev) (TabsModel v1, 6.1) as the
// page hands it to the shell (_nativeJSON), built in Chromium under build 61's tabs shell, on the test seed, in UTC, on
// coach-cases.js's clock, with ids, boot and revs fixed as tests/golden/dump-coach.js fixes them, so the files only
// change when the page's models do. The coachHome files: the connect screen in both rooms (Lime with Larger Text off)
// and with no programme (the starter link); the hub empty, with a conversation whose newest reply's 65th character is
// an emoji (cut whole, its %% lines dropped), with a reply in flight, without a programme, and with setup persisted
// (kt_intake seeded with no programme, so the page boots in setup: the one model with resume true). The tabs files:
// both rooms. FPCoreTests decodes every one (CoachHomeModelTests, TabsModelTests; tests/golden/check.sh).
// forward-compat.json, lone-surrogates.json and minimal.json are not the page's: ios/App/FPKit/Tools/
// coach-home-fixtures.js and tabs-fixtures.js write those by hand. Nothing here writes under Fixtures/coach: the
// --check reads it, comparing tests/golden/dump-coach.js's chat states built under the tabs shell (one CoachModel
// whichever host draws it, contract 6.3).
//
// Exports SCENARIOS, each fixture's state as data, and applyScenario, which sets one in a booted page: the dump builds
// every fixture through them, spec 126 holds each coachHome state's model to the web screen drawn from it, and N14's
// web shots (ios/App/FPKit/Tools/chat-contact/web-shots.js) replay them (all but hub-resume), so the three read one
// definition.
'use strict';
const fs = require('fs');
const path = require('path');
const { boot } = require('../lib/harness');
const { CLOCK_INIT } = require('./coach-cases');
const coach = require('./dump-coach');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES = path.join(ROOT, 'ios', 'App', 'FPKit', 'Tests', 'FPCoreTests', 'Fixtures');
const check = process.argv.includes('--check');

// The conversation of hub-history: the newest reply's 65th character is an emoji, after a %% line the preview drops.
const BEFORE = 'Great work this week: every session done and the squat is moving';
if (BEFORE.length !== 64) throw new Error('hub-history: the emoji must be the 65th character');
const HISTORY = [
  { role: 'user', content: 'How was my week?', at: [-1, '18:00'] },
  { role: 'assistant', content: 'Four sessions logged.', at: [-1, '18:01'] },
  { role: 'user', content: 'And the runs?', at: [0, '07:30'] },
  { role: 'assistant', content: '%%type: Week review\n' + BEFORE + '💪 and the runs are easy.\n%%takeaway: Keep the deload in week 8.', at: [0, '07:31'] },
];

// Each page-built fixture's state, by <folder>/<name> under FIXTURES, as plain data (applyScenario sets it):
//   model, rev  what the dump builds: _coachHomeModel(rev) or _tabsModel(rev)
//   key         kt_apikey: 'sk-ant-golden' unless given; null: no key
//   name        kt_user_name: 'Kalani' unless given; null: none (the programme's name gives the first name, if any)
//   routine     kt_routine: the seed's programme unless given; null: none; an object: the seed's with those fields
//   room        currentTheme: 'heavyweight' unless given ('dark' is Lime); dynOff: kt_dyn_type '0' (Larger Text off)
//   intake, loading, view   intakeMode, coachLoading (false unless given) and coachView ('home' unless given)
//   msgs        coachMessages; each at is [days from today, 'hh:mm'] on the page's clock, or a time in ms
//   boot        keys the document must boot with on top of the dump's seed (hub-resume: kt_intake with no programme,
//               so intakeMode is set at boot, index.html's boot read of kt_intake)
// The Coach tab's hub shows each coachHome state but hub-resume, whose page draws the setup chat over the hub.
const SCENARIOS = {
  'coachHome/connect-heavyweight': { model: 'coachHome', rev: 11, key: null },
  'coachHome/connect-lime': { model: 'coachHome', rev: 12, key: null, room: 'dark', dynOff: true },
  'coachHome/connect-starter': { model: 'coachHome', rev: 13, key: null, name: null, routine: null },
  'coachHome/hub-empty': { model: 'coachHome', rev: 14 },
  'coachHome/hub-history': { model: 'coachHome', rev: 15, msgs: HISTORY },
  // a reply in flight with the hub showing (the owner went Back): the chat is not pushed on the next tap
  'coachHome/hub-replying': { model: 'coachHome', rev: 16, msgs: HISTORY.slice(0, 3), loading: true },
  // no programme (Build My Programme) and a conversation (Clear Chat History): every row the hub has
  'coachHome/hub-programme': { model: 'coachHome', rev: 17, routine: null, msgs: HISTORY.slice(0, 2) },
  // setup persisted across a relaunch: the page booted in setup and the hub sits under the setup chat (resume)
  'coachHome/hub-resume': { model: 'coachHome', rev: 18, boot: { kt_intake: '1', kt_routine: '' }, intake: true, routine: null, msgs: [
    { role: 'user', content: 'I want to generate my training programme.', _seed: 'Programme setup', at: [0, '09:00'] },
    { role: 'assistant', content: 'How many days a week can you train, and for how long each time?', at: [0, '09:00'] },
  ] },
  'tabs/heavyweight': { model: 'tabs', rev: 3 },
  'tabs/lime': { model: 'tabs', rev: 4, room: 'dark' },
};
const NAMES = Object.keys(SCENARIOS);

// Sets one scenario's state in a booted page. It runs in the page (Playwright sends it as text: it reads nothing of
// this module) and draws nothing: to see the state, show the Coach tab (if (currentTab !== 'coach') switchTab('coach');
// else render(); switchTab leaves the view the scenario set, since it moves to the hub only outside setup and a reply
// in flight). The keys go through the page's own writers (kt_apikey, kt_user_name and kt_dyn_type raw, as the page
// writes them; kt_routine through lsSet/lsDel), so STORE=shadow's drift check stays clean. The seed's programme is read
// once per document, at the first call, and every scenario that keeps a programme starts from it.
function applyScenario(s) {
  const raw = (k, v) => { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); };
  const at = (a) => (Array.isArray(a) ? new Date(addDays(todayISO(), a[0]) + 'T' + a[1] + ':00').getTime() : a);
  if (!('__scenarioRoutine' in window)) window.__scenarioRoutine = lsGet('kt_routine');
  const seed = window.__scenarioRoutine;
  raw('kt_apikey', s.key === undefined ? 'sk-ant-golden' : s.key);
  raw('kt_user_name', s.name === undefined ? 'Kalani' : s.name);
  if (s.routine === null) lsDel('kt_routine');
  else if (seed) lsSet('kt_routine', s.routine ? Object.assign({}, seed, s.routine) : seed);
  try { if (s.dynOff) localStorage.setItem('kt_dyn_type', '0'); else localStorage.removeItem('kt_dyn_type'); } catch (e) {}
  currentTheme = s.room || 'heavyweight';
  coachMessages = (s.msgs || []).map((m) => {
    const c = JSON.parse(JSON.stringify(m));
    if (m.at !== undefined) c.at = at(m.at);
    return c;
  });
  _coachMids(coachMessages);
  coachLoading = !!s.loading; _runningTools = []; pendingImage = null; coachView = s.view || 'home'; intakeMode = !!s.intake;
}

// Runs in the page: each named scenario set (applyScenario's text) and its model built, as _nativeJSON text, with ids,
// boot and revs fixed. A scenario that boots in setup must find the page in setup before it is set.
async function build(arg) {
  const apply = eval('(' + arg.apply + ')');
  const out = {};
  for (const name of arg.names) {
    const s = arg.scenarios[name];
    if (s.boot && s.boot.kt_intake && (!intakeMode || hasCustomRoutine())) throw new Error(name + ': the page did not boot in setup');
    apply(s);
    _midSeq = 0; _midTag = 'g'; _fpBoot = 'b1791561600000-c3';
    out[name] = _nativeJSON(s.model === 'tabs' ? _tabsModel(s.rev) : _coachHomeModel(s.rev));
  }
  return out;
}

// The page's models now, as the text each fixture file holds: {'<folder>/<name>': text}. One boot for the scenarios
// on the dump's seed, and one for each set of boot keys a scenario names.
async function pageModels() {
  const base = { native: true, shell: 'tabs', page: { timezoneId: 'UTC' }, init: CLOCK_INIT };
  const groups = [];
  for (const name of NAMES) {
    const keys = SCENARIOS[name].boot || null, id = JSON.stringify(keys);
    let g = groups.find((x) => x.id === id);
    if (!g) groups.push(g = { id, keys, names: [] });
    g.names.push(name);
  }
  const out = {};
  for (const g of groups) {
    const seed = Object.assign({ kt_apikey: 'sk-ant-golden', kt_coach_msgs: '[]' }, g.keys || {});
    const app = await boot(Object.assign({ seed }, base));
    try {
      Object.assign(out, await app.page.evaluate(build, { names: g.names, scenarios: SCENARIOS, apply: applyScenario.toString() }));
      if (app.errors.length) throw new Error('page errors: ' + app.errors.join(' | '));
    } finally { await app.close(); }
  }
  const files = {};
  for (const name of NAMES) {
    if (!(name in out)) throw new Error('the page built no ' + name);
    files[name] = JSON.stringify(JSON.parse(out[name]), null, 1) + '\n';
  }
  return files;
}
// What differs from what the page builds now: each page-built coachHome or tabs fixture by <folder>/<name>, and each
// chat state of tests/golden/dump-coach.js built under the tabs shell that is not its Fixtures/coach file, as
// 'coach/<name> (tabs)' (spec 126 and --check).
async function drift() {
  const bad = [];
  const models = await pageModels();
  for (const name of Object.keys(models)) {
    const file = path.join(FIXTURES, name + '.json');
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== models[name]) bad.push(name);
  }
  const chats = await coach.pageModels('tabs');
  for (const name of Object.keys(chats)) {
    const file = path.join(coach.OUT, name + '.json');
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== chats[name]) bad.push('coach/' + name + ' (tabs)');
  }
  return bad;
}
module.exports = { pageModels, drift, NAMES, FIXTURES, SCENARIOS, applyScenario };

if (require.main === module) {
  (async () => {
    if (check) {
      const bad = await drift();
      if (bad.length) { console.error('FAIL: the page builds different models for ' + bad.join(', ') + ' (node tests/golden/dump-coach-home.js writes the coachHome and tabs files; Fixtures/coach is dump-coach.js\'s)'); process.exit(1); }
      console.log('ok: the page-built coach home and tab bar models match their fixtures, and the chat built under the tabs shell matches Fixtures/coach');
      return;
    }
    const models = await pageModels();
    for (const name of Object.keys(models)) fs.writeFileSync(path.join(FIXTURES, name + '.json'), models[name]);
    console.log('wrote ' + Object.keys(models).length + ' page-built models (' + path.relative(ROOT, FIXTURES) + '/{coachHome,tabs})');
  })().catch((e) => { console.error('FAIL: ' + (e && e.stack || e)); process.exit(1); });
}
