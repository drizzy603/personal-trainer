import Foundation
import XCTest
import FPCore

final class CoachModelTests: XCTestCase {
    private func model(_ name: String) throws -> CoachModel {
        try CoachModel.decode(utf8: FixtureFiles.data("coach/\(name).json"))
    }

    private func looks(_ m: CoachModel) -> [String] {
        m.messages.map {
            switch $0.look {
            case .seed: return "seed"
            case .bubble: return "bubble"
            case .reply: return "reply"
            case .note(let error): return error ? "error" : "note"
            }
        }
    }

    /// The acceptance check of C4: every golden fixture decodes (from bytes and from text alike).
    func testEveryCoachFixtureDecodes() throws {
        let files = FixtureFiles.files(in: "coach")
        XCTAssertGreaterThanOrEqual(files.count, 10)
        for url in files {
            let name = url.lastPathComponent
            let data = try Data(contentsOf: url)
            let fromBytes = try CoachModel.decode(utf8: data)
            let fromText = try CoachModel.decode(String(decoding: data, as: UTF8.self))
            XCTAssertEqual(fromBytes, fromText, name)
            XCTAssertEqual(fromBytes.v, 1, name)
            if !name.hasPrefix("lone-surrogates") {
                XCTAssertEqual(JSONText.loneSurrogates(in: String(decoding: data, as: UTF8.self)), 0, "\(name) is not what _nativeJSON writes")
            }
            for m in fromBytes.messages where m.role != .user {
                if case .coach(let sections, _) = m.body, sections.isEmpty { XCTFail("\(name) \(m.id): an empty %% reply") }
            }
        }
    }

    /// The page's own model (tests/golden/dump-coach.js): a day of chat in Heavyweight.
    func testHeavyweightChat() throws {
        let m = try model("heavyweight-chat")
        XCTAssertEqual(m.rev, 42)
        XCTAssertEqual(m.boot, "b1791561600000-c3")
        XCTAssertEqual(m.room, .heavyweight)
        XCTAssertTrue(m.paper)
        XCTAssertEqual(m.appearance, .light)
        XCTAssertTrue(m.dynTypeOn)
        XCTAssertEqual(m.tokens.rejected, [])
        XCTAssertEqual(m.header.eyebrow, "COACH · ONLINE")
        XCTAssertEqual(m.header.status, .online)
        XCTAssertEqual(m.header.title, "Today's plan")
        XCTAssertEqual(m.header.meta, "WK 06 · DAY 5")
        XCTAssertTrue(m.header.back)
        XCTAssertFalse(m.header.cancel)
        // the owner's initial, as the web header's .screen-avatar draws it (review 4: the native header had none)
        XCTAssertEqual(m.header.avatar, "R")
        let sw = try XCTUnwrap(m.header.model)
        XCTAssertEqual([sw.label, sw.name, sw.version, sw.next, sw.a11y], ["Sonnet 5.5", "Sonnet", "5.5", "claude-haiku-4-5-20251001", "Coach model: Sonnet 5.5. Switch to Haiku 4.5"])
        XCTAssertEqual(sw.intent, .coachModel(model: "claude-haiku-4-5-20251001"))
        XCTAssertNil(m.empty)
        XCTAssertEqual(looks(m), ["bubble", "reply", "seed", "reply", "bubble", "reply", "bubble", "reply", "bubble", "reply", "bubble", "error"])
        XCTAssertEqual(m.messages.map(\.id), (1...12).map { "m\($0).g" }, "the page's ids: m<n>.<the boot's tag>")
        XCTAssertEqual(m.messages[0].day, "Yesterday")
        XCTAssertEqual(m.messages[0].at, Date(timeIntervalSince1970: 1_791_482_520), "2026-10-08 18:02 UTC, from milliseconds")
        XCTAssertEqual(m.messages[2].seed, "Plateau check")
        XCTAssertEqual(m.messages[2].day, "Today")
        XCTAssertEqual(m.messages[2].body, .text("Plateau check"), "the app's prompt reads as its label")
        XCTAssertEqual(m.messages[1].eyebrow, "COACH · Run analysis")
        XCTAssertEqual(m.messages[1].body.actions, [], "an older reply shows no chips")
        XCTAssertEqual(m.messages[3].eyebrow, "COACH")
        XCTAssertEqual(m.messages[3].body.actions, [], "the lists reply has no chips")
        XCTAssertEqual(m.messages[4].image, MessageImage(key: nil), "a photo from before a relaunch: Photo")
        XCTAssertEqual(m.messages[4].body, .text(""), "a photo sent with no words")
        let tool = m.messages[7]
        XCTAssertEqual(tool.pills.map(\.label), ["Bench Press → 170 lb", "Bench goal 200 lb", "Not applied · Squat goal 315 lb"])
        XCTAssertEqual(tool.pills.map(\.ok), [true, true, false])
        let ledger = try XCTUnwrap(tool.ledger)
        XCTAssertEqual(ledger.head, "PLAN CHANGES · WEEK 6")
        XCTAssertEqual(ledger.rows.map(\.label), ["Bench Press", "Bench goal"])
        XCTAssertEqual(ledger.rows.map(\.value), ["160 → 170 lb", "→ 200 lb"])
        XCTAssertEqual(ledger.rows.map(\.kind), [.plan, .goal])
        XCTAssertTrue(ledger.canUndo)
        XCTAssertEqual(ledger.actions.map { $0.intent(messageID: tool.id) }, [.coachUndo(id: "m8.g"), .coachKeep(id: "m8.g")])
        XCTAssertEqual(ledger.actions.map(\.tone), [.neutral, .primary])
        guard case .markdown(let tableBlocks) = m.messages[9].body, case .table(let rows) = tableBlocks[1] else { return XCTFail("the table reply") }
        XCTAssertEqual(rows.count, 4)
        let last = m.messages[11]
        XCTAssertTrue(last.local)
        XCTAssertTrue(last.error)
        XCTAssertEqual(last.chip?.label, "Try again")
        XCTAssertEqual(last.chip?.intent(messageID: last.id), .coachRetry)
        XCTAssertEqual(m.speech, Speech(id: "s1", text: "Could not connect. Check your internet connection."))
        XCTAssertEqual(m.composer.placeholder, "Message Coach…")
        XCTAssertEqual(m.composer.short, "Message…")
        XCTAssertTrue(m.composer.attach)
        XCTAssertEqual(m.message(id: "m8.g")?.ledger, ledger)
        XCTAssertNil(m.message(id: ""))
    }

