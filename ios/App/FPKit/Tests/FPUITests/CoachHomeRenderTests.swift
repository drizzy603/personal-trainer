#if os(iOS)
import SwiftUI
import UIKit
import Vision
import XCTest
@testable import FPUI
import FPCore

/// Renders the native Coach tab's root, the hub and the connect screen (plan task N12; contract 6.2, 12 "FPKit on iOS",
/// I10), for every coach home fixture (`CoachHomeFixtures`: the hand-made ones now, the page-built ones as they land)
/// and the variants no fixture holds yet (`variants`): both rooms (another room's compiled defaults, as
/// CoachRenderTests draws the chat's fixtures; an unknown room's own look besides) × the phone's light and dark
/// settings × the three text sizes the hub draws at (.large, .xLarge, .xxLarge), at 2×, on two phones under the glass
/// tab bar: 390 × 844 with its 47 pt status bar, and 320 × 568 (Display Zoom on a Home-button iPhone) with its 20 pt
/// one, both with the bar's 83 pt under the column (the H0 probe measured the glass bar at 83 pt on every iPhone, Face
/// ID or Home button: 01-contract-delta.md 14.1; Display Zoom was not measured, and takes the same 83).
///
/// Every render draws exactly when its model has something to draw (a model with nothing draws the room's bare ground)
/// and the phone's setting never changes it; the column scrolled to its end stops above the bar; every string a render
/// draws is the model's at its place, and every string the model shows is drawn there (I10, read off the renders by
/// Vision's text recognition: `DrawnText`; the avatar, a lone letter, by its tile). With FPUI_SHOTS set (xcodebuild
/// passes TEST_RUNNER_FPUI_SHOTS) the renders are written there for the contact sheets (plan task N14):
///
///     native/home/<fixture>/<room>-<light|dark>-<size>.png   the tab as the 390 × 844 phone shows it
///     native/home/<fixture>/<room>-full-<size>.png           the whole column, unscrolled, 390 wide
///     native/home/<fixture>/<room>-end-xxLarge.png           the tab scrolled to its end, at .xxLarge
///     native/home/<fixture>/320/…                            the same three for the 320 × 568 phone
@MainActor
final class CoachHomeRenderTests: XCTestCase {
    /// A phone: its screen and the safe areas a hosting controller in the Coach tab gets there (the status bar above,
    /// the glass tab bar's cover below).
    struct Screen {
        let name: String
        let size: CGSize
        let top: CGFloat
        let bottom: CGFloat
        /// Where its renders go under FPUI_SHOTS, inside a fixture's folder.
        let folder: String
    }

    static let phone = Screen(name: "390 × 844", size: CGSize(width: 390, height: 844), top: 47, bottom: CoachRenderTests.glassBar, folder: "")
    static let zoomed = Screen(name: "320 × 568", size: CGSize(width: 320, height: 568), top: 20, bottom: CoachRenderTests.glassBar, folder: "320/")
    static let screens = [phone, zoomed]
    static let sizes = CoachRenderTests.sizes
    static let rooms = CoachRenderTests.rooms

    /// Models no fixture holds yet, drawn as fixtures of their own (as CoachRenderTests' variants): the connect screen
    /// with its starter link and the app's Larger Text on, as the page builds it (CoachHomeViewTests.connectJSON, the
    /// page's own strings). The hand-made fixtures have no connect route (forward-compat's connect block sits on a
    /// newer page's route, with no starter link and Larger Text off); the page-built ones bring three when they land
    /// (P6).
    static func variants() -> [(name: String, json: String)] {
        [("built-connect", CoachHomeViewTests.connectJSON())]
    }

    /// What the renders draw, by name: every coach home fixture (the folder listed), then every variant.
    static func sources() throws -> [(name: String, json: JSONValue)] {
        let fixtures = try CoachHomeFixtures.names().map { ($0, try CoachHomeFixtures.json($0)) }
        return try fixtures + variants().map { ($0.name, try JSONText.parse(utf8: Data($0.json.utf8))) }
    }

    /// The hub on a phone: the system's safe areas replaced by the phone's, so every render is the same whatever
    /// simulator runs the test. `unscrolled`: the whole column at the phone's width (CoachHomeOptions.unscrolledWidth).
    struct Phone: View {
        let model: CoachHomeModel
        let size: DynamicTypeSize
        let screen: Screen
        var unscrolled = false

        var body: some View {
            CoachHomeView(model: model, host: .inert, options: CoachHomeOptions(unscrolledWidth: unscrolled ? screen.size.width : nil))
                .safeAreaPadding(.top, screen.top)
                .safeAreaPadding(.bottom, screen.bottom)
                .environment(\.dynamicTypeSize, size)
        }
    }

