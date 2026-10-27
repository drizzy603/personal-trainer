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
///   Build 61 adds the short sections (SectionMarker, contract 10.2), written whatever the app's state: `section(_:_:)`
///   around the tab root's construction and its own sections (`tabs@<page> shell <n>`: a verdict gives the classic
///   root), and every model's decode and apply inside `model <screen>@<page> shell <n>` (a verdict turns that piece off
///   for the pair). The launch reads and removes them with the screen markers.
/// - **The device switches** the shell keeps itself (ShellSwitches, `FPShell/switches.json`: the tab bar's, contract
///   3.5) reach the gate as `deviceOff`; the native chat's stays the page's `kt_native_off`.
/// - **The tab root** (build 61, contract 1.3, 2.2, 3.3-3.7, 4.3, 8, 9): `install(..., launch:)` decides the root before
///   the page loads (a tab root iff SceneDelegate allows one and `tabs` passes its own checks, so the flag and the root
///   agree), and `adopt(root:)` binds the RootTabController SceneDelegate built: the link negotiates on the tab root's
///   rule, ScreenHost pushes the chat in the Coach tab's stack, and the root's hooks reach the page (`shell.covered`,
///   `tabs.select` for the owner's taps, deep links and strays but never for a page selection, `tabs.bar` for the
///   shell's own bar changes, the `tabs` section, strays counted). `selectTab` and `sheets` drive the root;
///   `tabs.select` and `tabs.bar` are state, never replayed: after a failed one the current state goes once the link is
///   idle, with a new seq or rev. Warm deep links go through `deepLink(_:)`, which selects first under a live tab root
///   and hands the URL to `_trovoOpen` as an argument, never inside a script's source. Nothing here holds the root, its
///   slots, the web controller or the web view strongly: a scene's teardown frees them.
/// - **Hello under the tab root** (H8, contract 3.2): the reply carries `tabs {selected, seq, bar}` iff `tabs` is
///   negotiated; a page build that leaves `tabs` out (or names `tabs` without `coachHome`) declines it, and so does a
///   version refusal. The Coach tab's modes are the scene's (contract 1.4, I13): WEB at once when a reply leaves
///   `coachHome` out, WAITING only before the scene's first declaration with a 3 s net after each hello's answer, a NATIVE
///   tab named in `up` and taken over by the new document; `dismiss coachHome` (the declaration's WEB half) and
///   `coachHome` going off turn it WEB, the chat popped without animation and the page uncovered while Coach is selected.
/// - **The fallback** (contract 10.3, D7, I14), once per scene, on the link's `fellBack`: the root's half, ScreenHost out
///   of the Coach tab's stack, `screens.off` for the pieces the tab root's rule had negotiated (`tabs` too unless the page
///   itself asked with `dismiss tabs`), `shell.covered {on:false}` when the Coach tab covered the page, `selectTab` and
///   `sheets` refused `off`, every later hello classic, and a document-start script deleting the flag's `tabs`. Its
///   triggers: a hello without `tabs` (`page`, `refused`, `policy`), `dismiss tabs` (`page`), no hello (`no-hello`), a
///   `tabs` trip (`failures`), the policy file (`policy`), the owner's `setSwitch` (`switch`).
/// - **The composer's words** (contract 4.2, D21): every `screens.off {screen:'coach'}` carries the native composer's
///   unsent words, which go from the native composer only once the page answers `took: true`.
///
/// - **Settings > About** asks `status` (FPCore ScreenStatus: every screen of this binary, on or off and why, whether the
///   owner can try it again; the root, the fallback, the shell's switches and the policy file's last check), `status
///   {refresh: true}` (a forced policy fetch first, at most once a minute), `setSwitch` (the tab bar's switch) and `reset`
///   ("Try the native chat again": the screen's crash verdicts, breaker record and decline go through the link's book,
///   for the next document). The counters the owner cannot see in os_log are kept across
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
        /// The policy file's state, for the status's last check (`policy {at, result}`, contract 10.5): FPHost FPPolicy's
        /// `state`; nil when the host keeps none.
        public var policyState: () -> PolicyState? = { nil }
        /// A forced fetch of the policy file now, for `status {refresh: true}` (About's "Check the switches now", contract
        /// 3.10, D43): FPHost `FPPolicy.shared.fetchIfDue(force: true, done:)`, in every configuration (H9). `done` once
        /// the fetch has ended, after what it changed has reached `policyChanged` (FPPolicy posts `changed` first).
        public var fetchPolicy: (_ done: @escaping () -> Void) -> Void = { done in done() }
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
        /// `present tabs` (never presented), or `present coachHome` without a live tab root; `why` words any other
        /// reason (the interim before the native Coach tab is wired, contract 15.2).
        case notPresentable(String, why: String? = nil)
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
            case .notPresentable(let s, let why):
                if let why { return "not-presentable: " + why }
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
        /// SceneDelegate's launch values (nil: a controller made any other way, which never builds a tab root).
        let launch: ShellLaunch?
        /// `install`'s decision (contract 2.2): this scene's root is a tab root, and the flag carries `tabs`. Kept for the
        /// scene; a fallback leaves it as it was (the link's `tabsRoot` says whether the root is still live).
        let tabsRootDecided: Bool
        /// The adopted RootTabController (iOS 26+; `RootTabController` cannot be a stored property's type here), weakly:
        /// the window holds it, and a scene's teardown must free it with the web view (H7, maps/lessons.md:29).
        weak var tabRoot: UIViewController?
        /// A `tabs.select` or `tabs.bar` failed (contract 4.3, D12): the current selection or bar goes once the link is
        /// idle, never the failed one again. Per document: a document start clears both (hello's reply carries both).
        var restateSelect = false
        var restateBar = false
        /// Restates of each sent since the page last answered one of that kind: at most `ShellBridge.restateLimit` go in
        /// a row. Per document, as the flags.
        var selectRestates = 0
        var barRestates = 0
        /// The scene's fallback (contract 10.3, 10.5), at most once: why and when, for the status.
        var fellBack: FellBack?
        /// A WAITING Coach tab's net (contract 1.4, D17): it turns WEB 3 s after a hello's answer that negotiated
        /// `coachHome` unless the page declared it (a `present` or `dismiss` of `coachHome`) first.
        var coachNet: DispatchWorkItem?

        init(webView: WKWebView, pageBuild: String?, link: LinkState, pageLink: PageLink, screens: ScreenHost, handler: DocumentHandler,
             launch: ShellLaunch?, tabsRoot: Bool) {
            self.webView = webView
            self.pageBuild = pageBuild
            self.link = link
            self.pageLink = pageLink
            self.screens = screens
            self.handler = handler
            self.launch = launch
            tabsRootDecided = tabsRoot
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
    /// This launch's short-section markers (contract 10.2), by file name, each opened at its kind's first section.
    private var sections: [String: SectionMarker] = [:]
    /// The kinds whose marker file could not be written this launch (said once in the log).
    private var sectionsUnwritten: Set<String> = []
    /// The shell's own device switches (`FPShell/switches.json`, contract 3.5), read at their first use: the launch's
    /// first gate.
    private(set) lazy var switches = ShellSwitches(folder: folder, defaults: defaults)
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
    /// Every link's hello deadline and failure limit (contract 2.3, 4.4; tests shorten the deadline).
    let linkConfig: LinkState.Config
    /// How long a WAITING Coach tab waits for the page's declaration after a hello's answer (contract 1.4: 3 s).
    nonisolated static let coachNetSeconds: TimeInterval = 3
    var coachNetSeconds = ShellBridge.coachNetSeconds
    /// `status {refresh: true}` forces a policy fetch at most once in `refreshEvery` (a refresh inside it reads the status
    /// as it stands) and answers once the fetch has ended or after `refreshWait`, whichever comes first (contract 3.10).
    nonisolated static let refreshEvery: TimeInterval = 60
    nonisolated static let refreshWait: TimeInterval = 10
    var refreshEvery = ShellBridge.refreshEvery
    var refreshWait = ShellBridge.refreshWait
    /// When `status {refresh}` last forced a fetch.
    private var lastRefresh: Date?
    #if DEBUG
    var debug = ShellDebug()
    /// The launch arguments the launch reads (tests set their own).
    var launchArguments: () -> [String] = { ProcessInfo.processInfo.arguments }
    /// Debug builds: what the App target lets the scenario runner do that FPUI cannot reach itself (ShellProbe's `hook`
    /// step), by name: "policy" writes a local policy file and fetches it (FPHost FPPolicy).
    public static var debugHooks: [String: ([String: Any]) -> Void] = [:]
    #endif

    /// `binary`: the pieces this binary has (tests that model build 60 pass `["coach"]`); `linkConfig`: every link's
    /// (tests pass a short hello deadline).
    init(defaults: UserDefaults = .standard, folder: URL? = nil, shellBuild: String? = nil, binary: [String] = ShellContract.binaryScreens,
         linkConfig: LinkState.Config = LinkState.Config()) {
        self.defaults = defaults
        self.linkConfig = linkConfig
        let build = shellBuild ?? (Bundle.main.infoDictionary?["CFBundleVersion"] as? String) ?? "0"
        shell = ShellContract(shell: build, screens: binary)
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        self.folder = folder ?? support.appendingPathComponent("FPShell", isDirectory: true)
        super.init()
    }

    // MARK: Launch

    /// Once per process, before the first web view binds and before this launch's first short section: the Debug
    /// options, the book, the markers the last launch left (the screens', then the short sections' left at `1`).
    private func launch() {
        guard !launched else { return }
        launched = true
        #if DEBUG
        debug = ShellDebug(arguments: launchArguments())
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
        // the short sections (contract 10.2): a file left at 1 is a death inside one; one at 0 says nothing and is
        // rewritten by this launch's first section of its kind
        for (url, marker) in SectionMarker.stale(folder: folder) {
            try? FileManager.default.removeItem(at: url)   // a marker acts once
            markersFound.append(marker.line)
            #if DEBUG
            if debug.ignoreMarker {
                Self.log.error("shell: crash marker found (\(marker.line, privacy: .public)), ignored (-fpIgnoreMarker)")
                continue
            }
            #endif
            let what = marker.piece == .tabs ? "the classic root" : "\(marker.piece.name) off"
            Self.log.error("shell: crash marker found (\(marker.line, privacy: .public)): \(what, privacy: .public) for this shell and page build")
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
        ShellProbe.startIfAsked(bridge: self, arguments: launchArguments())
        ShellProbe.shared?.event("launch", ["shell": shell.shell, "markersFound": markersFound, "ignored": debug.ignoreMarker,
                                            "book": Self.bookJSON(storedBook)])
        #endif
    }

    // MARK: Install and rebind

    /// Binds to a new web view (`capacitorDidLoad`) and returns the screens its first document may present (ScreenGate
    /// for the page build being served), for the flag the App injects at document start. Call before the page loads.
    /// No launch values: a classic root (build 60's call, kept until the App passes them, H9).
    @discardableResult
    public func install(webView: WKWebView, presenter: UIViewController, pageBuild: String?) -> [String] {
        install(webView: webView, presenter: presenter, pageBuild: pageBuild, launch: nil).screens
    }

    /// Binds to a new web view (`capacitorDidLoad`, inside SceneDelegate's `loadViewIfNeeded`) and decides the scene's
    /// root (contract 2.2): a tab root iff `scene` allows one and `tabs` passes its own checks for the page build being
    /// served (the OS, the shell's switch, the policy, a crash verdict, the breaker, a decline), so the flag and the root
    /// always agree. `screens` is the gate under that root, for the flag; the App adds `tabs` to the flag iff `tabsRoot`,
    /// and SceneDelegate then builds that root and hands a tab root to `adopt(root:)`. Call before the page loads.
    @discardableResult
    public func install(webView: WKWebView, presenter: UIViewController, pageBuild: String?, launch scene: ShellLaunch?) -> ShellInstall {
        launch()
        if let b = binding, b.webView === webView {
            return ShellInstall(screens: gate(page: pageBuild, book: b.link.book, tabsRoot: b.tabsRootDecided).on, tabsRoot: b.tabsRootDecided)
        }
        if let old = binding { detach(old, why: "a newer web view") }
        var link = LinkState(shell: shell, config: linkConfig, book: storedBook, foreground: UIApplication.shared.applicationState != .background)
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
        // the root (contract 2.2): the tab root iff the scene allows one and the bar's own checks pass for this page build,
        // read after this launch's markers reached the book (a `tabs@` verdict gives the classic root)
        let own = ownChecks(page: pageBuild, book: link.book)
        let tabsRoot = scene?.tabRootAllowed == true && own.on.contains("tabs")
        let b = Binding(webView: webView, pageBuild: pageBuild, link: link, pageLink: pageLink, screens: screens, handler: handler,
                        launch: scene, tabsRoot: tabsRoot)
        binding = b
        wire(b)
        apply(fx, b)
        if fx.contains(.bookChanged) == false { saveBook(b.link.book) }
        let on = gate(page: pageBuild, book: b.link.book, tabsRoot: tabsRoot)
        let root = tabsRoot ? "tab root (first \(scene?.first ?? "log"))"
            : "classic root" + (scene?.tabRootAllowed == true ? " (tabs: \(own.off["tabs"].map(Self.describe) ?? "off"))" : "")
        Self.log.info("shell: bound to the web view (page \(pageBuild ?? "?", privacy: .public), shell \(self.shell.shell, privacy: .public)), \(root, privacy: .public); screens on: \(on.on.joined(separator: ","), privacy: .public)\(on.off.isEmpty ? "" : "; off: " + on.off.keys.sorted().map { "\($0) (\(Self.describe(on.off[$0]!)))" }.joined(separator: ", "), privacy: .public)")
        #if DEBUG
        ShellProbe.shared?.installed(webView: webView)
        #endif
        return ShellInstall(screens: on.on, tabsRoot: tabsRoot)
    }

    /// Binds the tab root SceneDelegate built for this scene's web view (H9, inside the `tabs` section, before the page's
    /// first hello): the link negotiates on the tab root's rule (`adoptTabRoot`), the chat goes in the Coach tab's stack
    /// (ScreenHost's stack mode, its state read from the root through weak captures), and the root's hooks reach the page.
    /// Only for the web view `install` bound with a tab-root decision: a classic decision's flag has no `tabs`, so the page
    /// runs classic and a native bar over it would make two bars. Nothing here keeps the root alive.
    @available(iOS 26.0, *)
    public func adopt(root: RootTabController) {
        guard let b = binding, let wv = b.webView, root.webView === wv else {
            Self.log.fault("shell: a tab root for a web view the shell is not bound to: not adopted")
            return
        }
        guard b.tabsRootDecided else {
            Self.log.fault("shell: a tab root for a web view whose root was decided classic (its flag has no tabs): not adopted")
            return
        }
        guard b.tabRoot == nil else {
            if b.tabRoot !== root { Self.log.fault("shell: a second tab root for one web view: not adopted") }
            return
        }
        b.link.adoptTabRoot()
        guard b.link.tabsRoot else {
            Self.log.fault("shell: the tab root came after the page linked (or after a fallback): not adopted")
            return
        }
        b.tabRoot = root
        b.screens.attachStack(root.coachSlot.nav, state: StackState(
            selected: { [weak root] in root?.selected == "coach" },
            native: { [weak root] in root?.coachMode == .native },
            held: { [weak root] in root?.held ?? false },
            releaseHold: { [weak root] in root?.releaseHold() }))
        root.hooks = rootHooks(b, root)
        Self.log.info("shell: the tab root is adopted (\(root.selected, privacy: .public) selected, Coach \(root.coachMode.rawValue, privacy: .public))")
    }

    /// The root's hooks (contract 8.1, 8.4, 10.2): each captures the bridge, the binding and the root weakly, as `wire`'s do.
    @available(iOS 26.0, *)
    private func rootHooks(_ b: Binding, _ root: RootTabController) -> RootTabController.Hooks {
        var h = RootTabController.Hooks()
        h.covered = { [weak self, weak b] on in
            guard let self, let b else { return }
            self.send(.shellCovered(on: on), b)
        }
        h.selected = { [weak self, weak b, weak root] tab, seq, source, again in
            guard let self, let b else { return }
            switch source {
            case .tap, .deepLink, .stray:
                // the page draws the tab when it runs this intent: VoiceOver hears the move once it has (or once it failed)
                self.sendSelect(tab: tab, seq: seq, again: again, b) { [weak root] in root?.announceWeb(seq: seq) }
            case .page, .initial, .fallback:
                break   // no echo (contract 4.3, I3): the page asked, or nothing is linked yet
            }
        }
        h.stray = { [weak self] tab in self?.noteStray(tab) }
        h.barChanged = { [weak self, weak b] bar in
            guard let self, let b else { return }
            self.sendBar(bar, b)
        }
        h.section = { [weak self] entering in self?.section("tabs", entering: entering) }
        h.coachShown = { [weak b] _ in b?.screens.selectionChanged() }
        return h
    }

    /// The live tab root: adopted, and neither the link (a hello's decline, a trip, the policy) nor the root has fallen
    /// back. Nil under a classic root.
    @available(iOS 26.0, *)
    private func liveRoot(_ b: Binding) -> RootTabController? {
        guard b.link.tabsRoot, let root = b.tabRoot as? RootTabController, root.fellBack == nil else { return nil }
        return root
    }

    /// A scene went (`sceneDidDisconnect`): its web view lets go now, its screens with it.
    public func sceneDisconnected(webView: WKWebView?) {
        if let b = binding, webView == nil || b.webView === webView || b.webView == nil {
            detach(b, why: "scene disconnected")
        }
    }

    private func detach(_ b: Binding, why: String) {
        b.helloTimer?.cancel()
        b.coachNet?.cancel()
        b.coachNet = nil
        b.pageLink.setBoot(nil)
        b.screens.tearDown()
        // a root that outlives its binding (a newer web view's scene) tells this bridge nothing more
        if #available(iOS 26.0, *), let root = b.tabRoot as? RootTabController { root.hooks = RootTabController.Hooks() }
        b.tabRoot = nil
        b.restateSelect = false
        b.restateBar = false
        b.selectRestates = 0
        b.barRestates = 0
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
        // per document (contract 3.4, 4.3): the page's sheets state starts closed (the bar shows again on a web tab; the
        // page sends its baseline at _bootDone), and nothing failed is restated to the new document (hello carries both)
        b.restateSelect = false
        b.restateBar = false
        b.selectRestates = 0
        b.barRestates = 0
        if #available(iOS 26.0, *), let root = liveRoot(b) { root.resetSheets() }
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
            // contract 3.1, 3.6, in this order: the bar is never presented; the native Coach tab needs a live tab root (and,
            // until H10 wires N's hub, is refused under one too, contract 15.2: the page declares dismiss and shows its
            // web Coach under the native bar); then build 60's checks, with the chat pushed only onto a NATIVE Coach tab
            if s == "tabs" || s == "coachHome" {
                let refusal: Refusal
                if s == "coachHome", hasLiveRoot(b) {
                    refusal = .notPresentable(s, why: "the native Coach tab is not wired in this build yet")
                } else {
                    refusal = .notPresentable(s)
                }
                Self.log.error("shell: present \(s, privacy: .public) refused: \(String(describing: refusal), privacy: .public)")
                done(.failure(refusal))
                return
            }
            guard b.link.isLive(s) else {
                Self.log.error("shell: present \(s, privacy: .public) refused: not on for this document")
                done(.failure(Refusal.notLive(s)))
                return
            }
            if s == "coach", let mode = liveCoachMode(b), mode != "native" {
                // WAITING and WEB have no visible stack to push onto (contract 3.6, H-G9): the page draws its own chat
                Self.log.error("shell: present coach refused: the Coach tab is \(mode, privacy: .public)")
                done(.failure(Refusal.notNative))
                return
            }
            guard b.screens.present(s) else {
                Self.log.error("shell: present \(s, privacy: .public) refused: no model")
                done(.failure(Refusal.noModel(s)))
                return
            }
            done(.success([:]))
        case .dismiss(let s):
            switch s {
            case "tabs":
                // this document left tabs mode (contract 2.3, 3.6, D32, I14): under a live tab root the scene falls back
                // (`page`), the page build declines `tabs`, and the page hears `screens.off` for its live pieces but none
                // for `tabs` (it knows); under any other root (classic, fallen back) it is answered and changes nothing
                apply(b.link.fallBack(.page, pageAsked: true), b)
            case "coachHome":
                // the declaration's WEB half (contract 3.6): the page draws its own Coach in the Coach tab
                coachTurnsWeb(b, why: "the page dismissed coachHome", popChat: true)
            default:
                b.screens.dismiss(s)
            }
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
        case .status(let refresh):
            guard refresh else {
                done(.success(status(b)))
                break
            }
            // About's "Check the switches now" (contract 3.10, D43): a forced policy fetch (at most once a minute), whose
            // changes act as any fetch's do (`policyChanged`: a `tabs` off falls back at once), then the status
            refreshPolicy { [weak self, weak b] in
                guard let self, let b else { return done(.failure(Refusal.notThisPage)) }
                done(.success(self.status(b)))
            }
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
        case .selectTab(let tab, let intent):
            // contract 3.3: from the document's start, before hello; the funnel runs at once and the answer is the shell's
            // selection after it (the asked tab unless a newer selection crossed it). No tabs.select goes back (I3).
            guard #available(iOS 26.0, *), let root = liveRoot(b) else {
                done(.failure(Refusal.off))
                return
            }
            guard ShellTabs.isTab(tab) else {
                done(.failure(Refusal.badTab(tab)))
                return
            }
            let now = root.select(tab, source: .page(intent: intent))
            done(.success(["tab": now.tab, "seq": now.seq]))
        case .sheets(let open):
            // contract 3.4: the bar hides at once for a web overlay (a native Coach tab keeps it) and its numbers are
            // measured and answered in the same turn; before hello too
            guard #available(iOS 26.0, *), let root = liveRoot(b) else {
                done(.failure(Refusal.off))
                return
            }
            let bar = root.setSheets(open: open)
            done(.success(["bar": ["h": bar.h, "safe": bar.safe, "rev": bar.rev]]))
        case .setSwitch(let s, let on):
            // the shell's own device switch (contract 3.5, D5): `tabs` alone in 61, under every root of a binary that has
            // the bar (a classic root is where the owner turns it back on). Off falls back now under a live tab root and
            // holds at every later launch (the gate's `deviceOff`); on acts from the next launch. Answered with the status.
            guard ShellSwitches.pieces.contains(s), shell.screens.contains(s) else {
                done(.failure(Refusal.noSwitch(s)))
                return
            }
            if !switches.set(s, on: on) {
                Self.log.error("shell: \(ShellSwitches.fileName, privacy: .public) could not be written (UserDefaults keeps the switch)")
            }
            Self.log.notice("shell: the owner turned \(s, privacy: .public) \(on ? "on: from the next launch" : "off", privacy: .public) (Settings > About)")
            if !on { apply(b.link.fallBack(.switch), b) }
            done(.success(status(b)))
        }
        #if DEBUG
        ShellProbe.shared?.pageMessage(method, message)
        #endif
    }

    /// The page's hello (contract 3.2). The link negotiates from the pieces' own checks for the hello's page build and
    /// applies the dependency rule for the root as this hello leaves it: under a live tab root a reply that leaves `tabs`
    /// out falls the scene back first (the page's decline, a version refusal, the policy) and is negotiated on the classic
    /// rule, so `coach` alone may come back (60's overlay at once), and the page build's declines are recorded (`tabs`
    /// for a hello without it or a version refusal, `coachHome` for a hello naming `tabs` without it). The fallback runs
    /// before the reply is formed, so `up` names only what still shows. Under a live tab root the reply carries `tabs
    /// {selected, seq, bar}` and the Coach tab follows (contract 1.4, D17, I13): WEB at once when the reply leaves
    /// `coachHome` out, whatever its mode; a WAITING tab (only before the scene's first declaration) starts its 3 s net; a
    /// NATIVE tab is named in `up` and taken over by the new document (its declaration: no present, no timer); a WEB tab
    /// stays WEB. After the answer, the resync.
    private func hello(_ h: HelloRequest, _ b: Binding, at now: Date) -> (reply: [String: Any], after: () -> Void) {
        let answer = b.link.hello(h, ownChecks: ownChecks(page: h.page, book: b.link.book), at: now)
        apply(answer.effects, b)
        var reply = answer.reply.takingOver(shownForUp(b))
        if #available(iOS 26.0, *), let root = liveRoot(b), reply.screens.contains("tabs") {
            if !reply.screens.contains("coachHome") {
                coachTurnsWeb(b, why: "the hello's answer leaves coachHome out")
            } else if root.coachMode == .waiting {
                startCoachNet(b)
            }
            reply.tabs = TabsReply(selected: root.selected, seq: root.seq, bar: root.barMetrics())
        }
        // a screen still up that this document may not have goes down (the page never had it)
        for s in b.screens.shown where !reply.up.contains(s) {
            Self.log.info("shell: \(s, privacy: .public) is not this document's: down")
            b.screens.dismiss(s)
        }
        let linked = b.link.link
        Self.log.notice("fp: hello page \(h.page, privacy: .public) boot \(h.boot ?? "-", privacy: .public): v\(reply.v) \(reply.screens.joined(separator: ","), privacy: .public)\(reply.up.isEmpty ? "" : " (up " + reply.up.joined(separator: ",") + ")", privacy: .public)\(reply.tabs.map { " tabs " + $0.selected + " seq \($0.seq)" } ?? "", privacy: .public)\(reply.why.map { " refused: " + $0 } ?? "", privacy: .public)")
        let up = reply.up
        let after: () -> Void = { [weak self, weak b] in
            guard let self, let b, let linked, b.link.link == linked else { return }
            if self.hasLiveRoot(b) {
                // contract 3.2: covered for the selected tab's mode (a WAITING or NATIVE Coach tab covers the page), the
                // chat's snapshot when it is pushed; never `tabs.select` (the reply carries the selection)
                if self.coachCovers(b) { self.send(.shellCovered(on: true), b) }
                if up.contains("coach") { self.resync("coach", b, covered: false) }
                if #available(iOS 26.0, *) { self.announceAfterHello(b) }
            } else {
                for s in up { self.resync(s, b) }
            }
            #if DEBUG
            if self.debug.smoke { self.smoke(b) }
            #endif
        }
        return ((reply.json.foundation as? [String: Any]) ?? [:], after)
    }

    /// VoiceOver for a move into a web tab whose `tabs.select` no document answered (contract 8.1 step 7, I17, D45): sent
    /// before this hello linked its document, it ended unlinked (a tap at a cold launch or during a reload) or gone with
    /// its document. This hello's answer carries the selection, and the page draws that tab as it runs the answer, which
    /// Capacitor hands to the page on a later turn of the main queue: a script sent after that turn runs after it, so its
    /// completion is when the page has drawn the tab. A newer move by then is heard on its own (`announceWeb(seq:)` posts
    /// only for the newest).
    @available(iOS 26.0, *)
    private func announceAfterHello(_ b: Binding) {
        guard let root = liveRoot(b), let seq = root.pendingWebAnnounce, let wv = b.webView else { return }
        DispatchQueue.main.async { [weak wv, weak root] in
            MainActor.assumeIsolated {
                wv?.evaluateJavaScript("0") { _, _ in
                    MainActor.assumeIsolated { root?.announceWeb(seq: seq) }
                }
            }
        }
    }

    /// What a new document takes over (`up`, contract 3.2): the screens ScreenHost shows, and under a live tab root the
    /// Coach tab while it is NATIVE (`coachHome`), in the binary's order.
    private func shownForUp(_ b: Binding) -> [String] {
        var shown = Set(b.screens.shown)
        if #available(iOS 26.0, *), let root = liveRoot(b), root.coachMode == .native { shown.insert("coachHome") }
        return shell.screens.filter(shown.contains) + shown.subtracting(shell.screens).sorted()
    }

    /// A screen still up from the document before: the page has taken it over; it hears it is covered again (60's overlay;
    /// under a tab root the resync covers the page for the Coach tab's mode instead) and the screen draws this document's
    /// model (a snapshot, decoded and applied inside its model marker, as a push is). Nothing from the document before is
    /// sent again.
    private func resync(_ screen: String, _ b: Binding, covered: Bool = true) {
        if covered { send(.shellCovered(on: true), b) }
        guard screen == "coach" else { return }
        b.pageLink.send(.coachSnapshot) { [weak self, weak b] outcome in
            guard let self, let b else { return }
            self.finished(.coachSnapshot, outcome, b)
            guard case .answered(.done(let reply)) = outcome, let json = reply.value["json"]?.string else { return }
            let (boot, verdict, fx) = self.modelSection(screen, b) { () -> (String?, ModelVerdict, [LinkEffect]) in
                let model = try? CoachModel.decode(json)
                let (verdict, fx) = b.link.modelReceived(screen: screen, rev: model?.rev ?? 0, boot: model?.boot, decoded: model != nil, at: Date())
                if verdict == .apply, let model { b.screens.update(screen, model: model) }
                return (model?.boot, verdict, fx)
            }
            self.apply(fx, b)
            Self.log.info("shell: \(screen, privacy: .public) resynced on boot \(boot ?? "?", privacy: .public) (\(String(describing: verdict), privacy: .public))")
        }
    }

    /// A model the page pushed, decoded and applied inside `model <screen>` (contract 3.7, 10.2): a crash there leaves
    /// the marker at `1` and the next launch turns that piece off for its pair, where build 60 caught none and a model
    /// pushed after every hello would crash every launch. Only this binary's screens: any other can never be live (the
    /// link drops it unread), and its name never reaches a file. The link's effects go after the section.
    private func model(_ push: ModelPush, _ b: Binding, at now: Date) {
        guard shell.screens.contains(push.screen) else {
            Self.log.error("shell: a \(push.screen, privacy: .public) model (rev \(push.rev)) for no screen of this binary: dropped")
            return
        }
        switch push.screen {
        case "coachHome":
            // until H10 wires N's hub (contract 15.2): unread and uncounted, so a page that names the native Coach tab
            // shows its web Coach under the native bar and never trips anything for it
            Self.log.info("shell: a coachHome model (rev \(push.rev)) dropped: the native Coach tab is not wired in this build yet")
            return
        case "tabs":
            tabsModel(push, b, at: now)
            return
        default:
            break
        }
        let fx = modelSection(push.screen, b) { () -> [LinkEffect] in
            let decoded: CoachModel?
            do {
                decoded = try CoachModel.decode(push.json)
            } catch {
                decoded = nil
                Self.log.error("shell: \(push.screen, privacy: .public) model rev \(push.rev) did not decode: \(String(describing: error), privacy: .public)")
            }
            let (verdict, fx) = b.link.modelReceived(screen: push.screen, rev: push.rev, boot: decoded?.boot, decoded: decoded != nil, at: now)
            if verdict == .apply, let decoded { b.screens.update(push.screen, model: decoded) }
            return fx
        }
        apply(fx, b)
    }

    /// A TabsModel (contract 3.7, 6.1), decoded and applied to the live root inside `model tabs@<page> shell <n>`: the
    /// bar's tint, idle colour, titles, labels and style. One that does not decode counts against `tabs` (the link's
    /// model breaker, `LinkState.modelReceived`); a stale or other-boot one is dropped.
    private func tabsModel(_ push: ModelPush, _ b: Binding, at now: Date) {
        let fx = modelSection(push.screen, b) { () -> [LinkEffect] in
            let decoded: TabsModel?
            do {
                decoded = try TabsModel.decode(push.json)
            } catch {
                decoded = nil
                Self.log.error("shell: tabs model rev \(push.rev) did not decode: \(String(describing: error), privacy: .public)")
            }
            let (verdict, fx) = b.link.modelReceived(screen: push.screen, rev: push.rev, boot: decoded?.boot, decoded: decoded != nil, at: now)
            if verdict == .apply, let decoded {
                if let r = decoded.rejected.first {
                    Self.log.info("shell: tabs model rev \(push.rev): \(decoded.rejected.count) part(s) left out or replaced, first \(r, privacy: .public)")
                }
                if #available(iOS 26.0, *), let root = liveRoot(b) { root.apply(decoded) }
            }
            return fx
        }
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
    /// After each outcome a failed `tabs.select` or `tabs.bar` is restated once the link is idle (contract 4.3).
    private func finished(_ intent: Intent, _ outcome: PageLink.Outcome, _ b: Binding) {
        noteState(intent, outcome, b)
        if case .answered(let o) = outcome, let boot = b.link.link?.boot {
            apply(b.link.intentFinished(intent, boot: boot, outcome: o, at: Date()), b)
        }
        restateIfIdle(b)
    }

    // MARK: The tab root's state (contract 4.3, D12)

    /// `tabs.select {tab, seq, again?}` for a run the page did not ask for (the owner's tap or re-tap, a deep link, a
    /// stray); `answered` runs once the page answered or the intent failed (VoiceOver's screen change, contract 8.1 step 7).
    /// One that reached no page (unlinked, or its document went) is heard after the next hello (`announceAfterHello`).
    private func sendSelect(tab: String, seq: Int, again: Bool, _ b: Binding, answered: (() -> Void)? = nil) {
        send(.tabsSelect(tab: tab, seq: seq, again: again ? true : nil), b) { outcome in
            if case .answered = outcome { answered?() }
        }
    }

    /// `tabs.bar {h, safe, rev}`: the shell's own change of the bar (a selection back to a web tab with a sheet open, a
    /// trait or safe-area change). `sheets` answers carry theirs.
    private func sendBar(_ bar: BarMetrics, _ b: Binding) {
        send(.tabsBar(bar), b)
    }

    /// State, not replay: a `tabs.select` or `tabs.bar` that failed (a timeout, an error) marks its state for a restate,
    /// and an answer clears the mark (the page has the newest: outcomes come in the order the intents went) and starts
    /// that kind's count of restates again. Gone and unlinked outcomes change nothing: the next hello's reply carries the
    /// state.
    private func noteState(_ intent: Intent, _ outcome: PageLink.Outcome, _ b: Binding) {
        guard case .answered(let o) = outcome else { return }
        let failed = o.countsAsFailure
        switch intent {
        case .tabsSelect:
            b.restateSelect = failed
            if !failed { b.selectRestates = 0 }
        case .tabsBar:
            b.restateBar = failed
            if !failed { b.barRestates = 0 }
        default: break
        }
    }

    /// Restates of one kind that go in a row before the shell waits for the page to answer one (contract 4.3, D12).
    nonisolated static let restateLimit = 3

    /// Once the link is idle (nothing queued or in the page; after a held timeout that is once the confirming ping has
    /// ended, since the link queues it before this runs), the current selection goes with a new seq and the current bar
    /// with a new rev, once each. A restate that fails marks its state again, so a page that stays silent hears one per
    /// timeout while LinkState's held timeouts and their ping count it toward the breaker (contract 4.4): a dead page
    /// trips at the first restate's ping. At most `restateLimit` restates of a kind go in a row: a page whose handler for
    /// one never settles while it answers the rest, the ping included (each timeout held, then dropped uncounted), would
    /// otherwise hear one and a ping every timeout for the rest of the document. The next answer of that kind (the owner's
    /// next tap) or the next document (its hello's reply carries the state) starts the count again.
    private func restateIfIdle(_ b: Binding) {
        guard b.restateSelect || b.restateBar else { return }
        guard b.pageLink.pending == 0, b.link.link != nil, b.pageLink.boot != nil else { return }
        guard #available(iOS 26.0, *), let root = liveRoot(b) else {
            // no live tab root any more (a fallback): the page has left tabs mode, nothing to restate
            b.restateSelect = false
            b.restateBar = false
            return
        }
        if b.restateSelect {
            b.restateSelect = false
            if b.selectRestates < Self.restateLimit {
                b.selectRestates += 1
                let now = root.restate()
                Self.log.info("shell: a tabs.select failed: the selection goes again (\(now.tab, privacy: .public), seq \(now.seq))")
                sendSelect(tab: now.tab, seq: now.seq, again: false, b)
            } else {
                Self.log.error("shell: a tabs.select failed after \(Self.restateLimit) restates in a row: none more until the page answers one")
            }
        }
        if b.restateBar {
            b.restateBar = false
            if b.barRestates < Self.restateLimit {
                b.barRestates += 1
                let bar = root.restateBar()
                Self.log.info("shell: a tabs.bar failed: the bar goes again (h \(bar.h), safe \(bar.safe), rev \(bar.rev))")
                sendBar(bar, b)
            } else {
                Self.log.error("shell: a tabs.bar failed after \(Self.restateLimit) restates in a row: none more until the page answers one")
            }
        }
    }

    /// A stray (a selection set outside the funnel, redirected): About's counter, this launch's and in all (contract 10.5).
    private func noteStray(_ tab: String) {
        counters.strays.add(at: Date())
        launchCounts.strays += 1
        saveCounters()
        Self.log.fault("shell: a tab selection outside the funnel (\(tab, privacy: .public)), counted (\(self.launchCounts.strays) this launch)")
    }

    /// Whether the scene's root is a live tab root (never below iOS 26).
    private func hasLiveRoot(_ b: Binding) -> Bool {
        if #available(iOS 26.0, *) { return liveRoot(b) != nil }
        return false
    }

    /// The live tab root's Coach mode (`waiting`, `native`, `web`); nil under a classic or fallen-back root.
    private func liveCoachMode(_ b: Binding) -> String? {
        if #available(iOS 26.0, *), let root = liveRoot(b) { return root.coachMode.rawValue }
        return nil
    }

    // MARK: Deep links (contract 9, D24)

    /// What runs a warm deep link in the page (as build 60's `window._trovoOpen && window._trovoOpen(url)`): the URL is the
    /// function's argument, never part of its source; it answers whether the page had the handler (never undefined).
    static let trovoOpenSource = "var handler = window._trovoOpen; if (typeof handler !== 'function') { return false; } handler(url); return true;"

    /// The one entry for a warm `trovo://` URL, for either root (SceneDelegate's one `.trovoDeepLink` observer, H9). Under a
    /// live tab root the shell selects first: `trovo://start` Log, `trovo://share` Coach (held when the Coach tab is
    /// NATIVE, contract 8.1); then every URL goes to `window._trovoOpen(url)`, `share` included, so the page reads a shared
    /// image at once, inside the hold. Under a classic or fallen-back root only `_trovoOpen`, as build 60. The URL stays
    /// parked in UserDefaults (`pendingDeepLink`) for a page that is not up yet, which consumes it at boot.
    public func deepLink(_ url: URL) {
        guard let b = binding, let wv = b.webView else {
            Self.log.info("shell: a deep link with no page bound: parked for the page's boot")
            return
        }
        if #available(iOS 26.0, *), let root = liveRoot(b), url.scheme?.lowercased() == "trovo" {
            switch url.host?.lowercased() {
            case "start"?: root.select("log", source: .deepLink(share: false))
            case "share"?: root.select("coach", source: .deepLink(share: true))
            default: break
            }
        }
        wv.callAsyncJavaScript(Self.trovoOpenSource, arguments: ["url": url.absoluteString], in: nil, in: .page) { result in
            if case .failure(let e) = result {
                Self.log.error("shell: _trovoOpen failed: \(String(describing: e), privacy: .public)")
            }
        }
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

    /// The link's effects of one event, in order. A fallback's event runs whole inside one `tabs` short section (contract
    /// 10.2, 10.3): the root's half first (`fellBack` opens the event), then the `screens.off` it brings, then
    /// `shell.covered {on:false}` when the Coach tab had covered the page.
    private func apply(_ fx: [LinkEffect], _ b: Binding) {
        guard !fx.isEmpty else { return }
        if fx.contains(where: Self.isFallBack) {
            section("tabs") { applyEvent(fx, b) }
        } else {
            applyEvent(fx, b)
        }
    }

    private func applyEvent(_ fx: [LinkEffect], _ b: Binding) {
        var uncover = false
        // `coachHome` off under a live tab root (a trip, the policy, the chat's own off taking it along, contract 8.3,
        // 10.1): the Coach tab turns WEB before the event's offs pop the chat, so the pop is made without animation. A
        // fallback turns it WEB through the root's own half.
        if !fx.contains(where: Self.isFallBack), fx.contains(where: { Self.isOff($0, "coachHome") }) {
            coachTurnsWeb(b, why: "coachHome went off")
        }
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
                if b.link.link != nil { sendOff(screen, why: reason.code, b) }
            case .breakersReset(let page):
                Self.log.info("shell: a new page build (\(page, privacy: .public)) starts the screens' breakers clean")
            case .bookChanged:
                saveBook(b.link.book)
            case .fellBack(let why):
                // first among the event's effects: the screenOffs after it find nothing native left and only tell the page
                if fallBackRoot(why, b) { uncover = true }
            case .pingWhenIdle:
                // a state intent's timeout is held (contract 4.4): the ping confirms it, at the end of the queue. An
                // answer or a failure reaches the link through finished(); a ping that ends with neither (its document
                // went, none linked) is told apart, so the next hold can ask again
                let boot = b.link.link?.boot
                send(.ping, b) { [weak b] outcome in
                    guard let b, let boot else { return }
                    if case .answered = outcome { return }
                    b.link.pingLost(boot: boot)
                }
            }
        }
        // after the event's screens.off (contract 10.3): the page the Coach tab covered is uncovered
        if uncover { send(.shellCovered(on: false), b) }
    }

    nonisolated private static func isFallBack(_ e: LinkEffect) -> Bool {
        if case .fellBack = e { return true }
        return false
    }

    nonisolated private static func isOff(_ e: LinkEffect, _ screen: String) -> Bool {
        if case .screenOff(let s, _) = e { return s == screen }
        return false
    }

    /// `screens.off {screen, why, draft?}` (contract 4.2, D21). For `coach`, whatever the reason and the root, the native
    /// composer's unsent words go along (`CoachStore.handOverDraft()`: trimmed, none when empty; a picked photo stays
    /// native), and the composer empties only when the page answers `took: true`: it says so once it holds them durably
    /// (`kt_coach_handover`, G18), and the native copy (`fpDraft.coach`) outlives a relaunch while the web composer does
    /// not. An answer without `took`, a refusal, an error or a timeout leaves them for the next native chat.
    private func sendOff(_ screen: String, why: String, _ b: Binding) {
        guard screen == "coach" else { return send(.screensOff(screen: screen, why: why), b) }
        let words = b.screens.coach.handOverDraft()
        send(.screensOff(screen: screen, why: why, draft: words), b) { [weak b] outcome in
            guard let b, let words else { return }
            var took = false
            if case .answered(.done(let reply)) = outcome { took = reply.value["took"]?.bool == true }
            b.screens.coach.handedOver(words, taken: took)
        }
    }

    // MARK: The fallback and the Coach tab's modes (contract 1.4, 3.6, 10.3)

    /// Added at the scene's fallback, after the flag's script (contract 10.3, H-G3): the scene's later documents find no
    /// `tabs` in `window.__FP_SHELL` and boot classic, never in tabs mode under no bar.
    nonisolated static let dropTabsScript =
        "(function () { try { var f = window.__FP_SHELL; if (f && typeof f === 'object') { delete f.tabs; } } catch (e) {} })();"

    /// The tab root falls back (contract 10.3, D7), once per scene, on the link's `fellBack` (it opens its event, inside
    /// the event's `tabs` section): the root's half (the bar hidden for good, the web view shown in its slot, the Coach
    /// tab WEB, any hold dropped), ScreenHost leaves the Coach tab's stack (the chat popped without animation; a later
    /// `present coach` is 60's overlay), a WAITING tab's net goes, nothing failed is restated, and a document-start script
    /// deletes the flag's `tabs` for the scene's later documents. The link has turned off what the tab root's rule had
    /// negotiated and refuses `tabs` and `coachHome` at every later hello of the scene; `selectTab` and `sheets` are
    /// refused `off` from now on (`liveRoot`). Answers whether the page should hear `shell.covered {on:false}` after the
    /// event's `screens.off`: the Coach tab had covered it (selected, WAITING or NATIVE) and a document is linked.
    private func fallBackRoot(_ why: FellBackWhy, _ b: Binding) -> Bool {
        guard b.fellBack == nil else { return false }
        let at = Date()
        b.fellBack = FellBack(why: why, at: at)
        b.coachNet?.cancel()
        b.coachNet = nil
        var covered = false
        if #available(iOS 26.0, *), let root = b.tabRoot as? RootTabController {
            covered = root.fellBack == nil && root.selected == "coach" && root.coachMode != .web
            root.fallBack(why: why, at: at)
        }
        b.screens.detachStack()
        b.restateSelect = false
        b.restateBar = false
        b.selectRestates = 0
        b.barRestates = 0
        b.webView?.configuration.userContentController.addUserScript(WKUserScript(source: Self.dropTabsScript,
                                                                                  injectionTime: .atDocumentStart, forMainFrameOnly: true))
        Self.log.error("shell: the tab root fell back (\(why.rawValue, privacy: .public)): the page's own bar from now on, classic for the rest of the scene")
        #if DEBUG
        ShellProbe.shared?.event("fellBack", ["why": why.rawValue])
        #endif
        return covered && b.pageLink.boot != nil
    }

    /// The Coach tab turns WEB (contract 1.4, 3.6, 8.3): the web view shows in the Coach slot, and while Coach is selected
    /// the root uncovers the page (`shell.covered {on:false}`) and VoiceOver hears it. It stays WEB until a `present
    /// coachHome` (H10). A WAITING tab's net goes. `popChat`: a pushed chat comes off too, without animation (the stack
    /// is hidden by then). Nothing under a classic or fallen-back root, or when the tab is WEB already.
    private func coachTurnsWeb(_ b: Binding, why: String, popChat: Bool = false) {
        b.coachNet?.cancel()
        b.coachNet = nil
        guard #available(iOS 26.0, *), let root = liveRoot(b), root.coachMode != .web else { return }
        Self.log.info("shell: the Coach tab turns WEB (\(why, privacy: .public))")
        root.setCoachMode(.web)
        if popChat, b.screens.isUp("coach") { b.screens.dismiss("coach") }
    }

    /// A WAITING Coach tab (only before the scene's first declaration) waits after a hello's answer that negotiated
    /// `coachHome` for the page's `present` or `dismiss` of it, then turns WEB (contract 1.4, D17): the timer decides only
    /// when a page fails to declare. A later hello's answer starts it again; WAITING never comes back once it has gone.
    private func startCoachNet(_ b: Binding) {
        b.coachNet?.cancel()
        let seconds = coachNetSeconds
        let work = DispatchWorkItem { [weak self, weak b] in
            MainActor.assumeIsolated {
                guard let self, let b else { return }
                b.coachNet = nil
                guard self.liveCoachMode(b) == "waiting" else { return }
                Self.log.error("shell: no declaration of coachHome within \(seconds) s of the hello's answer")
                self.coachTurnsWeb(b, why: "no declaration in \(seconds) s")
            }
        }
        b.coachNet = work
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
    }

    /// Whether the live tab root's Coach tab covers the page now: Coach selected, WAITING or NATIVE (contract 8.4).
    private func coachCovers(_ b: Binding) -> Bool {
        if #available(iOS 26.0, *), let root = liveRoot(b) { return root.selected == "coach" && root.coachMode != .web }
        return false
    }

    // MARK: The policy file (FPHost FPPolicy.changed, through the App)

    /// What `status {refresh: true}` does before it answers (contract 3.10, D43): a forced policy fetch through
    /// `environment.fetchPolicy`, at most once in `refreshEvery` (a refresh inside it reads the status as it stands);
    /// `then` runs once the fetch has ended (what it changed has reached `policyChanged` by then) or after `refreshWait`,
    /// whichever comes first.
    private func refreshPolicy(_ then: @escaping () -> Void) {
        let now = Date()
        if let last = lastRefresh, now >= last, now.timeIntervalSince(last) < refreshEvery {
            Self.log.info("shell: status refresh inside the minute: the switches as they stand")
            return then()
        }
        lastRefresh = now
        let once = AnswerOnce(then)
        Self.log.notice("shell: status refresh: the policy file is fetched now")
        environment.fetchPolicy { once.fire() }
        DispatchQueue.main.asyncAfter(deadline: .now() + refreshWait) { MainActor.assumeIsolated { once.fire() } }
    }

    /// The policy file moved these screens' switches: one turned off goes down now, for the rest of the document (the
    /// page shows its own); one turned on is back from the next document (`tabs`: from the next launch). `tabs` turned
    /// off under a live tab root falls the root back at once (LinkState's withdraw: `fellBack(.policy)` first, then
    /// `screens.off` for the pieces); `coachHome` turned off turns the Coach tab WEB at once (the chat popped, covered
    /// off while Coach is selected) and `coach` off takes `coachHome` with it under a live tab root (joint, contract 10.1).
    public func policyChanged(screens: [String]) {
        guard let b = binding else { return }
        let policy = environment.policy()
        let off = screens.filter { !policy.screenOn($0) }
        guard !off.isEmpty else { return }
        Self.log.notice("shell: the policy file turned off \(off.joined(separator: ","), privacy: .public)")
        apply(b.link.withdraw(off), b)
    }

    // MARK: Short sections (contract 10.2)

    /// Runs `body` as one short section of `kind`, whose marker file holds `1` until it returns. `tabs`, the only kind in
    /// 61: the tab root's construction in SceneDelegate's synchronous build (H9: from RootTabController's init to the end
    /// of its first layout pass, never until its first viewDidAppear, which a scene connected in the background can wait
    /// long for) and the root's own sections (H7). A death inside gives the classic root at the next launch for this
    /// shell and page build. Written whatever the app's state.
    public func section<T>(_ kind: String, _ body: () throws -> T) rethrows -> T {
        section(kind, entering: true)
        defer { section(kind, entering: false) }
        return try body()
    }

    /// The same section entered and left apart: the root's hook, whose animated bar show ends when its animation does.
    /// Every enter needs its leave; nested sections of a kind hold the byte until the last one leaves.
    public func section(_ kind: String, entering: Bool) {
        guard let piece = Self.sectionPiece(kind) else {
            Self.log.fault("shell: \(kind, privacy: .public) is no short section's kind: not marked")
            return
        }
        mark(piece, page: binding.flatMap { $0.link.pageBuild ?? $0.pageBuild }, entering: entering)
    }

    /// A short section's kind by its name: `tabs` (contract 10.2).
    nonisolated static func sectionPiece(_ kind: String) -> CrashMarker.Piece? {
        kind == "tabs" ? .tabs : nil
    }

    /// `body` as a model's decode and apply for `screen`, inside `model <screen>@<page> shell <n>` (contract 3.7, 10.2):
    /// every decoder of the binary's screens runs in one (H7's TabsModel and H10's CoachHomeModel too; N writes none).
    func modelSection<T>(_ screen: String, _ b: Binding, _ body: () throws -> T) rethrows -> T {
        let piece = CrashMarker.Piece.model(screen)
        mark(piece, page: b.link.pageBuild ?? b.pageBuild, entering: true)
        defer { mark(piece, page: nil, entering: false) }
        return try body()
    }

    /// One kind's marker into or out of a section; the page build the line names is the one being served.
    private func mark(_ piece: CrashMarker.Piece, page: String?, entering: Bool) {
        launch()   // the last launch's markers are read (and removed) before this launch writes its own
        guard let name = SectionMarker.fileName(piece) else { return }
        guard entering else {
            sections[name]?.leave()
            return
        }
        let m: SectionMarker
        if let open = sections[name] {
            m = open
        } else {
            guard let made = SectionMarker(folder: folder, piece: piece) else { return }
            sections[name] = made
            m = made
        }
        if !m.begin(shell: shell.shell, page: page ?? "unknown"), sectionsUnwritten.insert(name).inserted {
            Self.log.error("shell: \(name, privacy: .public) could not be written: those sections go unmarked")
        }
        m.enter()
    }

    // MARK: Settings > About

    /// TrovoShell `status` (FPCore ScreenStatus; contract 3.10, 10.5): every screen of this binary for the page build being
    /// served, on or off and why (the gate on the root as it stands: after a fallback the bar's own reason, or `needs:
    /// ["root"]` when its checks pass again, and `page` for a decline), whether this document shows it, and the counters
    /// (this launch's and in all, the strays and `leftAny` among them); the root built at scene connect (a fallen-back tab
    /// root stays `tabs`), the fallback (`{why, at}`), the shell's own switches and the policy file's last check.
    func status(_ b: Binding) -> [String: Any] {
        let page = b.link.pageBuild ?? b.pageBuild
        var launch = launchCounts
        launch.leftWindow = ShellWebView.leftWindowWhileActive
        var own: [String: Bool] = [:]
        for p in ShellSwitches.pieces where shell.screens.contains(p) { own[p] = switches.isOn(p) }
        let json = ScreenStatus.json(shell: shell.shell, page: page, binary: shell.screens,
                                     gate: gate(page: page, book: b.link.book, tabsRoot: b.link.tabsRoot),
                                     live: b.link.liveScreens, book: b.link.book, counters: counters, launch: launch,
                                     root: b.tabsRootDecided ? .tabs : .classic, fellBack: b.fellBack, switches: own,
                                     policy: environment.policyState())
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

    /// `tabsRoot`: the scene's root is a tab root (install's decision for the flag; the link's live root afterwards).
    func gate(page: String?, book: BreakerBook, tabsRoot: Bool = false) -> (on: [String], off: [String: ScreenGate.Off]) {
        // The device switch for the native chat (and the Coach tab) is the page's own (Settings > About, kt_native_off):
        // a page with it on never presents. The shell's own are the tab bar's (ShellSwitches, contract 3.5).
        ScreenGate.evaluate(binary: shell.screens, deviceOff: switches.deviceOff, policy: environment.policy(), book: book,
                            shellBuild: shell.shell, pageBuild: page, tabsRoot: tabsRoot, os: osMajor())
    }

    /// The pieces' own checks for a page build (ScreenGate.base, the OS and the shell's device switches included): what
    /// a hello is negotiated from, and what the root decision reads for `tabs`.
    func ownChecks(page: String?, book: BreakerBook) -> ScreenGate.Base {
        ScreenGate.base(binary: shell.screens, deviceOff: switches.deviceOff, policy: environment.policy(), book: book,
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
            "leftWindow": ShellWebView.leftWindowWhileActive,
            "gate": gate(page: b.link.pageBuild ?? b.pageBuild, book: b.link.book, tabsRoot: b.link.tabsRoot).on,
            "status": status(b), "root": describeRoot(b),
        ]
    }

    /// Contract 15.3's `root` block: the tab root's own `describe()` (a fallen-back one included: `kind` stays `tabs`), or
    /// `{kind: "classic"}`.
    private func describeRoot(_ b: Binding) -> [String: Any] {
        if #available(iOS 26.0, *), let root = b.tabRoot as? RootTabController { return root.describe() }
        return ["kind": "classic"]
    }
}

