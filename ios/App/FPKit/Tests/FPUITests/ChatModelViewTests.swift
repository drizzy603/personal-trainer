#if os(iOS)
import SwiftUI
import XCTest
@testable import FPUI
import FPCore

/// What the views take from the model: the model switch's words (spec 114), the parts of the
/// conversation in the web's order and rhythm, the intents the controls send.
///
/// Message ids come from the fixture, never spelled out: the page names its messages ("m8" in a
/// hand-made fixture, "m8.g" in one tests/golden/dump-coach.js builds from the page), and only
/// the conversation's shape is what these tests hold.
final class ChatModelViewTests: XCTestCase {
    private struct FixtureShape: Error, CustomStringConvertible {
        let description: String
    }

    /// The fixture's messages, checked against the shape the tests read (a fixture rebuilt with
    /// another shape fails here, by name, rather than on a missing part further down).
    private func messages(_ m: CoachModel, count: Int, _ fixture: String) throws -> [Message] {
        guard m.messages.count == count else {
            throw FixtureShape(description: "\(fixture) holds \(m.messages.count) messages; these tests read a conversation of \(count)")
        }
        XCTAssertEqual(Set(m.messages.map(\.id)).count, count, "\(fixture): every message has its own id")
        XCTAssertFalse(m.messages.contains { $0.id.isEmpty }, "\(fixture): every message has an id")
        return m.messages
    }

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
        let id = try messages(m, count: 12, "heavyweight-chat").map(\.id)
        let ids = ChatPart.parts(m).map(\.id)
        XCTAssertEqual(ids, [
            "day-" + id[0], "turn-" + id[0], "reply-" + id[1],
            "turn-" + id[2],                 // the seed carries its day: TODAY · PLATEAU CHECK, no divider
            "reply-" + id[3], "turn-" + id[4], "reply-" + id[5], "turn-" + id[6],
            "reply-" + id[7], "pills-" + id[7], "ledger-" + id[7],
            "turn-" + id[8], "reply-" + id[9], "turn-" + id[10],
            "note-" + id[11], "chip-" + id[11],
        ])
        if case .seed(_, let day) = ChatPart.parts(m)[3].kind { XCTAssertEqual(day, "Today") } else { XCTFail("\(id[2]) is a seed") }
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
        let msgs = try messages(m, count: 8, "errors")
        // the trailing failure offers Try again; the billing one (out of credit) offers nothing
        let failed = try XCTUnwrap(msgs.last, "errors ends on a failure")
        XCTAssertEqual(failed.chip?.kind, .retry)
        let billing = try XCTUnwrap(msgs.first { $0.errorKind == .billing }, "errors holds an out-of-credit reply")
        XCTAssertTrue(ChatPart.parts(m).contains { $0.id == "chip-" + failed.id })
        XCTAssertFalse(ChatPart.parts(m).contains { $0.id == "chip-" + billing.id }, "billing: no chip")
        m.loading = true
        XCTAssertFalse(ChatPart.parts(m).contains { $0.id == "chip-" + failed.id })
        let fc = try CoachFixtures.model("forward-compat")
        XCTAssertFalse(ChatPart.parts(fc).contains { $0.id.hasPrefix("chip-") }, "an action this build does not know is left out")
        let unknownRole = try XCTUnwrap(fc.messages.first { if case .other = $0.role { return $0.local } else { return false } },
                                        "forward-compat holds a local message of a role this build does not know")
        XCTAssertTrue(ChatPart.parts(fc).contains { $0.id == "note-" + unknownRole.id }, "an unknown role's local message is a note")
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
        // PLAN CHANGES belongs to the reply that changed the programme; Undo and Keep name it by id
        let changed = try XCTUnwrap(try messages(m, count: 12, "heavyweight-chat").first { $0.ledger != nil }, "heavyweight-chat has a PLAN CHANGES card")
        XCTAssertEqual(m.message(id: changed.id)?.ledger, changed.ledger, "the model finds a message by the id the page gave it")
        let ledger = try XCTUnwrap(changed.ledger)
        XCTAssertEqual(ledger.actions.compactMap { $0.intent(messageID: changed.id) }, [.coachUndo(id: changed.id), .coachKeep(id: changed.id)])
        let lime = try CoachFixtures.model("lime-chat")
        let limeMessages = try messages(lime, count: 12, "lime-chat")
        let done = try XCTUnwrap(limeMessages.first { $0.ledger != nil }?.ledger, "lime-chat has a PLAN CHANGES card")
        XCTAssertFalse(done.canUndo)
        XCTAssertEqual(done.actions.map(\.label), ["Got it"])
        let keyError = try XCTUnwrap(limeMessages.last, "lime-chat ends on a key error")
        XCTAssertEqual(lime.message(id: keyError.id)?.chip?.intent(messageID: keyError.id), .coachOpenSettings)
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
