"""Build 62's restart flag (lane R of b62/DESIGN.md, R0): whether the scene's marks, sessionStorage's fp_tab and fp_chat,
outlive a restart of WebKit's processes while the app and its scene live, and what the next document's hello then counts
as a place the owner asked for (_photoAsked: a kept share's chat stays shut for it, counted as left).

The marks live in WebKit's Networking process and the scene (the tab root's selection, its seq, the pushed chat) in the
app's. A WebContent kill leaves the Networking process running; a restart that loses the Networking process too would
leave the scene and lose the marks (CLAUDE.md's gap for build 62: the page then boots on the scene's first tab, and
hello's selection, where the owner already was, reads as a move). Both are made here on demand, on the tab root:

  wckill-log  no -devNav, so the scene's first tab is Log. Launch 1: Progress tapped on the bar (fp_tab progress), then
              the WebContent killed (-[WKWebView _killWebContentProcess]: Capacitor reloads the page into a new one).
              Launch 2: Coach tapped and the hub's Open Chat pressed (the chat pushed on the Coach stack: fp_chat t),
              then the WebContent killed.
  wckill-net  the same two launches, the Networking process ended with the WebContent in one turn (ShellProbe's
              killNetwork: -[WKWebsiteDataStore _terminateNetworkProcess], then _killWebContentProcess).

Each launch reads the marks (MARKS_JS) in the first document, right before the kill, and in the new document once its
hello has answered, with the marks the new document found at its start, before its own scripts ran (the probe's
document-start script: a page writes fp_tab again when hello's selection moves it, and fp_chat again when it takes the
chat over); every state carries both processes' pids, so a kill is seen to replace what it ends. Checked: the moves
reached the page and the scene before the kill; the kill made a new document and replaced the processes it ended; the
new document's hello answered and the page shows the shell's tab (the chat taken over in launch 2); hello's reply
numbered the documents of the scene 1 then 2 (build 62's `doc`, R1, as the probe's hello events carry it). wckill-log
also checks what a WebContent kill must keep: the marks at the new document's start, and no place counted at its
hello. For wckill-net what the marks and the count came to is reported as a fact with its values (R0 measures it).
"""
import native_shell as shell
from native_shell import js, mark, state, step, wait

S_LOG, S_NET = 'wckill-log', 'wckill-net'
MOVES = {
    # Progress tapped on the bar: the funnel's run, tabs.select to the page, its local switch writes fp_tab
    'progress': [step('tapTab', tab='progress'), wait(1200)],
    # Coach tapped (the hub, NATIVE), then the hub's Open Chat: the chat pushed on the Coach stack, fp_chat t
    'chat': [step('tapTab', tab='coach'), wait(1800), step('press', label='Open Chat', where='hub'),
             step('waitCoach', label='chat up', until='up', ms=8000), wait(1500)],
}
KILLS = {S_LOG: {'op': 'killWebContent'}, S_NET: {'op': 'killNetwork'}}


def _launch(c, s, half):
    phases = [[wait(1500), js('marks first', shell.MARKS_JS), state('first')] + MOVES[half]
              + [js('marks before', shell.MARKS_JS), state('before kill'), mark('before-kill-' + half), KILLS[s]],
              [wait(1500), js('marks after', shell.MARKS_JS), state('after kill'), mark('after-kill-' + half)]]
    return shell.shell_probe(c.sim, '%s-%s' % (s.split('-')[1], half), phases, timeout=150)


def _boot_tab(start, flag):
    """The tab the new document booted on (the page's tabs boot block): fp_tab when it names a tab, else the flag's."""
    t = (start or {}).get('fp_tab')
    return t if t in shell.TAB_IDS else ((flag or {}).get('tabs') or {}).get('selected')


