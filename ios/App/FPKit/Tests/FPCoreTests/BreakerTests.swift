import Foundation
import XCTest
import FPCore

final class BreakerTests: XCTestCase {
    private let t0 = Date(timeIntervalSince1970: 1_791_500_000)

    func testCrashMarkerLines() {
        let coach = CrashMarker(piece: .screen("coach"), pageBuild: "20261012-1", shellBuild: "60")
        XCTAssertEqual(coach.line, "presenting coach@20261012-1 shell 60")
        XCTAssertEqual(CrashMarker(line: coach.line), coach)
        XCTAssertEqual(CrashMarker(line: "  presenting coach@20261012-1   shell 60\n"), coach)
        let store = CrashMarker(piece: .store, pageBuild: "20261012-1", shellBuild: "60")
        XCTAssertEqual(store.line, "store@20261012-1 shell 60")
        XCTAssertEqual(CrashMarker(line: store.line), store)
        // the plan's short form names no shell: it is this binary's
        XCTAssertEqual(CrashMarker(line: "presenting coach@20261012-1", defaultShell: "60"), coach)
        XCTAssertNil(CrashMarker(line: "presenting coach@20261012-1"))
        for bad in ["", "presenting", "presenting coach shell 60", "opening coach@1 shell 60", "presenting @1 shell 60",
                    "presenting coach@ shell 60", "presenting coach@1 shell", "settings@1 shell 60", "presenting coach@1 extra shell 60"] {
            XCTAssertNil(CrashMarker(line: bad), bad)
        }
        XCTAssertEqual(coach.piece.name, "coach")
        XCTAssertEqual(CrashMarker.Piece.store.name, "store")
    }

    /// Build 61's marker kinds (contract 10.2): the tab root's short sections and each model's decode.
    func testTabsAndModelMarkerLines() {
        let tabs = CrashMarker(piece: .tabs, pageBuild: "P", shellBuild: "61")
        XCTAssertEqual(tabs.line, "tabs@P shell 61")
        XCTAssertEqual(CrashMarker(line: tabs.line), tabs)
        let model = CrashMarker(piece: .model("coachHome"), pageBuild: "P", shellBuild: "61")
        XCTAssertEqual(model.line, "model coachHome@P shell 61")
        XCTAssertEqual(CrashMarker(line: model.line), model)
        XCTAssertEqual(CrashMarker(line: "model coach@20261020-1 shell 61\n"), CrashMarker(piece: .model("coach"), pageBuild: "20261020-1", shellBuild: "61"))
        XCTAssertEqual(CrashMarker(line: "tabs@P", defaultShell: "61"), tabs, "the short form is this binary's")
        XCTAssertEqual([tabs.piece.name, model.piece.name, CrashMarker.Piece.model("tabs").name], ["tabs", "coachHome", "tabs"])
        XCTAssertNotEqual(CrashMarker.Piece.screen("coachHome"), CrashMarker.Piece.model("coachHome"), "a screen's marker is not its model's")
        // an unknown first word, or a kind without its piece, reads as nothing (as build 60 reads all of these)
        for bad in ["opening tabs@P shell 61", "section tabs@P shell 61", "tabs coach@P shell 61", "model@P shell 61", "model coachHome shell 61",
                    "model @P shell 61", "model coachHome@ shell 61", "tabsx@P shell 61", "model coachHome@P extra shell 61", "Tabs@P shell 61"] {
            XCTAssertNil(CrashMarker(line: bad), bad)
        }
        XCTAssertNil(StoreOpMarker.read(Data("tabs@P shell 61\n1".utf8)), "the store's reader takes only its own")
        // a verdict per kind, worded for About: the tab root's gives the classic root, a model's turns its piece off
        var book = BreakerBook()
        let added = book.recordStaleMarkers([tabs, model, CrashMarker(piece: .model("tabs"), pageBuild: "P", shellBuild: "61")], at: t0)
        XCTAssertEqual(added.map(\.piece), ["tabs", "coachHome", "tabs"])
        XCTAssertEqual(added.map(\.why), ["crash marker: the app closed during a tab change",
                                          "crash marker: the app closed while reading a native coachHome model",
                                          "crash marker: the app closed while reading a native tabs model"])
        XCTAssertEqual(book.disabled.filter { $0.piece == "tabs" }.count, 1, "one verdict per pair: the newest")
        XCTAssertEqual(book.disabled(piece: "tabs", shell: "61", page: "P")?.why, "crash marker: the app closed while reading a native tabs model")
        XCTAssertNotNil(book.disabled(piece: "coachHome", shell: "61", page: "P"))
        XCTAssertNil(book.disabled(piece: "coachHome", shell: "61", page: "P2"))
    }

