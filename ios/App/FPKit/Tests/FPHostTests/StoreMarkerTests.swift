#if os(iOS)
import Foundation
import XCTest
import FPCore
@testable import FPHost

/// The store's crash marker: a state byte that survives a process that dies inside a store operation, and only then.
final class StoreMarkerTests: XCTestCase {
    private var dir: URL!
    private var url: URL { dir.appendingPathComponent("store.marker") }

    override func setUp() {
        dir = FileManager.default.temporaryDirectory.appendingPathComponent("StoreMarkerTests-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: dir)
    }

    private func stateByte() throws -> UInt8 { try XCTUnwrap(Data(contentsOf: url).last) }

    func testNoFileIsNoVerdict() {
        XCTAssertNil(StoreMarker(url: url).stale())
    }

    /// A launch whose operations all ended leaves "0": the next launch finds nothing.
    func testOperationsThatEndedLeaveNoVerdict() throws {
        let m = StoreMarker(url: url)
        XCTAssertTrue(m.begin(shell: "60", page: "20261012-1"))
        m.enter()
        XCTAssertEqual(try stateByte(), StoreOpMarker.inFlight)
        m.leave()
        XCTAssertEqual(try stateByte(), StoreOpMarker.idle)
        XCTAssertNil(StoreMarker(url: url).stale())
    }

    /// A process that dies between enter and leave leaves "1" with its pair: the next launch reads the verdict.
    func testDeathInsideAnOperationLeavesTheMarker() throws {
        do {
            let m = StoreMarker(url: url)
            m.begin(shell: "60", page: "20261012-1")
            m.enter()   // and the process dies here
        }
        let stale = try XCTUnwrap(StoreMarker(url: url).stale())
        XCTAssertEqual(stale, CrashMarker(piece: .store, pageBuild: "20261012-1", shellBuild: "60"))
        XCTAssertEqual(stale.line, "store@20261012-1 shell 60")
        // The next launch's begin starts its own file at "0".
        let next = StoreMarker(url: url)
        next.begin(shell: "60", page: "20261012-1")
        XCTAssertNil(StoreMarker(url: url).stale())
    }

    /// Overlapping operations (a prompt answer while a checkpoint runs): "1" until the last one ends.
    func testOverlappingOperationsStaySetUntilTheLastEnds() throws {
        let m = StoreMarker(url: url)
        m.begin(shell: "60", page: "p")
        m.enter()
        m.enter()
        m.leave()
        XCTAssertEqual(try stateByte(), StoreOpMarker.inFlight)
        m.leave()
        XCTAssertEqual(try stateByte(), StoreOpMarker.idle)
        m.leave()   // one too many is harmless
        XCTAssertEqual(try stateByte(), StoreOpMarker.idle)
        XCTAssertEqual(m.around { 7 }, 7)
        XCTAssertEqual(try stateByte(), StoreOpMarker.idle)
    }

    /// Bytes that do not read as a marker (garbled, truncated, another file) are no verdict.
    func testGarbledFileIsNoVerdict() throws {
        for bytes in [Data("garbage".utf8), Data("store@p shell 60\n".utf8), Data("store@p shell 60\nX".utf8),
                      Data("presenting coach@p shell 60\n1".utf8), Data()] {
            try bytes.write(to: url)
            XCTAssertNil(StoreMarker(url: url).stale(), String(decoding: bytes, as: UTF8.self))
        }
    }

    /// A page served later in the process (a scene that reconnects onto a page staged meanwhile) rewrites the header,
    /// but never in the middle of an operation.
    func testHeaderFollowsThePageBetweenOperations() throws {
        let m = StoreMarker(url: url)
        m.begin(shell: "60", page: "A")
        m.enter()
        m.begin(shell: "60", page: "B")   // mid-operation: kept
        m.leave()
        XCTAssertTrue(try String(decoding: Data(contentsOf: url), as: UTF8.self).hasPrefix("store@A shell 60\n"))
        m.begin(shell: "60", page: "B")
        m.enter()
        let stale = try XCTUnwrap(StoreMarker(url: url).stale())
        XCTAssertEqual(stale.pageBuild, "B")
        m.leave()
    }
}
#endif
