// The coach runs Claude Sonnet 5.5 (web 20261007-1): the chat default, the Sonnet side of the
// Sonnet/Haiku toggle and every intake. A Sonnet saved by an older page (4.6, 5) moves to it;
// Haiku stays Haiku. Sonnet 5.5 requests carry the server-side fallback (fallbacks:"default",
// beta server-side-fallback-2026-07-01), dropped for the session after a 400 that names it;
// Haiku requests carry neither it nor effort. Within a turn the conversation is append-only and
// thinking blocks go back unchanged (Sonnet 5.5 binds them to everything before them); the
// 'fallback' marker block is not echoed. A decline (stop_reason 'refusal') says so instead of
// "returned no reply". A tool name off only in letter case runs as that tool. Notes between tool
// calls can come back hidden, so the prompt asks for a reply after the last tool call that
// stands on its own.
const { boot, assert, run } = require('../lib/harness');

// Records every request and answers from the list in order (the last one repeats).
const FETCH = `(replies) => {
  window.__sent = []; let n = 0;
  window.fetch = async (url, opts) => {
    window.__sent.push({ url: String(url), headers: Object.assign({}, opts && opts.headers), body: JSON.parse(opts && opts.body || '{}') });
    const r = replies[Math.min(n++, replies.length - 1)];
    return new Response(JSON.stringify(r.body), { status: r.status || 200, headers: { 'content-type': 'application/json' } });
  };
}`;
const ok = (content, stop) => ({ body: { id: 'msg', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content, stop_reason: stop || 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } } });

// Types a message into the coach box and sends it the way the Send button does.
const SEND = `async (text) => {
  switchTab('coach'); coachView = 'chat'; render();
  await new Promise(r => setTimeout(r, 20));
  document.getElementById('coach-input').value = text;
  await sendCoachMessage();
  await new Promise(r => setTimeout(r, 20));
}`;

