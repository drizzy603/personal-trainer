import Foundation
import XCTest
import FPCore

/// CoachHomeModel v1 (contract 6.2): the hand-made fixtures of Tools/coach-home-fixtures.js and the decoder's
/// rules. The page-built files (P6's tests/golden/dump-coach-home.js) join Fixtures/coachHome later; the first
/// test decodes whatever is there.
final class CoachHomeModelTests: XCTestCase {
    private func model(_ name: String) throws -> CoachHomeModel {
        try CoachHomeModel.decode(utf8: FixtureFiles.data("coachHome/\(name).json"))
    }

    private func decode(_ json: JSONValue) throws -> CoachHomeModel { try CoachHomeModel(json: json) }

    /// Every file decodes, from bytes and from text alike; only the file named for it holds a lone surrogate.
    func testEveryCoachHomeFixtureDecodes() throws {
        let files = FixtureFiles.files(in: "coachHome")
        XCTAssertGreaterThanOrEqual(files.count, 3)
        for url in files {
            let name = url.lastPathComponent
            let data = try Data(contentsOf: url)
            let fromBytes = try CoachHomeModel.decode(utf8: data)
            let fromText = try CoachHomeModel.decode(String(decoding: data, as: UTF8.self))
            XCTAssertEqual(fromBytes, fromText, name)
            XCTAssertEqual(fromBytes.v, CoachHomeModel.version, name)
            if !name.hasPrefix("lone-surrogates") {
                XCTAssertEqual(JSONText.loneSurrogates(in: String(decoding: data, as: UTF8.self)), 0, "\(name) is not what _nativeJSON writes")
            }
            for g in fromBytes.groups {
                XCTAssertFalse(g.rows.isEmpty, "\(name): a group with no rows is dropped")
                for r in g.rows { XCTAssertFalse(r.title.isEmpty, "\(name): a row with no title is dropped") }
            }
        }
    }

    /// `{"v":1}`: every compiled default.
    func testMinimalGivesEveryDefault() throws {
        let m = try model("minimal")
        XCTAssertEqual(m.v, 1)
        XCTAssertEqual(m.rev, 0)
        XCTAssertEqual(m.boot, "")
        XCTAssertEqual(m.room, .heavyweight)
        XCTAssertTrue(m.paper)
        XCTAssertEqual(m.appearance, .light)
        XCTAssertTrue(m.dynTypeOn)
        XCTAssertEqual(m.tokens, Tokens.defaults(for: .heavyweight))
        XCTAssertEqual(m.route, .hub, "no route and no connect: the hub")
        XCTAssertFalse(m.resume)
        XCTAssertEqual(m.meta.label, "")
        XCTAssertNil(m.meta.avatar)
        XCTAssertEqual([m.hero.greet, m.hero.title, m.hero.accent, m.hero.body], ["", "", "", ""])
        XCTAssertNil(m.connect)
        XCTAssertEqual(m.groups, [])
        XCTAssertEqual(m.skipped, 0)
    }

