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
    private var store: CoachStore!
    private var asked: [Intent] = []
    private var pending: [(intent: Intent, done: (PageLink.Outcome) -> Void)] = []
    private var toasts: [ToastRequest] = []
    private var backs = 0
    private var clock = Date(timeIntervalSince1970: 1_791_600_000)

    override func setUp() async throws {
        suite = "fp.coachstore.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suite)
        store = CoachStore(draft: CoachComposerDraft(defaults: defaults))
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
        XCTAssertEqual(store.draft.text, "What about this photo?", "a new draft from the page fills the box, as the web's coachPrefill does")
        XCTAssertEqual(asked.last, .coachDraftTaken(nonce: "d2.b1"))
        // a chat drawn on the store never sends its own draftTaken
        store.handle(.coachDraftTaken(nonce: "d2.b1"))
        XCTAssertEqual(asked.count, 2)
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
