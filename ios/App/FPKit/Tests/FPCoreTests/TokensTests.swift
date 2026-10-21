import Foundation
import XCTest
import FPCore

final class TokensTests: XCTestCase {
    private func css(_ s: String) -> String? { RGBA(css: s)?.css }

    func testCSSColours() {
        XCTAssertEqual(css("#0a43f5"), "#0a43f5")
        XCTAssertEqual(css("#0A43F5"), "#0a43f5")
        XCTAssertEqual(css("#fff"), "#ffffff")
        XCTAssertEqual(css("#0008"), "rgba(0,0,0,0.533)")
        XCTAssertEqual(css("#0a43f580"), "rgba(10,67,245,0.502)")
        XCTAssertEqual(css("rgba(15,15,15,.10)"), "rgba(15,15,15,0.1)")
        XCTAssertEqual(css("rgba(255, 255, 255, 0.08)"), "rgba(255,255,255,0.08)")
        XCTAssertEqual(css("rgb(216 255 99)"), "#d8ff63")
        XCTAssertEqual(css("rgb(216 255 99 / 12%)"), "rgba(216,255,99,0.12)")
        XCTAssertEqual(css("rgb(100%, 0%, 50%)"), "#ff0080")
        XCTAssertEqual(css(" transparent "), "rgba(0,0,0,0)")
        XCTAssertEqual(css("white"), "#ffffff")
        for bad in ["", "#12", "#12345", "#ggg", "var(--accent)", "hsl(0 0% 0%)", "rgba(1,2)", "rgb(a,b,c)", "color-mix(in oklch, red 50%, blue)"] {
            XCTAssertNil(RGBA(css: bad), bad)
        }
    }

    /// The room CSS mixes in sRGB: Lime's `--sel` and Heavyweight's warn delta.
    func testColorMixAsBrowsersMix() {
        XCTAssertEqual(css("color-mix(in srgb, #f4f4f1 15%, #151517)"), "#363638")
        XCTAssertEqual(css("color-mix(in srgb, #ea580c 80%, #0f0f0f)"), "#be490d")
        XCTAssertEqual(css("color-mix(in srgb, #000, #fff)"), "#808080", "no shares: half and half")
        XCTAssertEqual(css("color-mix(in srgb, #000 25%, #fff 25%)"), "rgba(128,128,128,0.5)", "shares under 100% thin the alpha")
        // premultiplied: mixing with transparent keeps the colour and thins it
        XCTAssertEqual(css("color-mix(in srgb, #b9b9be 45%, transparent)"), "rgba(185,185,190,0.45)")
        XCTAssertEqual(css("color-mix(in srgb, rgba(0,0,0,.5) 50%, #ffffff)"), "rgba(170,170,170,0.75)")
    }

