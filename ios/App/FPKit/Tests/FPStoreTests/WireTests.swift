import Foundation
import XCTest
@testable import FPStore

/// The wire format against JavaScript's own output (Vectors/vectors.json, written by
/// tests/tools/ktstore-vectors.js): the store reads every literal the facade's JSON.stringify makes, computes the
/// facade's hash, and answers with literals JSON.parse turns back into the same code units.
final class WireTests: XCTestCase {
    static func vectors() throws -> [String: Any] {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "vectors", withExtension: "json", subdirectory: "Vectors"),
                                "Vectors/vectors.json missing: run node tests/tools/ktstore-vectors.js")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }

    /// A literal from the vectors file (a JSON-escaped string) to exact code units.
    static func units(fromLiteral lit: String, file: StaticString = #filePath, line: UInt = #line) throws -> U16 {
        try XCTUnwrap(KTWire.unquote(Array(lit.utf16)), "unquote \(lit.prefix(60))", file: file, line: line)
    }

    func testEveryValueTheFacadeSendsReadsExactlyAndHashesAlike() throws {
        let values = try XCTUnwrap(Self.vectors()["values"] as? [[String: Any]])
        XCTAssertGreaterThanOrEqual(values.count, 20)
        for v in values {
            let name = try XCTUnwrap(v["name"] as? String)
            let units = try Self.units(fromLiteral: try XCTUnwrap(v["lit"] as? String))
            XCTAssertEqual(units.count, v["len"] as? Int, name)
            XCTAssertEqual(KTWire.hash(units), v["h"] as? String, "hash parity: \(name)")
            // The store's own literal: what JavaScript computed it must be, and it reads back exactly.
            let store = KTWire.quote(units)
            XCTAssertEqual(store, v["store"] as? String, "store literal: \(name)")
            XCTAssertEqual(KTWire.unquote(Array(store.utf16)), units, "round trip: \(name)")
            XCTAssertTrue(KTWire.isWellFormed(Array(store.utf16)), "the store's literal holds no lone surrogate: \(name)")
        }
    }

    func testTwoHundredThousandCharacterValueHashesLikeJavaScript() throws {
        let formulas = try XCTUnwrap(Self.vectors()["formulas"] as? [[String: Any]])
        XCTAssertEqual(formulas.count, 2)
        for f in formulas {
            let name = try XCTUnwrap(f["name"] as? String)
            let units: U16
            switch name {
            case "big200k": units = (0..<200_000).map { UInt16(32 + ($0 * 7919) % 60000) }
            case "allUnits": units = (0..<65536).map { UInt16($0) }
            default: XCTFail("unknown formula \(name)"); continue
            }
            XCTAssertEqual(units.count, f["len"] as? Int, name)
            XCTAssertEqual(KTWire.hash(units), f["h"] as? String, "hash parity: \(name)")
            // JSON.stringify's literal, rebuilt here, is the one JavaScript made, and the store reads it exactly.
            let lit = Self.jsonStringify(units)
            XCTAssertEqual(KTWire.hash(lit), f["litH"] as? String, "JSON.stringify literal: \(name)")
            XCTAssertEqual(KTWire.unquote(lit), units, "unquote: \(name)")
            let store = KTWire.quote(units)
            XCTAssertEqual(KTWire.hash(Array(store.utf16)), f["storeH"] as? String, "store literal: \(name)")
            XCTAssertEqual(KTWire.unquote(Array(store.utf16)), units, "store round trip: \(name)")
        }
    }

    func testHelloPayloadAsTheFacadeBuildsIt() throws {
        let h = try XCTUnwrap(Self.vectors()["hello"] as? [String: Any])
        let hello = try XCTUnwrap(KTProtocol.parseHello(try XCTUnwrap(h["payload"] as? String)))
        var expected: [KTKey: String] = [:]
        for pair in try XCTUnwrap(h["manifest"] as? [[String]]) {
            expected[try XCTUnwrap(KTKey(units: try Self.units(fromLiteral: pair[0])))] = pair[1]
        }
        XCTAssertEqual(hello.manifest, expected)
        XCTAssertEqual(hello.skippedKeys, h["skipped"] as? Int, "a key holding a lone surrogate is skipped")
        XCTAssertNotNil(hello.manifest["kt_apikey"], "the manifest carries it; the reconcile skips it")
        var gap: [KTKey: String] = [:]
        for pair in try XCTUnwrap(h["gap"] as? [[String]]) {
            gap[try XCTUnwrap(KTKey(units: try Self.units(fromLiteral: pair[0])))] = pair[1]
        }
        XCTAssertEqual(hello.gap?.keys, gap)
        XCTAssertEqual(hello.gap?.at, (h["gapAt"] as? NSNumber)?.int64Value)
        XCTAssertFalse(hello.badGap)
    }

    func testGapNotesAsTheFacadeWritesThem() throws {
        let notes = try XCTUnwrap(Self.vectors()["gapNotes"] as? [[String: Any]])
        for n in notes {
            let text = try XCTUnwrap(n["note"] as? String)
            let parsed = KTProtocol.GapNote.parse(Array(text.utf16))
            guard n["valid"] as? Bool == true else {
                XCTAssertNil(parsed, "unreadable note read as a note: \(text)")
                continue
            }
            let note = try XCTUnwrap(parsed, text)
            XCTAssertEqual(note.all, n["all"] as? Bool, text)
            var keys: [KTKey: String] = [:]
            for pair in try XCTUnwrap(n["keys"] as? [[String]]) {
                keys[try XCTUnwrap(KTKey(units: try Self.units(fromLiteral: pair[0])))] = pair[1]
            }
            XCTAssertEqual(note.keys, keys, text)
        }
        // The note the tests' fake facade writes reads back the same.
        let note = KTProtocol.GapNote(keys: ["kt_last_open": "13:1:2", "kt_sessions": "-"], all: false, at: 42)
        XCTAssertEqual(KTProtocol.GapNote.parse(note.json()), note)
    }

    /// A `\uXXXX` escape as text (spelled with \u{5C} so source tools never turn it into the character).
    static func esc(_ hex: String) -> String { "\u{5C}u" + hex }

    func testQuoteEscapesEverySurrogateHalfControlAndLineSeparator() {
        let e = Self.esc
        XCTAssertEqual(KTWire.quote([0xD83D, 0xDCAA]), "\"" + e("d83d") + e("dcaa") + "\"")
        XCTAssertEqual(KTWire.quote([0x2028, 0x2029, 0x0000, 0x001F]), "\"" + e("2028") + e("2029") + e("0000") + e("001f") + "\"")
        XCTAssertEqual(KTWire.quote(Array("a\"b\\c\n\t\r\u{8}\u{c}/".utf16)), #""a\"b\\c\n\t\r\b\f/""#)
        XCTAssertEqual(KTWire.quote(Array("\u{e9}\u{4e2d}".utf16)), "\"\u{e9}\u{4e2d}\"")
        XCTAssertEqual(KTWire.quote([]), "\"\"")
    }

    func testUTF8LiteralEqualsTheUTF16One() {
        let samples: [U16] = [
            [], Array("plain".utf16), [0xD83D], [0xDC4D, 0xD83D], [0x2028, 0, 0x7F, 0x80, 0x7FF, 0x800, 0xFFFF],
            Array("q\"b\\n\n".utf16), (0..<65536).map { UInt16($0) },
        ]
        for u in samples {
            var bytes: [UInt8] = [0x41]  // appends after what is there
            KTWire.appendQuotedUTF8(u, to: &bytes)
            XCTAssertEqual(bytes.first, 0x41)
            XCTAssertEqual(String(decoding: bytes.dropFirst(), as: UTF8.self), KTWire.quote(u))
        }
    }

    /// Snapshots quote and hash each value in one pass, four units at a time where it can
    /// (`KTWire.quoteUTF8`). That pass must give exactly `quote` and `hash`: at every length (the quads' tails),
    /// from any address (a BLOB in SQLite's memory), for every kind of unit and every mix of them in one quad.
    func testSnapshotEncoderEqualsQuoteAndHashAtAnyLengthAndAddress() {
        let alphabet: [UInt16] = [0x41, 0x7A, 0x20, 0x7E, 0x7F, 0x22, 0x5C, 0x2F, 0x0A, 0x09, 0x00, 0x1F, 0x08, 0xE9,
                                  0x7FF, 0x800, 0x4E2D, 0xFFFF, 0xD83D, 0xDCAA, 0xDC4D, 0x2028, 0x2029, 0x3A, 0x7B]
        var rng = SplitMix(seed: 0x6b74_7374_6f72_6531)
        var samples: [U16] = [[], Array("plain text, four at a time".utf16), (0..<65536).map { UInt16($0) }]
        for n in 0..<48 {
            for mix in 0..<6 {
                samples.append((0..<n).map { _ in
                    // mix 0: printable ASCII only; 1: with quotes and backslashes; 2...: anything.
                    let pick = Int(rng.next() % UInt64(mix == 0 ? 3 : mix == 1 ? 7 : alphabet.count))
                    return mix == 0 ? [0x41, 0x7A, 0x20][pick] : alphabet[pick]
                })
            }
        }
        samples.append(Array(#"{"id":1,"note":"say \"hi\" \\ bye"}"#.utf16) + [0xD83D])
        let encoder = KTLiteralEncoder()
        for u in samples {
            let expected = Array(KTWire.quote(u).utf8)
            for offset in 0..<3 {  // aligned, odd and even-but-unaligned source addresses
                let raw = UnsafeMutableRawPointer.allocate(byteCount: u.count * 2 + 8, alignment: 16)
                defer { raw.deallocate() }
                u.withUnsafeBytes { if !$0.isEmpty { (raw + offset).copyMemory(from: $0.baseAddress!, byteCount: $0.count) } }
                let out = UnsafeMutablePointer<UInt8>.allocate(capacity: u.count * 6 + 2)
                defer { out.deallocate() }
                let (written, h) = encoder.encode(utf16le: UnsafeRawBufferPointer(start: raw + offset, count: u.count * 2),
                                                  to: out)
                XCTAssertEqual(Array(UnsafeBufferPointer(start: out, count: written)), expected,
                               "literal of \(u.prefix(12).map { String($0, radix: 16) }) (\(u.count) units) at +\(offset)")
                XCTAssertEqual(h, KTWire.hash(u), "hash of \(u.count) units at +\(offset)")
            }
        }
    }

    func testUnquoteRejectsWhatIsNotOneLiteral() {
        for bad in [#""#, #"""#, #"abc"#, #""abc"#, #"abc""#, #""a\""#, #""\x""#, #""\u12""#, #""\u12g4""#, #""a"b""#] {
            XCTAssertNil(KTWire.unquote(Array(bad.utf16)), bad)
        }
        let e = Self.esc
        let escaped = "\"" + e("00e9") + e("D83D") + e("DCAA") + "\u{5C}/\""
        XCTAssertEqual(KTWire.unquote(Array(escaped.utf16)), [0xE9, 0xD83D, 0xDCAA, 0x2F])
    }

    func testLinesPairsAndHeads() throws {
        XCTAssertEqual(KTWire.lines(nil).count, 0)
        XCTAssertEqual(KTWire.lines("").count, 0)
        XCTAssertEqual(KTWire.lines("\"a\"\n\"\"\nnull").count, 3)
        let pairs = try XCTUnwrap(KTProtocol.parsePairs(KTProtocol.pairsPayload([("kt_a", [0xD83D]), ("kt_b", nil)])))
        XCTAssertEqual(pairs.map(\.0), ["kt_a", "kt_b"])
        XCTAssertEqual(pairs[0].1, [0xD83D])
        XCTAssertNil(pairs[1].1)
        XCTAssertNil(KTProtocol.parsePairs("\"kt_a\""), "an odd line count")
        XCTAssertNil(KTProtocol.parsePairs("\"kt_\\ud83d\"\n\"v\""), "a key holding a lone surrogate")

        XCTAssertEqual(KTProtocol.parseHead("hello"), .hello(nowk: false))
        XCTAssertEqual(KTProtocol.parseHead("hello nowk"), .hello(nowk: true))
        XCTAssertEqual(KTProtocol.parseHead("put"), .put)
        XCTAssertEqual(KTProtocol.parseHead("pb"), .putBackRequest)
        XCTAssertEqual(KTProtocol.parseHead("w 3:17"), .write(.init(boot: 3, seq: 17)))
        XCTAssertEqual(KTProtocol.parseHead("d 1:0"), .remove(.init(boot: 1, seq: 0)))
        XCTAssertEqual(KTProtocol.parseHead("c 2:9"), .clear(.init(boot: 2, seq: 9)))
        XCTAssertEqual(KTProtocol.parseHead("p 2:10"), .putBack(.init(boot: 2, seq: 10)))
        for bad in ["", "w", "w 3", "w 0:1", "w a:1", "w 1:-1", "hello x", "rewrite", "snap", "w  1:2"] {
            XCTAssertNil(KTProtocol.parseHead(bad), bad)
        }
        XCTAssertLessThan(KTProtocol.BootSeq(boot: 2, seq: 99), KTProtocol.BootSeq(boot: 3, seq: 0))
    }

    func testKeysCompareByCodeUnitsNotCanonicalEquivalence() {
        XCTAssertEqual("\u{e9}" as String, "e\u{301}" as String, "Swift folds these together")
        XCTAssertNotEqual(KTKey("\u{e9}"), KTKey("e\u{301}"), "WebKit keeps them apart, and so does the store")
        XCTAssertEqual(Set<KTKey>(["\u{e9}", "e\u{301}"]).count, 2)
        XCTAssertNil(KTKey(units: [0x6B, 0xD83D]))
        XCTAssertNotNil(KTKey(units: [0xD83D, 0xDCAA]))
        XCTAssertTrue(KTKey("kt__store_gap").hasPrefix(KTProtocol.reservedPrefix))
        XCTAssertTrue(KTProtocol.isReserved("kt_apikey"))
        XCTAssertFalse(KTProtocol.isReserved("kt_sessions"))
    }

    func testJSONScannerSlicesExactly() throws {
        let text = Array(#" [ {"a":"]\"}","b":[1,{"c":"["}]} , [1,2] ,"x\"y\ud83d", -3.5e2 ,true,null ] "#.utf16)
        let parts = try XCTUnwrap(KTJSON.arrayElements(text))
        XCTAssertEqual(parts.map { String(decoding: text[$0], as: UTF16.self) },
                       [#"{"a":"]\"}","b":[1,{"c":"["}]}"#, "[1,2]", #""x\"y\ud83d""#, "-3.5e2", "true", "null"])
        let members = try XCTUnwrap(KTJSON.objectMembers(text, parts[0]))
        XCTAssertEqual(members.map { String(decoding: $0.key, as: UTF16.self) }, ["a", "b"])
        XCTAssertEqual(KTJSON.string(text, members[0].value), Array("]\"}".utf16))
        XCTAssertEqual(KTJSON.string(text, parts[2]), Array("x\"y".utf16) + [0xD83D])
        XCTAssertEqual(KTJSON.arrayElements(Array("[]".utf16))?.count, 0)
        for bad in ["", "[", "[1,]", "[1 2]", "{}", "[1]x", "[\"a]", "[{]}", "[}"] {
            XCTAssertNil(KTJSON.arrayElements(Array(bad.utf16)), bad)
        }
        // Deep nesting cannot overflow the stack.
        let deep = Array((String(repeating: "[", count: 100_000) + String(repeating: "]", count: 100_000)).utf16)
        XCTAssertEqual(KTJSON.arrayElements(deep)?.count, 1)
    }

    /// JSON.stringify's literal for exact code units: it escapes a lone surrogate but keeps a pair and U+2028 as
    /// they are (the store's own literal escapes those too).
    static func jsonStringify(_ u: U16) -> U16 {
        var out: U16 = [0x22]
        var i = 0
        func esc(_ c: UInt16) {
            out += Array("\\u".utf16) + Array(String(format: "%04x", c).utf16)
        }
        while i < u.count {
            let c = u[i]
            switch c {
            case 0x22: out += [0x5C, 0x22]
            case 0x5C: out += [0x5C, 0x5C]
            case 0x08: out += [0x5C, 0x62]
            case 0x0C: out += [0x5C, 0x66]
            case 0x0A: out += [0x5C, 0x6E]
            case 0x0D: out += [0x5C, 0x72]
            case 0x09: out += [0x5C, 0x74]
            case 0..<0x20: esc(c)
            case 0xD800...0xDBFF:
                if i + 1 < u.count, u[i + 1] & 0xFC00 == 0xDC00 { out += [c, u[i + 1]]; i += 1 } else { esc(c) }
            case 0xDC00...0xDFFF: esc(c)
            default: out.append(c)
            }
            i += 1
        }
        out.append(0x22)
        return out
    }
}
