#if os(iOS)
import SwiftUI
import UIKit
import XCTest
@testable import FPUI
import FPCore

/// Renders the native chat for every coach fixture and the variants below (plan task C6's
/// acceptance): both rooms × the phone's light and dark settings × the three text sizes the chat
/// draws at (.large, .xLarge, .xxLarge), on a 390 × 844 pt screen with an iPhone's safe areas, at
/// 2×. With FPUI_SHOTS set
/// (xcodebuild passes TEST_RUNNER_FPUI_SHOTS), every render is written there as PNG, beside an
/// unscrolled render of the whole conversation, for the contact sheets
/// (ios/App/FPKit/Tools/chat-contact). Without it the same matrix renders for one size, so a crash
/// or a blank screen still fails the run.
///
/// The chat pushed in the Coach tab (build 61, plan task N12; contract 6.3, 12, D9) sits over the
/// 83 pt glass tab bar instead of the 34 pt home indicator: `heavyweight-chat`, `intake` and `empty`
/// render again with that inset, both rooms × light and dark × the three sizes, the composer's
/// bottom edge at least 8 pt above the bar and the conversation drawn
/// (`native/<fixture>/<room>-<light|dark>-<size>-bar83.png` under FPUI_SHOTS, beside the 34 pt
/// renders the contact sheets read). The 34 pt renders are unchanged.
@MainActor
final class CoachRenderTests: XCTestCase {
    static let screen = CGSize(width: 390, height: 844)
    static let safeTop: CGFloat = 47
    static let safeBottom: CGFloat = 34
    /// The glass tab bar's cover on every iPhone the tab root runs on, Face ID or Home button (the H0
    /// probe: 01-contract-delta.md 14.1). The pushed chat keeps the safe area, so its column ends there.
    static let glassBar: CGFloat = 83
    /// The chats drawn over the glass bar (contract 12, "FPKit on iOS"): a conversation, setup, the
    /// empty chat.
    static let barFixtures = ["heavyweight-chat", "intake", "empty"]
    static let sizes: [(String, DynamicTypeSize)] = [("large", .large), ("xLarge", .xLarge), ("xxLarge", .xxLarge)]
    static let rooms: [(String, Room)] = [("heavyweight", .heavyweight), ("lime", .lime)]

    /// States no fixture holds, drawn as fixtures of their own: a fixture with a draft in the box
    /// of four lines (every one in view) and of six (four whole lines, the rest a scroll away).
    /// Tools/chat-contact/web-shots.js draws the same variants on the web.
    static let variants: [(name: String, base: String, apply: (inout CoachModel) -> Void)] = [
        ("draft-4-lines", "heavyweight-chat", { $0.composer.draft = Draft(text: ComposerTests.draft(4), nonce: "draft-4-lines") }),
        ("draft-6-lines", "heavyweight-chat", { $0.composer.draft = Draft(text: ComposerTests.draft(6), nonce: "draft-6-lines") }),
    ]

    /// Every fixture, then every variant, by name.
    static func models() throws -> [(String, CoachModel)] {
        var out = try CoachFixtures.names().map { ($0, try CoachFixtures.model($0)) }
        for v in variants {
            var m = try CoachFixtures.model(v.base)
            v.apply(&m)
            out.append((v.name, m))
        }
        return out
    }

    private var shots: URL? {
        ProcessInfo.processInfo.environment["FPUI_SHOTS"].flatMap { $0.isEmpty ? nil : URL(fileURLWithPath: $0, isDirectory: true) }
    }

    /// A host that serves the photos the fixtures name (the owner's sent photo, a shared one) and the
    /// seed's owner (Roberto) as the avatar, as the web shot shows them.
    static let host = CoachHost(send: { _ in }, image: { key in CoachRenderTests.photo(key) }, avatar: "R")

