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

    /// The shared draft-merge vectors (contract 4.2), which the page's specs read too.
    static let putbackFile: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("FPCoreTests/Fixtures/draft/putback.json")

    /// One draft-merge vector: the composer, the words handed in, the composer after.
    struct Putback {
        let name: String, composer: String, words: String, result: String
    }

    /// Every putback vector, in file order. A file of another version, or a case without its four strings, is an error,
    /// never skipped: the tests that read these say they run every case.
    static func putbacks() throws -> [Putback] {
        func unreadable(_ why: String) -> Error {
            CocoaError(.fileReadCorruptFile, userInfo: [NSFilePathErrorKey: putbackFile.path, NSDebugDescriptionErrorKey: why])
        }
        let o = try JSONSerialization.jsonObject(with: Data(contentsOf: putbackFile)) as? [String: Any]
        guard o?["v"] as? Int == 1 else { throw unreadable("v is not 1") }
        guard let cases = o?["cases"] as? [[String: Any]] else { throw unreadable("no cases array") }
        return try cases.enumerated().map { i, c in
            guard let n = c["name"] as? String, let comp = c["composer"] as? String, let w = c["words"] as? String,
                  let r = c["result"] as? String else { throw unreadable("case \(i) lacks one of name, composer, words, result") }
            return Putback(name: n, composer: comp, words: w, result: r)
        }
    }

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
