import Foundation
import XCTest
import FPCore

final class TabsModelTests: XCTestCase {
    private static let handMade: Set<String> = ["forward-compat.json", "minimal.json", "lone-surrogates.json"]

    private func model(_ name: String) throws -> TabsModel {
        try TabsModel.decode(utf8: FixtureFiles.data("tabs/\(name).json"))
    }

    private func titles(_ m: TabsModel) -> [String] { m.items.map(\.title) }
    private func labels(_ m: TabsModel) -> [String] { m.items.map(\.a11y) }

    /// Every file in Fixtures/tabs decodes, from bytes and from text alike, as v1 with the four ids in
    /// the bar's order; only the file that says so carries a lone surrogate.
    func testEveryTabsFixtureDecodes() throws {
        let files = FixtureFiles.files(in: "tabs")
        XCTAssertTrue(Self.handMade.isSubset(of: Set(files.map(\.lastPathComponent))), "the hand-made fixtures are missing: run Tools/tabs-fixtures.js")
        for url in files {
            let name = url.lastPathComponent
            let data = try Data(contentsOf: url)
            let fromBytes = try TabsModel.decode(utf8: data)
            let fromText = try TabsModel.decode(String(decoding: data, as: UTF8.self))
            XCTAssertEqual(fromBytes, fromText, name)
            XCTAssertEqual(fromBytes.v, 1, name)
            XCTAssertEqual(fromBytes.items.map(\.id), TabsModel.ids, name)
            if !name.hasPrefix("lone-surrogates") {
                XCTAssertEqual(JSONText.loneSurrogates(in: String(decoding: data, as: UTF8.self)), 0, "\(name) is not what _nativeJSON writes")
            }
        }
    }