    /// A source in each room: both rooms, then its own when that is a room this build does not know (`room` nil: the
    /// JSON as it is).
    static func models(_ json: JSONValue) throws -> [(name: String, room: Room?, model: CoachHomeModel)] {
        var out = try rooms.map { ($0.0, Optional($0.1), try CoachHomeFixtures.model(json, in: $0.1)) }
        let own = try CoachHomeModel(json: json)
        if case .other(let id) = own.room { out.append((id, nil, own)) }
        return out
    }

    /// Every string a model shows, as contract 6.2 lays the routes out: the meta label, the avatar and the hero on
    /// every route; each group's head and its rows' titles and subs on the hub; the connect block's field label,
    /// placeholder, CTA label and title, help and starter link on the connect screen; both, the groups first, on a
    /// newer page's route. Empty strings draw nothing and are left out. In the order the column draws them, which is
    /// the order they are read in, but for the avatar (`avatar` false leaves it out): a lone letter at the meta row's
    /// end, read beside any of the label's lines or not at all.
    static func shown(_ m: CoachHomeModel, avatar: Bool = true) -> [String] {
        var out = [m.meta.label, avatar ? m.meta.avatar ?? "" : "", m.hero.greet, m.hero.title, m.hero.accent, m.hero.body]
        if m.route != .connect {
            for g in m.groups {
                out.append(g.head)
                for r in g.rows { out += [r.title, r.sub ?? ""] }
            }
        }
        if m.route != .hub, let c = m.connect {
            out += [c.label, c.placeholder, c.cta.label, c.cta.title, c.help, c.starter?.label ?? ""]
        }
        return out.filter { !$0.isEmpty }
    }

    private var shots: URL? {
        ProcessInfo.processInfo.environment["FPUI_SHOTS"].flatMap { $0.isEmpty ? nil : URL(fileURLWithPath: $0, isDirectory: true) }
    }

    private func write(_ image: UIImage, _ path: String) throws {
        guard let shots else { return }
        let url = shots.appendingPathComponent("native/home").appendingPathComponent(path)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try XCTUnwrap(image.pngData()).write(to: url)
    }

    override func setUp() async throws {
        try await super.setUp()
        FPFonts.register()
    }

    // MARK: The renders

    /// Every fixture and variant in both rooms, light and dark, three sizes, both phones: the tab as the phone shows
    /// it, inked exactly when the model shows something, the same whatever the phone's setting.
    func testEveryFixtureRendersInBothRoomsAppearancesAndSizes() throws {
        let sources = try Self.sources()
        XCTAssertFalse(sources.isEmpty, "the coach home fixtures")
        var count = 0
        for (name, json) in sources {
            for (roomName, _, model) in try Self.models(json) {
                let shows = !Self.shown(model).isEmpty
                for screen in Self.screens {
                    for (sizeName, size) in Self.sizes {
                        let what = "\(name) \(roomName) \(screen.name) \(sizeName)"
                        let light = CoachRenderTests.render(Phone(model: model, size: size, screen: screen), size: screen.size, phone: .light)
                        let dark = CoachRenderTests.render(Phone(model: model, size: size, screen: screen), size: screen.size, phone: .dark)
                        XCTAssertEqual(light.size, screen.size, what)
                        let ink = CoachRenderTests.inked(light, background: RoomTheme(home: model, system: size).rgba(.bg))
                        if shows {
                            XCTAssertGreaterThan(ink, 0.01, "\(what) draws")
                        } else {
                            XCTAssertEqual(ink, 0, "\(what): a model that shows nothing draws the room's bare ground")
                        }
                        XCTAssertLessThan(CoachRenderTests.difference(light, dark), 0.001,
                                          "\(what): the hub wears its room whatever the phone's setting")
                        try write(light, "\(name)/\(screen.folder)\(roomName)-light-\(sizeName).png")
                        try write(dark, "\(name)/\(screen.folder)\(roomName)-dark-\(sizeName).png")
                        if shots != nil {
                            let whole = CoachRenderTests.render(Phone(model: model, size: size, screen: screen, unscrolled: true), size: nil,
                                                                phone: .light, width: screen.size.width)
                            try write(whole, "\(name)/\(screen.folder)\(roomName)-full-\(sizeName).png")
                        }
                        count += 1
                    }
                }
            }
        }
        XCTAssertGreaterThanOrEqual(count, sources.count * Self.rooms.count * Self.screens.count * Self.sizes.count)
    }

