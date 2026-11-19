#if os(iOS)
import Foundation
import SwiftUI
import UIKit
import XCTest
import FPCore
@testable import FPUI

/// CoachStore (plan task C7): the page's models in rev order (a stale rev ignored, the next document's taken whatever its
/// rev), the owner's message echoed at once and replaced by the page's own (by the id coach.send answers with, or by its
/// words and time when the model comes first), a message that never reached the page back in the composer with a word
/// (refused, nothing linked, no answer and no model holding it, a reload whose next document lacks it) and never resent,
/// the composer kept across presents and launches (`fpDraft.coach`), the page's draft taken once per nonce, and the
/// photos drawn by key.
@MainActor
final class CoachStoreTests: XCTestCase {
    private var suite: String!
    private var defaults: UserDefaults!
    /// The composer's folder (a picked photo's `draft-photo`, build 62): one per case, made by the first pick.
    private var folder: URL!
    private var store: CoachStore!
    private var asked: [Intent] = []
    private var pending: [(intent: Intent, done: (PageLink.Outcome) -> Void)] = []
    private var toasts: [ToastRequest] = []
    private var backs = 0
    private var clock = Date(timeIntervalSince1970: 1_791_600_000)

    override func setUp() async throws {
        suite = "fp.coachstore.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suite)
        folder = FileManager.default.temporaryDirectory.appendingPathComponent("fp-draft-\(UUID().uuidString)", isDirectory: true)
        store = CoachStore(draft: CoachComposerDraft(defaults: defaults, folder: folder))
        store.now = { [unowned self] in self.clock }
        store.hooks.ask = { [unowned self] intent, done in
            self.asked.append(intent)
            self.pending.append((intent, done))
        }
        store.hooks.toast = { [unowned self] in self.toasts.append($0) }
        store.hooks.back = { [unowned self] in self.backs += 1 }
        asked = []
        pending = []
        toasts = []
        backs = 0
    }

    override func tearDown() async throws {
        defaults?.removePersistentDomain(forName: suite)
        if let folder { try? FileManager.default.removeItem(at: folder) }
    }

    // MARK: Helpers

    /// The Heavyweight fixture (12 messages, the last an error note) as the page would send it: this boot and rev,
    /// messages added at the end, its composer replaced.
    private func model(boot: String = "b1", rev: Int, adding extra: [[String: Any]] = [], composer: [String: Any]? = nil,
                       loading: Bool = false) throws -> CoachModel {
        let url = CoachFixtures.coachDir.appendingPathComponent("heavyweight-chat.json")
        var o = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        o["boot"] = boot
        o["rev"] = rev
        o["loading"] = loading
        o["messages"] = ((o["messages"] as? [[String: Any]]) ?? []) + extra
        if let composer { o["composer"] = composer }
        return try CoachModel.decode(String(decoding: try JSONSerialization.data(withJSONObject: o), as: UTF8.self))
    }

    /// A message of the owner's as the page's model carries it.
    private func said(_ id: String, _ text: String, at: Date, image: String? = nil) -> [String: Any] {
        var m: [String: Any] = ["id": id, "role": "user", "at": (at.timeIntervalSince1970 * 1000).rounded(), "body": text]
        if let image { m["image"] = ["key": image] }
        return m
    }

    private func composer(draft: [String: Any]? = nil, image: String? = nil) -> [String: Any] {
        ["placeholder": "Message Coach\u{2026}", "short": "Message\u{2026}", "a11y": "Message the coach", "attach": true,
         "image": image.map { ["key": $0] as Any } ?? NSNull(), "draft": draft ?? NSNull()]
    }

    /// Answers the oldest unanswered intent with this name.
    private func answer(_ name: String, _ outcome: PageLink.Outcome, file: StaticString = #filePath, line: UInt = #line) {
        guard let i = pending.firstIndex(where: { $0.intent.name == name }) else { return XCTFail("no \(name) to answer", file: file, line: line) }
        pending.remove(at: i).done(outcome)
    }

    private func done(_ fields: [String: JSONValue] = [:]) -> PageLink.Outcome {
        var o = fields
        o["ok"] = .bool(true)
        return .answered(.done(IntentReply(json: .object(o))))
    }

    private var sends: [Intent] { asked.filter { $0.name == "coach.send" } }