    /// The model's own `v` (never FP_CONTRACT): 0, 2, a string or none is refused.
    func testOtherVersionsAreRefused() {
        for (text, v) in [(#"{"v":0}"#, 0), (#"{"v":2,"room":"heavyweight"}"#, 2)] as [(String, Int?)] {
            XCTAssertThrowsError(try TabsModel.decode(text)) { XCTAssertEqual($0 as? TabsModel.DecodeError, .version(v)) }
        }
        XCTAssertThrowsError(try TabsModel.decode(#"{"v":"1"}"#)) { XCTAssertEqual($0 as? TabsModel.DecodeError, .version(nil)) }
        XCTAssertThrowsError(try TabsModel.decode(#"{"rev":3}"#)) { XCTAssertEqual($0 as? TabsModel.DecodeError, .version(nil)) }
        XCTAssertThrowsError(try TabsModel.decode(#"[{"v":1}]"#)) { XCTAssertEqual($0 as? TabsModel.DecodeError, .notAnObject) }
        XCTAssertThrowsError(try TabsModel.decode("not json"))
        XCTAssertEqual(TabsModel.version, 1)
        XCTAssertEqual(TabsModel.DecodeError.version(2).description, "tabs model v2 (this build reads v1)")
    }

    /// `{v:1}` alone: Heavyweight's compiled bar.
    func testMinimalGivesTheRoomsDefaults() throws {
        let m = try model("minimal")
        XCTAssertEqual(m, TabsModel.defaults(for: .heavyweight))
        XCTAssertEqual(m.rev, 0)
        XCTAssertEqual(m.boot, "")
        XCTAssertEqual(m.room, .heavyweight)
        XCTAssertTrue(m.paper)
        XCTAssertEqual(m.appearance, .light)
        XCTAssertEqual(m.tint.css, "#0a43f5")
        XCTAssertEqual(m.idle.css, "#6b6b66")
        XCTAssertEqual(titles(m), ["Log", "Progress", "Coach", "Settings"])
        XCTAssertEqual(labels(m), ["Log", "Progress", "Coach", "Settings"])
        XCTAssertEqual(m.rejected, [])

        // a room alone takes that room's compiled colours
        let lime = try TabsModel.decode(#"{"v":1,"room":"dark"}"#)
        XCTAssertEqual(lime, TabsModel.defaults(for: .lime))
        XCTAssertFalse(lime.paper)
        XCTAssertEqual(lime.appearance, .dark)
        XCTAssertEqual(lime.tint.css, "#f4f4f1")
        XCTAssertEqual(lime.idle.css, "#8c8c91")
    }

    /// A newer page's model reads: unknown fields and a badge are ignored, an unknown id is dropped,
    /// the page's order is not the bar's, a missing title keeps the compiled one, and a colour RGBA
    /// cannot read keeps the room's.
    func testForwardCompatReads() throws {
        let m = try model("forward-compat")
        XCTAssertEqual(m.rev, 7)
        XCTAssertEqual(m.boot, "b1760000800000-7ab5")
        XCTAssertEqual(m.room, .lime)
        XCTAssertFalse(m.paper)
        XCTAssertEqual(m.tint.css, "#f4f4f1")
        XCTAssertEqual(m.idle, TabsModel.limeIdle)
        XCTAssertEqual(m.items.map(\.id), ["log", "progress", "coach", "settings"])
        XCTAssertEqual(titles(m), ["Log", "Progress", "Coach", "Settings"])
        XCTAssertEqual(labels(m), ["Log", "Progress", "Coach", "Settings"])
        XCTAssertEqual(m.rejected, ["idle", "items[2]: unknown id"])

        // an unknown room from a newer page draws on the defaults its paper flag names
        let ocean = try TabsModel.decode(#"{"v":1,"room":"ocean","paper":false}"#)
        XCTAssertEqual(ocean.room, .other("ocean"))
        XCTAssertFalse(ocean.paper)
        XCTAssertEqual(ocean.tint, TabsModel.limeTint)
        XCTAssertEqual(ocean.idle, TabsModel.limeIdle)
        let paperOcean = try TabsModel.decode(#"{"v":1,"room":"ocean"}"#)
        XCTAssertTrue(paperOcean.paper)
        XCTAssertEqual(paperOcean.tint, TabsModel.heavyweightTint)
    }

    /// An older page that skipped _nativeJSON costs half an emoji, never the model.
    func testLoneSurrogatesAreMended() throws {
        let text = try FixtureFiles.text("tabs/lone-surrogates.json")
        XCTAssertGreaterThan(JSONText.loneSurrogates(in: text), 0, "the fixture lost its lone halves")
        let m = try model("lone-surrogates")
        XCTAssertEqual(m.boot, "b1760000900000-")
        XCTAssertEqual(m.item("coach")?.title, "Coach ")
        XCTAssertEqual(m.item("coach")?.a11y, "Coach")
        XCTAssertEqual(m.item("log")?.a11y, "Log")
        XCTAssertEqual(m.item("log")?.title, "Log")
        XCTAssertEqual(m.tint.css, "#0a43f5")
        XCTAssertEqual(m.rejected, [])
        for item in m.items {
            XCTAssertEqual(JSONText.mendString(item.title), item.title)
            XCTAssertEqual(JSONText.mendString(item.a11y), item.a11y)
        }
    }

    /// Items: unknown ids and non-objects are dropped, a repeated id keeps the first, a missing or
    /// empty title or label keeps the compiled one, the page's own words win otherwise.
    func testItemsAreReadTolerantly() throws {
        let m = try TabsModel.decode("""
        {"v":1,"rev":4,"boot":"b1","tint":"rgba(10,67,245,1)","idle":12,"items":[
          "log", {"id":"progress","title":"Stats","a11y":"Your progress"}, {"id":"progress","title":"Twice"},
          {"id":"Coach","title":"Wrong case"}, {"title":"No id"}, {"id":"settings","title":"","a11y":""}, {"id":"coach","title":"Coach"}
        ]}
        """)
        XCTAssertEqual(m.items.map(\.id), TabsModel.ids)
        XCTAssertEqual(titles(m), ["Log", "Stats", "Coach", "Settings"])
        XCTAssertEqual(labels(m), ["Log", "Your progress", "Coach", "Settings"])
        XCTAssertEqual(m.tint, TabsModel.heavyweightTint)
        XCTAssertEqual(m.idle, TabsModel.heavyweightIdle)
        XCTAssertEqual(m.rejected, ["idle", "items[0]: not an object", "items[2]: progress again", "items[3]: unknown id", "items[4]: unknown id"])

        // no items at all, or items that is not an array: the compiled four
        XCTAssertEqual(try TabsModel.decode(#"{"v":1,"items":{"log":1}}"#).items, TabsModel.defaultItems)
        XCTAssertEqual(try TabsModel.decode(#"{"v":1,"items":[]}"#).items, TabsModel.defaultItems)
        // a null colour is a missing one, not a rejected one
        XCTAssertEqual(try TabsModel.decode(#"{"v":1,"tint":null}"#).rejected, [])
    }

    /// The compiled defaults are the page's values (contract 6.1): Heavyweight `--accent` and
    /// `--muted`, Lime `--text` (the neutral selection) and `--muted`, the web bar's titles and
    /// labels; and the room tokens agree.
    func testCompiledDefaultsAreThePagesValues() {
        let hw = TabsModel.defaults(for: .heavyweight)
        XCTAssertEqual([hw.tint.css, hw.idle.css], ["#0a43f5", "#6b6b66"])
        XCTAssertTrue(hw.paper)
        let lime = TabsModel.defaults(for: .lime)
        XCTAssertEqual([lime.tint.css, lime.idle.css], ["#f4f4f1", "#8c8c91"])
        XCTAssertFalse(lime.paper)
        for m in [hw, lime] {
            XCTAssertEqual(m.items, [
                .init(id: "log", title: "Log", a11y: "Log"), .init(id: "progress", title: "Progress", a11y: "Progress"),
                .init(id: "coach", title: "Coach", a11y: "Coach"), .init(id: "settings", title: "Settings", a11y: "Settings"),
            ])
            XCTAssertEqual(m.v, 1)
            XCTAssertEqual(m.rejected, [])
        }
        XCTAssertEqual(hw.tint, Tokens.heavyweight.color(.accent))
        XCTAssertEqual(hw.idle, Tokens.heavyweight.color(.muted))
        XCTAssertEqual(lime.tint, Tokens.lime.color(.text))
        XCTAssertEqual(lime.idle, Tokens.lime.color(.muted))
        // paper overrides an unknown room only; a known room keeps its own appearance flag unless sent
        XCTAssertEqual(TabsModel.defaults(for: .other("x"), paper: false).tint, TabsModel.limeTint)
        XCTAssertEqual(TabsModel.defaults(for: .other("x")).tint, TabsModel.heavyweightTint)
    }

    /// The page-built fixtures (P6's `heavyweight.json` and `lime.json`, written by
    /// tests/golden/dump-coach-home.js) hold the same colours, titles and labels as the compiled
    /// defaults: the test that keeps FPCore and the page together (contract 6.1, 6.4).
    func testPageBuiltFixturesEqualTheCompiledDefaults() throws {
        let built = FixtureFiles.files(in: "tabs").filter { !Self.handMade.contains($0.lastPathComponent) }
        guard !built.isEmpty else { throw XCTSkip("no page-built Fixtures/tabs yet (P6)") }
        for url in built {
            let name = url.lastPathComponent
            let m = try TabsModel.decode(utf8: Data(contentsOf: url))
            let compiled = TabsModel.defaults(for: m.room, paper: m.paper)
            XCTAssertEqual(m.rejected, [], name)
            XCTAssertEqual(m.tint, compiled.tint, name)
            XCTAssertEqual(m.idle, compiled.idle, name)
            XCTAssertEqual(m.paper, m.room.isPaper, name)
            XCTAssertEqual(m.items, compiled.items, name)
            let raw = try FixtureFiles.json("tabs/\(name)")
            XCTAssertEqual(raw["items"]?.array?.count, 4, "\(name): the page sends all four items")
        }
        let rooms = Set(try built.map { try TabsModel.decode(utf8: Data(contentsOf: $0)).room })
        XCTAssertTrue(rooms.isSuperset(of: [.heavyweight, .lime]), "both rooms are page-built")
    }
}