// MARK: - The root decision

/// What SceneDelegate knows before the page loads (contract 2.2, 2.4; H9 sets it on the SuperoViewController, whose
/// `capacitorDidLoad` hands it to `ShellBridge.install(..., launch:)`). A controller made any other way passes none and
/// gets the classic root.
public struct ShellLaunch: Sendable {
    /// SceneDelegate builds a tab root if the gate leaves `tabs` on (false keeps the classic root whatever the gate says).
    public var tabRootAllowed: Bool
    /// The tab the first frame shows (`ShellTabs.firstTab`): the flag's `tabs.selected`.
    public var first: String
    /// The first frame's bar (`RootTabController.predicted(screen:)`, delta 14.1): the flag's `tabs.bar`, rev 0.
    public var barGuess: (h: Int, safe: Int)

    public init(tabRootAllowed: Bool, first: String, barGuess: (h: Int, safe: Int)) {
        self.tabRootAllowed = tabRootAllowed
        self.first = first
        self.barGuess = barGuess
    }

    /// The flag's `tabs` for a tab root (contract 2.2): the first frame's tab and the bar guess.
    public var flag: TabsFlag { TabsFlag(selected: first, h: barGuess.h, safe: barGuess.safe) }
}

/// A callback run at most once, by whichever of its callers comes first (`status {refresh}`: the fetch's end or the
/// wait's).
@MainActor
private final class AnswerOnce {
    private var body: (() -> Void)?

