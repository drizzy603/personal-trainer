#if os(iOS)
import Foundation
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

    /// The facade the shell injects is in the app's FPStore bundle, and its flag is protocol 1 for this shell.
    func testTheFacadeAndItsFlag() throws {
        let src = try XCTUnwrap(KTFacade.source())
        XCTAssertTrue(src.contains("window.__ktStore"))
        XCTAssertEqual(KTFacade.flagScript(shell: "60"), #"window.__ktStore = {"proto":1,"shell":"60"};"#)
    }
}
#endif
