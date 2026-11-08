#if os(iOS)
import SwiftUI
import UIKit
import XCTest
import FPCore
@testable import FPUI

/// The room's ground under the glass bar on every screen the Coach stack shows (11-shell.md H9 fix-1; contract 6.1, delta
/// 16.1).
///
/// iOS 26.x draws the glass bar, its platter and its items, in the style it reads from what is drawn under the bar only
/// where a scroll view lies under it, and in the phone's style everywhere else, whatever the bar and its container wear
/// (TabBarLook). Measured in the app on iOS 26.5 (the selected Coach item against the capsule around it, from the
/// screenshot's pixels): the hub, whose ScrollView reaches under the bar, gave Lime on a light phone dark glass at 4.73:1
/// and Heavyweight on a dark phone light glass at 5.84:1; the pushed chat, whose conversation ends above its composer,
/// gave Lime light glass with its near-white item at 1.36:1 and Heavyweight grey glass under its blue item at 1.04:1.
/// Over the stack's ground (a scroll view in the room's background under the stack) the chat read 4.73:1 and 5.85:1 and
/// every Coach screen 4.73:1 or more in both rooms and both phone appearances. iOS 27 draws the glass in its container's
/// style whatever lies under it.
///
/// This host composites nothing (it has no window scene: `drawHierarchy` answers false and the glass is never drawn, so
/// the platter's content keeps the phone's style on 26.x whatever lies under it), so the drawn contrast is read in the
/// app; here each Coach screen stands in a real tab root as the app shows it, the real hub, connect screen and chat in
/// both rooms, and what 26.x reads is checked: a scroll view in the room's ground under the whole bar, and none in WEB.
@available(iOS 26.0, *)
@MainActor
final class TabBarGroundTests: XCTestCase {
    nonisolated private static let heavy = TabsModel.defaults(for: .heavyweight)
    nonisolated private static let lime = TabsModel.defaults(for: .lime)
    /// Rigs stay alive to the end (their windows hidden), as RootTabControllerTests keeps its own.
    static var kept: [RootRig] = []

    private func rig(_ look: TabsModel, first: String = "coach") -> RootRig {
        for r in Self.kept { r.window.isHidden = true }
        let r = RootRig(first: first, look: look)
        r.root.view.layoutIfNeeded()
        Self.kept.append(r)
        return r
    }

    /// A screen of the Coach stack as ScreenHost builds one: its own style the room's, its view clear over the room's
    /// ground (ScreenHost's `homeController` and the chat's host).
    private func screen<V: View>(_ view: V, paper: Bool) -> ScreenHostingController {
        let h = ScreenHostingController(rootView: AnyView(view))
        h.paper = paper
        h.overrideUserInterfaceStyle = paper ? .light : .dark
        h.view.backgroundColor = .clear
        return h
    }

    private func settle(_ r: RootRig) {
        for _ in 0..<3 {
            r.root.view.setNeedsLayout()
            r.root.view.layoutIfNeeded()
            RunLoop.main.run(until: Date().addingTimeInterval(0.05))
        }
    }

    private static func same(_ a: UIColor?, _ b: UIColor, _ traits: UITraitCollection) -> Bool {
        guard let a else { return false }
        func rgba(_ c: UIColor) -> [CGFloat]? {
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, al: CGFloat = 0
            return c.resolvedColor(with: traits).getRed(&r, green: &g, blue: &b, alpha: &al) ? [r, g, b, al] : nil
        }
        guard let x = rgba(a), let y = rgba(b) else { return false }
        return zip(x, y).allSatisfy { abs($0 - $1) < 1.5 / 255 }
    }

    /// Shown in the window: neither it nor an ancestor hidden or transparent.
    private static func shown(_ v: UIView) -> Bool {
        guard v.window != nil else { return false }
        var c: UIView? = v
        while let x = c {
            if x.isHidden || x.alpha < 0.01 { return false }
            c = x.superview
        }
        return true
    }

    /// The scroll views in the Coach slot (never the web view or anything in it) that show the room's ground under the
    /// whole bar: shown in the window, their visible frame covering the bar's, their background the room's.
    private func grounds(_ r: RootRig, _ look: TabsModel) -> [UIScrollView] {
        let bar = r.root.tabBar.convert(r.root.tabBar.bounds, to: nil).insetBy(dx: 0.5, dy: 0.5)
        let bg = TabBarLook.background(look)
        var found: [UIScrollView] = []
        func walk(_ v: UIView) {
            if v === r.webView { return }
            if let s = v as? UIScrollView, Self.shown(s), s.convert(s.bounds, to: nil).contains(bar),
               Self.same(s.backgroundColor, bg, s.traitCollection) { found.append(s) }
            v.subviews.forEach(walk)
        }
        if r.root.coachSlot.isViewLoaded { walk(r.root.coachSlot.view) }
        return found
    }

