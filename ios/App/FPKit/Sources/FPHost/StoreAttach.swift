#if os(iOS)
import Foundation
import ObjectiveC
import UIKit
import WebKit
import os.log
import FPCore
import FPStore

/// Binds FPStore to the shell's web view (plan task S5; decision.md sections 5-7). Build 60 is shadow only: the page
/// runs on WebKit as it always has, and the store follows it.
///
/// - **Install** (`install(webView:pageFolder:)`, from `SuperoViewController.capacitorDidLoad`, once per web view):
///   KTUIProxy goes in front of Capacitor's WKUIDelegate and is checked to be the web view's delegate; only then
///   are the facade's two document-start scripts added (the flag `window.__ktStore`, then `ktstore.js`, main frame
///   only), with the async `ktStore` message handler. A web view whose delegate cannot be vouched for gets no flag,
///   so its facade never prompts (Capacitor would show an unknown prompt as an alert).
/// - **Per document**: the facade's `hello` is the document start. The gate decides first (Storage's Native copy
///   switch, the policy file's `store.facade`, a store crash marker for this (shell, page) pair, a launch after a
///   document that never finished booting: `StoreGate`); when it says off, hello is answered off without touching
///   the store and the facade attaches nothing. Otherwise the store breaker is armed and the store answers. The
///   page's `bootDone` disarms the breaker (until the TrovoShell plugin carries it, the OTA confirm the page sends
///   on its first paint stands in for it: AppDelegate passes it here).
/// - **One page at a time**: everything is bound to the web view instance by weak reference. A newer web view (a
///   scene that disconnected and connected again) takes the binding over; the older one is detached at once (its
///   KT1 prompts answered nil, its posts dropped), and nothing here keeps it alive.
/// - **The crash marker**: every store operation runs inside `StoreMarker`'s state byte. A launch that finds it
///   set turns the facade off for that pair (`BreakerBook.recordStaleMarkers`) and, because the crash may have been
///   in the store's own code, leaves the store closed for the launch.
/// - **Background**: a checkpoint (`PRAGMA wal_checkpoint(TRUNCATE)`) and the day's snapshot when the app goes to the
///   background; the day's snapshot when it comes back (the store also takes one at the first hello of a day).
///
/// Everything here runs on the main thread (WebKit calls the UI delegate and the message handler there); store
/// work that the page does not wait on (posts, checkpoints, snapshots) goes to a utility queue.
@MainActor
public final class StoreAttach: NSObject {
    public static let shared = StoreAttach()

    static let log = Logger(subsystem: "app.kt.trainer", category: "store")

    /// Storage's Native copy switch (device only, never in a backup): true turns the facade off from the next
    /// document start.
    nonisolated public static let deviceSwitchKey = "fp.store.off"
    /// The store piece's breaker record (BreakerBook: the store breaker and the store's crash verdicts): a file beside
    /// the store, `FPStore/breakers.json`, with a copy in UserDefaults under `fp.store.breakers`.
    nonisolated static let bookFileName = "breakers.json"
    nonisolated static let bookKey = "fp.store.breakers"
    nonisolated static let handlerName = "ktStore"
    nonisolated static let markerName = "store.marker"
    nonisolated static let testQuitName = "testquit.json"

    // MARK: State

    /// The attached web view and what belongs to it.
    final class Binding {
        weak var webView: WKWebView?
        let proxy: KTUIProxy
        let handler: PostHandler
        let serial: Int
        let pageBuild: String?
        var documents = 0

        init(webView: WKWebView, proxy: KTUIProxy, handler: PostHandler, serial: Int, pageBuild: String?) {
            self.webView = webView
            self.proxy = proxy
            self.handler = handler
            self.serial = serial
            self.pageBuild = pageBuild
        }
    }

    /// What the current document's hello found.
    public struct DocumentState: Codable, Equatable, Sendable {
        public var at: Date?
        /// The facade mirrors this document's writes.
        public var attached = false
        /// Why it does not (the gate, or the store's own answer).
        public var offWhy: String?
        public var boot: Int64?
        public var rule: Int?
        public var label: String?
        public var helloMs: Double?
        public var bootDone = false
    }

    public struct Counters: Codable, Equatable, Sendable {
        public var prompts = 0
        public var promptMs = 0.0
        public var promptMaxMs = 0.0
        public var byOp: [String: Int] = [:]
        public var hellos = 0
        public var gatedOff = 0
        public var posts = 0
        public var postsApplied = 0
        public var postsStale = 0
        public var postsRefused = 0
        public var installs = 0
        public var rebinds = 0
        public var detached = 0
        public var rewraps = 0
        public var verifyFailures = 0
        public var bootDones = 0
        public var checkpoints = 0
        public var checkpointFailures = 0
        public var snaps = 0
    }

    public let shellBuild: String
    let shellNumber: Int
    let defaults: UserDefaults
    /// `Application Support/FPStore`.
    public let directory: URL

