#if os(iOS)
import Foundation
import WebKit
import XCTest
import FPCore
import FPStore
@testable import FPHost

/// StoreAttach's pieces that need no web view (the whole attachment runs in tests/native-store.sh on the real app).
@MainActor
final class StoreAttachTests: XCTestCase {
    func testThePageBuildOfAServedFolder() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("StoreAttachTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        XCTAssertNil(StoreAttach.pageBuild(in: dir))
        try Data(#"<html><head><meta name="build" content="20261007-3"/></head></html>"#.utf8).write(to: dir.appendingPathComponent("index.html"))
        XCTAssertEqual(StoreAttach.pageBuild(in: dir), "20261007-3", "an older bundle without build.txt: the meta tag")
        try Data("20261012-1\n".utf8).write(to: dir.appendingPathComponent("build.txt"))
        XCTAssertEqual(StoreAttach.pageBuild(in: dir), "20261012-1", "build.txt first")
    }

    func testHelloAnswersAreRead() {
        let shadow = StoreAttach.parseHelloAnswer(KTProtocol.helloAnswer(boot: 7, need: ["kt_a"], rule: 6, label: "lag", putBack: false))
        XCTAssertEqual(shadow.mode, "shadow")
        XCTAssertEqual(shadow.boot, 7)
        XCTAssertEqual(shadow.rule, 6)
        XCTAssertEqual(shadow.label, "lag")
        let off = StoreAttach.parseHelloAnswer(KTProtocol.offAnswer("crash marker"))
        XCTAssertEqual(off.mode, "off")
        XCTAssertEqual(off.why, "crash marker")
        XCTAssertNil(StoreAttach.parseHelloAnswer("err").mode)
    }

    /// The gate's reasons go to the page as the off answer's `why` (the facade shows `store: <why>`).
    func testTheGateMapsStoreGate() {
        var book = BreakerBook()
        XCTAssertNil(StoreGate.evaluate(deviceOff: false, policy: .defaults, book: book, shellBuild: "60", pageBuild: "p"))
        XCTAssertEqual(StoreGate.evaluate(deviceOff: true, policy: .defaults, book: book, shellBuild: "60", pageBuild: "p"), .deviceSwitch)
        XCTAssertEqual(StoreGate.evaluate(deviceOff: false, policy: Policy(facade: .off), book: book, shellBuild: "60", pageBuild: "p"), .policy)
        book.recordStaleMarkers([CrashMarker(piece: .store, pageBuild: "p", shellBuild: "60")], at: Date())
        guard case .crashMarker? = StoreGate.evaluate(deviceOff: false, policy: .defaults, book: book, shellBuild: "60", pageBuild: "p") else {
            return XCTFail("a store verdict for the pair turns the facade off")
        }
        XCTAssertNil(StoreGate.evaluate(deviceOff: false, policy: .defaults, book: book, shellBuild: "60", pageBuild: "q"),
                     "another page build is another pair")
        book.clearDisabled(piece: "store")
        book.store.documentStart(pageBuild: "p", at: Date())
        XCTAssertFalse(book.store.launch(at: Date()), "a document that never finished booting")
        XCTAssertEqual(StoreGate.evaluate(deviceOff: false, policy: .defaults, book: book, shellBuild: "60", pageBuild: "p"), .unfinishedBoot)
        XCTAssertTrue(book.store.launch(at: Date()), "once")
    }

    func testDebugOptionsFromLaunchArguments() {
        let none = DebugOptions(arguments: ["App"])
        XCTAssertNil(none.deviceSwitchOff)
        XCTAssertTrue(none.documentStartScripts.isEmpty, "no launch argument, no extra document-start script")
        let all = DebugOptions(arguments: ["App", "-fpStoreSwitch", "off", "-fpClearVerdicts", "-fpBreakProxy", "-fpIgnoreBootDone",
                                           "-fpIgnoreMarker", "-fpProbe", "x.json", "-fpNoWebKit", "-fpOffline"])
        XCTAssertEqual(all.deviceSwitchOff, true)
        XCTAssertTrue(all.clearVerdicts && all.breakProxy && all.ignoreBootDone && all.ignoreMarker)
        XCTAssertEqual(all.documentStartScripts.count, 3)
        XCTAssertTrue(all.documentStartScripts[0].contains("__fpRealLS"), "the probe's reference to WebKit comes first")
        XCTAssertTrue(all.documentStartScripts[0].contains("__fpWkMs"), "with the time WebKit took to load the storage area")
        XCTAssertTrue(all.documentStartScripts[1].contains("__fpCapFetch"),
                      "-fpOffline keeps the fetch it wraps, so the runner still sees Capacitor's patch under it")
        XCTAssertEqual(DebugOptions(arguments: ["App", "-fpStoreSwitch", "on"]).deviceSwitchOff, false)
    }

    /// The breaker record lives in a file beside the store, written at once; UserDefaults keeps a copy that is read
    /// only when the file does not read (it reaches its disk later, through cfprefsd: native-store.sh's 59 drill saw a
    /// reinstall right after a quit bring back an armed breaker the page had disarmed).
    func testTheBreakerRecordIsAFileBesideTheStore() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("StoreAttachTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let suite = "StoreAttachTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }

        XCTAssertNil(StoreAttach.loadBook(directory: dir, defaults: defaults).store.armed, "nothing written: a fresh record")
        var book = BreakerBook()
        book.store.documentStart(pageBuild: "p", at: Date())
        XCTAssertTrue(StoreAttach.saveBook(book, directory: dir, defaults: defaults))
        XCTAssertTrue(FileManager.default.fileExists(atPath: StoreAttach.bookURL(in: dir).path))
        XCTAssertEqual(StoreAttach.loadBook(directory: dir, defaults: defaults).store.armed?.page, "p")

        defaults.set(BreakerBook().encoded(), forKey: StoreAttach.bookKey)
        XCTAssertEqual(StoreAttach.loadBook(directory: dir, defaults: defaults).store.armed?.page, "p",
                       "an older copy in UserDefaults never wins over the file")

        book.store.bootDone()
        StoreAttach.saveBook(book, directory: dir, defaults: defaults)
        XCTAssertNil(StoreAttach.loadBook(directory: dir, defaults: defaults).store.armed, "bootDone's disarm is read back")

        var armed = BreakerBook()
        armed.store.documentStart(pageBuild: "q", at: Date())
        defaults.set(armed.encoded(), forKey: StoreAttach.bookKey)
        try Data("not json".utf8).write(to: StoreAttach.bookURL(in: dir))
        XCTAssertEqual(StoreAttach.loadBook(directory: dir, defaults: defaults).store.armed?.page, "q",
                       "a file that does not read: the UserDefaults copy")
        try FileManager.default.removeItem(at: StoreAttach.bookURL(in: dir))
        XCTAssertEqual(StoreAttach.loadBook(directory: dir, defaults: defaults).store.armed?.page, "q", "no file: the copy")
    }