    init(_ body: @escaping () -> Void) {
        self.body = body
    }

    func fire() {
        let b = body
        body = nil
        b?()
    }
}

/// What `install` decided for a web view: the screens its first document may present (the flag's `screens`) and whether
/// the scene's root is a tab root (the flag then carries `tabs`, and SceneDelegate builds the RootTabController).
public struct ShellInstall: Equatable, Sendable {
    public var screens: [String]
    public var tabsRoot: Bool

    public init(screens: [String], tabsRoot: Bool) {
        self.screens = screens
        self.tabsRoot = tabsRoot
    }
}

// MARK: - The web view

/// The shell's WKWebView (`SuperoViewController.webView(with:configuration:)`): it counts every time it leaves its
/// window while the app is active, which nothing in the shell does by design (a native screen goes over it, never in
/// its place; decision.md section 4), and says so in the log.
public final class ShellWebView: WKWebView {
    public private(set) static var leftWindowWhileActive = 0
    /// A scene's teardown is under way (SceneDelegate's `sceneDidDisconnect`, and the Debug replay of a reconnect, which
    /// runs while the app is active): the web view leaving its window then is the teardown letting the page go, never a
    /// fault. SceneDelegate sets it before it lets go of the window and the page, and clears it as the next connection's
    /// first step, so a later move counts again.
    public static var sceneEnding = false
    /// Whether the app is in use now (tests set their own).
    static var appActive: () -> Bool = { UIApplication.shared.applicationState == .active }

    public override func willMove(toWindow newWindow: UIWindow?) {
        if newWindow == nil, window != nil, !Self.sceneEnding, Self.appActive() {
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
