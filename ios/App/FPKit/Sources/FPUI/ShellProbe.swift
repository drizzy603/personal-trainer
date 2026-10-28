#if os(iOS) && DEBUG
import Foundation
import UIKit
import WebKit
import FPCore

/// The native shell scenarios' hands inside the app (Debug builds only; plan task C5, tests/native-shell.sh; build 61's
/// tab root: 11-shell.md H11, contract 15.3), as FPHost's StoreProbe is the store's.
///
/// `-fpShellProbe <steps file>` (JSON in `Documents/fp-probe/`) turns it on: `{"phases": [[step, ...], ...]}`, phase k
/// running once the k-th page of this process has sent bootDone, so a step that starts a new document (killWebContent,
/// reload, sceneCycle) ends its phase and the next runs on the new page. Every event goes to `Documents/fp-probe/<log>`
/// (`-fpShellProbeLog`, default `shell.jsonl`), one JSON object per line, before the next step starts. The host reads
/// the log (and the app's files) and decides; this only acts and reports.
///
/// Steps: `wait {ms}`, `js {label, src, args}` (an async function body in the page world), `intent {label, name, args}`
/// (through the bridge, counted by the link; "@lastConfirm" stands for the id of the last confirm the page forwarded),
/// `state {label, a11y}` (`a11y: true` turns the accessibility runtime on first, as a first press does, so the state's
/// `input` carries the label VoiceOver reads), `mark {label, hold}` (the keyboard log starts again; nothing moves for
/// `hold` ms, 1500 by default, while the host screenshots), `killWebContent`, `reload`, `back` (the chat's Back),
/// `edgeBack {progress, finish}` (the edge pan without a finger), `confirm {yes}` and `undo` (taps on the toast
/// window), `blockPage {ms}` (the page's main thread busy), `send {text, nonce}` (these words through the composer's
/// Send), `webResponder` (the web view's content view takes first responder, as a tap into the page does),
/// `nativeFocus` (the top screen's first text input takes it, as a tap into it does: the composer, or the connect
/// screen's key field), `hook {name, ...}` (one of `ShellBridge.debugHooks`, set by the App), and for the live chat
/// (plan task C7): `type {text}` (keys into the top screen's first text input through UIKit's text input, as the
/// keyboard types: the composer or the key field; the text is never logged, only its length; into the key field only
/// while it holds the keys, else an error event that types nothing; into the composer's own draft when the composer
/// does not hold them, `via: draft`), `composerSend {nonce}` (Send on what the composer holds), `draft {text}` (the
/// composer's words set), `press {label}` / `press {ledger: undo|keep}` / `press {label, where: overlay|hub}` (a
/// control of the chat, of the toast window or of the native Coach tab's hub or connect screen, by its accessible name,
/// or the newest PLAN CHANGES card's button; on the hub an error event when the hub is not on screen: Coach not selected
/// or not NATIVE, held blank, covered by the pushed chat or by the shell's confirm, hidden, or out of its window;
/// when no control has the name; or when the activation returns false), `waitCoach {until, ms}` (the chat idle, a
/// reply, a card, none, a confirm, a toast, up, down), `resign` (the native input gives the keys back), `scroll {to:
/// top|end}` (the conversation scrolled; every state reports where it is), `hideWeb` / `showWeb` (the web view out of
/// its window and back: the fault Settings > About counts), `done`.
///
/// The tab root (build 61; contract 15.3 as delta 14.2 changed it): `tapTab {tab}` (a finger's tap on the bar item: the
/// item of the bar whose accessibility label is TabsModel's `a11y`, the controls under the bar that draw its title, and
/// the one of them a finger at their centre lands in, sent `.touchUpInside`: UIKit's tap path through `shouldSelect`,
/// never `accessibilityActivate()` and never `selectedIndex`; where the finger lands is the hit test of the shell's
/// windows in the order a finger meets them, its toast window first (a forwarded confirm fills the screen), then the
/// root's; not found, a bar a sheet or the fallback hid, a finger there that would land on the shell's confirm or
/// outside the bar, or no funnel run of source `tap` after it, is an error event, and nothing is tapped; the keyboard's
/// own windows are not asked), `retapTab` (the same on the selected tab, expecting `again`), `stray {tab}`
/// (`selectedIndex` set directly: the root counts and redirects it, I2's fault injector), `waitTab {tab, ms}` (until
/// the root's selection is `tab`), `navPop` (the Coach stack's finished interactive pop through the latch, as the edge
/// pan's end makes it), `openURL {url}`, `openURLOnActive {url}`, `share {comment?, jpeg?, legacy?}` and `sceneCycle`
/// (the App's hooks of those names: a URL opened through the App delegate now, or when the scene next enters the
/// foreground; a shared photo and comment written to the App Group as the share extension writes them, `jpeg` naming a
/// file beside the steps or none for one drawn in the app, an error event in a build without the group's container
/// unless `legacy` asks for the old base64 slot; the scene's connection replayed, which ends the phase), `sceneDestroy`
/// (UIKit's own request to destroy the scene's session, as StoreProbe's: refused for this app, one scene on an iPhone,
/// `sceneDestroyRefused`, and the phase goes on at the refusal; with no answer in 3 s, `sceneDestroyNoAnswer`, the
/// phase ends and the states that follow say whether what the scene held went; a refusal after that is logged too,
/// `late`). `back`, `edgeBack` and `waitCoach` act on the pushed chat in the Coach tab's stack as on 60's overlay.
///
/// Reports: every event carries `t` (ms since the probe started), `wall` (epoch ms) and `appState`. `state` holds the
/// page's own (`pageStateJS`: the tabs-mode fields 10-page.md section 8 names among them), the shell's (`ShellBridge
/// .describe()`: the link, the screens with each one's `host` and the Coach stack, the tab root's `root`, `leftWindow`
/// and `leftWindowAny`), the keyboard's log, the first responder, and `input`: the top screen's first text input as
/// `{kind: composer|key, focused, hasText, inWindow, a11yOn, a11yLabel}`, never its text; `a11yLabel` is the label
/// VoiceOver reads (delta 14.10), read while the accessibility runtime is on (`a11yOn`: after a press or a `state
/// {a11y: true}`) with UIKit's and SwiftUI's accessibility bundles loaded (only they name a SwiftUI text field), else
/// null. After a `sceneCycle`, or a `sceneDestroy` UIKit did not refuse, every state says whether the web view, the root
/// and the window it replaced are still alive (`replaced {by, webView, root, window}`): a teardown must let them go (the
/// `sceneCycle` event itself, logged in the replay's own turn, says only whether the bridge holds a new web view in a new
/// window). The page's messages are `page` events at their answer, with the shell's receipt time (`recvT` in the
/// probe's ms, `recvWall` in epoch ms), a refused one `pageRefused`; a model event names its screen and decodes only
/// `coach`. The shell's own: `funnel` (every run of the tab root's funnel; the runs before the root was adopted once,
/// `atAdopt`), `screenChanged` (a VoiceOver screen change: `by: root`, the tab root's, with `seq` the funnel run whose
/// step 7 it is, joined to that run's `funnel` event, or null for the Coach tab's mode or the fallback, which no run
/// made, and `why`: `run`, `hold`, `mode`, `fallback`; `by: screens`, ScreenHost's own, a screen up or down or the
/// stack's new top; each with the root's `rootSeq`, selection and Coach mode then), `trovoOpen` (a deep link's
/// `_trovoOpen` returned), `ping` (a confirming ping and its outcome), `fellBack`, `document`, `intent` (PageLink's
/// records: names, keys and outcomes, never arguments). No step's own event carries its text (a `type`, `send` or
/// `draft` step's), and no event the key field's text or an intent's argument (contract 5 K4, D47); the composer's own
/// words, no secret (K4), still appear where build 60's tools read them: the chat store's `draft` in later states'
/// `shell.screens` and a coach model's `draft`.
@MainActor
final class ShellProbe {
    static var shared: ShellProbe?

    unowned let bridge: ShellBridge
    let dir: URL
    let log: FileHandle?
    private var phases: [[[String: Any]]] = []
    private var nextPhase = 0
    private var running = false
    private let t0 = Date()
    private var keyboard: [[String: Any]] = []
    private var observers: [NSObjectProtocol] = []
    private var bootWait = 0
    /// The id of the last confirm the page forwarded (an `intent` step's "@lastConfirm" argument stands for it).
    private var lastConfirm: String?
    /// Where `hideWeb` took the web view from, for `showWeb`.
    private var hiddenWeb: (superview: UIView, index: Int, frame: CGRect)?