    /// What a newer page may add decodes; what this build cannot draw is left out and counted.
    func testForwardCompatibility() throws {
        let m = try model("forward-compat")
        XCTAssertEqual(m.rev, 7)
        XCTAssertEqual(m.boot, "b1760000800000-ab01")
        XCTAssertFalse(m.dynTypeOn)
        XCTAssertEqual(m.route, .other("upsell"), "a newer page's route: drawn with the hub's layout")
        XCTAssertTrue(m.resume)
        XCTAssertEqual(m.meta.label, "COACH · PRO")
        XCTAssertEqual(m.meta.avatar, "K")
        XCTAssertEqual(m.hero.accent, "goes pro.")
        // tokens: the bad colour named, the override applied, a newer page's size and group kept or ignored
        XCTAssertEqual(m.tokens.rejected, ["color.bg"])
        XCTAssertEqual(m.tokens.color(.bg).css, "#f7f5ef", "an unreadable colour keeps the room's default")
        XCTAssertEqual(m.tokens.color(.accent).css, "#ff7a00")
        XCTAssertEqual(m.tokens.colors["glow"]?.css, "#ffffff")
        XCTAssertEqual(m.tokens.size(.homeTitle), 70)
        XCTAssertEqual(m.tokens.size(.homeGreet), 15)
        XCTAssertEqual(m.tokens.sizes["homeBadge"], 8, "a newer page's size is kept for a newer view")
        // the connect block draws under the other route; its CTA is the page's
        let c = try XCTUnwrap(m.connect)
        XCTAssertEqual(c.cta, .init(label: "UPGRADE", title: "Unlock coaching"))
        XCTAssertNil(c.starter)
        XCTAssertEqual(c.help.components(separatedBy: "\n").count, 2, "two paragraphs, one \\n")
        // rows: an unknown do, a row with no title, a group emptied by its unknown row, a group that is not an
        // object: 5 left out
        XCTAssertEqual(m.groups.map(\.head), ["Conversation", "Account"])
        XCTAssertEqual(m.groups[0].rows.map(\.action), [.openChat, .startIntake])
        XCTAssertEqual(m.groups[0].rows.map(\.icon), [.chat, nil], "an unknown icon draws none")
        XCTAssertEqual(m.groups[0].rows[0].sub, "3 exchanges · Push day went well")
        XCTAssertEqual(m.groups[1].rows.map(\.action), [.disconnect])
        XCTAssertNil(m.groups[1].rows[0].sub)
        XCTAssertEqual(m.skipped, 5)
    }

    /// An older page that skipped _nativeJSON: its half emoji are mended away before decoding.
    func testLoneSurrogatesAreMended() throws {
        let text = try FixtureFiles.text("coachHome/lone-surrogates.json")
        XCTAssertEqual(JSONText.loneSurrogates(in: text), 3)
        let m = try model("lone-surrogates")
        XCTAssertEqual(m.room, .lime)
        XCTAssertFalse(m.paper)
        XCTAssertEqual(m.appearance, .dark)
        XCTAssertEqual(m.hero.greet, "Hi Kalani .")
        XCTAssertEqual(m.hero.title, "Coach ")
        XCTAssertEqual(m.groups.first?.rows.first?.sub, "3 exchanges · Push day went well ")
        XCTAssertEqual(m.tokens.size(.homeTitle), 56)
        XCTAssertEqual(m.tokens.rejected, [])
        for s in [m.hero.greet, m.hero.title, m.groups[0].rows[0].sub ?? ""] {
            XCTAssertEqual(JSONText.loneSurrogates(in: s), 0)
        }
    }

    func testVersionAndShapeAreRequired() {
        for bad: JSONValue in [["v": 0], ["v": 2], ["rev": 3], ["v": "1"]] {
            XCTAssertThrowsError(try decode(bad)) { error in
                guard case CoachHomeModel.DecodeError.version = error else { return XCTFail("\(bad): \(error)") }
            }
        }
        XCTAssertThrowsError(try CoachHomeModel.decode("[1]")) { XCTAssertEqual($0 as? CoachHomeModel.DecodeError, .notAnObject) }
        XCTAssertThrowsError(try CoachHomeModel.decode("\"hub\"")) { XCTAssertEqual($0 as? CoachHomeModel.DecodeError, .notAnObject) }
        XCTAssertThrowsError(try CoachHomeModel.decode("{"), "not JSON at all")
        XCTAssertEqual(CoachHomeModel.DecodeError.version(2).description, "coach home model v2 (this build reads v1)")
        XCTAssertEqual(CoachHomeModel.version, 1, "the model's own version, not the shell contract's")
    }

    /// Route: the page's word, else connect when a connect block is there, else the hub.
    func testRoute() throws {
        XCTAssertEqual(try decode(["v": 1, "route": "hub"]).route, .hub)
        XCTAssertEqual(try decode(["v": 1, "route": "connect"]).route, .connect)
        XCTAssertEqual(try decode(["v": 1, "connect": [:]]).route, .connect)
        XCTAssertEqual(try decode(["v": 1, "connect": nil]).route, .hub)
        XCTAssertEqual(try decode(["v": 1, "connect": "yes"]).route, .hub, "a connect that is not an object is none")
        XCTAssertNil(try decode(["v": 1, "connect": "yes"]).connect)
        XCTAssertEqual(try decode(["v": 1, "route": "hub", "connect": [:]]).route, .hub, "the page's word wins")
        XCTAssertEqual(try decode(["v": 1, "route": 3, "connect": [:]]).route, .connect, "a route that is not a string is absent")
        XCTAssertEqual(try decode(["v": 1, "route": "settings"]).route, .other("settings"))
        XCTAssertTrue(try decode(["v": 1, "resume": true]).resume)
        XCTAssertFalse(try decode(["v": 1, "resume": "yes"]).resume, "resume is a boolean")
    }

