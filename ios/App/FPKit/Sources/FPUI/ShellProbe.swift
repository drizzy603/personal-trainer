#if os(iOS) && DEBUG
import Foundation
import UIKit
import WebKit
import FPCore

/// The native shell scenarios' hands inside the app (Debug builds only; plan task C5, tests/native-shell.sh), as FPHost's
/// StoreProbe is the store's.
///
/// `-fpShellProbe <steps file>` (JSON in `Documents/fp-probe/`) turns it on: `{"phases": [[step, ...], ...]}`, phase k
/// running once the k-th page of this process has sent bootDone, so a step that starts a new document (killWebContent,
/// reload) ends its phase and the next runs on the new page. Every event goes to `Documents/fp-probe/<log>`
/// (`-fpShellProbeLog`, default `shell.jsonl`), one JSON object per line, before the next step starts. The host reads
/// the log (and the app's files) and decides; this only acts and reports.
///
/// Steps: `wait {ms}`, `js {label, src, args}` (an async function body in the page world), `intent {label, name, args}`
/// (through the bridge, counted by the link; "@lastConfirm" stands for the id of the last confirm the page forwarded),
/// `state {label}`, `mark {label, hold}` (the keyboard log starts again; nothing moves for `hold` ms, 1500 by default,
/// while the host screenshots), `killWebContent`, `reload`, `back` (the chat's Back), `edgeBack {progress, finish}`
/// (the edge pan without a finger), `confirm {yes}` and `undo` (taps on the toast window), `blockPage {ms}` (the page's
/// main thread busy), `send {text, nonce}` (the composer's Send), `webResponder` (the web view's content view takes
/// first responder, as a tap into the page does), `nativeFocus` (the native composer takes it), `hook {name, ...}` (one
/// of `ShellBridge.debugHooks`, set by the App), `done`.
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

    private func ms() -> Int { Int(Date().timeIntervalSince(t0) * 1000) }

    // MARK: Log

    func event(_ ev: String, _ fields: [String: Any] = [:]) {
        var o = fields
        o["ev"] = ev
        o["t"] = ms()
        o["wall"] = Int64(Date().timeIntervalSince1970 * 1000)
        o["appState"] = UIApplication.shared.applicationState.rawValue
        let clean = Self.jsonSafe(o)
        guard JSONSerialization.isValidJSONObject(clean),
              var data = try? JSONSerialization.data(withJSONObject: clean, options: [.sortedKeys]) else { return }
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
        event("installed", ["leftWindow": ShellWebView.leftWindowWhileActive])
        armBootFallback()
    }

    func bootDone(page: String) {
        event("bootDone", ["page": page])
        bootWait += 1
        startPhase()
    }

    func pageMessage(_ method: String, _ message: PageMessage) {
        switch message {
        case .model(let push):
            let m = try? CoachModel.decode(push.json)
            event("page", ["method": method, "rev": push.rev, "boot": m?.boot ?? NSNull(), "messages": m?.messages.count ?? -1,
                           "loading": m?.loading ?? NSNull(), "paper": m?.paper ?? NSNull(), "draft": m?.composer.draft?.text ?? NSNull()])
        case .hello(let h):
            event("page", ["method": method, "boot": h.boot ?? NSNull(), "page": h.page, "screens": h.screens])
        case .toast(let t):
            event("page", ["method": method, "text": t.text, "undo": t.undo ?? NSNull()])
        case .confirm(let c):
            lastConfirm = c.id
            event("page", ["method": method, "id": c.id, "title": c.title])
        case .present(let s), .dismiss(let s):
            event("page", ["method": method, "screen": s])
        case .log(let l):
            event("page", ["method": method, "text": l.text])
        case .bootDone(let p):
            event("page", ["method": method, "page": p])
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
            if nextPhase >= phases.count { event("done") }
            return
        }
        let step = steps[i]
        let op = step["op"] as? String ?? ""
        let label = step["label"] ?? NSNull()
        let next: () -> Void = { [weak self] in self?.run(steps, i + 1) }
        let endPhase: () -> Void = { [weak self] in
            self?.running = false
            self?.armBootFallback()
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
            state(label: label) { next() }
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
            let text = step["text"] as? String ?? "probe"
            let nonce = step["nonce"] as? String ?? Intent.nonce()
            event("send", ["text": text, "nonce": nonce])
            b?.screens.hooks.send(.coachSend(text: text, image: nil, usePending: nil, nonce: nonce))
            next()
        case "webResponder":
            // What the owner's tap into the page does first: the web view's content view takes first responder (with
            // hasInitialFocus false nothing else gives it, so a scripted focus alone raises no keyboard).
            let ok = Self.contentView(b?.webView)?.becomeFirstResponder() ?? false
            event("webResponder", ["ok": ok])
            next()
        case "nativeFocus":
            // The native composer takes the keys (a tap into it), to tell the simulator's software keyboard from none.
            let field = b?.screens.firstTextInput()
            let ok = field?.becomeFirstResponder() ?? false
            event("nativeFocus", ["ok": ok, "field": field.map { String(describing: type(of: $0)) } ?? NSNull()])
            next()
        case "hook":
            let name = step["name"] as? String ?? ""
            if let hook = ShellBridge.debugHooks[name] {
                hook(step)
                event("hook", ["name": name, "ran": true])
            } else {
                event("hook", ["name": name, "ran": false])
            }
            next()
        case "done":
            event("done")
            running = false
        default:
            event("unknownStep", ["op": op])
            next()
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

    static let pageStateJS = """
        var ae = document.activeElement, se = document.scrollingElement, vv = window.visualViewport, f = window._fp || {};
        var ph = document.querySelector('#screen > .kt-fp-ph');
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
          model: (typeof coachModel !== 'undefined') ? coachModel : null };
        """

    private func state(label: Any, _ done: @escaping () -> Void) {
        js(Self.pageStateJS, args: [:]) { [weak self] page in
            guard let self else { return }
            let wv = self.bridge.binding?.webView
            var responder = "none"
            if let r = UIResponder.fpCurrent() { responder = String(describing: type(of: r)) }
            let inset = wv?.scrollView.adjustedContentInset.top ?? 0
            self.event("state", ["label": label, "page": page, "shell": self.bridge.describe(), "keyboard": self.keyboard,
                                 "firstResponder": responder, "webResponder": Self.contentView(wv)?.isFirstResponder ?? false,
                                 "webScrollY": Double((wv?.scrollView.contentOffset.y ?? 0) + inset),
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