    public private(set) var store: KTStore?
    /// Why the store is closed for this launch (a crash verdict), nil when it was opened.
    public private(set) var storeClosedWhy: String?
    private(set) var book = BreakerBook()
    private var marker: StoreMarker
    private var launched = false
    /// A stale marker the launch found (already a verdict in the book).
    public private(set) var markerFound: CrashMarker?
    private(set) var binding: Binding?
    private var serials = 0
    private let pages = NSHashTable<WKWebView>.weakObjects()
    public private(set) var document = DocumentState()
    public private(set) var counters = Counters()
    private var lastSnapCheck: Date?
    /// Storage's "Test: quit after next save": what the armed test waits for (nil: not armed).
    private var quitArm: StoreTestQuit.Arm?
    /// The last test quit's record, read at launch; its `after` is filled in at this launch's first document start.
    public private(set) var testQuit: StoreTestQuit?
    private var quitFile: StoreTestQuitFile { StoreTestQuitFile(url: directory.appendingPathComponent(Self.testQuitName)) }
    private let work = DispatchQueue(label: "app.kt.trainer.fpstore.attach", qos: .utility)
    #if DEBUG
    var debug = DebugOptions()
    #endif
    private static var proxyKey: UInt8 = 0
    /// The policy file (FPPolicy): started at the launch, and its switches in force, which the gate reads (tests set
    /// their own, so no fetch is made and the switches are the test's).
    var startPolicy: @MainActor () -> Void = { FPPolicy.shared.start() }
    var policyInForce: @MainActor () -> Policy = { FPPolicy.shared.effective }

    /// `directory`: the store's folder (tests pass their own; the app's is `Application Support/FPStore`). `shellBuild`:
    /// this binary's build (tests pass their own; the app's CFBundleVersion).
    init(defaults: UserDefaults = .standard, directory: URL? = nil, shellBuild: String? = nil) {
        self.defaults = defaults
        let info = Bundle.main.infoDictionary
        self.shellBuild = shellBuild ?? (info?["CFBundleVersion"] as? String) ?? "0"
        shellNumber = Int(self.shellBuild) ?? 0
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let folder = directory ?? support.appendingPathComponent("FPStore", isDirectory: true)
        self.directory = folder
        marker = StoreMarker(url: folder.appendingPathComponent(StoreAttach.markerName))
        super.init()
    }

    // MARK: Launch

    /// The once-per-process work, at the first install: the Debug options, the policy fetch, the crash marker the
    /// last launch left, the store breaker's launch check, and the store itself.
    private func launch(pageBuild: String?) {
        guard !launched else { return }
        launched = true
        let now = Date()
        #if DEBUG
        debug = DebugOptions(arguments: ProcessInfo.processInfo.arguments)
        if let off = debug.deviceSwitchOff { defaults.set(off, forKey: Self.deviceSwitchKey) }
        #endif
        startPolicy()
        book = Self.loadBook(directory: directory, defaults: defaults)
        #if DEBUG
        if debug.clearVerdicts { book.clearDisabled(piece: CrashMarker.Piece.store.name) }
        if debug.clearBreaker { book.store = StoreBreaker() }
        #endif
        if let stale = marker.stale() {
            markerFound = stale
            #if DEBUG
            let record = !debug.ignoreMarker
            #else
            let record = true
            #endif
            if record {
                book.recordStaleMarkers([stale], at: now)
                Self.log.error("store: crash marker found (\(stale.line, privacy: .public)): the facade is off for that pair")
            }
        }
        if !book.store.launch(at: now) {
            Self.log.error("store: the last document never finished booting: this launch runs without the facade")
        }
        saveBook()
        testQuit = quitFile.read()
        marker.begin(shell: shellBuild, page: pageBuild ?? "unknown")
        if let verdict = book.disabled(piece: CrashMarker.Piece.store.name, shell: shellBuild, page: pageBuild) {
            // The crash may have been in the store's own code: leave it closed for the launch.
            storeClosedWhy = verdict.why
        } else {
            let config = KTStore.Config(directory: directory, build: shellNumber)
            store = marker.around { KTStore.open(config) }
            if let store, case .ready = store.state {} else {
                Self.log.error("store: not ready: \(String(describing: self.store?.state), privacy: .public)")
            }
        }
        NotificationCenter.default.addObserver(self, selector: #selector(didEnterBackground),
                                               name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(willEnterForeground),
                                               name: UIApplication.willEnterForegroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(policyChanged(_:)), name: FPPolicy.changed, object: nil)
        mirrorShellMeta()
        #if DEBUG
        StoreProbe.startIfAsked(attach: self, arguments: ProcessInfo.processInfo.arguments)
        StoreProbe.shared?.event("launch", ["shell": shellBuild, "page": pageBuild ?? NSNull(),
                                            "markerFound": markerFound?.line ?? NSNull(),
                                            "storeClosed": storeClosedWhy ?? NSNull(),
                                            "skipping": book.store.skipping, "trips": book.store.trips,
                                            "verdicts": book.disabled.filter { $0.piece == "store" }.map { "\($0.shell)/\($0.page)" },
                                            "storeState": Self.describe(store?.state),
                                            "storeHashes": storeHashes()])
        #endif
    }

    // MARK: Install and rebind