    /// A connect block that leaves a part out draws the web's own words, never an empty control.
    func testConnectDefaultsAreTheWebsWords() throws {
        let c = try XCTUnwrap(try decode(["v": 1, "connect": ["starter": [:]]]).connect)
        XCTAssertEqual(c.label, "Anthropic API Key")
        XCTAssertEqual(c.placeholder, "sk-ant-...")
        XCTAssertEqual(c.cta, .init(label: "CONNECT", title: "Save key & start coaching"))
        XCTAssertEqual(c.help, "")
        XCTAssertEqual(c.starter?.label, "No key? Build a starter plan instead →")
        XCTAssertNil(try decode(["v": 1, "connect": ["starter": nil]]).connect?.starter)
        XCTAssertNil(try decode(["v": 1, "connect": ["starter": "no"]]).connect?.starter)
    }

    /// Rows read their four actions and four icons; anything else about a row is the page's text.
    func testRowsAndGroups() throws {
        let m = try decode(["v": 1, "groups": [
            ["head": "Conversation", "rows": [
                ["do": "openChat", "title": "Open Chat", "sub": "No messages yet — tap to start", "icon": "chat"],
                ["do": "startIntake", "title": "Build My Programme", "sub": "", "icon": "programme"],
                "a string", ["title": "No action"], ["do": "openChat"]]],
            ["rows": [["do": "clearChat", "title": "Clear Chat History", "icon": "trash"],
                      ["do": "disconnect", "title": "Disconnect", "icon": "disconnect"]]],
            ["head": "Empty", "rows": []],
            ["head": "No rows"],
        ]])
        XCTAssertEqual(m.groups.map(\.head), ["Conversation", ""])
        XCTAssertEqual(m.groups.flatMap(\.rows).map(\.action), [.openChat, .startIntake, .clearChat, .disconnect])
        XCTAssertEqual(m.groups.flatMap(\.rows).map(\.icon), [.chat, .programme, .trash, .disconnect])
        XCTAssertEqual(m.groups[0].rows.map(\.sub), ["No messages yet — tap to start", nil], "an empty sub is none")
        XCTAssertEqual(m.skipped, 5, "three rows and two empty groups")
        XCTAssertEqual(CoachHomeModel.Row.Action.allCases.map(\.rawValue), ["openChat", "startIntake", "clearChat", "disconnect"])
        XCTAssertEqual(CoachHomeModel.Row.Icon.allCases.map(\.rawValue), ["chat", "programme", "trash", "disconnect"])
        XCTAssertNil(try decode(["v": 1, "meta": ["label": "COACH", "avatar": ""]]).meta.avatar)
    }

    /// The model carries the page's room: Lime by its id, an unknown room by its paper flag.
    func testRoomsAndTokens() throws {
        let lime = try decode(["v": 1, "room": "dark"])
        XCTAssertEqual(lime.room, .lime)
        XCTAssertFalse(lime.paper)
        XCTAssertEqual(lime.tokens.size(.homeTitle), 56)
        XCTAssertEqual(lime.tokens.size(.body), 15, "the chat's sizes are there too")
        let ocean = try decode(["v": 1, "room": "ocean", "paper": false])
        XCTAssertEqual(ocean.room, .other("ocean"))
        XCTAssertEqual(ocean.tokens.color(.bg).css, "#0b0b0c")
        XCTAssertEqual(ocean.tokens.size(.homeGreet), 14)
        XCTAssertEqual(try decode(["v": 1, "tokens": ["type": ["homeTitle": 999]]]).tokens.rejected, ["type.homeTitle"])
    }