    /// A stand-in photo: a bar over a plate (warm on the paper grey), the same as the web shot's.
    static func photo(_ key: String) -> UIImage? {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: 480, height: 360), format: format).image { ctx in
            UIColor(red: 0.80, green: 0.78, blue: 0.74, alpha: 1).setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 480, height: 360))
            UIColor(red: 0.20, green: 0.22, blue: 0.26, alpha: 1).setFill()
            ctx.fill(CGRect(x: 40, y: 170, width: 400, height: 20))
            UIColor(red: 0.10, green: 0.11, blue: 0.13, alpha: 1).setFill()
            ctx.cgContext.fillEllipse(in: CGRect(x: 60, y: 110, width: 60, height: 140))
            ctx.cgContext.fillEllipse(in: CGRect(x: 360, y: 110, width: 60, height: 140))
        }
    }

    /// The chat on a phone screen: the system's safe areas replaced by an iPhone's, so every render
    /// is the same whatever simulator runs the test. `safeBottom`: the home indicator's 34 pt, or the
    /// glass tab bar's 83 under the chat pushed in the Coach tab.
    struct Phone: View {
        let model: CoachModel
        let size: DynamicTypeSize
        var unscrolled = false
        var toast: ToastRequest?
        var confirm: ConfirmRequest?
        var safeBottom: CGFloat = CoachRenderTests.safeBottom
        /// Where the chat's header ends, in window coordinates (`CoachHeaderBottomKey`), as it changes.
        var onHeader: ((CGFloat) -> Void)?

        var body: some View {
            // the safe areas as a phone's (the status bar, the home indicator or the tab bar): what
            // ignores them (the room's ground, a confirm's dimming) reaches the screen's edges, as on
            // the phone
            CoachChatView(model: model, host: CoachRenderTests.host, toast: .constant(toast), confirm: .constant(confirm),
                          options: CoachChatOptions(unscrolledWidth: unscrolled ? CoachRenderTests.screen.width : nil))
                .safeAreaPadding(.top, CoachRenderTests.safeTop)
                .safeAreaPadding(.bottom, safeBottom)
                .environment(\.dynamicTypeSize, size)
                .onPreferenceChange(CoachHeaderBottomKey.self) { y in MainActor.assumeIsolated { onHeader?(y) } }
        }
    }

    /// Draws a view in a window with the phone's light or dark setting, at 2×: `size`, or `width`
    /// (the screen's, when nil) wide and as tall as the view (nil). `prepare` runs on the hosting view
    /// after each layout pass (a scroll moved to its end, CoachHomeRenderTests). At most `passes`
    /// layout passes wait for two captures to agree: a chat whose Thinking dots pulse never agrees.
    static func render<V: View>(_ view: V, size: CGSize?, phone style: UIUserInterfaceStyle, width: CGFloat? = nil,
                                passes: Int = 20, prepare: ((UIView) -> Void)? = nil) -> UIImage {
        let host = UIHostingController(rootView: view)
        host.safeAreaRegions = []
        let target = size ?? {
            let width = width ?? screen.width
            let fit = host.sizeThatFits(in: CGSize(width: width, height: 20000))
            return CGSize(width: width, height: ceil(fit.height))
        }()
        let window = UIWindow(frame: CGRect(origin: .zero, size: target))
        if let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first {
            window.windowScene = scene
        }
        window.overrideUserInterfaceStyle = style
        window.rootViewController = host
        window.isHidden = false
        host.view.frame = window.bounds
        if let prepare {
            host.view.layoutIfNeeded()
            prepare(host.view)
        }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2
        format.opaque = true
        func capture() -> UIImage {
            UIGraphicsImageRenderer(size: target, format: format).image { ctx in
                if !window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) {
                    host.view.layer.render(in: ctx.cgContext)
                }
            }
        }
        // settle: the text view lays a draft out a pass late and images arrive a turn late, so draw
        // until two captures agree
        var image = capture()
        for _ in 0..<passes {
            host.view.setNeedsLayout()
            host.view.layoutIfNeeded()
            prepare?(host.view)
            RunLoop.main.run(until: Date().addingTimeInterval(0.05))
            let next = capture()
            let same = difference(image, next) == 0
            image = next
            if same { break }
        }
        window.isHidden = true
        window.rootViewController = nil
        return image
    }

    /// A render's pixels: RGBA, premultiplied, row 0 at the top.
    static func bytes(_ c: CGImage) -> [UInt8] {
        var buf = [UInt8](repeating: 0, count: c.width * c.height * 4)
        let ctx = CGContext(data: &buf, width: c.width, height: c.height, bitsPerComponent: 8, bytesPerRow: c.width * 4,
                            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.draw(c, in: CGRect(x: 0, y: 0, width: c.width, height: c.height))
        return buf
    }

    /// Fraction of pixels that differ between two renders of the same size.
    static func difference(_ a: UIImage, _ b: UIImage) -> Double {
        guard let ca = a.cgImage, let cb = b.cgImage, ca.width == cb.width, ca.height == cb.height else { return 1 }
        let x = bytes(ca), y = bytes(cb)
        var differ = 0
        for i in stride(from: 0, to: x.count, by: 4) where x[i] != y[i] || x[i + 1] != y[i + 1] || x[i + 2] != y[i + 2] {
            differ += 1
        }
        return Double(differ) / Double(ca.width * ca.height)
    }

    /// The share of the image that is not the room's background: a blank or failed render has none.
    static func inked(_ image: UIImage, background: RGBA) -> Double {
        guard let c = image.cgImage else { return 0 }
        let w = c.width / 4, h = c.height / 4
        var buf = [UInt8](repeating: 0, count: w * h * 4)
        let ctx = CGContext(data: &buf, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.draw(c, in: CGRect(x: 0, y: 0, width: w, height: h))
        let br = Int(background.red * 255), bg = Int(background.green * 255), bb = Int(background.blue * 255)
        var ink = 0
        for i in stride(from: 0, to: buf.count, by: 4) where abs(Int(buf[i]) - br) + abs(Int(buf[i + 1]) - bg) + abs(Int(buf[i + 2]) - bb) > 24 {
            ink += 1
        }
        return Double(ink) / Double(w * h)
    }

    /// `inked` over the band of the render between `top` and `bottom` (points from the top), the
    /// screen's whole width; 0 for an empty band.
    static func inked(_ image: UIImage, background: RGBA, from top: CGFloat, to bottom: CGFloat) -> Double {
        guard let c = image.cgImage else { return 0 }
        let k = CGFloat(c.height) / image.size.height
        let y0 = max(0, Int((top * k).rounded(.up))), y1 = min(c.height, Int((bottom * k).rounded(.down)))
        guard y1 - y0 >= 4, let band = c.cropping(to: CGRect(x: 0, y: y0, width: c.width, height: y1 - y0)) else { return 0 }
        return inked(UIImage(cgImage: band, scale: image.scale, orientation: .up), background: background)
    }

    /// A pixel of the room's ground: at most 12 (summed over the channels, of 765) from `background`, so a
    /// sliver of a shape's edge (its antialiasing) is ground and a card or a hairline is not.
    private static func isGround(_ buf: [UInt8], _ i: Int, _ ground: (Int, Int, Int)) -> Bool {
        abs(Int(buf[i]) - ground.0) + abs(Int(buf[i + 1]) - ground.1) + abs(Int(buf[i + 2]) - ground.2) <= 12
    }

    /// Where the drawing ends: the bottom edge, in points from the top, of the lowest row of the render
    /// that holds anything but the room's ground (nil for a render of the bare ground).
    static func lowestInk(_ image: UIImage, background: RGBA) -> CGFloat? {
        guard let c = image.cgImage else { return nil }
        let buf = bytes(c)
        let ground = (Int(background.red * 255), Int(background.green * 255), Int(background.blue * 255))
        for y in stride(from: c.height - 1, through: 0, by: -1) {
            let row = y * c.width * 4
            for x in 0..<c.width where !isGround(buf, row + x * 4, ground) {
                return CGFloat(y + 1) * image.size.height / CGFloat(c.height)
            }
        }
        return nil
    }

    /// The composer's box, in points from the top: its bottom edge is where the chat's drawing ends (the composer is the
    /// column's last view, the ground below it), its top the first row of the ground above that edge at `x`, a point
    /// inside the field away from its placeholder and buttons (the field is the composer's card, never the ground, so
    /// the box reads as one run up to its top hairline).
    static func composerEdges(_ image: UIImage, background: RGBA, x: CGFloat) -> (top: CGFloat, bottom: CGFloat)? {
        guard let c = image.cgImage, let bottom = lowestInk(image, background: background) else { return nil }
        let k = CGFloat(c.height) / image.size.height
        let buf = bytes(c)
        let ground = (Int(background.red * 255), Int(background.green * 255), Int(background.blue * 255))
        let px = min(c.width - 1, Int(x * k))
        func groundAt(_ y: Int) -> Bool { isGround(buf, (y * c.width + px) * 4, ground) }
        var y = Int((bottom * k).rounded()) - 1
        // the edge's own antialiased sliver may be ground at x: the box's hairline is within 2 pt above it
        let reach = y - Int(2 * k)
        while y >= max(0, reach), groundAt(y) { y -= 1 }
        while y >= 0, !groundAt(y) { y -= 1 }
        return (CGFloat(y + 1) / k, bottom)
    }

    private func write(_ image: UIImage, _ path: String) throws {
        guard let shots else { return }
        let url = shots.appendingPathComponent("native").appendingPathComponent(path)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try XCTUnwrap(image.pngData()).write(to: url)
    }

    /// Every fixture and variant, both rooms (and an unknown room's own look), light and dark phone
    /// settings, three text sizes; every render inked, and the phone's setting never changing the chat.
    func testEveryFixtureRendersInBothRoomsAppearancesAndSizes() throws {
        FPFonts.register()
        let full = shots != nil
        // FPUI_ONLY=a,b renders only those fixtures (a quick look while iterating on the views)
        let only = ProcessInfo.processInfo.environment["FPUI_ONLY"].map { Set($0.split(separator: ",").map(String.init)) }
        var count = 0
        for (name, base) in try Self.models() where only?.contains(name) ?? true {
            var rooms = Self.rooms.map { ($0.0, CoachFixtures.model(base, in: $0.1)) }
            if case .other(let id) = base.room { rooms.append((id, base)) }
            for (roomName, model) in rooms {
                for (sizeName, size) in full ? Self.sizes : [Self.sizes[0]] {
                    let light = Self.render(Phone(model: model, size: size), size: Self.screen, phone: .light)
                    let dark = Self.render(Phone(model: model, size: size), size: Self.screen, phone: .dark)
                    XCTAssertEqual(light.size, Self.screen, "\(name) \(roomName)")
                    let bg = RoomTheme(model: model, system: size).rgba(.bg)
                    XCTAssertGreaterThan(Self.inked(light, background: bg), 0.01, "\(name) \(roomName) \(sizeName) draws")
                    XCTAssertLessThan(Self.difference(light, dark), 0.001,
                                      "\(name) \(roomName) \(sizeName): the chat wears its room whatever the phone's setting")
                    try write(light, "\(name)/\(roomName)-light-\(sizeName).png")
                    try write(dark, "\(name)/\(roomName)-dark-\(sizeName).png")
                    if full {
                        let whole = Self.render(Phone(model: model, size: size, unscrolled: true), size: nil, phone: .light)
                        try write(whole, "\(name)/\(roomName)-full-\(sizeName).png")
                    }
                    count += 1
                }
            }
        }
        XCTAssertGreaterThanOrEqual(count, only == nil ? 20 : 1)
    }

    /// The chat pushed in the Coach tab, over the glass tab bar (plan task N12; contract 6.3, 12, D9): the tab's
    /// navigation stack keeps the safe area, so the chat's column ends at the bar's 83 pt with no change to its model and
    /// its composer sits on its own 8 px above the bar, where the bar's items stay free to press; the conversation still
    /// draws between the header and the composer. Both rooms, the phone light and dark, the three sizes.
    func testTheChatOverTheGlassTabBarKeepsItsComposerAboveTheBar() throws {
        FPFonts.register()
        let bar = Self.screen.height - Self.glassBar
        // setup's Thinking dots pulse for good, so `intake` never draws two captures alike: its column is laid out by the
        // first pass, as every other chat's is (they agree at once), and five passes are enough where 20 cost a minute
        let passes = 5
        var count = 0
        for name in Self.barFixtures {
            let base = try CoachFixtures.model(name)
            for (roomName, room) in Self.rooms {
                let model = CoachFixtures.model(base, in: room)
                for (sizeName, size) in Self.sizes {
                    let what = "\(name) \(roomName) \(sizeName) over the bar"
                    let theme = RoomTheme(model: model, system: size)
                    var header: CGFloat = 0
                    let light = Self.render(Phone(model: model, size: size, safeBottom: Self.glassBar, onHeader: { header = $0 }),
                                            size: Self.screen, phone: .light, passes: passes)
                    let dark = Self.render(Phone(model: model, size: size, safeBottom: Self.glassBar), size: Self.screen, phone: .dark,
                                           passes: passes)
                    XCTAssertEqual(light.size, Self.screen, what)
                    XCTAssertLessThan(Self.difference(light, dark), 0.001, "\(what): the chat wears its room whatever the phone's setting")
                    // a point in the field right of its placeholder and left of Send, in either room at every size
                    let box = try XCTUnwrap(Self.composerEdges(light, background: theme.rgba(.bg), x: Self.screen.width * 0.75), "\(what): drawn")
                    XCTAssertLessThanOrEqual(box.bottom, bar - 8, "\(what): the composer's bottom edge at least 8 pt above the bar")
                    XCTAssertEqual(box.bottom, bar - theme.px(8), accuracy: 1, "\(what): the composer on its own 8 px above the bar")
                    XCTAssertGreaterThan(box.bottom - box.top, theme.px(44), "\(what): the composer's box, \(box)")
                    XCTAssertGreaterThan(header, Self.safeTop, "\(what): the header's bottom")
                    XCTAssertGreaterThan(Self.inked(light, background: theme.rgba(.bg), from: header, to: box.top), 0.01,
                                         "\(what): the conversation draws between the header (\(header)) and the composer (\(box.top))")
                    try write(light, "\(name)/\(roomName)-light-\(sizeName)-bar83.png")
                    try write(dark, "\(name)/\(roomName)-dark-\(sizeName)-bar83.png")
                    count += 1
                }
            }
        }
        XCTAssertEqual(count, Self.barFixtures.count * Self.rooms.count * Self.sizes.count)
    }

    /// The chat at its newest message: the composer at the foot, the end of the conversation above it.
    func testLongChatOpensAtItsEnd() throws {
        FPFonts.register()
        let model = try CoachFixtures.model("sixty")
        let image = Self.render(Phone(model: model, size: .large), size: Self.screen, phone: .light)
        XCTAssertGreaterThan(Self.inked(image, background: model.tokens.color(.bg)), 0.01)
        try write(image, "sixty/end-check.png")
    }

    /// The forwarded toast and confirm, in both rooms.
    func testToastAndConfirmRender() throws {
        FPFonts.register()
        let base = try CoachFixtures.model("heavyweight-chat")
        let toasts = [ToastRequest(text: "Previous programme restored", style: "ok", undo: nil),
                      ToastRequest(text: "New record: Bench Press 175 lb", style: "pr", undo: nil),
                      ToastRequest(text: "Storage full: the change was not saved", style: "err", undo: nil),
                      ToastRequest(text: "Bench Press removed", style: "ok", undo: "t-17"),
                      CoachChatView.photoFailedToast]
        let confirm = ConfirmRequest(id: "c-3", title: "Restore previous programme?", body: "Your current one is set aside: restoring again brings it back.",
                                     confirm: "Restore", cancel: nil, tone: nil)
        for (roomName, room) in Self.rooms {
            let model = CoachFixtures.model(base, in: room)
            for (i, toast) in toasts.enumerated() {
                let image = Self.render(Phone(model: model, size: .large, toast: toast), size: Self.screen, phone: .light)
                try write(image, "overlays/\(roomName)-toast-\(i).png")
            }
            let sheet = Self.render(Phone(model: model, size: .large, confirm: confirm), size: Self.screen, phone: .light)
            XCTAssertGreaterThan(Self.inked(sheet, background: model.tokens.color(.bg)), 0.3, "the confirm dims the screen")
            try write(sheet, "overlays/\(roomName)-confirm.png")
        }
    }
}
#endif
