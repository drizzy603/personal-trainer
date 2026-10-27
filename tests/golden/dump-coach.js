#!/usr/bin/env node
// dump-coach.js: the page's own coach models, written as FPCore's golden fixtures (plan task C3).
//
//   node tests/golden/dump-coach.js            write ios/App/FPKit/Tests/FPCoreTests/Fixtures/coach/<name>.json
//   node tests/golden/dump-coach.js --check    exit 1 when a fixture differs from what the page builds now
//
// Each fixture is _coachModel() (contract v1) as the page hands it to the shell (_nativeJSON), built
// in Chromium on the test seed, in UTC, on coach-cases.js's clock, under build 60's shell flag: both
// rooms, setup, the empty chat, errors and stops (offline), a reply in flight, and 60 messages. Ids,
// boot and revs are fixed for the dump, so the files only change when the page's model does.
// FPCoreTests decodes every one (swift test, tests/golden/check.sh). forward-compat.json,
// lone-surrogates.json and minimal.json are not the page's: ios/App/FPKit/Tools/coach-fixtures.js
// writes those by hand.
'use strict';
const fs = require('fs');
const path = require('path');
const { boot } = require('../lib/harness');
const { CLOCK_INIT, TEXTS, asciiJSON } = require('./coach-cases');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'ios', 'App', 'FPKit', 'Tests', 'FPCoreTests', 'Fixtures', 'coach');
const check = process.argv.includes('--check');

