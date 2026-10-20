#if os(iOS)
import Combine
import SwiftUI
import UIKit
import XCTest
@testable import FPUI
import FPCore

/// The native Coach tab's store and root (plan task N8; contract 5 K1-K5, 8.3, 15.2): the page's models in rev order
/// (a stale rev ignored, another document's taken whatever its rev); a document going keeps the model only while the
/// tab is NATIVE; `tearDown` drops the model, ends `connecting` and ignores answers still on their way; each row sends
/// its intent and the starter link `coachHome.openStarter`; CONNECT sends the key once and nothing more until the page
/// answers; a toast only for a key that never reached the page, none for the page's refusals; the key field's flag
/// follows the field and goes with it; `describe()` says what the probe needs; no 6-character piece of a typed canary
/// in the events, `describe()` or any stored property; and CoachHomeRoot in a window draws the first frame's ground
/// until a model, then the hub in the model's room (fading in, at once under Reduce Motion), publishes
/// `HubHeaderBottomKey` only with the hub, presents nothing, takes no focus, sets no interface style, carries the
/// owner's key to the store once, and, as the root of a navigation stack in a tab bar, takes models that land while
/// the stack is out of the window and keeps the key field across pushes and pops, waiting on no navigation callback
/// (H0's probe: UIKit's didShow comes late and twice).
@MainActor
final class CoachHomeStoreTests: XCTestCase {
    private var store: CoachHomeStore!
    private var asked: [Intent] = []
    private var pending: [(intent: Intent, done: (PageLink.Outcome) -> Void)] = []
    private var toasts: [ToastRequest] = []

    override func setUp() async throws {
        try await super.setUp()
        FPFonts.register()
        store = CoachHomeStore()
        store.hooks.ask = { [unowned self] intent, done in
            self.asked.append(intent)
            self.pending.append((intent, done))
        }
        store.hooks.toast = { [unowned self] in self.toasts.append($0) }
        asked = []
        pending = []
        toasts = []
    }

    // MARK: Models and answers