    /// Binds the store to a new web view (`capacitorDidLoad`). `pageFolder`: the folder the bridge serves (the
    /// bundle's `public` or the OTA live folder), whose build.txt names the page build.
    public func install(webView: WKWebView, pageFolder: URL?) {
        let page = pageFolder.flatMap(Self.pageBuild(in:))
        launch(pageBuild: page)
        if let b = binding, b.webView === webView, !b.proxy.detached { return }   // already bound: its scripts are in
        counters.installs += 1
        pages.add(webView)
        if let old = binding, old.webView !== webView {
            detach(old, why: "a newer web view")
            counters.rebinds += 1
        }
        binding = nil
        if let page { marker.begin(shell: shellBuild, page: page) }

        // KTUIProxy in front of Capacitor's delegate, then checked.
        guard let inner = webView.uiDelegate as? (NSObject & WKUIDelegate) else {
            verifyFailed(webView, "the web view has no UI delegate to stand in front of")
            return
        }
        let proxy = KTUIProxy(inner: inner) { [weak self] head, payload, wv in
            self?.answerPrompt(head: head, payload: payload, webView: wv)
        }
        objc_setAssociatedObject(webView, &Self.proxyKey, proxy, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        #if DEBUG
        if debug.breakProxy {
            verifyFailed(webView, "-fpBreakProxy")
            return
        }
        #endif
        webView.uiDelegate = proxy
        let promptSel = #selector(WKUIDelegate.webView(_:runJavaScriptTextInputPanelWithPrompt:defaultText:initiatedByFrame:completionHandler:))
        guard webView.uiDelegate === proxy, proxy.responds(to: promptSel), inner.responds(to: promptSel) else {
            webView.uiDelegate = inner
            verifyFailed(webView, "KTUIProxy is not the web view's UI delegate")
            return
        }
        guard let facade = KTFacade.source() else {
            verifyFailed(webView, "ktstore.js is missing from the FPStore bundle")
            return
        }

        serials += 1
        let handler = PostHandler(self)
        let b = Binding(webView: webView, proxy: proxy, handler: handler, serial: serials, pageBuild: page)
        let ucc = webView.configuration.userContentController
        ucc.removeScriptMessageHandler(forName: Self.handlerName)
        ucc.add(handler, name: Self.handlerName)
        #if DEBUG
        for script in debug.documentStartScripts {
            ucc.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        #endif
        ucc.addUserScript(WKUserScript(source: KTFacade.flagScript(shell: shellBuild), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        ucc.addUserScript(WKUserScript(source: facade, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        binding = b
        document = DocumentState()
        Self.log.info("store: attached to web view #\(b.serial) (page \(page ?? "?", privacy: .public), shell \(self.shellBuild, privacy: .public)); \(self.pagesAlive) page(s) alive")
        #if DEBUG
        StoreProbe.shared?.installed(webView: webView, serial: b.serial, page: page)
        #endif
    }

    private func verifyFailed(_ webView: WKWebView, _ why: String) {
        counters.verifyFailures += 1
        document = DocumentState()
        document.offWhy = "no flag: " + why
        Self.log.error("store: \(why, privacy: .public): no flag, so the facade stays out of this web view")
        #if DEBUG
        StoreProbe.shared?.installed(webView: webView, serial: 0, page: nil)
        StoreProbe.shared?.event("verifyFailed", ["why": why])
        #endif
    }

    private func detach(_ b: Binding, why: String) {
        b.proxy.detached = true
        b.webView?.configuration.userContentController.removeScriptMessageHandler(forName: Self.handlerName)
        counters.detached += 1
        Self.log.info("store: detached web view #\(b.serial) (\(why, privacy: .public))")
        #if DEBUG
        StoreProbe.shared?.event("detached", ["serial": b.serial, "why": why, "alive": b.webView != nil])
        #endif
    }

    /// A scene connected (`scene(_:willConnectTo:)`). Its web view binds when it loads; until then the current
    /// binding is checked: a web view whose window has no scene any more is detached, and the proxy is checked to
    /// still be the delegate.
    public func sceneConnected() {
        if let b = binding {
            if let wv = b.webView, wv.window != nil, wv.window?.windowScene?.activationState != .unattached {
                reverify()
            } else {
                detach(b, why: "its scene is gone")
                binding = nil
            }
        }
        #if DEBUG
        StoreProbe.shared?.event("sceneConnected", ["alive": pagesAlive])
        #endif
    }

    /// A scene disconnected (`sceneDidDisconnect`): its web view is detached now, before UIKit releases it.
    public func sceneDisconnected(webView: WKWebView?) {
        if let b = binding, webView == nil || b.webView === webView || b.webView == nil {
            detach(b, why: "scene disconnected")
            binding = nil
        }
        #if DEBUG
        StoreProbe.shared?.event("sceneDisconnected", ["alive": pagesAlive])
        #endif
    }

    /// The proxy is still the delegate (re-wrapped when something replaced it).
    private func reverify() {
        guard let b = binding, let wv = b.webView else { return }
        if wv.uiDelegate !== b.proxy {
            counters.rewraps += 1
            Self.log.error("store: the UI delegate was replaced; KTUIProxy goes back in front")
            wv.uiDelegate = b.proxy
        }
    }

    /// Web views alive now (the attached one and any not yet released).
    public var pagesAlive: Int { pages.allObjects.count }

    // MARK: The prompt channel

    private func answerPrompt(head: String, payload: String?, webView: WKWebView) -> String? {
        guard let b = binding, b.webView === webView, !b.proxy.detached else { return nil }
        let op = head.split(separator: " ", maxSplits: 1).first.map(String.init) ?? ""
        if op == "hello" { return hello(head: head, payload: payload, binding: b) }
        guard document.attached, let store else { return nil }
        let answer = timed(op) { store.answer(head: head, payload: payload) }
        if quitArm != nil, answer == KTProtocol.Answer.ok.rawValue { quitAfterSave(op: op, payload: payload) }
        #if DEBUG
        if let probe = StoreProbe.shared, UIApplication.shared.applicationState != .active, op == "w" || op == "d" {
            let key = KTWire.lines(payload).first.flatMap { KTWire.unquote($0) }.map { String(decoding: $0, as: UTF16.self) }
            probe.event("answeredInBackground", ["op": op, "key": key ?? NSNull(), "answer": answer])
        }
        #endif
        return answer
    }

    private func hello(head: String, payload: String?, binding b: Binding) -> String {
        let now = Date()
        b.documents += 1
        counters.hellos += 1
        document = DocumentState()
        document.at = now
        let page = b.pageBuild
        if let off = gate(page: page) {
            counters.gatedOff += 1
            document.offWhy = off.why
            Self.log.info("store: document #\(b.documents) runs without the facade: \(off.why, privacy: .public)")
            #if DEBUG
            StoreProbe.shared?.event("hello", ["gate": off.code, "why": off.why, "document": b.documents])
            #endif
            noteQuitAfter(StoreTestQuit.After(at: now, rule: -1, label: "off: " + off.why))
            return KTProtocol.offAnswer(off.code)
        }
        guard let store else {
            document.offWhy = "store: " + (storeClosedWhy ?? "not open")
            noteQuitAfter(StoreTestQuit.After(at: now, rule: -1, label: "off: " + (document.offWhy ?? "")))
            return KTProtocol.offAnswer(storeClosedWhy == nil ? "not open" : "crash marker")
        }
        book.store.documentStart(pageBuild: page, at: now)
        saveBook()
        let t0 = DispatchTime.now().uptimeNanoseconds
        let answer = timed("hello") { store.answer(head: head, payload: payload) }
        document.helloMs = Double(DispatchTime.now().uptimeNanoseconds &- t0) / 1_000_000
        let reply = Self.parseHelloAnswer(answer)
        if reply.mode == "shadow" {
            document.attached = true
            document.boot = reply.boot
            document.rule = reply.rule
            document.label = reply.label
        } else {
            document.offWhy = "store: " + (reply.why ?? String(answer.prefix(80)))
            book.store.bootDone()
            saveBook()
        }
        if testQuit != nil, testQuit?.after == nil {
            // The first document start after a test quit: what the store found (its record of this hello, or the
            // facade off when the store did not reconcile).
            let msNow = Int64((now.timeIntervalSince1970 * 1000).rounded())
            if let h = store.status().lastHello, h.at >= msNow - 5000 {
                noteQuitAfter(StoreTestQuit.After(at: now, rule: h.rule, label: h.label, wouldRepair: h.wouldRepair, adopted: h.adopted))
            } else {
                noteQuitAfter(StoreTestQuit.After(at: now, rule: -1, label: "off: " + (document.offWhy ?? "no answer")))
            }
        }
        #if DEBUG
        StoreProbe.shared?.event("hello", ["answer": answer, "ms": document.helloMs ?? 0,
                                           "document": b.documents, "attached": document.attached,
                                           "lastHello": Self.jsonObject(store.status().lastHello) ?? NSNull()])
        #endif
        return answer
    }

    /// The gate at a document start: StoreGate over the device switch, the policy in force, the crash verdicts and
    /// the store breaker.
    private func gate(page: String?) -> (code: String, why: String)? {
        let off = StoreGate.evaluate(deviceOff: defaults.bool(forKey: Self.deviceSwitchKey), policy: policyInForce(),
                                     book: book, shellBuild: shellBuild, pageBuild: page)
        switch off {
        case nil: return nil
        case .deviceSwitch?: return ("device switch", "Storage's Native copy switch is off")
        case .policy?: return ("policy", "the policy file turned the facade off")
        case .crashMarker(let d)?: return ("crash marker", d.why)
        case .unfinishedBoot?: return ("unfinished boot", "the last document never finished booting")
        }
    }

    /// One store operation the page waits on: inside the crash marker, timed.
    private func timed(_ op: String, _ body: () -> String) -> String {
        let t0 = DispatchTime.now().uptimeNanoseconds
        let out = marker.around(body)
        let ms = Double(DispatchTime.now().uptimeNanoseconds &- t0) / 1_000_000
        counters.prompts += 1
        counters.promptMs += ms
        counters.promptMaxMs = max(counters.promptMaxMs, ms)
        counters.byOp[op, default: 0] += 1
        return out
    }

    struct HelloReply {
        var mode: String?
        var why: String?
        var boot: Int64?
        var rule: Int?
        var label: String?
    }

    nonisolated static func parseHelloAnswer(_ text: String) -> HelloReply {
        guard let obj = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any] else { return HelloReply() }
        return HelloReply(mode: obj["mode"] as? String, why: obj["why"] as? String,
                          boot: (obj["boot"] as? NSNumber)?.int64Value, rule: (obj["rule"] as? NSNumber)?.intValue,
                          label: obj["label"] as? String)
    }

    // MARK: Async posts

    final class PostHandler: NSObject, WKScriptMessageHandler {
        weak var attach: StoreAttach?
        init(_ attach: StoreAttach) { self.attach = attach }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            attach?.received(message)
        }
    }

    fileprivate func received(_ message: WKScriptMessage) {
        guard let b = binding, let wv = b.webView, message.webView === wv, !b.proxy.detached,
              message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.protocol == "capacitor",
              let store else {
            counters.postsRefused += 1
            return
        }
        counters.posts += 1
        let body = message.body
        let marker = self.marker
        work.async {
            let result = marker.around { store.post(body: body) }
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    switch result {
                    case .applied: self.counters.postsApplied += 1
                    case .stale: self.counters.postsStale += 1
                    case .refused, .failed: self.counters.postsRefused += 1
                    }
                    #if DEBUG
                    StoreProbe.shared?.event("post", ["result": "\(result)"])
                    #endif
                }
            }
        }
    }

    // MARK: bootDone

    /// The page finished booting (the page's `bootDone`; until the TrovoShell plugin carries it, the OTA confirm the
    /// page sends on its first paint). Disarms the store breaker. `webView`: the web view it came from, when known
    /// (a call for a web view that is no longer attached is ignored).
    public func bootDone(page: String?, webView: WKWebView?) {
        if let webView, let b = binding, b.webView !== webView { return }
        counters.bootDones += 1
        document.bootDone = true
        #if DEBUG
        let ignore = debug.ignoreBootDone
        #else
        let ignore = false
        #endif
        if !ignore, book.store.armed != nil {
            book.store.bootDone()
            saveBook()
        }
        mirrorShellMeta()
        #if DEBUG
        StoreProbe.shared?.bootDone(webView: webView ?? binding?.webView, ignoredByBreaker: ignore)
        #endif
    }

    // MARK: Background and foreground

    @objc private func didEnterBackground() {
        guard let store else { return }
        let app = UIApplication.shared
        var task = UIBackgroundTaskIdentifier.invalid
        task = app.beginBackgroundTask(withName: "fpstore.checkpoint") {
            app.endBackgroundTask(task)
            task = .invalid
        }
        let marker = self.marker
        work.async {
            let ok = marker.around { store.checkpoint() }
            let snap = marker.around { store.snapIfDue() }
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    if ok { self.counters.checkpoints += 1 } else { self.counters.checkpointFailures += 1 }
                    if snap != nil { self.counters.snaps += 1 }
                    #if DEBUG
                    StoreProbe.shared?.event("background", ["checkpoint": ok, "snap": snap?.name ?? NSNull(),
                                                            "appState": UIApplication.shared.applicationState.rawValue])
                    #endif
                    if task != .invalid { app.endBackgroundTask(task); task = .invalid }
                }
            }
        }
    }

