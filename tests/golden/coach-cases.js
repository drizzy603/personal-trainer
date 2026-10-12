// The coach chat's golden cases (plan task C2): texts, tool calls and chat states whose HTML the page
// drew before md() and _coachBlocksHTML() were rebuilt on block models (_mdModel, _cmbModel) and
// before _planChangeRows() returned raw text. coach-html.js captures what a page draws for every case
// (coach-html.json holds the capture of the page before the rebuild) and spec 118 holds the page to it.
//
// Every case runs in a booted page (the test seed, UTC, the clock at CLOCK), through the page's own
// functions: md(text), _coachBlocksHTML(text) with and without its quiet flag, _planChangeLedger() and
// _toolPillHTML() for coach tool calls, and renderCoach() for whole chats.
'use strict';

// The wall clock the captures run on: a Friday, local (the page runs in UTC).
const CLOCK = '2026-10-09T09:30:00';

// The texts: each part of the chat's grammar (blocks-fixtures.js), then the edges.
const TEXTS = [
  ['run-analysis', '%%type: Run analysis\nGood session. Faster than planned, but your heart rate says it stayed easy.\n%%metric: PACE | 8:07 | vs 8:15 goal | -8s | good\n%%metric: AVG HR | 168 | vs cap 165 | +3 | warn\n%%metric: DISTANCE | 5.01 km | | on plan | plain\n%%takeaway: Aerobic base is improving - same pace, 6 bpm lower.\n%%takeaway: Second takeaway should be dropped.\n%%action: Set goal pace 8:05 | Set my run goal pace to 8:05/km\n%%action: Tempo on Thursday | Schedule a tempo run on Thursday\n%%action: Third action should be dropped | nope'],
  ['programme-adjustment', 'On it.\n\n%%type: Programme adjustment\n%%metric: BENCH | 200 lb | was 160 | +10 | good\n%%takeaway: Heavier from this week.\n%%action: Undo that | Put my bench back'],
  ['metric-runs', '%%metric: A | 1\nline between\n%%metric: B | 2 | ref\n\n\npara one\npara two same block\n\npara three\n%%action: Only label'],
  ['markdown-and-markers', 'Intro **bold** and *em* and `code`\n- bullet one\n- bullet two\n%%type:    Spaced type   \n%%takeaway: <script>x</script> & "q"\n  %%metric: indented marker | still a marker'],
  ['lists', 'Three things this week:\n- **Bench**: hold 160 lb and own the last rep\n- **Squat**: depth first, then load\n  - sub item under squat\n\n- still the same list after a blank line\n* star bullet\n+ plus bullet\n• dot bullet\n\nThen the order:\n3) warm up\n4) work sets\n\n1. a new list after a paragraph\n2. second'],
  ['headings-rules', '# Week 6 review\nTwo lines in one paragraph\nare joined by a line break.\n\n### What changed\n---\n> A quoted line reads as plain text\n***\n___\nLast line.'],
  ['table', 'Your top sets:\n| Lift | Top set | Change |\n|---|:---:|---|\n| **Bench** | 170 lb x 5 | +10 |\n| Squat | `225` x 3 | *held* |\n| Deadlift | 275 x 2\nAfter the table.'],
  ['inline-edges', '3*5*2 is not italic, *this is* and **this is**.\n**bold *em* bold** keeps its stars\n*em with **bold** inside*\n`code with **bold** inside`\n**a `b** c` misnests\nA [link](https://example.com/x) is its text; [not this](ftp://x) one.\n<b>not html</b> & "quotes" and \'apostrophes\''],
  ['cmb-with-markdown', '%%type: Week review\nThis week in short:\n- 4 sessions, **all** done\n- 2 runs\n\n%%metric: VOLUME | 12,400 lb | vs 11,900 | +4% | good\n\n%%metric: RUNS | 2 | of 3 | -1 | warn\n%%metric: SLEEP | 7.1 h | | flat | Plain\nKeep it going.\n%%takeaway: **Volume** is up; keep `deload` in week 8.\n%%action: Plan week 7 | Plan my week 7\n%%action:  | empty label is skipped\n%%action: Ask about sleep'],
  ['plain-prose', 'Good question.\n\nYour bench has moved from 150 to 170 lb in six weeks: that is steady progress.\n\nKeep the runs easy.'],
  ['unicode', 'Great work 💪 on the 5×5.\n日本語のテキスト and עברית side by side.\nCombining: é and a flag 🇬🇧.\n- half an emoji at the end \ud83d\n%%type: Ünïcödé\n%%metric: Ström | 5 km | | ✓ | good'],
  ['blank-markers', '%%type:\n%%metric:  | no label is skipped\n%%metric: ONLY LABEL\n%%takeaway:\nText after an empty takeaway.\n%%action:'],
  // ── the edges md() and the markers meet in coach replies ──
  ['empty', ''],
  ['blank-lines', '\n\n   \n\t\n'],
  ['misnest-code-bold', '**a `b** c` and `x **y` z**'],
  ['misnest-code-em', '*a `b* c` then `p *q` r*'],
  ['misnest-em-bold', '*a **b* c** and **d *e** f*'],
  ['triple-stars', '***both*** and ***x** y* and *z **w***'],
  ['entities', 'Tom & Jerry <3 > 2 &amp; &lt;b&gt; &#39;x&#39; &quot;y&quot;\n- a < b & c > d\n| x & y | <i> |\n|---|---|\n| "q" | \'a\' |'],
  ['crlf', 'line one\r\nline two\r\n\r\n- a\r\n- b\r\n\r\n1. c\r\n'],
  ['lists-switch', '- a\n1. b\n2) c\n- d\n\n- e\n\n\n1. f'],
  ['list-starts', '10. ten\n11. eleven\n\n001. padded\n\n999) big\n1000. too many digits'],
  ['bullets-odd', '-no space\n- \n-  two spaces\n    - deep sub\n\t- tab sub\n* * *\n- - -\n+ plus\n• nbsp dot'],
  ['headings-all', '# h1\n## h2 **bold**\n### h3 *em*\n#### h4 `code`\n##### h5\n###### h6\n####### seven is text\n#no space\n  ### indented heading'],
  ['rules-all', '---\n----------\n***\n___\n- - -\n--\n**\n__ not a rule'],
  ['quotes', '> quoted\n>no space\n> > nested\n>\n> **bold** quote\n&gt; already escaped'],
  ['links', '[a](https://x.y/z) [b](http://q) [c](ftp://n) [d](https://x y) [e **f**](https://g) [h](https://i)(j) [](https://k) [l](mailto:m) [n](https://a`b`c)'],
  ['tables-edge', '|---|\n\n|\n\n| a |\n\n| a | b |\n| --- | --- |\n\n|x|`a|b`|y|\n| trailing |   \nafter\n| restart |'],
  ['table-then-list', '| a | b |\n|---|---|\n| 1 | 2 |\n- item\n| c |'],
  ['para-after-list', '- one\n- two\nplain right after\n\n- three\n\n  indented para'],
  ['italic-edges', 'a*b*c and *d* and _e_ and * f * and *g*h and x *y\nz* and **unclosed and *also'],
  ['code-edges', '`` and ` ` and `a``b` and ```fenced```\n```\nblock\n```'],
  ['long-paragraphs', Array.from({ length: 12 }, (_, i) => 'Paragraph ' + (i + 1) + ' with **bold ' + i + '** and a list:\n- item ' + i + 'a\n- item ' + i + 'b').join('\n\n')],
  ['markers-only', '%%type: Only a type'],
  ['markers-mixed', '%%type: A\n%%type: B\nText\n%%metric: M1 | 1 | r | +1 | GOOD\n\n%%metric: M2 | 2 | | -2 | Warn\nbreak\n%%metric: M3 | 3 | | 0 | bad\n%%action: First | first msg | extra | parts\n%%action: Second\n%%takeaway: **T** `c` & <x> "q" \'a\''],
  ['markers-in-code', '`%%metric: x | 1`\n %%metric: one space | 1\n\t%%metric: tab | 2\nx %%metric: not a marker | 3'],
  ['marker-pipes', '%%metric: L | v | r | d | good | extra\n%%metric: L2 |  |  |  |\n%%metric: L3|v3|r3|d3|warn'],
  ['takeaway-only', '%%takeaway: Just the takeaway with **bold**, *em*, `code` and [a link](https://x).'],
  ['actions-quotes', 'Pick one.\n%%action: Say "hi" & <b>go</b> | It\'s "quoted" & <i>raw</i>\n%%action: Second | → arrow 💪'],
  ['surrogates-everywhere', 'Half \ud83d in text, \udc00 alone, pair 😀.\n- item \ud83d\n| \ud83d | ok |\n|---|---|\n%%type: T \ud83d\n%%metric: M \ud83d | v \ud83d | r | d | good\n%%takeaway: take \ud83d\n%%action: a \ud83d | msg \ud83d'],
];