    /// What a scene's teardown let go of (the page's web view, the root, the window), held weakly: every later state says
    /// which are still alive (a teardown must let them all go). `by` the step that asked for the teardown.
    @MainActor
    private final class Replaced {
        let by: String
        weak var web: WKWebView?
        weak var root: UIViewController?
        weak var window: UIWindow?
        init(by: String, _ b: ShellBridge.Binding?) {
            self.by = by
            web = b?.webView
            window = b?.webView?.window
            root = b?.tabRoot ?? b?.webView?.window?.rootViewController
        }
        var report: [String: Any] { ["by": by, "webView": web != nil, "root": root != nil, "window": window != nil] }
    }
    /// The newest `sceneCycle`'s, or a `sceneDestroy` UIKit has not refused.
    private var replaced: Replaced?

    /// UIKit's request to destroy the session of `window`'s scene (`sceneDestroy`; tests set their own): the session's id,
    /// nil when the window has no scene; `refused` with UIKit's error when it refuses.
    static var destroySession: @MainActor (_ window: UIWindow?, _ refused: @escaping (Error) -> Void) -> String? = { window, refused in
        guard let scene = window?.windowScene else { return nil }
        UIApplication.shared.requestSceneSessionDestruction(scene.session, options: nil) { refused($0) }
        return scene.session.persistentIdentifier
    }
    /// How long `sceneDestroy` waits for UIKit's refusal before it takes the request as granted (tests shorten it).
    static var destroyWait: TimeInterval = 3

    /// The tests' probe (`init(bridge:sink:)`): every event goes here, as the log line's object, instead of a file.
    private var sink: (([String: Any]) -> Void)?
    /// Said once when the phase `runPhase` started ends (its last step done, or a step that ends the phase).
    private var phaseEnded: (() -> Void)?

    /// Scripts the shell adds at document start while probing: the page's visibilitychange events, counted from the
    /// document's start.
    let documentStartScripts = [
        """
        (function () { window.__fpVis = []; document.addEventListener('visibilitychange', function () { \
        window.__fpVis.push(document.visibilityState + '@' + Math.round(performance.now())); }); })();
        """,
    ]

    static func startIfAsked(bridge: ShellBridge, arguments a: [String]) {
        guard shared == nil, let i = a.firstIndex(of: "-fpShellProbe"), i + 1 < a.count else { return }
        var logName = "shell.jsonl"
        if let j = a.firstIndex(of: "-fpShellProbeLog"), j + 1 < a.count { logName = a[j + 1] }
        shared = ShellProbe(bridge: bridge, steps: a[i + 1], logName: logName)
    }

    private init(bridge: ShellBridge, steps: String, logName: String) {
        self.bridge = bridge
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        dir = docs.appendingPathComponent("fp-probe", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let logURL = dir.appendingPathComponent(logName)
        if !FileManager.default.fileExists(atPath: logURL.path) { FileManager.default.createFile(atPath: logURL.path, contents: nil) }
        log = try? FileHandle(forWritingTo: logURL)
        _ = try? log?.seekToEnd()
        if let data = try? Data(contentsOf: dir.appendingPathComponent(steps)),
           let obj = try? JSONSerialization.jsonObject(with: data) {
            if let d = obj as? [String: Any], let p = d["phases"] as? [[[String: Any]]] { phases = p }
            else if let p = obj as? [[String: Any]] { phases = [p] }
        }
        let nc = NotificationCenter.default
        for (name, word) in [(UIResponder.keyboardWillShowNotification, "willShow"), (UIResponder.keyboardDidShowNotification, "didShow"),
                             (UIResponder.keyboardWillHideNotification, "willHide"), (UIResponder.keyboardDidHideNotification, "didHide")] {
            observers.append(nc.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
                let frame = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue ?? .zero
                MainActor.assumeIsolated {
                    guard let self else { return }
                    self.keyboard.append(["ev": word, "t": self.ms(), "h": Double(frame.height), "y": Double(frame.minY)])
                    self.event("keyboard", ["kb": word, "h": Double(frame.height)])
                }
            })
        }
        event("probe", ["steps": steps, "phases": phases.count, "pid": Int(getpid()), "args": ProcessInfo.processInfo.arguments])
    }

    /// The tests' probe (FPUITests; set it as `shared` before the bridge binds a web view, so the bridge relays to it, and
    /// back to nil after): no steps file, no log file, every event handed to `sink` as the object its log line would hold
    /// (written and read back as JSON, so a field the log could not carry fails there too).
    init(bridge: ShellBridge, sink: @escaping ([String: Any]) -> Void) {
        self.bridge = bridge
        dir = FileManager.default.temporaryDirectory.appendingPathComponent("fp-probe-tests", isDirectory: true)
        log = nil
        self.sink = sink
    }

    /// Runs `steps` now as one phase (the tests' probe); `ended` once its last step is done, or once a step ends the phase
    /// early (a new document, a scene's teardown).
    func runPhase(_ steps: [[String: Any]], ended: @escaping () -> Void) {
        phaseEnded = ended
        running = true
        run(steps, 0)
    }

    private func endedPhase() {
        let ended = phaseEnded
        phaseEnded = nil
        ended?()
    }

    /// Milliseconds since the probe started, at `d`.
    private func ms(_ d: Date = Date()) -> Int { Int(d.timeIntervalSince(t0) * 1000) }

    /// Epoch milliseconds at `d`.
    private static func wall(_ d: Date = Date()) -> Int64 { Int64(d.timeIntervalSince1970 * 1000) }

    // MARK: Log

    func event(_ ev: String, _ fields: [String: Any] = [:]) {
        var o = fields
        o["ev"] = ev
        o["t"] = ms()
        o["wall"] = Self.wall()
        o["appState"] = UIApplication.shared.applicationState.rawValue
        let clean = Self.jsonSafe(o)
        guard JSONSerialization.isValidJSONObject(clean),
              var data = try? JSONSerialization.data(withJSONObject: clean, options: [.sortedKeys]) else { return }
        if let sink {
            if let line = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { sink(line) }
            return
        }
        data.append(0x0A)
        log?.write(data)
    }

    static func jsonSafe(_ v: Any) -> Any {
        switch v {
        case let d as [String: Any]: return d.mapValues { jsonSafe($0) }
        case let a as [Any]: return a.map { jsonSafe($0) }
        case is NSNull, is String, is Bool, is Int, is Int64, is Double, is NSNumber: return v
        case let date as Date: return Int64(date.timeIntervalSince1970 * 1000)
        default: return String(describing: v)
        }
    }

    // MARK: Hooks from the shell

    func installed(webView: WKWebView) {
        event("installed", ["leftWindow": ShellWebView.leftWindowWhileActive, "leftWindowAny": ShellWebView.leftWindowAny])
        armBootFallback()
    }

    func bootDone(page: String) {
        event("bootDone", ["page": page])
        bootWait += 1
        startPhase()
    }

    /// A page message the shell handled, with the moment it reached the shell (contract 15.3: the tools compare it with
    /// the page's own clocks); `refused` when the shell answered it with a refusal (a `pageRefused` event, so the `page`
    /// events stay the messages the shell took).
    func pageMessage(_ method: String, _ message: PageMessage, received: Date, refused: Error? = nil) {
        var o: [String: Any] = ["method": method, "recvT": ms(received), "recvWall": Self.wall(received)]
        switch message {
        case .model(let push):
            o["screen"] = push.screen
            o["rev"] = push.rev
            if push.screen == "coach" {
                let m = try? CoachModel.decode(push.json)
                o["boot"] = m?.boot ?? NSNull()
                o["messages"] = m?.messages.count ?? -1
                o["loading"] = m?.loading ?? NSNull()
                o["paper"] = m?.paper ?? NSNull()
                o["draft"] = m?.composer.draft?.text ?? NSNull()
            }
        case .hello(let h):
            o["boot"] = h.boot ?? NSNull()
            o["page"] = h.page
            o["screens"] = h.screens
            o["v"] = h.v
        case .toast(let t):
            o["text"] = t.text
            o["undo"] = t.undo ?? NSNull()
        case .confirm(let c):
            if refused == nil { lastConfirm = c.id }
            o["id"] = c.id
            o["title"] = c.title
        case .present(let s), .dismiss(let s):
            o["screen"] = s
        case .log(let l):
            o["text"] = l.text
        case .bootDone(let p):
            o["page"] = p
        case .status(let refresh):
            o["refresh"] = refresh
        case .reset(let s):
            o["screen"] = s
        case .visibility(let v):
            o["state"] = v.state
            o["at"] = v.at ?? NSNull()
        case .selectTab(let tab, let intent):
            o["tab"] = tab
            o["intent"] = intent ?? NSNull()
        case .sheets(let open):
            o["open"] = open
        case .setSwitch(let screen, let on):
            o["screen"] = screen
            o["on"] = on
        }
        if let refused {
            o["refused"] = String(describing: refused)
            event("pageRefused", o)
        } else {
            event("page", o)
        }
    }