    @objc private func willEnterForeground() {
        reverify()
        guard let store else { return }
        let marker = self.marker
        work.async {
            let snap = marker.around { store.snapIfDue() }
            if snap != nil { DispatchQueue.main.async { MainActor.assumeIsolated { self.counters.snaps += 1 } } }
        }
    }

    @objc private func policyChanged(_ note: Notification) {
        if (note.userInfo?["store"] as? Bool) == true {
            Self.log.info("store: the policy changed; the store follows at the next document start")
        }
        mirrorShellMeta()
    }

    /// The last good policy file and the store breaker's record, copied into the store's meta (decision.md section 5)
    /// off the main thread. Kept for diagnostics and exports; the shell reads its own copies (UserDefaults), which
    /// work even when the store is closed.
    private func mirrorShellMeta() {
        guard let store else { return }
        let policy = FPPolicy.shared.lastGoodJSON
        let breaker = Self.encodeBook(book)
        let marker = self.marker
        work.async {
            marker.around {
                if store.shellMeta(.policy) != policy { store.setShellMeta(.policy, policy) }
                if store.shellMeta(.breaker) != breaker { store.setShellMeta(.breaker, breaker) }
            }
        }
    }

    // MARK: Storage (Settings > About > Storage through the TrovoStore plugin, plan task S6)

