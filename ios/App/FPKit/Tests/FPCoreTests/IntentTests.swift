import Foundation
import XCTest
import FPCore

final class IntentTests: XCTestCase {
    static func contractFile() throws -> JSONValue {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "intents", withExtension: "json"))
        return try JSONText.parse(utf8: Data(contentsOf: url))
    }

    /// One of every intent.
    static let samples: [Intent] = [
        .ping,
        .shellCovered(on: true),
        .coachSnapshot,
        .coachSend(text: "How did my run look?", image: CoachImage(mediaType: "image/jpeg", data: "/9j/4AAQ"), usePending: false, nonce: "n1"),
        .coachChip(text: "Am I progressing on track?", nonce: "n2"),
        .coachAction(id: "m12", text: "Set my run goal pace to 8:05/km"),
        .coachStop,
        .coachRetry,
        .coachKeep(id: "m14"),
        .coachUndo(id: "m14"),
        .coachModel(model: "claude-haiku-4-5-20251001"),
        .coachBack,
        .coachCancelIntake,
        .coachRestorePrevious,
        .coachRegenerate,
        .coachOpenSettings,
        .coachImage(key: "share-1"),
        .coachClearImage,
        .coachDraftTaken(nonce: "d3"),
        .confirm(id: "c1", yes: true),
        .toastUndo(id: "t1"),
        .screensOff(screen: "coach", why: "failures", draft: "Swap my squat for"),
        .tabsSelect(tab: "progress", seq: 4, again: false),
        .tabsBar(BarMetrics(h: 83, safe: 34, rev: 2)),
        .coachHomeSnapshot,
        .coachHomeOpenChat,
        .coachHomeSetKey(secret: "sk-ant-test-abcdefghijklmnopqrstuvwx"),
        .coachHomeDisconnect,
        .coachHomeClearChat,
        .coachHomeStartIntake,
        .coachHomeOpenStarter,
    ]

    /// Build 61's nine, after `screens.off`, in contract 4.1's order.
    static let build61 = ["tabs.select", "tabs.bar", "coachHome.snapshot", "coachHome.openChat", "coachHome.setKey", "coachHome.disconnect",
                          "coachHome.clearChat", "coachHome.startIntake", "coachHome.openStarter"]

    /// The acceptance check of C4: intent names and arguments equal intents.json.
    func testIntentNamesAndArgumentsEqualIntentsJSON() throws {
        let file = try Self.contractFile()
        XCTAssertEqual(file["contract"]?.int, 1, "contract v1")
        let listed = try XCTUnwrap(file["intents"]?.array)
        XCTAssertEqual(listed.compactMap { $0["name"]?.string }, IntentSignature.all.map(\.name), "names, in the same order")
        XCTAssertEqual(IntentSignature.all.count, 31)
        XCTAssertEqual(Array(IntentSignature.all.map(\.name).suffix(10)), ["screens.off"] + Self.build61)
        XCTAssertEqual(IntentSignature.named("coachHome.snapshot")?.timeout, 5)
        for n in Self.build61 where n != "coachHome.snapshot" { XCTAssertEqual(IntentSignature.named(n)?.timeout, 2, n) }
        XCTAssertEqual(IntentSignature.named("tabs.select")?.args.map(\.spec), ["string", "int", "bool?"])
        XCTAssertEqual(IntentSignature.named("tabs.bar")?.args.map(\.name), ["h", "safe", "rev"])
        XCTAssertEqual(IntentSignature.named("coachHome.setKey")?.args.map(\.name), ["secret"], "never key, id or nonce (contract 5 K3)")
        XCTAssertEqual(IntentSignature.named("screens.off")?.args.map(\.name), ["screen", "why", "draft"])
        for entry in listed {
            let name = try XCTUnwrap(entry["name"]?.string)
            let sig = try XCTUnwrap(IntentSignature.named(name), name)
            let args = try XCTUnwrap(entry["args"]?.object, name)
            XCTAssertEqual(args.mapValues { $0.string ?? "?" }, Dictionary(uniqueKeysWithValues: sig.args.map { ($0.name, $0.spec) }), name)
            for spec in args.values { XCTAssertNotNil(IntentSignature.Arg(name: "x", spec: spec.string ?? ""), "\(name): unknown type \(spec)") }
            XCTAssertEqual(entry["timeout"]?.double, sig.timeout, name)
            XCTAssertNotNil(entry["does"]?.string, "\(name) says what it does")
        }
    }

    func testEveryIntentRoundTripsThroughItsNameAndArguments() throws {
        XCTAssertEqual(Set(Self.samples.map(\.name)), Set(IntentSignature.all.map(\.name)), "a sample of every intent")
        XCTAssertEqual(Self.samples.count, IntentSignature.all.count)
        for intent in Self.samples {
            let sig = try XCTUnwrap(IntentSignature.named(intent.name))
            XCTAssertEqual(sig.problems(with: intent.arguments), [], intent.name)
            XCTAssertEqual(try Intent(name: intent.name, arguments: intent.arguments), intent)
            // what callAsyncJavaScript receives survives a JSON trip (plain Foundation values only)
            let call = intent.callArguments
            XCTAssertEqual(call["name"] as? String, intent.name)
            let data = try JSONSerialization.data(withJSONObject: call)
            let back = try JSONText.parse(utf8: data)
            XCTAssertEqual(back["args"], .object(intent.arguments), intent.name)
        }
        // optional arguments are left out when unset
        XCTAssertEqual(Intent.coachSend(text: "hi", image: nil, usePending: nil, nonce: "n").arguments, ["text": "hi", "nonce": "n"])
        XCTAssertEqual(Intent.screensOff(screen: "coach", why: nil).arguments, ["screen": "coach"])
        XCTAssertEqual(Intent.screensOff(screen: "coach", why: "needs", draft: "half a thought").arguments,
                       ["screen": "coach", "why": "needs", "draft": "half a thought"])
        XCTAssertEqual(try Intent(name: "screens.off", arguments: ["screen": "tabs", "why": "policy"]), .screensOff(screen: "tabs", why: "policy", draft: nil))
        XCTAssertEqual(Intent.tabsSelect(tab: "log", seq: 1, again: nil).arguments, ["tab": "log", "seq": 1])
        XCTAssertEqual(Intent.callSource, "return await window.FPScreens.call(name, args);")
    }

    func testParseErrors() {
        XCTAssertThrowsError(try Intent(name: "coach.dance", arguments: [:])) { XCTAssertEqual($0 as? Intent.ParseError, .unknownName("coach.dance")) }
        XCTAssertThrowsError(try Intent(name: "coach.keep", arguments: [:])) { XCTAssertEqual($0 as? Intent.ParseError, .missing("id")) }
        XCTAssertThrowsError(try Intent(name: "confirm", arguments: ["id": "c", "yes": "yes"])) { XCTAssertEqual($0 as? Intent.ParseError, .wrongType("yes")) }
        XCTAssertThrowsError(try Intent(name: "coach.send", arguments: ["text": "x", "nonce": "n", "image": "data:"])) { XCTAssertEqual($0 as? Intent.ParseError, .wrongType("image")) }
        XCTAssertEqual(try Intent(name: "coach.send", arguments: ["text": "x", "nonce": "n", "image": nil, "usePending": nil]),
                       .coachSend(text: "x", image: nil, usePending: nil, nonce: "n"))
        // build 61's: setKey only with its secret (never under another name), ints that are whole numbers
        XCTAssertThrowsError(try Intent(name: "coachHome.setKey", arguments: [:])) { XCTAssertEqual($0 as? Intent.ParseError, .missing("secret")) }
        XCTAssertThrowsError(try Intent(name: "coachHome.setKey", arguments: ["key": "sk-ant-test-x"])) { XCTAssertEqual($0 as? Intent.ParseError, .missing("secret")) }
        XCTAssertThrowsError(try Intent(name: "tabs.select", arguments: ["tab": "log"])) { XCTAssertEqual($0 as? Intent.ParseError, .missing("seq")) }
        XCTAssertThrowsError(try Intent(name: "tabs.select", arguments: ["tab": "log", "seq": 1.5])) { XCTAssertEqual($0 as? Intent.ParseError, .wrongType("seq")) }
        XCTAssertThrowsError(try Intent(name: "tabs.select", arguments: ["tab": "log", "seq": 1, "again": "yes"])) { XCTAssertEqual($0 as? Intent.ParseError, .wrongType("again")) }
        XCTAssertThrowsError(try Intent(name: "tabs.bar", arguments: ["h": 83, "safe": 34])) { XCTAssertEqual($0 as? Intent.ParseError, .missing("rev")) }
        XCTAssertEqual(IntentSignature.named("coachHome.setKey")!.problems(with: ["key": "sk-ant-test-x"]),
                       ["coachHome.setKey: missing secret", "coachHome.setKey: extra key"])
        let sig = IntentSignature.named("coach.action")!
        XCTAssertEqual(sig.problems(with: ["id": 3, "extra": true]), ["coach.action: id is not string", "coach.action: missing text", "coach.action: extra extra"])
    }

    func testTimeoutsScreensAndNonces() {
        XCTAssertEqual(Intent.coachSnapshot.timeout, 5)
        XCTAssertEqual(Intent.ping.timeout, 2)
        XCTAssertEqual(Intent.coachStop.timeout, 2)
        XCTAssertEqual(Intent.coachUndo(id: "m").screen, "coach")
        XCTAssertNil(Intent.confirm(id: "c", yes: false).screen)
        XCTAssertNil(Intent.ping.screen)
        // attribution by prefix (contract 4.4): "coachHome." does not start with "coach."
        XCTAssertEqual(Intent.coachSend(text: "x", image: nil, usePending: nil, nonce: "n").screen, "coach")
        XCTAssertEqual(Intent.coachHomeOpenChat.screen, "coachHome")
        XCTAssertEqual(Intent.coachHomeSetKey(secret: "s").screen, "coachHome")
        XCTAssertEqual(Intent.tabsSelect(tab: "log", seq: 1, again: nil).screen, "tabs")
        XCTAssertEqual(Intent.tabsBar(BarMetrics(h: 49, safe: 0, rev: 1)).screen, "tabs")
        XCTAssertNil(Intent.shellCovered(on: true).screen)
        XCTAssertNil(Intent.screensOff(screen: "coach", why: nil).screen)
        XCTAssertNil(Intent.screensOff(screen: "tabs", why: "policy").screen)
        XCTAssertNil(Intent.toastUndo(id: "t").screen)
        XCTAssertEqual(Intent.coachHomeSnapshot.timeout, 5)
        XCTAssertEqual(Intent.coachHomeSetKey(secret: "s").timeout, 2)
        let a = Intent.nonce(), b = Intent.nonce()
        XCTAssertNotEqual(a, b)
        XCTAssertTrue(a.hasPrefix("n"))
        XCTAssertEqual(a.count, 17)
    }

    func testOutcomesTellTheBridgeFromThePage() {
        XCTAssertEqual(IntentOutcome.classify(result: ["ok": true, "v": 1], error: nil), .done(IntentReply(json: ["ok": true, "v": 1])))
        XCTAssertEqual(IntentOutcome.classify(result: ["ok": false, "error": "stale"], error: nil), .refused("stale"))
        XCTAssertEqual(IntentOutcome.classify(result: ["ok": false, "error": "busy"], error: nil), .refused("busy"))
        XCTAssertEqual(IntentOutcome.classify(result: ["ok": false], error: nil), .refused(""))
        XCTAssertEqual(IntentOutcome.classify(result: ["ok": false, "error": "unknown-intent"], error: nil), .failed(.page("unknown-intent")))
        XCTAssertEqual(IntentOutcome.classify(result: ["ok": false, "error": "exception"], error: nil), .failed(.page("exception")))
        XCTAssertEqual(IntentOutcome.classify(result: ["v": 1], error: nil), .failed(.malformedReply("no ok")))
        XCTAssertEqual(IntentOutcome.classify(result: "ok", error: nil), .failed(.malformedReply("String")))
        XCTAssertEqual(IntentOutcome.classify(result: nil, error: nil), .failed(.malformedReply("nothing")))
        XCTAssertEqual(IntentOutcome.classify(result: nil, error: nil, timedOut: true), .failed(.timeout))
        let js = NSError(domain: "WKErrorDomain", code: 4, userInfo: [NSLocalizedDescriptionKey: "A JavaScript exception occurred"])
        XCTAssertEqual(IntentOutcome.classify(result: nil, error: js), .failed(.javascript("A JavaScript exception occurred")))
        XCTAssertTrue(IntentOutcome.failed(.timeout).countsAsFailure)
        XCTAssertFalse(IntentOutcome.refused("stale").countsAsFailure)
        XCTAssertFalse(IntentOutcome.done(IntentReply(json: ["ok": true])).countsAsFailure)
    }

    /// Contract 5 K4: the key never prints. With a canary as the secret, no 6-character piece of it shows in the printed
    /// forms, string interpolation, `dump`, or a failing XCTAssertEqual's message.
    func testTheSecretIsNeverPrinted() {
        let letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
        let canary = "sk-ant-test-" + String((0..<24).map { _ in letters.randomElement()! })
        let intent = Intent.coachHomeSetKey(secret: canary)
        func pieces(_ s: String) -> [String] {
            let c = Array(s)
            return (0...(c.count - 6)).map { String(c[$0..<$0 + 6]) }
        }
        let secretPart = String(canary.dropFirst("sk-ant-test-".count))
        func leaks(_ text: String) -> [String] { pieces(secretPart).filter { text.contains($0) } }
        var dumped = ""
        dump(intent, to: &dumped)
        let printed = [intent.description, intent.debugDescription, "\(intent)", String(describing: intent), String(reflecting: intent), dumped,
                       "\([intent])", "\(Optional(intent) as Any)"]
        for p in printed { XCTAssertEqual(leaks(p), [], p) }
        XCTAssertTrue(intent.description.contains("•••"), intent.description)
        XCTAssertTrue(intent.description.hasPrefix("coachHome.setKey"), intent.description)
        XCTAssertEqual(intent.arguments["secret"], .string(canary), "the page still receives it whole")
        // a failing assertion built from it
        var messages: [String] = []
        let options = XCTExpectedFailure.Options()
        options.issueMatcher = { issue in
            messages.append(issue.compactDescription + " " + (issue.detailedDescription ?? ""))
            return true
        }
        XCTExpectFailure("an assertion comparing two keys fails on purpose", options: options) {
            XCTAssertEqual(intent, Intent.coachHomeSetKey(secret: canary + "x"))
        }
        XCTAssertEqual(messages.count, 1)
        for m in messages {
            XCTAssertEqual(leaks(m), [], m)
            XCTAssertTrue(m.contains("•••"), m)
        }
        // another intent prints its arguments as they are
        XCTAssertEqual(Intent.coachKeep(id: "m14").description, #"coach.keep {"id":"m14"}"#)
        XCTAssertEqual(Intent.ping.description, "ping")
    }
}