    /// The tab scrolled to its end at the largest text, where the column is tallest: it stops above the glass bar, its last
    /// block at least the column's own 24 px clear of the bar's 83 pt (the scroll view keeps the bar's inset, so the end
    /// of the hub is never under the glass). On both phones, in both rooms; on the 320 pt phone the connect screen and the
    /// hub with its groups are taller than the screen, so some fixture's end is scrolled to.
    func testTheTabScrolledToItsEndStopsAboveTheBar() throws {
        var scrolled = 0
        for (name, json) in try Self.sources() {
            for (roomName, _, model) in try Self.models(json) {
                for screen in Self.screens {
                    let what = "\(name) \(roomName) \(screen.name) at its end"
                    let size = DynamicTypeSize.xxLarge
                    let theme = RoomTheme(home: model, system: size)
                    var moved = false
                    let image = CoachRenderTests.render(Phone(model: model, size: size, screen: screen), size: screen.size, phone: .light,
                                                        prepare: { if Self.scrollToEnd($0) { moved = true } })
                    if moved { scrolled += 1 }
                    if let end = CoachRenderTests.lowestInk(image, background: theme.rgba(.bg)) {
                        let bar = screen.size.height - screen.bottom
                        XCTAssertLessThanOrEqual(end, bar - theme.px(24) + 0.5, "\(what): the column's end clears the bar (\(bar))")
                    } else {
                        XCTAssertTrue(Self.shown(model).isEmpty, "\(what): drawn")
                    }
                    try write(image, "\(name)/\(screen.folder)\(roomName)-end-xxLarge.png")
                }
            }
        }
        XCTAssertGreaterThan(scrolled, 0, "some fixture's column is taller than a screen at .xxLarge and was scrolled to its end")
    }

    /// Moves the hub's scroll view to its end; true when that is not where it was (the column is taller than the screen).
    static func scrollToEnd(_ view: UIView) -> Bool {
        func find(_ v: UIView) -> UIScrollView? {
            if let s = v as? UIScrollView { return s }
            for sub in v.subviews { if let s = find(sub) { return s } }
            return nil
        }
        guard let scroll = find(view) else { return false }
        let inset = scroll.adjustedContentInset
        let end = max(-inset.top, scroll.contentSize.height + inset.bottom - scroll.bounds.height)
        guard end > -inset.top + 0.5 else { return false }
        if abs(scroll.contentOffset.y - end) > 0.5 { scroll.setContentOffset(CGPoint(x: 0, y: end), animated: false) }
        return true
    }

    // MARK: I10: what a render draws

    /// Every string a render draws is the model's at its place, and every string its model shows is drawn there
    /// (contract I10): the whole column of each fixture and variant in both rooms, at the large size on the 390 pt
    /// phone and at .xxLarge on the 320 pt one (the most lines wrapped), read back by text recognition (`DrawnText`)
    /// and laid against the strings the model shows, in the order the column draws them (`DrawnText.match`). So nothing
    /// is drawn that the page did not send (no word of the view's own, no row or field a newer page sent that this
    /// build leaves out), nothing the page sent is cut or left out, and a string is found at its own place, never
    /// inside another (the title's "Coach" is not the meta row's COACH, nor "ready." the body's "thread"). Every string
    /// the model shows is one the source holds, so what is drawn is the page's own words and never a default of the
    /// decoder or the view. The avatar, a lone letter that the recognizer reads in Lime and seldom on Heavyweight's
    /// blue disc, is held by its tile instead (`checkAvatar`). The view's own marks (the meta row's disc, a row's
    /// chevron, CONNECT's arrow, the icons) are no letters or digits and are not text.
    func testEveryStringARenderDrawsIsTheFixtures() throws {
        var lines = 0, strings = 0, avatars = 0
        for (name, json) in try Self.sources() {
            let file = CoachHomeFixtures.strings(json)
            for (roomName, room, model) in try Self.models(json) {
                let shown = Self.shown(model)
                for s in shown { XCTAssertTrue(file.contains(s), "\(name) \(roomName): \(s.debugDescription) is a string of the source") }
                let words = Self.shown(model, avatar: false)
                for (screen, sizeName, size) in [(Self.phone, "large", DynamicTypeSize.large), (Self.zoomed, "xxLarge", .xxLarge)] {
                    let what = "\(name) \(roomName) \(screen.name) \(sizeName)"
                    let image = CoachRenderTests.render(Phone(model: model, size: size, screen: screen, unscrolled: true), size: nil,
                                                        phone: .light, width: screen.size.width)
                    let read = try DrawnText.read(image)
                    let match = DrawnText.match(lines: read.map(\.text), strings: words)
                    for (i, line) in read.enumerated() {
                        let count = DrawnText.normalize(line.text).count
                        guard count >= 2 else { continue }
                        XCTAssertLessThanOrEqual(match.lineErrors[i], DrawnText.allowed(count),
                                                 "\(what): drew \(line.text.debugDescription), which is not the model's at its place (\(words))")
                        lines += 1
                    }
                    for (j, s) in words.enumerated() {
                        let count = DrawnText.normalize(s).count
                        guard count > 0 else { continue }
                        XCTAssertLessThanOrEqual(match.stringErrors[j], DrawnText.allowed(count),
                                                 "\(what): \(s.debugDescription) is not drawn whole at its place (read: \(read.map(\.text)))")
                        strings += 1
                    }
                    XCTAssertEqual(match.missing, [], "\(what): pieces of the model's strings not drawn at their place (read: \(read.map(\.text)))")
                    XCTAssertEqual(match.extra, [], "\(what): pieces drawn where the model has none (\(words))")
                    if let avatar = model.meta.avatar, !avatar.isEmpty {
                        try checkAvatar(avatar, of: json, in: room, drawn: image, read: read, screen: screen, size: size, what)
                        avatars += 1
                    }
                }
            }
        }
        XCTAssertGreaterThan(lines, 0, "text was read off the renders")
        XCTAssertGreaterThan(strings, 0, "the models show strings")
        XCTAssertGreaterThan(avatars, 0, "avatars were drawn")
    }