// Coach tool calls for PLAN CHANGES and the pills: every row kind, names to escape, failures, units.
const TOOLS = [
  ['weight', [{ name: 'set_exercise_weight', input: { name: 'Bench Press', weight: 185 }, result: { ok: true }, units: { w: 'lb', d: 'km' } }]],
  ['weight-escape', [{ name: 'set_exercise_weight', input: { name: 'Mike\'s "A" <Press> & Co', weight: 100 }, result: { ok: true }, units: { w: 'lb', d: 'km' } }]],
  ['weight-kg', [{ name: 'set_exercise_weight', input: { name: 'Squat', weight: 100 }, result: { ok: true }, units: { w: 'kg', d: 'km' } }]],
  ['swap-days', [{ name: 'swap_cadence_days', input: { dayA: 'Mon <a>', dayB: 'Fri & Sat', scope: 'week' }, result: { ok: true }, units: { w: 'lb', d: 'km' } },
    { name: 'swap_cadence_days', input: { dayA: 'Tue', dayB: 'Thu', scope: 'global' }, result: { ok: true }, units: { w: 'lb', d: 'km' } }]],
  ['weeks', [{ name: 'update_routine_weeks', input: { weeks: [{ wk: 6 }, { wk: 7 }] }, result: { ok: true, weeks: [6, 7] }, units: { w: 'lb', d: 'km' } }]],
  ['weeks-cadence', [{ name: 'update_routine_weeks', input: { weeks: [{ wk: 6 }] }, result: { ok: true, weeks: [6], cadenceSaved: true }, units: { w: 'lb', d: 'km' } }]],
  ['weeks-partial', [{ name: 'update_routine_weeks', input: { weeks: [{ wk: 6 }, { wk: 7 }, { wk: 8 }] }, result: { ok: false, error: 'week 8 invalid', written: [6, 7] }, units: { w: 'lb', d: 'km' } }]],
  ['weeks-none', [{ name: 'update_routine_weeks', input: { weeks: [{ wk: 6 }] }, result: { ok: false, error: 'bad' }, units: { w: 'lb', d: 'km' } }]],
  ['edit-all', [
    { name: 'edit_programme_exercise', input: { day: 'Push', exercise: 'Cable Fly', action: 'add', weight: 40 }, result: { ok: true }, units: { w: 'lb', d: 'km' } },
    { name: 'edit_programme_exercise', input: { day: 'Push', exercise: 'Dips', action: 'remove' }, result: { ok: true }, units: { w: 'lb', d: 'km' } },
    { name: 'edit_programme_exercise', input: { day: 'Push', exercise: 'DB Lateral Raise', action: 'swap', rename_to: 'Cable <Lateral> & "Raise"' }, result: { ok: true }, units: { w: 'lb', d: 'km' } },
    { name: 'edit_programme_exercise', input: { day: 'Pull', exercise: 'Row', action: 'change', weight: 155, make_main: true }, result: { ok: true }, units: { w: 'lb', d: 'km' } },
    { name: 'edit_programme_exercise', input: { day: 'Pull', exercise: 'Curl', action: 'change' }, result: { ok: true }, units: { w: 'lb', d: 'km' } },
    { name: 'edit_programme_exercise', input: { day: 'Legs', exercise: 'Squat', action: 'change', make_main: 'true' }, result: { ok: true }, units: { w: 'lb', d: 'km' } },
  ]],
  ['goals', [
    { name: 'set_bench_goal', input: { weight: 225 }, result: { ok: true }, units: { w: 'lb', d: 'km' } },
    { name: 'set_squat_goal', input: { weight: 140 }, result: { ok: true }, units: { w: 'kg', d: 'km' } },
    { name: 'set_run_goal', input: { pace: '9:00' }, result: { ok: true }, units: { w: 'lb', d: 'mi' } },
    { name: 'set_5k_goal', input: { time: '24:30 <fast>' }, result: { ok: true }, units: { w: 'lb', d: 'km' } },
  ]],
  ['mixed-failed', [
    { name: 'set_exercise_weight', input: { name: 'Deadlift', weight: 315 }, result: { ok: false, error: 'no such lift' }, units: { w: 'lb', d: 'km' } },
    { name: 'log_session', input: { type: 'Push', date: '2026-10-08', exercises: [] }, result: { ok: true, type: 'Push' }, units: { w: 'lb', d: 'km' } },
    { name: 'save_profile', input: { injuries: 'knee' }, result: { ok: true }, units: { w: 'lb', d: 'km' } },
    { name: 'log_run', input: { distance: 5, time: '25:00' }, result: { ok: true }, units: { w: 'lb', d: 'km' } },
    { name: 'delete_log', input: { store: 'runs', id: 1 }, result: { ok: true }, units: { w: 'lb', d: 'km' } },
  ]],
];

