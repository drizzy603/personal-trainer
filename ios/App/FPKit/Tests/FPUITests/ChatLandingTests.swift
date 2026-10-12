#if os(iOS)
import Foundation
import XCTest
import FPCore
@testable import FPUI

/// Where the conversation goes when it changes (review 4: after a Send or a Stop while scrolled up, the owner's message
/// and the reply stayed out of view, where the web chat's coachSend, coachStop and coachRetryLast scroll to the end).
/// A reader who scrolled up keeps their place when a reply lands; the owner's own actions (Send, Stop, a chip, Try
/// again) bring the end into view. The behaviour in the app is tests/tools/native-chat.py's (test-native.sh): Send
/// pressed while scrolled to the top.
@MainActor
final class ChatLandingTests: XCTestCase {
    func testTheOwnersOwnActionsAskForTheEnd() {
        let asks: [Intent] = [.coachSend(text: "Hi", image: nil, usePending: nil, nonce: "n1"), .coachChip(text: "Plan my week", nonce: "n2"),
                              .coachAction(id: "m3.g", text: "Swap it"), .coachStop, .coachRetry]
        for i in asks { XCTAssertTrue(CoachChatView.asksForEnd(i), "\(i.name) brings the end into view") }
        let stays: [Intent] = [.coachKeep(id: "m1.g"), .coachUndo(id: "m1.g"), .coachModel(model: "claude-haiku-4-5-20251001"), .coachBack,
                               .coachOpenSettings, .coachCancelIntake, .toastUndo(id: "t1"), .confirm(id: "c1", yes: true), .coachDraftTaken(nonce: "d")]
        for i in stays { XCTAssertFalse(CoachChatView.asksForEnd(i), "\(i.name) leaves the reader where they are") }
    }

    func testWhereTheConversationLands() throws {
        var chat = try CoachFixtures.model("heavyweight-chat")
        chat.messages.removeLast(2)   // idle, ending with the coach's reply m10 to the owner's m9
        XCTAssertEqual(chat.messages.last?.look, .reply)
        let question = try XCTUnwrap(ChatPart.parts(chat).last(where: \.isTurn))
        XCTAssertEqual(question.id, "turn-m9.g")
        var thinking = chat
        thinking.loading = true
        let note = try CoachFixtures.model("heavyweight-chat")   // ends with an error note
        func land(atEnd: Bool, pinned: Bool, from old: String, _ m: CoachModel, unscrolled: Bool = false) -> CoachChatView.Landing {
            CoachChatView.landing(atEnd: atEnd, pinned: pinned, from: old, model: m, unscrolled: unscrolled)
        }
        // a new question or Thinking: the end, when the reader is there or the owner asked for it
        XCTAssertEqual(land(atEnd: true, pinned: false, from: "m8.g", thinking), .end)
        XCTAssertEqual(land(atEnd: false, pinned: false, from: "m8.g", thinking), .stay, "scrolled up: the reader keeps their place")
        XCTAssertEqual(land(atEnd: false, pinned: true, from: "m8.g", thinking), .end,
                       "the owner's Send while scrolled up: the end, the message just sent in view (it stayed out of view)")
        // a reply that lands opens at its question, unless the reader scrolled up while it was on its way
        XCTAssertEqual(land(atEnd: true, pinned: false, from: "m9.g+thinking", chat), .turn("mark-turn-m9.g"))
        XCTAssertEqual(land(atEnd: false, pinned: false, from: "m9.g+thinking", chat), .stay)
        XCTAssertEqual(land(atEnd: false, pinned: true, from: "m9.g+thinking", chat), .turn("mark-turn-m9.g"),
                       "a Stop or a chip that the reply raced: it opens at its question")
        // a Stop's note (or an error) after Thinking: the end
        XCTAssertEqual(land(atEnd: false, pinned: true, from: "m11.g+thinking", note), .end)
        XCTAssertEqual(land(atEnd: false, pinned: false, from: "m11.g+thinking", note), .stay)
        // the contact sheets' whole conversation never scrolls
        XCTAssertEqual(land(atEnd: true, pinned: true, from: "m8.g", thinking, unscrolled: true), .stay)
    }
}
#endif
