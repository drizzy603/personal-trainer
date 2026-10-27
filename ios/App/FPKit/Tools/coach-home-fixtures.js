#!/usr/bin/env node
// coach-home-fixtures.js: the coach home models (CoachHomeModel v1, contract 6.2) for FPCore that the page
// cannot build.
//
//   node ios/App/FPKit/Tools/coach-home-fixtures.js index.html ios/App/FPKit/Tests/FPCoreTests/Fixtures
//
// The page builds its own coach home models (_coachHomeModel, 10-page.md P6), and tests/golden/dump-coach-home.js
// writes them into Fixtures/coachHome (connect in both rooms, the starter link, the hub empty, with history,
// replying, with a programme, resuming). This script writes the three no page sends, by hand from what the
// contract describes (CoachHomeModel.swift), into the same folder (contract 6.4, T-G17):
//   - forward-compat.json: what a newer page could add (a route, a row action, an icon, a token group, fields),
//     with an unreadable colour, a row with no title, a group whose only row is unknown and a group that is not
//     an object;
//   - lone-surrogates.json: an older page that skipped _nativeJSON (half an emoji in the greet, the title and
//     a preview);
//   - minimal.json: {v:1}, every default.
// The palette comes from the page's THEMES, the hub's sizes from contract 6.2's table (Tokens.swift).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const [pagePath, outDir] = process.argv.slice(2);
if (!pagePath || !outDir) { console.error('usage: node coach-home-fixtures.js <page index.html> <Fixtures dir>'); process.exit(2); }
const html = fs.readFileSync(pagePath, 'utf8');
const scripts = []; const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi; let m;
while ((m = re.exec(html)) !== null) scripts.push(m[1]);
const src = scripts.join('\n');
function grabFrom(start) {
  if (start < 0) throw new Error('not found in the page');
  let d = 0;
  for (let k = src.indexOf('{', start); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(start, k + 1); }
  }
  throw new Error('unbalanced');
}
const page = {};
vm.createContext(page);
vm.runInContext([grabFrom(src.indexOf('function _chars(')), grabFrom(src.indexOf('function _wellFormed(')),
  grabFrom(src.indexOf('var THEMES = {')) + ';', 'this.THEMES = THEMES;'].join('\n'), page);

// ── tokens ──────────────────────────────────────────────────────────────────────────────────────
const camel = k => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
function palette(room) {
  const t = page.THEMES[room]; const out = {};
  for (const k of Object.keys(t)) {
    if (['name', 'room', 'paper', 'textColor'].includes(k)) continue;
    out[camel(k)] = t[k];
  }
  out.earned = t.earned || t.accent;
  out.earnedInk = t['earned-ink'] || t['accent-ink'];
  return out;
}
// The hub's sizes at the large text size (contract 6.2; Tokens.swift's homeScale tables). Heavyweight's group head
// and CTA label are 10 (index.html 2045-2046, the room's later rule over 1561 and 1545's 9 px), Lime's 9.
const HOME = {
  heavyweight: { homeMeta: 10, homeAvatar: 13, homeGreet: 15, homeTitle: 74, homeTitleMin: 54, homeBody: 15, homeGroupHead: 10,
    homeRowTitle: 14, homeRowSub: 11.5, homeFieldLabel: 9, homeField: 16, homeCtaLabel: 10, homeCtaTitle: 18, homeCtaArrow: 22,
    homeHelp: 12, homeLink: 14 },
  dark: { homeMeta: 10, homeAvatar: 13, homeGreet: 14, homeTitle: 56, homeTitleMin: 43, homeBody: 14, homeGroupHead: 9,
    homeRowTitle: 14, homeRowSub: 11.5, homeFieldLabel: 9, homeField: 16, homeCtaLabel: 9, homeCtaTitle: 18, homeCtaArrow: 22,
    homeHelp: 12, homeLink: 14 },
};

