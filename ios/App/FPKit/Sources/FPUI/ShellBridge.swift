#if os(iOS)
import Foundation
import UIKit
import WebKit
import os.log
import FPCore

/// The shell's side of contract v1 (plan task C5; decision.md sections 6 and 7): the page's TrovoShell messages in, the
/// native screens up and down, intents out.
///
/// - **One page at a time.** Everything is bound to the web view instance by weak reference (`install` from
///   `capacitorDidLoad`): its LinkState (FPCore: the hello deadline, negotiation, the breaker), its PageLink (intents)
///   and its ScreenHost (presentation). A newer web view (a scene that connected again) takes the binding over and the
///   older one's screens go; nothing here keeps a web view alive.
/// - **Documents.** A document-start script posts `fpShell` at every main-frame document (the first load, a reload, a
///   WebContent restart): LinkState starts the document's 15 s hello deadline (foreground time only), and the document
///   before it is gone: its pending intents end unsent or unanswered (never resent), its open confirm closes as stale,
///   and a screen it had up stays up for the next document's hello.
/// - **hello** negotiates through LinkState with ScreenGate's screens for the hello's page build (the policy file, a
///   crash verdict for this shell and page, the native breaker); the answer also names the screens still up from the
///   document before (`up`), which the page takes over; the shell then resyncs them (`shell.covered`, `coach.snapshot`)
///   and never resends anything.
/// - **The breaker book** (FPCore BreakerBook: the native breaker per screen and page build, and the screens' crash
///   verdicts) lives in the link; every change goes through it (`editBook` for crash markers and the launch's clears)
///   and is written to `Application Support/FPShell/breakers.json` (a copy in UserDefaults) when the link says
///   `bookChanged`. The store keeps its own (FPHost StoreAttach, `FPStore/breakers.json`).
/// - **Crash markers.** ScreenHost keeps `presenting <screen>@<page> shell <shell>` on disk while a screen is up and
///   the app is active; the next launch finds a marker only after a death on screen, records the verdict (that screen
///   is off for that shell and page build: the page shows its web screen) and removes the file, so it acts once.
///
/// - **Settings > About** asks `status` (FPCore ScreenStatus: every screen of this binary, on or off and why, whether the
///   owner can try it again) and `reset` ("Try the native chat again": the screen's crash verdicts and breaker record go
///   through the link's book, for the next document). The counters the owner cannot see in os_log are kept across
///   launches (FPCore ShellCounters, UserDefaults `fp.shell.counters`): the web view leaving its window while the app is
///   active (ShellWebView), the page going hidden under a native screen while the app is in use (the page's
///   `visibility`), breaker trips and crash markers.
///
/// FPHost's policy fetch and the store's bootDone reach this through `environment` (the App target sets it: FPUI does
/// not import FPHost).
@MainActor
public final class ShellBridge: NSObject {
    public static let shared = ShellBridge()

    static let log = Logger(subsystem: "app.kt.trainer", category: "shell")
    static let pageLog = Logger(subsystem: "app.kt.trainer", category: "page")
    nonisolated static let handlerName = "fpShell"
    nonisolated static let bookFileName = "breakers.json"
    nonisolated static let bookKey = "fp.shell.breakers"
    nonisolated static let countersKey = "fp.shell.counters"

    /// What the App target supplies.
    public struct Environment {
        /// The policy file's switches in force (FPHost FPPolicy).
        public var policy: () -> Policy = { .defaults }
        /// The page's bootDone, for the store breaker (FPHost StoreAttach).
        public var bootDone: (_ page: String, _ webView: WKWebView?) -> Void = { _, _ in }
        public init() {}
    }

    /// Why a page message was rejected. The plugin rejects with `String(describing:)`, so the page reads the text; every
    /// refusal new in 61 is worded `<code>: <words>` and the page reads the code before the first `:` (contract 3.1, D31).
    /// Build 60's four keep their words.
    public enum Refusal: Error, CustomStringConvertible {
        case notThisPage
        case badMessage(String)
        case notLive(String)
        case noModel(String)
        /// `selectTab` or `sheets` with no live tab root (classic or fallen back).
        case off
        /// `selectTab` with an id outside the four.
        case badTab(String)
        /// `setSwitch` for a piece this binary keeps no switch for (any but `tabs`).
        case noSwitch(String)
        /// `present tabs` (never presented), or `present coachHome` without a live tab root.
        case notPresentable(String)
        /// `present coach` under a live tab root while the Coach tab is not NATIVE.
        case notNative

        /// The code the page reads (nil for build 60's refusals, which carry none).
        public var code: String? {
            switch self {
            case .notThisPage, .badMessage, .notLive, .noModel: return nil
            case .off: return "off"
            case .badTab: return "bad-tab"
            case .noSwitch: return "no-switch"
            case .notPresentable: return "not-presentable"
            case .notNative: return "not-native"
            }
        }