def _one(c, s, half):
    ev = _launch(c, s, half)
    first, b, a = ev.state('first'), ev.state('before kill'), ev.state('after kill')
    m1, mb, ma = shell.marks_of(ev, 'marks first'), shell.marks_of(ev, 'marks before'), shell.marks_of(ev, 'marks after')
    st = ma.get('start') or {}
    want = 'progress' if half == 'progress' else 'coach'
    tag = '%s, %s' % (s, half)
    # the moves reached the page and the scene before the kill
    rb = shell.root(b)
    if half == 'progress':
        moved = mb.get('fp_tab') == 'progress' and mb.get('tab') == 'progress' and rb.get('selected') == 'progress' and (rb.get('seq') or 0) >= 1
    else:
        moved = (mb.get('fp_tab') == 'coach' and mb.get('fp_chat') == 't' and mb.get('tab') == 'coach' and mb.get('view') == 'chat'
                 and rb.get('selected') == 'coach' and shell.rcoach(b).get('pushed') is True and shell.coach(b).get('presented'))
    c.rep.check(s, '%s: the scene began on Log (no -devNav), and before the kill the page and the root stood where the moves put them '
                '(%s)' % (half, 'Progress: fp_tab progress, the root\'s seq 1 or more' if half == 'progress'
                          else 'Coach, the chat pushed on its stack: fp_tab coach, fp_chat t'),
                (((shell.page(first).get('flag') or {}).get('tabs') or {}).get('selected') == 'log' and m1.get('tab') == 'log' and moved),
                {'first': {k: m1.get(k) for k in ('tab', 'fp_tab', 'fp_chat', 'hello')},
                 'before': {k: mb.get(k) for k in ('tab', 'view', 'fp_tab', 'fp_chat', 'keys', 'asked')},
                 'root': {k: rb.get(k) for k in ('selected', 'seq')}, 'pushed': shell.rcoach(b).get('pushed')})
    # the kill: a new document, and the processes it ends replaced
    k = ev.first('killNetwork' if s == S_NET else 'killWebContent') or {}
    pb, pa = shell.procs(b), shell.procs(a)
    boot0, boot1 = shell.fp(b).get('boot'), shell.fp(a).get('boot')
    web_new = isinstance(pb.get('web'), int) and isinstance(pa.get('web'), int) and pb['web'] != pa['web']
    net_new = isinstance(pb.get('net'), int) and isinstance(pa.get('net'), int) and pb['net'] != pa['net']
    ok = bool(k) and bool(boot0) and bool(boot1) and boot0 != boot1 and (shell.shellst(a).get('documents') or 0) >= 2 and web_new
    if s == S_NET:
        ok = ok and k.get('terminated') is True and k.get('webContent') is True and net_new
    c.rep.check(s, '%s: the kill made a new document and replaced %s (the pids before and after)' % (
        half, 'the WebContent and the Networking process' if s == S_NET else 'the WebContent'), ok,
        {'kill': {x: k.get(x) for x in ('terminated', 'webContent', 'before', 'error') if x in k}, 'procs': [pb, pa],
         'boots': [boot0, boot1], 'documents': shell.shellst(a).get('documents')})
    if s == S_LOG:
        c.rep.check(s, '%s: the Networking process went on through the WebContent kill (one pid)' % half,
                    isinstance(pb.get('net'), int) and pb.get('net') == pa.get('net'), [pb, pa])
    # build 62 (R1): hello's reply numbers the document in its scene, as the shell sent it (the probe's hello events)
    hellos = shell.page_events(ev, 'hello')
    docs = [h.get('doc') for h in hellos]
    c.rep.check(s, '%s: hello\'s reply numbered each document in its scene (doc 1 for the scene\'s first, 2 for the new one)' % half,
                docs == [1, 2] and [h.get('boot') for h in hellos] == [boot0, boot1], {'docs': docs, 'boots': [h.get('boot') for h in hellos]})
    # the new document: its hello answered, and the page shows the shell's tab (the chat taken over in launch 2)
    ra = shell.root(a)
    shows = ma.get('hello') is not None and ma.get('tab') == want and ra.get('selected') == want and shell.page(a).get('tab') == want
    if half == 'chat':
        shows = shows and ma.get('view') == 'chat' and shell.coach(a).get('presented') and shell.rcoach(a).get('pushed') is True
    c.rep.check(s, '%s: the new document\'s hello answered, and the page shows the shell\'s tab (%s)' % (
        half, want if half == 'progress' else 'coach, the chat taken over on the Coach stack'), shows,
        {'after': {x: ma.get(x) for x in ('tab', 'view', 'hello', 'seqSeen')}, 'root': {x: ra.get(x) for x in ('selected', 'seq')},
         'pushed': shell.rcoach(a).get('pushed')})
    kept = st.get('fp_tab') == want and (half != 'chat' or st.get('fp_chat') == 't')
    booted = _boot_tab(st, shell.page(a).get('flag'))
    logs = [x.get('text') for x in shell.page_events(ev, 'log', after=k.get('t', 0))]
    c.rep.fact(s, '%s: before the kill %s; at the new document\'s start %s; after its hello %s; booted on %s; the root %s seq %s; '
               'the processes %s -> %s; the page\'s log lines since the kill %s' % (
                   half, {x: mb.get(x) for x in ('fp_tab', 'fp_chat', 'fp_seen', 'keys', 'asked')},
                   {x: st.get(x) for x in ('fp_tab', 'fp_chat', 'fp_seen', 'keys', 'nav', 'error') if x in st},
                   {x: ma.get(x) for x in ('fp_tab', 'fp_chat', 'fp_seen', 'asked', 'hello', 'tab', 'view', 'seqSeen', 'nav', 'navOld', 'wch')},
                   booted, ra.get('selected'), ra.get('seq'), pb, pa, logs))
    if s == S_LOG:
        c.rep.check(s, '%s: a WebContent kill keeps the scene\'s marks (fp_tab %s%s at the new document\'s start, before its scripts), '
                    'so it boots where the owner was and its hello counts no place asked for (_photoAsked 0)' % (
                        half, want, ', fp_chat t' if half == 'chat' else ''),
                    kept and not st.get('error') and booted == want and ma.get('asked') == 0,
                    {'start': st, 'booted': booted, 'asked': ma.get('asked')})
    else:
        c.rep.fact(s, '%s: the marks %s the Networking process\'s end (fp_tab %r, fp_chat %r at the new document\'s start); the page '
                   'booted on %s and its hello counted %s place%s asked for (_photoAsked %r)' % (
                       half, 'OUTLIVED' if kept else 'were LOST with', st.get('fp_tab'), st.get('fp_chat'), booted,
                       ma.get('asked'), '' if ma.get('asked') == 1 else 's', ma.get('asked')))
    return {'kept': kept, 'asked': ma.get('asked'), 'booted': booted, 'start': st, 'after': ma}


def scen_log(c):
    for half in ('progress', 'chat'):
        _one(c, S_LOG, half)


def scen_net(c):
    for half in ('progress', 'chat'):
        _one(c, S_NET, half)


SCENARIOS = [
    (S_LOG, scen_log, 50, False, {'roots': 'tabs'}),
    (S_NET, scen_net, 51, False, {'roots': 'tabs'}),
]
