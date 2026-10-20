#if os(iOS)
import SwiftUI
import UIKit
import Vision
import XCTest
@testable import FPUI
import FPCore

/// Renders the native Coach tab's root, the hub and the connect screen (plan task N12; contract 6.2, 12 "FPKit on iOS",
/// I10), for every coach home fixture (`CoachHomeFixtures`: the hand-made ones now, the page-built ones as they land):
/// both rooms (another room's compiled defaults, as CoachRenderTests draws the chat's fixtures; an unknown room's own look
/// besides) × the phone's light and dark settings × the three text sizes the hub draws at (.large, .xLarge, .xxLarge), at
/// 2×, on two phones under the glass tab bar: 390 × 844 with its 47 pt status bar, and 320 × 568 (Display Zoom on a
/// Home-button iPhone) with its 20 pt one, both with the bar's 83 pt under the column (the H0 probe measured the glass
/// bar at 83 pt on every iPhone, Face ID or Home button: 01-contract-delta.md 14.1; Display Zoom was not measured, and
/// takes the same 83).
///
/// Every render draws exactly when its model has something to draw (a model with nothing draws the room's bare ground)
/// and the phone's setting never changes it; the column scrolled to its end stops above the bar; every string a render
/// draws is the fixture's, and every string the model shows is drawn (I10, read off the renders by Vision's text
/// recognition: `DrawnText`). With FPUI_SHOTS set (xcodebuild passes TEST_RUNNER_FPUI_SHOTS) the renders are written
/// there for the contact sheets (plan task N14):
///
///     native/home/<fixture>/<room>-<light|dark>-<size>.png   the tab as the 390 × 844 phone shows it
///     native/home/<fixture>/<room>-full-<size>.png           the whole column, unscrolled, 390 wide
///     native/home/<fixture>/<room>-end-xxLarge.png           the tab scrolled to its end, at .xxLarge
///     native/home/<fixture>/320/…                            the same three for the 320 × 568 phone
@MainActor
final class CoachHomeRenderTests: XCTestCase {
    /// A phone: its screen and the safe areas a hosting controller in the Coach tab gets there (the status bar above, the
    /// glass tab bar's cover below).
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

    /// The hub on a phone: the system's safe areas replaced by the phone's, so every render is the same whatever simulator
    /// runs the test. `unscrolled`: the whole column at the phone's width (CoachHomeOptions.unscrolledWidth).
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

    /// The fixture in each room: both rooms, then its own when that is a room this build does not know.
    static func models(_ name: String) throws -> [(String, CoachHomeModel)] {
        var out = try rooms.map { ($0.0, try CoachHomeFixtures.model(name, in: $0.1)) }
        let own = try CoachHomeFixtures.model(name)
        if case .other(let id) = own.room { out.append((id, own)) }
        return out
    }

