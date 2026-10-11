import Foundation
import XCTest
import FPCore

/// JSON text with `~u` standing for a backslash-u escape (so this file never holds an escape a tool
/// could turn into the character it names): J(#"x~ud83d"#) is the six characters \ud83d after x.
func J(_ s: String) -> String { s.replacingOccurrences(of: "~u", with: "\\u") }

final class JSONTextTests: XCTestCase {
    private struct Box: Decodable, Equatable { var a: String }

    private func decodeA(_ text: String, mode: JSONText.Mode = .drop) throws -> String {
        try JSONText.decode(Box.self, from: J(text), mode: mode).a
    }

    /// Foundation refuses a whole document over half an emoji: the reason mending exists.
    func testFoundationRefusesALoneSurrogateEscape() {
        let text = J(#"{"a":"x~ud83dy"}"#)
        XCTAssertEqual(Array(text.utf8).filter { $0 == 0x5C }.count, 1, "the helper writes one backslash")
        XCTAssertThrowsError(try JSONSerialization.jsonObject(with: Data(text.utf8)))
        XCTAssertThrowsError(try JSONDecoder().decode(Box.self, from: Data(text.utf8)))
        XCTAssertEqual(try decodeA(#"{"a":"x~ud83dy"}"#), "xy")
    }

    func testWellFormedTextComesBackUnchanged() {
        let raw = "{\"a\":\"\u{1F4AA} raw pair\"}"
        for text in [#"{"a":"plain"}"#, raw, J(#"{"a":"~ud83d~udcaa escaped pair"}"#), J(#"{"a":"~u00e9 ~u2028 ~ud7ff ~ue000"}"#), ""] {
            XCTAssertEqual(JSONText.mend(text), text)
            XCTAssertEqual(JSONText.loneSurrogates(in: text), 0)
        }
    }

    func testLoneHalvesAreDroppedLikeTheWellFormedHelper() throws {
        XCTAssertEqual(try decodeA(#"{"a":"end ~ud83d"}"#), "end ")
        XCTAssertEqual(try decodeA(#"{"a":"~ude00start"}"#), "start")
        XCTAssertEqual(try decodeA(#"{"a":"reversed ~ude00~ud83d pair"}"#), "reversed  pair")
        XCTAssertEqual(try decodeA(#"{"a":"two ~ud83d~ud83d~ude00"}"#), "two \u{1F600}", "the first high half is lone, the second pairs")
        XCTAssertEqual(try decodeA(#"{"a":"upper ~uD83D case"}"#), "upper  case")
        XCTAssertEqual(JSONText.loneSurrogates(in: J(#"{"a":"~ude00~ud83d","b":"~ud83d~ude00"}"#)), 2)
    }

    func testEscapedPairsAreKept() throws {
        XCTAssertEqual(try decodeA(#"{"a":"~ud83d~ude00"}"#), "\u{1F600}")
        XCTAssertEqual(try decodeA(#"{"a":"~uD83D~uDE00"}"#), "\u{1F600}")
        XCTAssertEqual(try decodeA(#"{"a":"~ud83c~uddec~ud83c~udde7 x"}"#), "\u{1F1EC}\u{1F1E7} x")
        // a mended text with a lone half and a pair keeps the pair as escapes
        XCTAssertEqual(JSONText.mend(J(#""~ud83d~ud83d~ude00""#)), J(#""~ud83d~ude00""#))
    }

    func testReplaceModePutsUFFFD() throws {
        XCTAssertEqual(try decodeA(#"{"a":"x~ud83dy"}"#, mode: .replace), "x\u{FFFD}y")
        XCTAssertEqual(try decodeA(#"{"a":"~ude00"}"#, mode: .replace), "\u{FFFD}")
    }

    /// A backslash escaped before `u` is text, and an escaped quote never ends the string.
    func testEscapedBackslashesAndQuotesAreText() throws {
        // JSON: "\\ud83d and \" quote \\" then a lone \ud83d
        let text = #"{"a":"\\ud83d and \" quote \\~ud83d"}"#
        XCTAssertEqual(try decodeA(text), #"\ud83d and " quote \"#)
        XCTAssertEqual(JSONText.loneSurrogates(in: #"{"a":"\\ud83d"}"#), 0)
        XCTAssertEqual(JSONText.loneSurrogates(in: J(#"{"a":"\\~ud83d"}"#)), 1, "the backslash before is escaped; this escape is real")
    }

    func testKeysAreMendedToo() throws {
        XCTAssertEqual(try JSONText.parse(J(#"{"k~ud83d":1}"#)), ["k": 1])
    }

    /// Raw halves reach FPCore only as code units (an NSString read before bridging).
    func testRawCodeUnits() throws {
        let q: UInt16 = 0x22
        // "a<lone high>"
        let lone: [UInt16] = [q, 0x61, 0xD83D, q]
        XCTAssertEqual(String(decoding: JSONText.mend(units: lone), as: UTF16.self), #""a""#)
        XCTAssertEqual(JSONText.loneSurrogates(inUnits: lone), 1)
        XCTAssertEqual(String(decoding: JSONText.mend(units: lone, mode: .replace), as: UTF16.self), J(#""a~ufffd""#))
        // a raw pair stays raw
        let pair: [UInt16] = [q, 0xD83D, 0xDE00, q]
        XCTAssertEqual(JSONText.mend(units: pair), pair)
        // a raw high half and an escaped low half pair up, as JavaScript reads them, written as escapes
        let mixed: [UInt16] = [q, 0xD83D] + Array(J("~ude00").utf16) + [q]
        let mended = String(decoding: JSONText.mend(units: mixed), as: UTF16.self)
        XCTAssertEqual(mended, J(#""~ud83d~ude00""#))
        XCTAssertEqual(try JSONText.parse(mended), "\u{1F600}")
        // outside a string a raw half is never valid JSON: dropped as well
        let outside: [UInt16] = Array("[1]".utf16) + [0xDC00]
        XCTAssertEqual(String(decoding: JSONText.mend(units: outside), as: UTF16.self), "[1]")
    }

    /// The platform repairs a raw lone surrogate to U+FFFD when an NSString becomes a String (datalayer
    /// probe4), so a String never holds one; the units path keeps the page's own rule (drop).
    func testBridgingRepairsRawHalvesAndUnitsKeepThePageRule() {
        let units: [UInt16] = [0x61, 0xD83D, 0x62]
        let ns = NSString(characters: units, length: units.count)
        let bridged = ns as String
        XCTAssertFalse(bridged.utf16.contains { $0 >= 0xD800 && $0 <= 0xDFFF })
        XCTAssertEqual(JSONText.mendString(bridged), bridged)
        XCTAssertEqual(JSONText.mendString("pair \u{1F4AA}"), "pair \u{1F4AA}")
        var raw = [UInt16](repeating: 0, count: ns.length)
        ns.getCharacters(&raw, range: NSRange(location: 0, length: ns.length))
        let quoted: [UInt16] = [0x22] + raw + [0x22]
        XCTAssertEqual(String(decoding: JSONText.mend(units: quoted), as: UTF16.self), #""ab""#)
    }

    func testUTF8WithEncodedSurrogates() throws {
        // a lone high half written as three bytes (CESU-8 / WTF-8) -> dropped
        let lone = Data([0x22, 0xED, 0xA0, 0xBD, 0x22])
        XCTAssertEqual(try JSONText.parse(utf8: lone), "")
        // a pair written as two 3-byte halves -> the emoji
        let cesuPair = Data([0x22, 0xED, 0xA0, 0xBD, 0xED, 0xB8, 0x80, 0x22])
        XCTAssertEqual(try JSONText.parse(utf8: cesuPair), "\u{1F600}")
        // an invalid byte -> U+FFFD; valid 4-byte UTF-8 kept
        let mixed = Data([0x22, 0xFF]) + Data("\u{1F4AA}\"".utf8)
        XCTAssertEqual(try JSONText.parse(utf8: mixed), "\u{FFFD}\u{1F4AA}")
        // ASCII-only text with an escape takes the short path
        XCTAssertEqual(try JSONText.parse(utf8: Data(J(#""x~ud83d""#).utf8)), "x")
        // valid UTF-8 comes back byte for byte
        let clean = Data("{\"a\":\"\u{E9} \u{1F4AA}\"}".utf8)
        XCTAssertEqual(JSONText.mend(utf8: clean), clean)
    }

    func testParseRefusesWhatIsNotJSON() {
        XCTAssertThrowsError(try JSONText.parse("{nope")) { e in
            guard case JSONText.Failure.notJSON = e else { return XCTFail("\(e)") }
        }
    }

    func testJSONValueFromFoundationKeepsBooleansApart() throws {
        let object = try JSONSerialization.jsonObject(with: Data(#"{"t":true,"f":false,"one":1,"zero":0,"half":0.5,"n":null,"s":"x","a":[1,"b"]}"#.utf8))
        let v = try JSONValue(foundation: object)
        XCTAssertEqual(v["t"], .bool(true))
        XCTAssertEqual(v["f"], .bool(false))
        XCTAssertEqual(v["one"], .number(1))
        XCTAssertEqual(v["zero"], .number(0))
        XCTAssertEqual(v["one"]?.int, 1)
        XCTAssertNil(v["half"]?.int)
        XCTAssertEqual(v["half"]?.double, 0.5)
        XCTAssertEqual(v["n"], .null)
        XCTAssertEqual(v["a"]?[1], "b")
        XCTAssertNil(v["one"]?.bool, "a number is not a boolean")
        // Swift values as a plugin's options or callAsyncJavaScript hand them over
        let swift: [String: Any] = ["yes": true, "count": 3, "name": "coach", "list": ["a"], "nothing": NSNull()]
        XCTAssertEqual(try JSONValue(foundation: swift), ["yes": true, "count": 3, "name": "coach", "list": ["a"], "nothing": nil])
        // and back again
        let back = try JSONValue(foundation: JSONSerialization.jsonObject(with: JSONSerialization.data(withJSONObject: v.foundation)))
        XCTAssertEqual(back, v)
        XCTAssertThrowsError(try JSONValue(foundation: Date()))
    }

    func testJSONValueCodableAndText() throws {
        let v: JSONValue = ["b": [true, 2, 2.5, "s", nil], "a": ["x": "y"]]
        let data = try JSONEncoder().encode(v)
        XCTAssertEqual(try JSONDecoder().decode(JSONValue.self, from: data), v)
        XCTAssertEqual(v.jsonText, #"{"a":{"x":"y"},"b":[true,2,2.5,"s",null]}"#)
    }

    func testStringLeavesOfAnUnknownBlock() {
        let v: JSONValue = ["k": "chart", "title": "Weekly volume", "points": [["label": "W1", "v": 3]]]
        XCTAssertEqual(v.strings(skippingKeys: ["k"]), ["W1", "Weekly volume"])
    }
}
