#if os(iOS)
import Foundation
import XCTest
import FPCore
@testable import FPUI

/// The shell's short-section markers (11-shell.md H6 tests 1, 2 and 4; contract 10.2, 3.5): a state byte that survives a
/// process dying inside a section and only then, one file per kind beside 60's screen markers, nested sections holding
/// the byte, the page build rewritten between sections only; and the shell's switch file, read before its UserDefaults
/// copy. ShellBridgeTests has the launch's side (verdicts, `-fpIgnoreMarker`, the gate).
final class ShellMarkersTests: XCTestCase {
    private var folder: URL!
    private var suite: String!
    private var defaults: UserDefaults!

    override func setUp() {
        folder = FileManager.default.temporaryDirectory.appendingPathComponent("ShellMarkersTests-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        suite = "fp.shell.markers.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suite)
    }

    override func tearDown() {
        defaults?.removePersistentDomain(forName: suite)
        try? FileManager.default.removeItem(at: folder)
    }

    private func marker(_ piece: CrashMarker.Piece) throws -> SectionMarker {
        try XCTUnwrap(SectionMarker(folder: folder, piece: piece))
    }

    private func bytes(_ name: String) throws -> Data { try Data(contentsOf: folder.appendingPathComponent(name)) }
    private func text(_ name: String) throws -> String { String(decoding: try bytes(name), as: UTF8.self) }
    private func stateByte(_ name: String) throws -> UInt8 { try XCTUnwrap(bytes(name).last) }

    private func plant(_ name: String, _ text: String) throws {
        try Data(text.utf8).write(to: folder.appendingPathComponent(name))
    }

    // MARK: Files and lines

    /// One file per kind (contract 10.2, the names the tools plant), each holding its line, a newline and the state byte.
    func testOneFilePerKindHoldingItsLineAndTheStateByte() throws {
        XCTAssertEqual(SectionMarker.fileName(.tabs), "section.tabs.marker")
        XCTAssertEqual(SectionMarker.fileName(.model("coach")), "model.coach.marker")
        XCTAssertEqual(SectionMarker.fileName(.model("coachHome")), "model.coachHome.marker")
        XCTAssertEqual(SectionMarker.fileName(.model("tabs")), "model.tabs.marker")
        // not a short section: 60's screen markers and the store's are kept elsewhere; a name that cannot name a file
        XCTAssertNil(SectionMarker.fileName(.screen("coach")))
        XCTAssertNil(SectionMarker.fileName(.store))
        for bad in ["", "../coach", "coach/x", "coach home", "coach@x", "co.ach", "é", String(repeating: "a", count: 65)] {
            XCTAssertNil(SectionMarker.fileName(.model(bad)), bad)
            XCTAssertNil(SectionMarker(folder: folder, piece: .model(bad)), bad)
        }
        let tabs = try marker(.tabs)
        XCTAssertTrue(tabs.begin(shell: "61", page: "20261020-1"))
        XCTAssertEqual(try text("section.tabs.marker"), "tabs@20261020-1 shell 61\n0")
        let model = try marker(.model("coachHome"))
        XCTAssertTrue(model.begin(shell: "61", page: "20261020-1"))
        XCTAssertEqual(try text("model.coachHome.marker"), "model coachHome@20261020-1 shell 61\n0")
        model.enter()
        XCTAssertEqual(try text("model.coachHome.marker"), "model coachHome@20261020-1 shell 61\n1")
        model.leave()
    }

    // MARK: Test 1 (the file's half): left at 1 or at 0

    func testNoFileIsNoVerdict() {
        XCTAssertTrue(SectionMarker.stale(folder: folder).isEmpty)
        XCTAssertTrue(SectionMarker.stale(folder: folder.appendingPathComponent("none")).isEmpty, "no folder either")
    }