    /// Storage's Native copy switch: off from the next document start, on again from the next one.
    public func setDeviceSwitch(on: Bool) {
        defaults.set(!on, forKey: Self.deviceSwitchKey)
    }

    public var deviceSwitchOn: Bool { !defaults.bool(forKey: Self.deviceSwitchKey) }

    /// The owner turns the native copy back on after a crash verdict: the store's verdicts go (the store opens at the
    /// next launch, the facade attaches from the next document start of that launch).
    public func clearCrashVerdicts() {
        book.clearDisabled(piece: CrashMarker.Piece.store.name)
        saveBook()
    }

    /// The Native copy switch as Storage sets it: on also clears the store's crash verdicts, so a copy paused after a
    /// crash comes back (from the next launch when the store stayed closed for this one).
    public func setNativeCopy(on: Bool) {
        setDeviceSwitch(on: on)
        if on { clearCrashVerdicts() }
    }

    public enum StorageError: Error, CustomStringConvertible {
        case off(String)
        case failed(String)

        public var description: String {
            switch self {
            case .off(let why): return "the native copy is off (\(why))"
            case .failed(let why): return why
            }
        }
    }

    /// The store when it is open and readable.
    private func readyStore() throws -> KTStore {
        guard let store else { throw StorageError.off(storeClosedWhy ?? "not open") }
        guard case .ready = store.state else { throw StorageError.off(Self.describe(store.state)) }
        return store
    }

