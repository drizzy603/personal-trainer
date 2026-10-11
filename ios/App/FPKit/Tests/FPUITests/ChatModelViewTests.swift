#if os(iOS)
import SwiftUI
import XCTest
@testable import FPUI
import FPCore

/// What the views take from the model: the model switch's words (spec 114), the parts of the
/// conversation in the web's order and rhythm, the intents the controls send.
final class ChatModelViewTests: XCTestCase {
    func testModelSwitchSaysWhatSpec114Says() throws {
        let m = try XCTUnwrap(CoachFixtures.model("heavyweight-chat").header.model)
        XCTAssertEqual(ModelSwitchText.title(m, short: false), "Sonnet 5.5")
        XCTAssertEqual(ModelSwitchText.title(m, short: true), "Sonnet", "the version stands down on narrow screens and under Larger Text")
        XCTAssertEqual(ModelSwitchText.accessibilityLabel(m), "Coach model: Sonnet 5.5. Switch to Haiku 4.5")
        XCTAssertEqual(m.intent, .coachModel(model: "claude-haiku-4-5-20251001"))
        // the other side of the toggle, as the page names it
        let haiku = try CoachModel.decode(#"{"v":1,"header":{"model":{"label":"Haiku 4.5","next":"claude-sonnet-5-5","a11y":"Coach model: Haiku 4.5. Switch to Sonnet 5.5"}}}"#)
        let h = try XCTUnwrap(haiku.header.model)
        XCTAssertEqual(ModelSwitchText.title(h, short: false), "Haiku 4.5")
        XCTAssertEqual(ModelSwitchText.title(h, short: true), "Haiku")
        XCTAssertEqual(ModelSwitchText.accessibilityLabel(h), "Coach model: Haiku 4.5. Switch to Sonnet 5.5")
        XCTAssertEqual(h.intent, .coachModel(model: "claude-sonnet-5-5"))
    }

    func testPartsFollowTheWebOrder() throws {
        let m = try CoachFixtures.model("heavyweight-chat")
        let ids = ChatPart.parts(m).map(\.id)
        XCTAssertEqual(ids, [
            "day-m1", "turn-m1", "reply-m2",
            "turn-m3",                       // the seed carries its day: TODAY · PLATEAU CHECK, no divider
            "reply-m4", "turn-m5", "reply-m6", "turn-m7",
            "reply-m8", "pills-m8", "ledger-m8",
            "turn-m9", "reply-m10", "turn-m11",
            "note-m12", "chip-m12",
        ])
        if case .seed(_, let day) = ChatPart.parts(m)[3].kind { XCTAssertEqual(day, "Today") } else { XCTFail("m3 is a seed") }
    }

    func testRhythmIs8Between20AroundTheOwnersTurn() throws {
        let parts = ChatPart.parts(try CoachFixtures.model("heavyweight-chat"))
        let extra = parts.indices.map { ChatPart.extraTop(parts, $0) }
        XCTAssertEqual(extra[0], 6, "a day divider keeps its 6 px even first in the column")
        XCTAssertEqual(extra[1], 12, "a bubble after the day divider")
        XCTAssertEqual(extra[2], 12, "the reply after a bubble")
        XCTAssertEqual(extra[9], 0, "pills after their reply: 8 only")
        XCTAssertEqual(extra[10], 0, "PLAN CHANGES after the pills")
        let intake = ChatPart.parts(try CoachFixtures.model("intake"))
        XCTAssertEqual(intake.last?.id, "thinking", "a reply in flight ends the column")
    }

    func testChipsHideWhileAReplyIsInFlightAndUnknownOnesNeverShow() throws {
        var m = try CoachFixtures.model("errors")
        XCTAssertTrue(ChatPart.parts(m).contains { $0.id == "chip-m8" })
        XCTAssertFalse(ChatPart.parts(m).contains { $0.id == "chip-m2" }, "billing: no chip")
        m.loading = true
        XCTAssertFalse(ChatPart.parts(m).contains { $0.id == "chip-m8" })
        let fc = try CoachFixtures.model("forward-compat")
        XCTAssertFalse(ChatPart.parts(fc).contains { $0.id.hasPrefix("chip-") }, "an action this build does not know is left out")
        XCTAssertTrue(ChatPart.parts(fc).contains { $0.id == "note-m4" }, "an unknown role's local message is a note")
    }

    func testPartIdsStayUniqueWhateverTheIdsThePageSends() throws {
        let m = try CoachModel.decode(#"{"v":1,"messages":[{"role":"user","body":"a"},{"role":"user","body":"b"},{"id":"m1","role":"user","body":"c"},{"id":"m1","role":"assistant","body":"d","pills":[{"label":"x"}]}]}"#)
        let ids = ChatPart.parts(m).map(\.id)
        XCTAssertEqual(ids.count, Set(ids).count, "\(ids)")
        XCTAssertEqual(ids, ["turn-i0", "turn-i1", "turn-m1", "reply-m1#3", "pills-m1#3"])
        // the minimal model draws its header and composer, and no part
        XCTAssertTrue(ChatPart.parts(try CoachFixtures.model("minimal")).isEmpty)
    }

    func testRunningPillsWithoutAReplyInFlightStayInTheColumn() throws {
        var m = try CoachFixtures.model("loading")
        XCTAssertEqual(ChatPart.parts(m).last?.id, "thinking")
        m.loading = false
        XCTAssertEqual(ChatPart.parts(m).last?.id, "pills-running")
    }

    func testControlsSendTheirIntents() throws {
        let m = try CoachFixtures.model("heavyweight-chat")
        let ledger = try XCTUnwrap(m.message(id: "m8")?.ledger)
        XCTAssertEqual(ledger.actions.compactMap { $0.intent(messageID: "m8") }, [.coachUndo(id: "m8"), .coachKeep(id: "m8")])
        let lime = try CoachFixtures.model("lime-chat")
        let done = try XCTUnwrap(lime.message(id: "m8")?.ledger)
        XCTAssertFalse(done.canUndo)
        XCTAssertEqual(done.actions.map(\.label), ["Got it"])
        XCTAssertEqual(lime.message(id: "m12")?.chip?.intent(messageID: "m12"), .coachOpenSettings)
        let empty = try CoachFixtures.model("empty")
        XCTAssertEqual(empty.empty?.programme?.actions.compactMap { $0.intent(messageID: nil) }, [.coachRestorePrevious, .coachRegenerate])
        XCTAssertTrue(CoachComposer.canSend(text: " hi ", hasPhoto: false))
        XCTAssertFalse(CoachComposer.canSend(text: " \n ", hasPhoto: false), "Send is disabled with nothing to send")
        XCTAssertTrue(CoachComposer.canSend(text: "", hasPhoto: true))
    }

    func testMetricSpeechAndValueText() {
        let row = MetricRow(label: "PACE", value: "8:07", ref: "vs 8:15 goal", delta: "-8s", tone: .good)
        XCTAssertEqual(MetricsCardView.speech(row), "PACE: 8:07 vs 8:15 goal -8s")
        let text = String(MetricsCardView.valueText(row, theme: .defaults(.heavyweight)).characters)
        XCTAssertEqual(text, "8:07 vs\u{00A0}8:15\u{00A0}goal \u{00B7}\u{00A0}-8s", "each part keeps to one line, they wrap between")
    }

    func testToastColoursFollowTheRoom() {
        let ok = ToastRequest(text: "Saved", style: "ok", undo: nil)
        XCTAssertTrue(CoachToastView.colors(ok, flavor: .paper) == (.earned, .text))
        XCTAssertTrue(CoachToastView.colors(ok, flavor: .studio) == (.card2, .text))
        let err = ToastRequest(text: "Storage full", style: "err", undo: nil)
        XCTAssertTrue(CoachToastView.colors(err, flavor: .paper) == (.red, .onAccent))
        let undo = ToastRequest(text: "Removed", style: "ok", undo: "t-1")
        XCTAssertTrue(CoachToastView.colors(undo, flavor: .paper) == (.card2, .text))
        XCTAssertEqual(undo.duration, 6)
    }
}
#endif