    /// The first frame's room (contract 6.1): the page's raw `kt_theme`, taken only when its UTF-16 units read exactly one
    /// of the page's two rooms.
    func testTheFirstFrameRoomMapsTheThemeExactly() {
        func room(_ s: String) -> String? { StoreAttach.room(fromTheme: Array(s.utf16)) }
        XCTAssertEqual(room("heavyweight"), "heavyweight")
        XCTAssertEqual(room("dark"), "dark", "Lime's id in the page")
        XCTAssertNil(room("lime"), "the native name of the room is not the page's id")
        XCTAssertNil(room("auto"), "a retired room (the page migrates it to Heavyweight)")
        XCTAssertNil(room("midnight"), "an unknown room")
        XCTAssertNil(room("Dark"), "case counts")
        XCTAssertNil(room(" dark"))
        XCTAssertNil(room("\"dark\""), "a RAW_STRING_KEYS key holds the plain string, never JSON")
        XCTAssertNil(room(""), "empty")
        XCTAssertNil(StoreAttach.room(fromTheme: nil), "absent")
        XCTAssertNil(StoreAttach.room(fromTheme: [0xD800]), "a lone surrogate")
        XCTAssertNil(StoreAttach.room(fromTheme: Array("dark".utf16) + [0xDC00]), "the room and a lone surrogate after it")
    }

