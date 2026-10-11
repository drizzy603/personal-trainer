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