    /// The values the store gave up in the last 30 days, newest first, as JSON objects (id, at, key, why, h, hnew,
    /// units, boot: the start that gave it up); empty when the store is off. The losses still open, grouped by start,
    /// come with the status (`store.losses`).
    public func conflictsJSON(limit: Int) -> [[String: Any]] {
        guard let store = try? readyStore() else { return [] }
        let rows = marker.around { store.conflicts(limit: max(1, min(limit, 500))) }
        return rows.compactMap { Self.jsonObject($0) as? [String: Any] }
    }

    /// Put back for Storage: what it would do (`preview`), or staged for the next document start, when the facade
    /// writes the values into WebKit before the page's first script (the plugin then reloads the page). Chosen
    /// conflicts, a kept snapshot by name, or rule 3's snapshot (`wipe`). Log keys merge by record id; other keys go
    /// back only while unchanged since (KTStore).
    public func putBack(conflicts ids: [Int64], snap: String?, wipe: Bool, preview: Bool) throws -> (plan: KTPutBackPlan, staged: Bool) {
        let store = try readyStore()
        var name = snap
        if wipe {
            guard let offer = store.status().wipeOffer?.snap else {
                return (KTPutBackPlan(items: [KTPutBackItem(key: "", outcome: .notFound, origin: "snap:wipe")]), false)
            }
            name = offer
        }
        let plan: KTPutBackPlan = marker.around {
            if let name { return preview ? store.previewPutBack(snap: name) : store.stagePutBack(snap: name) }
            return preview ? store.previewPutBack(conflicts: ids) : store.stagePutBack(conflicts: ids)
        }
        let staged = !preview && plan.count > 0
        if staged { Self.log.info("store: Put back staged (\(plan.count) key(s)); the page reloads to write them") }
        return (plan, staged)
    }

    /// `putBack` as JSON for the plugin: `{items: [{key, outcome, added?, origin}], count, staged}`.
    public func putBackJSON(conflicts ids: [Int64], snap: String?, wipe: Bool, preview: Bool) throws -> [String: Any] {
        let r = try putBack(conflicts: ids, snap: snap, wipe: wipe, preview: preview)
        return ["items": Self.jsonObject(r.plan.items) ?? [Any](), "count": r.plan.count, "staged": r.staged]
    }

    /// The store as one JSON document for Storage's Export a copy (every live value; `kt_apikey` is never in it).
    public func exportCopy() throws -> (data: Data, keys: Int) {
        let store = try readyStore()
        do {
            let data = try marker.around { try store.exportJSON() }
            return (data, store.status().keys)
        } catch {
            throw StorageError.failed("\(error)")
        }
    }

    /// Arms "Test: quit after next save" (the TrovoStore plugin offers it on TestFlight and in Debug builds only): the
    /// next page save of one of `keys` (any key when empty) that the store acknowledges ends the process right after
    /// the page has its answer. Disarmed by itself after ten minutes, at the next launch, or by `disarmTestQuit()`.
    /// false when the facade is not attached (no save would be acknowledged).
    @discardableResult
    public func armTestQuit(keys: [String]) -> Bool {
        guard store != nil, document.attached else { return false }
        quitArm = StoreTestQuit.Arm(at: Date(), keys: Set(keys.filter { !$0.isEmpty }))
        Self.log.notice("store: test quit armed (\(keys.count) key(s))")
        return true
    }

    public func disarmTestQuit() { quitArm = nil }

    public var testQuitArmed: Bool {
        guard let arm = quitArm else { return false }
        return !arm.expired(at: Date())
    }

    /// A save the store acknowledged while the test is armed: when it is one the arm waits for, the record goes to its
    /// file and the process ends at the next turn of the main queue (before the page's next save can reach the store,
    /// so no store operation is in flight and no crash marker is left), inside WebKit's lost-write window.
    private func quitAfterSave(op: String, payload: String?) {
        guard let arm = quitArm else { return }
        let now = Date()
        if arm.expired(at: now) { quitArm = nil; return }
        let key = KTWire.lines(payload).first.flatMap { KTWire.unquote($0) }.map { String(decoding: $0, as: UTF16.self) }
        guard arm.fires(op: op, key: key, at: now), let key else { return }
        quitArm = nil
        let record = StoreTestQuit(armedAt: arm.at, firedAt: now, key: key, op: op, shell: shellBuild, page: binding?.pageBuild)
        quitFile.write(record)
        testQuit = record
        Self.log.notice("store: test quit after saving \(key, privacy: .public)")
        DispatchQueue.main.async { kill(getpid(), SIGKILL) }
    }

    /// The first document start after a test quit: what it found goes into the record.
    private func noteQuitAfter(_ after: StoreTestQuit.After) {
        guard var record = testQuit, record.after == nil else { return }
        record.after = after
        testQuit = record
        quitFile.write(record)
    }

    // MARK: Status

    /// Everything Settings > About > Storage shows about the attachment (the store's own counts are in `store`).
    public struct Status: Codable, Equatable, Sendable {
        public var shell: String
        public var page: String?
        /// "attached", "off" or "waiting" (no document has said hello yet).
        public var facade: String
        public var why: String?
        public var document: DocumentState
        public var deviceSwitchOn: Bool
        public var policyFacade: String
        public var policyRepair: String
        public var policyResult: String?
        public var policyAt: Date?
        public var breakerArmed: Bool
        public var breakerTrips: Int
        public var breakerLastTrip: Date?
        public var skippingThisLaunch: Bool
        public var crashVerdicts: [DisabledPair]
        public var markerFoundAtLaunch: String?
        public var storeClosedWhy: String?
        public var counters: Counters
        public var proxy: KTUIProxy.Counts?
        public var pagesAlive: Int
        public var store: KTStatus?
        /// The last "Test: quit after next save" and what the next launch found.
        public var testQuit: StoreTestQuit?
        public var testQuitArmed: Bool
    }

