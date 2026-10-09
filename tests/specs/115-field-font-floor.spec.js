// iOS zooms the whole page into a text field (or picker) whose text is under 16 px when it takes
// focus, and stays zoomed after the keyboard closes: the runner's cue note (14 px) left the app cut
// off at the screen's right edge (web 20261009-1). Pinch zoom stays allowed (maximum-scale=3), so
// every editable field is raised to 16 px as it is added (_fieldFloor, a document MutationObserver);
// bigger fields, read-only and disabled ones are left as they are.
const { boot, assert, run } = require('../lib/harness');

const SEL = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=button]):not([type=submit]):not([type=reset]):not([type=color]):not([type=hidden]):not([type=image]),textarea,select';

run('a field added under 16 px is raised to 16 px; bigger, read-only, disabled and non-text fields are left alone', async () => {
  const app = await boot({ native: true });
  try {
    const out = await app.page.evaluate(async () => {
      const st = document.createElement('style'); st.textContent = '.t-small{font-size:13px}'; document.head.appendChild(st);
      const box = document.createElement('div');
      box.innerHTML =
        '<input id="a" type="text" style="font-size:11px">' +
        '<input id="b" type="number" style="font-size:14px">' +
        '<textarea id="c" class="t-small"></textarea>' +
        '<select id="d" style="font-size:12px"><option>x</option></select>' +
        '<input id="e" type="date" style="font-size:13px">' +
        '<input id="f" type="text" style="font-size:28px">' +
        '<textarea id="g" readonly style="font-size:11px"></textarea>' +
        '<input id="h" type="text" disabled style="font-size:11px">' +
        '<input id="i" type="checkbox" style="font-size:11px">';
      document.body.appendChild(box);
      await new Promise(r => setTimeout(r, 0));
      const fs = id => parseFloat(getComputedStyle(document.getElementById(id)).fontSize);
      const r = {};
      'abcdefghi'.split('').forEach(id => { r[id] = fs(id); });
      // a field nested deep in a sheet painted later is raised too
      const sheet = document.createElement('div'); sheet.innerHTML = '<div><div><input id="j" style="font-size:9px"></div></div>';
      document.body.appendChild(sheet); await new Promise(res => setTimeout(res, 0));
      r.j = fs('j');
      return r;
    });
    assert(out.a === 16 && out.b === 16 && out.c === 16 && out.d === 16 && out.e === 16 && out.j === 16, 'fields under 16 px (inline, class-styled, picker, date, nested) read 16 px: ' + JSON.stringify(out));
    assert(out.f === 28, 'a bigger field keeps its size: ' + out.f);
    assert(out.g === 11 && out.h === 11, 'read-only and disabled fields (no keyboard) are left alone: ' + JSON.stringify([out.g, out.h]));
    assert(out.i === 11, 'a checkbox is not a text field: ' + out.i);
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('every editable field the app paints reads 16 px or more: the runner cue note, the run, body and coach fields, the sheets', async () => {
  for (const theme of ['heavyweight', 'dark']) {
    const app = await boot({ native: true, seed: { kt_theme: theme, kt_apikey: 'sk-test', kt_coach_msgs: '[]' } });
    try {
      const out = await app.page.evaluate(async (SEL) => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const small = [], ran = [], seen = {};
        const scan = (label) => {
          document.querySelectorAll(SEL).forEach(f => {
            if (f.readOnly || f.disabled) return;
            const key = f.id || f.name || f.className || f.placeholder || f.outerHTML.slice(0, 60);
            seen[key] = parseFloat(getComputedStyle(f).fontSize);
            if (seen[key] < 16) small.push(label + ': ' + key + ' ' + seen[key] + 'px');
          });
        };
        const steps = [
          ['log workout', () => { switchTab('log'); switchLogSub('workout'); }],
          ['log run', () => { switchLogSub('run'); }],
          ['log body', () => { switchLogSub('body'); }],
          ['progress lifts', () => { switchTab('progress'); setProgressTab('lifts'); }],
          ['progress runs', () => { setProgressTab('runs'); }],
          ['settings', () => { switchTab('settings'); }],
          ['coach chat', () => { switchTab('coach'); coachView = 'chat'; render(); }],
          ['routines', () => { openRoutines(); }],
          ['profile sheet', () => { openProfileSheet(); }],
          ['exercise library add', () => { openExLib(); toggleLibAdd(); }],
          ['session editor', () => { openSessionEditor(getSessions().find(s => (s.exercises || []).length).id); }],
          ['run editor', () => { openRunEditor(getRuns()[0].id); }],
          ['runner + cue sheet', () => { switchTab('log'); switchLogSub('workout'); openDeckRunner('Push'); openRunnerCueSheet(); }],
        ];
        for (const [label, fn] of steps) {
          try { fn(); await wait(40); ran.push(label); scan(label); } catch (e) { ran.push(label + ' (failed: ' + e.message + ')'); }
        }
        return { small, ran, cue: seen.runnerCueNote, coach: seen['coach-input'], fields: Object.keys(seen).length };
      }, SEL);
      assert(!out.ran.some(s => /failed/.test(s)), theme + ': every screen and sheet opened: ' + out.ran.join(', '));
      assert(out.small.length === 0, theme + ': no editable field under 16 px: ' + out.small.join(' | '));
      assert(out.cue >= 16, theme + ': the runner cue note reads 16 px or more (it was 14): ' + out.cue);
      assert(out.coach >= 16 && out.fields >= 15, theme + ': the coach box and the rest were checked: ' + JSON.stringify([out.coach, out.fields]));
      assert(app.errors.length === 0, theme + ': no page errors: ' + app.errors.join('|'));
    } finally { await app.close(); }
  }
});