    /// A process that dies inside a section leaves `1` with its pair: the next launch reads it. One whose sections all
    /// ended leaves `0`: nothing.
    func testADeathInsideASectionLeavesOneAndOnlyThen() throws {
        do {
            let m = try marker(.tabs)
            XCTAssertTrue(m.begin(shell: "61", page: "P1"))
            m.enter()   // and the process dies here
        }
        let stale = SectionMarker.stale(folder: folder)
        XCTAssertEqual(stale.map { $0.url.lastPathComponent }, ["section.tabs.marker"])
        XCTAssertEqual(stale.first?.marker, CrashMarker(piece: .tabs, pageBuild: "P1", shellBuild: "61"))
        XCTAssertEqual(stale.first?.marker.line, "tabs@P1 shell 61")
        // the next launch's first section starts its own file, at 0 once it ends
        let next = try marker(.tabs)
        next.begin(shell: "61", page: "P1")
        XCTAssertTrue(SectionMarker.stale(folder: folder).isEmpty)
        // a model's section that ended
        let m = try marker(.model("coach"))
        m.begin(shell: "61", page: "P1")
        XCTAssertEqual(m.around { 7 }, 7)
        XCTAssertEqual(try stateByte("model.coach.marker"), SectionMarker.outside)
        XCTAssertTrue(SectionMarker.stale(folder: folder).isEmpty)
    }