    public func status() -> Status {
        let p = FPPolicy.shared
        let facade: String
        if document.attached { facade = "attached" } else if document.offWhy != nil { facade = "off" } else { facade = "waiting" }
        return Status(shell: shellBuild, page: binding?.pageBuild, facade: facade, why: document.offWhy, document: document,
                      deviceSwitchOn: deviceSwitchOn, policyFacade: p.effective.facade.rawValue,
                      policyRepair: p.effective.repair.rawValue, policyResult: p.state.lastResult, policyAt: p.state.lastGoodAt,
                      breakerArmed: book.store.armed != nil, breakerTrips: book.store.trips, breakerLastTrip: book.store.lastTrip,
                      skippingThisLaunch: book.store.skipping,
                      crashVerdicts: book.disabled.filter { $0.piece == CrashMarker.Piece.store.name },
                      markerFoundAtLaunch: markerFound?.line, storeClosedWhy: storeClosedWhy, counters: counters,
                      proxy: binding?.proxy.counts, pagesAlive: pagesAlive, store: store?.status(losses: true),
                      testQuit: testQuit, testQuitArmed: testQuitArmed)
    }

    /// `status()` as a JSON object (for the TrovoStore plugin and the scenario runner).
    public func statusJSON() -> [String: Any] {
        (Self.jsonObject(status()) as? [String: Any]) ?? [:]
    }

    // MARK: The first frame's room (build 61, contract 6.1)

    /// The room the tab bar wears in the first frame, before any TabsModel (SceneDelegate, after the web view's
    /// `loadViewIfNeeded`, so the store has opened and the page being served is bound): the owner's `kt_theme` as the
    /// store holds it, read once inside the store's marker. Nothing is written. Nil (the caller draws Heavyweight) when
    /// the store is closed or not ready, when no page is bound, or when StoreGate is off for the page being served (the
    /// device switch, the policy's facade, a crash verdict, an unfinished boot): the store may lag WebKit then.
    public func firstFrameRoom() -> String? {
        let marker = self.marker
        return Self.firstFrameRoom(store: store, bound: binding != nil, gateOff: gate(page: binding?.pageBuild) != nil) { store in
            marker.around { store.value("kt_theme") }
        }
    }

    /// `firstFrameRoom()`'s rule with what it reads passed in (tests): a ready store, a bound page and the gate on (asked
    /// only then), then the theme's room.
    static func firstFrameRoom(store: KTStore?, bound: Bool, gateOff: @autoclosure () -> Bool, theme: (KTStore) -> U16?) -> String? {
        guard let store, bound, case .ready = store.state, !gateOff() else { return nil }
        return room(fromTheme: theme(store))
    }

    /// The page's `kt_theme` (a RAW_STRING_KEYS key: the plain string, no JSON quotes) as a room id: `heavyweight` or
    /// `dark` when its UTF-16 units are exactly that, else nil (`lime`, a retired or unknown room, empty, a lone
    /// surrogate, absent).
    nonisolated public static func room(fromTheme value: U16?) -> String? {
        guard let value else { return nil }
        return ["heavyweight", "dark"].first { value == Array($0.utf16) }
    }

    // MARK: Helpers

    /// The page build a served folder holds: build.txt, else the `<meta name="build">` of its index.html.
    nonisolated public static func pageBuild(in folder: URL) -> String? {
        if let s = try? String(contentsOf: folder.appendingPathComponent("build.txt"), encoding: .utf8) {
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            if !t.isEmpty { return t }
        }
        guard let html = try? String(contentsOf: folder.appendingPathComponent("index.html"), encoding: .utf8),
              let r = html.range(of: "<meta name=\"build\" content=\"") else { return nil }
        let tail = html[r.upperBound...]
        guard let end = tail.firstIndex(of: "\"") else { return nil }
        return String(tail[..<end])
    }

    private func saveBook() {
        if !Self.saveBook(book, directory: directory, defaults: defaults) {
            Self.log.error("store: the breaker record could not be written beside the store (UserDefaults keeps a copy)")
        }
    }

    nonisolated static func bookURL(in directory: URL) -> URL {
        directory.appendingPathComponent(bookFileName)
    }

    /// The breaker record (the store breaker and the store's crash verdicts): the file beside the store when it reads,
    /// else the copy in UserDefaults. The file is what counts. UserDefaults reaches its disk through cfprefsd, later:
    /// an app killed at once (a crash, a force quit) and installed again soon after came back to an older record
    /// there, so a disarmed breaker read as armed (a launch without the facade for nothing) and an armed one could
    /// read as disarmed (no breaker at all).
    nonisolated static func loadBook(directory: URL, defaults: UserDefaults) -> BreakerBook {
        if let data = try? Data(contentsOf: bookURL(in: directory)),
           (try? JSONSerialization.jsonObject(with: data)) is [String: Any] {
            return BreakerBook.decoded(data)
        }
        return BreakerBook.decoded(defaults.data(forKey: bookKey))
    }

