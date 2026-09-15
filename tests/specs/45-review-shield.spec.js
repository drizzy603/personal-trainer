// Review shield: honest key wall + sk-ant- validation, Health readings kept out of
// the iCloud copy, neutral live-content wording, and load labels that never call a
// loaded lift "bodyweight".
const { boot, assert, run } = require('../lib/harness');

run('key wall is plain text with honest copy and only accepts Anthropic keys', async () => {
  const app = await boot({ seed: { kt_apikey: '', kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      localStorage.removeItem('kt_apikey'); switchTab('coach');
      const html = document.getElementById('screen').innerHTML;
      r.hasAnchor = /href="https:\/\/console\.anthropic\.com/.test(html);
      r.hasSteps = /API Keys/.test(html) && /bills usage to your own account/.test(html);
      const inp = document.getElementById('coach-key-input');
      inp.value = 'sk-proj-not-an-anthropic-key'; saveApiKey();
      r.rejected = !getApiKey();
      r.toast = (document.getElementById('toast') || {}).textContent || '';
      inp.value = 'sk-ant-api03-test-not-real'; saveApiKey();
      r.accepted = getApiKey() === 'sk-ant-api03-test-not-real';
      return r;
    });
    assert(!out.hasAnchor, 'key wall has no tappable console.anthropic.com link');
    assert(out.hasSteps, 'key wall explains where the key comes from and who bills');
    assert(out.rejected && /sk-ant-/.test(out.toast), 'an sk-proj key is refused with the sk-ant- hint: ' + out.toast);
    assert(out.accepted, 'an sk-ant- key is accepted');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('iCloud copy strips Apple Health heart rate / calories and the dedup ledger; Files copy untouched', async () => {
  const app = await boot({ seed: {
    kt_runs: JSON.stringify([{ id: 1, date: '2026-09-14', distance: 5, time: '25:00', week: 1, note: 'From Apple Health', hr: 152, type: 'easy' },
                             { id: 2, date: '2026-09-13', distance: 8, time: '40:00', week: 1, note: 'Tempo', hr: 160, type: 'tempo' }]),
    kt_sports: JSON.stringify([{ id: 3, date: '2026-09-12', type: 'Cycling', duration: 60, data: { distance: 30, avgSpeed: 30, avgHR: 140, calories: 600 }, notes: 'From Apple Health' },
                               { id: 4, date: '2026-09-11', type: 'Cycling', duration: 45, data: { distance: 20, avgHR: 138 }, notes: 'Manual' }]),
    kt_hk_imported: JSON.stringify(['uuid-1']),
  } });
  try {
    const out = await app.page.evaluate(() => {
      const raw = JSON.stringify(buildBackupJSON());
      const cloud = JSON.parse(_sanitizeForICloud(raw));
      const local = JSON.parse(raw);
      return { raw: local, cloud };
    });
    const c = out.cloud, l = out.raw;
    assert(l.kt_runs[0].hr === 152 && l.kt_hk_imported.length === 1, 'the local payload still carries the Health readings');
    assert(c.kt_runs[0].hr === undefined && c.kt_runs[0].distance === 5, 'Health run keeps distance, loses hr: ' + JSON.stringify(c.kt_runs[0]));
    assert(c.kt_runs[1].hr === 160, 'manual run keeps its hr');
    assert(c.kt_sports[0].data.avgHR === undefined && c.kt_sports[0].data.calories === undefined && c.kt_sports[0].data.distance === 30, 'Health sport loses avgHR/calories, keeps distance: ' + JSON.stringify(c.kt_sports[0].data));
    assert(c.kt_sports[1].data.avgHR === 138, 'manual sport untouched');
    assert(c.kt_hk_imported === undefined, 'Health dedup ledger left out of the iCloud copy');
    assert(c._manifest && c._manifest.counts.runs === 2, 'manifest survives');
    assert(_ => true, 'ok');
  } finally { await app.close(); }
});

run('live-content row is neutral and planned loads at zero read "your load", not bodyweight', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const r = {};
      switchTab('settings');
      r.about = document.getElementById('screen').innerText;
      r.lbl = { cable: _loadLabel('Cable Fly', 0), cableShort: _loadLabel('Cable Fly', 0, true), pushup: _loadLabel('Push Up', 0), pushupShort: _loadLabel('Push Up', 0, true), loaded: _loadLabel('Cable Fly', 100) };
      runnerWeights = {}; runnerReps = {}; runnerRpe = {}; runnerCompleted = {};
      r.engaged = _renderRunnerEngagedBody({ name: 'Cable Fly', sets: 3, reps: 12, weight: 0, rpe: 7 }, 0);
      r.engagedBW = _renderRunnerEngagedBody({ name: 'Push Up', sets: 3, reps: 12, weight: 0, rpe: 7 }, 0);
      return r;
    });
    assert(!/Update ready|Update available|Checking for updates/.test(out.about) && /content|Up to date/.test(out.about), 'About row uses neutral content wording');
    assert(out.lbl.cable === 'your load' && out.lbl.cableShort === 'your load' && out.lbl.pushup === 'bodyweight' && out.lbl.pushupShort === 'BW' && out.lbl.loaded === '100 lb', 'load labels: ' + JSON.stringify(out.lbl));
    assert(/TARGET your load × 12/.test(out.engaged), 'engaged card target for a zero-load cable lift: ' + (out.engaged.match(/TARGET[^<]*/) || [''])[0]);
    assert(/TARGET BW × 12/.test(out.engagedBW), 'engaged card target for a bodyweight lift stays BW');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