    /// The models carry the page's THEMES: the compiled defaults must agree with them, colour for colour.
    func testCompiledPaletteMatchesThePageThemes() throws {
        for (file, defaults) in [("heavyweight-chat", Tokens.heavyweight), ("lime-chat", Tokens.lime)] {
            let colors = try XCTUnwrap(FixtureFiles.json("coach/\(file).json")["tokens"]?["color"]?.object)
            var checked = 0
            for (key, value) in colors {
                guard let token = ColorToken(rawValue: key) else { XCTFail("\(file): \(key) is not a token"); continue }
                XCTAssertEqual(RGBA(css: value.string ?? ""), defaults.color(token), "\(file) \(key)")
                checked += 1
            }
            XCTAssertGreaterThan(checked, 30, file)
        }
    }

    /// The page sends the whole scale (type, space, radii, fonts) with every model: the compiled
    /// defaults must agree with it, so a model without tokens draws the same chat.
    func testCompiledScaleMatchesThePage() throws {
        for (file, defaults) in [("heavyweight-chat", Tokens.heavyweight), ("lime-chat", Tokens.lime)] {
            let tokens = try FixtureFiles.json("coach/\(file).json")["tokens"]
            let type = try XCTUnwrap(tokens?["type"]?.object), space = try XCTUnwrap(tokens?["space"]?.object)
            let radius = try XCTUnwrap(tokens?["radius"]?.object), font = try XCTUnwrap(tokens?["font"]?.object)
            XCTAssertEqual(Set(type.keys), Set(TypeToken.allCases.map(\.rawValue)), file)
            XCTAssertEqual(Set(space.keys), Set(SpaceToken.allCases.map(\.rawValue)), file)
            XCTAssertEqual(Set(radius.keys), Set(RadiusToken.allCases.map(\.rawValue)), file)
            XCTAssertEqual(Set(font.keys), Set(FontToken.allCases.map(\.rawValue)), file)
            for t in TypeToken.allCases { XCTAssertEqual(type[t.rawValue]?.double, defaults.size(t), "\(file) type.\(t.rawValue)") }
            for t in SpaceToken.allCases { XCTAssertEqual(space[t.rawValue]?.double, defaults.space(t), "\(file) space.\(t.rawValue)") }
            for t in RadiusToken.allCases { XCTAssertEqual(radius[t.rawValue]?.double, defaults.radius(t), "\(file) radius.\(t.rawValue)") }
            for t in FontToken.allCases { XCTAssertEqual(font[t.rawValue]?.string, defaults.font(t), "\(file) font.\(t.rawValue)") }
        }
    }