// The page's wall clock, set before its scripts run: Date starts at CLOCK and keeps running.
const CLOCK_INIT = `(() => {
  const RealDate = Date, offset = new RealDate(${JSON.stringify(CLOCK)}).getTime() - RealDate.now();
  function FakeDate(...a) {
    if (!(this instanceof FakeDate)) return new RealDate(RealDate.now() + offset).toString();
    if (a.length === 0) return new RealDate(RealDate.now() + offset);
    return new RealDate(...a);
  }
  FakeDate.prototype = RealDate.prototype;
  FakeDate.now = () => RealDate.now() + offset;
  FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
  window.Date = FakeDate;
})();`;

// The cases as ASCII JSON (\u escapes), so half an emoji reaches the page exactly.
const asciiJSON = (v) => JSON.stringify(v).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

// Runs in the page (page.evaluate(capture, asciiJSON({TEXTS, TOOLS}))): what the page draws for every
// case. A lone surrogate is written as <U+D83D>, so the capture crosses back into Node exactly.
async function capture(json) {
  const { TEXTS, TOOLS } = JSON.parse(json);
  const lone = (s) => {
    s = String(s); let o = '';
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i), d = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (c >= 0xd800 && c <= 0xdbff && d >= 0xdc00 && d <= 0xdfff) { o += s[i] + s[i + 1]; i++; }
      else if (c >= 0xd800 && c <= 0xdfff) o += '<U+' + c.toString(16).toUpperCase() + '>';
      else o += s[i];
    }
    return o;
  };
  const out = { md: {}, blocks: {}, quiet: {}, ledger: {}, pills: {}, chats: {} };
  for (const [name, text] of TEXTS) {
    out.md[name] = lone(md(text));
    out.blocks[name] = lone(_coachBlocksHTML(text));
    out.quiet[name] = lone(_coachBlocksHTML(text, true));
  }
  // PLAN CHANGES: one reply per scenario, its undo point current and then taken by a later change
  const keep = { msgs: coachMessages, loading: coachLoading, running: _runningTools, intake: intakeMode, view: coachView, tab: currentTab, img: pendingImage, model: coachModel };
  lsSet('kt_routine_backup', getCustomRoutine());
  for (const [name, tools] of TOOLS) {
    coachMessages = [{ role: 'user', content: 'Change it' }, { role: 'assistant', content: 'Done.', _tools: tools, _undo: 'coach:golden' }];
    _setBackupScope('coach:golden');
    const now = lone(_planChangeLedger(tools, 1));
    _setBackupScope('routines');
    const later = lone(_planChangeLedger(tools, 1));
    out.ledger[name] = { canUndo: now, taken: later, noIndex: lone(_planChangeLedger(tools)) };
    out.pills[name] = tools.map((tc) => lone(_toolPillHTML(tc)));
  }
  // Whole chats: renderCoach() in each state the chat can be in
  const day = (n, hh) => new Date(addDays(todayISO(), n) + 'T' + hh + ':00').getTime();
  const SWAP = { name: 'edit_programme_exercise', input: { day: 'Push', exercise: 'DB Lateral Raise', action: 'swap', rename_to: 'Cable Lateral Raise', weight: 20 }, result: { ok: true }, units: { w: 'lb', d: 'mi' } };
  const GOAL = { name: 'set_bench_goal', input: { weight: 225 }, result: { ok: true }, units: { w: 'lb', d: 'km' } };
  const LOG = { name: 'log_bodyweight', input: { weight: 180 }, result: { ok: true }, units: { w: 'lb', d: 'km' } };
  const T = Object.fromEntries(TEXTS);
  const conversation = () => [
    { role: 'user', content: 'How did my run look?', at: day(-3, '18:02') },
    { role: 'assistant', content: T['run-analysis'], at: day(-3, '18:03') },
    { role: 'user', content: 'These lifts have plateaued: Bench Press. Propose ONE change.', _seed: 'Plateau check', at: day(-1, '07:30') },
    { role: 'assistant', content: T.lists, at: day(-1, '07:31'), _tools: [SWAP], _undo: 'coach:golden' },
    { role: 'user', content: '[Image]', _hadImage: true, _auto: true, at: day(0, '07:40') },
    { role: 'assistant', content: 'That is a clean bar path. Keep the **elbows** tucked.', at: day(0, '07:41') },
    { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'R0lGODlhAQABAAAAACw=' } }, { type: 'text', text: 'What about this <one> & "that"?' }], _preview: 'data:image/jpeg;base64,R0lGODlhAQABAAAAACw=', at: day(0, '07:45') },
    { role: 'assistant', content: T.table, at: day(0, '07:46') },
    { role: 'user', content: 'Set my bench goal', at: day(0, '07:50') },
    { role: 'assistant', content: 'Goal set.', _tools: [GOAL], at: day(0, '07:51') },
    { role: 'user', content: 'Log my weight', at: day(0, '07:52') },
    { role: 'assistant', content: T['cmb-with-markdown'], _tools: [LOG], at: day(0, '07:53') },
    { role: 'user', content: 'and my squat?', at: day(0, '07:55') },
    { role: 'assistant', content: 'Could not connect. Check your internet connection.', _error: true, _local: true, at: day(0, '07:56') },
  ];
  const states = {
    'empty': () => { coachMessages = []; lsDel('kt_routine_backup'); },
    'empty-backup': () => { coachMessages = []; lsSet('kt_routine_backup', getCustomRoutine()); },
    'conversation': () => { coachMessages = conversation(); _setBackupScope('coach:golden'); },
    'conversation-undo-taken': () => { coachMessages = conversation(); _setBackupScope('routines'); },
    'newest-loud': () => { coachMessages = conversation().slice(0, 12); },
    'key-error': () => { coachMessages = conversation().slice(0, 13).concat([{ role: 'assistant', content: 'Anthropic did not accept your API key. Check it in Settings › AI Coach.', _error: true, _local: true, _errKind: 'key', at: day(0, '07:56') }]); },
    'billing-error': () => { coachMessages = conversation().slice(0, 13).concat([{ role: 'assistant', content: 'Your Anthropic account is out of credit. Add credit at console.anthropic.com, then try again.', _error: true, _local: true, _errKind: 'billing', at: day(0, '07:56') }]); },
    'stopped': () => { coachMessages = conversation().slice(0, 13).concat([{ role: 'assistant', content: 'Stopped.', _local: true, _stopped: true, at: day(0, '07:56') }]); },
    'stopped-tools': () => { coachMessages = conversation().slice(0, 13).concat([{ role: 'assistant', content: 'Stopped. Changes made before the stop are kept:', _local: true, _tools: [SWAP], _undo: 'coach:golden', at: day(0, '07:56') }]); _setBackupScope('coach:golden'); },
    'loading': () => { coachMessages = conversation().slice(0, 13); coachLoading = true; _runningTools = [SWAP, GOAL]; },
    'running-idle': () => { coachMessages = conversation().slice(0, 13); _runningTools = [SWAP]; },
    'intake': () => { intakeMode = true; coachMessages = [{ role: 'user', content: 'I want to generate my training programme.', _seed: 'Programme setup', at: day(0, '09:00') }, { role: 'assistant', content: 'How many days a week can you train?', at: day(0, '09:00') }, { role: 'user', content: '4 days', at: day(0, '09:02') }]; coachLoading = true; },
    'intake-empty': () => { intakeMode = true; coachMessages = []; },
    'no-dates': () => { coachMessages = [{ role: 'user', content: 'Old question' }, { role: 'assistant', content: T['programme-adjustment'] }, { role: 'user', content: 'Old *markdown* stays text in a bubble' }, { role: 'assistant', content: T.entities }]; },
    'pending-image': () => { coachMessages = conversation().slice(0, 2); pendingImage = { data: 'R0lGODlhAQABAAAAACw=', mediaType: 'image/jpeg', previewUrl: 'data:image/jpeg;base64,R0lGODlhAQABAAAAACw=' }; },
    'haiku': () => { coachMessages = conversation().slice(0, 2); coachModel = 'claude-haiku-4-5-20251001'; },
    'surrogates': () => { coachMessages = [{ role: 'user', content: 'Half \ud83d emoji', at: day(0, '08:00') }, { role: 'assistant', content: T['surrogates-everywhere'], at: day(0, '08:01') }]; },
  };
  for (const name of Object.keys(states)) {
    coachMessages = []; coachLoading = false; _runningTools = []; intakeMode = false; pendingImage = null; coachModel = keep.model;
    coachView = 'chat'; currentTab = 'coach';
    lsSet('kt_routine_backup', getCustomRoutine()); _setBackupScope('');
    states[name]();
    out.chats[name] = lone(renderCoach());
  }
  coachMessages = keep.msgs; coachLoading = keep.loading; _runningTools = keep.running; intakeMode = keep.intake; coachView = keep.view; currentTab = keep.tab; pendingImage = keep.img; coachModel = keep.model;
  lsDel('kt_routine_backup'); _setBackupScope('');
  return out;
}

module.exports = { CLOCK, CLOCK_INIT, TEXTS, TOOLS, capture, asciiJSON };