    /// The launch reads only the short sections' files: 60's `presenting.*.marker` stay ScreenMarkers' (which build 60
    /// lists, and which never lists these), the store's marker stays FPHost's.
    func testStaleReadsOnlyTheShortSectionFiles() throws {
        try plant("presenting.coach.marker", "presenting coach@P1 shell 61\n")
        try plant("store.marker", "store@P1 shell 61\n1")
        try plant("breakers.json", "{}")
        try plant("switches.json", #"{"tabs":false}"#)
        try plant("section.tabs.marker", "tabs@P1 shell 61\n1")
        try plant("model.coachHome.marker", "model coachHome@P1 shell 61\n1")
        try plant("model.coach.marker", "model coach@P1 shell 61\n0")
        let stale = SectionMarker.stale(folder: folder)
        XCTAssertEqual(stale.map { $0.url.lastPathComponent }, ["model.coachHome.marker", "section.tabs.marker"])
        XCTAssertEqual(stale.map { $0.marker.line }, ["model coachHome@P1 shell 61", "tabs@P1 shell 61"])
        XCTAssertEqual(stale.map { $0.marker.piece }, [.model("coachHome"), .tabs])
        // what build 60 reads in the same folder: its own screen marker only
        XCTAssertEqual(ScreenMarkers(folder: folder).found(defaultShell: "60").map { $0.url.lastPathComponent }, ["presenting.coach.marker"])
    }

    /// Bytes that do not read, or a line of another kind than the file's name, are no verdict.
    func testGarbledOrForeignFilesAreNoVerdict() throws {
        let cases: [(String, String)] = [
            ("section.tabs.marker", "garbage"),
            ("section.tabs.marker", ""),
            ("section.tabs.marker", "tabs@P1 shell 61\n"),            // no state byte
            ("section.tabs.marker", "tabs@P1 shell 61\nX"),           // not a state
            ("section.tabs.marker", "tabs@P1\n1"),                    // no shell: never written so
            ("section.tabs.marker", "model coach@P1 shell 61\n1"),    // another kind's line
            ("section.tabs.marker", "store@P1 shell 61\n1"),
            ("section.tabs.marker", "presenting coach@P1 shell 61\n1"),
            ("model.coach.marker", "tabs@P1 shell 61\n1"),
            ("model.coach.marker", "model coachHome@P1 shell 61\n1"), // another screen's
            ("model.coach.marker", "presenting coach@P1 shell 61\n1"),
            ("section.sheets.marker", "sheets@P1 shell 62\n1"),       // a later build's kind this one cannot read
        ]
        for (name, body) in cases {
            try plant(name, body)
            XCTAssertTrue(SectionMarker.stale(folder: folder).isEmpty, "\(name): \(body.debugDescription)")
            try FileManager.default.removeItem(at: folder.appendingPathComponent(name))
        }
    }

    // MARK: Test 2: nesting and the page build

    /// Nested sections of a kind (a bar change inside a funnel run): `1` until the last one ends.
    func testNestedSectionsHoldTheByteUntilTheLastEnds() throws {
        let m = try marker(.tabs)
        m.begin(shell: "61", page: "P1")
        m.enter()
        m.enter()
        m.leave()
        XCTAssertEqual(try stateByte("section.tabs.marker"), SectionMarker.inside)
        XCTAssertTrue(m.isInside)
        m.leave()
        XCTAssertEqual(try stateByte("section.tabs.marker"), SectionMarker.outside)
        XCTAssertFalse(m.isInside)
        m.leave()   // one too many is harmless
        XCTAssertEqual(try stateByte("section.tabs.marker"), SectionMarker.outside)
        m.enter()
        XCTAssertEqual(try stateByte("section.tabs.marker"), SectionMarker.inside, "a leave too many never leaves the next section unmarked")
        m.leave()
        // kinds are apart: a model's section inside a tabs section holds its own file
        let model = try marker(.model("tabs"))
        model.begin(shell: "61", page: "P1")
        m.around {
            model.around {
                XCTAssertEqual(try? stateByte("section.tabs.marker"), SectionMarker.inside)
                XCTAssertEqual(try? stateByte("model.tabs.marker"), SectionMarker.inside)
            }
            XCTAssertEqual(try? stateByte("model.tabs.marker"), SectionMarker.outside)
            XCTAssertEqual(try? stateByte("section.tabs.marker"), SectionMarker.inside)
        }
        XCTAssertEqual(try stateByte("section.tabs.marker"), SectionMarker.outside)
    }

    /// A page build served later in the process rewrites the line, between sections only: inside one the line stays.
    func testANewPageBuildRewritesTheLineBetweenSectionsOnly() throws {
        let m = try marker(.tabs)
        XCTAssertTrue(m.begin(shell: "61", page: "A"))
        m.enter()
        XCTAssertTrue(m.begin(shell: "61", page: "B"), "inside a section: kept, still marked")
        XCTAssertEqual(try text("section.tabs.marker"), "tabs@A shell 61\n1")
        XCTAssertEqual(SectionMarker.stale(folder: folder).first?.marker.pageBuild, "A")
        m.leave()
        XCTAssertEqual(try text("section.tabs.marker"), "tabs@A shell 61\n0")
        XCTAssertTrue(m.begin(shell: "61", page: "B"))
        XCTAssertEqual(try text("section.tabs.marker"), "tabs@B shell 61\n0", "between sections: rewritten")
        m.enter()
        XCTAssertEqual(SectionMarker.stale(folder: folder).first?.marker.pageBuild, "B")
        m.leave()
        // the same pair again changes nothing (the descriptor stays open on the same file)
        let inode = try FileManager.default.attributesOfItem(atPath: folder.appendingPathComponent("section.tabs.marker").path)[.systemFileNumber] as? Int
        XCTAssertTrue(m.begin(shell: "61", page: "B"))
        m.around {}
        let after = try FileManager.default.attributesOfItem(atPath: folder.appendingPathComponent("section.tabs.marker").path)[.systemFileNumber] as? Int
        XCTAssertEqual(after, inode)
        XCTAssertEqual(try text("section.tabs.marker"), "tabs@B shell 61\n0")
    }

    /// A marker whose file cannot be written is off (no crash, nothing marked), and comes back once it can be.
    func testAFileThatCannotBeWrittenLeavesTheSectionUnmarked() throws {
        let blocked = folder.appendingPathComponent("blocked")
        try Data("a file where the folder should be".utf8).write(to: blocked)
        let m = try XCTUnwrap(SectionMarker(folder: blocked, piece: .tabs))
        XCTAssertFalse(m.begin(shell: "61", page: "P1"))
        XCTAssertEqual(m.around { 3 }, 3, "the body runs")
        try FileManager.default.removeItem(at: blocked)
        XCTAssertTrue(m.begin(shell: "61", page: "P1"))
        m.enter()
        XCTAssertEqual(SectionMarker.stale(folder: blocked).map { $0.marker.line }, ["tabs@P1 shell 61"])
        m.leave()
    }

    // MARK: Test 4: the shell's switch file

    private var switchFile: URL { folder.appendingPathComponent("switches.json") }
    private func copy(_ json: String) { defaults.set(Data(json.utf8), forKey: ShellSwitches.defaultsKey) }

    func testNoSwitchAnywhereIsEveryPieceOn() {
        let s = ShellSwitches(folder: folder, defaults: defaults)
        XCTAssertEqual(s.deviceOff, [])
        XCTAssertTrue(s.isOn("tabs"))
        XCTAssertEqual(ShellSwitches.pieces, ["tabs"], "61 keeps one switch of its own: the tab bar's")
        XCTAssertEqual(ShellSwitches.defaultsKey, "fp.shell.switches")
    }

    /// The file wins over a different copy in UserDefaults (the copy came back stale after a quick reinstall).
    func testTheSwitchFileWinsOverItsCopy() throws {
        try plant("switches.json", #"{"tabs":false}"#)
        copy(#"{"tabs":true}"#)
        var s = ShellSwitches(folder: folder, defaults: defaults)
        XCTAssertEqual(s.deviceOff, ["tabs"])
        XCTAssertFalse(s.isOn("tabs"))
        try plant("switches.json", #"{"tabs":true}"#)
        copy(#"{"tabs":false}"#)
        s = ShellSwitches(folder: folder, defaults: defaults)
        XCTAssertEqual(s.deviceOff, [])
        XCTAssertTrue(s.isOn("tabs"))
    }

    /// A file that does not read (missing, garbled, not an object of booleans) falls back to the copy. The copy says
    /// off and every garbled file reads as on if misread, so a misread shows.
    func testAGarbledOrMissingSwitchFileFallsBackToTheCopy() throws {
        copy(#"{"tabs":false}"#)
        XCTAssertEqual(ShellSwitches(folder: folder, defaults: defaults).deviceOff, ["tabs"], "no file: the copy")
        for garbled in ["garbage", "", "[]", "null", "{}x", #"{"tabs":"on"}"#, #"{"tabs":1}"#, #"{"tabs":true"#] {
            try plant("switches.json", garbled)
            XCTAssertEqual(ShellSwitches(folder: folder, defaults: defaults).deviceOff, ["tabs"], garbled)
        }
        copy("garbage")
        XCTAssertEqual(ShellSwitches(folder: folder, defaults: defaults).deviceOff, [], "neither reads: every piece on")
    }

    /// `set` puts the switch in force at once and writes the copy and the file, the file atomically: a new file renamed
    /// over the old one (a new inode, nothing left beside it), never written in place. A later build's switch is kept.
    func testSetWritesTheCopyAndTheFileAtomically() throws {
        var s = ShellSwitches(folder: folder, defaults: defaults)
        XCTAssertTrue(s.set("tabs", on: false))
        XCTAssertEqual(s.deviceOff, ["tabs"], "in force at once")
        XCTAssertEqual(try text("switches.json"), #"{"tabs":false}"#)
        XCTAssertEqual(defaults.data(forKey: ShellSwitches.defaultsKey), try bytes("switches.json"), "the copy holds the same")
        XCTAssertEqual(ShellSwitches(folder: folder, defaults: defaults).deviceOff, ["tabs"], "the next launch")
        let first = try FileManager.default.attributesOfItem(atPath: switchFile.path)[.systemFileNumber] as? Int
        // a reader holding the old file still reads it whole: the new one replaces it by rename
        let held = try FileHandle(forReadingFrom: switchFile)
        XCTAssertTrue(s.set("tabs", on: true))
        let second = try FileManager.default.attributesOfItem(atPath: switchFile.path)[.systemFileNumber] as? Int
        XCTAssertNotNil(first)
        XCTAssertNotEqual(first, second, "a new file renamed over the old one, never written in place")
        XCTAssertEqual(String(decoding: try held.readToEnd() ?? Data(), as: UTF8.self), #"{"tabs":false}"#)
        try held.close()
        XCTAssertEqual(try text("switches.json"), #"{"tabs":true}"#)
        XCTAssertEqual(s.deviceOff, [])
        let names = try FileManager.default.contentsOfDirectory(atPath: folder.path)
        XCTAssertEqual(names, ["switches.json"], "nothing half-written left beside it")
        // a later build's switch, read from the file, is written back as it was
        try plant("switches.json", #"{"sheets":false,"tabs":true}"#)
        var later = ShellSwitches(folder: folder, defaults: defaults)
        XCTAssertEqual(later.deviceOff, ["sheets"])
        later.set("tabs", on: false)
        XCTAssertEqual(try text("switches.json"), #"{"sheets":false,"tabs":false}"#)
        // the file's protection, where the system reports one
        let protection = try FileManager.default.attributesOfItem(atPath: switchFile.path)[.protectionKey] as? FileProtectionType
        if let protection { XCTAssertEqual(protection, .completeUntilFirstUserAuthentication) }
    }

    /// A file that cannot be written: the switch holds for this launch and in the copy, and `set` says false.
    func testASwitchFileThatCannotBeWrittenKeepsTheCopy() throws {
        let blocked = folder.appendingPathComponent("blocked")
        try Data("a file where the folder should be".utf8).write(to: blocked)
        var s = ShellSwitches(folder: blocked, defaults: defaults)
        XCTAssertFalse(s.set("tabs", on: false))
        XCTAssertEqual(s.deviceOff, ["tabs"])
        XCTAssertEqual(ShellSwitches(folder: blocked, defaults: defaults).deviceOff, ["tabs"], "the next launch reads the copy")
    }
}
#endif