    /// The avatar is drawn from the model, in its tile at the meta row's end: the column drawn again with another
    /// letter differs from `drawn` (the model's own) inside the tile alone (38 px at the column's right gutter, under
    /// the row's 17 px), and whatever the recognizer read inside the tile is the model's letter.
    private func checkAvatar(_ avatar: String, of json: JSONValue, in room: Room?, drawn: UIImage, read: [DrawnText.Line], screen: Screen,
                             size: DynamicTypeSize, _ what: String, file: StaticString = #filePath, line: UInt = #line) throws {
        let other = DrawnText.normalize(avatar).map(DrawnText.fold) == ["w"] ? "K" : "W"
        let swapped = Self.with(avatar: other, json)
        let model = try room.map { try CoachHomeFixtures.model(swapped, in: $0) } ?? CoachHomeModel(json: swapped)
        let again = CoachRenderTests.render(Phone(model: model, size: size, screen: screen, unscrolled: true), size: nil,
                                            phone: .light, width: screen.size.width)
        let t = RoomTheme(home: model, system: size)
        let side = t.px(38)
        let right = screen.size.width - CoachHomeView.gutter(t, width: screen.size.width)
        let tile = CGRect(x: right - side, y: screen.top + t.px(17), width: side, height: 2 * side).insetBy(dx: -1, dy: -1)
        let changed = try XCTUnwrap(Self.differingBox(drawn, again), "\(what): another avatar draws another letter: the avatar is drawn",
                                    file: file, line: line)
        XCTAssertTrue(tile.contains(changed), "\(what): the avatar is drawn in its tile (\(changed) in \(tile))", file: file, line: line)
        for l in read where tile.contains(CGPoint(x: l.box.midX, y: l.box.midY)) {
            XCTAssertEqual(DrawnText.normalize(l.text).map(DrawnText.fold), DrawnText.normalize(avatar).map(DrawnText.fold),
                           "\(what): read \(l.text.debugDescription) in the avatar's tile, which shows \(avatar.debugDescription)",
                           file: file, line: line)
        }
    }

    /// A source's JSON with its meta row's avatar replaced.
    static func with(avatar: String, _ json: JSONValue) -> JSONValue {
        guard case .object(var o) = json else { return json }
        var meta: [String: JSONValue] = [:]
        if case .object(let m)? = o["meta"] { meta = m }
        meta["avatar"] = .string(avatar)
        o["meta"] = .object(meta)
        return .object(o)
    }

    /// The smallest box (in points) holding every pixel in which two renders of one size differ; nil when none does.
    static func differingBox(_ a: UIImage, _ b: UIImage) -> CGRect? {
        guard let ca = a.cgImage, let cb = b.cgImage, ca.width == cb.width, ca.height == cb.height else { return nil }
        let x = CoachRenderTests.bytes(ca), y = CoachRenderTests.bytes(cb)
        var minX = Int.max, minY = Int.max, maxX = -1, maxY = -1
        for py in 0..<ca.height {
            let row = py * ca.width * 4
            for px in 0..<ca.width {
                let i = row + px * 4
                guard x[i] != y[i] || x[i + 1] != y[i + 1] || x[i + 2] != y[i + 2] else { continue }
                minX = min(minX, px); maxX = max(maxX, px)
                minY = min(minY, py); maxY = max(maxY, py)
            }
        }
        guard maxX >= 0 else { return nil }
        let k = CGFloat(ca.width) / a.size.width
        return CGRect(x: CGFloat(minX) / k, y: CGFloat(minY) / k, width: CGFloat(maxX - minX + 1) / k, height: CGFloat(maxY - minY + 1) / k)
    }

