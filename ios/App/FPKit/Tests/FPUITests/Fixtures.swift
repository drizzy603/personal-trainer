#if os(iOS)
import Foundation
import FPCore

/// The coach fixtures FPCoreTests decodes (Tests/FPCoreTests/Fixtures/coach), read from the source
/// tree: a simulator shares the Mac's disk, so FPUITests keep no copy of their own. The coach home
/// fixtures have their own loader (CoachHomeFixtures, below).
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

/// The coach home fixtures FPCoreTests decodes (Tests/FPCoreTests/Fixtures/coachHome: CoachHomeModel v1, the hub and
/// the connect screen), read from the source tree as CoachFixtures reads the chat's. The folder is listed, never named
/// file by file, so the page-built fixtures (plan task P6) join the hand-made ones as they land. Never
/// Fixtures/coach, which CoachModelTests and CoachRenderTests read whole.
enum CoachHomeFixtures {
    static let dir: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("FPCoreTests/Fixtures/coachHome", isDirectory: true)

    /// Every coach home fixture by name (file name without .json), sorted.
    static func names() throws -> [String] {
        try FileManager.default.contentsOfDirectory(atPath: dir.path)
            .filter { $0.hasSuffix(".json") }
            .map { String($0.dropLast(5)) }
            .sorted()
    }

    /// The file as the shell reads the page's text: parsed, its lone surrogates mended.
    static func json(_ name: String) throws -> JSONValue {
        try JSONText.parse(utf8: Data(contentsOf: dir.appendingPathComponent(name + ".json")))
    }

    static func model(_ name: String) throws -> CoachHomeModel {
        try CoachHomeModel(json: json(name))
    }

    /// The fixture drawn in `room`: its own room keeps the file's tokens, another room takes that room's compiled
    /// defaults (as `CoachFixtures.model(_:in:)` draws a chat fixture there). CoachHomeModel's fields are constants, so
    /// the file is decoded again with the room, its paper and no tokens.
    static func model(_ name: String, in room: Room) throws -> CoachHomeModel {
        let json = try json(name)
        let own = try CoachHomeModel(json: json)
        guard own.room != room, case .object(var o) = json else { return own }
        o["room"] = .string(room.id)
        o["paper"] = .bool(room.isPaper ?? own.paper)
        o["tokens"] = nil
        return try CoachHomeModel(json: .object(o))
    }

    /// Every string the file holds, at any depth, as decoded (mended): what a render of it may draw (contract I10).
    static func strings(_ name: String) throws -> Set<String> {
        var out = Set<String>()
        func walk(_ v: JSONValue) {
            switch v {
            case .string(let s): out.insert(s)
            case .array(let a): a.forEach(walk)
            case .object(let o): o.values.forEach(walk)
            case .null, .bool, .number: break
            }
        }
        walk(try json(name))
        return out
    }
}
#endif