    /// The room comes from a ready store only, for a bound page the gate leaves on (the store may lag WebKit otherwise),
    /// read through the store's own value; a closed store, a store that is not ready, no page and each StoreGate reason
    /// give nil (the caller draws Heavyweight). Nothing is written.
    func testTheFirstFrameRoomNeedsAReadyStoreABoundPageAndTheGateOn() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("StoreAttachTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = KTStore.open(KTStore.Config(directory: dir.appendingPathComponent("ready", isDirectory: true), build: 61))
        XCTAssertEqual(store.state, .ready)
        XCTAssertTrue(store.answer(head: "hello", payload: "null").hasPrefix(#"{"mode":"shadow""#))
        let read: (KTStore) -> U16? = { $0.value("kt_theme") }
        XCTAssertNil(StoreAttach.firstFrameRoom(store: store, bound: true, gateOff: false, theme: read), "no kt_theme in the store yet")
        XCTAssertEqual(store.answer(head: "w 1:1", payload: KTWire.quote(KTKey("kt_theme")) + "\n" + KTWire.quote(Array("dark".utf16))),
                       KTProtocol.Answer.ok.rawValue)
        XCTAssertEqual(StoreAttach.firstFrameRoom(store: store, bound: true, gateOff: false, theme: read), "dark", "the store's own value")
        let before = store.values()
        XCTAssertNil(StoreAttach.firstFrameRoom(store: nil, bound: true, gateOff: false, theme: read), "a closed store")
        XCTAssertNil(StoreAttach.firstFrameRoom(store: store, bound: false, gateOff: false, theme: read), "no page bound")

        // each StoreGate reason (the gate's own inputs, as StoreAttach evaluates it for the page being served) turns it off
        func gate(_ deviceOff: Bool, _ policy: Policy, _ book: BreakerBook, page: String = "p") -> StoreGate.Off? {
            StoreGate.evaluate(deviceOff: deviceOff, policy: policy, book: book, shellBuild: "61", pageBuild: page)
        }
        var verdict = BreakerBook()
        verdict.recordStaleMarkers([CrashMarker(piece: .store, pageBuild: "p", shellBuild: "61")], at: Date())
        var unfinished = BreakerBook()
        unfinished.store.documentStart(pageBuild: "p", at: Date())
        XCTAssertFalse(unfinished.store.launch(at: Date()), "a document that never finished booting")
        let device = gate(true, .defaults, BreakerBook())
        XCTAssertEqual(device, .deviceSwitch)
        let policy = gate(false, Policy(facade: .off), BreakerBook())
        XCTAssertEqual(policy, .policy)
        let crash = gate(false, .defaults, verdict)
        guard case .crashMarker? = crash else { return XCTFail("a store verdict for the pair: \(String(describing: crash))") }
        let boot = gate(false, .defaults, unfinished)
        XCTAssertEqual(boot, .unfinishedBoot)
        for (why, off) in [("the device switch", device), ("the policy's facade", policy), ("a crash verdict", crash), ("an unfinished boot", boot)] {
            XCTAssertNil(StoreAttach.firstFrameRoom(store: store, bound: true, gateOff: off != nil, theme: read), why)
        }
        let on = gate(false, .defaults, verdict, page: "q")
        XCTAssertNil(on, "another page build is another pair")
        XCTAssertEqual(StoreAttach.firstFrameRoom(store: store, bound: true, gateOff: on != nil, theme: read), "dark")
        var gateAsked = false
        XCTAssertNil(StoreAttach.firstFrameRoom(store: nil, bound: true, gateOff: { gateAsked = true; return false }(), theme: read))
        XCTAssertFalse(gateAsked, "with no store the gate (the policy, the book) is never asked")

        // a store that is not ready (rule 1: a file it cannot read) is never read
        let garbled = dir.appendingPathComponent("garbled", isDirectory: true)
        try FileManager.default.createDirectory(at: garbled, withIntermediateDirectories: true)
        try Data(repeating: 0x5A, count: 4096).write(to: garbled.appendingPathComponent(KTStore.fileName))
        let unreadable = KTStore.open(KTStore.Config(directory: garbled, build: 61))
        guard case .unreadable = unreadable.state else { return XCTFail("a garbled file reads as unreadable: \(unreadable.state)") }
        var asked = false
        XCTAssertNil(StoreAttach.firstFrameRoom(store: unreadable, bound: true, gateOff: false) { _ in asked = true; return Array("dark".utf16) })
        XCTAssertFalse(asked, "a store that is not ready is never read")
        XCTAssertEqual(store.values(), before, "nothing was written")
    }

    /// The instance reads nothing while no store has opened (a test host never opens one): the caller draws Heavyweight.
    func testTheFirstFrameRoomIsNilWithoutAStore() throws {
        let suite = "StoreAttachTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("StoreAttachTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let attach = StoreAttach(defaults: defaults, directory: dir)
        XCTAssertNil(attach.store)
        XCTAssertNil(attach.firstFrameRoom())
        XCTAssertFalse(FileManager.default.fileExists(atPath: dir.path), "nothing opened or written")
    }

    /// One StoreAttach as SceneDelegate meets it (H9 step 6), on a folder, UserDefaults and policy of the test's own (no
    /// fetch is made), shell build 61: a store an earlier launch left (the page's raw `kt_theme`) and, beside it, the
    /// breaker record that launch left. `bind(page:)` installs a web view serving that page build, as capacitorDidLoad
    /// does: the first install is the launch (the store opens, or stays closed for a crash verdict). The web views are
    /// never loaded (install only adds scripts and a message handler), so nothing waits on WebKit.
    @MainActor
    private final class Launch {
        let attach: StoreAttach
        let dir: URL
        let defaults: UserDefaults
        private let suite: String
        var policy = Policy.defaults
        private var views: [(WKWebView, FakeCapacitorDelegate)] = []

        init(theme: String?, book: BreakerBook? = nil) throws {
            dir = FileManager.default.temporaryDirectory.appendingPathComponent("StoreAttachTests-\(UUID().uuidString)", isDirectory: true)
            suite = "StoreAttachTests-\(UUID().uuidString)"
            defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
            let store = dir.appendingPathComponent("store", isDirectory: true)
            if let theme {
                let earlier = KTStore.open(KTStore.Config(directory: store, build: 61))
                XCTAssertEqual(earlier.state, .ready)
                XCTAssertTrue(earlier.answer(head: "hello", payload: "null").hasPrefix(#"{"mode":"shadow""#))
                XCTAssertEqual(earlier.answer(head: "w 1:1", payload: KTWire.quote(KTKey("kt_theme")) + "\n" + KTWire.quote(Array(theme.utf16))),
                               KTProtocol.Answer.ok.rawValue)
                earlier.close()
            }
            if let book { XCTAssertTrue(StoreAttach.saveBook(book, directory: store, defaults: defaults)) }
            attach = StoreAttach(defaults: defaults, directory: store, shellBuild: "61")
            attach.startPolicy = {}
            attach.policyInForce = { [weak self] in self?.policy ?? .defaults }
        }

        /// A web view serving `page` (its folder's build.txt), bound as capacitorDidLoad binds one.
        @discardableResult
        func bind(page: String) throws -> WKWebView {
            let folder = dir.appendingPathComponent("page-\(page)", isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try Data("\(page)\n".utf8).write(to: folder.appendingPathComponent("build.txt"))
            let inner = FakeCapacitorDelegate()
            let view = WKWebView(frame: CGRect(x: 0, y: 0, width: 320, height: 480))
            view.uiDelegate = inner
            views.append((view, inner))
            attach.install(webView: view, pageFolder: folder)
            return view
        }

        func end() {
            attach.store?.close()
            defaults.removePersistentDomain(forName: suite)
            try? FileManager.default.removeItem(at: dir)
        }
    }

    /// The instance SceneDelegate calls reads its own store, binding and gate (contract 6.1, H9 step 6): the owner's room
    /// as an earlier launch left it in the store, for the page bound now, with the gate StoreAttach answers hellos with.
    /// The device switch, the policy's facade and no page bound give nil (the caller draws Heavyweight), and the room
    /// comes back with the switch, the policy and a page bound again. Nothing is written.
    func testTheFirstFrameRoomOfTheInstanceIsTheStoresForTheBoundPageWhileTheGateIsOn() throws {
        let dark = try Launch(theme: "dark")
        defer { dark.end() }
        XCTAssertNil(dark.attach.firstFrameRoom(), "before the first install no store is open")
        let view = try dark.bind(page: "P1")
        let store = try XCTUnwrap(dark.attach.store, "the first install opened the store")
        XCTAssertEqual(store.state, .ready)
        XCTAssertNotNil(dark.attach.binding, "the page is bound")
        let before = store.values()
        XCTAssertEqual(dark.attach.firstFrameRoom(), "dark", "the owner's room as the store holds it")

        dark.defaults.set(true, forKey: StoreAttach.deviceSwitchKey)
        XCTAssertNil(dark.attach.firstFrameRoom(), "Storage's Native copy switch off: the store may lag WebKit")
        dark.attach.setDeviceSwitch(on: true)
        XCTAssertEqual(dark.attach.firstFrameRoom(), "dark")

        dark.policy = Policy(facade: .off)
        XCTAssertNil(dark.attach.firstFrameRoom(), "the policy file's facade off")
        dark.policy = .defaults
        XCTAssertEqual(dark.attach.firstFrameRoom(), "dark")

        dark.attach.sceneDisconnected(webView: view)
        XCTAssertNil(dark.attach.binding)
        XCTAssertNotNil(dark.attach.store, "the store stays open for the process")
        XCTAssertNil(dark.attach.firstFrameRoom(), "no page bound")
        try dark.bind(page: "P1")
        XCTAssertEqual(dark.attach.firstFrameRoom(), "dark", "the next page bound")
        XCTAssertEqual(store.values(), before, "nothing was written")

        let heavy = try Launch(theme: "heavyweight")
        defer { heavy.end() }
        try heavy.bind(page: "P1")
        XCTAssertEqual(heavy.attach.firstFrameRoom(), "heavyweight")
        let none = try Launch(theme: nil)
        defer { none.end() }
        try none.bind(page: "P1")
        XCTAssertEqual(none.attach.store?.state, .ready)
        XCTAssertNil(none.attach.firstFrameRoom(), "no kt_theme in the store")
    }

    /// The breaker record the last launch left: an unfinished boot (this launch runs without the facade) and a crash
    /// verdict for the page bound now give nil, the gate asked for that page; a verdict for the launch's own page leaves
    /// the store closed.
    func testTheFirstFrameRoomOfTheInstanceFollowsTheBreakerRecord() throws {
        var unfinished = BreakerBook()
        unfinished.store.documentStart(pageBuild: "P1", at: Date())
        let boot = try Launch(theme: "dark", book: unfinished)
        defer { boot.end() }
        try boot.bind(page: "P1")
        XCTAssertEqual(boot.attach.store?.state, .ready, "an unfinished boot leaves the store open")
        XCTAssertTrue(boot.attach.book.store.skipping, "this launch runs without the facade")
        XCTAssertNil(boot.attach.firstFrameRoom(), "the last document never finished booting: the store may lag WebKit")

        var verdictQ = BreakerBook()
        verdictQ.recordStaleMarkers([CrashMarker(piece: .store, pageBuild: "Q", shellBuild: "61")], at: Date())
        let other = try Launch(theme: "dark", book: verdictQ)
        defer { other.end() }
        try other.bind(page: "P1")
        XCTAssertEqual(other.attach.store?.state, .ready, "a verdict for another page build leaves the store open")
        XCTAssertEqual(other.attach.firstFrameRoom(), "dark", "the verdict is for another pair")
        try other.bind(page: "Q")
        XCTAssertNotNil(other.attach.store)
        XCTAssertEqual(other.attach.binding?.pageBuild, "Q", "a newer web view serving page Q took the binding over")
        XCTAssertNil(other.attach.firstFrameRoom(), "a store crash verdict for the page bound now")

        var verdictP1 = BreakerBook()
        verdictP1.recordStaleMarkers([CrashMarker(piece: .store, pageBuild: "P1", shellBuild: "61")], at: Date())
        let closed = try Launch(theme: "dark", book: verdictP1)
        defer { closed.end() }
        try closed.bind(page: "P1")
        XCTAssertNil(closed.attach.store, "a verdict for the launch's own pair leaves the store closed")
        XCTAssertNotNil(closed.attach.storeClosedWhy)
        XCTAssertNil(closed.attach.firstFrameRoom())
    }

    /// The facade the shell injects is in the app's FPStore bundle, and its flag is protocol 1 for this shell.
    func testTheFacadeAndItsFlag() throws {
        let src = try XCTUnwrap(KTFacade.source())
        XCTAssertTrue(src.contains("window.__ktStore"))
        XCTAssertEqual(KTFacade.flagScript(shell: "60"), #"window.__ktStore = {"proto":1,"shell":"60"};"#)
    }
}
#endif