// Runs in the page: every scenario's model, as _nativeJSON text.
async function build(json) {
  const T = Object.fromEntries(JSON.parse(json));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const day = (n, hh) => new Date(addDays(todayISO(), n) + 'T' + hh + ':00').getTime();
  const SWAP = { name: 'edit_programme_exercise', input: { day: 'Push', exercise: 'DB Lateral Raise', action: 'swap', rename_to: 'Cable Lateral Raise', weight: 20 }, result: { ok: true }, units: { w: 'lb', d: 'km' } };
  const BENCH = { name: 'set_exercise_weight', input: { name: 'Bench Press', weight: 170 }, result: { ok: true }, units: { w: 'lb', d: 'km' } };
  const SQUAT_GOAL = { name: 'set_squat_goal', input: { weight: 315 }, result: { ok: false, error: 'not saved' }, units: { w: 'lb', d: 'km' } };
  const BENCH_GOAL = { name: 'set_bench_goal', input: { weight: 200 }, result: { ok: true }, units: { w: 'lb', d: 'km' } };
  const WEEKS = { name: 'update_routine_weeks', input: { weeks: [{ wk: 7 }, { wk: 8 }] }, result: { ok: true, weeks: [7, 8] }, units: { w: 'lb', d: 'km' } };
  const CADENCE = { name: 'swap_cadence_days', input: { dayA: 'Fri', dayB: 'Sat', scope: 'week' }, result: { ok: true }, units: { w: 'lb', d: 'km' } };
  const PROFILE = { name: 'save_profile', input: { equipment: 'full gym' }, result: { ok: true }, units: { w: 'lb', d: 'km' } };
  const LOG = { name: 'log_bodyweight', input: { weight: 181 }, result: { ok: true }, units: { w: 'lb', d: 'km' } };
  const chat = () => [
    { role: 'user', content: 'How did my run look yesterday?', at: day(-1, '18:02') },
    { role: 'assistant', content: T['run-analysis'], at: day(-1, '18:03') },
    { role: 'user', content: 'These lifts have plateaued (no new estimated-1RM peak): Bench Press at ~200 lb for 28 days. Propose ONE concrete programme change.', _seed: 'Plateau check', at: day(0, '07:30') },
    { role: 'assistant', content: T.lists, at: day(0, '07:31') },
    { role: 'user', content: '[Image]', _hadImage: true, _auto: true, at: day(0, '07:40') },
    { role: 'assistant', content: 'That is a clean bar path. Keep the elbows tucked on the way down.', at: day(0, '07:41') },
    { role: 'user', content: 'Add 10 lb to my bench from this week', at: day(0, '07:45') },
    { role: 'assistant', content: T['programme-adjustment'], at: day(0, '07:46'), _tools: [BENCH, BENCH_GOAL, SQUAT_GOAL], _undo: 'coach:dump' },
    { role: 'user', content: 'Show my top sets', at: day(0, '07:50') },
    { role: 'assistant', content: T.table, at: day(0, '07:51') },
    { role: 'user', content: 'and my squat?', at: day(0, '07:55') },
  ];
  const setup = (o) => {
    coachMessages = []; coachLoading = false; _runningTools = []; intakeMode = false; pendingImage = null; coachView = 'chat'; currentTab = 'coach';
    coachModel = COACH_SONNET; currentTheme = o.room || 'heavyweight';
    try { if (o.dynOff) localStorage.setItem('kt_dyn_type', '0'); else localStorage.removeItem('kt_dyn_type'); } catch (e) {}
    lsSet('kt_routine_backup', getCustomRoutine()); _setBackupScope(o.undo === false ? 'routines' : 'coach:dump');
    _fp.speech = null; _fp.draft = null;
  };
  const model = (rev, msgs, extra) => {
    _midSeq = 0; _midTag = 'g'; _fpBoot = 'b1791561600000-c3';
    coachMessages = msgs.map((m) => { const c = JSON.parse(JSON.stringify(m)); delete c._mid; return c; });
    _coachMids(coachMessages);
    if (extra) extra();
    _fp.rev = rev - 1;
    return _nativeJSON(_coachModel());
  };
  const say = (m) => ({ id: 's1', text: _coachSpeech(m) });
  const out = {};
  // Heavyweight: a day of chat ending in a network error (Try again); PLAN CHANGES with its Undo
  setup({ room: 'heavyweight' });
  out['heavyweight-chat'] = model(42, chat().concat([{ role: 'assistant', content: 'Could not connect. Check your internet connection.', _error: true, _local: true, at: day(0, '07:56') }]),
    () => { _fp.speech = say(coachMessages[coachMessages.length - 1]); });
  // Lime: the same day; the undo point taken by a later edit (Got it), and the key refused (Open Settings)
  setup({ room: 'dark', undo: false });
  out['lime-chat'] = model(42, chat().concat([{ role: 'assistant', content: 'Anthropic did not accept your API key. Check it in Settings › AI Coach.', _error: true, _local: true, _errKind: 'key', at: day(0, '07:56') }]),
    () => { _fp.speech = say(coachMessages[coachMessages.length - 1]); });
  // Programme setup with its first answer in flight and two tools already run; Dynamic Type off
  setup({ room: 'heavyweight', dynOff: true });
  out.intake = model(3, [
    { role: 'user', content: 'I want to generate my training programme.', _seed: 'Programme setup', at: day(0, '09:00') },
    { role: 'assistant', content: 'How many days a week can you train, and for how long each time?', at: day(0, '09:00') },
    { role: 'user', content: '4 days, about an hour', at: day(0, '09:02') },
  ], () => { intakeMode = true; coachLoading = true; _runningTools = [WEEKS, PROFILE]; _fp.speech = { id: 's3', text: 'Coach is thinking' }; });
  // The empty chat in Lime: a programme with a previous one to restore, suggestions, a shared photo
  // and its comment waiting in the composer
  setup({ room: 'dark' });
  out.empty = model(1, [], () => {
    pendingImage = { data: 'R0lGODlhAQABAAAAACw=', mediaType: 'image/jpeg', previewUrl: 'data:image/jpeg;base64,R0lGODlhAQABAAAAACw=', key: 'p1.b1791561600000-c3' };
    _fp.draft = { text: 'Build my Legs day around the trap bar', nonce: 'd2.b1791561600000-c3' };
  });
  // Out of credit, a plain Stop, a Stop that kept changes (with their Undo), then a network error, offline
  setup({ room: 'heavyweight' });
  out.errors = model(9, [
    { role: 'user', content: 'Plan my week', at: day(0, '10:00') },
    { role: 'assistant', content: 'Your Anthropic account is out of credit. Add credit at console.anthropic.com, then try again.', _error: true, _local: true, _errKind: 'billing', at: day(0, '10:00') },
    { role: 'user', content: 'Plan my week', at: day(0, '10:05') },
    { role: 'assistant', content: 'Stopped.', _local: true, _stopped: true, at: day(0, '10:05') },
    { role: 'user', content: 'Plan my week', at: day(0, '10:06') },
    { role: 'assistant', content: 'Stopped. Changes made before the stop are kept:', _local: true, _tools: [WEEKS], _undo: 'coach:dump', at: day(0, '10:07') },
    { role: 'user', content: 'Plan my week', at: day(0, '10:08') },
    { role: 'assistant', content: "Coach didn't respond (network error). Check your API key in Settings.", _error: true, _local: true, at: day(0, '10:09') },
  ], () => { _fp.speech = say(coachMessages[coachMessages.length - 1]); });
  // A reply in flight in Lime: the weekly review answered, the next question running a tool
  setup({ room: 'dark' });
  out.loading = model(17, [
    { role: 'user', content: 'Review my last week (week 5, Monday to Sunday) and adjust what comes next if needed.', _seed: 'Weekly review', at: day(0, '11:00') },
    { role: 'assistant', content: T['cmb-with-markdown'], at: day(0, '11:01') },
    { role: 'user', content: 'Move Friday to Saturday', at: day(0, '11:03') },
  ], () => { coachLoading = true; _runningTools = [CADENCE]; _fp.speech = { id: 's17', text: 'Coach is thinking' }; });
  // 60 messages, the cap: every body the grammar has, pills every fifth reply, PLAN CHANGES on the last
  setup({ room: 'heavyweight' });
  const names = Object.keys(T).slice(0, 12), sixty = [];
  for (let i = 0; sixty.length < 60; i++) {
    const n = names[i % names.length];
    sixty.push({ role: 'user', content: 'Question ' + (i + 1) + ' about ' + n.replace(/-/g, ' '), at: day(-9 + Math.floor(i / 4), '08:' + String(i % 60).padStart(2, '0')) });
    sixty.push({ role: 'assistant', content: T[n], at: day(-9 + Math.floor(i / 4), '08:' + String((i + 1) % 60).padStart(2, '0')), _tools: i % 5 === 0 ? [LOG] : null });
  }
  sixty[59]._tools = [BENCH]; sixty[59]._undo = 'coach:dump';
  out.sixty = model(300, sixty);
  return out;
}

