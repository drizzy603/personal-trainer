import Foundation
import XCTest
import FPCore

final class BlocksTests: XCTestCase {
    /// Fixtures/blocks/page-grammar.json comes from the page's own md() and _coachBlocksHTML()
    /// (Tools/blocks-fixtures.js): each body decodes with no unknown part, encodes back to the same JSON,
    /// and reads with the structure the page's HTML has (its signature was taken off that HTML).
    func testEveryPageGrammarFixtureDecodesToWhatThePageDraws() throws {
        let file = try FixtureFiles.json("blocks/page-grammar.json")
        let cases = try XCTUnwrap(file["cases"]?.array)
        XCTAssertGreaterThanOrEqual(cases.count, 12)
        var kinds = Set<String>()
        for c in cases {
            let name = c["name"]?.string ?? "?"
            let bodyJSON = try XCTUnwrap(c["body"], name)
            let body = MessageBody(json: bodyJSON)
            XCTAssertEqual(body.json, bodyJSON, "\(name): decoding lost or changed something")
            let eyebrow = c["eyebrow"]?.string ?? ""
            let want = (c["signature"]?.array ?? []).compactMap(\.string)
            XCTAssertEqual(["eyebrow:" + eyebrow] + body.signature, want, name)
            XCTAssertFalse(body.signature.contains { $0.hasPrefix("?") }, "\(name) has a part this build does not know")
            kinds.formUnion(body.signature.map { String($0.prefix { $0 != ":" }) })
        }
        // the fixtures cover every block the page's grammar draws
        for k in ["md", "p", "ul", "li", "li.sub", "ol", "h", "hr", "table", "th", "tr", "metrics", "m", "take", "chip*", "chip"] {
            XCTAssertTrue(kinds.contains(k), "no fixture draws \(k)")
        }
    }

    func testRunsAndStyles() {
        XCTAssertEqual(Run(json: "plain"), Run("plain"))
        XCTAssertEqual(Run(json: ["t": "x", "s": "bic"]), Run("x", bold: true, italic: true, code: true))
        XCTAssertEqual(Run(json: ["t": "x", "s": "bz"]), Run("x", bold: true), "unknown style letters are ignored")
        XCTAssertNil(Run(json: ["s": "b"]))
        XCTAssertNil(Run(json: 3))
        XCTAssertEqual(Run("x", italic: true, code: true).json, ["t": "x", "s": "ic"])
        XCTAssertEqual(Run("x").json, "x")
        let runs: Inline = [Run("a "), Run("b", bold: true), Run("c", bold: true), Run(""), Run(" d")]
        XCTAssertEqual(runs.merged, [Run("a "), Run("bc", bold: true), Run(" d")])
        XCTAssertEqual(runs.plainText, "a bc d")
        XCTAssertEqual(Inline(runs: "bare"), [Run("bare")], "a bare string reads as one plain run")
        XCTAssertEqual(Inline(runs: ["a", 1, ["t": "b", "s": "i"], nil]), [Run("a"), Run("b", italic: true)])
    }

    /// A newer page's kind draws as text: its own "text", else every string in it. It re-encodes as sent.
    func testUnknownKindsFallBackToText() {
        let body = MessageBody(json: ["k": "cmb", "sections": [
            ["k": "md", "blocks": [["k": "callout", "text": "Deload next week", "tone": "warn"], ["k": "p", "r": ["ok"]]]],
            ["k": "chart", "title": "Weekly volume", "points": [["label": "W1"], ["label": "W2"]]],
        ], "actions": []])
        guard case .coach(let sections, _) = body, sections.count == 2,
              case .markdown(let blocks) = sections[0], case .unknown(let callout) = blocks[0],
              case .unknown(let chart) = sections[1] else { return XCTFail("\(body)") }
        XCTAssertEqual(callout.kind, "callout")
        XCTAssertEqual(callout.text, "Deload next week")
        XCTAssertEqual(chart.kind, "chart")
        XCTAssertEqual(chart.text, "W1 W2 Weekly volume")
        XCTAssertEqual(body.signature, ["md", "?callout:Deload next week", "p:ok", "?chart:W1 W2 Weekly volume"])
        XCTAssertEqual(body.plainText, "Deload next week\nok\nW1 W2 Weekly volume")
        XCTAssertEqual(MessageBody(json: body.json), body)

        let whole = MessageBody(json: ["k": "voice", "text": "A voice note", "url": "x"])
        guard case .unknown(let u) = whole else { return XCTFail("\(whole)") }
        XCTAssertEqual(u.text, "A voice note")
        XCTAssertEqual(whole.json, ["k": "voice", "text": "A voice note", "url": "x"])
        guard case .unknown(let n) = MessageBody(json: 42) else { return XCTFail() }
        XCTAssertEqual(n.text, "")
    }