    /// Declines (contract 10.1): per page build, kept with the book, cleared by Try again; a book from build 60 reads
    /// whole, and a field another build wrote differently resets only itself.
    func testDeclinesPerPageBuild() throws {
        var book = BreakerBook()
        XCTAssertFalse(book.declined(piece: "tabs", page: "P1"))
        XCTAssertTrue(book.decline(piece: "tabs", page: "P1"))
        XCTAssertFalse(book.decline(piece: "tabs", page: "P1"), "the same decline again changes nothing")
        XCTAssertTrue(book.declined(piece: "tabs", page: "P1"))
        XCTAssertFalse(book.declined(piece: "tabs", page: "P2"), "a new page build is offered it again")
        XCTAssertFalse(book.declined(piece: "coachHome", page: "P1"))
        XCTAssertTrue(book.decline(piece: "coachHome", page: "P1"))
        XCTAssertTrue(book.decline(piece: "tabs", page: "P2"), "a newer page build's decline replaces the older")
        XCTAssertFalse(book.declined(piece: "tabs", page: "P1"))
        XCTAssertEqual(book.declined, ["tabs": "P2", "coachHome": "P1"])
        // kept with the book
        XCTAssertEqual(BreakerBook.decoded(book.encoded()), book)
        let stored = try XCTUnwrap(try JSONText.parse(utf8: book.encoded()).object)
        XCTAssertEqual(stored["declined"], ["coachHome": "P1", "tabs": "P2"])
        // build 60's book (no declined) reads whole
        let sixty = Data(#"{"disabled":[{"at":1791500000000,"page":"P1","piece":"coach","shell":"60","why":"crash marker: x"}],"screens":{"coach":{"failures":1,"pageBuild":"P1","recent":["timeout"]}},"store":{"trips":1}}"#.utf8)
        let read = BreakerBook.decoded(sixty)
        XCTAssertEqual(read.declined, [:])
        XCTAssertEqual(read.screens["coach"]?.failures, 1)
        XCTAssertEqual(read.disabled.map(\.piece), ["coach"])
        XCTAssertEqual(read.store.trips, 1)
        // a declined written differently resets alone
        let odd = BreakerBook.decoded(Data(#"{"declined":["tabs"],"store":{"trips":2}}"#.utf8))
        XCTAssertEqual(odd.declined, [:])
        XCTAssertEqual(odd.store.trips, 2)
        XCTAssertEqual(BreakerBook.decoded(Data(#"{"declined":{"tabs":"P1","coachHome":3}}"#.utf8)).declined, [:], "the whole field or nothing")
        // Try again clears the piece's decline with its verdicts and its breaker record; another piece's stays
        _ = book.recordFailure(screen: "tabs", pageBuild: "P2", detail: "timeout", at: t0, limit: 3)
        XCTAssertTrue(book.turnBackOn(screen: "tabs"))
        XCTAssertFalse(book.declined(piece: "tabs", page: "P2"))
        XCTAssertNil(book.screens["tabs"])
        XCTAssertTrue(book.declined(piece: "coachHome", page: "P1"))
        XCTAssertFalse(book.turnBackOn(screen: "tabs"), "nothing left: nothing changes")
        XCTAssertTrue(book.turnBackOn(screen: "coachHome"))
        XCTAssertEqual(book.declined, [:])
    }

    func testStoreOpMarkerFile() throws {
        let idle = StoreOpMarker.file(shell: "60", page: "20261012-1", inFlight: false)
        let offset = StoreOpMarker.stateOffset(shell: "60", page: "20261012-1")
        XCTAssertEqual(idle.count, offset + 1, "one state byte after the line")
        XCTAssertEqual(String(decoding: idle.prefix(offset), as: UTF8.self), "store@20261012-1 shell 60\n")
        let read = try XCTUnwrap(StoreOpMarker.read(idle))
        XCTAssertEqual(read.marker, CrashMarker(piece: .store, pageBuild: "20261012-1", shellBuild: "60"))
        XCTAssertFalse(read.inFlight)
        var busy = idle
        busy[offset] = StoreOpMarker.inFlight   // what the one-byte write before an answer leaves
        XCTAssertEqual(busy, StoreOpMarker.file(shell: "60", page: "20261012-1", inFlight: true))
        XCTAssertEqual(StoreOpMarker.read(busy)?.inFlight, true)
        XCTAssertNil(StoreOpMarker.read(Data()))
        XCTAssertNil(StoreOpMarker.read(Data("store@1 shell 60\n".utf8)), "no state byte")
        XCTAssertNil(StoreOpMarker.read(Data("store@1 shell 60\nX".utf8)), "an unknown state byte")
        XCTAssertNil(StoreOpMarker.read(Data("presenting coach@1 shell 60\n1".utf8)), "a screen marker is not the store's")
    }

    /// A stale marker turns its piece off for its (shell build, page build) pair, and only that pair.
    func testStaleMarkersTurnThePieceOffForTheirPairOnly() {
        var book = BreakerBook()
        let added = book.recordStaleMarkers([
            CrashMarker(piece: .screen("coach"), pageBuild: "P1", shellBuild: "60"),
            CrashMarker(piece: .store, pageBuild: "P1", shellBuild: "60"),
        ], at: t0)
        XCTAssertEqual(added.map(\.piece), ["coach", "store"])
        let coach = book.disabled(piece: "coach", shell: "60", page: "P1")
        XCTAssertEqual(coach?.at, t0)
        XCTAssertTrue(coach?.why.hasPrefix("crash marker:") ?? false)
        XCTAssertNotNil(book.disabled(piece: "store", shell: "60", page: "P1"))
        XCTAssertNil(book.disabled(piece: "coach", shell: "61", page: "P1"), "a new binary starts clean")
        XCTAssertNil(book.disabled(piece: "coach", shell: "60", page: "P2"), "a new page build starts clean")
        XCTAssertNil(book.disabled(piece: "coach", shell: "60", page: nil))
        // the same pair again replaces, never piles up
        book.recordStaleMarkers([CrashMarker(piece: .screen("coach"), pageBuild: "P1", shellBuild: "60")], at: t0 + 10)
        XCTAssertEqual(book.disabled.filter { $0.piece == "coach" }.count, 1)
        XCTAssertEqual(book.disabled(piece: "coach", shell: "60", page: "P1")?.at, t0 + 10)
        // the owner turns it back on
        book.clearDisabled(piece: "coach")
        XCTAssertNil(book.disabled(piece: "coach", shell: "60", page: "P1"))
        XCTAssertNotNil(book.disabled(piece: "store", shell: "60", page: "P1"))
        // only the newest verdicts are kept
        for i in 0 ..< 25 { book.recordStaleMarkers([CrashMarker(piece: .store, pageBuild: "Q\(i)", shellBuild: "60")], at: t0) }
        XCTAssertEqual(book.disabled.count, BreakerBook.keepDisabled)
        XCTAssertNotNil(book.disabled(piece: "store", shell: "60", page: "Q24"))
        XCTAssertNil(book.disabled(piece: "store", shell: "60", page: "Q0"))
    }

    func testScreenBreakerCountsFailuresInARowPerPageBuild() {
        var book = BreakerBook()
        XCTAssertNil(book.recordFailure(screen: "coach", pageBuild: "P1", detail: "timeout", at: t0, limit: 3))
        XCTAssertNil(book.recordFailure(screen: "coach", pageBuild: "P1", detail: "timeout", at: t0, limit: 3))
        XCTAssertTrue(book.recordSuccess(screen: "coach", pageBuild: "P1"), "a success starts the count again")
        XCTAssertFalse(book.recordSuccess(screen: "coach", pageBuild: "P1"))
        XCTAssertNil(book.recordFailure(screen: "coach", pageBuild: "P1", detail: "timeout", at: t0, limit: 3))
        XCTAssertNil(book.recordFailure(screen: "coach", pageBuild: "P1", detail: "page exception", at: t0, limit: 3))
        let trip = book.recordFailure(screen: "coach", pageBuild: "P1", detail: "bad answer", at: t0 + 1, limit: 3)
        XCTAssertEqual(trip?.reason, .failures)
        XCTAssertEqual(trip?.detail, "3 in a row: timeout, page exception, bad answer")
        XCTAssertEqual(book.trip(screen: "coach", pageBuild: "P1"), trip)
        XCTAssertNil(book.recordFailure(screen: "coach", pageBuild: "P1", detail: "timeout", at: t0, limit: 3), "tripped already")
        XCTAssertNil(book.trip(screen: "coach", pageBuild: "P2"))
        XCTAssertTrue(book.resetIfNewBuild(screen: "coach", pageBuild: "P2"))
        XCTAssertNil(book.screens["coach"])
        XCTAssertFalse(book.resetIfNewBuild(screen: "coach", pageBuild: "P2"))
        XCTAssertFalse(book.recordSuccess(screen: "settings", pageBuild: "P2"), "no record, nothing to reset")
        XCTAssertNil(book.screens["settings"])
        // a failure counted under another page build is not carried over
        XCTAssertNil(book.recordFailure(screen: "coach", pageBuild: "P2", detail: "timeout", at: t0, limit: 3))
        XCTAssertNil(book.recordFailure(screen: "coach", pageBuild: "P3", detail: "timeout", at: t0, limit: 3))
        XCTAssertEqual(book.screens["coach"]?.failures, 1)
        XCTAssertEqual(book.screens["coach"]?.pageBuild, "P3")
    }

    /// Intents and models each keep their own run: a success of one kind leaves the other's count.
    func testEachFailureKindKeepsItsOwnRun() {
        var book = BreakerBook()
        _ = book.recordFailure(screen: "coach", pageBuild: "P1", kind: .intent, detail: "timeout", at: t0, limit: 3)
        _ = book.recordFailure(screen: "coach", pageBuild: "P1", kind: .model, detail: "undecodable model rev 4", at: t0, limit: 3)
        _ = book.recordFailure(screen: "coach", pageBuild: "P1", kind: .model, detail: "undecodable model rev 5", at: t0, limit: 3)
        XCTAssertEqual(book.screens["coach"]?.failures, 1)
        XCTAssertEqual(book.screens["coach"]?.modelFailures, 2)
        XCTAssertTrue(book.recordSuccess(screen: "coach", pageBuild: "P1", kind: .intent))
        XCTAssertFalse(book.recordSuccess(screen: "coach", pageBuild: "P1", kind: .intent))
        XCTAssertEqual(book.screens["coach"]?.modelFailures, 2, "an intent's success leaves the models' run")
        let trip = book.recordFailure(screen: "coach", pageBuild: "P1", kind: .model, detail: "undecodable model rev 6", at: t0, limit: 3)
        XCTAssertEqual(trip?.detail, "3 in a row: undecodable model rev 4, undecodable model rev 5, undecodable model rev 6")
        XCTAssertTrue(book.screens["coach"]?.isDirty ?? false)
        // a model that decodes restarts the models' run only
        var other = BreakerBook()
        _ = other.recordFailure(screen: "coach", pageBuild: "P1", kind: .intent, detail: "timeout", at: t0, limit: 3)
        _ = other.recordFailure(screen: "coach", pageBuild: "P1", kind: .model, detail: "undecodable model rev 1", at: t0, limit: 3)
        XCTAssertTrue(other.recordSuccess(screen: "coach", pageBuild: "P1", kind: .model))
        XCTAssertEqual(other.screens["coach"]?.failures, 1)
        XCTAssertEqual(other.screens["coach"]?.modelFailures, 0)
        XCTAssertTrue(other.resetIfNewBuild(screen: "coach", pageBuild: "P2"), "a count of either kind is cleared by a new build")
        // a book from before the models' run reads with none
        let older = BreakerBook.decoded(Data(#"{"screens":{"coach":{"pageBuild":"P1","failures":2,"recent":["timeout","timeout"]}}}"#.utf8))
        XCTAssertEqual(older.screens["coach"]?.failures, 2)
        XCTAssertEqual(older.screens["coach"]?.modelFailures, 0)
        XCTAssertEqual(older.screens["coach"]?.recentModels, [])
    }

    func testNoHelloTripsOnce() {
        var book = BreakerBook()
        let trip = book.trip(screen: "coach", pageBuild: "P1", reason: .noHello, detail: "no hello within 15 s", at: t0)
        XCTAssertEqual(trip?.reason, .noHello)
        XCTAssertNil(book.trip(screen: "coach", pageBuild: "P1", reason: .noHello, detail: "again", at: t0))
        XCTAssertEqual(book.trip(screen: "coach", pageBuild: "P1")?.detail, "no hello within 15 s")
    }

    /// Armed per document start, disarmed by bootDone; a launch that finds it armed runs without the
    /// facade once.
    func testStoreBreaker() {
        var b = StoreBreaker()
        XCTAssertTrue(b.launch(at: t0))
        b.documentStart(pageBuild: "P1", at: t0)
        XCTAssertNotNil(b.armed)
        b.bootDone()
        XCTAssertNil(b.armed)
        XCTAssertTrue(b.launch(at: t0 + 60), "a document that finished booting arms nothing for the next launch")
        b.documentStart(pageBuild: "P1", at: t0 + 61)
        // the process dies before bootDone
        XCTAssertFalse(b.launch(at: t0 + 120), "an unfinished boot: this launch runs without the facade")
        XCTAssertTrue(b.skipping)
        XCTAssertEqual(b.trips, 1)
        XCTAssertEqual(b.lastTrip, t0 + 120)
        b.documentStart(pageBuild: "P1", at: t0 + 121)
        XCTAssertNil(b.armed, "without the facade nothing arms")
        XCTAssertTrue(b.launch(at: t0 + 180), "and the next launch tries again")
        XCTAssertFalse(b.skipping)
    }

    func testBookSurvivesStorageAndOtherBuildsRecords() throws {
        var book = BreakerBook()
        _ = book.recordFailure(screen: "coach", pageBuild: "P1", detail: "timeout", at: t0, limit: 3)
        _ = book.trip(screen: "settings", pageBuild: "P1", reason: .noHello, detail: "no hello", at: t0)
        book.recordStaleMarkers([CrashMarker(piece: .store, pageBuild: "P1", shellBuild: "60")], at: t0)
        book.store.documentStart(pageBuild: "P1", at: t0)
        let data = book.encoded()
        XCTAssertEqual(BreakerBook.decoded(data), book)
        XCTAssertEqual(BreakerBook.decoded(nil), BreakerBook())
        XCTAssertEqual(BreakerBook.decoded(Data("garbage".utf8)), BreakerBook())
        // a field written differently by another build resets only that field
        let mixed = Data(#"{"screens":{"coach":{"pageBuild":"P1","failures":"two","futureField":1}},"disabled":"oops","store":{"trips":2}}"#.utf8)
        let read = BreakerBook.decoded(mixed)
        XCTAssertEqual(read.screens["coach"]?.pageBuild, "P1")
        XCTAssertEqual(read.screens["coach"]?.failures, 0)
        XCTAssertEqual(read.disabled, [])
        XCTAssertEqual(read.store.trips, 2)
    }
}