        public var description: String {
            switch self {
            case .notThisPage: return "not the page the shell is bound to"
            case .badMessage(let why): return "bad message: " + why
            case .notLive(let s): return "the \(s) screen is not on for this document"
            case .noModel(let s): return "no \(s) model to open on"
            case .off: return "off: no live tab root"
            case .badTab(let t): return "bad-tab: \(t) is not one of " + ShellTabs.ids.joined(separator: ", ")
            case .noSwitch(let s): return "no-switch: this binary keeps no switch for \(s)"
            case .notPresentable(let s):
                return s == "tabs" ? "not-presentable: tabs is never presented" : "not-presentable: \(s) needs a live tab root"
            case .notNative: return "not-native: the Coach tab is not native"
            }
        }
    }

    public var environment = Environment()
    public let shell: ShellContract
    /// `Application Support/FPShell`: the breaker book and the screens' crash markers.
    public let folder: URL
    let defaults: UserDefaults

    /// The binding to one web view.
    final class Binding {
        weak var webView: WKWebView?
        let pageBuild: String?
        var link: LinkState
        let pageLink: PageLink
        let screens: ScreenHost
        let handler: DocumentHandler
        var helloTimer: DispatchWorkItem?
        var documents = 0
        var bootDones = 0

        init(webView: WKWebView, pageBuild: String?, link: LinkState, pageLink: PageLink, screens: ScreenHost, handler: DocumentHandler) {
            self.webView = webView
            self.pageBuild = pageBuild
            self.link = link
            self.pageLink = pageLink
            self.screens = screens
            self.handler = handler
        }
    }

    private(set) var binding: Binding?
    private var launched = false
    /// The book while no link holds it (between launches, before the first install).
    private var storedBook = BreakerBook()
    /// Markers the last launch left, read at launch and recorded through the first link.
    private var foundMarkers: [CrashMarker] = []
    /// Their lines, for Settings and the probe.
    public private(set) var markersFound: [String] = []
    /// Settings > About's counters: the totals kept across launches, and this launch's.
    public private(set) var counters = ShellCounters()
    public private(set) var launchCounts = LaunchCounts()
    /// Since when the app has been active without a break (nil while it is not): a page hidden before that moment was the
    /// app leaving the screen, not a native screen hiding the page.
    var activeSince: Date?
    /// Whether the app is in use now (tests set their own).
    var appActive: () -> Bool = { UIApplication.shared.applicationState == .active }
    /// The system's major version, for the gate's iOS 26 floor of `tabs` (contract 2.2, D39; tests set their own).
    var osMajor: () -> Int = { ProcessInfo.processInfo.operatingSystemVersion.majorVersion }
    #if DEBUG
    var debug = ShellDebug()
    /// Debug builds: what the App target lets the scenario runner do that FPUI cannot reach itself (ShellProbe's `hook`
    /// step), by name: "policy" writes a local policy file and fetches it (FPHost FPPolicy).
    public static var debugHooks: [String: ([String: Any]) -> Void] = [:]
    #endif

    /// `binary`: the pieces this binary has (tests that model build 60 pass `["coach"]`).
    init(defaults: UserDefaults = .standard, folder: URL? = nil, shellBuild: String? = nil, binary: [String] = ShellContract.binaryScreens) {
        self.defaults = defaults
        let build = shellBuild ?? (Bundle.main.infoDictionary?["CFBundleVersion"] as? String) ?? "0"
        shell = ShellContract(shell: build, screens: binary)
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        self.folder = folder ?? support.appendingPathComponent("FPShell", isDirectory: true)
        super.init()
    }

    // MARK: Launch