    /// The text a render draws, read back with Vision's text recognition (the accurate recognizer, no language
    /// correction), and laid against the strings a model shows. SwiftUI keeps no drawn text a test can read:
    /// VoiceOver's elements carry the page's strings as labels (CoachHomeViewTests walks them), but a label is not what
    /// is drawn, and the decorative texts (the avatar, the visible field label) have none. Recognition reads glyphs,
    /// not strings, so the match is lenient where it must be and no more: both sides lowercased and cut to their
    /// letters and digits (white space and punctuation go, so do the meta row's disc, a row's chevron and CONNECT's
    /// arrow, which are marks of the view's own), a dotless "ı" read as an "i", the letters the recognizer trades taken
    /// as one (`fold`: "l0g." for "log.", "APl" for "API"), a mended lone surrogate (U+FFFD, drawn as the face's
    /// replacement glyph) and an emoji (drawn as a picture) matching any one letter or none, a line of one letter (an
    /// icon's stroke read as "L") free to stand alone, and a line or a string allowed one misread letter in ten (none
    /// under five), but never a word of three letters or more that is not there. Probed on iOS 27.0 over the hand-made
    /// fixtures, the page-built ones (P6) and the variant, both rooms, at 390 pt large and at 320 pt .xxLarge: every
    /// line was read in the column's order but the avatar's (read beside the meta label's line or between its two
    /// lines, and on Heavyweight's blue disc often not at all), none with more than one error.
    enum DrawnText {
        static let wildcard: Character = "\u{FFFD}"

        /// A line the recognizer read, and its box in the render (points, from the top left).
        struct Line: Equatable {
            let text: String
            let box: CGRect
        }

        /// The lines read off a render, in reading order (`ordered`).
        static func read(_ image: UIImage) throws -> [Line] {
            let cg = try XCTUnwrap(image.cgImage)
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = false
            request.recognitionLanguages = ["en-US"]
            try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
            let w = image.size.width, h = image.size.height
            // Vision's boxes are normalised with their origin at the bottom left
            let lines = (request.results ?? []).compactMap { o -> Line? in
                guard let text = o.topCandidates(1).first?.string else { return nil }
                let b = o.boundingBox
                return Line(text: text, box: CGRect(x: b.minX * w, y: (1 - b.maxY) * h, width: b.width * w, height: b.height * h))
            }
            return ordered(lines)
        }

        /// Reading order: rows from the top, each row's lines from the left. A line joins the row of the line above it
        /// when their heights overlap by half the shorter one's or more (two halves of one line of text, a lone mark
        /// beside a line, whatever their middles), else it starts the next row.
        static func ordered(_ lines: [Line]) -> [Line] {
            var rows: [[Line]] = []
            for line in lines.sorted(by: { $0.box.midY < $1.box.midY }) {
                if let anchor = rows.last?.first {
                    let overlap = min(anchor.box.maxY, line.box.maxY) - max(anchor.box.minY, line.box.minY)
                    if overlap >= 0.5 * min(anchor.box.height, line.box.height) {
                        rows[rows.count - 1].append(line)
                        continue
                    }
                }
                rows.append([line])
            }
            return rows.flatMap { $0.sorted { $0.box.minX < $1.box.minX } }
        }

        /// A string as it is matched: lowercased, its letters and digits only, a dotless i read as an i, U+FFFD kept
        /// and an emoji made U+FFFD (a picture, which the recognizer reads as any one letter or none).
        static func normalize(_ s: String) -> [Character] {
            var out: [Character] = []
            for ch in s.lowercased() {
                if ch == wildcard || ch.unicodeScalars.contains(where: { $0.properties.isEmojiPresentation }) {
                    out.append(wildcard)
                } else if ch == "\u{0131}" {
                    out.append("i")
                } else if ch.isLetter || ch.isNumber {
                    out.append(ch)
                }
            }
            return out
        }

        /// The letters the recognizer trades for one another, as one (probed: "l0g." for "log.", "APl" for "API"): a
        /// zero is an o, a one and an i (a capital I lowercased) are an l.
        static func fold(_ c: Character) -> Character {
            switch c {
            case "0": return "o"
            case "1", "i": return "l"
            default: return c
            }
        }