    /// CLAUDE.md "Look": Heavyweight paper #f7f5ef, blue #0a43f5 the action, lime #b7f000 / ink
    /// #4f7000 the earned state, Anton display + Archivo body, flat white cards; Lime the green and black
    /// Studio (THEMES.dark).
    func testCompiledDefaultsForBothRooms() {
        let h = Tokens.defaults(for: .heavyweight)
        XCTAssertEqual(h.color(.bg).css, "#f7f5ef")
        XCTAssertEqual(h.color(.accent).css, "#0a43f5")
        XCTAssertEqual(h.color(.earned).css, "#b7f000")
        XCTAssertEqual(h.color(.earnedInk).css, "#4f7000")
        XCTAssertEqual(h.color(.card).css, "#ffffff")
        XCTAssertEqual(h.color(.satAccent).css, "#4d7cff")
        XCTAssertEqual(h.color(.border).css, "rgba(15,15,15,0.1)")
        XCTAssertEqual(h.font(.display), "Anton")
        XCTAssertEqual(h.font(.body), "Archivo")
        XCTAssertEqual(h.font(.mono), "Archivo", "the board has no monospace")
        XCTAssertEqual(h.color(.userBubble), h.color(.accent))
        XCTAssertEqual(h.color(.chipPrimary), h.color(.accent))
        XCTAssertEqual(h.color(.deltaWarn).css, "#be490d")
        XCTAssertEqual(h.radius(.composer), 16)
        XCTAssertEqual(h.radius(.send), 12)

        let l = Tokens.defaults(for: .lime)
        XCTAssertEqual(l.color(.bg).css, "#0b0b0c")
        XCTAssertEqual(l.color(.accent).css, "#d8ff63")
        XCTAssertEqual(l.color(.onAccent).css, "#0b0b0c")
        XCTAssertEqual(l.color(.earned), l.color(.accent), "a single-accent room: the earned state is the accent")
        XCTAssertEqual(l.color(.purple).css, "#ad92ff")
        XCTAssertEqual(l.color(.sel).css, "#363638")
        XCTAssertEqual(l.color(.userBubble), l.color(.sel), "Lime's own bubble is the selection grey, not the lime")
        XCTAssertEqual(l.color(.eyebrow), l.color(.muted))
        XCTAssertEqual(l.color(.chipPrimary), l.color(.card2), "Lime: lime is the action and the earned state only")
        XCTAssertEqual(l.font(.body), "Inter")
        XCTAssertEqual(l.font(.eyebrow), "JetBrains Mono")
        XCTAssertEqual(l.radius(.composer), 20)

        // every token has a default in both rooms, and the chat's type scale is the same in both
        for room in [Tokens.heavyweight, Tokens.lime] {
            for t in ColorToken.allCases { XCTAssertNotNil(room.colors[t.rawValue], "\(room.room) \(t)") }
            for t in TypeToken.allCases { XCTAssertNotNil(room.sizes[t.rawValue], "\(room.room) \(t)") }
            for t in SpaceToken.allCases { XCTAssertNotNil(room.spaces[t.rawValue], "\(room.room) \(t)") }
            for t in RadiusToken.allCases { XCTAssertNotNil(room.radii[t.rawValue], "\(room.room) \(t)") }
            for t in FontToken.allCases { XCTAssertNotNil(room.fonts[t.rawValue], "\(room.room) \(t)") }
        }
        for t in TypeToken.chat { XCTAssertEqual(Tokens.heavyweight.size(t), Tokens.lime.size(t), "type.\(t.rawValue)") }
        XCTAssertEqual(h.size(.composer), 16, "no editable field under 16 pt (spec 115)")
        XCTAssertEqual(h.size(.body), 15)
        XCTAssertEqual(h.space(.hit), 44)
    }

    /// The Coach tab's 16 hub sizes (contract 6.2's table, D33): per room, at the large text size, from the room
    /// CSS. The page sends the same values in CoachHomeModel's `tokens.type` (CoachHomeModelTests holds the
    /// page-built files to them). Heavyweight's group head (CONVERSATION, PROGRAMME, ACCOUNT) and CTA label (CONNECT)
    /// are 10, as the web computes them in that room (index.html 2045-2046, a later room rule than the 9 px of 1561
    /// and 1545 that contract 6.2's table cites); Lime's stay 9, and the field label is 9 in both.
    func testHomeTypeScalePerRoom() {
        let expected: [TypeToken: (heavyweight: Double, lime: Double)] = [
            .homeMeta: (10, 10), .homeAvatar: (13, 13), .homeGreet: (15, 14), .homeTitle: (74, 56),
            .homeTitleMin: (54, 43), .homeBody: (15, 14), .homeGroupHead: (10, 9), .homeRowTitle: (14, 14),
            .homeRowSub: (11.5, 11.5), .homeFieldLabel: (9, 9), .homeField: (16, 16), .homeCtaLabel: (10, 9),
            .homeCtaTitle: (18, 18), .homeCtaArrow: (22, 22), .homeHelp: (12, 12), .homeLink: (14, 14),
        ]
        XCTAssertEqual(Set(expected.keys), Set(TypeToken.home), "the table names every home* token")
        for (t, v) in expected {
            XCTAssertEqual(Tokens.heavyweight.size(t), v.heavyweight, "heavyweight \(t.rawValue)")
            XCTAssertEqual(Tokens.lime.size(t), v.lime, "lime \(t.rawValue)")
            XCTAssertEqual(Tokens.defaults(for: .other("ocean"), paper: false).size(t), v.lime, "an unknown dark room: Lime's")
            XCTAssertEqual(Tokens.defaults(for: .other("ocean"), paper: true).size(t), v.heavyweight,
                           "an unknown paper room: Heavyweight's")
        }
        XCTAssertEqual(Tokens.heavyweight.size(.homeField), 16, "no editable field under 16 pt (spec 115)")
        XCTAssertLessThan(Tokens.heavyweight.size(.homeTitleMin), Tokens.heavyweight.size(.homeTitle))
        XCTAssertLessThan(Tokens.lime.size(.homeTitleMin), Tokens.lime.size(.homeTitle))
        // the page's override reads like any other size
        let t = Tokens(room: .lime, overrides: ["type": ["homeTitle": 60, "homeGreet": 200]])
        XCTAssertEqual(t.size(.homeTitle), 60)
        XCTAssertEqual(t.size(.homeGreet), 14, "a size out of range keeps the room's default")
        XCTAssertEqual(t.rejected, ["type.homeGreet"])
    }