    func testLimeChat() throws {
        let m = try model("lime-chat")
        XCTAssertEqual(m.room, .lime)
        XCTAssertFalse(m.paper)
        XCTAssertEqual(m.appearance, .dark)
        XCTAssertEqual(m.tokens.color(.accent).css, "#d8ff63")
        XCTAssertEqual(m.tokens.size(.body), 15)
        XCTAssertEqual(m.tokens.font(.body), "Inter")
        XCTAssertEqual(m.tokens.radius(.composer), 20, "Lime's rounder composer")
        let ledger = try XCTUnwrap(m.messages[7].ledger)
        XCTAssertFalse(ledger.canUndo, "a later edit took the undo point")
        XCTAssertEqual(ledger.note, "Applied to your programme. It cannot be undone here any more.")
        XCTAssertEqual(ledger.actions.map(\.label), ["Got it"])
        XCTAssertEqual(ledger.actions.first?.intent(messageID: "m8.g"), .coachKeep(id: "m8.g"), "Got it retires the card like Keep")
        let last = try XCTUnwrap(m.messages.last)
        XCTAssertEqual(last.errorKind, .key)
        XCTAssertEqual(last.chip?.label, "Open Settings")
        XCTAssertEqual(last.chip?.intent(messageID: last.id), .coachOpenSettings)
    }

    func testIntake() throws {
        let m = try model("intake")
        XCTAssertTrue(m.intake)
        XCTAssertTrue(m.loading)
        XCTAssertFalse(m.dynTypeOn)
        XCTAssertEqual(m.header.status, .intake)
        XCTAssertEqual(m.header.eyebrow, "COACH · INTAKE")
        XCTAssertEqual(m.header.title, "Build your plan")
        XCTAssertNil(m.header.model, "no model switch during setup")
        XCTAssertNil(m.header.meta)
        XCTAssertFalse(m.header.back, "Back did nothing during setup: Cancel is the way out")
        XCTAssertTrue(m.header.cancel)
        XCTAssertNil(m.empty, "setup has no empty state")
        XCTAssertEqual(m.messages.first?.look, .seed)
        XCTAssertEqual(m.messages.first?.seed, "Programme setup")
        XCTAssertEqual(m.running.map(\.label), ["Weeks 7–8 updated", "Profile updated"])
        XCTAssertEqual(m.composer.placeholder, "Answer the Coach…")
        XCTAssertEqual(m.composer.short, "Answer…")
        XCTAssertFalse(m.composer.attach)
        XCTAssertEqual(m.speech?.text, "Coach is thinking")
    }

    func testEmptyChat() throws {
        let m = try model("empty")
        XCTAssertEqual(m.messages, [])
        XCTAssertEqual(m.room, .lime)
        let empty = try XCTUnwrap(m.empty)
        XCTAssertEqual(empty.title, "Ask anything")
        XCTAssertEqual(empty.sub, "Your training, recovery, and goals")
        XCTAssertEqual(empty.chips, ["What should I focus on this week?", "Am I progressing on track?", "How is my recovery looking?", "Any trends in my training data?"])
        let prog = try XCTUnwrap(empty.programme)
        XCTAssertEqual(prog.label, "Custom programme active")
        XCTAssertEqual(prog.actions.map { $0.intent(messageID: nil) }, [.coachRestorePrevious, .coachRegenerate])
        XCTAssertEqual(m.composer.image, ComposerImage(key: "p1.b1791561600000-c3"))
        XCTAssertEqual(m.composer.draft, Draft(text: "Build my Legs day around the trap bar", nonce: "d2.b1791561600000-c3"))
        XCTAssertEqual(m.header.meta, "WK 06 · DAY 5")
        XCTAssertNil(m.speech)
    }

    func testErrorsStopsAndNotes() throws {
        let m = try model("errors")
        XCTAssertEqual(m.header.status, .offline)
        XCTAssertEqual(m.header.eyebrow, "COACH · OFFLINE")
        XCTAssertEqual(looks(m), ["bubble", "error", "bubble", "note", "bubble", "note", "bubble", "error"])
        XCTAssertEqual(m.messages[1].errorKind, .billing)
        XCTAssertNil(m.messages[1].chip, "out of credit: no chip")
        XCTAssertTrue(m.messages[3].stopped)
        XCTAssertNil(m.messages[3].chip, "only the trailing note has a chip")
        XCTAssertEqual(m.messages[5].pills.map(\.label), ["Weeks 7–8 updated"])
        XCTAssertEqual(m.messages[5].ledger?.canUndo, true, "a stop keeps the changes made before it, with their Undo")
        XCTAssertEqual(m.messages[7].chip?.intent(messageID: "m8.g"), .coachRetry)
    }

