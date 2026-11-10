#if os(iOS)
import UIKit
import FPCore

/// What the native tab bar wears (contract 6.1, D16; delta 14.7): the page's TabsModel (before the first one, the
/// compiled defaults of the room read at launch), drawn on UIKit's own bar.
///
/// - The selected item takes `tint`, the others `idle`; each item's title is the model's and its accessibility label is
///   exactly its `a11y` (the tools find a tab by it, T-G11). The glyphs and the order are the shell's: SF Symbols
///   standing for the web bar's plus, pulse, bubble and gear. Every item keeps its title, which is what the Large
///   Content Viewer shows on a long press at the accessibility text sizes (the bar itself keeps its size, D45).
/// - `paper` gives the bar `.light` and Lime `.dark`, set in both rooms and never left `.unspecified` (iOS 27.0 read the
///   bar's own trait as light with no override, probe61 question 7). The same style goes on the Coach tab's navigation
///   controller and on the bar's container (RootTabController's `paintBarContainer`: on iOS 27 the glass platter's content
///   takes its style from there, not from the bar), and never on the window, the root or a slot: the web view's traits,
///   its keyboards and the page's `prefers-color-scheme` stay the phone's (`maps/shell.md:331`).
/// - What the glass draws its platter and its items in differs by runtime. tests/tools/tab-glass.py reads it in the app
///   (the selected Coach item against its capsule in a screenshot's pixels: WAITING, the connect screen, the hub, the
///   pushed chat with and without the page's toast and Coach WEB, both rooms, both phone appearances, on 26.4.1, 26.5
///   and 27.0); the H9 review's renders showed content unlike the room. iOS 27 takes the container's style, so the bar
///   wears the room whatever is under it (5.82:1 in Heavyweight and 18.23:1 in Lime on every one of those screens; over
///   content unlike the room the glass turns grey and the items keep the room's colours). iOS 26.x reads the style from
///   what is drawn under the bar only where a scroll view lies under it, whatever the bar or its container wear, and
///   takes the phone's style where none does. So the Coach stack stands on its ground, a scroll view in the room's
///   background under the stack (CoachSlotController's `ground`): without it the pushed chat, whose conversation ends
///   above its composer, and the WAITING ground gave Lime on a light phone light glass with its near-white selected
///   item at 1.36:1 and Heavyweight on a dark phone grey glass under its blue item at 1.04:1; over the ground every
///   Coach screen reads 4.73:1 or more. Over the ground alone (WAITING, the chat) 26.x draws the phone's glass turned
///   to the room's ground, lighter than the room's own glass it draws where the screen's ScrollView lies under the bar
///   too (the hub and the connect screen): 4.73:1 for 8.31:1 in Lime on a light phone, 5.85:1 for 6.24:1 in Heavyweight
///   on a dark one. On a web tab and on Coach WEB the page's own scroll view lies under the bar, the ground out of the
///   view tree (hidden in it, 26.x read it in the page's place): the room's page gives the room's own glass (10.68:1
///   and 6.37:1), while content unlike it flips the bar (black under Heavyweight draws dark glass with white items;
///   white under Lime light glass, on which Lime's near-white selected item is all but unreadable: delta 16.3, the
///   owner's open call), so the page keeps its own ground under the bar. A test window is never drawn (no window
///   scene), so there the platter's content keeps the phone's style on 26.x: RootTabControllerTests walks the platter
///   on iOS 27 only, TabBarGroundTests checks the ground under every Coach screen and tab-glass.py the drawn glass.
/// - The glass bar draws its unselected items in its own colour: on iOS 27.0 neither `unselectedItemTintColor` nor a
///   UITabBarAppearance's normal item colours change them (H9's by-hand run). `idle` is set all the same.
/// - The room's `bg` is the ground the Coach tab shows while WAITING and while held (contract 1.4, 8.1).
enum TabBarLook {
    /// The glyph of each tab, in the bar's order (contract 1.2).
    static let symbols: [String: String] = [
        "log": "plus", "progress": "waveform.path.ecg", "coach": "bubble.left", "settings": "gearshape",
    ]

    /// The bar's and the Coach stack's style: the room's, never the phone's.
    static func style(_ look: TabsModel) -> UIUserInterfaceStyle { look.paper ? .light : .dark }

    /// The room's background (its compiled `bg`: TabsModel carries no palette).
    static func background(_ look: TabsModel) -> UIColor {
        UIColor(rgba: Tokens.defaults(for: look.room, paper: look.paper).color(.bg))
    }

    /// A tab's item: the shell's glyph, the model's title and label.
    static func item(_ tab: String, look: TabsModel) -> UITabBarItem {
        let item = UITabBarItem(title: nil, image: symbols[tab].flatMap { UIImage(systemName: $0) }, tag: ShellTabIndex.of(tab) ?? 0)
        dress(item, tab: tab, look: look)
        return item
    }

    /// The model's title and accessibility label on a tab's item.
    static func dress(_ item: UITabBarItem, tab: String, look: TabsModel) {
        let it = look.item(tab) ?? TabsModel.defaults(for: look.room, paper: look.paper).item(tab)
        if item.title != it?.title { item.title = it?.title }
        if item.accessibilityLabel != it?.a11y { item.accessibilityLabel = it?.a11y }
        if item.image == nil, let name = symbols[tab] { item.image = UIImage(systemName: name) }
    }

    /// The colours and the style on the bar itself.
    static func paint(_ bar: UITabBar, look: TabsModel) {
        bar.tintColor = UIColor(rgba: look.tint)
        bar.unselectedItemTintColor = UIColor(rgba: look.idle)
        bar.overrideUserInterfaceStyle = style(look)
    }

    /// The style as a word, for `describe()`.
    static func word(_ s: UIUserInterfaceStyle) -> String {
        switch s {
        case .light: return "light"
        case .dark: return "dark"
        case .unspecified: return "unspecified"
        @unknown default: return "unknown"
        }
    }
}

/// A tab id's place in the bar (contract 1.2's order).
enum ShellTabIndex {
    static func of(_ tab: String) -> Int? { ShellTabs.ids.firstIndex(of: tab) }
    static func tab(_ index: Int) -> String? { ShellTabs.ids.indices.contains(index) ? ShellTabs.ids[index] : nil }
}
#endif
