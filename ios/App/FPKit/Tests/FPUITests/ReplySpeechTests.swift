#if os(iOS)
import XCTest
@testable import FPUI
import FPCore

/// What VoiceOver reads for a coach reply (plan task C6; the third UI review heard tables read with
/// their pipes, and lost the takeaway's label and the reply's type): the reply's type first, then
/// its blocks as words, as the page's _coachSpeech reads them.
final class ReplySpeechTests: XCTestCase {
    private func reply(_ m: CoachModel, _ what: String, where match: (Message) -> Bool) throws -> Message {
        try XCTUnwrap(m.messages.first { $0.look == .reply && match($0) }, what)
    }

    private static func hasTable(_ b: MessageBody) -> Bool {
        if case .markdown(let blocks) = b { return blocks.contains { if case .table = $0 { return true } else { return false } } }
        return false
    }

    func testAReplyReadsItsTypeMetricsAndTakeaway() throws {
        let m = try CoachFixtures.model("heavyweight-chat")
        var run = try reply(m, "the run analysis", where: { $0.eyebrow?.hasSuffix("Run analysis") == true })
        // the page sends no label of its own (C3's model has none; a hand-made fixture may)
        run.a11y = nil
        XCTAssertEqual(ReplySpeech.label(run),
                       "Coach, Run analysis: Good session. Faster than planned, but your heart rate says it stayed easy.\n"
                       + "PACE: 8:07 vs 8:15 goal -8s. AVG HR: 168 vs cap 165 +3. DISTANCE: 5.01 km on plan.\n"
                       + "Takeaway: Aerobic base is improving - same pace, 6 bpm lower.")
    }

    func testATableReadsCellByCellNeverItsPipes() throws {
        let m = try CoachFixtures.model("heavyweight-chat")
        var table = try reply(m, "the top-sets table", where: { Self.hasTable($0.body) })
        table.a11y = nil
        let label = ReplySpeech.label(table)
        XCTAssertEqual(label, "Coach: Your top sets:\n"
                       + "Lift, Top set, Change. Bench, 170 lb x 5, +10. Squat, 225 x 3, held. Deadlift, 275 x 2\n"
                       + "After the table.")
        XCTAssertFalse(label.contains("|"), "no pipes")
        XCTAssertFalse(label.contains("*") || label.contains("`"), "styles are faces, not characters")
    }

    func testPlainRepliesListsAndThePagesOwnLabel() throws {
        let m = try CoachFixtures.model("heavyweight-chat")
        var plain = try reply(m, "a one-paragraph reply", where: { $0.body.plainText.hasPrefix("That is a clean bar path") })
        plain.a11y = nil
        XCTAssertEqual(ReplySpeech.label(plain), "Coach: That is a clean bar path. Keep the elbows tucked on the way down.")
        var list = try reply(m, "the reply with lists", where: { $0.body.plainText.hasPrefix("Three things this week:") })
        list.a11y = nil
        XCTAssertTrue(ReplySpeech.label(list).hasPrefix("Coach: Three things this week:\nBench: hold 160 lb and own the last rep\n"))
        // a rule is not read; a label the page sends wins
        let ruled = try CoachModel.decode(#"{"v":1,"messages":[{"id":"a","role":"assistant","eyebrow":"COACH","body":{"k":"md","blocks":[{"k":"p","r":["One"]},{"k":"hr"},{"k":"p","r":["Two"]}]}},{"id":"b","role":"assistant","a11y":"Coach: as the page says it","body":"x"}]}"#)
        XCTAssertEqual(ReplySpeech.label(ruled.messages[0]), "Coach: One\nTwo")
        XCTAssertEqual(ReplySpeech.label(ruled.messages[1]), "Coach: as the page says it")
        XCTAssertEqual(ReplySpeech.replyType("COACH"), nil)
        XCTAssertEqual(ReplySpeech.replyType("COACH \u{00B7} Week review"), "Week review")
    }
}
#endif