// The page's models now, as the text each fixture file holds: {name: text}. shell: the shell its boot runs under
// (build 60's 'coach' by default; tests/golden/dump-coach-home.js builds the same states under 61's 'tabs', where the
// chat is pushed on the Coach tab: one CoachModel whichever host draws it, contract 6.3).
async function pageModels(shell) {
  const app = await boot({ native: true, shell: shell || 'coach', page: { timezoneId: 'UTC' }, init: CLOCK_INIT, seed: { kt_apikey: 'sk-ant-golden', kt_coach_msgs: '[]' } });
  let models;
  try {
    // errors runs offline (the header says so); the rest online
    const json = asciiJSON(TEXTS);
    models = await app.page.evaluate(build, json);
    await app.page.context().setOffline(true);
    const offline = await app.page.evaluate(build, json);
    await app.page.context().setOffline(false);
    models.errors = offline.errors;
    if (app.errors.length) throw new Error('page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
  const out = {};
  for (const name of Object.keys(models)) out[name] = JSON.stringify(JSON.parse(models[name]), null, 1) + '\n';
  return out;
}
// The fixtures that differ from what the page builds now (spec 118 and --check).
async function drift() {
  const models = await pageModels();
  return Object.keys(models).filter((name) => {
    const file = path.join(OUT, name + '.json');
    return !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== models[name];
  });
}
module.exports = { pageModels, drift, OUT };

if (require.main === module) {
  (async () => {
    if (check) {
      const bad = await drift();
      if (bad.length) { console.error('FAIL: the page builds different coach models for ' + bad.join(', ') + ' (node tests/golden/dump-coach.js writes them)'); process.exit(1); }
      console.log('ok: the page-built coach models match ' + path.relative(ROOT, OUT));
      return;
    }
    const models = await pageModels();
    for (const name of Object.keys(models)) fs.writeFileSync(path.join(OUT, name + '.json'), models[name]);
    console.log('wrote ' + Object.keys(models).length + ' page-built coach models (' + path.relative(ROOT, OUT) + ')');
  })().catch((e) => { console.error('FAIL: ' + (e && e.stack || e)); process.exit(1); });
}