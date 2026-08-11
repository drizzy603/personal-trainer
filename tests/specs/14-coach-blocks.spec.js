// Coach message blocks (Premium spec 07): marked messages render as
// structured blocks (eyebrow / paragraphs / metric card / takeaway / action
// chips), unmarked messages keep the classic bubble, payloads are escaped,
// and the caps hold — one takeaway, two actions, first action primary.
const { boot, assert, run } = require('../lib/harness');

run('coach block grammar renders and caps hold', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      const marked = [
        '%%type: Run analysis',
        'Good session. Faster than planned, but your heart rate says it stayed easy.',
        '%%metric: PACE | 8:07 | vs 8:15 goal | -8s | good',
        '%%metric: AVG HR | 168 | vs cap 165 | +3 | warn',
        '%%metric: DISTANCE | 5.01 km | | on plan | plain',
        '%%takeaway: Aerobic base is improving - same pace, 6 bpm lower.',
        '%%takeaway: Second takeaway should be dropped.',
        '%%action: Set goal pace 8:05 | Set my run goal pace to 8:05/km',
        '%%action: Tempo on Thursday | Schedule a tempo run on Thursday',
        '%%action: Third action should be dropped | nope',
      ].join('\n');
      const html = _coachBlocksHTML(marked);
      const xss = _coachBlocksHTML('%%type: <img src=x onerror=alert(1)>\n%%takeaway: <script>bad</script>');
      return {
        detected: _hasCoachBlocks(marked),
        plainSkipped: !_hasCoachBlocks('Just a normal answer with 8:07 pace.'),
        eyebrow: html.indexOf('COACH · Run analysis') !== -1,
        para: html.indexOf('kt-cmb-para') !== -1,
        metricCards: (html.match(/kt-cmb-metrics/g) || []).length,
        metricRows: (html.match(/kt-cmb-mrow/g) || []).length,
        goodDelta: html.indexOf('kt-cmb-delta-good') !== -1,
        warnDelta: html.indexOf('kt-cmb-delta-warn') !== -1,
        takeaways: (html.match(/kt-cmb-take-eyebrow/g) || []).length,
        chips: (html.match(/kt-cmb-chip/g) || []).length,
        primaryFirst: /kt-cmb-chip primary/.test(html) && html.indexOf('kt-cmb-chip primary') < html.indexOf('Tempo on Thursday'),
        actionMsg: html.indexOf('Set my run goal pace to 8:05/km') !== -1,
        xssSafe: xss.indexOf('<img') === -1 && xss.indexOf('<script') === -1,
      };
    });
    assert(out.detected && out.plainSkipped, 'marker detection is exact');
    assert(out.eyebrow, 'eyebrow carries COACH + type tag');
    assert(out.para, 'plain lines render as paragraphs');
    assert(out.metricCards === 1 && out.metricRows === 3, 'consecutive metrics group into one card, got ' + out.metricCards + '/' + out.metricRows);
    assert(out.goodDelta && out.warnDelta, 'delta tones color good/warn');
    assert(out.takeaways === 1, 'only one takeaway renders, got ' + out.takeaways);
    assert(out.chips === 2, 'actions cap at two, got ' + out.chips);
    assert(out.primaryFirst && out.actionMsg, 'first action is primary and carries its message');
    assert(out.xssSafe, 'marker payloads are escaped');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});

run('marked assistant messages skip the bubble in chat', async () => {
  const app = await boot();
  try {
    const out = await app.page.evaluate(() => {
      localStorage.setItem('kt_apikey', 'sk-ant-test-not-real');
      coachMessages = [
        { role: 'user', content: 'How was my run?' },
        { role: 'assistant', content: '%%type: Run analysis\n%%metric: PACE | 8:07 | vs 8:15 | -8s | good\n%%takeaway: Solid.' },
        { role: 'assistant', content: 'Plain answer stays a bubble.' },
      ];
      switchTab('coach'); coachView = 'chat'; render();
      const screen = document.getElementById('screen');
      return {
        blocks: screen.querySelectorAll('.kt-cmb').length,
        bubbles: screen.querySelectorAll('.coach-bubble.assistant').length,
        userBubbles: screen.querySelectorAll('.coach-bubble.user').length,
      };
    });
    assert(out.blocks === 1, 'one structured message renders as blocks, got ' + out.blocks);
    assert(out.bubbles === 1, 'plain assistant message keeps its bubble, got ' + out.bubbles);
    assert(out.userBubbles === 1, 'user message still bubbles');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join(' | '));
  } finally { await app.close(); }
});
