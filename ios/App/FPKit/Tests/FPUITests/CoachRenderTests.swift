#if os(iOS)
import SwiftUI
import UIKit
import XCTest
@testable import FPUI
import FPCore

/// Renders the native chat for every coach fixture (plan task C6's acceptance): both rooms × the
/// phone's light and dark settings × the three text sizes the chat draws at (.large, .xLarge,
/// .xxLarge), on a 390 × 844 pt screen with an iPhone's safe areas, at 2×. With FPUI_SHOTS set
/// (xcodebuild passes TEST_RUNNER_FPUI_SHOTS), every render is written there as PNG, beside an
/// unscrolled render of the whole conversation, for the contact sheets
/// (ios/App/FPKit/Tools/chat-contact). Without it the same matrix renders for one size, so a crash
/// or a blank screen still fails the run.
@MainActor
final class CoachRenderTests: XCTestCase {
    static let screen = CGSize(width: 390, height: 844)
    static let safeTop: CGFloat = 47
    static let safeBottom: CGFloat = 34
    static let sizes: [(String, DynamicTypeSize)] = [("large", .large), ("xLarge", .xLarge), ("xxLarge", .xxLarge)]
    static let rooms: [(String, Room)] = [("heavyweight", .heavyweight), ("lime", .lime)]

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
    /// is the same whatever simulator runs the test.
    struct Phone: View {
        let model: CoachModel
        let size: DynamicTypeSize
        var unscrolled = false
        var toast: ToastRequest?
        var confirm: ConfirmRequest?

        var body: some View {
            // the safe areas as a phone's (the status bar, the home indicator): what ignores them
            // (the room's ground, a confirm's dimming) reaches the screen's edges, as on the phone
            CoachChatView(model: model, host: CoachRenderTests.host, toast: .constant(toast), confirm: .constant(confirm),
                          options: CoachChatOptions(unscrolledWidth: unscrolled ? CoachRenderTests.screen.width : nil))
                .safeAreaPadding(.top, CoachRenderTests.safeTop)
                .safeAreaPadding(.bottom, CoachRenderTests.safeBottom)
                .environment(\.dynamicTypeSize, size)
        }
    }

    /// Draws a view in a window with the phone's light or dark setting, at 2×.
    static func render<V: View>(_ view: V, size: CGSize?, phone style: UIUserInterfaceStyle) -> UIImage {
        let host = UIHostingController(rootView: view)
        host.safeAreaRegions = []
        let width = screen.width
        let target = size ?? {
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
        for _ in 0..<20 {
            host.view.setNeedsLayout()
            host.view.layoutIfNeeded()
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

    /// Fraction of pixels that differ between two renders of the same size.
    static func difference(_ a: UIImage, _ b: UIImage) -> Double {
        guard let ca = a.cgImage, let cb = b.cgImage, ca.width == cb.width, ca.height == cb.height else { return 1 }
        func bytes(_ c: CGImage) -> [UInt8] {
            var buf = [UInt8](repeating: 0, count: c.width * c.height * 4)
            let ctx = CGContext(data: &buf, width: c.width, height: c.height, bitsPerComponent: 8, bytesPerRow: c.width * 4,
                                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
            ctx.draw(c, in: CGRect(x: 0, y: 0, width: c.width, height: c.height))
            return buf
        }
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

    private func write(_ image: UIImage, _ path: String) throws {
        guard let shots else { return }
        let url = shots.appendingPathComponent("native").appendingPathComponent(path)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try XCTUnwrap(image.pngData()).write(to: url)
    }

    /// Every fixture, both rooms (and an unknown room's own look), light and dark phone settings,
    /// three text sizes; every render inked, and the phone's setting never changing the chat.
    func testEveryFixtureRendersInBothRoomsAppearancesAndSizes() throws {
        FPFonts.register()
        let full = shots != nil
        // FPUI_ONLY=a,b renders only those fixtures (a quick look while iterating on the views)
        let only = ProcessInfo.processInfo.environment["FPUI_ONLY"].map { Set($0.split(separator: ",").map(String.init)) }
        var count = 0
        for name in try CoachFixtures.names() where only?.contains(name) ?? true {
            let base = try CoachFixtures.model(name)
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
                      ToastRequest(text: "Bench Press removed", style: "ok", undo: "t-17")]
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