// ── the web hub's strings (index.html renderCoach) ────────────────────────────────────────────────
const HELP = 'Get a key from your Anthropic account: console.anthropic.com → API Keys → Create key, then paste it here.\n'
  + 'Anthropic bills usage to your own account — typically a few cents per chat. A Claude subscription does not include API access.';
const row = (o) => Object.assign({ sub: null }, o);

function forwardCompat() {
  return {
    v: 1, rev: 7, boot: 'b1760000800000-ab01', room: 'heavyweight', paper: true, dynTypeOn: false,
    newTopLevel: { anything: [1, 2, 3] },
    tokens: {
      color: Object.assign(palette('heavyweight'), { accent: '#ff7a00', bg: 'var(--bg)', glow: '#ffffff' }),
      type: Object.assign({}, HOME.heavyweight, { homeTitle: 70, homeBadge: 8 }),
      shadow: { card: '0 1px 2px rgba(0,0,0,.1)' },
    },
    route: 'upsell', resume: true,
    meta: { label: 'COACH · PRO', avatar: 'K', badge: 'NEW' },
    hero: { greet: 'Hi Kalani.', title: 'Coach', accent: 'goes pro.', body: 'Everything you had, and more.', image: 'hero.png' },
    connect: { label: 'Anthropic API Key', placeholder: 'sk-ant-...', cta: { label: 'UPGRADE', title: 'Unlock coaching', icon: 'star' },
      help: HELP, starter: null, extra: 1 },
    groups: [
      { head: 'Conversation', collapsed: false, rows: [
        row({ do: 'openChat', title: 'Open Chat', sub: '3 exchanges · Push day went well', icon: 'chat', badge: 2 }),
        row({ do: 'shareChat', title: 'Share Chat', icon: 'share' }),
        row({ do: 'startIntake', title: 'Build My Programme', sub: 'Generate a custom training plan', icon: 'sparkles' }),
      ] },
      { head: 'Pro', rows: [row({ do: 'upgrade', title: 'Go Pro', icon: 'star' })] },
      'not a group',
      { head: 'Account', rows: [
        row({ do: 'clearChat', title: '', icon: 'trash' }),
        row({ do: 'disconnect', title: 'Disconnect', icon: 'disconnect' }),
      ] },
    ],
  };
}

function lonely() {
  // an older page that skipped _nativeJSON: half an emoji in the greet, the title and the preview
  const half = String.fromCharCode(0xD83D), low = String.fromCharCode(0xDE00);
  return {
    v: 1, rev: 3, boot: 'b1760000900000-d83d', room: 'dark', paper: false, dynTypeOn: true,
    tokens: { color: palette('dark'), type: HOME.dark },
    route: 'hub', resume: false,
    meta: { label: 'COACH · WK 06 / 12 · STRENGTH', avatar: 'K' },
    hero: { greet: 'Hi Kalani ' + half + '.', title: 'Coach ' + low, accent: 'ready.',
      body: '3 exchanges so far. Pick up where you left off, or start a new thread.' },
    connect: null,
    groups: [
      { head: 'Conversation', rows: [
        row({ do: 'openChat', title: 'Open Chat', sub: '3 exchanges · Push day went well ' + half, icon: 'chat' })] },
      { head: 'Account', rows: [
        row({ do: 'clearChat', title: 'Clear Chat History', icon: 'trash' }),
        row({ do: 'disconnect', title: 'Disconnect', icon: 'disconnect' })] },
    ],
  };
}

function minimal() { return { v: 1 }; }

const write = (name, model, keepHalves) => {
  const text = JSON.stringify(model, (k, v) => (typeof v === 'string' && !keepHalves ? page._wellFormed(v) : v), 1);
  fs.mkdirSync(path.join(outDir, 'coachHome'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'coachHome', name + '.json'), text + '\n');
};
write('forward-compat', forwardCompat());
write('lone-surrogates', lonely(), true);
write('minimal', minimal());