        /// How the lines read lie against the strings shown, both in their order (`match`).
        struct Match: Equatable {
            /// Per line read: its letters that the strings do not hold at its place, or hold as other letters.
            var lineErrors: [Int]
            /// Per string shown: its letters read nowhere at its place, or read as other letters.
            var stringErrors: [Int]
            /// Pieces of three letters or more of a string shown that nothing read at its place: words not drawn.
            var missing: [String]
            /// Pieces of three letters or more read where no string shown holds them: words drawn that the model does
            /// not hold there.
            var extra: [String]
        }

        /// The lines read laid against the strings shown, both in their order, letter by letter: the alignment of the
        /// one text with the other that misreads the fewest letters and leaves the fewest standing alone, a run of
        /// letters standing alone counting less than as many apart (a misread 2, a run alone 3 for its first letter and
        /// 2 for each after it: Gotoh's affine gaps, so a word drawn or left out stands alone whole rather than in
        /// pieces matched by chance to its neighbours' letters); a letter for its look-alike, U+FFFD for any one letter
        /// or none, and the letter of a line of one letter cost nothing. A string is found only at its own place, so
        /// one inside another's text (the title's "Coach" in the meta row's "COACH") is never found there, and a word
        /// the view drew of its own is a word read where no string has it. The errors counted are letters: one per
        /// misread, one per letter alone.
        static func match(lines: [String], strings: [String]) -> Match {
            var r: [Character] = [], rLine: [Int] = [], alone: [Bool] = [], rText: [Character] = []
            for (i, l) in lines.enumerated() {
                let n = normalize(l)
                rText += n
                r += n.map(fold)
                rLine += Array(repeating: i, count: n.count)
                alone += Array(repeating: n.count < 2, count: n.count)
            }
            var s: [Character] = [], sOf: [Int] = [], sText: [Character] = []
            for (j, t) in strings.enumerated() {
                let n = normalize(t)
                sText += n
                s += n.map(fold)
                sOf += Array(repeating: j, count: n.count)
            }
            let n = r.count, m = s.count, w = m + 1, cells = (n + 1) * w
            let misread = 2, open = 3, extend = 2, never = Int.max / 4
            func paired(_ i: Int, _ j: Int) -> Bool { r[i] == s[j] || r[i] == wildcard || s[j] == wildcard }
            func readFree(_ i: Int) -> Bool { r[i] == wildcard || alone[i] }
            func shownFree(_ j: Int) -> Bool { s[j] == wildcard }
            func least(_ a: Int, _ b: Int, _ c: Int) -> (Int, UInt8) { a <= b && a <= c ? (a, 0) : b <= c ? (b, 1) : (c, 2) }
            // three states per cell (the first i letters read against the first j shown): 0 the last two paired, 1 the
            // last letter read standing alone, 2 the last letter shown standing alone; `from`: the state each came from
            var cost = [[Int]](repeating: [Int](repeating: never, count: cells), count: 3)
            var from = [[UInt8]](repeating: [UInt8](repeating: 0, count: cells), count: 3)
            cost[0][0] = 0
            for i in 0...n {
                for j in 0...m {
                    let c = i * w + j
                    if i > 0, j > 0 {
                        let p = c - w - 1
                        let (best, k) = least(cost[0][p], cost[1][p], cost[2][p])
                        cost[0][c] = best + (paired(i - 1, j - 1) ? 0 : misread)
                        from[0][c] = k
                    }
                    if i > 0 {
                        let p = c - w, free = readFree(i - 1)
                        (cost[1][c], from[1][c]) = least(cost[0][p] + (free ? 0 : open), cost[1][p] + (free ? 0 : extend),
                                                         cost[2][p] + (free ? 0 : open))
                    }
                    if j > 0 {
                        let p = c - 1, free = shownFree(j - 1)
                        (cost[2][c], from[2][c]) = least(cost[0][p] + (free ? 0 : open), cost[1][p] + (free ? 0 : open),
                                                         cost[2][p] + (free ? 0 : extend))
                    }
                }
            }
            // the alignment, from its end back
            var out = Match(lineErrors: Array(repeating: 0, count: lines.count), stringErrors: Array(repeating: 0, count: strings.count),
                            missing: [], extra: [])
            var path: [(step: UInt8, i: Int, j: Int)] = []
            var i = n, j = m
            var state = least(cost[0][n * w + m], cost[1][n * w + m], cost[2][n * w + m]).1
            while i > 0 || j > 0 {
                let back = from[Int(state)][i * w + j]
                switch state {
                case 0:
                    path.append((0, i - 1, j - 1))
                    if !paired(i - 1, j - 1) {
                        out.lineErrors[rLine[i - 1]] += 1
                        out.stringErrors[sOf[j - 1]] += 1
                    }
                    i -= 1
                    j -= 1
                case 1:
                    path.append((1, i - 1, -1))
                    if !readFree(i - 1) { out.lineErrors[rLine[i - 1]] += 1 }
                    i -= 1
                default:
                    path.append((2, -1, j - 1))
                    if !shownFree(j - 1) { out.stringErrors[sOf[j - 1]] += 1 }
                    j -= 1
                }
                state = back
            }
            // runs of letters standing alone: a word not drawn, or a word drawn that is none of the strings there
            var shownRun: [Int] = [], readRun: [Int] = []
            func endShown() {
                if shownRun.count >= 3, let first = shownRun.first {
                    out.missing.append(String(shownRun.map { sText[$0] }) + " of " + strings[sOf[first]].debugDescription)
                }
                shownRun = []
            }
            func endRead() {
                if readRun.count >= 3, let first = readRun.first {
                    out.extra.append(String(readRun.map { rText[$0] }) + " in " + lines[rLine[first]].debugDescription)
                }
                readRun = []
            }
            for p in path.reversed() {
                if p.step == 2, !shownFree(p.j), shownRun.last.map({ sOf[$0] == sOf[p.j] }) ?? true {
                    shownRun.append(p.j)
                } else {
                    endShown()
                    if p.step == 2, !shownFree(p.j) { shownRun = [p.j] }
                }
                if p.step == 1, !readFree(p.i), readRun.last.map({ rLine[$0] == rLine[p.i] }) ?? true {
                    readRun.append(p.i)
                } else {
                    endRead()
                    if p.step == 1, !readFree(p.i) { readRun = [p.i] }
                }
            }
            endShown()
            endRead()
            return out
        }