    func intentRecord(_ r: PageLink.Record) {
        event("intent", ["seq": r.seq, "name": r.name, "boot": r.boot, "key": r.key ?? NSNull(), "sent": r.sent,
                         "outcome": r.outcome ?? NSNull(), "ms": r.ms ?? NSNull()])
    }

    private func armBootFallback(seconds: Double = 30) {
        bootWait += 1
        let gen = bootWait, phase = nextPhase
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) {
            MainActor.assumeIsolated {
                guard gen == self.bootWait, !self.running, self.nextPhase == phase else { return }
                self.event("bootDoneTimeout", ["seconds": seconds])
                self.startPhase()
            }
        }
    }

    private func startPhase() {
        guard !running, nextPhase < phases.count else { return }
        let steps = phases[nextPhase]
        let index = nextPhase
        nextPhase += 1
        running = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            MainActor.assumeIsolated {
                self.event("phase", ["index": index, "steps": steps.count])
                self.run(steps, 0)
            }
        }
    }

    // MARK: Steps

    private func run(_ steps: [[String: Any]], _ i: Int) {
        guard i < steps.count else {
            running = false
            if nextPhase >= phases.count {
                Self.restoreAccessibility()
                event("done")
            }
            endedPhase()
            return
        }
        let step = steps[i]
        let op = step["op"] as? String ?? ""
        let label = step["label"] ?? NSNull()
        let next: () -> Void = { [weak self] in self?.run(steps, i + 1) }
        let endPhase: () -> Void = { [weak self] in
            self?.running = false
            self?.armBootFallback()
            self?.endedPhase()
        }
        let b = bridge.binding
        switch op {
        case "wait":
            let ms = (step["ms"] as? NSNumber)?.doubleValue ?? 500
            DispatchQueue.main.asyncAfter(deadline: .now() + ms / 1000) { next() }
        case "js":
            js(step["src"] as? String ?? "return null", args: step["args"] as? [String: Any] ?? [:]) { [weak self] r in
                self?.event("js", ["label": label, "result": r])
                next()
            }
        case "intent":
            let name = step["name"] as? String ?? ""
            var raw = step["args"] as? [String: Any] ?? [:]
            for (k, v) in raw where (v as? String) == "@lastConfirm" { raw[k] = lastConfirm ?? "" }
            let args = (try? JSONValue(foundation: raw))?.object ?? [:]
            guard b != nil, let intent = try? Intent(name: name, arguments: args) else {
                event("intent-step", ["label": label, "error": "bad intent or no binding"])
                return next()
            }
            bridge.sendCounted(intent) { [weak self] outcome in
                var reply: Any = NSNull()
                if case .answered(.done(let r)) = outcome { reply = r.value.foundation }
                self?.event("intent-step", ["label": label, "name": name, "outcome": outcome.word, "reply": reply])
                next()
            }
        case "state":
            guard step["a11y"] as? Bool == true, !Self.accessibilityOn else {
                state(label: label) { next() }
                return
            }
            // the label VoiceOver reads (delta 14.10): UIKit's and SwiftUI's accessibility bundles loaded and the runtime
            // on, then a moment for SwiftUI to build its elements (as a first press waits); the state then asks the top
            // screen for its elements before it reads the label (SwiftUI names a field only once they were asked for)
            if Self.axBundles == nil { event("axBundles", ["loaded": Self.loadAccessibilityBundles()]) }
            Self.enableAccessibility()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                MainActor.assumeIsolated { self.state(label: label) { next() } }
            }
        case "mark":
            // The keyboard log starts again; the host screenshots this moment, so nothing moves for `hold` ms.
            keyboard = []
            event("mark", ["label": label])
            let hold = (step["hold"] as? NSNumber)?.doubleValue ?? 1500
            DispatchQueue.main.asyncAfter(deadline: .now() + hold / 1000) { next() }
        case "killWebContent":
            event("killWebContent")
            b?.webView?.perform(NSSelectorFromString("_killWebContentProcess"))
            endPhase()
        case "reload":
            event("reload")
            b?.webView?.reload()
            endPhase()
        case "back":
            event("back")
            b?.screens.userBack("coach")
            next()
        case "edgeBack":
            let progress = CGFloat((step["progress"] as? NSNumber)?.doubleValue ?? 0.6)
            let finish = (step["finish"] as? Bool) ?? true
            guard let b else { event("edgeBack", ["started": false]); return next() }
            b.screens.simulateEdgeBack("coach", progress: progress, finish: finish) { [weak self] started in
                self?.event("edgeBack", ["started": started, "progress": Double(progress), "finish": finish])
                next()
            }
        case "confirm":
            let yes = (step["yes"] as? Bool) ?? true
            event("confirm", ["tapped": b?.screens.overlay.tapConfirm(yes) ?? false, "yes": yes])
            next()
        case "undo":
            event("undo", ["tapped": b?.screens.overlay.tapUndo() ?? false])
            next()
        case "blockPage":
            let ms = (step["ms"] as? NSNumber)?.intValue ?? 3000
            event("blockPage", ["ms": ms])
            b?.webView?.evaluateJavaScript("(function(){ var e = Date.now() + \(ms); while (Date.now() < e) {} })(); 0", completionHandler: nil)
            next()
        case "send":
            // the composer's Send with these words (CoachStore: echoed, followed, put back if they never arrive); the
            // event says how many characters went, never which
            let text = step["text"] as? String ?? "probe"
            let nonce = step["nonce"] as? String ?? Intent.nonce()
            var sent = false
            if let store = b?.screens.coach {
                store.draft.text = text
                sent = store.sendComposer(nonce: nonce)
            }
            event("send", ["length": text.count, "nonce": nonce, "sent": sent])
            next()
        case "type":
            event("type", Self.typeKeys(step["text"] as? String ?? "", into: b?.screens.firstTextInput(),
                                        chatUp: b?.screens.isUp("coach") == true, composer: b?.screens.coach))
            next()
        case "composerSend":
            // the composer's Send on what it holds (the chat's button calls the same)
            let nonce = step["nonce"] as? String ?? Intent.nonce()
            let had = b?.screens.coach.draft.text.count ?? 0
            let sent = b?.screens.coach.sendComposer(nonce: nonce) ?? false
            event("composerSend", ["nonce": nonce, "sent": sent, "length": had])
            next()
        case "draft":
            b?.screens.coach.draft.text = step["text"] as? String ?? ""
            event("draft", ["length": b?.screens.coach.draft.text.count ?? NSNull()])
            next()
        case "press":
            press(step, b) { [weak self] fields in
                self?.event("press", fields.merging(["label": label]) { a, _ in a })
                next()
            }
        case "waitCoach":
            let until = step["until"] as? String ?? "idle"
            let ms = (step["ms"] as? NSNumber)?.doubleValue ?? 8000
            waitCoach(until, deadline: Date().addingTimeInterval(ms / 1000), started: Date()) { [weak self] met, waited in
                self?.event("waitCoach", ["label": label, "until": until, "met": met, "ms": waited])
                next()
            }
        case "resign":
            let ok = b?.screens.firstTextInput()?.resignFirstResponder() ?? false
            event("resign", ["ok": ok])
            next()
        case "scroll":
            // The owner scrolls the conversation: to its top, or to its end (as a drag that ends there would leave it).
            let to = step["to"] as? String ?? "top"
            if let s = b?.screens.conversationScroll() {
                let inset = s.adjustedContentInset
                let y = to == "end" ? max(-inset.top, s.contentSize.height + inset.bottom - s.bounds.height) : -inset.top
                // as a finger's drag reaches its scroll view: the move between the drag's own callbacks
                let d = s.delegate
                d?.scrollViewWillBeginDragging?(s)
                s.setContentOffset(CGPoint(x: s.contentOffset.x, y: y), animated: false)
                d?.scrollViewDidScroll?(s)
                var target = s.contentOffset
                withUnsafeMutablePointer(to: &target) { d?.scrollViewWillEndDragging?(s, withVelocity: .zero, targetContentOffset: $0) }
                d?.scrollViewDidEndDragging?(s, willDecelerate: false)
                event("scroll", ["to": to, "state": b?.screens.conversationScrollState() ?? NSNull()])
            } else {
                event("scroll", ["to": to, "error": "no conversation"])
            }
            next()
        case "hideWeb":
            // The fault Settings > About counts (never by design): the web view out of its window while the app is active,
            // as a .fullScreen presentation or a push would take it out (ShellWebView counts it; the page goes hidden).
            if let wv = b?.webView, let sup = wv.superview {
                hiddenWeb = (sup, sup.subviews.firstIndex(of: wv) ?? sup.subviews.count, wv.frame)
                wv.removeFromSuperview()
                event("hideWeb", ["window": wv.window != nil])
            } else {
                event("hideWeb", ["error": "no superview"])
            }
            next()
        case "showWeb":
            if let wv = b?.webView, let h = hiddenWeb {
                h.superview.insertSubview(wv, at: min(h.index, h.superview.subviews.count))
                wv.frame = h.frame
                hiddenWeb = nil
                event("showWeb", ["window": wv.window != nil])
            }
            next()
        case "webResponder":
            // What the owner's tap into the page does first: the web view's content view takes first responder (with
            // hasInitialFocus false nothing else gives it, so a scripted focus alone raises no keyboard).
            let ok = Self.contentView(b?.webView)?.becomeFirstResponder() ?? false
            event("webResponder", ["ok": ok])
            next()
        case "nativeFocus":
            // The top screen's first text input takes the keys (a tap into it): the composer, or the connect screen's key
            // field (contract 5 K4), to tell the simulator's software keyboard from none.
            let field = b?.screens.firstTextInput()
            let ok = field?.becomeFirstResponder() ?? false
            event("nativeFocus", ["ok": ok, "kind": field.map(Self.inputKind) ?? NSNull(),
                                  "field": field.map { String(describing: type(of: $0)) } ?? NSNull()])
            next()
        case "tapTab", "retapTab":
            tapTab(op, step) { [weak self] fields in
                self?.event(op, fields)
                next()
            }
        case "stray":
            event("stray", stray(step["tab"] as? String ?? ""))
            next()
        case "waitTab":
            let tab = step["tab"] as? String ?? ""
            let ms = (step["ms"] as? NSNumber)?.doubleValue ?? 3000
            waitTab(tab, deadline: Date().addingTimeInterval(ms / 1000), started: Date()) { [weak self] met, waited, selected in
                self?.event("waitTab", ["tab": tab, "met": met, "ms": waited, "selected": selected ?? NSNull()])
                next()
            }
        case "navPop":
            // The owner's finished edge pan on the pushed chat in the Coach tab's stack (UIKit's gesture cannot be driven
            // without a finger): the pop's own path through the latch, as the interactive pop's end makes it.
            guard let b, b.screens.stackAttached else {
                event("navPop", ["started": false, "error": "no Coach stack (no live tab root)"])
                return next()
            }
            var depth: Any = NSNull()
            if #available(iOS 26.0, *), let root = tabRoot { depth = root.coachSlot.nav.viewControllers.count }
            b.screens.simulateEdgeBack("coach", progress: 1, finish: true) { [weak self] started in
                var o: [String: Any] = ["started": started, "depthBefore": depth]
                if !started { o["error"] = "no pop: the chat is not on top, or the pop may not begin now" }
                self?.event("navPop", o)
                next()
            }
        case "openURL", "openURLOnActive", "share":
            event(op, runHook(op, step))
            next()
        case "sceneCycle":
            sceneCycle(step, next: next, endPhase: endPhase)
        case "sceneDestroy":
            sceneDestroy(b, next: next, endPhase: endPhase)
        case "hook":
            let name = step["name"] as? String ?? ""
            if name == "sceneCycle" { return sceneCycle(step, next: next, endPhase: endPhase) }
            event("hook", runHook(name, step).merging(["name": name]) { a, _ in a })
            next()
        case "done":
            Self.restoreAccessibility()
            event("done")
            running = false
            endedPhase()
        default:
            event("unknownStep", ["op": op])
            next()
        }
    }

    // MARK: The App's hooks

    /// Runs one of the App's hooks (`ShellBridge.debugHooks`): its own fields (never a typed text or a secret) and `ran`;
    /// an error when the App set none of that name.
    private func runHook(_ name: String, _ step: [String: Any]) -> [String: Any] {
        guard let hook = ShellBridge.debugHooks[name] else {
            return ["ran": false, "error": "the App set no \(name) hook"]
        }
        return hook(step).merging(["ran": true]) { a, _ in a }
    }

    /// `sceneCycle` (contract 15.3): the App's replay of the scene's connection, the closure StoreProbe's `sceneCycle` runs
    /// (SceneDelegate's teardown, then its connection on the same window scene: a new window, a new page, the root the
    /// gate decides). The event names the new root's kind and whether the bridge is bound to a new web view in a new
    /// window; whether the old ones went is for the states that follow (`replaced`), never read in the replay's own turn,
    /// where UIKit may still hold them. The phase ends there, and the next runs once the new page has sent bootDone.
    private func sceneCycle(_ step: [String: Any], next: @escaping () -> Void, endPhase: @escaping () -> Void) {
        // the old page, root and window, held weakly: the replay must be free to let them go
        let old = Replaced(by: "sceneCycle", bridge.binding)
        let r = runHook("sceneCycle", step)
        guard r["error"] == nil else {
            event("sceneCycle", r)
            return next()
        }
        replaced = old
        var o = r
        let web = bridge.binding?.webView
        o["newWebView"] = web != nil && web !== old.web
        o["newWindow"] = web?.window != nil && web?.window !== old.window
        event("sceneCycle", o)
        endPhase()
    }

    /// `sceneDestroy`: UIKit's own request to destroy the scene's session (as StoreProbe's), through `destroySession`.
    /// UIKit refuses it for this app (one scene, an iPhone; the refusal came about 1 s after the request on a loaded
    /// machine): `sceneDestroyRefused`, nothing replaced, and the phase goes on. A scene UIKit lets go says nothing here,
    /// so with no answer in `destroyWait` the request counts as granted: `sceneDestroyNoAnswer`, the phase ends (the next
    /// runs on the page of the scene that connects next), and every later state says whether the page, the root and the
    /// window the scene held went (`replaced`, by `sceneDestroy`). A refusal after that is logged too (`late`), and
    /// `replaced` goes back to what it was.
    private func sceneDestroy(_ b: ShellBridge.Binding?, next: @escaping () -> Void, endPhase: @escaping () -> Void) {
        final class Ask { var refused = false, timedOut = false }
        let ask = Ask()
        let before = replaced
        let asked = Replaced(by: "sceneDestroy", b)
        guard let session = Self.destroySession(b?.webView?.window, { [weak self] e in
            let text = "\(e)"
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    guard let self, !ask.refused else { return }
                    ask.refused = true
                    if self.replaced === asked { self.replaced = before }
                    if ask.timedOut {
                        self.event("sceneDestroyRefused", ["error": text, "late": true])
                    } else {
                        self.event("sceneDestroyRefused", ["error": text])
                        next()
                    }
                }
            }
        }) else {
            event("sceneDestroy", ["error": "no scene"])
            return next()
        }
        replaced = asked
        event("sceneDestroy", ["session": session])
        let wait = Self.destroyWait
        DispatchQueue.main.asyncAfter(deadline: .now() + wait) {
            MainActor.assumeIsolated {
                guard !ask.refused else { return }
                ask.timedOut = true
                self.event("sceneDestroyNoAnswer", ["ms": Int(wait * 1000)])
                endPhase()
            }
        }
    }

    // MARK: The tab root (build 61)

    /// The live scene's tab root, or nil (a classic root, or below iOS 26).
    @available(iOS 26.0, *)
    private var tabRoot: RootTabController? { bridge.binding?.tabRoot as? RootTabController }

    /// What the bar draws for a tab (contract 15.3 as delta 14.2 changed it): the item of the bar whose accessibility label
    /// is the model's `a11y` for the tab, then the controls under the bar that draw that item's title (a UILabel with that
    /// text; UIKit draws each item twice on iOS 26 and 27), in the bar's order. Never by a control's own accessibility
    /// label (UIKit fills it lazily) or by class name (they differ between 26.5 and 27.0). `why` says what was missing.
    @available(iOS 26.0, *)
    static func tabControls(_ root: RootTabController, _ tab: String) -> (controls: [UIControl], why: String?) {
        guard let a11y = root.look.item(tab)?.a11y else { return ([], "the tab model has no item \(tab)") }
        guard let item = root.tabBar.items?.first(where: { $0.accessibilityLabel == a11y }) else {
            return ([], "no bar item labelled \(a11y)")
        }
        guard let title = item.title, !title.isEmpty else { return ([], "the bar item labelled \(a11y) has no title") }
        func draws(_ v: UIView) -> Bool {
            if let l = v as? UILabel, l.text == title { return true }
            return v.subviews.contains(where: draws)
        }
        var found: [UIControl] = []
        func walk(_ v: UIView) {
            if let c = v as? UIControl, draws(c) {
                found.append(c)
                return
            }
            v.subviews.forEach(walk)
        }
        walk(root.tabBar)
        return (found, found.isEmpty ? "no control under the bar draws \(title)" : nil)
    }

    /// Where a finger on the tab's item lands (delta 14.2; the H11 review, rounds 1 and 2): no control while the bar is
    /// hidden (a sheet is open, or the root fell back) or the root is not in a window; else the point at the centre of the
    /// first control that draws the item's title is hit-tested in the windows a finger meets before the root's, `over`
    /// (top first: the shell's toast window, whose forwarded confirm fills the screen with its buttons over the bar's
    /// place and a backdrop that cancels on a tap; a toast's strip takes only its own place), where any hit stops the tap,
    /// then in the root's window, where it must land inside the bar and in one of those controls (UIKit draws each item
    /// twice: the hit picks the copy a finger reaches). The keyboard's own windows are not asked (T19 taps a tab while the
    /// keys are up), and a view over the bar inside the root's window (a presented controller) stops the tap as it would
    /// stop a finger. `copies` the controls that draw the title, `why` what stopped.
    @available(iOS 26.0, *)
    static func tapTarget(_ root: RootTabController, _ tab: String, over: [(window: UIWindow, name: String)] = [])
        -> (control: UIControl?, copies: Int, why: String?) {
        let found = tabControls(root, tab)
        let copies = found.controls.count
        guard let first = found.controls.first else { return (nil, 0, found.why ?? "not found") }
        guard !root.isTabBarHidden else {
            return (nil, copies, "the bar is hidden (a sheet is open, or the root fell back): no finger can tap \(tab)")
        }
        guard let window = root.view.window else { return (nil, copies, "the tab root is not in a window") }
        let centre = first.convert(CGPoint(x: first.bounds.midX, y: first.bounds.midY), to: window)
        // a window over the root's takes the finger wherever its own hit test answers (the point carried into its space)
        for o in over where o.window !== window {
            if let hit = o.window.hitTest(window.convert(centre, to: o.window), with: nil) {
                let on = String(describing: type(of: hit))
                return (nil, copies, "a finger on \(tab) lands on \(o.name) over the bar (on \(on))")
            }
        }
        let landed = window.hitTest(centre, with: nil)
        guard let hit = landed, hit.isDescendant(of: root.tabBar) else {
            let on = landed.map { String(describing: type(of: $0)) } ?? "nothing"
            return (nil, copies, "a finger on \(tab) lands outside the bar (on \(on))")
        }
        guard let control = found.controls.first(where: { hit.isDescendant(of: $0) }) else {
            return (nil, copies, "a finger on \(tab) lands in the bar outside the controls that draw its title")
        }
        return (control, copies, nil)
    }

    /// `tapTab {tab}` / `retapTab`: the control a finger on the tab's item lands in (`tapTarget`, over the shell's own
    /// windows), sent `.touchUpInside`; `activated` when one funnel run of source `tap` follows (within 1 s), and for
    /// `retapTab` when that run is the re-tap (`again`). Nothing a finger could not reach is tapped.
    private func tapTab(_ op: String, _ step: [String: Any], done: @escaping ([String: Any]) -> Void) {
        guard #available(iOS 26.0, *), let root = tabRoot else {
            return done(["tab": step["tab"] ?? NSNull(), "activated": false, "error": "no tab root (the scene's root is classic)"])
        }
        let again = op == "retapTab"
        let tab = again ? root.selected : (step["tab"] as? String ?? "")
        guard ShellTabs.isTab(tab) else { return done(["tab": tab, "activated": false, "error": "no tab \(tab)"]) }
        let target = Self.tapTarget(root, tab, over: shellWindowsOver())
        guard let control = target.control else {
            return done(["tab": tab, "activated": false, "copies": target.copies, "selected": root.selected, "seq": root.seq,
                         "error": target.why ?? "not found"])
        }
        let seq0 = root.seq
        control.sendActions(for: .touchUpInside)
        waitRun(root, after: seq0, deadline: Date().addingTimeInterval(1)) { runs in
            var o: [String: Any] = ["tab": tab, "copies": target.copies, "selected": root.selected, "seq": root.seq,
                                    "runs": runs.map(\.json), "strays": root.strays]
            let taps = runs.filter { $0.source == .tap }
            if runs.count == 1, let run = taps.first {
                o["again"] = !run.moved
                if again, run.moved {
                    o["activated"] = false
                    o["error"] = "the re-tap moved the selection"
                } else {
                    o["activated"] = true
                }
            } else {
                o["activated"] = false
                o["error"] = runs.isEmpty ? "no funnel run followed"
                    : "\(runs.count) funnel runs followed (\(runs.map(\.source.word).joined(separator: ", ")))"
            }
            done(o)
        }
    }

    /// The shell's own windows over the root's, top first (`tapTarget`'s `over`): ScreenHost's toast window while it shows
    /// something (level normal + 1, made key while a confirm is open), named for what fills it. The app makes no other
    /// window; UIKit's keyboard windows are not the shell's and are not asked.
    private func shellWindowsOver() -> [(window: UIWindow, name: String)] {
        guard let overlay = bridge.binding?.screens.overlay, let w = overlay.windowView as? UIWindow else { return [] }
        return [(w, overlay.confirm != nil ? "the shell's confirm" : "the shell's toast")]
    }

    /// The funnel runs with a seq above `seq0`, once there is one or at the deadline (UIKit's tap path runs the funnel in
    /// the control's own call; the wait is for a runtime that would not).
    @available(iOS 26.0, *)
    private func waitRun(_ root: RootTabController, after seq0: Int, deadline: Date, _ done: @escaping ([RootTabController.FunnelRun]) -> Void) {
        let runs = root.funnelRuns.filter { $0.seq > seq0 }
        if !runs.isEmpty || Date() >= deadline { return done(runs) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.02) { [weak root] in
            MainActor.assumeIsolated {
                guard let root else { return done([]) }
                self.waitRun(root, after: seq0, deadline: deadline, done)
            }
        }
    }

    /// `stray {tab}` (I2's fault injector): the root's `selectedIndex` set directly, as no route of the app does; the root
    /// counts it and redirects it through the funnel.
    private func stray(_ tab: String) -> [String: Any] {
        guard #available(iOS 26.0, *), let root = tabRoot else {
            return ["tab": tab, "error": "no tab root (the scene's root is classic)"]
        }
        guard let i = ShellTabs.ids.firstIndex(of: tab) else { return ["tab": tab, "error": "no tab \(tab)"] }
        let strays0 = root.strays, seq0 = root.seq
        root.selectedIndex = i
        return ["tab": tab, "counted": root.strays - strays0, "strays": root.strays, "selected": root.selected, "seq": root.seq,
                "runs": root.funnelRuns.filter { $0.seq > seq0 }.map(\.json)]
    }

    /// `waitTab {tab, ms}`: polls every 50 ms until the root's selection is `tab`, or the deadline.
    private func waitTab(_ tab: String, deadline: Date, started: Date, _ done: @escaping (Bool, Int, String?) -> Void) {
        var selected: String?
        if #available(iOS 26.0, *) { selected = tabRoot?.selected }
        let waited = Int(Date().timeIntervalSince(started) * 1000)
        if selected == tab || Date() >= deadline { return done(selected == tab, waited, selected) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            MainActor.assumeIsolated { self.waitTab(tab, deadline: deadline, started: started, done) }
        }
    }

    // MARK: Text inputs

    /// The kind of a native text input (contract 15.3): the connect screen's key field is the only secure one.
    static func inputKind(_ v: UIView) -> String {
        if let f = v as? UITextField, f.isSecureTextEntry { return "key" }
        if let t = v as? UITextView, t.isSecureTextEntry { return "key" }
        return "composer"
    }

    /// `type {text}` (contract 5 K4, D47) into `field`, the top screen's first text input: keys through UIKit's text input,
    /// as the keyboard types, while it holds them. The key field never takes them any other way (an error event, nothing
    /// typed, no draft written); the composer, when it does not hold them, gets them in its own draft while the chat is
    /// up (`chatUp`; its words are no secret, `composer` the chat's store). The event's fields: the text's length, the
    /// input's kind, `via` (`keys`, `draft`) or `error`; never the text.
    static func typeKeys(_ text: String, into field: UIView?, chatUp: Bool, composer: CoachStore?) -> [String: Any] {
        var o: [String: Any] = ["length": text.count]
        if let field {
            let kind = inputKind(field)
            o["kind"] = kind
            if field.isFirstResponder, let input = field as? UIKeyInput {
                input.insertText(text)
                o["via"] = "keys"
                return o
            }
            if kind == "key" {
                o["error"] = "the key field does not hold the keys: nothing typed"
                return o
            }
        } else if !chatUp {
            o["error"] = "no text input on the top screen: nothing typed"
            return o
        }
        guard let composer else {
            o["error"] = "no binding: nothing typed"
            return o
        }
        composer.draft.text += text
        o["kind"] = "composer"
        o["via"] = "draft"
        return o
    }

    /// The top screen's first text input as the state reports it (contract 15.3, delta 14.10): its kind, whether it holds
    /// the keys, whether it is in a window, whether it holds text (`UIKeyInput.hasText`) and, when `spoken` (the
    /// accessibility runtime is on, its bundles loaded), the label VoiceOver reads (`a11yOn` says which); never its text.
    static func inputReport(_ field: UIView?, spoken: Bool = true) -> Any {
        guard let field else { return NSNull() }
        let hasText: Bool = (field as? UIKeyInput)?.hasText ?? false
        var label: Any = NSNull()
        if spoken, let spokenLabel = Self.spokenLabel(field) { label = spokenLabel }
        return ["kind": Self.inputKind(field), "focused": field.isFirstResponder, "hasText": hasText,
                "inWindow": field.window != nil, "field": String(describing: type(of: field)), "a11yOn": spoken,
                "a11yLabel": label]
    }

    /// UIKit's and SwiftUI's accessibility bundles, once loaded into this process (nil until tried).
    private static var axBundles: [String]?

    /// Loads UIKit's and SwiftUI's accessibility bundles into this process, once (delta 14.10, as N7's probe did): only they
    /// compute the label VoiceOver reads for a SwiftUI text field, whose own `accessibilityLabel` stays nil. Under the
    /// simulator they sit in the runtime's root. Answers the bundles loaded.
    @discardableResult
    static func loadAccessibilityBundles() -> [String] {
        if let done = axBundles { return done }
        let base = (ProcessInfo.processInfo.environment["IPHONE_SIMULATOR_ROOT"] ?? "") + "/System/Library/AccessibilityBundles/"
        var loaded: [String] = []
        for name in ["UIKit", "SwiftUI"] {
            if let bundle = Bundle(path: base + name + ".axbundle"), bundle.isLoaded || bundle.load() { loaded.append(name) }
        }
        axBundles = loaded
        return loaded
    }

    /// The label VoiceOver reads for `v` (delta 14.10): what the accessibility runtime asks it for
    /// (`_accessibilityAXAttributedLabel`, answered by the accessibility bundles), else its `accessibilityLabel`; nil when
    /// it has none. Never its value or its text.
    static func spokenLabel(_ v: NSObject) -> String? {
        let sel = NSSelectorFromString("_accessibilityAXAttributedLabel")
        if v.responds(to: sel), let r = v.perform(sel)?.takeUnretainedValue() {
            if let a = r as? NSAttributedString, !a.string.isEmpty { return a.string }
            if let s = r as? String, !s.isEmpty { return s }
        }
        guard let l = v.accessibilityLabel, !l.isEmpty else { return nil }
        return l
    }

    // MARK: Presses and waits on the live chat (plan task C7) and the native Coach tab

    /// A press on a control, as the owner's finger would make it: first the control's own accessibility element by its
    /// label (`accessibilityActivate`, which runs the control's action, as VoiceOver's double tap does; the probe turns the
    /// accessibility runtime on for it), else what that control sends, built from the model as the control builds it and
    /// sent through the chat's store; `via` says which, and `matches` how many elements carry the label.
    /// - `{label}`: a control of the chat by its accessible name ("Send message", "Back", "Stop the reply", the model
    ///   switch's name);
    /// - `{ledger: "undo"|"keep"}`: the newest PLAN CHANGES card's Undo, or its Keep changes (or Got it);
    /// - `{label, where: "overlay"}`: a button of the forwarded confirm in the toast window (its confirm or cancel label);
    /// - `{label, where: "hub"}`: a control of the native Coach tab's hub or connect screen (contract 6.2: a row by its
    ///   title, the CTA by its label, the starter link by its label), through its accessibility element only (`pressHub`).
    private func press(_ step: [String: Any], _ b: ShellBridge.Binding?, done: @escaping ([String: Any]) -> Void) {
        if step["where"] as? String == "hub" { return pressHub(step, b, done: done) }
        if !Self.accessibilityOn {
            // the first press: SwiftUI builds its elements once the runtime is on
            Self.enableAccessibility()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                MainActor.assumeIsolated { self.press(step, b, done: done) }
            }
            return
        }
        guard let screens = b?.screens else { return done(["pressed": false, "why": "no binding"]) }
        if step["where"] as? String == "overlay" {
            let label = step["label"] as? String ?? ""
            guard let c = screens.overlay.confirm else { return done(["pressed": false, "why": "no confirm open"]) }
            if let root = screens.overlay.windowView {
                let found = Self.axFindAll(label, in: root)
                if let el = found.first, el.accessibilityActivate() {
                    return done(["pressed": true, "via": "accessibility", "matches": found.count, "control": label])
                }
            }
            guard label == c.confirm || label == c.cancel else { return done(["pressed": false, "why": "the confirm has no \(label)"]) }
            return done(["pressed": screens.overlay.tapConfirm(label == c.confirm), "via": "model", "control": label])
        }
        let store = screens.coach
        guard let m = store.display, screens.isUp("coach") else { return done(["pressed": false, "why": "the chat is not up"]) }
        var label = step["label"] as? String ?? ""
        var fallback: (() -> Bool)?
        if let which = step["ledger"] as? String {
            let kind = ModelAction.Kind(which)
            guard let msg = m.messages.last(where: { $0.ledger != nil }), let l = msg.ledger,
                  let a = l.actions.first(where: { $0.kind == kind }), let intent = a.intent(messageID: msg.id) else {
                return done(["pressed": false, "why": "no card offers \(which)"])
            }
            label = a.label
            fallback = { store.handle(intent); return true }
        } else {
            switch label {
            case "Send message": fallback = { store.sendComposer() }
            case "Back": fallback = { store.handle(.coachBack); return true }
            case "Stop the reply": fallback = { store.handle(.coachStop); return true }
            default:
                if let sw = m.header.model, sw.a11y == label || sw.label == label { fallback = { store.handle(sw.intent); return true } }
            }
        }
        var matches = 0
        if let root = screens.hostView("coach") {
            let found = Self.axFindAll(label, in: root)
            matches = found.count
            if let el = found.first, el.accessibilityActivate() {
                return done(["pressed": true, "via": "accessibility", "matches": matches, "control": label])
            }
        }
        guard let fallback else { return done(["pressed": false, "matches": matches, "why": "no control named \(label)"]) }
        done(["pressed": fallback(), "via": "model", "matches": matches, "control": label])
    }

    /// The screen on top (the one whose first text input the state reports): in the Coach tab's stack its top
    /// controller's view (the pushed chat, or the hub), else the chat's overlay.
    private func topScreenView() -> UIView? {
        let b = bridge.binding
        if #available(iOS 26.0, *), b?.screens.stackAttached == true, let root = tabRoot {
            return root.coachSlot.nav.topViewController?.viewIfLoaded
        }
        return b?.screens.hostView("coach")
    }

    /// `press {label, where: "hub"}`: the hub's control of that accessibility label, activated through its element, only
    /// while the owner sees the hub (`hubCheck`). Every failure is an error event that presses nothing: no hub on screen
    /// or the shell's confirm over it (said before the accessibility runtime is turned on, and checked again after
    /// the first press's wait for it), no control of that name, an activation that returns false. `why` repeats
    /// `error` (the chat's presses say `why`).
    private func pressHub(_ step: [String: Any], _ b: ShellBridge.Binding?, done: @escaping ([String: Any]) -> Void) {
        let label = step["label"] as? String ?? ""
        func failed(_ words: String, matches: Int = 0) {
            done(["pressed": false, "where": "hub", "matches": matches, "control": label, "error": words, "why": words])
        }
        let target = hubTarget(b)
        guard let hub = target.view else { return failed(target.why ?? "no hub") }
        if !Self.accessibilityOn {
            // the first press: SwiftUI builds its elements once the runtime is on; the hub is checked again after
            Self.enableAccessibility()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                MainActor.assumeIsolated { self.pressHub(step, b, done: done) }
            }
            return
        }
        let found = Self.axFindAll(label, in: hub)
        guard let el = found.first else { return failed("no control named \(label)") }
        guard el.accessibilityActivate() else { return failed("activation returned false", matches: found.count) }
        done(["pressed": true, "via": "accessibility", "where": "hub", "matches": found.count, "control": label])
    }

    /// The hub `press {where: "hub"}` may press, or why none: the binding's tab root through `hubCheck`, with ScreenHost's
    /// `coachHome` host (H10) as the hub when there is one, else the home the root's Coach stack holds at its
    /// bottom, and whether the shell's confirm is open over it (ScreenHost's `openConfirm`).
    private func hubTarget(_ b: ShellBridge.Binding?) -> (view: UIView?, why: String?) {
        guard let b else { return (nil, "no binding") }
        guard #available(iOS 26.0, *), let root = b.tabRoot as? RootTabController else {
            return (nil, "no hub: no tab root (the scene's root is classic)")
        }
        return Self.hubCheck(root, hosted: b.screens.hostView("coachHome"), confirmOpen: b.screens.openConfirm != nil)
    }

    /// Whether the owner sees the native Coach tab's hub, the one `hosted` (ScreenHost's `coachHome` host, H10) or else the
    /// home at the bottom of the Coach stack: the tab NATIVE and selected, not held blank for a push on its way, the hub
    /// the stack's top (not covered by the pushed chat), every view up to the window shown, in a window, and no
    /// confirm of the shell's open over it (`confirmOpen`, delta 17.13: a forwarded confirm fills the screen from the
    /// toast window and ScreenHost hides the stack from VoiceOver under it, so neither a finger nor VoiceOver reaches
    /// the hub, though the accessibility walk would). A press anywhere else would send what the owner cannot.
    @available(iOS 26.0, *)
    static func hubCheck(_ root: RootTabController, hosted: UIView?,
                         confirmOpen: Bool = false) -> (view: UIView?, why: String?) {
        guard root.fellBack == nil else { return (nil, "no hub: the tab root fell back") }
        guard root.coachMode == .native else { return (nil, "no hub: the Coach tab is \(root.coachMode.rawValue), not native") }
        guard root.selected == "coach" else { return (nil, "the hub is not on screen: \(root.selected) is selected") }
        guard !root.held else { return (nil, "the hub is not on screen: the Coach tab is held blank for a push") }
        guard let hub = hosted ?? root.coachSlot.home?.viewIfLoaded else { return (nil, "no hub view") }
        guard let top = root.coachSlot.nav.topViewController?.viewIfLoaded, hub === top || hub.isDescendant(of: top) else {
            return (nil, "the hub is covered: the chat is pushed over it")
        }
        var v: UIView? = hub
        while let x = v {
            if x.isHidden || x.alpha < 0.01 { return (nil, "the hub is not on screen: hidden") }
            v = x.superview
        }
        guard hub.window != nil else { return (nil, "the hub is not on screen: out of its window") }
        guard !confirmOpen else { return (nil, "the hub is covered: the shell's confirm is open") }
        return (hub, nil)
    }

    private static var accessibilityOn = false
    /// The switches as they were before the probe turned them on: (setter, getter, value).
    private static var accessibilityWas: [(String, Int32)] = []
    private static let accessibilitySwitches = [("_AXSSetAutomationEnabled", "_AXSAutomationEnabled"),
                                                ("_AXSApplicationAccessibilitySetEnabled", "_AXSApplicationAccessibilityEnabled")]

    /// Turns the accessibility runtime on in this process, as the accessibility inspector and XCTest do, so SwiftUI
    /// vends its elements and a press can go through a control's own action (Debug builds' probe only). The simulator's
    /// switches go back as they were when the probe is done (`restoreAccessibility`).
    static func enableAccessibility() {
        guard !accessibilityOn else { return }
        accessibilityOn = true
        guard let lib = dlopen("/usr/lib/libAccessibility.dylib", RTLD_NOW) else { return }
        typealias Get = @convention(c) () -> Int32
        typealias Set = @convention(c) (Int32) -> Void
        for (setter, getter) in accessibilitySwitches {
            guard let set = dlsym(lib, setter) else { continue }
            let was = dlsym(lib, getter).map { unsafeBitCast($0, to: Get.self)() } ?? 0
            accessibilityWas.append((setter, was))
            unsafeBitCast(set, to: Set.self)(1)
        }
    }

    static func restoreAccessibility() {
        guard accessibilityOn, let lib = dlopen("/usr/lib/libAccessibility.dylib", RTLD_NOW) else { return }
        typealias Set = @convention(c) (Int32) -> Void
        for (setter, was) in accessibilityWas {
            if let set = dlsym(lib, setter) { unsafeBitCast(set, to: Set.self)(was) }
        }
        accessibilityWas = []
        accessibilityOn = false
    }

    /// The accessibility element with this label under `root` (SwiftUI's own elements of the hosting view included).
    static func axFind(_ label: String, in root: NSObject, depth: Int = 0) -> NSObject? {
        guard depth < 48 else { return nil }
        if root.isAccessibilityElement, root.accessibilityLabel == label { return root }
        var kids: [Any] = []
        if let els = root.accessibilityElements {
            kids += els
        } else {
            let n = root.accessibilityElementCount()
            if n > 0, n != NSNotFound { for i in 0..<n { if let e = root.accessibilityElement(at: i) { kids.append(e) } } }
        }
        if let v = root as? UIView { kids += v.subviews }
        for k in kids {
            if let o = k as? NSObject, o !== root, let f = axFind(label, in: o, depth: depth + 1) { return f }
        }
        return nil
    }

    /// Every accessibility element with this label under `root`, each once, in `axFind`'s order (its first is `axFind`'s):
    /// how many the owner's VoiceOver would find by that name.
    static func axFindAll(_ label: String, in root: NSObject) -> [NSObject] {
        var found: [NSObject] = []
        var seen = Set<ObjectIdentifier>()
        func walk(_ o: NSObject, _ depth: Int) {
            guard depth < 48, seen.insert(ObjectIdentifier(o)).inserted else { return }
            if o.isAccessibilityElement, o.accessibilityLabel == label {
                found.append(o)
                return
            }
            var kids: [Any] = []
            if let els = o.accessibilityElements {
                kids += els
            } else {
                let n = o.accessibilityElementCount()
                if n > 0, n != NSNotFound { for i in 0..<n { if let e = o.accessibilityElement(at: i) { kids.append(e) } } }
            }
            if let v = o as? UIView { kids += v.subviews }
            for k in kids { if let c = k as? NSObject { walk(c, depth + 1) } }
        }
        walk(root, 0)
        return found
    }

    /// Waits until the chat says `until` (polling every 150 ms) or the deadline: "idle" (no reply in flight, nothing on
    /// its way), "reply" (that, and the newest message is the coach's reply), "ledger" (that reply carries PLAN
    /// CHANGES), "noLedger" (no card shows), "loading" (a reply in flight: Thinking, Stop), "confirm" / "toast" (one
    /// shows in the toast window), "up" / "down".
    private func waitCoach(_ until: String, deadline: Date, started: Date, _ done: @escaping (Bool, Int) -> Void) {
        let met = coachSays(until)
        let waited = Int(Date().timeIntervalSince(started) * 1000)
        if met || Date() >= deadline { return done(met, waited) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            MainActor.assumeIsolated { self.waitCoach(until, deadline: deadline, started: started, done) }
        }
    }

    private func coachSays(_ until: String) -> Bool {
        guard let screens = bridge.binding?.screens else { return false }
        let store = screens.coach
        let idle = store.display.map { !$0.loading } == true && store.echoes.isEmpty
        switch until {
        case "idle": return idle
        case "reply": return idle && store.display?.messages.last?.look == .reply
        case "ledger": return idle && store.display?.messages.last(where: { $0.role != .user })?.ledger != nil
        case "noLedger": return idle && store.display?.messages.contains(where: { $0.ledger != nil }) == false
        case "loading": return store.display?.loading == true
        case "confirm": return screens.openConfirm != nil
        case "toast": return screens.shownToast != nil
        case "up": return screens.isUp("coach")
        case "down": return !screens.isUp("coach")
        default: return false
        }
    }

    /// WebKit's content view inside the web view's scroll view (the view that holds first responder for the page).
    static func contentView(_ webView: WKWebView?) -> UIView? {
        webView?.scrollView.subviews.first { NSStringFromClass(type(of: $0)).hasPrefix("WKContent") }
    }

    /// Runs an async function body in the page world; the JSON result comes back (or an error string).
    private func js(_ src: String, args: [String: Any], _ done: @escaping (Any) -> Void) {
        guard let wv = bridge.binding?.webView else { done(["error": "no web view"]); return }
        let body = "var __r = await (async function () { \(src)\n })(); return JSON.stringify(__r === undefined ? null : __r);"
        wv.callAsyncJavaScript(body, arguments: ["args": args], in: nil, in: .page) { result in
            switch result {
            case .success(let v):
                if let s = v as? String, let data = s.data(using: .utf8),
                   let obj = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) {
                    done(obj)
                } else {
                    done(v)
                }
            case .failure(let e):
                done(["error": "\(e)"])
            }
        }
    }

    /// The page's state for `state` events. Build 61's tabs-mode fields use the names 10-page.md section 8 fixes:
    /// `tabsMode` (`_fp.tabs.mode`), `tabsLeft`/`tabsWhy`, `fpTabsClass` (`html.fp-tabs`), `tabsDisplay` (`#tabs`'
    /// computed display), `vars` (the computed `--fp-bar-h`, `--fp-safe-b`, `--fp-clear`, `--fp-bar-up` and `--fp-sheet-b`
    /// in CSS px, null when unset), `zoom` (the Larger Text zoom), `lastOpen` (`kt_last_open`), `visitFrom`, `awayFrom`,
    /// `screenChild` (whether `#screen` has an element child), `phScreen` (the placeholder's `data-fp-screen`), `seqSeen`
    /// (`_fp.tabs.seq`), `coachMode` (`_fpCoachMode()`), `sheetsOpen` and `holds` (the open `_SHEETS_SEL` nodes and the
    /// `.fp-hold` ones), `fpTab` (`sessionStorage.fp_tab`).
    static let pageStateJS = """
        var ae = document.activeElement, se = document.scrollingElement, vv = window.visualViewport, f = window._fp || {};
        var ph = document.querySelector('#screen > .kt-fp-ph');
        var de = document.documentElement, cs = getComputedStyle(de), T = f.tabs || {};
        var px = function (n) { var x = parseFloat(cs.getPropertyValue(n)); return isNaN(x) ? null : x; };
        var tabsEl = document.getElementById('tabs'), scr = document.getElementById('screen');
        var lastOpen = null, fpTab = null;
        try { var lo = localStorage.getItem('kt_last_open'); lastOpen = lo === null ? null : parseFloat(lo); } catch (e) {}
        try { fpTab = sessionStorage.getItem('fp_tab'); } catch (e) {}
        return { vis: document.visibilityState, visEvents: window.__fpVis || null, focusDoc: document.hasFocus(),
          flag: window.__FP_SHELL || null,
          active: ae ? (ae.tagName + (ae.id ? '#' + ae.id : '')) : null,
          scrollY: window.scrollY, scrollTop: se ? se.scrollTop : null, innerHeight: window.innerHeight,
          vv: vv ? { top: vv.offsetTop, h: vv.height, scale: vv.scale } : null,
          fp: { hello: f.hello || null, shown: f.shown || null, covered: !!f.covered, off: f.off || null, v: f.v || 0,
                boot: (typeof _fpBoot !== 'undefined') ? _fpBoot : null },
          tab: (typeof currentTab !== 'undefined') ? currentTab : null, view: (typeof coachView !== 'undefined') ? coachView : null,
          ph: !!ph, webChat: !!document.getElementById('coach-input'),
          msgs: (typeof coachMessages !== 'undefined') ? coachMessages.length : -1,
          texts: (typeof coachMessages !== 'undefined') ? coachMessages.slice(-6).map(function (m) {
            return (m.role || '') + ':' + String(typeof m.content === 'string' ? m.content : '').slice(0, 60); }) : [],
          loading: (typeof coachLoading !== 'undefined') ? !!coachLoading : null,
          model: (typeof coachModel !== 'undefined') ? coachModel : null,
          tabsMode: !!T.mode, tabsLeft: !!T.left, tabsWhy: T.why || '', fpTabsClass: de.classList.contains('fp-tabs'),
          tabsDisplay: tabsEl ? getComputedStyle(tabsEl).display : null,
          vars: { barH: px('--fp-bar-h'), safeB: px('--fp-safe-b'), clear: px('--fp-clear'), barUp: px('--fp-bar-up'),
                  sheetB: px('--fp-sheet-b') },
          zoom: parseFloat(de.style.zoom) || 1, lastOpen: lastOpen,
          visitFrom: (typeof _visitFrom !== 'undefined') ? _visitFrom : null,
          awayFrom: (typeof _awayFrom !== 'undefined') ? _awayFrom : null,
          screenChild: !!(scr && scr.firstElementChild), phScreen: ph ? ph.getAttribute('data-fp-screen') : null,
          seqSeen: T.seq || 0, coachMode: (typeof _fpCoachMode === 'function') ? _fpCoachMode() : null,
          sheetsOpen: (typeof _SHEETS_SEL !== 'undefined') ? document.querySelectorAll(_SHEETS_SEL).length : null,
          holds: document.querySelectorAll('.fp-hold').length, fpTab: fpTab };
        """

    private func state(label: Any, _ done: @escaping () -> Void) {
        js(Self.pageStateJS, args: [:]) { [weak self] page in
            guard let self else { return }
            let wv = self.bridge.binding?.webView
            var responder = "none"
            if let r = UIResponder.fpCurrent() { responder = String(describing: type(of: r)) }
            let inset = wv?.scrollView.adjustedContentInset.top ?? 0
            let field = self.bridge.binding?.screens.firstTextInput()
            if field != nil, Self.accessibilityOn {
                if Self.axBundles == nil { self.event("axBundles", ["loaded": Self.loadAccessibilityBundles()]) }
                // SwiftUI vends a screen's elements when an assistive client first asks for them: ask, as VoiceOver would
                if let top = self.topScreenView() { _ = Self.axFindAll("", in: top) }
            }
            let input = Self.inputReport(field, spoken: Self.accessibilityOn)
            self.event("state", ["label": label, "page": page, "shell": self.bridge.describe(), "keyboard": self.keyboard,
                                 "firstResponder": responder, "webResponder": Self.contentView(wv)?.isFirstResponder ?? false,
                                 "webScrollY": Double((wv?.scrollView.contentOffset.y ?? 0) + inset), "input": input,
                                 "replaced": self.replaced?.report ?? NSNull(),
                                 "keyWindow": String(describing: UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first.map { type(of: $0) })])
            done()
        }
    }
}

private weak var fpFirstResponder: UIResponder?

extension UIResponder {
    /// The first responder now (the probe's: which view has the keyboard).
    static func fpCurrent() -> UIResponder? {
        fpFirstResponder = nil
        UIApplication.shared.sendAction(#selector(fpCapture), to: nil, from: nil, for: nil)
        return fpFirstResponder
    }

    @objc private func fpCapture() { fpFirstResponder = self }
}
#endif