    /// A model as the page would send it, from `json` (the hub by default) with this boot and rev.
    private func model(_ json: String? = nil, boot: String = "b1", rev: Int, resume: Bool? = nil) throws -> CoachHomeModel {
        let json = json ?? CoachHomeViewTests.hubJSON()
        var o = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any])
        o["boot"] = boot
        o["rev"] = rev
        if let resume { o["resume"] = resume }
        return try CoachHomeModel.decode(String(decoding: try JSONSerialization.data(withJSONObject: o), as: UTF8.self))
    }

    /// The connect screen (with its starter link) as the page would send it.
    private func connect(boot: String = "b1", rev: Int = 4, room: Room = .heavyweight) throws -> CoachHomeModel {
        try model(CoachHomeViewTests.connectJSON(room: room), boot: boot, rev: rev)
    }

    /// Answers the oldest unanswered intent with this name.
    private func answer(_ name: String, _ outcome: PageLink.Outcome, file: StaticString = #filePath, line: UInt = #line) {
        guard let i = pending.firstIndex(where: { $0.intent.name == name }) else { return XCTFail("no \(name) to answer", file: file, line: line) }
        pending.remove(at: i).done(outcome)
    }

    private static let done = PageLink.Outcome.answered(.done(IntentReply(json: .object(["ok": .bool(true)]))))

    private var keys: [Intent] { asked.filter { $0.name == "coachHome.setKey" } }

    private func keyField() -> String? { store.describe()["keyField"] as? String }

    /// CI's slack for every timing bound here (CoachModelTests' rule; contract 12: timing bounds take CI's 10x slack):
    /// GitHub's shared Macs are several times slower and stall at random, and xcodebuild hands TEST_RUNNER_CI to the
    /// simulator's test process as CI.
    static let slack: Double = ProcessInfo.processInfo.environment["CI"] == nil ? 1 : 10

    // MARK: The store: models

    func testModelsGoInRevOrderAndAnotherDocumentsReplacesWhateverItsRev() throws {
        var changes = 0
        let sub = store.objectWillChange.sink { changes += 1 }
        XCTAssertNil(store.model)
        XCTAssertTrue(store.apply(try model(rev: 5)))
        XCTAssertFalse(store.apply(try model(rev: 4)), "an older rev of the document is stale")
        XCTAssertFalse(store.apply(try model(rev: 5)), "the same rev again is stale")
        XCTAssertEqual(store.model?.rev, 5)
        XCTAssertEqual(changes, 1, "a stale model repaints nothing")
        XCTAssertTrue(store.apply(try connect(rev: 6)), "a newer rev replaces it, whatever its route")
        XCTAssertEqual(store.model?.route, .connect)
        XCTAssertTrue(store.apply(try model(boot: "b2", rev: 1)), "the next document's model (its resync), whatever its rev")
        XCTAssertEqual(store.model?.boot, "b2")
        XCTAssertEqual(store.model?.rev, 1)
        XCTAssertEqual(store.model?.route, .hub)
        XCTAssertFalse(store.apply(try model(boot: "b2", rev: 1)))
        // the rule is the boot alone, as CoachStore's: the link drops a gone document's models before they get here
        XCTAssertTrue(store.apply(try model(boot: "b1", rev: 1)), "any other boot's model replaces it")
        XCTAssertEqual(changes, 4)
        XCTAssertEqual(asked, [], "a model sends nothing")
        XCTAssertEqual(toasts, [])
        sub.cancel()
    }

    func testADocumentGoingKeepsTheModelOnlyWhileTheTabIsNative() throws {
        store.apply(try connect())
        store.host.fieldTyped(true)
        store.documentGone(keep: true)
        XCTAssertEqual(store.model?.rev, 4, "NATIVE: the model stays drawn until the next document's")
        XCTAssertEqual(keyField(), "typed", "and the field with what it holds")
        XCTAssertTrue(store.apply(try connect(boot: "b2", rev: 1)), "the next document's takeover and snapshot replace it")
        XCTAssertEqual(store.model?.boot, "b2")
        XCTAssertEqual(keyField(), "typed", "the same route: the same field, its text kept")
        store.documentGone(keep: false)
        XCTAssertNil(store.model, "not NATIVE: the model goes with its document")
        XCTAssertEqual(keyField(), "empty", "and the hub's field with it")
        XCTAssertTrue(store.apply(try model(boot: "b3", rev: 1)), "the next document's first model is taken")
        XCTAssertEqual(store.model?.route, .hub)
        XCTAssertEqual(asked, [])
    }

    func testTearDownDropsTheModelEndsConnectingAndIgnoresAnswersStillOnTheirWay() throws {
        store.apply(try connect())
        store.host.fieldTyped(true)
        store.handle(.connect(secret: "sk-ant-one"))
        store.handle(.starter)
        XCTAssertTrue(store.connecting)
        store.tearDown()
        XCTAssertNil(store.model)
        XCTAssertFalse(store.connecting, "no key is out any more")
        XCTAssertEqual(keyField(), "empty")
        // a key pressed after it is its own (the store goes on working); the earlier key's answer, coming now, is
        // ignored
        store.handle(.connect(secret: "sk-ant-two"))
        XCTAssertTrue(store.connecting)
        answer("coachHome.setKey", .documentGone)
        answer("coachHome.openStarter", .notLinked)
        XCTAssertTrue(store.connecting, "the earlier key's answer changes nothing: the later key is still out")
        XCTAssertEqual(toasts, [], "no toast: no one is looking")
        XCTAssertEqual(store.toasts, [])
        XCTAssertEqual(store.outcomes, [:], "nothing recorded for answers from before")
        XCTAssertEqual(store.events.filter { $0.hasSuffix("after the store was torn down: ignored") }.count, 2)
        answer("coachHome.setKey", .notLinked)
        XCTAssertFalse(store.connecting, "the later key's own answer counts")
        XCTAssertEqual(toasts.map(\.text), [CoachHomeStore.notSaved])
        XCTAssertEqual(keys, [.coachHomeSetKey(secret: "sk-ant-one"), .coachHomeSetKey(secret: "sk-ant-two")], "never resent")
    }

    // MARK: The store: presses

    func testEachRowSendsItsIntentAndTheStarterLinkOpensTheStarter() throws {
        store.apply(try model(rev: 1))
        for action in CoachHomeModel.Row.Action.allCases { store.handle(.row(action)) }
        XCTAssertEqual(asked, [.coachHomeOpenChat, .coachHomeStartIntake, .coachHomeClearChat, .coachHomeDisconnect],
                       "each row its own intent, through CoachHomeModel's map")
        XCTAssertEqual(asked, CoachHomeModel.Row.Action.allCases.map(\.intent))
        store.apply(try connect(rev: 2))
        store.host.act(.starter)   // through the host, as the view sends it
        XCTAssertEqual(asked.last, .coachHomeOpenStarter)
        XCTAssertEqual(asked.count, 5, "one intent per press")
        // each ends as the page or the link says: recorded per name, never resent, no toast of the store's own
        answer("coachHome.openChat", Self.done)
        answer("coachHome.startIntake", .answered(.refused("has-programme")))
        answer("coachHome.clearChat", .answered(.failed(.timeout)))
        answer("coachHome.disconnect", .notLinked)
        answer("coachHome.openStarter", .documentGone)
        XCTAssertEqual(store.outcomes, ["coachHome.openChat": "done", "coachHome.startIntake": "refused has-programme",
                                        "coachHome.clearChat": "failed timeout", "coachHome.disconnect": "not linked",
                                        "coachHome.openStarter": "gone"])
        XCTAssertEqual(asked.count, 5, "never resent")
        XCTAssertEqual(toasts, [], "a row's answer is the page's to show")
        XCTAssertFalse(store.connecting, "no row is a key")
        // the last outcome per name
        store.handle(.row(.openChat))
        answer("coachHome.openChat", .answered(.refused("nokey")))
        XCTAssertEqual(store.outcomes["coachHome.openChat"], "refused nokey")
    }

    func testCONNECTSendsTheKeyOnceAndNothingMoreUntilThePageAnswers() throws {
        var flips: [Bool] = []
        let sub = store.$connecting.dropFirst().sink { flips.append($0) }
        store.apply(try connect())
        XCTAssertFalse(store.connecting)
        XCTAssertFalse(store.host.connecting)
        store.host.act(.connect(secret: "sk-ant-one"))
        XCTAssertEqual(asked, [.coachHomeSetKey(secret: "sk-ant-one")], "the key, once, under `secret`")
        XCTAssertTrue(store.connecting)
        XCTAssertTrue(store.host.connecting, "the hub's host says a key is out")
        store.handle(.connect(secret: "sk-ant-one"))
        store.host.act(.connect(secret: "sk-ant-two"))
        XCTAssertEqual(keys.count, 1, "a second CONNECT while a key is out sends nothing")
        store.handle(.row(.disconnect))
        store.handle(.starter)
        XCTAssertEqual(Array(asked.suffix(2)), [.coachHomeDisconnect, .coachHomeOpenStarter], "the other controls still send")
        answer("coachHome.setKey", .answered(.refused("invalid")))
        XCTAssertFalse(store.connecting, "answered: CONNECT works again")
        XCTAssertEqual(store.outcomes["coachHome.setKey"], "refused invalid")
        store.handle(.connect(secret: "sk-ant-three"))
        XCTAssertEqual(keys, [.coachHomeSetKey(secret: "sk-ant-one"), .coachHomeSetKey(secret: "sk-ant-three")],
                       "a press after the answer is its own, never a resend")
        XCTAssertTrue(store.connecting)
        answer("coachHome.setKey", Self.done)
        XCTAssertFalse(store.connecting)
        XCTAssertEqual(toasts, [], "a refused key and a saved one: the page's own toasts say so")
        XCTAssertEqual(flips, [true, false, true, false], "connecting is published at each press and each answer, and only then")
        sub.cancel()
    }

    func testAToastOnlyForAKeyThatNeverReachedThePage() throws {
        store.apply(try connect())
        let never: [PageLink.Outcome] = [.notLinked, .documentGone, .answered(.failed(.timeout)),
                                         .answered(.failed(.javascript("TypeError: x is undefined"))),
                                         .answered(.failed(.malformedReply("no ok"))), .answered(.failed(.page("bad-args")))]
        let reached: [PageLink.Outcome] = [.answered(.refused("off")), .answered(.refused("stale")), .answered(.refused("invalid")), Self.done]
        for (i, outcome) in (never + reached).enumerated() {
            toasts = []
            store.handle(.connect(secret: "sk-ant-key-\(i)"))
            answer("coachHome.setKey", outcome)
            XCTAssertFalse(store.connecting, "\(outcome.word): CONNECT works again")
            XCTAssertEqual(store.outcomes["coachHome.setKey"], outcome.word)
            if i < never.count {
                XCTAssertEqual(toasts.count, 1, "\(outcome.word): one toast")
                XCTAssertEqual(toasts.first?.text, "Couldn\u{2019}t save the key \u{2014} try again", "\(outcome.word): the chat's voice")
                XCTAssertEqual(toasts.first?.style, .err, "\(outcome.word): the room's error style")
                XCTAssertNil(toasts.first?.undo)
            } else {
                XCTAssertEqual(toasts, [], "\(outcome.word): the page answered, and its own toast says the rest")
            }
        }
        XCTAssertEqual(asked.count, never.count + reached.count, "one setKey per press, none resent")
        XCTAssertEqual(store.toasts, Array(repeating: CoachHomeStore.notSaved, count: never.count), "the probe sees the store's toasts")
    }

    /// The store lives as long as its web view binding, through every document, so the probe's list of its toasts
    /// keeps the last 20 (as `events` keeps the last 80): every key that never reached the page still shows its toast,
    /// and `describe()` carries no more than the 20.
    func testTheProbesListOfToastsKeepsTheLastTwenty() throws {
        store.apply(try connect())
        for i in 0..<25 {
            store.handle(.connect(secret: "sk-ant-key-\(i)"))
            answer("coachHome.setKey", .notLinked)
        }
        XCTAssertEqual(toasts.count, 25, "each key that never reached the page shows its toast")
        XCTAssertEqual(store.toasts, Array(repeating: CoachHomeStore.notSaved, count: 20), "the probe's list keeps the last 20")
        XCTAssertEqual(store.describe()["toasts"] as? [String], store.toasts, "describe() carries those 20")
        // a document goes and the next one comes: the binding, its store and the cap stay
        store.documentGone(keep: false)
        store.apply(try connect(boot: "b2", rev: 1))
        store.handle(.connect(secret: "sk-ant-key-next"))
        answer("coachHome.setKey", .documentGone)
        XCTAssertEqual(toasts.count, 26, "its toast shown")
        XCTAssertEqual(store.toasts.count, 20, "still the last 20")
    }

    /// Unwired, the hooks are CoachStore's: `ask` answers `.notLinked` at once, `toast` shows nothing.
    func testUnwiredHooksAnswerNotLinked() throws {
        let bare = CoachHomeStore()
        bare.apply(try connect())
        bare.handle(.connect(secret: "sk-ant-bare"))
        XCTAssertFalse(bare.connecting, "the unwired ask answers at once")
        XCTAssertEqual(bare.outcomes["coachHome.setKey"], "not linked")
        XCTAssertEqual(bare.toasts, [CoachHomeStore.notSaved], "a key that never left gives its one toast")
        bare.handle(.row(.openChat))
        XCTAssertEqual(bare.outcomes["coachHome.openChat"], "not linked")
        XCTAssertEqual(bare.toasts.count, 1, "a row adds none")
    }

    // MARK: The store: the key field, describe, the key

    /// `keyField` says only whether the field holds text: "typed" once the field says so, "empty" once it is emptied,
    /// once the route leaves the connect screen (the view makes a new, empty field), once the document goes while the
    /// tab is not NATIVE, and at `tearDown`; a newer model on the same route keeps it.
    func testTheKeyFieldFlagFollowsTheFieldAndGoesWithIt() throws {
        XCTAssertEqual(keyField(), "empty", "no field yet")
        store.apply(try connect())
        let host = store.host
        host.fieldTyped(false)
        XCTAssertEqual(keyField(), "empty", "a field that appears empty")
        host.fieldTyped(true)
        XCTAssertTrue(store.keyFieldTyped)
        XCTAssertEqual(keyField(), "typed")
        host.fieldTyped(true)
        XCTAssertEqual(store.events.filter { $0 == "the key field holds text" }.count, 1, "said once while it holds text")
        host.fieldTyped(false)
        XCTAssertEqual(keyField(), "empty", "emptied")
        host.fieldTyped(true)
        store.apply(try connect(rev: 5))
        XCTAssertEqual(keyField(), "typed", "a newer model on the same route (a refusal): the field keeps its text")
        store.apply(try model(rev: 6))
        XCTAssertEqual(keyField(), "empty", "the key saved: the route left the connect screen and the field went")
        store.apply(try connect(rev: 7))
        host.fieldTyped(true)
        store.apply(try model(CoachHomeViewTests.otherJSON(), rev: 8))
        XCTAssertEqual(keyField(), "empty", "a newer page's route draws its connect block anew: a new field")
        store.apply(try connect(rev: 9))
        host.fieldTyped(true)
        store.documentGone(keep: false)
        XCTAssertEqual(keyField(), "empty", "the document went while the tab was not NATIVE: the hub and its field went")
        store.apply(try connect(boot: "b2", rev: 1))
        host.fieldTyped(true)
        store.tearDown()
        XCTAssertEqual(keyField(), "empty", "torn down")
    }

    /// A field on its way out can say it holds text after the model that removes it (an appearance UIKit replays late,
    /// as the Coach stack comes back into the window): with no field to draw (no model, the hub, the ground after a
    /// document went or a teardown) such a report is ignored, so the flag never says "typed" where no field is.
    func testAFieldThatSaysItHoldsTextWhereNoFieldIsDrawnIsIgnored() throws {
        let host = store.host
        host.fieldTyped(true)
        XCTAssertEqual(keyField(), "empty", "no model: no field")
        store.apply(try model(rev: 1))
        host.fieldTyped(true)
        XCTAssertEqual(keyField(), "empty", "the hub: no field")
        store.apply(try connect(rev: 2))
        host.fieldTyped(true)
        XCTAssertEqual(keyField(), "typed", "the connect screen's field")
        store.apply(try model(rev: 3))
        XCTAssertEqual(keyField(), "empty", "the key saved: the field went")
        host.fieldTyped(true)
        XCTAssertEqual(keyField(), "empty", "the field on its way out says it holds text: ignored")
        XCTAssertEqual(store.events.last, "a key field on its way out says it holds text: ignored, no field is drawn")
        store.apply(try model(CoachHomeViewTests.otherJSON(), rev: 4))
        host.fieldTyped(true)
        XCTAssertEqual(keyField(), "typed", "a newer page's route with a connect block draws a field")
        store.documentGone(keep: false)
        host.fieldTyped(true)
        XCTAssertEqual(keyField(), "empty", "the document went while the tab was not NATIVE: the ground, no field")
        store.apply(try connect(boot: "b2", rev: 1))
        store.tearDown()
        host.fieldTyped(true)
        XCTAssertEqual(keyField(), "empty", "torn down: no field")
        XCTAssertEqual(asked, [])
    }

    func testDescribeSaysWhatTheProbeNeedsAndIsJSON() throws {
        var d = store.describe()
        for k in ["rev", "boot", "route", "resume"] { XCTAssertTrue(d[k] is NSNull, "no model: \(k) is null") }
        XCTAssertEqual(d["rows"] as? [String], [])
        XCTAssertEqual(d["connect"] as? Bool, false)
        XCTAssertEqual(d["starter"] as? Bool, false)
        XCTAssertEqual(d["connecting"] as? Bool, false)
        XCTAssertEqual(d["keyField"] as? String, "empty")
        XCTAssertEqual(d["outcomes"] as? [String: String], [:])
        XCTAssertTrue(JSONSerialization.isValidJSONObject(d))

        store.apply(try model(rev: 13))
        store.handle(.row(.openChat))
        answer("coachHome.openChat", Self.done)
        d = store.describe()
        XCTAssertEqual(d["rev"] as? Int, 13)
        XCTAssertEqual(d["boot"] as? String, "b1")
        XCTAssertEqual(d["route"] as? String, "hub")
        XCTAssertEqual(d["resume"] as? Bool, false)
        XCTAssertEqual(d["rows"] as? [String], ["openChat", "startIntake", "clearChat", "disconnect"], "the rows' actions, in order")
        XCTAssertEqual(d["connect"] as? Bool, false)
        XCTAssertEqual(d["outcomes"] as? [String: String], ["coachHome.openChat": "done"])
        XCTAssertEqual(d["toasts"] as? [String], [])
        XCTAssertTrue(JSONSerialization.isValidJSONObject(d))

        store.apply(try connect(rev: 14))
        store.host.fieldTyped(true)
        store.handle(.connect(secret: "sk-ant-describe"))
        d = store.describe()
        XCTAssertEqual(d["route"] as? String, "connect")
        XCTAssertEqual(d["rows"] as? [String], [])
        XCTAssertEqual(d["connect"] as? Bool, true)
        XCTAssertEqual(d["starter"] as? Bool, true)
        XCTAssertEqual(d["connecting"] as? Bool, true)
        XCTAssertEqual(d["keyField"] as? String, "typed")
        answer("coachHome.setKey", .notLinked)
        XCTAssertEqual(store.describe()["toasts"] as? [String], [CoachHomeStore.notSaved])

        // a newer page's route by its own word; `resume` as the model says
        store.apply(try model(CoachHomeViewTests.otherJSON(), rev: 15, resume: true))
        d = store.describe()
        XCTAssertEqual(d["route"] as? String, "upsell")
        XCTAssertEqual(d["resume"] as? Bool, true)
        XCTAssertEqual(d["rows"] as? [String], ["openChat", "disconnect"])
        XCTAssertEqual(d["connect"] as? Bool, true)
        XCTAssertEqual(d["starter"] as? Bool, false)
        XCTAssertTrue(JSONSerialization.isValidJSONObject(d))

        // the events: the last 80 kept, the last 40 described
        for _ in 0..<100 { store.handle(.row(.openChat)) }
        XCTAssertEqual(store.events.count, 80)
        XCTAssertEqual(store.events.last, "coachHome.openChat sent")
        XCTAssertEqual(store.describe()["events"] as? [String], Array(store.events.suffix(40)))
    }

    /// The key exists in the store only inside `handle` and the intent handed to `hooks.ask` (contract 5, K1-K5): after
    /// a canary is sent through every way a key can end, no 6-character piece of it is in the events, the outcomes, the
    /// toasts, `describe()` serialised, `dump`, or anywhere a Mirror walk of the store's stored properties reaches; nor
    /// does any of them print the redaction mark, which only a kept intent or action that carried the key would (they
    /// print the secret as •••, so a kept one would hide from the pieces).
    func testNoPieceOfTheKeyInTheEventsDescribeOrTheStoresProperties() throws {
        let key = CoachHomeViewTests.canary()
        let pieces = CoachHomeViewTests.pieces(key)
        store.apply(try connect())
        store.host.fieldTyped(true)
        let ends: [PageLink.Outcome] = [.answered(.refused("invalid")), .answered(.failed(.timeout)), .documentGone, .notLinked, Self.done]
        for end in ends {
            store.handle(.connect(secret: key))
            store.host.act(.connect(secret: key))   // ignored: a key is out
            answer("coachHome.setKey", end)
        }
        // the key crossed whole, once per answered press, in the intent handed to the host (K1)
        XCTAssertEqual(asked, Array(repeating: .coachHomeSetKey(secret: key), count: ends.count))
        var found: [String] = []
        func look(_ text: String, _ what: String, kept: Bool = true) {
            for p in pieces where text.contains(p) { found.append("\(what) holds \(p)") }
            if kept, text.contains("\u{2022}\u{2022}\u{2022}") { found.append("\(what) holds something that carried the key") }
        }
        // that intent prints the secret as ••• (H1's redaction), so no log line of it can hold the key
        for intent in asked {
            look("\(intent)", "the intent as printed", kept: false)
            XCTAssertTrue("\(intent)".contains("\u{2022}\u{2022}\u{2022}"), "the intent prints its secret as the mark: \(intent)")
        }
        look(store.events.joined(separator: "\n"), "the events")
        look(store.outcomes.map { "\($0.key)=\($0.value)" }.joined(separator: "\n"), "the outcomes")
        look(store.toasts.joined(separator: "\n"), "the toasts")
        look(String(decoding: try JSONSerialization.data(withJSONObject: store.describe()), as: UTF8.self), "describe()")
        var dumped = ""
        dump(store!, to: &dumped)
        look(dumped, "dump")
        // every stored property, as deep as a Mirror goes (closures are leaves: they print as functions)
        var reached: [String] = []
        func walk(_ value: Any, _ path: String, _ depth: Int) {
            reached.append(path)
            look(String(describing: value), path)
            guard depth < 10 else { return }
            for (i, child) in Mirror(reflecting: value).children.enumerated() { walk(child.value, path + "." + (child.label ?? "\(i)"), depth + 1) }
        }
        walk(store!, "store", 0)
        XCTAssertEqual(found, [], "no piece of the key anywhere in the store")
        for property in ["store._model", "store._connecting", "store.keyFieldTyped", "store.hooks", "store.events", "store.outcomes", "store.toasts"] {
            XCTAssertTrue(reached.contains(property), "the walk reached \(property): \(reached.prefix(40))")
        }
    }

    // MARK: The root

    /// The root on a phone screen (a 47 pt status bar, the 83 pt glass tab bar), recording `HubHeaderBottomKey` as
    /// ScreenHost reads it.
    struct RootPhone: View {
        let store: CoachHomeStore
        let room: Room
        let paper: Bool
        /// Reduce Motion as the test sets it (nil: the system's).
        var reduceMotion: Bool?
        /// The fade's length as the test sets it (nil: the root's own). With neither set, the public initialiser.
        var fadeSeconds: TimeInterval?
        /// The system's Reduce Motion as the environment carries it to the root (nil: the simulator's own setting).
        var systemReduceMotion: Bool?
        var onBottom: ((CGFloat) -> Void)?

        var body: some View {
            Group {
                if reduceMotion == nil, fadeSeconds == nil {
                    CoachHomeRoot(store: store, room: room, paper: paper)
                } else {
                    CoachHomeRoot(store: store, room: room, paper: paper, reduceMotion: reduceMotion,
                                  fadeSeconds: fadeSeconds ?? CoachHomeRoot.fadeSeconds)
                }
            }
            // `accessibilityReduceMotion` is read-only; SwiftUI's settable twin sets what it reads
            .transformEnvironment(\._accessibilityReduceMotion) { [systemReduceMotion] on in
                if let systemReduceMotion { on = systemReduceMotion }
            }
            .safeAreaPadding(.top, CoachHomeViewTests.safeTop)
            .safeAreaPadding(.bottom, CoachHomeViewTests.safeBottom)
            .onPreferenceChange(HubHeaderBottomKey.self) { y in MainActor.assumeIsolated { onBottom?(y) } }
        }
    }

    /// The root in a key window of the window scene, its safe areas the phone's alone.
    @MainActor final class HostedRoot {
        let host: UIHostingController<RootPhone>
        let window: UIWindow

        /// `phone`: the phone's own light or dark setting (the window's style), which the root must never follow.
        init(_ root: RootPhone, size: CGSize? = nil, phone: UIUserInterfaceStyle = .unspecified) {
            let size = size ?? CoachHomeViewTests.screen
            host = UIHostingController(rootView: root)
            host.safeAreaRegions = []
            window = UIWindow(frame: CGRect(origin: .zero, size: size))
            if let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first {
                window.windowScene = scene
                window.frame = CGRect(origin: .zero, size: size)
            }
            window.overrideUserInterfaceStyle = phone
            window.rootViewController = host
            window.makeKeyAndVisible()
            host.view.frame = window.bounds
            settle(12)
        }

        func settle(_ turns: Int = 5) {
            for _ in 0..<turns {
                host.view.setNeedsLayout()
                host.view.layoutIfNeeded()
                RunLoop.main.run(until: Date().addingTimeInterval(0.03))
            }
        }

        /// Lets `seconds` pass with the run loop turning (an animation runs its course), then settles.
        func wait(_ seconds: TimeInterval) {
            let end = Date().addingTimeInterval(seconds)
            while Date() < end { settle(1) }
            settle(2)
        }

        /// One layout pass and one turn of the run loop that waits for nothing: SwiftUI takes a change, and no time to
        /// speak of passes.
        func flush() {
            host.view.setNeedsLayout()
            host.view.layoutIfNeeded()
            RunLoop.main.run(until: Date())
            host.view.layoutIfNeeded()
        }

        /// The window as drawn, at 2×.
        func image() -> UIImage {
            let format = UIGraphicsImageRendererFormat()
            format.scale = 2
            format.opaque = true
            return UIGraphicsImageRenderer(size: window.bounds.size, format: format).image { ctx in
                if !window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) {
                    host.view.layer.render(in: ctx.cgContext)
                }
            }
        }

        func find<T: UIView>(_ type: T.Type) -> T? {
            func walk(_ v: UIView) -> T? {
                if let t = v as? T { return t }
                for s in v.subviews { if let t = walk(s) { return t } }
                return nil
            }
            return walk(window)
        }

        /// The view that is first responder, if any.
        func firstResponder() -> UIView? {
            func walk(_ v: UIView) -> UIView? {
                if v.isFirstResponder { return v }
                for s in v.subviews { if let r = walk(s) { return r } }
                return nil
            }
            return walk(window)
        }

        func close() {
            window.endEditing(true)
            window.isHidden = true
            window.rootViewController = nil
        }
    }

    /// The colour at a point (in points) of a 2× render, as 0-255 channels.
    static func pixel(_ image: UIImage, _ p: CGPoint) -> (r: Int, g: Int, b: Int) {
        guard let c = image.cgImage else { return (-1, -1, -1) }
        var buf = [UInt8](repeating: 0, count: 4)
        let ctx = CGContext(data: &buf, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        let s = image.scale
        ctx.draw(c, in: CGRect(x: -p.x * s, y: -(CGFloat(c.height) - p.y * s - 1), width: CGFloat(c.width), height: CGFloat(c.height)))
        return (Int(buf[0]), Int(buf[1]), Int(buf[2]))
    }

    /// Whether a render's pixel is the colour of `rgba` (within the rounding of a colour space's conversion).
    static func isColour(_ image: UIImage, _ p: CGPoint, _ rgba: RGBA) -> Bool {
        let px = pixel(image, p)
        let want = (Int((rgba.red * 255).rounded()), Int((rgba.green * 255).rounded()), Int((rgba.blue * 255).rounded()))
        return abs(px.r - want.0) <= 3 && abs(px.g - want.1) <= 3 && abs(px.b - want.2) <= 3
    }

    /// With no model the root draws the first frame's ground, edge to edge (the status bar's band and the tab bar's
    /// included) and nothing else; once a model lands, the hub, in the model's own room: an image unlike the ground's,
    /// with the model's room behind it even where the ground's room differs.
    func testTheRootDrawsTheGroundUntilAModelThenTheHubInTheModelsRoom() throws {
        for (roomName, room) in CoachHomeViewTests.rooms {
            let paper = room.isPaper ?? true
            let s = CoachHomeStore()
            let tab = HostedRoot(RootPhone(store: s, room: room, paper: paper))
            let ground = tab.image()
            let bg = CoachHomeRoot.ground(room: room, paper: paper)
            XCTAssertEqual(bg, RoomTheme.defaults(room).rgba(.bg), "\(roomName): the ground is the room's background")
            XCTAssertEqual(CoachRenderTests.inked(ground, background: bg), 0, "\(roomName): the ground alone, nothing on it")
            for p in [CGPoint(x: 2, y: 2), CGPoint(x: 195, y: 20), CGPoint(x: 195, y: 422), CGPoint(x: 388, y: 842)] {
                XCTAssertTrue(Self.isColour(ground, p, bg), "\(roomName): the ground at \(p) (the bars' bands included): \(Self.pixel(ground, p))")
            }
            XCTAssertNil(tab.find(UIScrollView.self), "\(roomName): no hub before a model")
            // the hub of the other room: the model's room draws, not the first frame's
            let other: Room = room == .heavyweight ? .lime : .heavyweight
            XCTAssertTrue(s.apply(try model(CoachHomeViewTests.hubJSON(room: other), rev: 1)))
            tab.wait(0.5)
            let hub = tab.image()
            XCTAssertNotNil(tab.find(UIScrollView.self), "\(roomName): the hub")
            XCTAssertGreaterThan(CoachRenderTests.difference(ground, hub), 0.05, "\(roomName): the hub draws over the ground")
            let otherBG = RoomTheme.defaults(other).rgba(.bg)
            XCTAssertGreaterThan(CoachRenderTests.inked(hub, background: otherBG), 0.01, "\(roomName): the hub is inked")
            XCTAssertTrue(Self.isColour(hub, CGPoint(x: 2, y: 2), otherBG), "\(roomName): the model's room behind the hub: \(Self.pixel(hub, CGPoint(x: 2, y: 2)))")
            XCTAssertFalse(Self.isColour(hub, CGPoint(x: 2, y: 2), bg), "\(roomName): not the first frame's")
            tab.close()
        }
    }

    /// The root wears the room, never the phone's setting: the ground and the hub draw the same under a light and a
    /// dark phone.
    func testTheRootWearsTheRoomWhateverThePhonesSetting() throws {
        for (roomName, room) in CoachHomeViewTests.rooms {
            let s = CoachHomeStore()
            let light = HostedRoot(RootPhone(store: s, room: room, paper: room.isPaper ?? true), phone: .light)
            let dark = HostedRoot(RootPhone(store: s, room: room, paper: room.isPaper ?? true), phone: .dark)
            XCTAssertLessThan(CoachRenderTests.difference(light.image(), dark.image()), 0.001, "\(roomName): the ground")
            s.apply(try model(CoachHomeViewTests.connectJSON(room: room), rev: 1))
            light.wait(0.5)
            dark.wait(0.5)
            XCTAssertLessThan(CoachRenderTests.difference(light.image(), dark.image()), 0.001, "\(roomName): the connect screen")
            light.close()
            dark.close()
        }
    }

    /// ScreenHost anchors its toast under the hub's meta row while the hub is on top: the root passes the row's
    /// `HubHeaderBottomKey` up, and the ground passes none (the anchor falls under the status bar, contract 8.3).
    func testTheRootPublishesHubHeaderBottomKeyOnlyWithAModel() throws {
        var seen: [CGFloat] = []
        let s = CoachHomeStore()
        let tab = HostedRoot(RootPhone(store: s, room: .heavyweight, paper: true, onBottom: { seen.append($0) }))
        tab.wait(0.3)
        XCTAssertTrue(seen.allSatisfy { $0 == 0 }, "the ground publishes no bottom: \(seen)")
        s.apply(try model(rev: 1))
        tab.wait(0.5)
        let bottom = try XCTUnwrap(seen.last, "the hub publishes its meta row's bottom")
        XCTAssertGreaterThan(bottom, CoachHomeViewTests.safeTop + 44, "under the status bar, below the label and its padding")
        XCTAssertLessThan(bottom, CoachHomeViewTests.safeTop + 140, "at the top of the column")
        s.documentGone(keep: false)
        tab.wait(0.5)
        XCTAssertEqual(seen.last, 0, "the hub gone: no bottom again (\(seen))")
        tab.close()
    }

    /// The root presents nothing, takes no focus (the key field waits for the owner's tap) and sets no interface style
    /// on its controller or its window (the shell puts the room's on the Coach stack's navigation controller).
    func testTheRootPresentsNothingTakesNoFocusAndSetsNoInterfaceStyle() throws {
        for (roomName, room) in CoachHomeViewTests.rooms {
            let s = CoachHomeStore()
            let tab = HostedRoot(RootPhone(store: s, room: room, paper: room.isPaper ?? true))
            s.apply(try connect(room: room))
            tab.wait(0.5)
            let field = try XCTUnwrap(tab.find(UITextField.self), "\(roomName): the key field")
            XCTAssertFalse(field.isFirstResponder, "\(roomName): no focus but the owner's tap")
            XCTAssertNil(tab.firstResponder(), "\(roomName): nothing in the window took the focus")
            XCTAssertNil(tab.host.presentedViewController, "\(roomName): nothing presented")
            XCTAssertEqual(tab.host.overrideUserInterfaceStyle, .unspecified, "\(roomName): no interface style on the root's controller")
            XCTAssertEqual(tab.window.overrideUserInterfaceStyle, .unspecified, "\(roomName): nor on the window")
            tab.close()
        }
    }

    // MARK: The fade

    /// How the hub came in over the ground: the ground; right after the model landed (one layout pass and a render,
    /// no time to speak of) whether the hub was in the hierarchy, the window as drawn and how long after the model that
    /// render ended; and the window once the fade had run its course.
    struct FadeIn {
        let ground: UIImage
        let inserted: Bool
        let now: UIImage
        let took: TimeInterval
        let settled: UIImage
    }

    /// Hosts `root`, lands the hub's model on its store and renders as FadeIn says; `fade` is the longest the fade can
    /// run.
    private func fadeIn(_ root: RootPhone, fade: TimeInterval) throws -> FadeIn {
        let tab = HostedRoot(root)
        let ground = tab.image()
        let start = Date()
        root.store.apply(try model(rev: 1))
        tab.flush()
        let inserted = tab.find(UIScrollView.self) != nil
        let now = tab.image()
        let took = Date().timeIntervalSince(start)
        tab.wait(fade + 0.4)
        let settled = tab.image()
        tab.close()
        return FadeIn(ground: ground, inserted: inserted, now: now, took: took, settled: settled)
    }

    /// The bound on a render inside a fade: 0.12 s, three fifths of the 0.2 s fade, with CI's slack. No bound on a render
    /// inside the fade can outlast the fade itself, so a fade test stretches the fade by the slack too (`fadeSeconds`,
    /// the internal initialiser's), keeping the render's place in it: 0.12 s of 0.2 s here, 1.2 s of 2 s on CI.
    static var insideFade: TimeInterval { 0.12 * slack }

    /// A render inside the fade: one that ended `insideFade` or later after the model (a machine too busy for it) is
    /// taken again on a new root, at most five times; the last is returned with the number of tries.
    private func fadeInside(_ root: () -> RootPhone, fade: TimeInterval) throws -> (FadeIn, Int) {
        var r = try fadeIn(root(), fade: fade)
        var tries = 1
        while r.took >= Self.insideFade, tries < 5 {
            r = try fadeIn(root(), fade: fade)
            tries += 1
        }
        return (r, tries)
    }

    /// The hub comes in over the ground with a 0.2 s cross-fade, and at once under Reduce Motion: right after the model
    /// lands (one layout pass, no time to speak of), the hub is in the hierarchy either way; under Reduce Motion it is
    /// already drawn as it settles, and without it not yet (it is fading in). The second half reads the clock: a render
    /// inside the fade must end within 0.12 s of the model, and on CI the fade and that bound both take the slack; one
    /// that comes late anyway (a machine under heavy load would find the fade over) is taken again.
    func testTheHubFadesInOverTheGroundAndAtOnceUnderReduceMotion() throws {
        XCTAssertNil(CoachHomeRoot.fade(reduceMotion: true), "Reduce Motion: no fade")
        XCTAssertEqual(CoachHomeRoot.fade(reduceMotion: false), .easeInOut(duration: 0.2), "a 0.2 s cross-fade")
        XCTAssertEqual(CoachHomeRoot.fadeSeconds, 0.2)
        XCTAssertEqual(CoachHomeRoot.fade(reduceMotion: false, seconds: 2), .easeInOut(duration: 2), "a fade of a test's length")
        let fade = CoachHomeRoot.fadeSeconds * Self.slack
        func root(reduceMotion: Bool) -> RootPhone {
            RootPhone(store: CoachHomeStore(), room: .heavyweight, paper: true, reduceMotion: reduceMotion, fadeSeconds: fade)
        }
        let still = try fadeIn(root(reduceMotion: true), fade: fade)
        XCTAssertTrue(still.inserted, "Reduce Motion: the layout pass took the model")
        XCTAssertGreaterThan(CoachRenderTests.difference(still.ground, still.settled), 0.05, "Reduce Motion: the hub draws")
        XCTAssertLessThan(CoachRenderTests.difference(still.now, still.settled), 0.001, "Reduce Motion: the hub at once, no fade")
        let (moving, tries) = try fadeInside({ root(reduceMotion: false) }, fade: fade)
        XCTAssertLessThan(moving.took, Self.insideFade, "a render inside the \(fade) s fade (\(tries) tries; the machine was too busy for one)")
        XCTAssertTrue(moving.inserted, "the layout pass took the model: the hub is there")
        XCTAssertGreaterThan(CoachRenderTests.difference(moving.ground, moving.settled), 0.05, "the hub draws")
        XCTAssertGreaterThan(CoachRenderTests.difference(moving.now, moving.settled), 0.05, "the hub is there but not yet drawn: it fades in")
    }

    /// The public root's fade as a render test hosts it: the public initialiser itself (nil), or on CI, where the fade
    /// must stretch by the slack and the public initialiser has no length to stretch, the path it takes (Reduce Motion
    /// nil: the system's) with the stretched length.
    static var publicFade: TimeInterval? { slack == 1 ? nil : CoachHomeRoot.fadeSeconds * slack }

    /// The shipped path: the public `CoachHomeRoot(store:room:paper:)` reads the system's Reduce Motion (the
    /// environment's `accessibilityReduceMotion`) and fades in 0.2 s. Hosted under Reduce Motion on, it draws the hub at
    /// once; under it off, the hub fades in (a render inside the fade, as the internal initialiser's case takes it).
    func testThePublicRootFollowsTheSystemsReduceMotion() throws {
        let pub = CoachHomeRoot(store: CoachHomeStore(), room: .heavyweight, paper: true)
        XCTAssertNil(pub.reduceMotion, "the public root reads the system's Reduce Motion")
        XCTAssertEqual(pub.fadeSeconds, 0.2, "and fades in 0.2 s")
        let still = try fadeIn(RootPhone(store: CoachHomeStore(), room: .heavyweight, paper: true, systemReduceMotion: true),
                               fade: CoachHomeRoot.fadeSeconds)
        XCTAssertTrue(still.inserted, "Reduce Motion on: the layout pass took the model")
        XCTAssertGreaterThan(CoachRenderTests.difference(still.ground, still.settled), 0.05, "Reduce Motion on: the hub draws")
        XCTAssertLessThan(CoachRenderTests.difference(still.now, still.settled), 0.001, "Reduce Motion on: the public root draws the hub at once")
        let fade = Self.publicFade ?? CoachHomeRoot.fadeSeconds
        let (moving, tries) = try fadeInside({
            RootPhone(store: CoachHomeStore(), room: .heavyweight, paper: true, fadeSeconds: Self.publicFade, systemReduceMotion: false)
        }, fade: fade)
        XCTAssertLessThan(moving.took, Self.insideFade, "Reduce Motion off: a render inside the \(fade) s fade (\(tries) tries; the machine was too busy for one)")
        XCTAssertTrue(moving.inserted, "Reduce Motion off: the layout pass took the model")
        XCTAssertGreaterThan(CoachRenderTests.difference(moving.ground, moving.settled), 0.05, "Reduce Motion off: the hub draws")
        XCTAssertGreaterThan(CoachRenderTests.difference(moving.now, moving.settled), 0.05, "Reduce Motion off: the hub fades in")
    }

    // MARK: The root on the store

    /// Keys reach SwiftUI's text field as UIKit delivers them (CoachHomeViewTests' rule), then the host settles.
    private func type(_ text: String, into tf: UITextField, then settle: () -> Void) {
        if !tf.isFirstResponder { _ = tf.becomeFirstResponder() }
        tf.insertText(text)
        CoachHomeViewTests.send(.editingChanged, from: tf)
        settle()
    }

    private func pressReturn(_ tab: HostedRoot, file: StaticString = #filePath, line: UInt = #line) throws {
        let tf = try XCTUnwrap(tab.find(UITextField.self), "the key field", file: file, line: line)
        CoachHomeViewTests.send(.primaryActionTriggered, from: tf)
        tab.settle()
    }

    /// The owner's key through the hosted root: the field's flag reaches the store, Return sends the key once through
    /// the store's hooks and nothing more while it is out (the root hands the hub the store's `connecting`), a refusal
    /// keeps the key in the field, a reload while the tab is NATIVE keeps the connect screen and its key into the next
    /// document's model, the hub's model takes the field away, and a document that goes while the tab is not NATIVE
    /// leaves the ground.
    func testTheRootCarriesTheKeyToTheStoreOnce() throws {
        let key = CoachHomeViewTests.canary()
        store.apply(try connect())
        let tab = HostedRoot(RootPhone(store: store, room: .heavyweight, paper: true))
        tab.wait(0.3)
        XCTAssertEqual(keyField(), "empty", "the field appeared empty")
        type(key, into: try XCTUnwrap(tab.find(UITextField.self)), then: { tab.settle() })
        XCTAssertEqual(keyField(), "typed", "the field's flag reached the store")
        try pressReturn(tab)
        XCTAssertEqual(asked, [.coachHomeSetKey(secret: key)], "Return: the key, whole, once, through the store's hooks")
        XCTAssertTrue(store.connecting)
        try pressReturn(tab)
        XCTAssertEqual(asked.count, 1, "nothing more while the key is out")
        XCTAssertFalse(store.events.contains("CONNECT ignored: a key is out"),
                       "the hub itself held Return back: the root handed it the store's connecting (\(store.events.suffix(6)))")
        answer("coachHome.setKey", .answered(.refused("invalid")))
        tab.settle()
        XCTAssertFalse(store.connecting)
        XCTAssertEqual(toasts, [], "a refusal: the page's own toast")
        XCTAssertEqual(tab.find(UITextField.self)?.text, key, "the key stays in the field for the owner to fix")
        // a reload while the tab is NATIVE: the connect screen stays drawn with the key, and the next document's model
        // too
        store.documentGone(keep: true)
        tab.settle()
        XCTAssertEqual(tab.find(UITextField.self)?.text, key)
        XCTAssertTrue(store.apply(try connect(boot: "b2", rev: 1)))
        tab.settle()
        XCTAssertEqual(tab.find(UITextField.self)?.text, key, "the next document's connect screen keeps the field")
        try pressReturn(tab)
        XCTAssertEqual(keys, [.coachHomeSetKey(secret: key), .coachHomeSetKey(secret: key)], "Return works again once answered")
        answer("coachHome.setKey", Self.done)
        // the key saved: the page's next model is the hub, and the field goes
        XCTAssertTrue(store.apply(try model(boot: "b2", rev: 2)))
        tab.wait(0.5)
        XCTAssertNil(tab.find(UITextField.self), "no field on the hub")
        XCTAssertNotNil(tab.find(UIScrollView.self))
        XCTAssertEqual(keyField(), "empty")
        // the document goes while the tab is not NATIVE: the ground again
        store.documentGone(keep: false)
        tab.wait(0.5)
        XCTAssertNil(tab.find(UIScrollView.self), "the ground, no hub")
        XCTAssertEqual(asked.count, 2, "two presses answered, two keys sent: nothing resent")
        tab.close()
    }

    /// `describe()` says a connect block, and its starter link, is drawn exactly where the hosted root draws one: the
    /// connect screen and a newer page's route that carries a connect object, never the hub, even when the hub's model
    /// carries one (CoachHomeView draws the hub's groups alone); the starter link only inside a drawn block. The key
    /// field's flag reads the same rule.
    func testDescribeSaysAConnectBlockAndItsStarterLinkOnlyWhereTheRootDrawsThem() throws {
        let tab = HostedRoot(RootPhone(store: store, room: .heavyweight, paper: true))
        let rows = """
        [{"head":"Conversation","rows":[{"do":"openChat","title":"Open Chat","sub":null,"icon":"chat"}]}]
        """
        let cases: [(what: String, model: CoachHomeModel, connect: Bool, starter: Bool)] = [
            ("the hub", try model(rev: 1), false, false),
            ("the connect screen with the starter link", try connect(rev: 2), true, true),
            ("the connect screen without it", try model(CoachHomeViewTests.connectJSON(starter: false), rev: 3), true, false),
            ("a hub whose model carries a connect object and a starter", try model(CoachHomeViewTests.connectJSON(route: "hub", groups: rows), rev: 4), false, false),
            ("a newer page's route with a connect block", try model(CoachHomeViewTests.otherJSON(), rev: 5), true, false),
            ("a newer page's route with a connect block and a starter", try model(CoachHomeViewTests.connectJSON(route: "upsell", groups: rows), rev: 6), true, true),
        ]
        for c in cases {
            XCTAssertTrue(store.apply(c.model), c.what)
            tab.wait(0.3)
            XCTAssertNotNil(tab.find(UIScrollView.self), "\(c.what): drawn")
            XCTAssertEqual(tab.find(UITextField.self) != nil, c.connect, "\(c.what): a connect block (its key field) drawn or not")
            let d = store.describe()
            XCTAssertEqual(d["connect"] as? Bool, c.connect, "\(c.what): describe() says what is drawn")
            XCTAssertEqual(d["starter"] as? Bool, c.starter, "\(c.what): the starter link, only inside a drawn block")
        }
        // the hub whose model carries a connect object draws no field: a report of text from one on its way out is
        // ignored
        XCTAssertTrue(store.apply(try model(CoachHomeViewTests.connectJSON(route: "hub", groups: rows), rev: 7)))
        tab.wait(0.3)
        XCTAssertNil(tab.find(UITextField.self))
        store.host.fieldTyped(true)
        XCTAssertEqual(keyField(), "empty")
        XCTAssertEqual(asked, [])
        tab.close()
    }

    // MARK: The root in the Coach stack

    /// The root as the shell hosts it (H4, H10): a hosting controller at the root of a navigation controller whose bar
    /// is hidden, in the Coach slot of a tab bar controller beside a plain Log slot, in a key window of the window
    /// scene. The shell's funnel, hold and pushes are H's; here the test selects, pushes and pops with UIKit's own calls.
    @MainActor final class HostedStack {
        let tabs = UITabBarController()
        let nav: UINavigationController
        let window: UIWindow

        init<Root: View>(_ root: Root) {
            nav = UINavigationController(rootViewController: UIHostingController(rootView: root))
            nav.setNavigationBarHidden(true, animated: false)
            nav.tabBarItem = UITabBarItem(title: "Coach", image: nil, tag: 1)
            let log = UIViewController()
            log.view.backgroundColor = .white
            log.tabBarItem = UITabBarItem(title: "Log", image: nil, tag: 0)
            tabs.viewControllers = [log, nav]
            tabs.selectedIndex = 0
            window = UIWindow(frame: CGRect(origin: .zero, size: CoachHomeViewTests.screen))
            if let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first {
                window.windowScene = scene
                window.frame = CGRect(origin: .zero, size: CoachHomeViewTests.screen)
            }
            window.rootViewController = tabs
            window.makeKeyAndVisible()
            settle(12)
        }

        /// Selects a slot (0 Log, 1 Coach) and lets it settle.
        func select(_ index: Int) {
            tabs.selectedIndex = index
            settle(8)
        }

        func settle(_ turns: Int = 5) {
            for _ in 0..<turns {
                window.setNeedsLayout()
                window.layoutIfNeeded()
                RunLoop.main.run(until: Date().addingTimeInterval(0.03))
            }
        }

        /// Lets `seconds` pass with the run loop turning, then settles.
        func wait(_ seconds: TimeInterval) {
            let end = Date().addingTimeInterval(seconds)
            while Date() < end { settle(1) }
            settle(2)
        }

        /// Turns the run loop until `done` holds, for at most `seconds` (5 s, with CI's slack; false if it never did),
        /// then settles: a transition or an update waited for by what it does, not by a guess at how long it takes on a
        /// busy machine.
        @discardableResult
        func settle(until done: () -> Bool, within seconds: TimeInterval = 5 * CoachHomeStoreTests.slack) -> Bool {
            let end = Date().addingTimeInterval(seconds)
            while !done() {
                if Date() >= end { return false }
                settle(1)
            }
            settle(2)
            return true
        }

        /// The stack at rest with `top` on top: no transition under way.
        func rests(on top: UIViewController?) -> Bool { nav.transitionCoordinator == nil && nav.topViewController === top }

        /// Whether the Coach stack is in the window (its slot selected).
        var inWindow: Bool { nav.view.window != nil }

        /// The first view of this type in the view of the stack's top controller (the root's, or a pushed one's).
        func find<T: UIView>(_ type: T.Type) -> T? {
            func walk(_ v: UIView) -> T? {
                if let t = v as? T { return t }
                for s in v.subviews { if let t = walk(s) { return t } }
                return nil
            }
            return nav.topViewController?.view.flatMap(walk)
        }

        func close() {
            window.endEditing(true)
            window.isHidden = true
            window.rootViewController = nil
        }
    }

    /// The root in a Coach stack in a tab bar (contract 1.4, 8.3; H0's probe, finding 6: a push made while the stack is
    /// out of the window completes at once, and UIKit's didShow comes late and twice, so nothing of N's waits on it): a
    /// model that lands while Coach is not selected is drawn once Coach is selected again; the key typed into the
    /// connect screen stays in the field, and the store's flag stays "typed", across the chat pushed over the root and
    /// popped (in the window, and pushed while away and popped on return) and across a newer model of the same route;
    /// the key saved while away, the hub draws on return with no field and the flag "empty"; nothing is presented and
    /// nothing is sent.
    func testTheRootInTheCoachStackTakesModelsWhileAwayAndWaitsOnNoNavigationCallback() throws {
        let key = CoachHomeViewTests.canary()
        var bottoms: [CGFloat] = []
        let stack = HostedStack(RootPhone(store: store, room: .heavyweight, paper: true, onBottom: { bottoms.append($0) }))
        let root = stack.nav.topViewController
        stack.select(1)
        XCTAssertTrue(stack.inWindow, "Coach selected: the stack is in the window")
        XCTAssertNil(stack.find(UIScrollView.self), "Coach selected before a model: the ground")
        // away (Log selected, the stack out of the window), the page's connect screen lands
        stack.select(0)
        XCTAssertFalse(stack.inWindow, "Log selected: the Coach stack is out of the window")
        XCTAssertTrue(store.apply(try connect()))
        stack.settle()
        stack.select(1)
        stack.settle(until: { stack.find(UITextField.self) != nil })
        let field = try XCTUnwrap(stack.find(UITextField.self), "Coach selected again: the connect screen")
        XCTAssertGreaterThan(bottoms.last ?? 0, 0, "the meta row's bottom, for the toast anchor (\(bottoms))")
        type(key, into: field, then: { stack.settle() })
        XCTAssertEqual(keyField(), "typed")
        // the chat pushed over the root and popped back to it, in the window
        stack.window.endEditing(true)
        let chat = UIViewController()
        chat.view.backgroundColor = .black
        stack.nav.pushViewController(chat, animated: true)
        XCTAssertTrue(stack.settle(until: { stack.rests(on: chat) }), "the push ran its course")
        XCTAssertNil(stack.find(UITextField.self), "the chat on top")
        stack.nav.popViewController(animated: true)
        XCTAssertTrue(stack.settle(until: { stack.rests(on: root) }), "the pop ran its course")
        XCTAssertEqual(stack.find(UITextField.self)?.text, key, "the key stays in the field across a push and a pop")
        XCTAssertEqual(keyField(), "typed", "and the flag says so")
        // a push made while away (it completes at once; its didShow waits for Coach), a newer model of the same route
        // while away, and the pop made on return
        stack.select(0)
        let away = UIViewController()
        stack.nav.pushViewController(away, animated: false)
        XCTAssertTrue(stack.nav.topViewController === away, "a push made out of the window is on top at once")
        XCTAssertTrue(store.apply(try connect(rev: 5)), "the model of a refused key, while away")
        stack.settle()
        stack.select(1)
        stack.nav.popViewController(animated: false)
        XCTAssertTrue(stack.settle(until: { stack.rests(on: root) }), "the pop ran its course")
        XCTAssertEqual(stack.find(UITextField.self)?.text, key, "the same route: the same field, its key kept")
        XCTAssertEqual(keyField(), "typed")
        // the key saved while away: the hub on return, with no field
        stack.select(0)
        XCTAssertTrue(store.apply(try model(rev: 6)))
        XCTAssertEqual(keyField(), "empty", "the route left the connect screen: the field went")
        stack.select(1)
        XCTAssertTrue(stack.settle(until: { stack.find(UITextField.self) == nil }), "no field on the hub")
        stack.wait(0.3)
        XCTAssertNotNil(stack.find(UIScrollView.self), "the hub")
        XCTAssertEqual(keyField(), "empty")
        // the field on its way out said nothing as the stack came back (CoachHomeView), so the store had nothing to
        // ignore either
        let sinceHub = Array(store.events.drop(while: { $0 != "model rev 6: hub" }))
        XCTAssertFalse(sinceHub.contains { $0.contains("holds text") }, "nothing about text since the hub: \(sinceHub)")
        XCTAssertNil(stack.tabs.presentedViewController, "nothing presented")
        XCTAssertEqual(asked, [], "nothing sent: no press was made")
        stack.close()
    }

    /// A model a test swaps under a CoachHomeView with a recording host.
    @MainActor final class ModelBox: ObservableObject {
        @Published var model: CoachHomeModel
        init(_ model: CoachHomeModel) { self.model = model }
    }

    struct BoxedHome: View {
        @ObservedObject var box: ModelBox
        let host: CoachHomeHost
        var body: some View { CoachHomeView(model: box.model, host: host) }
    }

    /// What the key field reports in a Coach stack (CoachHomeView on a recording host): a field that appears empty
    /// says so and, typed into, says it holds text once; the chat pushed over it and popped, and Coach left and
    /// selected again, it says nothing more (UIKit replays its appearance each time, H0's probe); the key saved while
    /// Coach is not selected, the route change says the field is empty, and the field on its way out says nothing as
    /// the stack comes back into the window (its replayed appearance comes before the newer model's update removes it).
    func testTheKeyFieldSaysNothingMoreAsTheStackComesBack() throws {
        let rec = CoachHomeViewTests.Recorder()
        let box = ModelBox(try connect())
        let stack = HostedStack(BoxedHome(box: box, host: rec.host()))
        let root = stack.nav.topViewController
        stack.select(1)
        stack.settle(until: { stack.find(UITextField.self) != nil })
        let field = try XCTUnwrap(stack.find(UITextField.self), "the connect screen")
        XCTAssertEqual(rec.typed, [false], "a field that appears empty says so")
        type(CoachHomeViewTests.canary(), into: field, then: { stack.settle() })
        XCTAssertEqual(rec.typed, [false, true], "typed into")
        stack.window.endEditing(true)
        let chat = UIViewController()
        stack.nav.pushViewController(chat, animated: true)
        XCTAssertTrue(stack.settle(until: { stack.rests(on: chat) }), "the push ran its course")
        stack.nav.popViewController(animated: true)
        XCTAssertTrue(stack.settle(until: { stack.rests(on: root) }), "the pop ran its course")
        stack.wait(0.3)
        XCTAssertNotNil(stack.find(UITextField.self), "the field back on top")
        XCTAssertEqual(rec.typed, [false, true], "back from under the chat: nothing more")
        stack.select(0)
        stack.select(1)
        stack.wait(0.3)
        XCTAssertEqual(rec.typed, [false, true], "Coach selected again: nothing more")
        // the key saved while Coach is not selected
        stack.select(0)
        box.model = try model(rev: 6)
        stack.settle()
        stack.select(1)
        XCTAssertTrue(stack.settle(until: { stack.find(UITextField.self) == nil }), "the hub, no field")
        stack.wait(0.3)
        XCTAssertEqual(rec.typed, [false, true, false], "the route left the connect screen, and nothing after it")
        XCTAssertEqual(rec.actions, [])
        stack.close()
    }
}
#endif