    func testLoadingShowsRunningPills() throws {
        let m = try model("loading")
        XCTAssertTrue(m.loading)
        XCTAssertEqual(m.header.status, .replying)
        XCTAssertEqual(m.running.map(\.label), ["Fri ⇄ Sat · this week"])
        XCTAssertEqual(m.messages[0].seed, "Weekly review")
        XCTAssertEqual(m.messages[1].body.actions, [], "no chips while a reply is in flight")
    }

    func testSixtyMessagesDecodeQuickly() throws {
        let data = try FixtureFiles.data("coach/sixty.json")
        let compact = try JSONSerialization.data(withJSONObject: JSONSerialization.jsonObject(with: data))
        XCTAssertLessThan(compact.count, 40_000, "about 22 KB for 60 messages in the plan; this one carries every block")
        let start = Date()
        var m: CoachModel?
        for _ in 0 ..< 10 { m = try CoachModel.decode(utf8: compact) }
        let each = Date().timeIntervalSince(start) / 10
        XCTAssertEqual(m?.messages.count, 60)
        XCTAssertEqual(Set(m?.messages.map(\.id) ?? []).count, 60, "ids are unique")
        XCTAssertNotNil(m?.messages.last?.ledger)
        // GitHub's shared Macs are several times slower and stall at random (GitHub Actions sets CI; xcodebuild hands
        // TEST_RUNNER_CI to a simulator's test process as CI): there the bound only catches a collapse.
        let slack: Double = ProcessInfo.processInfo.environment["CI"] == nil ? 1 : 10
        XCTAssertLessThan(each, 0.25 * slack, "a model decodes well inside a frame budget on the Mac (\(each) s)")
    }

    /// What a newer page may add decodes, and anything unknown draws as text.
    func testForwardCompatibility() throws {
        let m = try model("forward-compat")
        XCTAssertEqual(m.room, .other("ocean"))
        XCTAssertFalse(m.paper)
        XCTAssertEqual(m.appearance, .dark)
        XCTAssertEqual(m.tokens.color(.accent).css, "#ff7a00")
        XCTAssertEqual(m.tokens.color(.bg).css, "#0b0b0c", "an unreadable colour keeps the (dark) default")
        XCTAssertEqual(m.tokens.colors["glow"]?.css, "#ffffff")
        XCTAssertEqual(m.tokens.size(.body), 17)
        XCTAssertEqual(m.tokens.rejected.sorted(), ["color.bg", "type.huge"])
        XCTAssertEqual(m.header.status, .other("thinking"))
        XCTAssertEqual(m.header.model?.name, "Opus")
        XCTAssertEqual(m.header.model?.version, "5")
        XCTAssertEqual(m.skipped, 1, "a message that is not an object is left out")
        XCTAssertEqual(m.messages.count, 4)
        let rich = m.messages[1]
        guard case .coach(let sections, let actions) = rich.body else { return XCTFail("\(rich.body)") }
        guard case .unknown(let chart) = sections[0] else { return XCTFail("chart") }
        XCTAssertEqual(chart.text, "Volume up 4% over four weeks")
        guard case .markdown(let blocks) = sections[1], case .unknown(let callout) = blocks[0] else { return XCTFail("callout") }
        XCTAssertEqual(callout.text, "week 8 Deload warn")
        XCTAssertEqual(sections[2], .takeaway([Run("Keep going", bold: true)]))
        XCTAssertEqual(actions, [CoachAction(label: "Show the chart", msg: "Show my volume chart", primary: true)])
        XCTAssertEqual(rich.chip?.kind, .other("upgrade"))
        XCTAssertNil(rich.chip?.intent(messageID: rich.id), "a button this build cannot send is left out")
        XCTAssertEqual(rich.ledger?.rows.first?.kind, .other("note"))
        XCTAssertEqual(rich.ledger?.actions.map(\.label), ["Got it"])
        guard case .unknown(let voice) = m.messages[2].body else { return XCTFail("voice") }
        XCTAssertEqual(voice.text, "A voice reply (0:12)")
        XCTAssertEqual(m.messages[3].role, .other("system"))
        XCTAssertEqual(m.messages[3].look, .note(error: true))
        XCTAssertEqual(m.messages[3].errorKind, .other("quota"))
        XCTAssertEqual(m.speech, Speech(id: "Coach: What is new?", text: "Coach: What is new?"))
    }