        /// How many letters of a line or a string `count` letters long may be misread: one in ten, at least one from
        /// five letters, none below.
        static func allowed(_ count: Int) -> Int { count < 5 ? 0 : max(1, count / 10) }
    }

    /// The matcher itself, on lines and strings whose answer is known.
    func testTheDrawnTextMatcher() {
        XCTAssertEqual(DrawnText.normalize("• COACH · WK 06 / 12"), Array("coachwk0612"))
        XCTAssertEqual(DrawnText.normalize("Hi Kalan\u{0131}."), Array("hikalani"))
        XCTAssertEqual(DrawnText.normalize("moving\u{1F4AA}\u{2026}"), Array("moving\u{FFFD}"), "an emoji is a picture: any one letter or none")
        XCTAssertEqual(DrawnText.normalize("No key? \u{2192}"), Array("nokey"), "an arrow is a mark of its own")
        XCTAssertEqual("l0g".map(DrawnText.fold), "log".map(DrawnText.fold), "a zero for an o")
        XCTAssertEqual("apl".map(DrawnText.fold), "api".map(DrawnText.fold), "an l for an i")
        XCTAssertNotEqual("lag".map(DrawnText.fold), "log".map(DrawnText.fold), "an a is no o")
        func m(_ lines: [String], _ strings: [String]) -> DrawnText.Match { DrawnText.match(lines: lines, strings: strings) }
        let hub = ["COACH \u{00B7} WK 06 / 12", "Hi Kalani.", "Coach", "ready.", "3 exchanges so far. Pick up where you left off, or start a new thread."]
        let read = ["• COACH • WK 06 / 12", "Hi Kalani.", "COACH", "READY.", "3 exchanges so far. Pick up where you left off, or", "start a new thread."]
        XCTAssertEqual(m(read, hub), DrawnText.Match(lineErrors: [0, 0, 0, 0, 0, 0], stringErrors: [0, 0, 0, 0, 0], missing: [], extra: []),
                       "every string at its place, a wrapped one in pieces")
        // a string inside another is found only at its own place
        var r = m(read.filter { $0 != "COACH" }, hub)
        XCTAssertEqual(r.stringErrors, [0, 0, 5, 0, 0], "the title not drawn: the meta row's COACH is not its place")
        XCTAssertEqual(r.missing, ["coach of \"Coach\""])
        r = m(read.filter { $0 != "READY." }, hub)
        XCTAssertEqual(r.stringErrors, [0, 0, 0, 5, 0], "the accent not drawn: the body's \"thread\" is not its place")
        XCTAssertEqual(r.missing, ["ready of \"ready.\""])
        // a word of the view's own between the page's strings, or inside a line
        r = m(["ANTHROPIC API KEY", "sk-ant-...", "Paste", "CONNECT"], ["Anthropic API Key", "sk-ant-...", "CONNECT"])
        XCTAssertEqual(r.lineErrors, [0, 0, 5, 0])
        XCTAssertEqual(r.extra, ["paste in \"Paste\""])
        r = m(["Get a key from your Anthropic account: paste console.anthropic.com"], ["Get a key from your Anthropic account: console.anthropic.com"])
        XCTAssertEqual(r.lineErrors, [5], "five letters of 55 drawn where the string has none")
        XCTAssertEqual(r.extra.count, 1, "a word, within the line's allowance all the same: \(r.extra)")
        // a word not drawn, whatever the string's length
        r = m(["Get a key from your Anthropic account:", "Create key, then paste it here."],
              ["Get a key from your Anthropic account: console.anthropic.com \u{2192} API Keys \u{2192} Create key, then paste it here."])
        XCTAssertEqual(r.stringErrors, [26], "console.anthropic.com and API Keys")
        XCTAssertEqual(r.missing.count, 1, "one piece: \(r.missing)")
        // what the recognizer does to a drawing: a misread letter, look-alikes, the mended surrogate, an emoji, an icon
        r = m(["Anthropic bills usage \u{2014} typically a tew", "cents per chat."], ["Anthropic bills usage \u{2014} typically a few cents per chat."])
        XCTAssertEqual(r, DrawnText.Match(lineErrors: [1, 0], stringErrors: [1], missing: [], extra: []), "one misread letter")
        XCTAssertEqual(m(["programme, and react to what you", "l0g."], ["programme, and react to what you log."]).stringErrors, [0])
        XCTAssertEqual(m(["include APl access."], ["include API access."]).stringErrors, [0])
        XCTAssertEqual(m(["Hi Kalani.", "COACH Q"], ["Hi Kalani \u{FFFD}.", "Coach \u{FFFD}"]),
                       DrawnText.Match(lineErrors: [0, 0], stringErrors: [0, 0], missing: [], extra: []), "U+FFFD: nothing, or any one letter")
        XCTAssertEqual(m(["the squat is moving L"], ["the squat is moving\u{1F4AA}\u{2026}"]).lineErrors, [0], "an emoji read as a letter")
        XCTAssertEqual(m(["ACCOUNT", "L\u{2192}", "Disconnect"], ["Account", "Disconnect"]).lineErrors, [0, 0, 0], "an icon's stroke read as a letter")
        // the order is the column's
        r = m(["Disconnect", "Open Chat"], ["Open Chat", "Disconnect"])
        XCTAssertTrue(r.lineErrors[0] > DrawnText.allowed(10) || r.lineErrors[1] > DrawnText.allowed(8),
                      "rows read in another order are not the model's: \(r)")
        XCTAssertEqual(DrawnText.allowed(4), 0)
        XCTAssertEqual(DrawnText.allowed(5), 1)
        XCTAssertEqual(DrawnText.allowed(31), 3)
    }

