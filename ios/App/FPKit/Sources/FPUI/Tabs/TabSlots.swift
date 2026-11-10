#if os(iOS)
import UIKit

// The tab root's slots (build 61, 11-shell.md H4; contract 1.2-1.4, 6.3, 7.4, 8.2): three plain containers the web
// view moves between (Log, Progress, Settings) and the Coach slot, which holds the web view's waiting place and the
// Coach tab's own navigation stack above it, on the stack's ground (H9 fix-1). Every container gives the web view its
// whole bounds and pins nothing to the safe area (contract 7.4: pinning resized the page on every hide and show of the
// bar), and no slot carries the room's `overrideUserInterfaceStyle`: it would reach the web view's traits, its
// keyboards and `prefers-color-scheme` (the bar and the Coach stack take it, TabBarLook).

/// A web tab's slot (Log, Progress, Settings): a plain full-bleed container. While it holds the web controller, the
/// status bar's style and visibility are that controller's (Capacitor's bridge controller, as on a classic root).
final class WebSlotController: UIViewController {
    /// The tab's id (contract 1.2). Not `tab`: UIViewController's own `tab` is its UITab.
    let tabId: String

    init(tabId: String) {
        self.tabId = tabId
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func loadView() {
        let v = UIView()
        v.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view = v
    }

    override var childForStatusBarStyle: UIViewController? { children.first }
    override var childForStatusBarHidden: UIViewController? { children.first }
}

/// The Coach tab's navigation controller (contract 6.3): its system bar hidden (the chat and the hub draw their own
/// headers), never presenting, never modal, so the tab bar stays reachable over every screen it shows (D9). ScreenHost
/// becomes its navigation delegate and its interactive pop's delegate while the stack is attached (H5) and gives them
/// back when it leaves; until then and after, the pop is refused at the stack's root (probe61 question 6: UIKit asks
/// there).
final class CoachNavigationController: UINavigationController, UIGestureRecognizerDelegate {
    override init(rootViewController: UIViewController) {
        super.init(rootViewController: rootViewController)
        isNavigationBarHidden = true
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        setNavigationBarHidden(true, animated: false)
        interactivePopGestureRecognizer?.delegate = self
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard gestureRecognizer === interactivePopGestureRecognizer else { return true }
        return viewControllers.count > 1 && transitionCoordinator == nil
    }

    /// The top controller decides: the WAITING ground, the home, or the pushed chat (contract 6.3).
    override var childForStatusBarStyle: UIViewController? { topViewController }
    override var childForStatusBarHidden: UIViewController? { topViewController }
}

/// The Coach tab's root while it is WAITING (contract 1.4): the room's background only, and the status bar the room's.
final class WaitingRootController: UIViewController {
    var background: UIColor {
        didSet { viewIfLoaded?.backgroundColor = background }
    }
    var paper: Bool {
        didSet { if paper != oldValue { setNeedsStatusBarAppearanceUpdate() } }
    }