    /// An older page that skipped _nativeJSON: Foundation refuses the text; mending first loses only
    /// the halves.
    func testLoneSurrogatesAreMendedBeforeDecoding() throws {
        let text = try FixtureFiles.text("coach/lone-surrogates.json")
        XCTAssertGreaterThan(JSONText.loneSurrogates(in: text), 5)
        XCTAssertThrowsError(try JSONSerialization.jsonObject(with: Data(text.utf8)))
        let m = try CoachModel.decode(text)
        XCTAssertEqual(m.header.title, "Today's plan ")
        XCTAssertEqual(m.messages[0].body, .text("Strong week "))
        XCTAssertEqual(m.messages[1].body.plainText, "Great work on the bench.")
        XCTAssertEqual(m.messages[2].pills.first?.label, "Bench ")
        XCTAssertEqual(m.composer.draft?.text, "half ")
        XCTAssertEqual(m.speech?.text, "Coach: Great work ")
    }

    func testMinimalModelTakesTheDefaults() throws {
        let m = try model("minimal")
        XCTAssertEqual(m.room, .heavyweight)
        XCTAssertEqual(m.appearance, .light)
        XCTAssertTrue(m.dynTypeOn)
        XCTAssertFalse(m.intake)
        XCTAssertEqual(m.rev, 0)
        XCTAssertEqual(m.tokens, Tokens.defaults(for: .heavyweight))
        XCTAssertEqual(m.header.eyebrow, "COACH \u{B7} ONLINE")
        XCTAssertTrue(m.header.back)
        XCTAssertNil(m.header.model)
        XCTAssertNil(m.header.avatar, "a page that sends no initial: the header draws none")
        XCTAssertEqual(m.composer.placeholder, "Message Coach\u{2026}")
        XCTAssertTrue(m.composer.attach)
        XCTAssertEqual(m.messages, [])
        XCTAssertNil(m.empty)
        XCTAssertNil(m.speech)
        // a Lime model without paper is dark; intake without a header shows Cancel
        let lime = try CoachModel(json: ["v": 1, "room": "dark", "intake": true])
        XCTAssertEqual(lime.appearance, .dark)
        XCTAssertTrue(lime.header.cancel)
        XCTAssertFalse(lime.header.back)
        XCTAssertEqual(lime.composer.placeholder, "Answer the Coach\u{2026}")
        XCTAssertFalse(lime.composer.attach)
    }

    func testVersionAndShapeAreRequired() {
        XCTAssertThrowsError(try CoachModel(json: ["v": 2])) { XCTAssertEqual($0 as? CoachModel.DecodeError, .version(2)) }
        XCTAssertThrowsError(try CoachModel(json: [:])) { XCTAssertEqual($0 as? CoachModel.DecodeError, .version(nil)) }
        XCTAssertThrowsError(try CoachModel(json: [1])) { XCTAssertEqual($0 as? CoachModel.DecodeError, .notAnObject) }
        XCTAssertThrowsError(try CoachModel.decode("{\"v\":1,")) { e in
            guard case JSONText.Failure.notJSON = e else { return XCTFail("\(e)") }
        }
    }

    /// The echo Swift draws of the owner's words on their way (plan task C7): a bubble like the page's own, every field
    /// it does not give as a message with no such field decodes.
    func testAMessageBuiltInSwiftIsTheOwnersBubble() throws {
        let at = Date(timeIntervalSince1970: 1_791_482_520)
        let echo = Message(id: "echo-n1", role: .user, at: at, day: "Today", body: .text("How did my week go?"), image: MessageImage(key: "n:n1"))
        XCTAssertEqual(echo.look, .bubble)
        XCTAssertEqual([echo.id, echo.day], ["echo-n1", "Today"])
        XCTAssertEqual(echo.at, at)
        XCTAssertEqual(echo.image?.key, "n:n1")
        let decoded = try CoachModel(json: ["v": 1, "messages": [["id": "echo-n1", "role": "user", "at": 1_791_482_520_000, "day": "Today",
                                                                    "body": "How did my week go?", "image": ["key": "n:n1"]]]])
        XCTAssertEqual(decoded.messages, [echo], "the same message the page's model would carry")
    }

    func testActionsMapToIntents() {
        XCTAssertEqual(ModelAction.Kind("gotIt"), .keep)
        XCTAssertEqual(ModelAction.Kind("openSettings"), .settings)
        XCTAssertEqual(ModelAction.Kind("dance"), .other("dance"))
        XCTAssertNil(ModelAction(kind: .undo, label: "Undo", tone: .neutral).intent(messageID: nil), "undo needs its message")
        XCTAssertNil(ModelAction(kind: .keep, label: "Keep", tone: .primary).intent(messageID: ""))
        XCTAssertEqual(ModelAction(kind: .regenerate, label: "Reset", tone: .plain).intent(messageID: nil), .coachRegenerate)
    }
}
