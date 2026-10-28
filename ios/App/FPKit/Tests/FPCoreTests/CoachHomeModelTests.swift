import Foundation
import XCTest
import FPCore

/// CoachHomeModel v1 (contract 6.2): the hand-made fixtures of Tools/coach-home-fixtures.js and the decoder's
/// rules, the row and connect intent map (N6), and the eight files the page builds itself (P6's
/// tests/golden/dump-coach-home.js), read against the web's own rules (N13). The first test decodes every file.
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
        // every other hub size the file sends is Heavyweight's compiled one (Tools/coach-home-fixtures.js's table and
        // Tokens.swift held in step; the group head and CTA label at 10 in this room)
        for t in TypeToken.home where t != .homeTitle {
            XCTAssertEqual(m.tokens.size(t), Tokens.heavyweight.size(t), "forward-compat \(t.rawValue)")
        }
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
        for t in TypeToken.home {
            XCTAssertEqual(m.tokens.size(t), Tokens.lime.size(t), "lone-surrogates \(t.rawValue): Lime's compiled size")
        }
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

    // MARK: The page-built fixtures (N13)

    /// The files Tools/coach-home-fixtures.js writes by hand; every other file in Fixtures/coachHome is the page's own.
    private static let handMade: Set<String> = ["forward-compat", "minimal", "lone-surrogates"]

    /// Every page-built file by name: the eight this file describes and any other the dump writes. The dump and its
    /// files are P's (contract 15.1, D30), so a state a P-fix adds is read by every case that needs no state before N
    /// describes it here.
    private func pageBuilt() -> [String] {
        FixtureFiles.files(in: "coachHome").map { $0.deletingPathExtension().lastPathComponent }.filter { !Self.handMade.contains($0) }
    }

    /// The web's own words on the hub and the connect screen (renderCoach before build 61, index.html at 91708ae,
    /// 21097-21121 and 21147-21212; the page builds both screens from one model since P6, _coachHomeScreen).
    private enum Web {
        static let connectBody = "Plug in your Claude API key and the coach can talk through sessions, build a custom programme, and react to what you log."
        static let emptyBody = "Your coach is wired in. Ask about today's session, your form, your programme — anything from your data is fair game."
        static let help = [
            "Get a key from your Anthropic account: console.anthropic.com → API Keys → Create key, then paste it here.",
            "Anthropic bills usage to your own account — typically a few cents per chat. A Claude subscription does not include API access.",
        ]
        static let starter = "No key? Build a starter plan instead →"
        static let replying = "Coach is replying…"
        static let noMessages = "No messages yet — tap to start"

        /// "1 exchange", "2 exchanges": the hero's body and Open Chat's sub count ceil(messages / 2).
        static func exchanges(_ messages: Int) -> String {
            let n = (messages + 1) / 2
            return "\(n) exchange" + (n == 1 ? "" : "s")
        }
    }

    /// What the page held when tests/golden/dump-coach-home.js built each file (its SCENARIOS), as the web's rules
    /// read it: every route, string and row the tests below expect is derived from it by those rules. The dump's fixed
    /// revs and boot are not part of it: they are P6's, and each file is held to its own.
    private struct Scenario {
        var room: Room = .heavyweight
        var dynTypeOn = true
        /// A key saved: the hub; none: the connect screen (even during setup).
        var key = true
        /// The test seed's programme (week 6 of 12, block Build); false: none.
        var programme = true
        /// The owner's first name; nil: none ("Welcome.", the avatar "?").
        var name: String? = "Kalani"
        var messages = 0
        /// The newest message's line as the page cuts it: %% lines dropped, 65 characters, then an ellipsis.
        var preview = ""
        /// A reply in flight.
        var loading = false
        /// Setup running (intakeMode).
        var intake = false
        /// The chat open (coachView 'chat'); false: the hub ('home').
        var chatView = false
    }

    /// hub-history's newest reply up to its 65th character, an emoji: 64 ASCII characters.
    private static let historyCut = "Great work this week: every session done and the squat is moving"

    private static let scenarios: [String: Scenario] = [
        "connect-heavyweight": Scenario(key: false),
        "connect-lime": Scenario(room: .lime, dynTypeOn: false, key: false),
        "connect-starter": Scenario(key: false, programme: false, name: nil),
        "hub-empty": Scenario(),
        "hub-history": Scenario(messages: 4, preview: historyCut + "💪…"),
        // a reply in flight with the hub showing (coachView 'home'): the next tap into Coach shows the hub
        "hub-replying": Scenario(messages: 3, loading: true),
        "hub-programme": Scenario(programme: false, messages: 2, preview: "Four sessions logged."),
        // a key saved and setup persisted with no programme (kt_intake): the page booted in setup, and the hub it
        // builds sits under the setup chat
        "hub-resume": Scenario(programme: false, messages: 2,
                               preview: "How many days a week can you train, and for how long each time?", intake: true),
    ]

    private static func line(_ head: String, _ act: String, _ title: String, _ sub: String?, _ icon: String?) -> String {
        "\(head) › \(act) | \(title) | \(sub ?? "-") | \(icon ?? "-")"
    }

    /// The hub's rows, one line each: "<group head> › <do> | <title> | <sub or -> | <icon or ->".
    private func lines(_ groups: [CoachHomeModel.Group]) -> [String] {
        groups.flatMap { g in g.rows.map { Self.line(g.head, $0.action.rawValue, $0.title, $0.sub, $0.icon?.rawValue) } }
    }

    /// The rows exactly when the web shows them: Open Chat always, its sub by the state; Build My Programme only
    /// without a programme; Clear Chat History only with messages; Disconnect always. The connect screen has none.
    private func expectedRows(_ s: Scenario) -> (heads: [String], lines: [String]) {
        guard s.key else { return ([], []) }
        let sub = s.loading ? Web.replying : s.messages > 0 ? Web.exchanges(s.messages) + " · " + s.preview : Web.noMessages
        var heads = ["Conversation"]
        var rows = [Self.line("Conversation", "openChat", "Open Chat", sub, "chat")]
        if !s.programme {
            heads.append("Programme")
            rows.append(Self.line("Programme", "startIntake", "Build My Programme", "Generate a custom training plan", "programme"))
        }
        heads.append("Account")
        if s.messages > 0 { rows.append(Self.line("Account", "clearChat", "Clear Chat History", nil, "trash")) }
        rows.append(Self.line("Account", "disconnect", "Disconnect", nil, "disconnect"))
        return (heads, rows)
    }

    /// Every string a model hands the views.
    private func texts(_ m: CoachHomeModel) -> [String] {
        var out = [m.meta.label, m.meta.avatar ?? "", m.hero.greet, m.hero.title, m.hero.accent, m.hero.body]
        if let c = m.connect { out += [c.label, c.placeholder, c.cta.label, c.cta.title, c.help, c.starter?.label ?? ""] }
        for g in m.groups {
            out.append(g.head)
            for r in g.rows { out += [r.title, r.sub ?? ""] }
        }
        return out
    }

    /// The eight files dump-coach-home.js writes (contract 6.4, P6) are all there, beside the hand-made three: a missing
    /// one fails here. Another page-built file (a state a P-fix adds) is not refused: the cases that need no state read
    /// it as they read the eight, and the ones derived from a state wait until this file describes it.
    func testPageBuiltFixturesHoldTheEightScenarios() {
        let names = Set(FixtureFiles.files(in: "coachHome").map { $0.deletingPathExtension().lastPathComponent })
        XCTAssertTrue(Self.handMade.isSubset(of: names), "the hand-made fixtures are missing: run Tools/coach-home-fixtures.js")
        XCTAssertEqual(Set(Self.scenarios.keys).subtracting(pageBuilt()).sorted(), [],
                       "page-built files missing: node tests/golden/dump-coach-home.js writes them")
    }

    /// Every page-built file, whatever its state, is the page's whole model: decoded from bytes and from text alike,
    /// v 1, the rev and boot the page sent (a push's rev is above 0, `++_fp.rev`, and the boot is `_fpBoot`, never
    /// empty: a renamed or retyped one decodes to the compiled 0 or "" and fails), nothing skipped or rejected, and
    /// no U+FFFD in any string.
    func testEveryPageBuiltFixtureIsAWholeModel() throws {
        let names = pageBuilt()
        XCTAssertGreaterThanOrEqual(names.count, Self.scenarios.count, "the eight at least")
        for name in names {
            let data = try FixtureFiles.data("coachHome/\(name).json")
            let m = try CoachHomeModel.decode(utf8: data)
            XCTAssertEqual(try CoachHomeModel.decode(String(decoding: data, as: UTF8.self)), m, "\(name): from bytes and from text alike")
            XCTAssertEqual(m.v, 1, name)
            let raw = try JSONText.parse(utf8: data)
            XCTAssertEqual(raw["rev"]?.int, m.rev, "\(name): rev is the page's, a whole number")
            XCTAssertGreaterThan(m.rev, 0, "\(name): a push's rev, never the compiled 0")
            XCTAssertEqual(raw["boot"]?.string, m.boot, "\(name): boot is the page's, a string")
            XCTAssertFalse(m.boot.isEmpty, "\(name): the page's boot, never the compiled empty one")
            XCTAssertEqual(m.skipped, 0, name)
            XCTAssertEqual(m.tokens.rejected, [], name)
            for t in texts(m) {
                XCTAssertFalse(t.unicodeScalars.contains("\u{FFFD}"), "\(name): U+FFFD in \"\(t)\"")
            }
        }
    }

    /// Each of the eight draws what the web draws in its state (contract 6.2): the room, the route, the meta row, the
    /// hero in the web's words, the connect block (the help's two paragraphs joined by one "\n", the starter link only
    /// without a programme, every string the page's own), and the rows exactly when the web shows them.
    func testPageBuiltFixturesDrawWhatTheWebDraws() throws {
        for name in Self.scenarios.keys.sorted() {
            let s = Self.scenarios[name]!
            let data = try FixtureFiles.data("coachHome/\(name).json")
            let m = try CoachHomeModel.decode(utf8: data)
            XCTAssertEqual(m.room, s.room, name)
            XCTAssertEqual(m.paper, s.room == .heavyweight, name)
            XCTAssertEqual(m.appearance, s.room == .heavyweight ? .light : .dark, name)
            XCTAssertEqual(m.dynTypeOn, s.dynTypeOn, name)
            XCTAssertEqual(m.route, s.key ? .hub : .connect, "\(name): the connect screen with no key, else the hub")
            XCTAssertEqual(m.resume, s.key && (s.intake || (s.loading && s.chatView)), "\(name): resume")
            // the meta row: the week (the test seed's 6 of 12) and the programme's block, then the owner's initial
            XCTAssertEqual(m.meta.label, "COACH · WK 06 / 12" + (s.programme ? " · BUILD" : ""), name)
            XCTAssertEqual(m.meta.avatar, s.name.map { String($0.prefix(1)).uppercased() } ?? "?", name)
            // the hero, in the web's words
            XCTAssertEqual(m.hero.greet, s.name.map { "Hi \($0)." } ?? "Welcome.", name)
            XCTAssertEqual(m.hero.title, s.key ? "Coach" : "Connect", name)
            XCTAssertEqual(m.hero.accent, s.key ? "ready." : "your coach.", name)
            let body = !s.key ? Web.connectBody : s.messages > 0
                ? Web.exchanges(s.messages) + " so far. Pick up where you left off, or start a new thread." : Web.emptyBody
            XCTAssertEqual(m.hero.body, body, name)
            // the connect block, on the connect screen only
            if s.key {
                XCTAssertNil(m.connect, "\(name): the hub has no connect block")
            } else {
                let c = try XCTUnwrap(m.connect, name)
                XCTAssertEqual(c.label, "Anthropic API Key", name)
                XCTAssertEqual(c.placeholder, "sk-ant-...", name)
                XCTAssertEqual(c.cta, .init(label: "CONNECT", title: "Save key & start coaching"), name)
                XCTAssertEqual(c.help, Web.help.joined(separator: "\n"), name)
                XCTAssertEqual(c.help.unicodeScalars.filter { $0 == "\n" }.count, 1, "\(name): two paragraphs, one \\n")
                XCTAssertEqual(c.starter?.label, s.programme ? nil : Web.starter, "\(name): the starter link only without a programme")
                // the page sends every one of them: none is the decoder's default for a part left out
                let raw = try XCTUnwrap(JSONText.parse(utf8: data)["connect"], name)
                XCTAssertEqual([raw["label"]?.string, raw["placeholder"]?.string, raw["cta"]?["label"]?.string,
                                raw["cta"]?["title"]?.string, raw["help"]?.string, raw["starter"]?["label"]?.string],
                               [c.label, c.placeholder, c.cta.label, c.cta.title, c.help, c.starter?.label], "\(name): the page's own words")
            }
            let rows = expectedRows(s)
            XCTAssertEqual(m.groups.map(\.head), rows.heads, name)
            XCTAssertEqual(lines(m.groups), rows.lines, name)
        }
    }

    /// Open Chat's sub follows the state (a reply in flight, "N exchanges · <the newest message>", none yet), and the
    /// preview is cut at 65 characters in whole characters: hub-history's 65th is an emoji after 64 ASCII ones, where
    /// the web's 65-unit slice before build 61 kept only its first half.
    func testPageBuiltOpenChatSubPerState() throws {
        let subs = [
            "hub-empty": "No messages yet — tap to start",
            "hub-history": "2 exchanges · Great work this week: every session done and the squat is moving💪…",
            "hub-replying": "Coach is replying…",
            "hub-programme": "1 exchange · Four sessions logged.",
            "hub-resume": "1 exchange · How many days a week can you train, and for how long each time?",
        ]
        XCTAssertEqual(subs.keys.sorted(), Self.scenarios.filter { $0.value.key }.keys.sorted(), "every page-built hub of the eight")
        for (name, sub) in subs.sorted(by: { $0.key < $1.key }) {
            let open = try XCTUnwrap(try model(name).groups.first?.rows.first, name)
            XCTAssertEqual(open.action, .openChat, name)
            XCTAssertEqual(open.sub, sub, name)
        }
        // the cut: the 64 ASCII characters and the emoji whole, then the ellipsis; no half emoji, raw or escaped, and
        // no U+FFFD in the file, and the %% lines left out
        XCTAssertEqual(Self.historyCut.utf16.count, 64, "the emoji's first half is the 65th UTF-16 unit")
        let text = try FixtureFiles.text("coachHome/hub-history.json")
        XCTAssertEqual(JSONText.loneSurrogates(in: text), 0)
        XCTAssertFalse(text.unicodeScalars.contains("\u{FFFD}"))
        let sub = try XCTUnwrap(try model("hub-history").groups.first?.rows.first?.sub)
        let preview = Array(sub.unicodeScalars.dropFirst("2 exchanges · ".unicodeScalars.count))
        XCTAssertEqual(preview.count, 66, "65 characters, then the ellipsis")
        XCTAssertEqual(preview.last, "\u{2026}" as Unicode.Scalar)
        XCTAssertEqual(preview.dropLast().last, "\u{1F4AA}" as Unicode.Scalar, "the 65th character is the whole emoji")
        XCTAssertFalse(sub.contains("%%"), "the preview drops the %% marker lines")
    }

    /// `resume`, the one key the shell's hold reads (contract 8.1, D34): in every page-built file (the eight and any
    /// other) a JSON boolean (read with JSONSerialization) equal to the one decoded from bytes and from text, so a page
    /// that sent it as a string or a number, which the decoder's compiled default turns into false without a word, fails
    /// here; and of the eight, true in hub-resume alone (a key saved and setup running), so a renamed key fails too. Its
    /// route is still the hub (the page builds the hub that sits under the setup chat) and its rows follow the same
    /// rules as the others'.
    func testPageBuiltResumeIsAJSONBooleanTrueOnlyInHubResume() throws {
        var resumed: [String] = []
        for name in pageBuilt() {
            let data = try FixtureFiles.data("coachHome/\(name).json")
            let fromBytes = try CoachHomeModel.decode(utf8: data)
            let fromText = try CoachHomeModel.decode(String(decoding: data, as: UTF8.self))
            XCTAssertEqual(fromText.resume, fromBytes.resume, "\(name): resume from bytes and from text alike")
            let raw = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any], name)
            let sent = try JSONText.parse(utf8: data)["resume"]?.jsonText ?? "absent"
            let value = try XCTUnwrap(raw["resume"] as? NSNumber, "\(name): resume is missing or not a JSON boolean (\(sent))")
            XCTAssertTrue(CFGetTypeID(value) == CFBooleanGetTypeID(), "\(name): resume is a JSON boolean, not the number \(sent)")
            XCTAssertEqual(value.boolValue, fromBytes.resume, "\(name): the raw resume is the decoded one")
            if fromBytes.resume, Self.scenarios[name] != nil { resumed.append(name) }
        }
        XCTAssertEqual(resumed, ["hub-resume"],
                       "true in hub-resume alone: none of the seven others is in setup, and hub-replying shows the hub (coachView 'home')")
        let m = try model("hub-resume")
        XCTAssertTrue(m.resume)
        XCTAssertEqual(m.route, .hub, "the hub under the setup chat")
        XCTAssertEqual(m.groups.flatMap(\.rows).map(\.action), [.openChat, .startIntake, .clearChat, .disconnect],
                       "no programme and a conversation: every row the hub has")
    }

    /// The page sends its room's whole scale and palette with every model, the hub's 16 home* sizes added to the
    /// chat's 26 (contract 6.2, 6.4), in every page-built file: every size equals its room's compiled default and every
    /// colour its room's palette, so page and FPCore are held together as CoachModelTests holds them for the chat. Both
    /// rooms are page-built (Heavyweight's group head and CTA label 10, Lime's 9: contract delta 14.9).
    func testPageBuiltTokensAreTheRoomsCompiledOnes() throws {
        var rooms: Set<Room> = []
        for name in pageBuilt() {
            let data = try FixtureFiles.data("coachHome/\(name).json")
            let m = try CoachHomeModel.decode(utf8: data)
            let compiled = Tokens.defaults(for: m.room)
            rooms.insert(m.room)
            XCTAssertEqual(m.tokens.rejected, [], name)
            let tokens = try JSONText.parse(utf8: data)["tokens"]
            let color = try XCTUnwrap(tokens?["color"]?.object, name), type = try XCTUnwrap(tokens?["type"]?.object, name)
            let space = try XCTUnwrap(tokens?["space"]?.object, name), radius = try XCTUnwrap(tokens?["radius"]?.object, name)
            let font = try XCTUnwrap(tokens?["font"]?.object, name)
            XCTAssertGreaterThan(color.count, 30, name)
            for (key, value) in color.sorted(by: { $0.key < $1.key }) {
                guard let token = ColorToken(rawValue: key) else { XCTFail("\(name): color.\(key) is not a token"); continue }
                XCTAssertEqual(RGBA(css: value.string ?? ""), compiled.color(token), "\(name) color.\(key)")
            }
            XCTAssertEqual(Set(type.keys), Set(TypeToken.allCases.map(\.rawValue)), "\(name): the chat's sizes and the hub's 16")
            for t in TypeToken.allCases { XCTAssertEqual(type[t.rawValue]?.double, compiled.size(t), "\(name) type.\(t.rawValue)") }
            XCTAssertEqual(Set(space.keys), Set(SpaceToken.allCases.map(\.rawValue)), name)
            XCTAssertEqual(Set(radius.keys), Set(RadiusToken.allCases.map(\.rawValue)), name)
            XCTAssertEqual(Set(font.keys), Set(FontToken.allCases.map(\.rawValue)), name)
            for t in SpaceToken.allCases { XCTAssertEqual(space[t.rawValue]?.double, compiled.space(t), "\(name) space.\(t.rawValue)") }
            for t in RadiusToken.allCases { XCTAssertEqual(radius[t.rawValue]?.double, compiled.radius(t), "\(name) radius.\(t.rawValue)") }
            for t in FontToken.allCases { XCTAssertEqual(font[t.rawValue]?.string, compiled.font(t), "\(name) font.\(t.rawValue)") }
            XCTAssertEqual(m.tokens, compiled, "\(name): the decoded tokens are the room's compiled defaults")
        }
        XCTAssertEqual(rooms, [.heavyweight, .lime], "both rooms are page-built")
    }
}