    /// Writes the record: the file, atomically and before the page goes on (the kernel holds it once the call
    /// returns, whatever happens to the process), and the UserDefaults copy. false when the file could not be written.
    @discardableResult
    nonisolated static func saveBook(_ book: BreakerBook, directory: URL, defaults: UserDefaults) -> Bool {
        let data = book.encoded()
        defaults.set(data, forKey: bookKey)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try data.write(to: bookURL(in: directory), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            return true
        } catch {
            return false
        }
    }

    nonisolated static func encodeBook(_ book: BreakerBook) -> String {
        String(decoding: book.encoded(), as: UTF8.self)
    }

    nonisolated static func describe(_ state: KTStore.State?) -> String {
        switch state {
        case nil: return "closed"
        case .ready?: return "ready"
        case .unreadable(let why)?: return "unreadable: " + why
        case .refused(let m)?: return "refused: minReader \(m)"
        }
    }

    /// Every live value's hash in the store (the scenario runner's view before a hello).
    func storeHashes() -> [String: String] {
        guard let store else { return [:] }
        var out: [String: String] = [:]
        for (k, v) in marker.around({ store.values() }) { out[k.string] = KTWire.hash(v) }
        return out
    }

    nonisolated static func jsonObject<T: Encodable>(_ value: T?) -> Any? {
        guard let value else { return nil }
        let e = JSONEncoder()
        e.dateEncodingStrategy = .millisecondsSince1970
        guard let data = try? e.encode(value) else { return nil }
        return try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
    }
}

#if DEBUG
/// Launch arguments the Debug build reads (never a Release build): tests/native-store.sh drives the scenarios with
/// them, so no tool writes WebKit's file behind the facade.
struct DebugOptions {
    /// `-fpStoreSwitch on|off`: sets Storage's Native copy switch before anything attaches.
    var deviceSwitchOff: Bool?
    /// `-fpClearVerdicts`: the store's crash verdicts go before the launch check.
    var clearVerdicts = false
    /// `-fpClearBreaker`: the store breaker starts clean (no skip for an unfinished boot).
    var clearBreaker = false
    /// `-fpBreakProxy`: KTUIProxy is never put in front, so the check fails and no flag is injected.
    var breakProxy = false
    /// `-fpIgnoreBootDone`: bootDone leaves the store breaker armed (a document that "never finished booting").
    var ignoreBootDone = false
    /// `-fpIgnoreMarker`: a stale crash marker is reported but gives no verdict. tests/tools/native-store.py passes it
    /// on every launch but the marker scenario's and the test quit's reopen: its own kills (simctl terminate, the
    /// sweep's SIGKILLs) can land inside a store operation, and the sweep's report launches must classify what WebKit
    /// lost with the facade on.
    var ignoreMarker = false
    /// Scripts added before the flag: `-fpNoWebKit` (localStorage throws, so the facade says hello nowk) and the
    /// scenario runner's own (a reference to WebKit's real Storage, taken before the facade replaces it, with the
    /// time WebKit took to load the storage area at that first read).
    var documentStartScripts: [String] = []

    init(arguments a: [String] = []) {
        func value(_ name: String) -> String? {
            guard let i = a.firstIndex(of: name), i + 1 < a.count else { return nil }
            return a[i + 1]
        }
        switch value("-fpStoreSwitch") {
        case "off"?: deviceSwitchOff = true
        case "on"?: deviceSwitchOff = false
        default: break
        }
        clearVerdicts = a.contains("-fpClearVerdicts")
        clearBreaker = a.contains("-fpClearBreaker")
        breakProxy = a.contains("-fpBreakProxy")
        ignoreBootDone = a.contains("-fpIgnoreBootDone")
        ignoreMarker = a.contains("-fpIgnoreMarker")
        if a.contains("-fpProbe") {
            // WebKit loads a document's storage area at its first read, which the page pays at its own first read
            // with or without the facade. Read it here, timed (__fpWkMs), so the facade's boot (bootMs) counts the
            // facade's own work, as the store-first probe measured it, and the runner reports WebKit's load beside it.
            documentStartScripts.append("""
                try { var t = performance.now(); window.__fpRealLS = window.localStorage; void window.__fpRealLS.length; \
                window.__fpWkMs = performance.now() - t; } catch (e) { window.__fpRealLS = null; }
                """)
        }
        if a.contains("-fpOffline") {
            // The page's own OTA check (build.txt on GitHub Pages) stays off, so a page published meanwhile is never
            // staged under a scenario. Runs after Capacitor's scripts, so its fetch patch is in place underneath; the
            // fetch found here is kept as __fpCapFetch, so the scenario runner still sees whether Capacitor patched it.
            documentStartScripts.append("""
                (function () { var f = window.fetch; window.__fpCapFetch = f; window.fetch = function (u) { \
                var s = String((u && u.url) || u); \
                if (s.indexOf('https://drizzy603.github.io/') === 0) return Promise.reject(new Error('fpOffline')); \
                return f.apply(this, arguments); }; })();
                """)
        }
        if a.contains("-fpNoWebKit") {
            documentStartScripts.append("""
                Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { \
                throw new DOMException('The operation is insecure.', 'SecurityError'); } });
                """)
        }
    }
}
#endif
#endif