    func testTolerantDecoding() {
        XCTAssertEqual(MessageBody(json: nil), .text(""))
        XCTAssertEqual(MessageBody(json: .null), .text(""))
        XCTAssertEqual(MessageBody(json: "Stopped."), .text("Stopped."))
        XCTAssertEqual(MessageBody(json: ["k": "text", "text": "hi"]), .text("hi"))
        XCTAssertEqual(MessageBody(json: ["k": "md", "blocks": [["k": "ol", "items": [["r": ["one"]]]]]]),
                       .markdown([.numbered(start: 1, items: [ListItem([Run("one")])])]), "an ol without start counts from 1")
        let cmb = MessageBody(json: ["k": "cmb", "sections": [
            ["k": "metrics", "rows": [["label": "PACE", "value": "8:07", "delta": "-8s", "tone": "GOOD"], ["label": "HR", "tone": "loud"]]],
            ["k": "take", "text": "plain takeaway"],
        ], "actions": [["label": "", "msg": "no label"], ["label": "First"], ["label": "Second", "msg": "two", "primary": false], ["label": "Third"]]])
        guard case .coach(let sections, let actions) = cmb else { return XCTFail() }
        XCTAssertEqual(sections[0], .metrics([MetricRow(label: "PACE", value: "8:07", delta: "-8s", tone: .good), MetricRow(label: "HR", value: "")]))
        XCTAssertEqual(sections[1], .takeaway([Run("plain takeaway")]))
        XCTAssertEqual(actions, [CoachAction(label: "First", msg: "First", primary: false), CoachAction(label: "Second", msg: "two", primary: false)],
                       "a chip without a label is left out, msg defaults to the label, two at most; primary is the first one sent")
        XCTAssertEqual(cmb.actions.count, 2)
    }

    func testPlainTextForVoiceOverAndLogs() throws {
        let file = try FixtureFiles.json("blocks/page-grammar.json")
        let byName = Dictionary(uniqueKeysWithValues: (file["cases"]?.array ?? []).map { ($0["name"]!.string!, MessageBody(json: $0["body"])) })
        XCTAssertEqual(byName["run-analysis"]?.plainText,
                       "Good session. Faster than planned, but your heart rate says it stayed easy.\nPACE: 8:07 vs 8:15 goal -8s\nAVG HR: 168 vs cap 165 +3\nDISTANCE: 5.01 km on plan\nAerobic base is improving - same pace, 6 bpm lower.")
        XCTAssertEqual(byName["table"]?.plainText, "Your top sets:\nLift | Top set | Change\nBench | 170 lb x 5 | +10\nSquat | 225 x 3 | held\nDeadlift | 275 x 2\nAfter the table.")
        XCTAssertEqual(byName["unicode"]?.signature.last, "m:STR\u{D6}M=5 km||\u{2713}#good", "upper-cased by the page; half an emoji dropped by _nativeJSON")
        XCTAssertEqual(JSONText.loneSurrogates(in: try FixtureFiles.text("blocks/page-grammar.json")), 0)
    }
}