run('the coach runs Sonnet 5.5; an older page\'s Sonnet moves to it, Haiku stays, the toggle goes back to it', async () => {
  const out = {};
  for (const [key, stored] of [['fresh', null], ['sonnet5', 'claude-sonnet-5'], ['sonnet46', 'claude-sonnet-4-6'], ['haiku', 'claude-haiku-4-5-20251001']]) {
    const seed = { kt_apikey: 'sk-test', kt_coach_msgs: '[]' };
    if (stored) seed.kt_coach_model = stored;
    const app = await boot({ native: true, seed });
    try {
      out[key] = await app.page.evaluate(async () => {
        const r = { model: coachModel };
        switchTab('coach'); coachView = 'chat'; render();
        await new Promise(res => setTimeout(res, 20));
        // the Sonnet/Haiku toggle, both ways
        const tog = () => [...document.querySelectorAll('button')].find(b => /setCoachModel\(/.test(b.getAttribute('onclick') || ''));
        const t1 = tog(); if (t1) t1.click(); r.afterOne = coachModel;
        const t2 = tog(); if (t2) t2.click(); r.afterTwo = coachModel; r.saved = localStorage.getItem('kt_coach_model');
        return r;
      });
      out[key].errors = app.errors.join('|');
    } finally { await app.close(); }
  }
  const S = 'claude-sonnet-5-5', H = 'claude-haiku-4-5-20251001';
  assert(out.fresh.model === S, 'a fresh install runs Sonnet 5.5: ' + out.fresh.model);
  assert(out.sonnet5.model === S && out.sonnet46.model === S, 'a Sonnet saved by an older page moves to Sonnet 5.5: ' + JSON.stringify([out.sonnet5.model, out.sonnet46.model]));
  assert(out.haiku.model === H, 'Haiku stays Haiku: ' + out.haiku.model);
  assert(out.fresh.afterOne === H && out.fresh.afterTwo === S && out.fresh.saved === S, 'the toggle goes to Haiku and back to Sonnet 5.5: ' + JSON.stringify(out.fresh));
  assert(out.haiku.afterOne === S, 'from Haiku the toggle lands on Sonnet 5.5: ' + out.haiku.afterOne);
  for (const k of Object.keys(out)) assert(out[k].errors === '', k + ': no page errors: ' + out[k].errors);
});

run('a Sonnet 5.5 turn: fallback on, effort medium, no thinking or tool_choice fields; append-only with thinking echoed unchanged', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-test', kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(async ({ FETCH, SEND, R }) => {
      eval(FETCH)(R);
      await eval(SEND)('remember I train for strength');
      const s = window.__sent, last = coachMessages[coachMessages.length - 1];
      return { sent: s, last: { content: last.content, tools: (last._tools || []).map(t => t.name), local: !!last._local }, profile: getProfile().goals, sys: buildSystemPrompt() };
    }, { FETCH, SEND, R: [
      ok([{ type: 'thinking', thinking: '', signature: 'sig-1' }, { type: 'tool_use', id: 'tu1', name: 'save_profile', input: { goals: 'Strength' } }], 'tool_use'),
      ok([{ type: 'fallback', from: { model: 'claude-sonnet-5-5' }, to: { model: 'claude-sonnet-5' } }, { type: 'text', text: 'Noted: strength is the goal.' }]),
    ] });
    const [a, b] = out.sent;
    assert(out.sent.length === 2 && a.url === 'https://api.anthropic.com/v1/messages', 'one tool round and the reply: ' + out.sent.length);
    assert(a.body.model === 'claude-sonnet-5-5' && b.body.model === 'claude-sonnet-5-5', 'both requests run Sonnet 5.5: ' + [a.body.model, b.body.model]);
    assert(a.headers['anthropic-beta'] === 'server-side-fallback-2026-07-01' && a.body.fallbacks === 'default', 'the server-side fallback rides along: ' + JSON.stringify([a.headers['anthropic-beta'], a.body.fallbacks]));
    assert(a.body.output_config && a.body.output_config.effort === 'medium', 'chat turns ask for medium effort: ' + JSON.stringify(a.body.output_config));
    assert(!('thinking' in a.body) && !('tool_choice' in a.body), 'no thinking setting (adaptive by default) and no forced tool call: ' + Object.keys(a.body).join(','));
    assert(a.headers['x-api-key'] === 'sk-test' && a.headers['anthropic-dangerous-direct-browser-access'] === 'true' && a.headers['anthropic-version'] === '2023-06-01', 'the usual browser headers stay: ' + JSON.stringify(a.headers));
    // append-only: the second request starts with every message of the first, unchanged, then the
    // assistant turn with its thinking block exactly as received, then the tool result
    const n = a.body.messages.length;
    assert(JSON.stringify(b.body.messages.slice(0, n)) === JSON.stringify(a.body.messages), 'the conversation is only appended to within a turn');
    assert(JSON.stringify(b.body.system) === JSON.stringify(a.body.system) && JSON.stringify(b.body.tools) === JSON.stringify(a.body.tools), 'the system prompt and tools stay the same within a turn');
    const asst = b.body.messages[n], res = b.body.messages[n + 1];
    assert(asst.role === 'assistant' && JSON.stringify(asst.content[0]) === JSON.stringify({ type: 'thinking', thinking: '', signature: 'sig-1' }) && asst.content[1].type === 'tool_use', 'the thinking block goes back unchanged before its tool call: ' + JSON.stringify(asst));
    assert(res.role === 'user' && res.content[0].type === 'tool_result' && res.content[0].tool_use_id === 'tu1', 'then the tool result: ' + JSON.stringify(res));
    assert(out.last.content === 'Noted: strength is the goal.' && out.last.tools.join() === 'save_profile' && !out.last.local, 'the reply after a fallback reads as usual, the fallback marker dropped: ' + JSON.stringify(out.last));
    assert(out.profile === 'Strength', 'the tool ran: ' + out.profile);
    assert(/Write that reply after your last tool call: notes written between tool calls may not be shown/.test(out.sys), 'the prompt asks for a reply after the last tool call that stands on its own');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('Haiku turns carry no fallback and no effort; intake runs Sonnet 5.5 at its default effort', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-test', kt_coach_msgs: '[]', kt_coach_model: 'claude-haiku-4-5-20251001' } });
  try {
    const out = await app.page.evaluate(async ({ FETCH, SEND, R }) => {
      eval(FETCH)(R);
      await eval(SEND)('how was my week');
      const haiku = window.__sent[0];
      // an intake turn (a programme being built) from the same Haiku setting
      _setIntakeMode(true); window.__sent = [];
      await eval(SEND)('4 days a week, full gym');
      const intake = window.__sent[0];
      _setIntakeMode(false);
      return { haiku, intake };
    }, { FETCH, SEND, R: [ok([{ type: 'text', text: 'Solid week.' }])] });
    assert(out.haiku.body.model === 'claude-haiku-4-5-20251001', 'the Haiku setting runs Haiku: ' + out.haiku.body.model);
    assert(!('anthropic-beta' in out.haiku.headers) && !('fallbacks' in out.haiku.body) && !('output_config' in out.haiku.body), 'Haiku gets no fallback and no effort: ' + JSON.stringify([out.haiku.headers, Object.keys(out.haiku.body)]));
    assert(out.intake.body.model === 'claude-sonnet-5-5' && out.intake.body.max_tokens === 24576, 'intake runs Sonnet 5.5 with its headroom: ' + JSON.stringify([out.intake.body.model, out.intake.body.max_tokens]));
    assert(!('output_config' in out.intake.body) && out.intake.body.fallbacks === 'default', 'intake keeps the default effort and has the fallback: ' + JSON.stringify(Object.keys(out.intake.body)));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('a 400 over the fallback sends the request again without it, for the rest of the session; other 400s are errors', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-test', kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(async ({ FETCH, SEND, R1, R2 }) => {
      const r = {};
      eval(FETCH)(R1);
      await eval(SEND)('hello');
      r.first = window.__sent.map(s => [s.headers['anthropic-beta'] || '', s.body.fallbacks || '']);
      r.reply = coachMessages[coachMessages.length - 1].content;
      window.__sent = [];
      await eval(SEND)('and now?');
      r.next = window.__sent.map(s => [s.headers['anthropic-beta'] || '', s.body.fallbacks || '']);
      // a fresh session (the flag is in memory only) with a 400 about something else
      _coachNoFallback = false;
      eval(FETCH)(R2);
      await eval(SEND)('again');
      r.other = { n: window.__sent.length, last: coachMessages[coachMessages.length - 1] };
      return r;
    }, { FETCH, SEND,
      R1: [{ status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'fallbacks: unexpected value for beta server-side-fallback-2026-07-01' } } }, ok([{ type: 'text', text: 'Hi.' }])],
      R2: [{ status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'messages.0.content: Input should be a valid list' } } }] });
    assert(JSON.stringify(out.first) === JSON.stringify([['server-side-fallback-2026-07-01', 'default'], ['', '']]) && out.reply === 'Hi.', 'the request goes again at once without the fallback: ' + JSON.stringify(out.first));
    assert(JSON.stringify(out.next) === JSON.stringify([['', '']]), 'and stays without it this session: ' + JSON.stringify(out.next));
    assert(out.other.n === 1 && out.other.last._error && /valid list/.test(out.other.last.content), 'a 400 about something else is not retried and shows its error: ' + JSON.stringify(out.other));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('a tool called by a name that differs only in letter case runs as that tool; an unknown name still answers unknown tool', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-test', kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(async ({ FETCH, SEND, R }) => {
      eval(FETCH)(R);
      await eval(SEND)('I avoid dips, and I like squats');
      const s = window.__sent, last = coachMessages[coachMessages.length - 1];
      const results = s[1].body.messages[s[1].body.messages.length - 1].content.map(b => ({ id: b.tool_use_id, err: !!b.is_error, out: JSON.parse(b.content) }));
      return { results, profile: getProfile(), tools: (last._tools || []).map(t => t.name), labels: (last._tools || []).map(t => toolCallLabel(t)) };
    }, { FETCH, SEND, R: [
      ok([{ type: 'tool_use', id: 'a', name: 'Save_Profile', input: { dislikes: 'dips' } }, { type: 'tool_use', id: 'b', name: 'save_profiles', input: { likes: 'squats' } }], 'tool_use'),
      ok([{ type: 'text', text: 'Got it.' }]),
    ] });
    const [a, b] = out.results;
    assert(a.id === 'a' && !a.err && a.out.ok && out.profile.dislikes === 'dips', 'the miscased name runs save_profile: ' + JSON.stringify(a));
    assert(b.id === 'b' && b.err && /unknown tool: save_profiles/.test(b.out.error) && !out.profile.likes, 'an unknown name is still an error the model can correct: ' + JSON.stringify(b));
    assert(out.tools[0] === 'save_profile' && out.labels[0] === 'Profile updated', 'its pill reads as the tool it ran: ' + JSON.stringify([out.tools, out.labels]));
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});

run('a declined reply says the coach cannot help with it, not that it returned nothing', async () => {
  const app = await boot({ native: true, seed: { kt_apikey: 'sk-test', kt_coach_msgs: '[]' } });
  try {
    const out = await app.page.evaluate(async ({ FETCH, SEND, R }) => {
      eval(FETCH)(R);
      await eval(SEND)('something it declines');
      const last = coachMessages[coachMessages.length - 1];
      return { content: last.content, local: !!last._local, error: !!last._error, shown: document.getElementById('screen').innerText };
    }, { FETCH, SEND, R: [{ body: { id: 'msg', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'general_harms', explanation: '' }, usage: { input_tokens: 10, output_tokens: 0 } } }] });
    assert(out.content === 'The coach can’t help with that request. Try asking it another way.' && out.local && out.error, 'the decline is named: ' + JSON.stringify(out));
    assert(/can’t help with that request/.test(out.shown), 'and shown in the chat');
    assert(app.errors.length === 0, 'no page errors: ' + app.errors.join('|'));
  } finally { await app.close(); }
});
