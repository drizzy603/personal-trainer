#if os(iOS)
import Foundation
import FPCore

/// The coach fixtures FPCoreTests decodes (Tests/FPCoreTests/Fixtures/coach), read from the source
/// tree: a simulator shares the Mac's disk, so FPUITests keep no copy of their own.
enum CoachFixtures {
    static let coachDir: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()      // FPUITests
        .deletingLastPathComponent()      // Tests
        .appendingPathComponent("FPCoreTests/Fixtures/coach", isDirectory: true)

    static let blocksFile: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("FPCoreTests/Fixtures/blocks/page-grammar.json")

    /// Every coach fixture by name (file name without .json), sorted.
    static func names() throws -> [String] {
        try FileManager.default.contentsOfDirectory(atPath: coachDir.path)
            .filter { $0.hasSuffix(".json") }
            .map { String($0.dropLast(5)) }
            .sorted()
    }

    static func model(_ name: String) throws -> CoachModel {
        try CoachModel.decode(utf8: Data(contentsOf: coachDir.appendingPathComponent(name + ".json")))
    }

    /// The model drawn in another room: that room's compiled defaults (its own room keeps the
    /// fixture's tokens, overrides included).
    static func model(_ m: CoachModel, in room: Room) -> CoachModel {
        guard m.room != room else { return m }
        var x = m
        x.room = room
        x.paper = room.isPaper ?? m.paper
        x.tokens = Tokens.defaults(for: room, paper: x.paper)
        return x
    }

    /// The page-grammar cases: (name, body).
    static func grammar() throws -> [(String, MessageBody)] {
        let json = try JSONText.parse(utf8: Data(contentsOf: blocksFile))
        return (json["cases"]?.array ?? []).compactMap { c in
            guard let name = c["name"]?.string else { return nil }
            return (name, MessageBody(json: c["body"]))
        }
    }
}
#endif