    /// TypeToken.chat (the page's `_COACH_TOKENS.type`, every CoachModel) and TypeToken.home (CoachHomeModel only)
    /// split the type scale in two.
    func testChatAndHomeTypeTokensPartitionTheScale() {
        XCTAssertEqual(TypeToken.chat.count, 26)
        XCTAssertEqual(TypeToken.home.count, 16)
        XCTAssertTrue(Set(TypeToken.chat).isDisjoint(with: TypeToken.home))
        XCTAssertEqual(Set(TypeToken.chat).union(TypeToken.home), Set(TypeToken.allCases))
        XCTAssertEqual(TypeToken.chat + TypeToken.home, TypeToken.allCases, "in declaration order")
        XCTAssertTrue(TypeToken.home.allSatisfy { $0.rawValue.hasPrefix("home") })
        XCTAssertFalse(TypeToken.chat.contains { $0.rawValue.hasPrefix("home") })
    }

    func testOverridesApplyOverTheDefaults() {
        let overrides: JSONValue = [
            "color": ["accent": "#ff0000", "brandNew": "#00ff00", "bg": "var(--bg)", "card": 3],
            "type": ["body": 17, "title": 400],
            "space": ["gutter": 16, "hit": -1],
            "radius": ["card": 10],
            "font": ["body": "Inter", "display": ""],
            "motion": ["fast": 0.2],
        ]
        let t = Tokens(room: .heavyweight, overrides: overrides)
        XCTAssertEqual(t.color(.accent).css, "#ff0000")
        XCTAssertEqual(t.colors["brandNew"]?.css, "#00ff00", "a newer page's token is kept for a newer view")
        XCTAssertEqual(t.color(.bg).css, "#f7f5ef", "an unreadable colour keeps the default")
        XCTAssertEqual(t.color(.card).css, "#ffffff")
        XCTAssertEqual(t.size(.body), 17)
        XCTAssertEqual(t.size(.title), 22, "a size out of range keeps the default")
        XCTAssertEqual(t.space(.gutter), 16)
        XCTAssertEqual(t.space(.hit), 44)
        XCTAssertEqual(t.radius(.card), 10)
        XCTAssertEqual(t.font(.body), "Inter")
        XCTAssertEqual(t.font(.display), "Anton")
        XCTAssertEqual(t.rejected.sorted(), ["color.bg", "color.card", "font.display", "space.hit", "type.title"])
        XCTAssertEqual(Tokens(room: .lime, overrides: "nope").rejected, ["tokens: not an object"])
        XCTAssertEqual(Tokens(room: .lime, overrides: nil), Tokens.defaults(for: .lime))
    }

    func testRoomsAndUnknownRooms() {
        XCTAssertEqual(Room(id: "heavyweight"), .heavyweight)
        XCTAssertEqual(Room(id: "dark"), .lime)
        XCTAssertEqual(Room.lime.id, "dark")
        XCTAssertEqual(Room(id: "ocean"), .other("ocean"))
        XCTAssertEqual(Room.heavyweight.isPaper, true)
        XCTAssertEqual(Room.lime.isPaper, false)
        XCTAssertNil(Room.other("ocean").isPaper)
        XCTAssertEqual(Tokens.defaults(for: .other("ocean"), paper: false).color(.bg).css, "#0b0b0c")
        XCTAssertEqual(Tokens.defaults(for: .other("ocean")).color(.bg).css, "#f7f5ef")
    }

    func testTextSizeClamp() {
        XCTAssertEqual(TextSize.xSmall.clamped(dynTypeOn: true), .large, "the web never scales below 100%")
        XCTAssertEqual(TextSize.xLarge.clamped(dynTypeOn: true), .xLarge)
        XCTAssertEqual(TextSize.accessibility3.clamped(dynTypeOn: true), .xxLarge, "capped near the page's 125%")
        XCTAssertEqual(TextSize.accessibility3.clamped(dynTypeOn: false), .large)
        XCTAssertEqual(TextSize(contentSizeCategory: "UICTContentSizeCategoryXXL"), .xxLarge)
        XCTAssertEqual(TextSize(contentSizeCategory: "UICTContentSizeCategoryAccessibilityM"), .accessibility1)
        XCTAssertNil(TextSize(contentSizeCategory: "UICTContentSizeCategoryUnspecified"))
    }
}