    /// Reading order, on boxes the recognizer gave (probed): a meta label wrapped around the avatar reads its first
    /// line, the avatar, then its second; a mark on a line's row reads after the line whatever their middles.
    func testTheLinesAreReadInRowsFromTheLeft() {
        typealias L = DrawnText.Line
        let first = L(text: "COACH \u{2022} WK 06 / 12", box: CGRect(x: 33.3, y: 52.0, width: 170.7, height: 13.5))
        let avatar = L(text: "K", box: CGRect(x: 269.3, y: 57.3, width: 16.0, height: 16.0))
        let second = L(text: "\u{2022} BUILD", box: CGRect(x: 37.3, y: 67.8, width: 65.4, height: 12.3))
        XCTAssertEqual(DrawnText.ordered([second, avatar, first]).map(\.text), [first.text, avatar.text, second.text])
        let mark = L(text: "?", box: CGRect(x: 346.1, y: 77.9, width: 9.8, height: 11.4))
        let label = L(text: "\u{2022} COACH \u{2022} WK 06 / 12", box: CGRect(x: 17.9, y: 77.9, width: 131.6, height: 13.1))
        XCTAssertEqual(DrawnText.ordered([mark, label]).map(\.text), [label.text, mark.text], "one row, from the left")
        let line = L(text: "Save key &", box: CGRect(x: 43.9, y: 683.0, width: 121.5, height: 23.8))
        let arrow = L(text: "\u{2192}", box: CGRect(x: 238.7, y: 687.6, width: 22.6, height: 20.0))
        let next = L(text: "start coaching", box: CGRect(x: 43.7, y: 704.0, width: 158.1, height: 26.6))
        XCTAssertEqual(DrawnText.ordered([next, arrow, line]).map(\.text), [line.text, arrow.text, next.text])
    }
}
#endif
