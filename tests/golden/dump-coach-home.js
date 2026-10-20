#!/usr/bin/env node
// dump-coach-home.js: the page's own Coach home and tab bar models, written as FPCore's golden fixtures (build 61,
// plan task P6, contract 6.4).
//
//   node tests/golden/dump-coach-home.js            write ios/App/FPKit/Tests/FPCoreTests/Fixtures/{coachHome,tabs}/<name>.json
//   node tests/golden/dump-coach-home.js --check    exit 1 when a fixture differs from what the page builds now, or when
//                                                   the chat's models built under the tabs shell differ from Fixtures/coach
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
// coach-home-fixtures.js and tabs-fixtures.js write those by hand. Nothing here writes under Fixtures/coach: the --check
// reads it, comparing tests/golden/dump-coach.js's chat states built under the tabs shell (one CoachModel whichever
// host draws it, contract 6.3).
'use strict';
const fs = require('fs');
const path = require('path');
const { boot } = require('../lib/harness');
const { CLOCK_INIT } = require('./coach-cases');
const coach = require('./dump-coach');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES = path.join(ROOT, 'ios', 'App', 'FPKit', 'Tests', 'FPCoreTests', 'Fixtures');
const check = process.argv.includes('--check');
// The page-built files, as <folder>/<name> under FIXTURES.
const NAMES = ['coachHome/connect-heavyweight', 'coachHome/connect-lime', 'coachHome/connect-starter', 'coachHome/hub-empty',
  'coachHome/hub-history', 'coachHome/hub-replying', 'coachHome/hub-programme', 'coachHome/hub-resume', 'tabs/heavyweight', 'tabs/lime'];

// Runs in the page: every scenario's model, as _nativeJSON text, keyed by <folder>/<name>. resume: only the boot that
// starts in setup builds hub-resume (and nothing else).
async function build(resume) {
  const day = (n, hh) => new Date(addDays(todayISO(), n) + 'T' + hh + ':00').getTime();
  const raw = (k, v) => { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); };
  const routine = lsGet('kt_routine');   // the seed's programme: twelve weeks, week 6's block BUILD
  const fix = () => { _midSeq = 0; _midTag = 'g'; _fpBoot = 'b1791561600000-c3'; };
  // a scenario's state: a key and the name Kalani unless it says otherwise, the seed's programme, Heavyweight, the hub view
  const set = (o) => {
    raw('kt_apikey', o.key === undefined ? 'sk-ant-golden' : o.key);
    raw('kt_user_name', o.name === undefined ? 'Kalani' : o.name);
    if (o.routine === null) lsDel('kt_routine'); else if (routine) lsSet('kt_routine', routine);
    try { if (o.dynOff) localStorage.setItem('kt_dyn_type', '0'); else localStorage.removeItem('kt_dyn_type'); } catch (e) {}
    currentTheme = o.room || 'heavyweight';
    coachMessages = (o.msgs || []).map((m) => JSON.parse(JSON.stringify(m)));
    _coachMids(coachMessages);
    coachLoading = !!o.loading; _runningTools = []; pendingImage = null; coachView = o.view || 'home';
    if (o.intake !== undefined) intakeMode = o.intake;
    fix();
  };
  const json = (m) => _nativeJSON(m);
  const out = {};
  if (resume) {
    // setup persisted across a relaunch: the page booted in setup (kt_intake, no programme) and shows the hub
    if (!intakeMode || hasCustomRoutine()) throw new Error('hub-resume: the page did not boot in setup');
    set({ routine: null, msgs: [
      { role: 'user', content: 'I want to generate my training programme.', _seed: 'Programme setup', at: day(0, '09:00') },
      { role: 'assistant', content: 'How many days a week can you train, and for how long each time?', at: day(0, '09:00') },
    ] });
    out['coachHome/hub-resume'] = json(_coachHomeModel(18));
    return out;
  }
  // the newest reply's 65th character is an emoji, after a %% line the preview drops
  const before = 'Great work this week: every session done and the squat is moving';
  if (before.length !== 64) throw new Error('hub-history: the emoji must be the 65th character');
  const chat = () => [
    { role: 'user', content: 'How was my week?', at: day(-1, '18:00') },
    { role: 'assistant', content: 'Four sessions logged.', at: day(-1, '18:01') },
    { role: 'user', content: 'And the runs?', at: day(0, '07:30') },
    { role: 'assistant', content: '%%type: Week review\n' + before + '💪 and the runs are easy.\n%%takeaway: Keep the deload in week 8.', at: day(0, '07:31') },
  ];
  set({ key: null, intake: false });
  out['coachHome/connect-heavyweight'] = json(_coachHomeModel(11));
  set({ key: null, intake: false, room: 'dark', dynOff: true });
  out['coachHome/connect-lime'] = json(_coachHomeModel(12));
  set({ key: null, intake: false, name: null, routine: null });
  out['coachHome/connect-starter'] = json(_coachHomeModel(13));
  set({ intake: false });
  out['coachHome/hub-empty'] = json(_coachHomeModel(14));
  set({ intake: false, msgs: chat() });
  out['coachHome/hub-history'] = json(_coachHomeModel(15));
  // a reply in flight with the hub showing (the owner went Back): the chat is not pushed on the next tap
  set({ intake: false, msgs: chat().slice(0, 3), loading: true });
  out['coachHome/hub-replying'] = json(_coachHomeModel(16));
  // no programme (Build My Programme) and a conversation (Clear Chat History): every row the hub has
  set({ intake: false, routine: null, msgs: chat().slice(0, 2) });
  out['coachHome/hub-programme'] = json(_coachHomeModel(17));
  set({ intake: false });
  out['tabs/heavyweight'] = json(_tabsModel(3));
  set({ intake: false, room: 'dark' });
  out['tabs/lime'] = json(_tabsModel(4));
  return out;
}

// The page's models now, as the text each fixture file holds: {'<folder>/<name>': text}.
async function pageModels() {
  const base = { native: true, shell: 'tabs', page: { timezoneId: 'UTC' }, init: CLOCK_INIT };
  const out = {};
  for (const resume of [false, true]) {
    const seed = resume ? { kt_apikey: 'sk-ant-golden', kt_coach_msgs: '[]', kt_intake: '1', kt_routine: '' }
      : { kt_apikey: 'sk-ant-golden', kt_coach_msgs: '[]' };
    const app = await boot(Object.assign({ seed }, base));
    try {
      Object.assign(out, await app.page.evaluate(build, resume));
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
module.exports = { pageModels, drift, NAMES, FIXTURES };

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