    /// Every string a model shows, as contract 6.2 lays the routes out: the meta label, the avatar and the hero on every
    /// route; each group's head and its rows' titles and subs on the hub; the connect block's field label, placeholder,
    /// CTA label and title, help and starter link on the connect screen; both, the groups first, on a newer page's
    /// route. Empty strings draw nothing and are left out.
    static func shown(_ m: CoachHomeModel) -> [String] {
        var out = [m.meta.label, m.meta.avatar ?? "", m.hero.greet, m.hero.title, m.hero.accent, m.hero.body]
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

    /// Every fixture in both rooms, light and dark, three sizes, both phones: the tab as the phone shows it, inked exactly
    /// when the model shows something, the same whatever the phone's setting.
    func testEveryFixtureRendersInBothRoomsAppearancesAndSizes() throws {
        let names = try CoachHomeFixtures.names()
        XCTAssertFalse(names.isEmpty, "the coach home fixtures")
        var count = 0
        for name in names {
            for (roomName, model) in try Self.models(name) {
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
        XCTAssertGreaterThanOrEqual(count, names.count * Self.rooms.count * Self.screens.count * Self.sizes.count)
    }

    /// The tab scrolled to its end at the largest text, where the column is tallest: it stops above the glass bar, its last
    /// block at least the column's own 24 px clear of the bar's 83 pt (the scroll view keeps the bar's inset, so the end
    /// of the hub is never under the glass). On both phones, in both rooms; on the 320 pt phone the connect screen and the
    /// hub with its groups are taller than the screen, so some fixture's end is scrolled to.
    func testTheTabScrolledToItsEndStopsAboveTheBar() throws {
        var scrolled = 0
        for name in try CoachHomeFixtures.names() {
            for (roomName, model) in try Self.models(name) {
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

    /// Every string a render draws is the fixture's, and every string its model shows is drawn (contract I10): the whole
    /// column of each fixture in both rooms, at the large size on the 390 pt phone and at .xxLarge on the 320 pt one (the
    /// most lines wrapped), read back by text recognition (`DrawnText`). Each line read must be a piece of the strings the
    /// model shows, in their order (so nothing is drawn that the page did not send: no word of the view's own, no row or
    /// field a newer page sent that this build leaves out; a line the recognizer runs on into its neighbour, the meta
    /// label's last line into the avatar, stays a piece), and each string the model shows must be found in what was read
    /// (so none is cut or left out). Every string the model shows is one the fixture file holds, so what is drawn is the
    /// page's own words and never a default of the decoder or the view. The view's own marks (the meta row's disc, a
    /// row's chevron, CONNECT's arrow, the icons) are no letters or digits and are not text.
    func testEveryStringARenderDrawsIsTheFixtures() throws {
        var lines = 0, strings = 0
        for name in try CoachHomeFixtures.names() {
            let file = try CoachHomeFixtures.strings(name)
            for (roomName, model) in try Self.models(name) {
                let shown = Self.shown(model)
                for s in shown { XCTAssertTrue(file.contains(s), "\(name) \(roomName): \(s.debugDescription) is a string of the file") }
                let source = DrawnText.normalize(shown.joined(separator: " "))
                for (screen, sizeName, size) in [(Self.phone, "large", DynamicTypeSize.large), (Self.zoomed, "xxLarge", .xxLarge)] {
                    let what = "\(name) \(roomName) \(screen.name) \(sizeName)"
                    let image = CoachRenderTests.render(Phone(model: model, size: size, screen: screen, unscrolled: true), size: nil,
                                                        phone: .light, width: screen.size.width)
                    let read = try DrawnText.read(image)
                    for line in read {
                        let l = DrawnText.normalize(line)
                        guard l.count >= 2 else { continue }
                        XCTAssertLessThanOrEqual(DrawnText.distance(l, within: source), DrawnText.allowed(l.count),
                                                 "\(what): drew \(line.debugDescription), which is none of the model's strings (\(shown))")
                        lines += 1
                    }
                    let all = DrawnText.normalize(read.joined(separator: " "))
                    for s in shown {
                        let n = DrawnText.normalize(s)
                        guard !n.isEmpty else { continue }
                        XCTAssertLessThanOrEqual(DrawnText.distance(n, within: all), DrawnText.allowed(n.count),
                                                 "\(what): \(s.debugDescription) is not drawn whole (read: \(read))")
                        strings += 1
                    }
                }
            }
        }
        XCTAssertGreaterThan(lines, 0, "text was read off the renders")
        XCTAssertGreaterThan(strings, 0, "the models show strings")
    }

    /// The text a render draws, read back with Vision's text recognition (the accurate recognizer, no language correction),
    /// and matched to strings. SwiftUI keeps no drawn text a test can read: VoiceOver's elements carry the page's strings as
    /// labels (CoachHomeViewTests walks them), but a label is not what is drawn, and the decorative texts (the avatar, the
    /// visible field label) have none. Recognition reads glyphs, not strings, so the match is lenient where it must be and
    /// no more: both sides lowercased and cut to their letters and digits (white space and punctuation go, so do the meta
    /// row's disc, a row's chevron and CONNECT's arrow, which are marks of the view's own), a dotless "ı" read as an "i", a
    /// mended lone surrogate (U+FFFD, drawn as the face's replacement glyph) matching any one letter or none, and a line
    /// allowed one misread letter in ten (none under five). Probed on iOS 27.0 over the hand-made fixtures and
    /// CoachHomeViewTests' hub, connect and unknown-route models, both rooms, at 390 pt in three sizes and at 320 pt in two
    /// (60 renders): every line was read, none with more than one error ("tew" for "few", "APl" for "API", "Kalanı").
    enum DrawnText {
        static let wildcard: Character = "\u{FFFD}"

        /// The lines read off a render in reading order: by rows about 4 ‰ of the render tall, top first, each row left to
        /// right.
        static func read(_ image: UIImage) throws -> [String] {
            let cg = try XCTUnwrap(image.cgImage)
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = false
            request.recognitionLanguages = ["en-US"]
            try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
            // Vision's boxes are normalised with their origin at the bottom left
            func row(_ o: VNRecognizedTextObservation) -> Int { -Int((o.boundingBox.midY * 250).rounded()) }
            let found = (request.results ?? []).sorted { a, b in
                row(a) != row(b) ? row(a) < row(b) : a.boundingBox.minX < b.boundingBox.minX
            }
            return found.compactMap { $0.topCandidates(1).first?.string }
        }

        /// A string as it is matched: lowercased, its letters and digits only, a dotless i read as an i, U+FFFD kept.
        static func normalize(_ s: String) -> [Character] {
            var out: [Character] = []
            for ch in s.lowercased() {
                if ch == wildcard {
                    out.append(ch)
                } else if ch == "\u{0131}" {
                    out.append("i")
                } else if ch.isLetter || ch.isNumber {
                    out.append(ch)
                }
            }
            return out
        }

        /// The fewest letters to change, add or drop for `line` to be a piece of `text` (any run of it: what precedes and
        /// follows the piece is free); U+FFFD on either side matches any one letter, or none, at no cost.
        static func distance(_ line: [Character], within text: [Character]) -> Int {
            guard !line.isEmpty else { return 0 }
            guard !text.isEmpty else { return line.filter { $0 != wildcard }.count }
            var prev = [Int](repeating: 0, count: text.count + 1)   // an empty line is a piece anywhere
            var cur = prev
            for l in line {
                cur[0] = prev[0] + (l == wildcard ? 0 : 1)
                for j in 1...text.count {
                    let t = text[j - 1]
                    let change = prev[j - 1] + (t == l || t == wildcard || l == wildcard ? 0 : 1)
                    let skipText = cur[j - 1] + (t == wildcard ? 0 : 1)
                    let skipLine = prev[j] + (l == wildcard ? 0 : 1)
                    cur[j] = min(change, skipText, skipLine)
                }
                swap(&prev, &cur)
            }
            return prev.min() ?? line.count
        }

        /// How many letters of a match `count` long may be misread: one in ten, at least one from five letters, none
        /// below.
        static func allowed(_ count: Int) -> Int { count < 5 ? 0 : max(1, count / 10) }
    }

    /// The matcher itself, on strings whose answer is known.
    func testTheDrawnTextMatcher() {
        func d(_ a: String, _ b: String) -> Int { DrawnText.distance(DrawnText.normalize(a), within: DrawnText.normalize(b)) }
        XCTAssertEqual(DrawnText.normalize("• COACH · WK 06 / 12"), Array("coachwk0612"))
        XCTAssertEqual(DrawnText.normalize("Hi Kalan\u{0131}."), Array("hikalani"))
        XCTAssertEqual(d("Plug in your", "Plug in your Claude API key"), 0, "a wrapped line is a piece")
        XCTAssertEqual(d("YOUR COACH.", "your coach."), 0, "case and punctuation are not matched")
        XCTAssertEqual(d("a tew cents", "typically a few cents per chat"), 1, "one misread letter")
        XCTAssertEqual(d("tap to start", "No messages yet \u{2014} tap to start"), 0, "a piece anywhere in the string")
        XCTAssertEqual(d("Hi Kalani .", "Hi Kalani \u{FFFD}."), 0, "U+FFFD may be read as nothing")
        XCTAssertEqual(d("COACH Q", "Coach \u{FFFD}"), 0, "or as any one letter")
        XCTAssertEqual(d("Open Chat", "Disconnect"), 5)
        XCTAssertEqual(d("Tap to start", "Open Chat"), 7, "a line the model does not hold is far from its strings")
        XCTAssertEqual(DrawnText.allowed(4), 0)
        XCTAssertEqual(DrawnText.allowed(5), 1)
        XCTAssertEqual(DrawnText.allowed(31), 3)
    }
}
#endif