    /// A model of about 4 KB decodes well inside a frame.
    func testA4KBModelDecodesQuickly() throws {
        var rows: [JSONValue] = []
        for i in 0 ..< 24 {
            rows.append(["do": "openChat", "title": .string("Open Chat \(i)"),
                         "sub": .string("\(i) exchanges · " + String(repeating: "Push day went well ", count: 3)), "icon": "chat"])
        }
        let base = try FixtureFiles.json("coachHome/forward-compat.json")
        var o = base.object!
        o["groups"] = .array([["head": "Conversation", "rows": .array(rows)]])
        let data = Data(JSONValue.object(o).jsonText.utf8)
        XCTAssertGreaterThan(data.count, 4_000)
        let start = Date()
        var m: CoachHomeModel?
        for _ in 0 ..< 10 { m = try CoachHomeModel.decode(utf8: data) }
        let each = Date().timeIntervalSince(start) / 10
        XCTAssertEqual(m?.groups.first?.rows.count, 24)
        // GitHub's shared Macs are several times slower and stall at random (CoachModelTests' slack)
        let slack: Double = ProcessInfo.processInfo.environment["CI"] == nil ? 1 : 10
        XCTAssertLessThan(each, 0.016 * slack, "a hub model decodes well inside a frame on the Mac (\(each) s)")
    }

    // MARK: The intent map (N6)

    /// A canary shaped like a key (`sk-ant-test-` and 24 random letters), never a real one (contract 5 K8).
    private func canary() -> String {
        "sk-ant-test-" + String((0..<24).map { _ in "abcdefghijklmnopqrstuvwxyz".randomElement()! })
    }

    /// Each row action sends `coachHome.<do>` with no arguments; the piece is `coachHome`.
    func testRowActionsMapToTheirIntents() {
        let names: [CoachHomeModel.Row.Action: String] = [
            .openChat: "coachHome.openChat", .startIntake: "coachHome.startIntake",
            .clearChat: "coachHome.clearChat", .disconnect: "coachHome.disconnect",
        ]
        XCTAssertEqual(Set(names.keys), Set(CoachHomeModel.Row.Action.allCases))
        for (action, name) in names {
            XCTAssertEqual(action.intent.name, name)
            XCTAssertEqual(action.intent.name, "coachHome." + action.rawValue, "do maps to coachHome.<do>")
            XCTAssertEqual(action.intent.arguments, [:])
            XCTAssertEqual(action.intent.screen, "coachHome")
            XCTAssertNotNil(IntentSignature.named(name), "\(name) is in intents.json's list")
        }
    }

    /// The CTA builds `coachHome.setKey` whose only argument is `secret`; the starter link `coachHome.openStarter`.
    func testConnectMapsToSetKeyAndOpenStarter() throws {
        let c = try XCTUnwrap(try decode(["v": 1, "connect": ["starter": [:]]]).connect)
        let key = canary()
        let set = c.setKey(secret: key)
        XCTAssertEqual(set.name, "coachHome.setKey")
        XCTAssertEqual(set.arguments, ["secret": .string(key)], "the argument is named secret, never key")
        XCTAssertEqual(set.screen, "coachHome")
        XCTAssertEqual(try Intent(name: set.name, arguments: set.arguments), set, "round-trips")
        XCTAssertEqual(c.openStarter.name, "coachHome.openStarter")
        XCTAssertEqual(c.openStarter.arguments, [:])
        XCTAssertEqual(c.openStarter.screen, "coachHome")
    }

    /// Where N builds the setKey intent, its printed forms hold no 6-character piece of the key (H1's redaction).
    func testTheMapsSetKeyNeverPrintsTheKey() throws {
        let c = try XCTUnwrap(try decode(["v": 1, "connect": [:]]).connect)
        let key = canary()
        let set = c.setKey(secret: key)
        var dumped = ""
        dump(set, to: &dumped)
        let printed = ["\(set)", String(describing: set), String(reflecting: set), dumped]
        let chars = Array(key)
        for p in printed {
            for i in 0...(chars.count - 6) {
                let piece = String(chars[i..<(i + 6)])
                XCTAssertFalse(p.contains(piece), "a printed form holds '\(piece)'")
            }
        }
    }
}
