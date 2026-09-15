// Coach depth: a persistent athlete profile the coach writes and reads, intake that starts from
// what the app knows, medium effort on chat turns with a token-spend line, and a debrief that
// compares with the previous session.
const { boot, assert, run } = require('../lib/harness');

run('profile tool + prompt, intake pre-fill, effort/usage, debrief baseline', async () => {
  const sessions = [
    { id: 2, date: '2026-09-14', week: 2, type: 'Push', prs: [], exercises: [{ name: 'Bench Press', isMain: true, sets: 3, reps: [8, 8, 8], weight: 190, rpe: 8 }] },
    { id: 1, date: '2026-09-07', week: 1, type: 'Push', prs: [], exercises: [{ name: 'Bench Press', isMain: true, sets: 3, reps: [8, 8, 8], weight: 185, rpe: 7 }] },
  ];
  const app = await boot({ seed: { kt_sessions: JSON.stringify(sessions), kt_weights: JSON.stringify({ 'Bench Press': 190, 'Squat': 250 }), kt_coach_msgs: '[]', kt_profile: '' } });
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      lsDel('kt_profile'); lsDel('kt_coach_usage');
      // the tool writes the profile; prompts carry it
      r.tool = executeCoachTool('save_profile', { injuries: 'left shoulder — no dips', equipment: 'home gym: barbell, rack, dumbbells to 50 lb' });
      r.profile = getProfile();
      r.sys = buildSystemPrompt();
      r.intake = buildIntakeSystemPrompt();
      r.tools = JSON.stringify(_cachedCoachTools());
      r.label = toolCallLabel({ name: 'save_profile', input: { injuries: 'x' } });
      // effort only on chat turns, only on models that take it
      r.effort = { chat: _coachOutputConfig('claude-sonnet-5', false), intake: _coachOutputConfig('claude-sonnet-5', true), haiku: _coachOutputConfig('claude-haiku-4-5-20251001', false) };
      // usage ledger + Settings line
      _recordCoachUsage({ input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 5000, cache_creation_input_tokens: 0 });
      _recordCoachUsage({ input_tokens: 1000, output_tokens: 300, cache_read_input_tokens: 5000, cache_creation_input_tokens: 500 });
      r.usage = lsGet('kt_coach_usage'); r.usageLine = _coachUsageLine();
      localStorage.setItem('kt_apikey', 'sk-ant-test-not-real'); switchTab('settings');
      const st = document.getElementById('screen').innerText;
      r.settings = { usage: /Your key so far: 2 turns/.test(st), profileRow: /Athlete profile/.test(st) && /left shoulder/.test(st) };
      localStorage.removeItem('kt_apikey');
      // debrief prompt compares with the previous same-type session
      r.debrief = _debriefPrompt(getSessions()[0]);
      // Settings sheet edits the profile
      openProfileSheet();
      const g = document.getElementById('pf-goals'); r.sheet = !!g && document.getElementById('pf-injuries').value === 'left shoulder — no dips';
      g.value = 'Strength'; saveProfileSheet();
      r.afterSheet = getProfile();
      r.backup = !!buildBackupJSON().kt_profile;
      return r;
    });
    assert(out.tool.ok && /Injuries/.test(out.tool.message) && out.profile.injuries === 'left shoulder — no dips' && out.profile.equipment, 'save_profile writes the profile: ' + JSON.stringify(out.tool));
    assert(/ATHLETE PROFILE/.test(out.sys) && /left shoulder/.test(out.sys) && /save_profile/.test(out.sys), 'the system prompt carries the profile and the tool guidance');
    assert(/WHAT THE APP ALREADY KNOWS/.test(out.intake) && /Working weights: Squat 250 lb, Bench Press 190 lb/.test(out.intake) && /Profile: /.test(out.intake) && /call save_profile ONCE/.test(out.intake), 'the intake starts from what the app knows: ' + (out.intake.match(/=== WHAT[\s\S]{0,300}/) || [''])[0]);
    assert(/"name":"save_profile"/.test(out.tools) && out.label === 'Profile updated', 'the tool is offered and labelled');
    assert(out.effort.chat && out.effort.chat.effort === 'medium' && out.effort.intake === undefined && out.effort.haiku === undefined, 'effort: medium on chat, default on intake, none for Haiku: ' + JSON.stringify(out.effort));
    assert(out.usage.turns === 2 && out.usage.input === 2000 && out.usage.output === 500 && out.usage.cacheRead === 10000 && /2 turns/.test(out.usageLine) && /13k tokens in \(80% from cache\)/.test(out.usageLine), 'usage ledger accumulates and formats: ' + out.usageLine);
    assert(out.settings.usage && out.settings.profileRow, 'Settings shows the spend line and the profile row: ' + JSON.stringify(out.settings));
    assert(/Previous Push \(2026-09-07\): Bench Press 3×\[8,8,8\] @ 185 lb/.test(out.debrief) && /est\. 1RM/.test(out.debrief) && /Athlete: /.test(out.debrief), 'debrief prompt carries the previous session, the e1RM move and the profile: ' + out.debrief.slice(-300));
    assert(out.sheet && out.afterSheet.goals === 'Strength' && out.afterSheet.injuries === 'left shoulder — no dips', 'the Settings sheet edits the profile: ' + JSON.stringify(out.afterSheet));
    assert(out.backup, 'the profile rides in the backup');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