    /// Once per process, before the first web view binds: the Debug options, the book, the markers the last launch left.
    private func launch() {
        guard !launched else { return }
        launched = true
        #if DEBUG
        debug = ShellDebug(arguments: ProcessInfo.processInfo.arguments)
        #endif
        storedBook = Self.loadBook(folder: folder, defaults: defaults)
        counters = ShellCounters.decoded(defaults.data(forKey: Self.countersKey))
        if counters.since == nil {
            counters.since = Date()
            saveCounters()
        }
        let markers = ScreenMarkers(folder: folder)
        for (url, marker) in markers.found(defaultShell: shell.shell) {
            try? FileManager.default.removeItem(at: url)   // a marker acts once
            guard let marker else { continue }
            markersFound.append(marker.line)
            #if DEBUG
            if debug.ignoreMarker {
                Self.log.error("shell: crash marker found (\(marker.line, privacy: .public)), ignored (-fpIgnoreMarker)")
                continue
            }
            #endif
            Self.log.error("shell: crash marker found (\(marker.line, privacy: .public)): that screen is off for this shell and page build")
            foundMarkers.append(marker)
        }
        launchCounts.markersFound = markersFound
        activeSince = appActive() ? Date() : nil
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(didEnterBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        nc.addObserver(self, selector: #selector(willEnterForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
        nc.addObserver(self, selector: #selector(didBecomeActive), name: UIApplication.didBecomeActiveNotification, object: nil)
        nc.addObserver(self, selector: #selector(willResignActive), name: UIApplication.willResignActiveNotification, object: nil)
        #if DEBUG
        ShellProbe.startIfAsked(bridge: self, arguments: ProcessInfo.processInfo.arguments)
        ShellProbe.shared?.event("launch", ["shell": shell.shell, "markersFound": markersFound, "ignored": debug.ignoreMarker,
                                            "book": Self.bookJSON(storedBook)])
        #endif
    }

    // MARK: Install and rebind

    /// Binds to a new web view (`capacitorDidLoad`) and returns the screens its first document may present (ScreenGate
    /// for the page build being served), for the flag the App injects at document start. Call before the page loads.
    @discardableResult
    public func install(webView: WKWebView, presenter: UIViewController, pageBuild: String?) -> [String] {
        launch()
        if let b = binding, b.webView === webView { return gate(page: pageBuild, book: b.link.book).on }
        if let old = binding { detach(old, why: "a newer web view") }
        var link = LinkState(shell: shell, book: storedBook, foreground: UIApplication.shared.applicationState != .background)
        let now = Date()
        var fx: [LinkEffect] = []
        if !foundMarkers.isEmpty {
            let markers = foundMarkers
            foundMarkers = []
            fx += link.editBook { $0.recordStaleMarkers(markers, at: now) }
            for _ in markers { counters.markers.add(at: now) }
            launchCounts.markers += markers.count
            saveCounters()
        }
        #if DEBUG
        if debug.clearVerdicts { fx += link.editBook { book in for s in self.shell.screens { book.clearDisabled(piece: s) } } }
        if debug.clearBreaker { fx += link.editBook { $0.screens = [:] } }
        #endif
        let pageLink = PageLink(webView: webView)
        // the live chat's store (plan task C7), its composer kept in these defaults (fpDraft.coach)
        let screens = ScreenHost(presenter: presenter, webView: webView, shellBuild: shell.shell, pageBuild: pageBuild, markerFolder: folder,
                                 coach: CoachStore(draft: CoachComposerDraft(defaults: defaults)))
        let handler = DocumentHandler(self)
        let ucc = webView.configuration.userContentController
        ucc.removeScriptMessageHandler(forName: Self.handlerName)
        ucc.add(handler, name: Self.handlerName)
        ucc.addUserScript(WKUserScript(source: Self.documentStartScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        #if DEBUG
        for s in ShellProbe.shared?.documentStartScripts ?? [] {
            ucc.addUserScript(WKUserScript(source: s, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        #endif
        let b = Binding(webView: webView, pageBuild: pageBuild, link: link, pageLink: pageLink, screens: screens, handler: handler)
        binding = b
        wire(b)
        apply(fx, b)
        if fx.contains(.bookChanged) == false { saveBook(b.link.book) }
        let on = gate(page: pageBuild, book: b.link.book)
        Self.log.info("shell: bound to the web view (page \(pageBuild ?? "?", privacy: .public), shell \(self.shell.shell, privacy: .public)); screens on: \(on.on.joined(separator: ","), privacy: .public)\(on.off.isEmpty ? "" : "; off: " + on.off.keys.sorted().map { "\($0) (\(Self.describe(on.off[$0]!)))" }.joined(separator: ", "), privacy: .public)")
        #if DEBUG
        ShellProbe.shared?.installed(webView: webView)
        #endif
        return on.on
    }

    /// A scene went (`sceneDidDisconnect`): its web view lets go now, its screens with it.
    public func sceneDisconnected(webView: WKWebView?) {
        if let b = binding, webView == nil || b.webView === webView || b.webView == nil {
            detach(b, why: "scene disconnected")
        }
    }

    private func detach(_ b: Binding, why: String) {
        b.helloTimer?.cancel()
        b.pageLink.setBoot(nil)
        b.screens.tearDown()
        b.webView?.configuration.userContentController.removeScriptMessageHandler(forName: Self.handlerName)
        storedBook = b.link.book
        if binding === b { binding = nil }
        Self.log.info("shell: detached from a web view (\(why, privacy: .public))")
    }

    private func wire(_ b: Binding) {
        var hooks = ScreenHost.Hooks()
        hooks.send = { [weak self, weak b] intent in
            guard let self, let b else { return }
            self.screenIntent(intent, b, nil)
        }
        hooks.ask = { [weak self, weak b] intent, done in
            guard let self, let b else { return done(.notLinked) }
            self.screenIntent(intent, b, done)
        }
        hooks.willCover = { [weak self, weak b] in
            guard let self, let b else { return }
            self.send(.shellCovered(on: true), b)
        }
        hooks.didUncover = { [weak self, weak b] in
            guard let self, let b else { return }
            self.send(.shellCovered(on: false), b)
        }
        hooks.userDismissed = { [weak self, weak b] screen in
            guard let self, let b else { return }
            self.userDismissed(screen, b)
        }
        hooks.failed = { [weak self, weak b] screen, why in
            guard let self, let b else { return }
            Self.log.error("shell: \(screen, privacy: .public) could not go up (\(why, privacy: .public)): the page shows its own")
            self.apply(b.link.withdraw([screen]), b)
        }
        b.screens.hooks = hooks
        #if DEBUG
        b.pageLink.onRecord = { r in ShellProbe.shared?.intentRecord(r) }
        #endif
    }

    // MARK: Documents

    /// Runs at every main-frame document start, before the page's own scripts.
    static let documentStartScript = "(function () { try { window.webkit.messageHandlers.\(handlerName).postMessage({ doc: 'start' }); } catch (e) {} })();"

    final class DocumentHandler: NSObject, WKScriptMessageHandler {
        weak var bridge: ShellBridge?
        init(_ bridge: ShellBridge) { self.bridge = bridge }

        func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
            MainActor.assumeIsolated { bridge?.documentStarted(message) }
        }
    }

    fileprivate func documentStarted(_ message: WKScriptMessage) {
        guard let b = binding, let wv = b.webView, message.webView === wv, message.frameInfo.isMainFrame else { return }
        b.documents += 1
        let fx = b.link.documentStarted(pageBuild: b.pageBuild, at: Date())
        Self.log.info("shell: document #\(b.documents) started (page \(b.pageBuild ?? "?", privacy: .public))")
        apply(fx, b)
        scheduleHelloDeadline(b)
        #if DEBUG
        ShellProbe.shared?.event("document", ["n": b.documents, "effects": fx.map(Self.describe)])
        #endif
    }

    private func scheduleHelloDeadline(_ b: Binding) {
        b.helloTimer?.cancel()
        b.helloTimer = nil
        guard let at = b.link.helloDeadline(from: Date()) else { return }
        let work = DispatchWorkItem { [weak self, weak b] in
            MainActor.assumeIsolated {
                guard let self, let b else { return }
                let fx = b.link.tick(at: Date())
                if !fx.isEmpty { Self.log.error("shell: no hello from the page within the deadline") }
                self.apply(fx, b)
            }
        }
        b.helloTimer = work
        DispatchQueue.main.asyncAfter(deadline: .now() + max(0, at.timeIntervalSinceNow) + 0.05, execute: work)
    }

    @objc private func didEnterBackground() {
        guard let b = binding else { return }
        apply(b.link.setForeground(false, at: Date()), b)
        b.helloTimer?.cancel()
    }

    @objc private func willEnterForeground() {
        guard let b = binding else { return }
        apply(b.link.setForeground(true, at: Date()), b)
        scheduleHelloDeadline(b)
    }

    @objc private func didBecomeActive() {
        activeSince = Date()
    }

    @objc private func willResignActive() {
        activeSince = nil
    }

    // MARK: Page to Swift (the TrovoShell plugin, on the main thread)

    /// A TrovoShell call from the page in `webView`; `done` resolves or rejects it.
    public func pageMessage(_ method: String, options: [String: Any], webView: WKWebView?,
                            done: @escaping (Result<[String: Any], Error>) -> Void) {
        guard let b = binding, let wv = b.webView, webView == nil || webView === wv else {
            done(.failure(Refusal.notThisPage))
            return
        }
        let message: PageMessage
        do {
            message = try PageMessage(method: method, options: try JSONValue(foundation: options))
        } catch {
            Self.log.error("shell: \(method, privacy: .public) did not decode: \(String(describing: error), privacy: .public)")
            done(.failure(Refusal.badMessage("\(method): \(error)")))
            return
        }
        let now = Date()
        switch message {
        case .hello(let h):
            let (reply, after) = hello(h, b, at: now)
            done(.success(reply))
            after()   // the resync goes after the answer: the page takes its screens over first
        case .bootDone(let page):
            b.bootDones += 1
            done(.success([:]))
            environment.bootDone(page, wv)
            #if DEBUG
            ShellProbe.shared?.bootDone(page: page)
            #endif
        case .present(let s):
            // build 61's pieces that no present brings up here: the bar is never presented, and the native Coach tab
            // needs a live tab root (H7 and H8 build both; until then no root is a tab root)
            if s == "tabs" || s == "coachHome" {
                Self.log.error("shell: present \(s, privacy: .public) refused: not presentable")
                done(.failure(Refusal.notPresentable(s)))
                return
            }
            guard b.link.isLive(s) else {
                Self.log.error("shell: present \(s, privacy: .public) refused: not on for this document")
                done(.failure(Refusal.notLive(s)))
                return
            }
            guard b.screens.present(s) else {
                Self.log.error("shell: present \(s, privacy: .public) refused: no model")
                done(.failure(Refusal.noModel(s)))
                return
            }
            done(.success([:]))
        case .dismiss(let s):
            b.screens.dismiss(s)
            done(.success([:]))
        case .model(let push):
            done(.success([:]))
            model(push, b, at: now)
        case .toast(let t):
            b.screens.toast(t)
            done(.success([:]))
        case .confirm(let c):
            b.screens.confirm(c)
            done(.success([:]))
        case .log(let line):
            switch line.level {
            case "error"?: Self.pageLog.error("\(line.text, privacy: .public)")
            case "debug"?: Self.pageLog.debug("\(line.text, privacy: .public)")
            default: Self.pageLog.notice("\(line.text, privacy: .public)")
            }
            done(.success([:]))
        case .status:
            // `refresh` (About's "Check the switches now", contract 3.10) forces a policy fetch from H8 on; until then the
            // status as it stands
            done(.success(status(b)))
        case .reset(let s):
            guard shell.screens.contains(s) else {
                done(.failure(Refusal.badMessage("reset: this binary has no \(s) screen")))
                return
            }
            // through the link, so the book is saved and nothing of this document changes: a screen that went off stays
            // off for it, and the next document's hello finds the screen on
            apply(b.link.editBook { $0.turnBackOn(screen: s) }, b)
            Self.log.notice("shell: the owner turned \(s, privacy: .public) back on (Settings > About): from the next document")
            done(.success(status(b)))
        case .visibility(let v):
            done(.success(["counted": noteVisibility(v, at: now)]))
        case .selectTab, .sheets:
            // tabs mode needs a live tab root, which no scene builds yet (H7)
            done(.failure(Refusal.off))
        case .setSwitch(let s, _):
            // the shell's switch file comes with H6 and H8
            done(.failure(Refusal.noSwitch(s)))
        }
        #if DEBUG
        ShellProbe.shared?.pageMessage(method, message)
        #endif
    }

    private func hello(_ h: HelloRequest, _ b: Binding, at now: Date) -> (reply: [String: Any], after: () -> Void) {
        // the pieces' own checks for the hello's page build: the link applies the dependency rule for its root (3.2)
        let answer = b.link.hello(h, ownChecks: ownChecks(page: h.page, book: b.link.book), at: now)
        let reply = answer.reply.takingOver(b.screens.shown)
        let fx = answer.effects
        apply(fx, b)
        // a screen still up that this document may not have goes down (the page never had it)
        for s in b.screens.shown where !reply.up.contains(s) {
            Self.log.info("shell: \(s, privacy: .public) is not this document's: down")
            b.screens.dismiss(s)
        }
        let linked = b.link.link
        Self.log.notice("fp: hello page \(h.page, privacy: .public) boot \(h.boot ?? "-", privacy: .public): v\(reply.v) \(reply.screens.joined(separator: ","), privacy: .public)\(reply.up.isEmpty ? "" : " (up " + reply.up.joined(separator: ",") + ")", privacy: .public)\(reply.why.map { " refused: " + $0 } ?? "", privacy: .public)")
        let up = reply.up
        let after: () -> Void = { [weak self, weak b] in
            guard let self, let b, let linked, b.link.link == linked else { return }
            for s in up { self.resync(s, b) }
            #if DEBUG
            if self.debug.smoke { self.smoke(b) }
            #endif
        }
        return ((reply.json.foundation as? [String: Any]) ?? [:], after)
    }

    /// A screen still up from the document before: the page has taken it over; it hears it is covered again and the
    /// screen draws this document's model (a snapshot). Nothing from the document before is sent again.
    private func resync(_ screen: String, _ b: Binding) {
        send(.shellCovered(on: true), b)
        guard screen == "coach" else { return }
        b.pageLink.send(.coachSnapshot) { [weak self, weak b] outcome in
            guard let self, let b else { return }
            self.finished(.coachSnapshot, outcome, b)
            guard case .answered(.done(let reply)) = outcome, let json = reply.value["json"]?.string else { return }
            let model = try? CoachModel.decode(json)
            let (verdict, fx) = b.link.modelReceived(screen: screen, rev: model?.rev ?? 0, boot: model?.boot, decoded: model != nil, at: Date())
            if verdict == .apply, let model { b.screens.update(screen, model: model) }
            self.apply(fx, b)
            Self.log.info("shell: \(screen, privacy: .public) resynced on boot \(model?.boot ?? "?", privacy: .public) (\(String(describing: verdict), privacy: .public))")
        }
    }

    private func model(_ push: ModelPush, _ b: Binding, at now: Date) {
        let decoded: CoachModel?
        do {
            decoded = try CoachModel.decode(push.json)
        } catch {
            decoded = nil
            Self.log.error("shell: \(push.screen, privacy: .public) model rev \(push.rev) did not decode: \(String(describing: error), privacy: .public)")
        }
        let (verdict, fx) = b.link.modelReceived(screen: push.screen, rev: push.rev, boot: decoded?.boot, decoded: decoded != nil, at: now)
        if verdict == .apply, let decoded { b.screens.update(push.screen, model: decoded) }
        apply(fx, b)
    }

    // MARK: Swift to page

    /// An intent from a native screen; `done` hears how it ended (the chat's store follows each message the owner sent:
    /// one that never reached the page goes back in the composer, never resent).
    private func screenIntent(_ intent: Intent, _ b: Binding, _ done: ((PageLink.Outcome) -> Void)?) {
        b.pageLink.send(intent) { [weak self, weak b] outcome in
            guard let self, let b else { return }
            self.finished(intent, outcome, b)
            done?(outcome)
        }
    }

    /// An intent from the shell's own tools (ShellProbe): through the link like any other, its outcome counted.
    func sendCounted(_ intent: Intent, done: @escaping (PageLink.Outcome) -> Void) {
        guard let b = binding else {
            DispatchQueue.main.async { done(.notLinked) }
            return
        }
        send(intent, b, then: done)
    }

    private func send(_ intent: Intent, _ b: Binding, then: ((PageLink.Outcome) -> Void)? = nil) {
        b.pageLink.send(intent) { [weak self, weak b] outcome in
            guard let self, let b else { return }
            self.finished(intent, outcome, b)
            then?(outcome)
        }
    }

    /// Every answered intent goes to the link (the breaker); one from a gone document or none linked counts for nothing.
    private func finished(_ intent: Intent, _ outcome: PageLink.Outcome, _ b: Binding) {
        guard case .answered(let o) = outcome, let boot = b.link.link?.boot else { return }
        apply(b.link.intentFinished(intent, boot: boot, outcome: o, at: Date()), b)
    }

    /// The owner took a screen down: the page hears coach.back. If it stays on the screen (Back refused, the bridge
    /// failed), the screen goes up again over its placeholder.
    private func userDismissed(_ screen: String, _ b: Binding) {
        guard screen == "coach" else { return }
        send(.coachBack, b) { [weak b] outcome in
            guard let b else { return }
            switch outcome {
            case .answered(.done), .documentGone, .notLinked: break
            default: b.screens.userBackRefused(screen)
            }
        }
    }

    // MARK: Effects

    private func apply(_ fx: [LinkEffect], _ b: Binding) {
        for e in fx {
            switch e {
            case .linked(let l):
                b.pageLink.setBoot(l.boot)
                b.screens.pageBuild = l.page
            case .documentGone(let boot):
                Self.log.info("shell: document \(boot, privacy: .public) gone: its pending intents end unsent, its confirm closes")
                b.pageLink.setBoot(nil)
                b.screens.closeConfirmAsStale()
                b.screens.forgetModels(exceptUp: true)
            case .screenOff(let screen, let reason):
                Self.log.error("shell: \(screen, privacy: .public) off for this document: \(reason.code, privacy: .public)")
                if case .tripped(let t) = reason {
                    counters.trips.add(at: t.at)
                    launchCounts.trips += 1
                    saveCounters()
                }
                if b.screens.isUp(screen) { b.screens.dismiss(screen) }
                if b.link.link != nil { send(.screensOff(screen: screen, why: reason.code), b) }
            case .breakersReset(let page):
                Self.log.info("shell: a new page build (\(page, privacy: .public)) starts the screens' breakers clean")
            case .bookChanged:
                saveBook(b.link.book)
            case .fellBack(let why):
                // no scene adopts a tab root before H7, so the link never falls one back yet. H8 runs the root's
                // fallback here, first among the event's effects (the bar hidden, the web view shown, the chat popped
                // without animation, the Coach tab dropped); the screenOffs after it only tell the page (10.3)
                Self.log.error("shell: the tab root fell back (\(why.rawValue, privacy: .public))")
            case .pingWhenIdle:
                // a state intent's timeout is held (contract 4.4): the ping confirms it, at the end of the queue
                send(.ping, b)
            }
        }
    }

    // MARK: The policy file (FPHost FPPolicy.changed, through the App)

    /// The policy file moved these screens' switches: one turned off goes down now, for the rest of the document (the
    /// page shows its own); one turned on is back from the next document. `tabs` turned off under a live tab root falls
    /// the root back at once (LinkState's withdraw: `fellBack(.policy)` first, then `screens.off` for the pieces).
    public func policyChanged(screens: [String]) {
        guard let b = binding else { return }
        let policy = environment.policy()
        let off = screens.filter { !policy.screenOn($0) }
        guard !off.isEmpty else { return }
        Self.log.notice("shell: the policy file turned off \(off.joined(separator: ","), privacy: .public)")
        apply(b.link.withdraw(off), b)
    }

    // MARK: Settings > About

    /// TrovoShell `status` (FPCore ScreenStatus): every screen of this binary for the page build being served, on or off
    /// and why, whether this document shows it, and the counters (this launch's and in all).
    func status(_ b: Binding) -> [String: Any] {
        let page = b.link.pageBuild ?? b.pageBuild
        var launch = launchCounts
        launch.leftWindow = ShellWebView.leftWindowWhileActive
        let json = ScreenStatus.json(shell: shell.shell, page: page, binary: shell.screens, gate: gate(page: page, book: b.link.book),
                                     live: b.link.liveScreens, book: b.link.book, counters: counters, launch: launch)
        return (json.foundation as? [String: Any]) ?? [:]
    }

    /// The page went hidden (or visible) while a native screen covered it. Counted only when it went hidden while the app
    /// was in use: going to the background, or coming back, hides the page by design (and its report can arrive after
    /// the app is active again, so the page's own time must fall after the app became active).
    @discardableResult
    func noteVisibility(_ v: VisibilityReport, at now: Date) -> Bool {
        guard v.hidden, appActive(), let since = activeSince, (v.at ?? now) >= since else { return false }
        counters.hidden.add(at: v.at ?? now)
        launchCounts.hidden += 1
        saveCounters()
        Self.log.fault("shell: the page went hidden under a native screen while the app was active (\(self.launchCounts.hidden) this launch)")
        return true
    }

    /// ShellWebView left its window while the app was active (counted there for this launch): kept in the totals.
    func noteLeftWindow(at now: Date = Date()) {
        counters.leftWindow.add(at: now)
        saveCounters()
    }

    private func saveCounters() {
        defaults.set(counters.encoded(), forKey: Self.countersKey)
    }

    // MARK: Gate and book

    func gate(page: String?, book: BreakerBook) -> (on: [String], off: [String: ScreenGate.Off]) {
        // The device switch for the native chat is the page's own (Settings > About, kt_native_off): a page with it on
        // never presents. The shell keeps none of its own in build 60. A classic root until H7 adopts a tab root.
        ScreenGate.evaluate(binary: shell.screens, deviceOff: [], policy: environment.policy(), book: book,
                            shellBuild: shell.shell, pageBuild: page, os: osMajor())
    }

    /// The pieces' own checks for a page build (ScreenGate.base, the OS included): what a hello is negotiated from.
    func ownChecks(page: String?, book: BreakerBook) -> ScreenGate.Base {
        ScreenGate.base(binary: shell.screens, deviceOff: [], policy: environment.policy(), book: book,
                        shellBuild: shell.shell, pageBuild: page, os: osMajor())
    }

    private func saveBook(_ book: BreakerBook) {
        storedBook = book
        let data = book.encoded()
        defaults.set(data, forKey: Self.bookKey)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try data.write(to: folder.appendingPathComponent(Self.bookFileName), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch {
            Self.log.error("shell: the breaker book could not be written (UserDefaults keeps a copy)")
        }
    }

    /// The book: the file when it reads (UserDefaults reaches its disk later, through cfprefsd: an app killed and
    /// installed again soon after came back to an older copy there), else the UserDefaults copy.
    nonisolated static func loadBook(folder: URL, defaults: UserDefaults) -> BreakerBook {
        if let data = try? Data(contentsOf: folder.appendingPathComponent(bookFileName)),
           (try? JSONSerialization.jsonObject(with: data)) is [String: Any] {
            return BreakerBook.decoded(data)
        }
        return BreakerBook.decoded(defaults.data(forKey: bookKey))
    }

    nonisolated static func bookJSON(_ book: BreakerBook) -> Any {
        (try? JSONSerialization.jsonObject(with: book.encoded())) ?? [:]
    }

    nonisolated static func describe(_ off: ScreenGate.Off) -> String {
        switch off {
        case .deviceSwitch: return "device switch"
        case .policy: return "policy file"
        case .crashMarker(let d): return d.why
        case .breaker(let t): return "breaker: " + t.detail
        case .os: return "needs iOS \(ScreenGate.tabsMinOS) or later"
        case .declined(let page): return "declined by page build \(page)"
        case .needs(let pieces): return "needs " + pieces.joined(separator: ", ")
        }
    }

    nonisolated static func describe(_ e: LinkEffect) -> String {
        switch e {
        case .linked(let l): return "linked \(l.boot) v\(l.v) \(l.screens.joined(separator: ","))"
        case .documentGone(let boot): return "documentGone \(boot)"
        case .screenOff(let s, let r): return "screenOff \(s) \(r.code)"
        case .breakersReset(let p): return "breakersReset \(p)"
        case .bookChanged: return "bookChanged"
        case .fellBack(let why): return "fellBack \(why.rawValue)"
        case .pingWhenIdle: return "pingWhenIdle"
        }
    }

    // MARK: -fpSmoke

    #if DEBUG
    /// `-fpSmoke`: once the page has said hello, a ping through the real link; the log says "fp: ping ok v1".
    private func smoke(_ b: Binding) {
        send(.ping, b) { outcome in
            if case .answered(.done(let reply)) = outcome {
                Self.log.notice("fp: ping ok v\(reply.value["v"]?.int ?? 0)")
            } else {
                Self.log.error("fp: ping failed: \(outcome.word, privacy: .public)")
            }
            ShellProbe.shared?.event("smoke", ["outcome": outcome.word])
        }
    }
    #endif

    // MARK: For the probe

    /// The link and the screens now.
    func describe() -> [String: Any] {
        guard let b = binding else { return ["bound": false] }
        var phase: String
        switch b.link.phase {
        case .idle: phase = "idle"
        case .awaitingHello: phase = "awaiting hello"
        case .linked: phase = "linked"
        case .unlinked(.noHello): phase = "no hello"
        case .unlinked(.refused(let r)): phase = "refused " + r.rawValue
        }
        return [
            "bound": true, "phase": phase, "boot": b.link.link?.boot ?? NSNull(), "linkedPage": b.link.link?.page ?? NSNull(),
            "negotiated": b.link.link?.screens ?? [], "live": b.link.liveScreens, "pageBuild": b.link.pageBuild ?? NSNull(),
            "documents": b.documents, "bootDones": b.bootDones, "pending": b.pageLink.pending,
            "book": Self.bookJSON(b.link.book), "screens": b.screens.describe(), "markersFound": markersFound,
            "leftWindow": ShellWebView.leftWindowWhileActive, "gate": gate(page: b.link.pageBuild ?? b.pageBuild, book: b.link.book).on,
            "status": status(b),
        ]
    }
}

// MARK: - The web view

/// The shell's WKWebView (`SuperoViewController.webView(with:configuration:)`): it counts every time it leaves its
/// window while the app is active, which nothing in the shell does by design (a native screen goes over it, never in
/// its place; decision.md section 4), and says so in the log.
public final class ShellWebView: WKWebView {
    public private(set) static var leftWindowWhileActive = 0

    public override func willMove(toWindow newWindow: UIWindow?) {
        if newWindow == nil, window != nil, UIApplication.shared.applicationState == .active {
            Self.leftWindowWhileActive += 1
            ShellBridge.log.fault("shell: the web view left its window while the app was active (\(Self.leftWindowWhileActive) this launch)")
            ShellBridge.shared.noteLeftWindow()   // Settings > About counts it (in all, across launches)
        }
        super.willMove(toWindow: newWindow)
    }
}

#if DEBUG
/// Launch arguments the shell reads in a Debug build (never in a Release build).
struct ShellDebug {
    /// `-fpSmoke`: ping after each hello and log "fp: ping ok v1".
    var smoke = false
    /// `-fpIgnoreMarker`: a screen crash marker the last launch left is reported but gives no verdict (the tools end
    /// the app with simctl terminate, which can land with a screen up).
    var ignoreMarker = false
    /// `-fpClearVerdicts`: the screens' crash verdicts go before the first document.
    var clearVerdicts = false
    /// `-fpClearBreaker`: the screens' native breaker records go before the first document.
    var clearBreaker = false

    init(arguments a: [String] = []) {
        smoke = a.contains("-fpSmoke")
        ignoreMarker = a.contains("-fpIgnoreMarker")
        clearVerdicts = a.contains("-fpClearVerdicts")
        clearBreaker = a.contains("-fpClearBreaker")
    }
}
#endif
#endif