    private func tinyPhoto() -> (UIImage, Data) {
        let ui = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8)).image { c in
            UIColor.systemBlue.setFill()
            c.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }
        return (ui, ui.jpegData(compressionQuality: 0.8)!)
    }

    // MARK: Models

    func testModelsGoInRevOrderAndAStaleRevIsIgnored() throws {
        XCTAssertNil(store.display)
        XCTAssertTrue(store.apply(try model(rev: 5)))
        XCTAssertFalse(store.apply(try model(rev: 4)), "an older rev of the document is stale")
        XCTAssertFalse(store.apply(try model(rev: 5)), "the same rev again is stale")
        XCTAssertEqual(store.model?.rev, 5)
        XCTAssertTrue(store.apply(try model(rev: 6)))
        XCTAssertTrue(store.apply(try model(boot: "b2", rev: 1)), "the next document's model (the resync), whatever its rev")
        XCTAssertEqual(store.model?.boot, "b2")
        XCTAssertEqual(store.model?.rev, 1)
        XCTAssertFalse(store.apply(try model(boot: "b2", rev: 1)))
        XCTAssertEqual(store.display, store.model, "nothing on its way: the page's model as it is")
    }

    // MARK: The echo

    func testTheOwnersMessageShowsAtOnceAndGivesWayToThePagesOwn() throws {
        store.apply(try model(rev: 1))
        store.draft.text = "  How heavy should I squat?  "
        XCTAssertTrue(store.sendComposer(nonce: "n1"))
        XCTAssertEqual(store.draft.text, "", "the composer empties")
        XCTAssertEqual(asked, [.coachSend(text: "How heavy should I squat?", image: nil, usePending: nil, nonce: "n1")])
        var d = try XCTUnwrap(store.display)
        XCTAssertEqual(d.messages.count, 13, "the bubble is there at once")
        let echo = try XCTUnwrap(d.messages.last)
        XCTAssertEqual(echo.id, "echo-n1")
        XCTAssertEqual(echo.look, .bubble)
        XCTAssertEqual(echo.body, .text("How heavy should I squat?"))
        XCTAssertEqual(echo.at, clock)
        // the page takes it: the echo waits for the model that holds it
        answer("coach.send", done(["id": .string("m13.g"), "duplicate": .bool(false)]))
        XCTAssertEqual(store.echoes.map(\.phase), [.sent])
        XCTAssertEqual(store.echoes.first?.pageID, "m13.g")
        XCTAssertEqual(try XCTUnwrap(store.display).messages.last?.id, "echo-n1")
        store.apply(try model(rev: 2, adding: [said("m13.g", "How heavy should I squat?", at: clock.addingTimeInterval(0.003))], loading: true))
        d = try XCTUnwrap(store.display)
        XCTAssertEqual(store.echoes, [])
        XCTAssertEqual(Array(d.messages.map(\.id).suffix(2)), ["m12.g", "m13.g"], "the page's message, once")
        XCTAssertTrue(d.loading)
        XCTAssertEqual(store.restored, [])
        XCTAssertEqual(sends.count, 1, "never resent")
        XCTAssertFalse(store.sendComposer(), "nothing to send")
    }

    func testAModelBeforeTheAnswerTakesTheEchosPlaceByItsWordsAndTime() throws {
        store.apply(try model(rev: 1))
        store.draft.text = "and my bench?"
        store.sendComposer(nonce: "n2")
        // the page's push can overtake coach.send's answer (it goes through the plugin's queue)
        store.apply(try model(rev: 2, adding: [said("m13.g", "and my bench?", at: clock.addingTimeInterval(0.004))], loading: true))
        XCTAssertEqual(store.echoes, [], "the page's own message, not two")
        XCTAssertEqual(try XCTUnwrap(store.display).messages.filter { $0.body == .text("and my bench?") }.count, 1)
        answer("coach.send", done(["id": .string("m13.g")]))
        XCTAssertEqual(store.echoes, [])
        XCTAssertEqual(store.restored, [])
        // the same words said before (m11.g, a day earlier) are not this message
        store.apply(try model(rev: 3, adding: [said("m13.g", "and my bench?", at: clock)]))
        store.draft.text = "and my squat?"
        clock = clock.addingTimeInterval(60)
        store.sendComposer(nonce: "n3")
        store.apply(try model(rev: 4, adding: [said("m13.g", "and my bench?", at: clock.addingTimeInterval(-60))]))
        XCTAssertEqual(store.echoes.map(\.nonce), ["n3"], "still on its way")
        XCTAssertEqual(try XCTUnwrap(store.display).messages.last?.id, "echo-n3")
    }

    func testAPageThatAlreadyHadItTakesTheEchoAway() throws {
        store.apply(try model(rev: 1))
        store.draft.text = "Twice?"
        store.sendComposer(nonce: "n4")
        answer("coach.send", done(["duplicate": .bool(true)]))
        XCTAssertEqual(store.echoes, [])
        XCTAssertEqual(store.restored, [])
        XCTAssertEqual(store.draft.text, "")
    }

    func testASendThePageRefusesGoesBackInTheComposerWithAWord() throws {
        store.apply(try model(rev: 1))
        store.draft.text = "Plan my deload"
        store.sendComposer(nonce: "n5")
        store.draft.text = "and"   // typed since
        answer("coach.send", .answered(.refused("busy")))
        XCTAssertEqual(store.echoes, [])
        XCTAssertEqual(store.draft.text, "Plan my deload\nand", "back in front of what was typed since")
        XCTAssertEqual(store.restored, ["Plan my deload"])
        XCTAssertEqual(toasts.map(\.text), [CoachStore.busy])
        XCTAssertEqual(toasts.first?.style, .err)
        XCTAssertEqual(sends.count, 1, "never resent")
        // with no page linked: back at once, and said so
        store.draft.text = "Second"
        store.sendComposer(nonce: "n6")
        answer("coach.send", .notLinked)
        XCTAssertEqual(store.draft.text, "Second")
        XCTAssertEqual(toasts.last?.text, CoachStore.notSent)
        XCTAssertEqual(sends.count, 2)
    }

    func testWithNoAnswerThePagesNextModelDecides() throws {
        store.apply(try model(rev: 1))
        store.draft.text = "Stuck question"
        store.sendComposer(nonce: "n7")
        answer("coach.send", .answered(.failed(.timeout)))
        XCTAssertEqual(store.echoes.map(\.phase), [.unsure])
        // a model at once without it: the page may not have run it yet
        store.apply(try model(rev: 2))
        XCTAssertEqual(store.echoes.count, 1)
        // one that holds it: it got there after all, nothing comes back
        store.apply(try model(rev: 3, adding: [said("m13.g", "Stuck question", at: clock.addingTimeInterval(1))]))
        XCTAssertEqual(store.echoes, [])
        XCTAssertEqual(store.restored, [])
        // one that never arrives: a model a while later without it puts it back
        store.draft.text = "Lost question"
        store.sendComposer(nonce: "n8")
        answer("coach.send", .answered(.failed(.timeout)))
        clock = clock.addingTimeInterval(2)
        store.apply(try model(rev: 4, adding: [said("m13.g", "Stuck question", at: clock.addingTimeInterval(-1))]))
        XCTAssertEqual(store.echoes, [])
        XCTAssertEqual(store.restored, ["Lost question"])
        XCTAssertEqual(store.draft.text, "Lost question")
        XCTAssertEqual(sends.count, 2, "never resent")
    }

    func testWithNoWordFromThePageAtAllTheWordsComeBack() async throws {
        store.unsureGrace = 0.2
        store.apply(try model(rev: 1))
        store.draft.text = "Into the void"
        store.sendComposer(nonce: "n9")
        answer("coach.send", .answered(.failed(.javascript("boom"))))
        try await Task.sleep(nanoseconds: 500_000_000)
        XCTAssertEqual(store.echoes, [])
        XCTAssertEqual(store.restored, ["Into the void"])
        XCTAssertEqual(store.draft.text, "Into the void")
    }

    func testAMessageThePageTookButNoModelShowsGoesQuietly() async throws {
        store.sentGrace = 0.2
        store.apply(try model(rev: 1))
        store.draft.text = "Cleared away"
        store.sendComposer(nonce: "n10")
        answer("coach.send", done(["id": .string("m13.g")]))
        try await Task.sleep(nanoseconds: 500_000_000)
        XCTAssertEqual(store.echoes, [], "the page let it go (Clear chat): the echo with it")
        XCTAssertEqual(store.restored, [], "the page took it: nothing put back")
        XCTAssertEqual(toasts, [])
    }

    // MARK: Reloads

    func testAReloadUnderTheChatResyncsAndPutsBackWhatTheNextDocumentLacks() throws {
        store.apply(try model(rev: 7))
        store.draft.text = "Before the reload"
        store.sendComposer(nonce: "n11")
        // the document goes: its send ends gone; the chat (up) keeps drawing what it has
        answer("coach.send", .documentGone)
        store.documentGone(chatUp: true)
        XCTAssertEqual(store.model?.rev, 7)
        XCTAssertEqual(try XCTUnwrap(store.display).messages.last?.id, "echo-n11", "still on its way")
        // the next document's resync (rev 1 of a new boot) without it: back in the composer, never resent
        XCTAssertTrue(store.apply(try model(boot: "b2", rev: 1)))
        XCTAssertEqual(store.echoes, [])
        XCTAssertEqual(store.draft.text, "Before the reload")
        XCTAssertEqual(store.restored, ["Before the reload"])
        XCTAssertEqual(sends.count, 1)
        // one the old document saved before it went is in the next one's model (new ids): nothing comes back
        store.draft.text = "Saved before the kill"
        store.sendComposer(nonce: "n12")
        answer("coach.send", .documentGone)
        store.documentGone(chatUp: true)
        store.apply(try model(boot: "b3", rev: 1, adding: [said("m13.h", "Saved before the kill", at: clock)]))
        XCTAssertEqual(store.echoes, [])
        XCTAssertEqual(store.restored, ["Before the reload"])
        // with the chat down the model goes with its document: the chat opens on the next one's
        store.documentGone(chatUp: false)
        XCTAssertNil(store.model)
        XCTAssertNil(store.display)
    }

    /// Intents go in order: a send made just after a reload, while the chat still draws the old document's model, reaches
    /// the new page after the shell's resync snapshot, whose model cannot hold it yet. The echo waits for its own answer.
    func testASendRightAfterAReloadWaitsForItsOwnAnswer() throws {
        store.apply(try model(rev: 7))
        store.documentGone(chatUp: true)
        store.draft.text = "Right after the reload"
        store.sendComposer(nonce: "n15")
        XCTAssertTrue(store.apply(try model(boot: "b2", rev: 1)), "the resync, before the page has taken the send")
        XCTAssertEqual(store.echoes.map(\.phase), [.sending], "still on its way, not put back")
        XCTAssertEqual(try XCTUnwrap(store.display).messages.last?.id, "echo-n15")
        answer("coach.send", done(["id": .string("m13.h")]))
        store.apply(try model(boot: "b2", rev: 2, adding: [said("m13.h", "Right after the reload", at: clock)], loading: true))
        XCTAssertEqual(store.echoes, [])
        XCTAssertEqual(store.restored, [])
        XCTAssertEqual(store.draft.text, "")
    }

    /// Review 4 (chat low): a photo sent with no words whose answer a reload lost went back in the composer (with its
    /// toast) although the page had it: the next document's message carries the photo with no key (the page keeps none
    /// across a reload) and no words, so neither the key nor the words could hold the echo. One the next document lacks
    /// still comes back, its photo with it.
    func testAPhotoSentAloneThatTheNextDocumentHoldsIsNotPutBack() throws {
        store.apply(try model(rev: 7))
        let (ui, jpeg) = tinyPhoto()
        let photo = PickedPhoto(prepared: CoachPhoto.Prepared(data: jpeg, mediaType: "image/jpeg", width: 8, height: 8), preview: ui)
        store.draft.picked = photo
        XCTAssertTrue(store.sendComposer(nonce: "n21"))
        answer("coach.send", .documentGone)
        store.documentGone(chatUp: true)
        var saved = said("m13.h", "", at: clock)
        saved["image"] = ["key": NSNull()]
        XCTAssertTrue(store.apply(try model(boot: "b2", rev: 1, adding: [saved])))
        XCTAssertEqual(store.echoes, [])
        XCTAssertEqual(store.restored, [], "the page had it: nothing goes back")
        XCTAssertNil(store.draft.picked)
        XCTAssertTrue(toasts.isEmpty, "and no word that it was not sent")
        // the next document without it: back in the composer, its photo too, never resent
        clock = clock.addingTimeInterval(60)
        store.draft.picked = photo
        XCTAssertTrue(store.sendComposer(nonce: "n22"))
        answer("coach.send", .documentGone)
        store.documentGone(chatUp: true)
        XCTAssertTrue(store.apply(try model(boot: "b3", rev: 1)))
        XCTAssertEqual(store.echoes, [])
        XCTAssertEqual(store.restored, [""])
        XCTAssertNotNil(store.draft.picked, "the photo is back in the composer")
        XCTAssertEqual(sends.count, 2)
    }

    func testTheBindingGoingPutsEverythingOnItsWayBackQuietly() throws {
        store.apply(try model(rev: 1))
        store.draft.text = "Mid-flight"
        store.sendComposer(nonce: "n13")
        store.tearDown()
        XCTAssertEqual(store.echoes, [])
        XCTAssertEqual(store.draft.text, "Mid-flight")
        XCTAssertEqual(toasts, [], "no one is looking")
        answer("coach.send", .documentGone)   // its answer later changes nothing
        XCTAssertEqual(store.restored, ["Mid-flight"])
    }

    // MARK: The composer

    func testTheComposerOutlivesThePresentAndTheLaunch() throws {
        let d = CoachComposerDraft(defaults: defaults)
        XCTAssertEqual(d.text, "")
        d.text = "Half a thought"
        XCTAssertEqual(defaults.string(forKey: CoachComposerDraft.defaultsKey), "Half a thought", "kept as typed")
        XCTAssertEqual(CoachComposerDraft(defaults: defaults).text, "Half a thought", "the next launch's composer")
        d.text = ""
        XCTAssertNil(defaults.object(forKey: CoachComposerDraft.defaultsKey), "an empty composer leaves nothing behind")
        // every presentation of the chat draws the store's composer
        store.apply(try model(rev: 1))
        store.draft.text = "Across presents"
        XCTAssertTrue(store.host.draft === store.draft)
        XCTAssertTrue(store.host.draft === store.host.draft)
        XCTAssertEqual(store.host.draft?.text, "Across presents")
    }

    func testThePagesDraftGoesInOncePerNonce() throws {
        store.apply(try model(rev: 1, composer: composer(draft: ["text": "Build my Arms day", "nonce": "d1.b1"])))
        XCTAssertEqual(store.draft.text, "Build my Arms day")
        XCTAssertEqual(asked, [.coachDraftTaken(nonce: "d1.b1")])
        store.draft.text = "Build my Arms day, short"   // the owner edits it
        store.apply(try model(rev: 2, composer: composer(draft: ["text": "Build my Arms day", "nonce": "d1.b1"])))
        XCTAssertEqual(store.draft.text, "Build my Arms day, short", "taken once: the owner's edit stays")
        XCTAssertEqual(asked.count, 1)
        store.apply(try model(rev: 3, composer: composer(draft: ["text": "What about this photo?", "nonce": "d2.b1"])))
        // build 61 (N4): a new draft from the page goes in front of the owner's words, never over them (the web's
        // coachPrefill replaces, but the native composer outlives launches)
        XCTAssertEqual(store.draft.text, "What about this photo?\nBuild my Arms day, short",
                       "the page's draft in front, the owner's words kept")
        XCTAssertEqual(asked.last, .coachDraftTaken(nonce: "d2.b1"))
        // a chat drawn on the store never sends its own draftTaken
        store.handle(.coachDraftTaken(nonce: "d2.b1"))
        XCTAssertEqual(asked.count, 2)
    }

    // MARK: One draft-merge rule (contract 4.2, Fixtures/draft/putback.json)

    /// Strings compared code unit by code unit: Swift's `==` takes canonical equivalents as equal, so a precomposed and a
    /// decomposed accent would pass where the page's `===` fails.
    private func assertSameUnits(_ a: String, _ b: String, _ what: String, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(Array(a.utf16), Array(b.utf16), "\(what): \(a.debugDescription) is not \(b.debugDescription)", file: file, line: line)
    }

    func testEveryPutbackVectorThroughTheMergeRule() throws {
        let cases = try CoachFixtures.putbacks()
        XCTAssertGreaterThanOrEqual(cases.count, 20, "the shared vectors")
        for c in cases {
            assertSameUnits(CoachStore.mergeDraft(c.words, into: c.composer), c.result, c.name)
        }
    }

    /// Each real path follows the vectors: a page draft taken, and the words of a send that never reached the page put back.
    func testThePageDraftAndThePutBackFollowTheVectors() throws {
        let cases = try CoachFixtures.putbacks()
        var rev = 1
        store.apply(try model(rev: rev))
        for (i, c) in cases.enumerated() {
            // a page draft taken into the composer as the vector has it
            store.draft.text = c.composer
            rev += 1
            store.apply(try model(rev: rev, composer: composer(draft: ["text": c.words, "nonce": "v\(i).b1"])))
            assertSameUnits(store.draft.text, c.result, "page draft: " + c.name)
            // the words of an unsent message put back into it
            guard !c.words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
            store.draft.text = c.words
            XCTAssertTrue(store.sendComposer(nonce: "p\(i)"), c.name)
            store.draft.text = c.composer   // what the box holds when the words come back
            answer("coach.send", .answered(.refused("busy")))
            assertSameUnits(store.draft.text, c.result, "put back: " + c.name)
        }
    }

    func testAPageDraftGoesInFrontOfTheOwnersWordsAndNeverTwice() throws {
        store.apply(try model(rev: 1))
        store.draft.text = "owner"
        store.apply(try model(rev: 2, composer: composer(draft: ["text": "page", "nonce": "d1.b1"])))
        XCTAssertEqual(store.draft.text, "page\nowner")
        XCTAssertEqual(defaults.string(forKey: CoachComposerDraft.defaultsKey), "page\nowner", "kept across launches")
        // one the composer already holds is not added again
        store.draft.text = "Before: Build my Arms day, thanks"
        store.apply(try model(rev: 3, composer: composer(draft: ["text": "Build my Arms day", "nonce": "d2.b1"])))
        XCTAssertEqual(store.draft.text, "Before: Build my Arms day, thanks")
        XCTAssertEqual(asked, [.coachDraftTaken(nonce: "d1.b1"), .coachDraftTaken(nonce: "d2.b1")], "each taken and said so")
        // an empty composer takes the page's words
        store.draft.text = "  \n"
        store.apply(try model(rev: 4, composer: composer(draft: ["text": "What about this photo?", "nonce": "d3.b1"])))
        XCTAssertEqual(store.draft.text, "What about this photo?")
    }

    // MARK: The hand-over (contract 4.2)

    func testTheHandOverOffersTheTrimmedWordsOrNothing() {
        store.draft.text = "  Half a thought \n"
        XCTAssertEqual(store.handOverDraft(), "Half a thought")
        XCTAssertEqual(store.draft.text, "  Half a thought \n", "offering changes nothing")
        store.draft.text = ""
        XCTAssertNil(store.handOverDraft())
        store.draft.text = " \n\t\u{3000}"
        XCTAssertNil(store.handOverDraft(), "spaces and line breaks only")
        // a photo is not handed over: it stays with the native chat
        let (ui, jpeg) = tinyPhoto()
        store.draft.text = ""
        store.draft.picked = PickedPhoto(prepared: CoachPhoto.Prepared(data: jpeg, mediaType: "image/jpeg", width: 8, height: 8), preview: ui)
        XCTAssertNil(store.handOverDraft())
        store.handedOver("", taken: true)
        XCTAssertNotNil(store.draft.picked, "the photo stays native")
        XCTAssertEqual(try? Data(contentsOf: photoFile), jpeg, "and stays kept for the next native chat (build 62)")
        XCTAssertEqual(CoachComposerDraft(defaults: defaults, folder: folder).picked?.prepared.data, jpeg)
    }

    func testWordsTakenByThePageLeaveTheComposerAndTheDefaults() {
        store.draft.text = "Plan my deload "
        XCTAssertEqual(defaults.string(forKey: CoachComposerDraft.defaultsKey), "Plan my deload ")
        let words = store.handOverDraft()
        XCTAssertEqual(words, "Plan my deload")
        store.handedOver(words ?? "", taken: true)
        XCTAssertEqual(store.draft.text, "")
        XCTAssertNil(defaults.object(forKey: CoachComposerDraft.defaultsKey), "fpDraft.coach goes")
        XCTAssertEqual(CoachComposerDraft(defaults: defaults).text, "", "the next launch's composer is empty")
        XCTAssertEqual(store.describe()["draft"] as? String, "", "describe holds no words once they left")
    }

    func testWordsThePageDidNotTakeStayNative() {
        store.draft.text = "Plan my deload"
        let words = store.handOverDraft()
        store.handedOver(words ?? "", taken: false)
        XCTAssertEqual(store.draft.text, "Plan my deload")
        XCTAssertEqual(defaults.string(forKey: CoachComposerDraft.defaultsKey), "Plan my deload", "kept for the next native chat")
        XCTAssertEqual(CoachComposerDraft(defaults: defaults).text, "Plan my deload")
    }

    func testAComposerEditedAfterTheHandOverIsNotEmptied() {
        store.draft.text = "Plan my deload"
        let words = store.handOverDraft()
        store.draft.text = "Plan my deload and my bench"   // typed while the page answered
        store.handedOver(words ?? "", taken: true)
        XCTAssertEqual(store.draft.text, "Plan my deload and my bench")
        XCTAssertEqual(defaults.string(forKey: CoachComposerDraft.defaultsKey), "Plan my deload and my bench")
        // and a canonically equal but different spelling is not "those words" either
        store.draft.text = "caf\u{E9}"
        let w2 = store.handOverDraft()
        store.draft.text = "cafe\u{301}"
        store.handedOver(w2 ?? "", taken: true)
        XCTAssertEqual(Array(store.draft.text.utf16), Array("cafe\u{301}".utf16))
    }

    func testTheHandOverIsNeverWrittenDownWithItsWords() {
        let secretish = "Words only the composer may hold 7f3a"
        store.draft.text = secretish
        let words = store.handOverDraft()
        XCTAssertEqual(store.describe()["draft"] as? String, secretish, "describe shows the words while the composer holds them")
        store.handedOver(words ?? "", taken: false)
        store.handedOver(words ?? "", taken: true)
        store.draft.text = "else"
        store.handedOver(secretish, taken: true)
        XCTAssertFalse(store.events.isEmpty)
        XCTAssertTrue(store.events.filter { $0.hasPrefix("hand-over") }.count >= 4, "\(store.events)")
        XCTAssertFalse(store.events.contains { $0.contains("7f3a") }, "no event holds the words: \(store.events)")
        XCTAssertFalse((store.describe()["events"] as? [String] ?? []).contains { $0.contains("7f3a") })
        XCTAssertEqual(store.describe()["draft"] as? String, "else")
    }

    /// Contract 4.2's round trip: the words go to the page, the page hands them back as its draft when the native chat
    /// returns, and they land once, in front of anything typed since.
    func testTheRoundTripLandsTheWordsOnce() throws {
        store.apply(try model(rev: 1))
        store.draft.text = "Plan my deload"
        store.handedOver(store.handOverDraft() ?? "", taken: true)
        XCTAssertEqual(store.draft.text, "")
        store.apply(try model(rev: 2, composer: composer(draft: ["text": "Plan my deload", "nonce": "h1.b1"])))
        XCTAssertEqual(store.draft.text, "Plan my deload", "back once")
        store.apply(try model(rev: 3, composer: composer(draft: ["text": "Plan my deload", "nonce": "h1.b1"])))
        XCTAssertEqual(store.draft.text, "Plan my deload", "the same nonce is not taken twice")
        // with other words typed natively in between
        store.draft.text = "Plan my deload"
        store.handedOver(store.handOverDraft() ?? "", taken: true)
        store.draft.text = "other"
        store.apply(try model(rev: 4, composer: composer(draft: ["text": "Plan my deload", "nonce": "h2.b1"])))
        XCTAssertEqual(store.draft.text, "Plan my deload\nother")
        // words the page did not take stay native, and the page's copy (if it sends one) is not added twice
        store.draft.text = "Kept native"
        store.handedOver(store.handOverDraft() ?? "", taken: false)
        store.apply(try model(rev: 5, composer: composer(draft: ["text": "Kept native", "nonce": "h3.b1"])))
        XCTAssertEqual(store.draft.text, "Kept native")
    }

    /// The chat drawn on the store's host: its box shows the store's words (not the page's draft, which the store takes
    /// itself, so the chat sends no coach.draftTaken), keys typed into the box reach the store, and words the store puts
    /// back show in the box at once.
    func testTheChatDrawsTheStoresComposer() throws {
        FPFonts.register()
        var m = try model(rev: 1)
        m.composer.draft = Draft(text: "The page's draft", nonce: "d9.b1")
        store.draft.text = "The owner's own words"
        let host = UIHostingController(rootView: CoachChatView(model: m, host: store.host)
            .safeAreaPadding(.top, CoachRenderTests.safeTop).safeAreaPadding(.bottom, CoachRenderTests.safeBottom))
        host.safeAreaRegions = []
        let window = UIWindow(frame: CGRect(origin: .zero, size: CoachRenderTests.screen))
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer {
            window.isHidden = true
            window.rootViewController = nil
        }
        func box() -> UITextView? {
            func find(_ v: UIView) -> UITextView? {
                if let t = v as? UITextView { return t }
                for s in v.subviews { if let t = find(s) { return t } }
                return nil
            }
            return find(host.view)
        }
        func settle() {
            for _ in 0..<10 {
                host.view.setNeedsLayout()
                host.view.layoutIfNeeded()
                RunLoop.main.run(until: Date().addingTimeInterval(0.03))
            }
        }
        settle()
        let tv = try XCTUnwrap(box(), "the composer's box")
        XCTAssertEqual(tv.text, "The owner's own words", "the store's words, not the page's draft")
        XCTAssertFalse(asked.contains { $0.name == "coach.draftTaken" }, "the chat leaves the page's draft to the store: \(asked)")
        // keys typed into the box reach the store
        tv.becomeFirstResponder()
        tv.selectedRange = NSRange(location: (tv.text as NSString).length, length: 0)
        tv.insertText(", typed")
        settle()
        XCTAssertEqual(store.draft.text, "The owner's own words, typed")
        // words the store puts back show at once
        store.draft.text = "Put back"
        settle()
        XCTAssertEqual(box()?.text, "Put back")
    }

    func testBackGoesToTheHostAndTheRestToThePage() throws {
        store.handle(.coachBack)
        XCTAssertEqual(backs, 1)
        XCTAssertEqual(asked, [])
        store.handle(.coachStop)
        store.handle(.coachUndo(id: "m8.g"))
        XCTAssertEqual(asked, [.coachStop, .coachUndo(id: "m8.g")])
        XCTAssertEqual(store.echoes, [], "only the owner's messages are echoed")
    }

    func testAnEmptyChatsSuggestionIsEchoedToo() throws {
        store.apply(try model(rev: 1))
        store.handle(.coachChip(text: "What should I focus on this week?", nonce: "c1"))
        XCTAssertEqual(try XCTUnwrap(store.display).messages.last?.body, .text("What should I focus on this week?"))
        answer("coach.chip", .answered(.refused("busy")))
        XCTAssertEqual(store.draft.text, "What should I focus on this week?")
    }

    // MARK: The kept pick (build 62, S6)

    /// The composer's file for a picked photo, and its key.
    private var photoFile: URL { folder.appendingPathComponent(CoachComposerDraft.photoFileName) }
    private func kept() -> [String: Any]? { defaults.dictionary(forKey: CoachComposerDraft.photoKey) }
    private var fileKept: Bool { FileManager.default.fileExists(atPath: photoFile.path) }

    /// A pick as the composer makes one (`side` px square, at scale 1): the prepared JPEG and its preview.
    private func pick(_ side: Int = 8, _ color: UIColor = .systemBlue) -> PickedPhoto {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let ui = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { c in
            color.setFill()
            c.fill(CGRect(x: 0, y: 0, width: side, height: side))
        }
        let jpeg = ui.jpegData(compressionQuality: 0.8)!
        return PickedPhoto(prepared: CoachPhoto.Prepared(data: jpeg, mediaType: "image/jpeg", width: side, height: side), preview: ui)
    }

    /// The kept pick's time moved `seconds` into the past (negative: ahead of the clock).
    private func age(_ seconds: TimeInterval) {
        var meta = kept() ?? [:]
        meta["at"] = ((Date().timeIntervalSince1970 - seconds) * 1000).rounded()
        defaults.set(meta, forKey: CoachComposerDraft.photoKey)
    }

    /// A pick is written as it is made (the prepared bytes, out of the device's backups, its media type, size, byte count
    /// and time beside them), and the next launch's composer opens on it with its preview, read back, not written again.
    func testAPickOutlivesTheLaunchWithItsPreview() throws {
        let p = pick(8)
        let d = CoachComposerDraft(defaults: defaults, folder: folder)
        XCTAssertNil(d.picked, "nothing kept yet")
        XCTAssertNil(kept())
        let before = Date()
        d.picked = p
        XCTAssertEqual(try Data(contentsOf: photoFile), p.prepared.data, "the prepared bytes, as Send would send them")
        let meta = try XCTUnwrap(kept())
        XCTAssertEqual(meta["mediaType"] as? String, "image/jpeg")
        XCTAssertEqual((meta["width"] as? NSNumber)?.intValue, 8)
        XCTAssertEqual((meta["height"] as? NSNumber)?.intValue, 8)
        XCTAssertEqual((meta["bytes"] as? NSNumber)?.intValue, p.prepared.data.count)
        let at = try XCTUnwrap((meta["at"] as? NSNumber)?.doubleValue)
        XCTAssertEqual(at / 1000, before.timeIntervalSince1970, accuracy: 5, "stamped when it was picked, in ms")
        XCTAssertEqual(try photoFile.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true,
                       "never in the device's backups")
        // the same pick again writes nothing new
        let stamp = kept()?["at"] as? NSNumber
        d.picked = PickedPhoto(prepared: p.prepared, preview: p.preview)
        XCTAssertEqual(kept()?["at"] as? NSNumber, stamp)
        // the next launch's composer
        age(90)
        let aged = kept()?["at"] as? NSNumber
        let next = CoachComposerDraft(defaults: defaults, folder: folder)
        XCTAssertEqual(next.picked?.prepared, p.prepared, "the same bytes, media type and size")
        let preview = try XCTUnwrap(next.picked?.preview, "with its preview")
        XCTAssertEqual(preview.size.width * preview.scale, 8)
        XCTAssertEqual(kept()?["at"] as? NSNumber, aged, "read back, not written again: the pick keeps its own time")
        XCTAssertEqual(try photoFile.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true)
        // a store on it sends it
        let s = CoachStore(draft: next)
        var sent: [Intent] = []
        s.hooks.ask = { intent, _ in sent.append(intent) }
        s.apply(try model(rev: 1))
        XCTAssertTrue(s.sendComposer(nonce: "kp1"))
        guard case .coachSend(_, let image?, nil, "kp1")? = sent.last else { return XCTFail("\(sent)") }
        XCTAssertEqual(image, p.prepared.coachImage, "the kept bytes go")
    }

    /// Send and Remove leave no file and no key; a send the page refuses (or one that never reached it) puts the pick back
    /// and keeps it again; one the page took leaves nothing.
    func testSendAndRemoveLeaveNoFileAndARefusedSendKeepsItAgain() throws {
        store.apply(try model(rev: 1))
        let p = pick()
        store.draft.picked = p
        XCTAssertTrue(fileKept)
        XCTAssertTrue(store.sendComposer(nonce: "k1"))
        XCTAssertFalse(fileKept, "Send takes it")
        XCTAssertNil(kept())
        XCTAssertNil(CoachComposerDraft(defaults: defaults, folder: folder).picked, "a launch now opens on no photo")
        answer("coach.send", .answered(.refused("busy")))
        XCTAssertEqual(store.draft.picked?.prepared, p.prepared, "a refused send puts it back")
        XCTAssertEqual(try Data(contentsOf: photoFile), p.prepared.data, "and keeps it again")
        XCTAssertEqual(CoachComposerDraft(defaults: defaults, folder: folder).picked?.prepared, p.prepared)
        // Remove (the composer's cross sets its binding to nil)
        store.draft.picked = nil
        XCTAssertFalse(fileKept, "Remove takes it")
        XCTAssertNil(kept())
        // nothing linked: back and kept again
        store.draft.picked = p
        store.sendComposer(nonce: "k2")
        answer("coach.send", .notLinked)
        XCTAssertTrue(fileKept)
        // a send the page took leaves nothing
        XCTAssertTrue(store.sendComposer(nonce: "k3"))
        answer("coach.send", done(["id": .string("m20.b1")]))
        XCTAssertNil(store.draft.picked)
        XCTAssertFalse(fileKept)
        XCTAssertNil(kept())
    }

    /// The binding going (a scene's teardown) keeps the pick of a message still on its way: the next binding's composer
    /// opens on its words and its photo.
    func testTheBindingGoingKeepsThePickOfAMessageOnItsWay() throws {
        store.apply(try model(rev: 1))
        let p = pick()
        store.draft.text = "This one"
        store.draft.picked = p
        XCTAssertTrue(store.sendComposer(nonce: "k4"))
        XCTAssertFalse(fileKept, "on its way: Send took it")
        store.tearDown()
        XCTAssertEqual(store.draft.picked?.prepared, p.prepared)
        let next = CoachComposerDraft(defaults: defaults, folder: folder)
        XCTAssertEqual(next.text, "This one")
        XCTAssertEqual(next.picked?.prepared, p.prepared, "the next binding's composer opens on the words and the photo")
        XCTAssertEqual(toasts, [], "no one is looking")
    }

    /// A kept pick waits 24 h, as the page's kept photo does; one dated more than a minute ahead of the clock is dropped too.
    func testAKeptPickLivesADay() throws {
        let d = CoachComposerDraft(defaults: defaults, folder: folder)
        d.picked = pick()
        age(23 * 3600)
        XCTAssertNotNil(CoachComposerDraft(defaults: defaults, folder: folder).picked, "23 h: still waiting")
        XCTAssertTrue(fileKept)
        age(25 * 3600)
        XCTAssertNil(CoachComposerDraft(defaults: defaults, folder: folder).picked, "25 h: dropped")
        XCTAssertFalse(fileKept, "with its file")
        XCTAssertNil(kept(), "and its key")
        d.picked = nil   // d still holds it in memory: a new pick of the same bytes must change something
        d.picked = pick()
        age(-120)
        XCTAssertNil(CoachComposerDraft(defaults: defaults, folder: folder).picked, "two minutes ahead of the clock: dropped")
        XCTAssertFalse(fileKept)
        d.picked = nil
        d.picked = pick()
        age(-5)
        XCTAssertNotNil(CoachComposerDraft(defaults: defaults, folder: folder).picked, "a few seconds ahead is the same pick")
    }

    /// Anything not whole is dropped at the next launch: a file whose key names another byte count (an end between the
    /// two writes), a file with no key, a key with no file, a key missing a field, bytes no preview comes from; and a
    /// write that fails leaves nothing behind, so an older pick never comes back in the new one's place.
    func testWhatIsNotWholeIsDropped() throws {
        let d = CoachComposerDraft(defaults: defaults, folder: folder)
        d.picked = pick(8)
        try pick(9, .systemRed).prepared.data.write(to: photoFile)
        XCTAssertNil(CoachComposerDraft(defaults: defaults, folder: folder).picked, "a file its key does not name")
        XCTAssertFalse(fileKept)
        XCTAssertNil(kept())
        try pick().prepared.data.write(to: photoFile)
        XCTAssertNil(CoachComposerDraft(defaults: defaults, folder: folder).picked, "a file with no key")
        XCTAssertFalse(fileKept)
        defaults.set(["mediaType": "image/jpeg", "width": 8, "height": 8, "bytes": 100, "at": Date().timeIntervalSince1970 * 1000],
                     forKey: CoachComposerDraft.photoKey)
        XCTAssertNil(CoachComposerDraft(defaults: defaults, folder: folder).picked, "a key with no file")
        XCTAssertNil(kept())
        let jpeg = pick().prepared.data
        try jpeg.write(to: photoFile)
        defaults.set(["mediaType": "image/jpeg", "bytes": jpeg.count, "at": Date().timeIntervalSince1970 * 1000], forKey: CoachComposerDraft.photoKey)
        XCTAssertNil(CoachComposerDraft(defaults: defaults, folder: folder).picked, "a key with no size")
        XCTAssertFalse(fileKept)
        XCTAssertNil(kept())
        let junk = Data([1, 2, 3, 4, 5, 6])
        try junk.write(to: photoFile)
        defaults.set(["mediaType": "image/jpeg", "width": 8, "height": 8, "bytes": junk.count, "at": Date().timeIntervalSince1970 * 1000],
                     forKey: CoachComposerDraft.photoKey)
        XCTAssertNil(CoachComposerDraft(defaults: defaults, folder: folder).picked, "bytes no preview can be drawn from")
        XCTAssertFalse(fileKept)
        XCTAssertNil(kept())
        // a write that fails (a folder where the file goes) takes the older pick's file and key with it
        let older = pick(8)
        let d2 = CoachComposerDraft(defaults: defaults, folder: folder)
        d2.picked = older
        try FileManager.default.removeItem(at: photoFile)
        try FileManager.default.createDirectory(at: photoFile.appendingPathComponent("in-the-way"), withIntermediateDirectories: true)
        defaults.set(["mediaType": "image/jpeg", "width": 8, "height": 8, "bytes": older.prepared.data.count,
                      "at": Date().timeIntervalSince1970 * 1000], forKey: CoachComposerDraft.photoKey)
        let newer = pick(9, .systemRed)
        d2.picked = newer
        XCTAssertEqual(d2.picked?.prepared, newer.prepared, "the new pick stays in memory")
        XCTAssertNil(kept(), "no key left naming the older pick")
        XCTAssertFalse(fileKept)
        XCTAssertNil(CoachComposerDraft(defaults: defaults, folder: folder).picked, "nothing comes back in its place")
    }

    // MARK: A kept pick and the page's photo (build 62's review, F-S1); a message the page took at the teardown (F-S4)

    /// A store on the composer the next launch opens, over a pick an earlier launch kept, with its own record of the
    /// intents it asks: the page's photo (`coach.image`) answered with `pagePhoto`'s bytes, the rest unanswered.
    private func relaunched(with p: PickedPhoto, pagePhoto: Data? = nil) -> (CoachStore, () -> [Intent]) {
        CoachComposerDraft(defaults: defaults, folder: folder).picked = p   // the earlier launch's pick, kept
        let s = CoachStore(draft: CoachComposerDraft(defaults: defaults, folder: folder))
        var sent: [Intent] = []
        s.hooks.ask = { [unowned self] intent, done in
            sent.append(intent)
            if case .coachImage = intent, let pagePhoto {
                done(self.done(["mediaType": .string("image/jpeg"), "data": .string(pagePhoto.base64EncodedString())]))
            }
        }
        return (s, { sent })
    }

    /// A pick brought back from an earlier launch never hides a page photo: the first model that carries one (a share
    /// opened the chat) drops it, its file and its key, with one line in the store's events, so the composer shows the
    /// page's photo (fetched by its key) and Send takes it (`usePending`), as build 61 did, whose pick never outlived a
    /// launch. Before (547d7a5) the kept pick stayed in the box, won the preview and went with the share's words.
    func testAPickKeptFromAnEarlierLaunchGivesWayToThePagesPhoto() throws {
        let p = pick()
        let (shared, sharedJPEG) = tinyPhoto()
        let (s, sent) = relaunched(with: p, pagePhoto: sharedJPEG)
        XCTAssertEqual(s.draft.picked?.prepared, p.prepared, "brought back at the binding's start")
        XCTAssertTrue(s.apply(try model(rev: 1, composer: composer(draft: ["text": "Shared words", "nonce": "d1.b1"], image: "p1.b1"))))
        XCTAssertNil(s.draft.picked, "the page's photo shows, not the kept pick")
        XCTAssertFalse(fileKept, "its file goes")
        XCTAssertNil(kept(), "and its key")
        XCTAssertNil(CoachComposerDraft(defaults: defaults, folder: folder).picked, "nothing for the next launch")
        XCTAssertEqual(s.events.filter { $0.contains("gave way to the page's photo") }.count, 1, "one line: \(s.events)")
        XCTAssertTrue(sent().contains(.coachImage(key: "p1.b1")), "the page's photo is fetched for the box: \(sent())")
        // the box's preview (CoachComposer: the pick's, else the page's photo the host holds by the composer's key)
        let held = try XCTUnwrap(s.image("p1.b1"), "the page's photo held for the preview")
        XCTAssertEqual(held.size.width * held.scale, shared.size.width * shared.scale, "the shared photo, with no pick over it")
        XCTAssertEqual(s.draft.text, "Shared words")
        XCTAssertTrue(s.sendComposer(nonce: "kp2"))
        XCTAssertEqual(sent().last, .coachSend(text: "Shared words", image: nil, usePending: true, nonce: "kp2"), "Send takes the page's photo")
        XCTAssertEqual(try XCTUnwrap(s.display).messages.last?.image?.key, "p1.b1", "the echo draws the page's photo")
    }

    /// A kept pick with no page photo stays (S6): models without one leave it, and Send sends it.
    func testAPickKeptFromAnEarlierLaunchStaysWithNoPagePhoto() throws {
        let p = pick()
        let (s, sent) = relaunched(with: p)
        XCTAssertTrue(s.apply(try model(rev: 1)))
        XCTAssertTrue(s.apply(try model(rev: 2, composer: composer(draft: ["text": "Build my Arms day", "nonce": "d2.b1"]))))
        XCTAssertEqual(s.draft.picked?.prepared, p.prepared, "kept")
        XCTAssertTrue(fileKept)
        XCTAssertNotNil(kept())
        XCTAssertTrue(s.sendComposer(nonce: "kp3"))
        guard case .coachSend(_, let image?, nil, "kp3")? = sent().last else { return XCTFail("\(sent())") }
        XCTAssertEqual(image, p.prepared.coachImage, "the kept pick goes")
    }

    /// A pick made in this binding keeps the two slots over a page photo (DESIGN S6, unchanged): the pick wins the box and
    /// the send, and the page's photo shows again after it.
    func testAPickMadeInThisBindingKeepsTheTwoSlots() throws {
        let p = pick()
        store.apply(try model(rev: 1))
        store.draft.picked = p
        store.apply(try model(rev: 2, composer: composer(image: "p2.b1")))
        XCTAssertEqual(store.draft.picked?.prepared, p.prepared, "this binding's pick stays")
        XCTAssertTrue(fileKept)
        XCTAssertTrue(store.sendComposer(nonce: "kp4"))
        guard case .coachSend(_, let image?, nil, "kp4")? = asked.last else { return XCTFail("\(asked)") }
        XCTAssertEqual(image, p.prepared.coachImage)
    }

    /// A kept pick the owner replaced in this binding is this binding's: a page photo after it leaves it.
    func testAKeptPickReplacedInThisBindingKeepsTheTwoSlots() throws {
        let (s, sent) = relaunched(with: pick(8))
        let q = pick(9, .systemRed)
        s.draft.picked = q
        XCTAssertTrue(s.apply(try model(rev: 1, composer: composer(image: "p3.b1"))))
        XCTAssertEqual(s.draft.picked?.prepared, q.prepared, "the new pick stays")
        XCTAssertEqual(try Data(contentsOf: photoFile), q.prepared.data, "kept for the next launch")
        XCTAssertTrue(s.sendComposer(nonce: "kp5"))
        guard case .coachSend(_, let image?, nil, "kp5")? = sent().last else { return XCTFail("\(sent())") }
        XCTAssertEqual(image, q.prepared.coachImage)
    }

    /// F-S1's put-back half (review round 2, F4): a kept pick the owner sent in this binding and a refused send put back
    /// is this binding's from then on, so a page photo after it leaves it (the two slots) and the next launch still has
    /// it; it never gives way the way an untouched kept pick does.
    func testAKeptPickPutBackByARefusedSendKeepsTheTwoSlots() throws {
        let p = pick()
        CoachComposerDraft(defaults: defaults, folder: folder).picked = p   // the earlier launch's pick, kept
        let s = CoachStore(draft: CoachComposerDraft(defaults: defaults, folder: folder))
        s.now = { [unowned self] in self.clock }
        var waiting: [(intent: Intent, done: (PageLink.Outcome) -> Void)] = []
        s.hooks.ask = { intent, done in waiting.append((intent, done)) }
        XCTAssertTrue(s.apply(try model(rev: 1)))
        XCTAssertEqual(s.draft.picked?.prepared, p.prepared, "brought back, no page photo yet")
        XCTAssertTrue(s.sendComposer(nonce: "kp6"))
        XCTAssertFalse(fileKept, "Send takes it")
        let i = try XCTUnwrap(waiting.firstIndex(where: { $0.intent.name == "coach.send" }), "the send was asked")
        waiting.remove(at: i).done(.answered(.refused("busy")))
        XCTAssertEqual(s.draft.picked?.prepared, p.prepared, "a refused send puts it back")
        XCTAssertTrue(s.apply(try model(rev: 2, composer: composer(image: "p4.b1"))))
        XCTAssertEqual(s.draft.picked?.prepared, p.prepared, "put back in this binding, it keeps the two slots over the page's photo")
        XCTAssertTrue(fileKept, "and stays kept for the next launch")
        XCTAssertEqual(CoachComposerDraft(defaults: defaults, folder: folder).picked?.prepared, p.prepared)
        XCTAssertTrue(s.events.filter { $0.contains("gave way to the page's photo") }.isEmpty, "no give-way line: \(s.events)")
    }

    /// F-S4: the binding going drops a message the page took (`.sent`: the model that holds it had not come), its words
    /// and its pick both, so the next launch never offers again what the chat already has. Before (547d7a5) it went
    /// back in the composer and, from build 62, its photo was kept on disk for the next launch.
    func testTheBindingGoingDropsAMessageThePageTook() throws {
        store.apply(try model(rev: 1))
        let p = pick()
        store.draft.text = "Already with the page"
        store.draft.picked = p
        XCTAssertTrue(store.sendComposer(nonce: "k7"))
        answer("coach.send", done(["id": .string("m21.b1")]))
        XCTAssertEqual(store.echoes.map(\.phase), [.sent], "taken, its model not come yet")
        store.tearDown()
        XCTAssertEqual(store.echoes, [])
        XCTAssertEqual(store.draft.text, "", "the words are the page's now")
        XCTAssertNil(store.draft.picked, "and so is the photo")
        XCTAssertFalse(fileKept)
        XCTAssertNil(kept())
        XCTAssertEqual(store.restored, [])
        let next = CoachComposerDraft(defaults: defaults, folder: folder)
        XCTAssertEqual(next.text, "", "the next launch offers nothing the chat has")
        XCTAssertNil(next.picked)
        XCTAssertEqual(toasts, [])
    }

    /// F-S4: a message with no answer to rely on (`.unsure`) still goes back with its pick when the binding goes, as one
    /// still being asked does (testTheBindingGoingKeepsThePickOfAMessageOnItsWay).
    func testTheBindingGoingPutsBackAMessageWithNoAnswerToRelyOn() throws {
        store.apply(try model(rev: 1))
        let p = pick()
        store.draft.text = "Unsure of this one"
        store.draft.picked = p
        XCTAssertTrue(store.sendComposer(nonce: "k8"))
        answer("coach.send", .documentGone)
        XCTAssertEqual(store.echoes.map(\.phase), [.unsure])
        store.tearDown()
        XCTAssertEqual(store.draft.text, "Unsure of this one")
        XCTAssertEqual(store.draft.picked?.prepared, p.prepared)
        let next = CoachComposerDraft(defaults: defaults, folder: folder)
        XCTAssertEqual(next.text, "Unsure of this one")
        XCTAssertEqual(next.picked?.prepared, p.prepared, "kept for the next launch")
        XCTAssertEqual(toasts, [], "no one is looking")
    }

    /// Without defaults or a folder a pick lives in memory only, as words do without defaults.
    func testADraftWithNoDefaultsOrFolderKeepsThePickInMemoryOnly() {
        let noFolder = CoachComposerDraft(defaults: defaults)
        noFolder.picked = pick()
        XCTAssertNotNil(noFolder.picked)
        XCTAssertNil(kept(), "no key")
        XCTAssertFalse(FileManager.default.fileExists(atPath: folder.path), "no folder made")
        let noDefaults = CoachComposerDraft(defaults: nil, folder: folder)
        noDefaults.picked = pick()
        XCTAssertNotNil(noDefaults.picked, "in memory")
        XCTAssertFalse(FileManager.default.fileExists(atPath: folder.path), "nothing written without the defaults that would name it")
        noDefaults.picked = nil
        XCTAssertNil(CoachComposerDraft(defaults: nil, folder: folder).picked)
    }

    // MARK: Photos

    func testPhotosAreDrawnByTheirKeys() throws {
        store.apply(try model(rev: 1))
        let (ui, jpeg) = tinyPhoto()
        store.draft.picked = PickedPhoto(prepared: CoachPhoto.Prepared(data: jpeg, mediaType: "image/jpeg", width: 8, height: 8), preview: ui)
        XCTAssertTrue(store.sendComposer(nonce: "n14"), "a photo alone is something to send")
        XCTAssertNil(store.draft.picked)
        guard case .coachSend(let text, let image?, nil, "n14")? = asked.last else { return XCTFail("\(asked)") }
        XCTAssertEqual(text, "")
        XCTAssertEqual(image.mediaType, "image/jpeg")
        XCTAssertEqual(try XCTUnwrap(store.display).messages.last?.image?.key, "n:n14", "keyed as the page keys it")
        XCTAssertTrue(store.image("n:n14") === ui, "the bubble draws the photo it sent")
        // refused: the photo goes back with it
        answer("coach.send", .answered(.refused("busy")))
        XCTAssertNotNil(store.draft.picked)
        // the page's pending photo is fetched once by its key
        store.apply(try model(rev: 2, composer: composer(image: "p3.b1")))
        store.apply(try model(rev: 3, composer: composer(image: "p3.b1")))
        XCTAssertEqual(asked.filter { $0.name == "coach.image" }, [.coachImage(key: "p3.b1")])
        XCTAssertNil(store.image("p3.b1"))
        answer("coach.image", done(["mediaType": .string("image/jpeg"), "data": .string(jpeg.base64EncodedString())]))
        XCTAssertNotNil(store.image("p3.b1"))
        // Send with the composer's own words takes the pending photo along, keyed by it
        store.draft.picked = nil
        store.draft.text = "This one"
        store.sendComposer(nonce: "n16")
        XCTAssertEqual(asked.last, .coachSend(text: "This one", image: nil, usePending: true, nonce: "n16"))
        XCTAssertEqual(try XCTUnwrap(store.display).messages.last?.image?.key, "p3.b1")
        // a photo the page will not give is not asked for again (the chat says Photo); one a broken bridge lost is
        store.apply(try model(rev: 4, composer: composer(image: "p4.b1")))
        answer("coach.image", .answered(.refused("gone")))
        store.apply(try model(rev: 5, composer: composer(image: "p4.b1")))
        store.apply(try model(rev: 6, composer: composer(image: "p5.b1")))
        answer("coach.image", .answered(.failed(.timeout)))
        store.apply(try model(rev: 7, composer: composer(image: "p5.b1")))
        XCTAssertEqual(asked.filter { $0.name == "coach.image" }, [.coachImage(key: "p3.b1"), .coachImage(key: "p4.b1"), .coachImage(key: "p5.b1"), .coachImage(key: "p5.b1")])
    }
}
#endif