    init(background: UIColor, paper: Bool) {
        self.background = background
        self.paper = paper
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func loadView() {
        let v = UIView()
        v.backgroundColor = background
        v.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view = v
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { paper ? .darkContent : .lightContent }
}

/// The Coach tab's slot: `webArea` (at index 0: where the web view waits hidden behind the native stack, or shows while
/// the tab is WEB), above it `ground` while the stack shows and above that the navigation controller's view. The mode
/// is the root's to set (contract 1.4, per scene); the slot only shows or hides the stack for it, its ground in the
/// view tree with it and out of it in WEB.
final class CoachSlotController: UIViewController {
    /// Where the web view waits (hidden) or shows (WEB): below the stack, full-bleed.
    let webArea = UIView()
    /// The stack's ground, in the room's background (the root colours it, RootTabController's `apply`): what iOS 26.x's
    /// glass bar reads under every Coach screen (StackGround). In the slot's view only while the stack shows.
    let ground = StackGround()
    let nav: CoachNavigationController
    let waiting: WaitingRootController
    /// What `RootTabController.setHome(_:)` installed as the stack's root (H10: N's hub in ScreenHost's host).
    private(set) weak var home: UIViewController?
    private(set) var showsStack = true

    init(background: UIColor, paper: Bool) {
        waiting = WaitingRootController(background: background, paper: paper)
        nav = CoachNavigationController(rootViewController: waiting)
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func loadView() {
        let v = UIView()
        v.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view = v
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webArea.frame = view.bounds
        webArea.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.insertSubview(webArea, at: 0)
        ground.backgroundColor = waiting.background
        addChild(nav)
        nav.view.frame = view.bounds
        nav.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(nav.view)
        nav.didMove(toParent: self)
        nav.view.isHidden = !showsStack
        placeGround()
    }

    /// The stack shows (WAITING, NATIVE) or hides (WEB, where the web view in `webArea` is the tab), its ground with it.
    func showStack(_ on: Bool) {
        showsStack = on
        if isViewLoaded {
            nav.view.isHidden = !on
            placeGround()
        }
    }

    /// The ground between the web view's waiting place and the stack while the stack shows, and out of the view tree
    /// while it hides (WEB): the page is the tab there, and left hidden in the tree iOS 26.x's glass read the ground in
    /// the page's place (tests/tools/tab-glass.py on 26.5, Coach WEB: Lime on a light phone 4.73:1, the look of the
    /// glass over the ground alone, for the page's 10.68:1 as on every web tab; Heavyweight on a dark phone 5.85:1 for
    /// 6.37:1).
    private func placeGround() {
        if showsStack {
            guard ground.superview !== view else { return }
            ground.frame = view.bounds
            view.insertSubview(ground, aboveSubview: webArea)
        } else {
            ground.removeFromSuperview()
        }
    }

    /// Puts `home` at the bottom of the stack in place of the WAITING ground or an earlier home, keeping whatever is
    /// pushed on it, without animation. Nothing when it is there already.
    func install(home h: UIViewController) {
        home = h
        let stack = nav.viewControllers
        guard stack.first !== h else { return }
        let rest = stack.dropFirst().filter { $0 !== h }
        nav.setViewControllers([h] + rest, animated: false)
    }

    /// The web controller while this slot holds it.
    var webChild: UIViewController? { children.first { $0 !== nav } }

    /// WEB: the web controller's style, as on a web tab; otherwise the stack's top controller's (contract 6.3).
    override var childForStatusBarStyle: UIViewController? { showsStack ? nav : webChild }
    override var childForStatusBarHidden: UIViewController? { showsStack ? nav : webChild }
}

/// The Coach stack's ground under the glass bar (11-shell.md H9 fix-1; TabBarLook): a full-bleed scroll view in the
/// room's background between the web view's waiting place and the stack. iOS 26.x draws the glass bar, its platter and
/// its items, in the style it reads from what is drawn under the bar only where a scroll view lies under it, and in the
/// phone's style everywhere else: over the pushed chat, whose conversation ends above its composer, and over the
/// WAITING ground (a plain view in the same background), Lime on a light phone drew light glass with its near-white
/// selected item all but unreadable (1.36:1 on its capsule) and Heavyweight on a dark phone grey glass under its blue
/// one (1.04:1). Over this ground every Coach screen gives the glass the room's own ground (tests/tools/tab-glass.py
/// reads it in the app). It is a scroll view for that alone: it holds nothing and has nothing to scroll (the glass
/// reads it the same with no content size as with the doubled height the first runs gave it), it takes no touch,
/// VoiceOver and a status bar tap never reach it, UIKit adjusts no inset and draws no edge effect on it, and it carries
/// no style (the slot's traits stay the phone's). In WEB it is out of the view tree (CoachSlotController's
/// `placeGround`).
final class StackGround: UIScrollView {
    override init(frame: CGRect) {
        super.init(frame: frame)
        autoresizingMask = [.flexibleWidth, .flexibleHeight]
        isUserInteractionEnabled = false
        scrollsToTop = false
        contentInsetAdjustmentBehavior = .never
        showsVerticalScrollIndicator = false
        showsHorizontalScrollIndicator = false
        accessibilityElementsHidden = true
        if #available(iOS 26.0, *) {
            topEdgeEffect.isHidden = true
            bottomEdgeEffect.isHidden = true
        }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }
}
#endif