    /// Every screen the Coach stack shows puts the room's ground in a scroll view under the whole bar, in both rooms: the
    /// WAITING ground, the hub (its own ScrollView reaches under the bar, its background clear over the room's), the
    /// connect screen and the chat pushed over the hub (its conversation ends above its composer). Without it, iOS 26.x
    /// drew the glass over the chat and the WAITING ground in the phone's style.
    func testEveryCoachScreenPutsTheRoomsGroundUnderTheBar() throws {
        for (look, chat) in [(Self.lime, "lime-chat"), (Self.heavy, "heavyweight-chat")] {
            let room = look.room
            let r = rig(look)
            XCTAssertEqual(r.root.selected, "coach")
            XCTAssertEqual(r.root.coachMode, .waiting)
            settle(r)
            XCTAssertFalse(grounds(r, look).isEmpty, "\(room.id) WAITING: the room's ground in a scroll view under the bar")

            let hubModel = try CoachHomeFixtures.model("hub-history", in: room)
            let hub = screen(CoachHomeView(model: hubModel, host: .inert), paper: look.paper)
            r.root.setHome(hub)
            settle(r)
            XCTAssertEqual(r.root.coachMode, .native)
            XCTAssertTrue(r.nav.topViewController === hub)
            XCTAssertFalse(grounds(r, look).isEmpty, "\(room.id) hub: the room's ground in a scroll view under the bar")

            let chatModel = CoachFixtures.model(try CoachFixtures.model(chat), in: room)
            let chatHost = screen(CoachChatView(model: chatModel, host: .inert), paper: look.paper)
            r.nav.pushViewController(chatHost, animated: false)
            settle(r)
            XCTAssertTrue(r.nav.topViewController === chatHost, "the chat pushed over the hub, as ScreenHost pushes it")
            XCTAssertFalse(grounds(r, look).isEmpty, "\(room.id) chat: the room's ground in a scroll view under the bar")
            r.nav.popViewController(animated: false)
            settle(r)

            let connectModel = try CoachHomeFixtures.model(room == .lime ? "connect-lime" : "connect-heavyweight", in: room)
            let connect = screen(CoachHomeView(model: connectModel, host: .inert), paper: look.paper)
            r.root.setHome(connect)
            settle(r)
            XCTAssertTrue(r.nav.viewControllers.first === connect)
            XCTAssertFalse(grounds(r, look).isEmpty, "\(room.id) connect: the room's ground in a scroll view under the bar")
        }
    }

    /// Where the page is the tab (Coach WEB, a web tab), the Coach stack's ground is never under the bar: the web view's
    /// own scroll view is, so iOS 26.x reads the page there as on every web tab.
    func testWhereThePageIsTheTabNoGroundOfTheStackLiesUnderTheBar() throws {
        for look in [Self.lime, Self.heavy] {
            let r = rig(look)
            r.root.setHome(r.home)
            settle(r)
            r.root.setCoachMode(.web)
            settle(r)
            XCTAssertEqual(r.root.coachMode, .web)
            XCTAssertTrue(r.webView.superview === r.root.coachSlot.webArea, "the page in the Coach slot's web area")
            XCTAssertTrue(Self.shown(r.webView), "the page shows")
            XCTAssertEqual(grounds(r, look), [], "\(look.room.id) Coach WEB: no ground of the stack over the page")
            r.root.setHome(r.home)
            settle(r)
            r.root.select("log", source: .page(intent: nil))
            settle(r)
            XCTAssertEqual(grounds(r, look), [], "\(look.room.id) Log: no ground of the stack under the bar")
            r.root.select("coach", source: .page(intent: nil))
            settle(r)
            XCTAssertFalse(grounds(r, look).isEmpty, "\(look.room.id) NATIVE again: the ground is back under the bar")
        }
    }

    /// The ground stays out of the way: below the stack and above the web view's waiting place, it follows the room,
    /// never scrolls to the top, takes no touch, is not seen by VoiceOver, holds neither the web view nor a screen, and
    /// carries no style (contract 6.1: the style goes on the bar, its container and the stack, never on a slot).
    func testTheGroundFollowsTheRoomAndStaysOutOfTheWay() throws {
        let r = rig(Self.lime)
        r.root.setHome(r.home)
        settle(r)
        let found = grounds(r, Self.lime)
        XCTAssertEqual(found.count, 1, "one ground under the bar")
        let g = try XCTUnwrap(found.first)
        let slot = r.root.coachSlot
        XCTAssertTrue(g.superview === slot.view, "in the Coach slot's own view")
        let at = try XCTUnwrap(slot.view.subviews.firstIndex(of: g))
        XCTAssertGreaterThan(at, try XCTUnwrap(slot.view.subviews.firstIndex(of: slot.webArea)), "above the web view's waiting place")
        XCTAssertLessThan(at, try XCTUnwrap(slot.view.subviews.firstIndex(of: r.nav.view)), "below the stack")
        XCTAssertFalse(g.isUserInteractionEnabled, "it takes no touch")
        XCTAssertFalse(g.scrollsToTop, "a status bar tap never scrolls it")
        XCTAssertTrue(g.accessibilityElementsHidden, "VoiceOver never sees it")
        XCTAssertEqual(g.contentInsetAdjustmentBehavior, .never)
        XCTAssertFalse(r.webView.isDescendant(of: g), "it never holds the web view")
        XCTAssertFalse(r.nav.view.isDescendant(of: g), "nor the stack")
        XCTAssertEqual(g.overrideUserInterfaceStyle, .unspecified, "it carries no style")
        XCTAssertEqual(slot.overrideUserInterfaceStyle, .unspecified, "nor does the slot")
        XCTAssertEqual(slot.view.overrideUserInterfaceStyle, .unspecified)
        XCTAssertEqual(g.traitCollection.userInterfaceStyle, r.root.traitCollection.userInterfaceStyle, "it keeps the phone's style")

        r.root.apply(Self.heavy)
        settle(r)
        XCTAssertTrue(Self.same(g.backgroundColor, TabBarLook.background(Self.heavy), g.traitCollection), "the ground follows the room")
        XCTAssertEqual(grounds(r, Self.heavy).map { ObjectIdentifier($0) }, [ObjectIdentifier(g)], "the same ground, now Heavyweight's")
        r.root.apply(Self.lime)
        settle(r)
        XCTAssertTrue(Self.same(g.backgroundColor, TabBarLook.background(Self.lime), g.traitCollection), "and back")
    }
}
#endif
