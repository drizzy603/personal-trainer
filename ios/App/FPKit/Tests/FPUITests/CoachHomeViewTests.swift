#if os(iOS)
import SwiftUI
import UIKit
import XCTest
@testable import FPUI
import FPCore

/// The native Coach tab's root (plan task N7; contract 5 K5, 6.2, 8.3, I17): every coachHome fixture lays out in both
/// rooms; an unknown route draws the hub's layout; VoiceOver hears the page's strings in the web's order with the right
/// traits, at the large size and at .xxLarge; the key field is a secure field that autocorrects nothing, offers no
/// content type and takes no focus by itself; CONNECT and Return send one action per press and none while a key is
/// out, and reach the newest host; the field reports only whether it holds text, and an empty one says so when it
/// appears (CoachHomeStoreTests holds, in a Coach stack, that one coming back holding text says nothing); a tap
/// anywhere in its drawn box focuses it; it draws in the room's face; a typed canary leaves no trace in UserDefaults or
/// the app's files; the meta row publishes its bottom, follows the scroll and says 0 under the status bar; the help's
/// two paragraphs are two lines; a wrapped headline keeps the CSS line pitch; CONNECT does not shrink when pressed
/// under the system's Reduce Motion and the starter link presses as the web's plain button does, 44 pt tall; with the
/// app's Larger Text off the hub draws at the large size; a 320 pt screen takes the narrow gutter and Lime's 41 pt
/// headline.
///
/// How this host is driven (probed on iOS 27.0's simulator): SwiftUI vends its accessibility elements to a test only
/// outside a scroll view (inside one it vends none without an accessibility client such as VoiceOver), so the walks
/// lay the same column out unscrolled (`CoachHomeOptions.unscrolledWidth`), with the accessibility switches on for
/// the class (below). UIKit's and SwiftUI's accessibility bundles are not loaded in a test host, so the secure field
/// shows up in the walk as its `UITextField` (the platform view SwiftUI hands VoiceOver, with no node of its own) and
/// no label: its label is computed only by SwiftUI's accessibility bundle (probed: loaded by hand into this process,
/// the bundles answer `_accessibilityAXAttributedLabel` "Anthropic API Key" for the field, while `accessibilityLabel`
/// stays nil), and loading them would change every later test in the run. So the walks cannot hear the field's name,
/// and `testTheKeyFieldIsLabelledWithTheFieldLabel`, which holds it in the view's source, is for now the only check
/// of it: no app scenario looks the field up by its label yet (N15's coachtab seeds a key, so the connect screen never
/// shows; T20's connect focuses the top screen's first text input and presses CONNECT by its label). A press goes
/// through `accessibilityActivate()`, as the probe's `press` does; keys and Return reach SwiftUI's text field as UIKit
/// delivers them, the field's editing-changed and primary actions sent to their targets (`UIControl.sendActions` does
/// not reach them in this host).
@MainActor
final class CoachHomeViewTests: XCTestCase {
    static let screen = CGSize(width: 390, height: 844)
    static let narrow = CGSize(width: 320, height: 568)
    static let safeTop: CGFloat = 47
    /// The glass tab bar's inset on a Face ID phone (contract 2.2).
    static let safeBottom: CGFloat = 83
    static let rooms: [(String, Room)] = [("heavyweight", .heavyweight), ("lime", .lime)]

    // MARK: The accessibility runtime

    /// The switches that make SwiftUI build its elements in this process (ShellProbe.enableAccessibility turns the same
    /// ones on in the app). The simulator keeps them, and the automation switch drags application accessibility on with
    /// it, so they are read once, before this class sets them, and put back as they were when its last test is done.
    private nonisolated static let axSwitches = [("_AXSSetAutomationEnabled", "_AXSAutomationEnabled"),
                                                 ("_AXSApplicationAccessibilitySetEnabled", "_AXSApplicationAccessibilityEnabled")]
    private nonisolated(unsafe) static var axWas: [(setter: String, value: Int32)] = []

    private nonisolated static func axSet(_ setter: String, _ value: Int32) {
        typealias Set = @convention(c) (Int32) -> Void
        guard let lib = dlopen("/usr/lib/libAccessibility.dylib", RTLD_NOW), let f = dlsym(lib, setter) else { return }
        unsafeBitCast(f, to: Set.self)(value)
    }

    nonisolated override class func setUp() {
        super.setUp()
        typealias Get = @convention(c) () -> Int32
        guard let lib = dlopen("/usr/lib/libAccessibility.dylib", RTLD_NOW) else { return }
        axWas = axSwitches.compactMap { setter, getter in
            dlsym(lib, getter).map { (setter, unsafeBitCast($0, to: Get.self)()) }
        }
        for (setter, _) in axSwitches { axSet(setter, 1) }
    }

    nonisolated override class func tearDown() {
        // the automation switch first: application accessibility follows it
        for (setter, value) in axWas { axSet(setter, value) }
        axWas = []
        super.tearDown()
    }

    override func setUp() async throws {
        try await super.setUp()
        FPFonts.register()
    }

    // MARK: Models

    /// What the view asked of its host. The host's closures hold the recorder (no cycle: the recorder holds no host),
    /// so a host made from a recorder no test keeps (`Recorder().host()`) still answers a field that reports itself.
    final class Recorder {
        var actions: [CoachHomeAction] = []
        var typed: [Bool] = []

        func host(connecting: Bool = false) -> CoachHomeHost {
            CoachHomeHost(act: { self.actions.append($0) }, connecting: connecting, fieldTyped: { self.typed.append($0) })
        }
    }

    static func model(_ json: String) throws -> CoachHomeModel { try CoachHomeModel.decode(json) }

    nonisolated static let help = "Get a key from your Anthropic account: console.anthropic.com \u{2192} API Keys \u{2192} Create key, then paste it here.\nAnthropic bills usage to your own account \u{2014} typically a few cents per chat. A Claude subscription does not include API access."

    /// A string as a JSON string literal.
    static func literal(_ s: String) -> String {
        let data = try! JSONSerialization.data(withJSONObject: [s], options: [])
        return String(String(data: data, encoding: .utf8)!.dropFirst().dropLast())
    }

    /// The hub with its three groups (a programme not built yet, messages saved), as the page builds it.
    static func hubJSON(room: Room = .heavyweight) -> String {
        """
        {"v":1,"rev":13,"boot":"b1","room":"\(room.id)","paper":\(room.isPaper ?? true),"dynTypeOn":true,"route":"hub","resume":false,
         "meta":{"label":"COACH \u{00B7} WK 06 / 12 \u{00B7} STRENGTH","avatar":"K"},
         "hero":{"greet":"Hi Kalani.","title":"Coach","accent":"ready.","body":"3 exchanges so far. Pick up where you left off, or start a new thread."},
         "connect":null,
         "groups":[
          {"head":"Conversation","rows":[{"do":"openChat","title":"Open Chat","sub":"3 exchanges \u{00B7} Push day went well, the last set moved fast","icon":"chat"}]},
          {"head":"Programme","rows":[{"do":"startIntake","title":"Build My Programme","sub":"Generate a custom training plan","icon":"programme"}]},
          {"head":"Account","rows":[{"do":"clearChat","title":"Clear Chat History","sub":null,"icon":"trash"},
                                    {"do":"disconnect","title":"Disconnect","sub":null,"icon":"disconnect"}]}]}
        """
    }

    /// The connect screen, with the starter link (no programme yet) or without it.
    static func connectJSON(room: Room = .heavyweight, starter: Bool = true, help: String = CoachHomeViewTests.help,
                            route: String = "connect", groups: String = "[]", rev: Int = 4) -> String {
        """
        {"v":1,"rev":\(rev),"boot":"b1","room":"\(room.id)","paper":\(room.isPaper ?? true),"dynTypeOn":true,"route":"\(route)","resume":false,
         "meta":{"label":"COACH \u{00B7} WK 01 / 12","avatar":"R"},
         "hero":{"greet":"Hi Roberto.","title":"Connect","accent":"your coach.","body":"Plug in your Claude API key and the coach can talk through sessions, build a custom programme, and react to what you log."},
         "connect":{"label":"Anthropic API Key","placeholder":"sk-ant-...","cta":{"label":"CONNECT","title":"Save key & start coaching"},
                    "help":\(literal(help)),"starter":\(starter ? "{\"label\":\"No key? Build a starter plan instead \u{2192}\"}" : "null")},
         "groups":\(groups)}
        """
    }

    /// A newer page's route with groups and a connect block: drawn with the hub's layout, the connect block last.
    static func otherJSON(room: Room = .heavyweight) -> String {
        connectJSON(room: room, starter: false, route: "upsell", groups: """
        [{"head":"Conversation","rows":[{"do":"openChat","title":"Open Chat","sub":"No messages yet \u{2014} tap to start","icon":"chat"}]},
         {"head":"Account","rows":[{"do":"disconnect","title":"Disconnect","sub":null,"icon":"disconnect"}]}]
        """)
    }

    // MARK: Hosting

    /// The hub on a phone screen: the safe areas replaced by an iPhone's (47 pt status bar, the 83 pt glass tab bar),
    /// so every run lays out the same whatever simulator runs it.
    struct Phone: View {
        let model: CoachHomeModel
        let host: CoachHomeHost
        var size: DynamicTypeSize = .large
        var unscrolledWidth: CGFloat?
        var onBottom: ((CGFloat) -> Void)?
        /// false: no hub at all (the store's ground before a model, N8), the window kept.
        var shown = true
        /// The system's Reduce Motion as the environment carries it to the hub (nil: the simulator's own setting).
        var systemReduceMotion: Bool?
        /// What a press of each drawn button would draw (`HomePressKey`), as the hub publishes it.
        var onPress: (([HomePress: HomePress.Look]) -> Void)?

        var body: some View {
            Group {
                if shown {
                    CoachHomeView(model: model, host: host, options: CoachHomeOptions(unscrolledWidth: unscrolledWidth))
                } else {
                    Color.clear
                }
            }
            // `accessibilityReduceMotion` is read-only; SwiftUI's settable twin sets what it reads (CoachHomeStoreTests
            // does the same)
            .transformEnvironment(\._accessibilityReduceMotion) { [systemReduceMotion] on in
                if let systemReduceMotion { on = systemReduceMotion }
            }
            .safeAreaPadding(.top, CoachHomeViewTests.safeTop)
            .safeAreaPadding(.bottom, CoachHomeViewTests.safeBottom)
            .environment(\.dynamicTypeSize, size)
            .onPreferenceChange(HubHeaderBottomKey.self) { y in MainActor.assumeIsolated { onBottom?(y) } }
            .onPreferenceChange(HomePressKey.self) { looks in MainActor.assumeIsolated { onPress?(looks) } }
        }
    }

    /// A view in a key window of `size`, laid out until it settles.
    @MainActor final class Hosted {
        let host: UIHostingController<Phone>
        let window: UIWindow

        /// `keepsSafeArea`: the window's own safe area as well (the simulator's status bar under the phone's 47 pt), as
        /// UIKit hands it to the app's hosting controllers; otherwise the phone's insets alone.
        init(_ phone: Phone, size: CGSize, keepsSafeArea: Bool = false) {
            host = UIHostingController(rootView: phone)
            if !keepsSafeArea { host.safeAreaRegions = [] }
            var target = size
            if let width = phone.unscrolledWidth {
                // the whole column: a window as tall as it is, so every element lies inside it
                let fit = host.sizeThatFits(in: CGSize(width: width, height: 20000))
                target = CGSize(width: width, height: max(size.height, ceil(fit.height)))
            }
            window = UIWindow(frame: CGRect(origin: .zero, size: target))
            window.rootViewController = host
            window.makeKeyAndVisible()
            host.view.frame = window.bounds
            settle(12)
        }

        func settle(_ turns: Int = 5) {
            for _ in 0..<turns {
                host.view.setNeedsLayout()
                host.view.layoutIfNeeded()
                RunLoop.main.run(until: Date().addingTimeInterval(0.03))
            }
        }

        func close() {
            window.isHidden = true
            window.rootViewController = nil
        }

        func find<T: UIView>(_ type: T.Type) -> T? {
            func walk(_ v: UIView) -> T? {
                if let t = v as? T { return t }
                for s in v.subviews { if let t = walk(s) { return t } }
                return nil
            }
            return walk(host.view)
        }

        var field: UITextField? { find(UITextField.self) }
        var elements: [AXElement] { CoachHomeViewTests.walk(host.view) }

        /// Presses the element labelled `label` as VoiceOver's double tap does (the probe's `press`).
        @discardableResult func press(_ label: String) -> Bool {
            guard let el = elements.first(where: { $0.label == label && !$0.isField }) else { return false }
            let ok = el.object.accessibilityActivate()
            settle()
            return ok
        }
    }

    // MARK: The walk

    /// One accessibility element as VoiceOver meets it.
    struct AXElement: CustomStringConvertible {
        let label: String
        let value: String?
        let traits: UIAccessibilityTraits
        let frame: CGRect
        /// The key field's `UITextField`: the platform view SwiftUI hands VoiceOver (its label is unread here, UIKit's
        /// accessibility not being loaded in a test host).
        let isField: Bool
        let object: NSObject

        var description: String {
            let t = [traits.contains(.header) ? "header" : nil, traits.contains(.button) ? "button" : nil].compactMap { $0 }
            if isField { return "<text field \(label)>" }
            return label + (value.map { " = \($0)" } ?? "") + (t.isEmpty ? "" : " [\(t.joined(separator: ","))]")
        }
    }

    /// The hosting view's accessibility elements, depth first as ShellProbe's `axFind` walks it (`accessibilityElements`,
    /// else `accessibilityElementCount`/`accessibilityElement(at:)`, then subviews), each object once, an element a leaf
    /// (VoiceOver never reads inside one), hidden views skipped.
    static func walk(_ root: NSObject) -> [AXElement] {
        var out: [AXElement] = []
        var seen = Set<ObjectIdentifier>()
        func visit(_ o: NSObject, _ depth: Int) {
            guard depth < 48, seen.insert(ObjectIdentifier(o)).inserted else { return }
            if let v = o as? UIView, v.isHidden || v.accessibilityElementsHidden { return }
            if o.isAccessibilityElement || o is UITextField {
                out.append(AXElement(label: o.accessibilityLabel ?? "", value: o.accessibilityValue, traits: o.accessibilityTraits,
                                     frame: o.accessibilityFrame, isField: o is UITextField, object: o))
                return
            }
            var kids: [Any] = []
            if let els = o.accessibilityElements {
                kids += els
            } else {
                let n = o.accessibilityElementCount()
                if n > 0, n != NSNotFound { for i in 0..<n { if let e = o.accessibilityElement(at: i) { kids.append(e) } } }
            }
            if let v = o as? UIView { kids += v.subviews }
            for k in kids { if let c = k as? NSObject, c !== o { visit(c, depth + 1) } }
        }
        visit(root, 0)
        return out
    }

    /// What VoiceOver must meet, in contract 6.2's order (D45): the meta label, the headline (one header: greet, title,
    /// accent), the body; on the hub each group's head (a header) and its rows (buttons, the sub their value); on the
    /// connect screen the key field, CONNECT (a button, its title the value), the help, the starter link (a button); an
    /// unknown route the hub's order with the connect block after the groups.
    struct Want {
        enum Kind { case text, header, button, field }
        let label: String
        let value: String?
        let kind: Kind
    }

    static func wanted(_ m: CoachHomeModel) -> [Want] {
        var out: [Want] = []
        if !m.meta.label.isEmpty { out.append(Want(label: CoachHomeSpeech.meta(m.meta), value: nil, kind: .text)) }
        let headline = CoachHomeSpeech.headline(m.hero)
        if !headline.isEmpty { out.append(Want(label: headline, value: nil, kind: .header)) }
        if !m.hero.body.isEmpty { out.append(Want(label: m.hero.body, value: nil, kind: .text)) }
        func groups() {
            for g in m.groups {
                if !g.head.isEmpty { out.append(Want(label: CoachHomeSpeech.groupHead(g), value: nil, kind: .header)) }
                for r in g.rows { out.append(Want(label: CoachHomeSpeech.rowLabel(r), value: CoachHomeSpeech.rowValue(r), kind: .button)) }
            }
        }
        func connect() {
            guard let c = m.connect else { return }
            out.append(Want(label: CoachHomeSpeech.field(c), value: nil, kind: .field))
            out.append(Want(label: CoachHomeSpeech.ctaLabel(c), value: CoachHomeSpeech.ctaValue(c), kind: .button))
            if !c.help.isEmpty { out.append(Want(label: CoachHomeSpeech.help(c), value: nil, kind: .text)) }
            if let s = c.starter { out.append(Want(label: CoachHomeSpeech.starter(s), value: nil, kind: .button)) }
        }
        switch m.route {
        case .hub: groups()
        case .connect: connect()
        case .other: groups(); connect()
        }
        return out
    }

    /// Checks a walk against what VoiceOver must meet: the order, each element's label, value and traits, and the
    /// contract's rules (no element named the avatar's letter, the field label's text on no element but the field, no
    /// two elements with one label). The field's own label is compared when the host reports one; this host reports
    /// none (see the class notes), and says so in the report rather than passing it in silence:
    /// `testTheKeyFieldIsLabelledWithTheFieldLabel` holds that label in the source, the only check of it for now.
    static func check(_ got: [AXElement], against m: CoachHomeModel, _ what: String, file: StaticString = #filePath, line: UInt = #line) {
        let want = wanted(m)
        XCTAssertEqual(got.count, want.count, "\(what): \(got.count) elements, wanted \(want.count): \(got)", file: file, line: line)
        for (i, (g, w)) in zip(got, want).enumerated() {
            let at = "\(what), element \(i) (\(g))"
            switch w.kind {
            case .field:
                XCTAssertTrue(g.isField, "\(at): the key field", file: file, line: line)
                if g.label.isEmpty {
                    XCTContext.runActivity(named: "\(what): the key field's label is unread in this host (no UIKit accessibility); "
                                           + "testTheKeyFieldIsLabelledWithTheFieldLabel holds it") { _ in }
                } else {
                    XCTAssertEqual(g.label, w.label, "\(at): the field's label", file: file, line: line)
                }
            case .text, .header, .button:
                XCTAssertFalse(g.isField, "\(at): not the field", file: file, line: line)
                XCTAssertEqual(g.label, w.label, "\(at): the label", file: file, line: line)
                XCTAssertEqual(g.value.flatMap { $0.isEmpty ? nil : $0 }, w.value, "\(at): the value", file: file, line: line)
            }
            switch w.kind {
            case .header:
                XCTAssertTrue(g.traits.contains(.header), "\(at): a header", file: file, line: line)
                XCTAssertFalse(g.traits.contains(.button), "\(at): not a button", file: file, line: line)
            case .button:
                XCTAssertTrue(g.traits.contains(.button), "\(at): a button", file: file, line: line)
                XCTAssertFalse(g.traits.contains(.header), "\(at): not a header", file: file, line: line)
            case .text:
                XCTAssertFalse(g.traits.contains(.button), "\(at): not a button", file: file, line: line)
                XCTAssertFalse(g.traits.contains(.header), "\(at): not a header", file: file, line: line)
            case .field:
                break
            }
        }
        if let avatar = m.meta.avatar {
            XCTAssertFalse(got.contains { $0.label == avatar }, "\(what): no element is the avatar's letter", file: file, line: line)
        }
        if let c = m.connect {
            // the visible label above the field is hidden: its text is on no element but the field
            XCTAssertFalse(got.contains { !$0.isField && $0.label == c.label }, "\(what): the visible field label is hidden", file: file, line: line)
        }
        let labels = got.filter { !$0.isField }.map(\.label)
        XCTAssertEqual(Set(labels).count, labels.count, "\(what): no two elements share a label: \(labels)", file: file, line: line)
        XCTAssertFalse(labels.contains(""), "\(what): no element without a label", file: file, line: line)
    }

    // MARK: Keys

    /// Sends a control event's actions to their targets (SwiftUI's text field coordinator), as UIKit does for the keys.
    static func send(_ event: UIControl.Event, from tf: UITextField) {
        for target in tf.allTargets {
            for action in tf.actions(forTarget: target, forControlEvent: event) ?? [] {
                _ = (target.base as AnyObject).perform(NSSelectorFromString(action), with: tf)
            }
        }
    }

    /// Keys typed into the field: the owner's tap gives it the focus, the text changes, the field reports the change.
    static func type(_ text: String, into tf: UITextField, _ hosted: Hosted) {
        if !tf.isFirstResponder { _ = tf.becomeFirstResponder() }
        tf.insertText(text)
        send(.editingChanged, from: tf)
        hosted.settle()
    }

    static func clear(_ tf: UITextField, _ hosted: Hosted) {
        tf.text = ""
        send(.editingChanged, from: tf)
        hosted.settle()
    }

    /// Return on the keys (Go): the field's primary action.
    static func pressReturn(_ tf: UITextField, _ hosted: Hosted) {
        send(.primaryActionTriggered, from: tf)
        hosted.settle()
    }

    /// A canary shaped like a key (`sk-ant-test-` and 24 random letters), never a real one (contract 5 K8).
    static func canary() -> String {
        "sk-ant-test-" + String((0..<24).map { _ in "abcdefghijklmnopqrstuvwxyz".randomElement()! })
    }

    /// The canary's 6-character pieces of its random letters: the 12-character prefix is every canary's, and a piece
    /// mostly made of it ("test-p") turns up in the simulator's own caches by chance.
    static func pieces(_ canary: String) -> [String] {
        let chars = Array(canary)
        let prefix = "sk-ant-test-".count
        return (prefix...(chars.count - 6)).map { String(chars[$0..<($0 + 6)]) }
    }

    /// The first piece found in `data` as UTF-8 or UTF-16 (either order).
    static func hit(_ pieces: [String], in data: Data) -> String? {
        for p in pieces {
            for enc in [String.Encoding.utf8, .utf16LittleEndian, .utf16BigEndian] {
                if let bytes = p.data(using: enc), data.range(of: bytes) != nil { return p }
            }
        }
        return nil
    }

    // MARK: Fixtures and routes

    func testEveryCoachHomeFixtureLaysOutInBothRooms() throws {
        let names = try CoachHomeFixtures.names()
        XCTAssertFalse(names.isEmpty, "the coachHome fixtures")
        for name in names {
            for (roomName, room) in Self.rooms {
                let m = try CoachHomeFixtures.model(name, in: room)
                let what = "\(name) in \(roomName)"
                let rec = Recorder()
                // the tab as it is: one scroll view across the whole screen, its content inset by the bars, so the
                // content starts under the status bar, ends at the tab bar and scrolls under the glass
                let tab = Hosted(Phone(model: m, host: rec.host()), size: Self.screen)
                let scroll = try XCTUnwrap(tab.find(UIScrollView.self), "\(what): the scroll view")
                XCTAssertEqual(scroll.frame.size, Self.screen, "\(what): the scroll view fills the screen")
                XCTAssertEqual(scroll.adjustedContentInset.top, Self.safeTop, accuracy: 0.5, "\(what): the content starts under the status bar")
                XCTAssertEqual(scroll.adjustedContentInset.bottom, Self.safeBottom, accuracy: 0.5, "\(what): and ends at the tab bar")
                XCTAssertGreaterThan(scroll.contentSize.height, 0, "\(what): the column has height")
                XCTAssertEqual(tab.field != nil, Self.wanted(m).contains { $0.kind == .field }, "\(what): a key field exactly with a connect block")
                tab.close()
                // the column's elements: every one the model names, in order
                let column = Hosted(Phone(model: m, host: rec.host(), unscrolledWidth: Self.screen.width), size: Self.screen)
                Self.check(column.elements, against: m, what)
                column.close()
                XCTAssertTrue(rec.actions.isEmpty, "\(what): laying out sends nothing")
            }
        }
    }

    func testAnUnknownRouteDrawsTheHubsLayoutWithTheConnectBlockLast() throws {
        // the hand-made forward-compat fixture: route "upsell", two groups left after the unknown rows, a connect block
        let fc = try CoachHomeFixtures.model("forward-compat", in: .heavyweight)
        XCTAssertEqual(fc.route, .other("upsell"))
        let column = Hosted(Phone(model: fc, host: Recorder().host(), unscrolledWidth: Self.screen.width), size: Self.screen)
        let got = column.elements
        column.close()
        Self.check(got, against: fc, "forward-compat")
        let labels = got.map { $0.isField ? "<field>" : $0.label }
        XCTAssertEqual(labels, ["COACH \u{00B7} PRO", "Hi Kalani. Coach goes pro.", "Everything you had, and more.",
                                "Conversation", "Open Chat", "Build My Programme", "Account", "Disconnect",
                                "<field>", "UPGRADE", fc.connect?.help ?? "?"],
                       "the hub's order, the connect block after the groups")
    }

    // MARK: VoiceOver

    func testSpeechIsThePagesOwnStrings() throws {
        let hub = try Self.model(Self.hubJSON())
        let rows = hub.groups.flatMap(\.rows)
        XCTAssertEqual(rows.map(CoachHomeSpeech.rowLabel), ["Open Chat", "Build My Programme", "Clear Chat History", "Disconnect"])
        XCTAssertEqual(rows.map(CoachHomeSpeech.rowValue),
                       ["3 exchanges \u{00B7} Push day went well, the last set moved fast", "Generate a custom training plan", nil, nil])
        XCTAssertEqual(hub.groups.map(CoachHomeSpeech.groupHead), ["Conversation", "Programme", "Account"])
        XCTAssertEqual(CoachHomeSpeech.meta(hub.meta), "COACH \u{00B7} WK 06 / 12 \u{00B7} STRENGTH")
        XCTAssertEqual(CoachHomeSpeech.headline(hub.hero), "Hi Kalani. Coach ready.")
        XCTAssertEqual(CoachHomeSpeech.body(hub.hero), "3 exchanges so far. Pick up where you left off, or start a new thread.")
        let connect = try XCTUnwrap(try Self.model(Self.connectJSON()).connect)
        XCTAssertEqual(CoachHomeSpeech.field(connect), "Anthropic API Key")
        XCTAssertEqual(CoachHomeSpeech.ctaLabel(connect), "CONNECT")
        XCTAssertEqual(CoachHomeSpeech.ctaValue(connect), "Save key & start coaching")
        XCTAssertEqual(CoachHomeSpeech.help(connect), Self.help)
        XCTAssertEqual(CoachHomeSpeech.starter(try XCTUnwrap(connect.starter)), "No key? Build a starter plan instead \u{2192}")
        // a part the page leaves empty is left out of the headline
        let bare = try Self.model(#"{"v":1,"hero":{"greet":"","title":"Coach","accent":"ready."}}"#)
        XCTAssertEqual(CoachHomeSpeech.headline(bare.hero), "Coach ready.")
    }

    /// The order and the traits VoiceOver meets (contract 6.2, D45, I17): the hub with three groups, the connect screen
    /// with and without the starter link, an unknown route with a connect block; in both rooms, at the large size and
    /// at .xxLarge (Larger Text never reorders).
    func testVoiceOverReadsTheWebsOrderAtEverySize() throws {
        for (roomName, room) in Self.rooms {
            let models: [(String, CoachHomeModel)] = [
                ("hub", try Self.model(Self.hubJSON(room: room))),
                ("connect", try Self.model(Self.connectJSON(room: room))),
                ("connect without the starter", try Self.model(Self.connectJSON(room: room, starter: false))),
                ("an unknown route", try Self.model(Self.otherJSON(room: room))),
            ]
            for (name, m) in models {
                var orders: [[String]] = []
                for size in [DynamicTypeSize.large, .xxLarge] {
                    let column = Hosted(Phone(model: m, host: Recorder().host(), size: size, unscrolledWidth: Self.screen.width), size: Self.screen)
                    let got = column.elements
                    column.close()
                    Self.check(got, against: m, "\(name) in \(roomName) at \(size)")
                    orders.append(got.map { $0.isField ? "<field>" : $0.label })
                    // the headline reads the greet, the title and the accent together
                    let headline = try XCTUnwrap(got.first { $0.traits.contains(.header) }, "\(name): the headline")
                    for part in [m.hero.greet, m.hero.title, m.hero.accent] {
                        XCTAssertTrue(headline.label.contains(part), "\(name) at \(size): the headline holds \(part)")
                    }
                }
                XCTAssertEqual(orders[0], orders[1], "\(name) in \(roomName): .xxLarge reads in the same order")
            }
        }
    }

    // MARK: The key field

    func testTheKeyFieldIsSecureOffersNoContentTypeAndTakesNoFocus() throws {
        for (roomName, room) in Self.rooms {
            let m = try Self.model(Self.connectJSON(room: room))
            let tab = Hosted(Phone(model: m, host: Recorder().host()), size: Self.screen)
            tab.settle(10)
            let tf = try XCTUnwrap(tab.field, "\(roomName): the key field")
            XCTAssertTrue(tf.isSecureTextEntry, "\(roomName): secure")
            XCTAssertEqual(tf.autocorrectionType, .no, "\(roomName): no autocorrection")
            XCTAssertEqual(tf.autocapitalizationType, .none, "\(roomName): no capitals")
            XCTAssertEqual(tf.keyboardType, .asciiCapable, "\(roomName): the ASCII keyboard")
            XCTAssertNil(tf.textContentType, "\(roomName): no content type at all (iOS has no password to offer to save)")
            XCTAssertEqual(tf.returnKeyType, .go, "\(roomName): Go on the keys")
            XCTAssertFalse(tf.isFirstResponder, "\(roomName): no focus but the owner's tap")
            XCTAssertEqual(tf.text ?? "", "", "\(roomName): empty")
            tab.close()
        }
    }

    func testConnectSendsOneActionPerPressAndNoneWhileAKeyIsOut() throws {
        let m = try Self.model(Self.connectJSON())
        let rec = Recorder()
        let column = Hosted(Phone(model: m, host: rec.host(), unscrolledWidth: Self.screen.width), size: Self.screen)
        let tf = try XCTUnwrap(column.field)
        Self.type("sk-ant-one", into: tf, column)
        XCTAssertTrue(column.press("CONNECT"), "CONNECT is pressed")
        XCTAssertEqual(rec.actions, [.connect(secret: "sk-ant-one")], "one press, one connect with what the field holds")
        XCTAssertTrue(column.press("CONNECT"))
        XCTAssertEqual(rec.actions, [.connect(secret: "sk-ant-one"), .connect(secret: "sk-ant-one")], "each press its own, never more")
        XCTAssertEqual(column.field?.text, "sk-ant-one", "the key stays in the field")
        // a key is out (the store's `connecting`): neither CONNECT nor Return does anything
        column.host.rootView = Phone(model: m, host: rec.host(connecting: true), unscrolledWidth: Self.screen.width)
        column.settle()
        rec.actions = []
        column.press("CONNECT")
        XCTAssertEqual(rec.actions, [], "CONNECT does nothing while a key is out")
        rec.actions = []
        Self.pressReturn(try XCTUnwrap(column.field), column)
        XCTAssertEqual(rec.actions, [], "Return does nothing while a key is out")
        rec.actions = []
        XCTAssertEqual(column.field?.text, "sk-ant-one", "and the key stays in the field")
        // answered (refused `invalid`: the route stays connect): CONNECT works again on the same text
        column.host.rootView = Phone(model: m, host: rec.host(connecting: false), unscrolledWidth: Self.screen.width)
        column.settle()
        column.press("CONNECT")
        XCTAssertEqual(rec.actions, [.connect(secret: "sk-ant-one")], "CONNECT once the key is answered")
        Self.pressReturn(try XCTUnwrap(column.field), column)
        XCTAssertEqual(rec.actions, [.connect(secret: "sk-ant-one"), .connect(secret: "sk-ant-one")], "and Return")
        column.close()
    }

    func testReturnActsAsConnect() throws {
        let rec = Recorder()
        let tab = Hosted(Phone(model: try Self.model(Self.connectJSON()), host: rec.host()), size: Self.screen)
        let tf = try XCTUnwrap(tab.field)
        Self.type("sk-ant-two", into: tf, tab)
        XCTAssertEqual(rec.actions, [], "typing sends nothing")
        Self.pressReturn(tf, tab)
        XCTAssertEqual(rec.actions, [.connect(secret: "sk-ant-two")], "Return is CONNECT")
        tab.close()
    }

    /// A host made again under the same view (a store replaced, a host built per render) takes every press from then
    /// on: SwiftUI's text field keeps its submit action from an earlier render, whose host is that render's, so Return
    /// must reach the host through the block's state, as CONNECT does. On the tab as it is (the scroll view) and on the
    /// unscrolled column, where CONNECT can be pressed too.
    func testReturnAndCONNECTReachTheNewestHost() throws {
        let m = try Self.model(Self.connectJSON())
        for width in [nil, Self.screen.width] as [CGFloat?] {
            let what = width == nil ? "the tab" : "the column"
            let first = Recorder(), second = Recorder()
            let tab = Hosted(Phone(model: m, host: first.host(), unscrolledWidth: width), size: Self.screen)
            Self.type("sk-ant-five", into: try XCTUnwrap(tab.field), tab)
            tab.host.rootView = Phone(model: m, host: second.host(), unscrolledWidth: width)
            tab.settle()
            Self.pressReturn(try XCTUnwrap(tab.field), tab)
            XCTAssertEqual(first.actions, [], "\(what): the earlier host hears nothing")
            XCTAssertEqual(second.actions, [.connect(secret: "sk-ant-five")], "\(what): Return reaches the newest host")
            if width != nil {
                second.actions = []
                XCTAssertTrue(tab.press("CONNECT"))
                XCTAssertEqual(second.actions, [.connect(secret: "sk-ant-five")], "\(what): CONNECT too")
                XCTAssertEqual(first.actions, [])
            }
            tab.close()
        }
    }

    /// The key field's VoiceOver name is the field label (contract 6.2, T-G11): the SecureField's title and its
    /// accessibility label both read `CoachHomeSpeech.field`, which is `connect.label`, and nothing in the field's
    /// declaration or where the block places it labels it again or folds it into another element (the walks hold that
    /// it stays an element of its own, in its place). Held in the view's source because the field reports no label to a
    /// test host (see the class notes): for now the only check of its spoken name, until an app scenario finds the
    /// field by its label where SwiftUI's accessibility runtime is loaded.
    func testTheKeyFieldIsLabelledWithTheFieldLabel() throws {
        let connect = try XCTUnwrap(try Self.model(Self.connectJSON()).connect)
        XCTAssertEqual(CoachHomeSpeech.field(connect), connect.label)
        let source = try String(contentsOf: Self.viewSource, encoding: .utf8)
        let field = try XCTUnwrap(Self.declaration("private var field: some View", in: source), "the key field's declaration")
        // its words with the white space squeezed, so a reflow of the lines changes nothing
        let words = field.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        XCTAssertTrue(words.contains("SecureField(text: $secret, prompt:"), "a SecureField on the block's own state: \(words)")
        XCTAssertTrue(words.contains("{ Text(verbatim: CoachHomeSpeech.field(connect)) }"), "its title is the field label")
        XCTAssertTrue(words.contains(".accessibilityLabel(Text(verbatim: CoachHomeSpeech.field(connect)))"), "its accessibility label is the field label")
        // no second label, no element made of it, no other accessibility name on it (the tap area under it is hidden)
        XCTAssertEqual(words.components(separatedBy: ".accessibilityLabel(").count - 1, 1, "one accessibility label on the field: \(words)")
        for other in [".accessibilityElement(", ".accessibilityRepresentation", ".accessibilityValue(", ".accessibilityInputLabels(",
                      ".accessibilityChildren", ".accessibilityHint("] {
            XCTAssertFalse(words.contains(other), "nothing else names the field (\(other)): \(words)")
        }
        XCTAssertEqual(words.components(separatedBy: ".accessibilityHidden(true)").count - 1, 1, "one hidden part: \(words)")
        XCTAssertTrue(words.contains(".background(HomeFieldTapArea { focused = true }.accessibilityHidden(true))"),
                      "and it is the tap area under the field, never the field: \(words)")
        // the block places the field bare, between the visible label and CONNECT
        let block = try XCTUnwrap(Self.declaration("struct HomeConnectBlock: View", in: source), "the connect block")
        let body = try XCTUnwrap(Self.declaration("var body: some View", in: block), "the block's body")
        let bodyWords = body.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        XCTAssertTrue(bodyWords.contains("fieldLabel field cta .padding(.top, t.px(14))"), "the field placed with no modifier of its own: \(bodyWords)")
        let label = try XCTUnwrap(Self.declaration("private var fieldLabel: some View", in: source), "the visible label's declaration")
        XCTAssertTrue(label.contains(".accessibilityHidden(true)"), "the visible label is hidden, so VoiceOver never reads it twice")
    }

    /// CoachHomeView.swift, from this file's path (Tests/FPUITests/CoachHomeViewTests.swift).
    static let viewSource = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("Sources/FPUI/Coach/CoachHomeView.swift")

    /// A declaration's text, from its first line to the brace that closes it.
    static func declaration(_ head: String, in source: String) -> String? {
        guard let start = source.range(of: head), let open = source[start.upperBound...].firstIndex(of: "{") else { return nil }
        var depth = 0
        var i = open
        while i < source.endIndex {
            switch source[i] {
            case "{": depth += 1
            case "}":
                depth -= 1
                if depth == 0 { return String(source[start.lowerBound...i]) }
            default: break
            }
            i = source.index(after: i)
        }
        return nil
    }

    /// The whole drawn box of the key field focuses it, as the web's input owns its padding (`padding: 13px 14px`): a
    /// tap above, below or beside the text lands on the box's tap area under the field, whose tap gives the field the
    /// focus; a tap on the text itself is the field's own. Both rooms, at the large size and at .xxLarge.
    func testATapAnywhereInTheKeyFieldsBoxFocusesIt() throws {
        for (roomName, room) in Self.rooms {
            for size in [DynamicTypeSize.large, .xxLarge] {
                let what = "\(roomName) at \(size)"
                let tab = Hosted(Phone(model: try Self.model(Self.connectJSON(room: room)), host: Recorder().host(), size: size), size: Self.screen)
                let tf = try XCTUnwrap(tab.field, what)
                let f = tf.convert(tf.bounds, to: tab.window)
                let t = RoomTheme.defaults(room, textSize: ChatType.textSize(size))
                func lands(_ p: CGPoint) -> UIView? { tab.window.hitTest(p, with: nil) }
                let mid = lands(CGPoint(x: f.midX, y: f.midY))
                XCTAssertTrue(mid === tf || mid?.isDescendant(of: tf) == true, "\(what): the text is the field's own (\(String(describing: mid)))")
                // the padding: 13 px above and below the text, 14 px beside it
                let pads = [("above", CGPoint(x: f.midX, y: f.minY - t.px(13) / 2)), ("below", CGPoint(x: f.midX, y: f.maxY + t.px(13) / 2)),
                            ("left", CGPoint(x: f.minX - t.px(14) / 2, y: f.midY)), ("right", CGPoint(x: f.maxX + t.px(14) / 2, y: f.midY)),
                            ("above and left of", CGPoint(x: f.minX - t.px(14) / 2, y: f.minY - t.px(13) / 2))]
                for (side, p) in pads {
                    XCTAssertTrue(lands(p) is HomeFieldTapArea.TapView, "\(what): a tap \(side) the text lands on the box (\(String(describing: lands(p))))")
                }
                let area = try XCTUnwrap(tab.find(HomeFieldTapArea.TapView.self), "\(what): the box's tap area")
                XCTAssertTrue(area.gestureRecognizers?.contains(area.recognizer) == true && area.recognizer.isEnabled, "\(what): its tap recogniser")
                XCTAssertTrue(area.accessibilityElementsHidden && !area.isAccessibilityElement, "\(what): hidden from VoiceOver (the field is the element)")
                XCTAssertFalse(tf.isFirstResponder, "\(what): no focus before the tap")
                area.tapped()
                tab.settle()
                XCTAssertTrue(try XCTUnwrap(tab.field).isFirstResponder, "\(what): the tap gives the field the focus")
                tab.window.endEditing(true)
                tab.settle()
                tab.close()
            }
        }
    }

    /// The key field draws in the room's face: the web's inline `font-family: monospace` (the system monospace) in
    /// Lime; Heavyweight's room sets Archivo with tabular figures over it (`index.html:2065`). 16 px at the large size.
    func testTheKeyFieldDrawsInTheRoomsFace() throws {
        for (roomName, room) in Self.rooms {
            let tab = Hosted(Phone(model: try Self.model(Self.connectJSON(room: room)), host: Recorder().host()), size: Self.screen)
            let font = try XCTUnwrap(tab.field?.font, "\(roomName): the field's face")
            tab.close()
            XCTAssertEqual(font.pointSize, 16, accuracy: 0.01, "\(roomName): homeField")
            let mono = font.fontDescriptor.symbolicTraits.contains(.traitMonoSpace)
            if room == .heavyweight {
                XCTAssertTrue(font.fontName.hasPrefix("ArchivoFP-"), "\(roomName): Archivo (\(font.fontName))")
                XCTAssertFalse(mono, "\(roomName): the board has no monospace")
            } else {
                XCTAssertTrue(mono, "\(roomName): the system monospace (\(font.fontName))")
                XCTAssertFalse(font.fontName.contains("FP"), "\(roomName): not a bundled face (\(font.fontName))")
            }
        }
    }

    func testTheRowsAndTheStarterLinkSendTheirActions() throws {
        let rec = Recorder()
        let hub = Hosted(Phone(model: try Self.model(Self.hubJSON()), host: rec.host(), unscrolledWidth: Self.screen.width), size: Self.screen)
        for title in ["Open Chat", "Build My Programme", "Clear Chat History", "Disconnect"] {
            XCTAssertTrue(hub.press(title), "\(title) is pressed")
        }
        hub.close()
        XCTAssertEqual(rec.actions, [.row(.openChat), .row(.startIntake), .row(.clearChat), .row(.disconnect)])
        rec.actions = []
        let connect = Hosted(Phone(model: try Self.model(Self.connectJSON()), host: rec.host(), unscrolledWidth: Self.screen.width), size: Self.screen)
        XCTAssertTrue(connect.press("No key? Build a starter plan instead \u{2192}"))
        connect.close()
        XCTAssertEqual(rec.actions, [.starter])
    }

    /// `fieldTyped` says only whether the field holds text: false when a field appears (a new one is empty), true once
    /// typed into, false once emptied, false once the route leaves the connect screen (which empties it); a model that
    /// keeps the route (a refusal, a key out) keeps the text and says nothing. When the whole hub goes (the store's
    /// ground: no model) and comes back, the new field says it is empty, so the store's flag never stays "typed" over
    /// an empty field.
    func testTheFieldReportsOnlyWhetherItHoldsText() throws {
        let connect = try Self.model(Self.connectJSON())
        let rec = Recorder()
        let tab = Hosted(Phone(model: connect, host: rec.host()), size: Self.screen)
        let tf = try XCTUnwrap(tab.field)
        XCTAssertEqual(rec.typed, [false], "a field that appears says it holds nothing")
        Self.type("sk-", into: tf, tab)
        XCTAssertEqual(rec.typed, [false, true], "typed")
        Self.type("ant", into: tf, tab)
        XCTAssertEqual(rec.typed, [false, true], "said once while it holds text")
        Self.clear(tf, tab)
        XCTAssertEqual(rec.typed, [false, true, false], "emptied")
        Self.type("sk-ant-three", into: tf, tab)
        XCTAssertEqual(rec.typed, [false, true, false, true])
        // a newer model on the same route (the page refused the key, `invalid`): the text stays
        tab.host.rootView = Phone(model: try Self.model(Self.connectJSON(rev: 5)), host: rec.host())
        tab.settle()
        XCTAssertEqual(tab.field?.text, "sk-ant-three", "the text stays after a refusal")
        XCTAssertEqual(rec.typed, [false, true, false, true])
        // the key saved: the route leaves the connect screen and the field goes
        tab.host.rootView = Phone(model: try Self.model(Self.hubJSON()), host: rec.host())
        tab.settle()
        XCTAssertNil(tab.field, "no field on the hub")
        XCTAssertEqual(rec.typed, [false, true, false, true, false], "the route left the connect screen: the field holds nothing")
        // back to the connect screen (Disconnect): a new, empty field, which says so
        tab.host.rootView = Phone(model: connect, host: rec.host())
        tab.settle()
        XCTAssertEqual(try XCTUnwrap(tab.field).text ?? "", "", "a new field is empty")
        XCTAssertEqual(rec.typed, [false, true, false, true, false, false])
        // typed into, then the whole hub goes (no model: the store's ground) and comes back: the new field is empty
        // and says so (the store resets its own flag when its model goes, N8)
        Self.type("sk-ant-four", into: try XCTUnwrap(tab.field), tab)
        XCTAssertEqual(rec.typed.last, true)
        tab.host.rootView = Phone(model: connect, host: rec.host(), shown: false)
        tab.settle()
        XCTAssertNil(tab.field, "no hub, no field")
        tab.host.rootView = Phone(model: connect, host: rec.host())
        tab.settle()
        XCTAssertEqual(try XCTUnwrap(tab.field).text ?? "", "", "the hub back: a new, empty field")
        XCTAssertEqual(Array(rec.typed.suffix(2)), [true, false], "and it says it holds nothing: \(rec.typed)")
        tab.close()
    }

    /// The key lives only in the field's state and in the action it hands the host (contract 5, K5): after a canary is
    /// typed and CONNECT pressed, no 6-character piece of it is in UserDefaults or in the app's Application Support
    /// or Caches files, nor in the action's printed forms. This test host has no container of its own (its folders are
    /// the simulator's shared ones), so the files read are those written since the canary was made: any file that
    /// holds it was written after that.
    func testATypedCanaryLeavesNoTrace() throws {
        let started = Date().addingTimeInterval(-1)
        let key = Self.canary()
        let rec = Recorder()
        let column = Hosted(Phone(model: try Self.model(Self.connectJSON()), host: rec.host(), unscrolledWidth: Self.screen.width), size: Self.screen)
        let tf = try XCTUnwrap(column.field)
        Self.type(key, into: tf, column)
        XCTAssertTrue(column.press("CONNECT"))
        XCTAssertEqual(rec.actions, [.connect(secret: key)], "the key reaches the host once, whole")
        column.close()
        UserDefaults.standard.synchronize()
        let pieces = Self.pieces(key)
        // UserDefaults, every value
        var found: [String] = []
        func scan(_ v: Any, _ path: String) {
            switch v {
            case let s as String: for p in pieces where s.contains(p) { found.append("UserDefaults \(path) holds \(p)") }
            case let d as Data: if let hit = Self.hit(pieces, in: d) { found.append("UserDefaults \(path) holds \(hit)") }
            case let a as [Any]: for (i, x) in a.enumerated() { scan(x, path + "[\(i)]") }
            case let o as [String: Any]: for (k, x) in o { scan(k, path + ".key"); scan(x, path + "." + k) }
            default: scan(String(describing: v), path)
            }
        }
        for (k, v) in UserDefaults.standard.dictionaryRepresentation() { scan(k, "key"); scan(v, k) }
        // the app's files
        var files = 0, written = 0
        let keys: [URLResourceKey] = [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey]
        for dir in [FileManager.SearchPathDirectory.applicationSupportDirectory, .cachesDirectory] {
            for base in FileManager.default.urls(for: dir, in: .userDomainMask) {
                guard let e = FileManager.default.enumerator(at: base, includingPropertiesForKeys: keys) else { continue }
                for case let url as URL in e {
                    let values = try? url.resourceValues(forKeys: Set(keys))
                    guard values?.isRegularFile == true else { continue }
                    files += 1
                    guard (values?.contentModificationDate ?? .distantFuture) >= started, (values?.fileSize ?? 0) < 64 << 20,
                          let data = try? Data(contentsOf: url) else { continue }
                    written += 1
                    if let hit = Self.hit(pieces, in: data) { found.append("\(url.path) holds \(hit)") }
                }
            }
        }
        XCTAssertGreaterThan(files, 0, "the folders were read")
        XCTAssertEqual(found, [], "no piece of the key anywhere (\(written) of \(files) files written since the canary was made)")
        // the action as printed
        let action = CoachHomeAction.connect(secret: key)
        var dumped = ""
        dump(action, to: &dumped)
        for printed in ["\(action)", String(describing: action), String(reflecting: action), dumped] {
            for p in Self.pieces(key) + ["sk-ant"] { XCTAssertFalse(printed.contains(p), "a printed form holds \(p): \(printed)") }
        }
        XCTAssertEqual("\(action)", "connect(secret: •••)")
    }

    // MARK: Geometry and motion

    func testTheMetaRowPublishesItsBottom() throws {
        for json in [Self.hubJSON(), Self.connectJSON(), Self.hubJSON(room: .lime)] {
            let m = try Self.model(json)
            var bottom: CGFloat = 0
            let tab = Hosted(Phone(model: m, host: Recorder().host(), onBottom: { bottom = $0 }), size: Self.screen)
            tab.settle()
            tab.close()
            // under the status bar, below the label and its 17 + 27 px of padding
            XCTAssertGreaterThan(bottom, Self.safeTop + 44, "\(m.route): the meta row's bottom, in window coordinates")
            XCTAssertLessThan(bottom, Self.safeTop + 140, "\(m.route): at the top of the column")
        }
    }

    /// As the hub scrolls, the meta row's bottom follows the row while it lies at or below the safe area's top, then
    /// says 0 once the row has gone under the status bar: never a point inside the status bar's band, where a host
    /// reading `y > 0` (ScreenHost, contract 8.3) would put its toast under the status bar and the Dynamic Island. On a
    /// short screen, so the column has room to scroll past the row.
    func testTheMetaRowsBottomFollowsTheScrollAndSaysZeroUnderTheStatusBar() throws {
        let short = CGSize(width: 390, height: 520)
        let cases: [(String, String, DynamicTypeSize, Bool)] = [
            ("the hub at .xxLarge", Self.hubJSON(), .xxLarge, false),
            ("Lime's connect screen", Self.connectJSON(room: .lime), .large, false),
            ("the hub under the window's own safe area too", Self.hubJSON(), .xxLarge, true),
        ]
        for (what, json, size, keepsSafeArea) in cases {
            var bottom: CGFloat = -1
            let tab = Hosted(Phone(model: try Self.model(json), host: Recorder().host(), size: size, onBottom: { bottom = $0 }), size: short,
                             keepsSafeArea: keepsSafeArea)
            let scroll = try XCTUnwrap(tab.find(UIScrollView.self), what)
            // the safe area's top: the phone's 47 pt, below the simulator's own status bar when the window's is kept
            let safeTop = (keepsSafeArea ? tab.host.view.safeAreaInsets.top : 0) + Self.safeTop
            if keepsSafeArea { XCTAssertGreaterThan(safeTop, Self.safeTop, "\(what): the window's own inset adds to the phone's") }
            let top = -scroll.adjustedContentInset.top
            XCTAssertEqual(top, -safeTop, accuracy: 0.5, "\(what): the content starts under the status bar")
            let rest = bottom
            XCTAssertGreaterThan(rest, safeTop + 44, "\(what): at rest, under the status bar")
            var followed = 0, gone = 0
            for dy in stride(from: CGFloat(10), through: 200, by: 10) {
                scroll.setContentOffset(CGPoint(x: 0, y: top + dy), animated: false)
                tab.settle(3)
                let row = rest - dy   // where the row's bottom is now
                XCTAssertTrue(bottom == 0 || bottom >= safeTop, "\(what) scrolled \(dy): \(bottom) is inside the status bar's band")
                if row >= safeTop + 0.5 {
                    XCTAssertEqual(bottom, row, accuracy: 0.5, "\(what) scrolled \(dy): the value follows the row")
                    followed += 1
                } else if row < safeTop - 0.5 {
                    XCTAssertEqual(bottom, 0, "\(what) scrolled \(dy): the row (\(row)) is under the status bar")
                    gone += 1
                }
            }
            XCTAssertGreaterThan(followed, 2, "\(what): the value followed the row")
            XCTAssertGreaterThan(gone, 2, "\(what): and went to 0 under the status bar")
            tab.close()
        }
        // the rule itself: the unscrolled column never moves, so it publishes its bottom as it is
        XCTAssertEqual(HubHeaderBottomKey.value(bottom: 47, safeTop: 47), 47)
        XCTAssertEqual(HubHeaderBottomKey.value(bottom: 46.9, safeTop: 47), 0)
        XCTAssertEqual(HubHeaderBottomKey.value(bottom: 13.6, safeTop: 47), 0)
        XCTAssertEqual(HubHeaderBottomKey.value(bottom: 128.9, safeTop: nil), 128.9)
    }

    /// A headline part that wraps keeps the web's line pitch: every line of the h1 sits on its .9 (Heavyweight) or .92
    /// (Lime) line box, so the connect screen's "YOUR COACH.", which wraps at Larger Text, draws as three lines on that
    /// pitch under the greet, never two parts spaced at the face's own line (Anton's is about 1.5 em). The element's
    /// frame is its lines' own boxes: the greet, its gap, n line boxes, and the last line's face reaching half its
    /// (negative) leading below its box.
    func testAWrappedHeadlineKeepsTheCSSLinePitch() throws {
        let long = "your own new coach."   // a Lime accent wide enough to wrap at any size
        let cases: [(Room, CGFloat, DynamicTypeSize, String?, [String])] = [
            (.heavyweight, 390, .large, nil, ["CONNECT", "YOUR COACH."]),
            (.heavyweight, 390, .xLarge, nil, ["CONNECT", "YOUR", "COACH."]),
            (.heavyweight, 390, .xxLarge, nil, ["CONNECT", "YOUR", "COACH."]),
            (.heavyweight, 375, .xxLarge, nil, ["CONNECT", "YOUR", "COACH."]),
            (.heavyweight, 320, .xLarge, nil, ["CONNECT", "YOUR", "COACH."]),
            (.lime, 390, .large, nil, ["Connect", "your coach."]),
            (.lime, 390, .xxLarge, nil, ["Connect", "your", "coach."]),
            (.lime, 390, .xxLarge, long, ["Connect", "your own", "new coach."]),
            (.lime, 320, .large, long, ["Connect", "your own new", "coach."]),
        ]
        for (room, width, size, accent, lines) in cases {
            let what = "\(room.id) at \(Int(width)) pt, \(size)"
            var json = Self.connectJSON(room: room)
            if let accent { json = json.replacingOccurrences(of: "\"accent\":\"your coach.\"", with: "\"accent\":\(Self.literal(accent))") }
            let m = try Self.model(json)
            let t = RoomTheme(home: m, system: size)
            let css = CoachHomeView.headlineSize(t, width: width)
            let paper = room == .heavyweight
            let face = t.uiFont(.display, css, paper ? 400 : 800)
            // the parts' own breaks, as the view takes them
            let column = width - 2 * CoachHomeView.gutter(t, width: width)
            let parts = [m.hero.title, m.hero.accent].flatMap {
                CoachHomeView.headlineLines(paper ? $0.uppercased() : $0, font: face, tracking: t.px(CoachHomeView.headlineTracking(t, width: width)), width: column)
            }
            XCTAssertEqual(parts, lines, "\(what): the lines")
            let hosted = Hosted(Phone(model: m, host: Recorder().host(), size: size, unscrolledWidth: width), size: CGSize(width: width, height: 844))
            let headline = try XCTUnwrap(hosted.elements.first { $0.traits.contains(.header) }, what)
            hosted.close()
            let pitch = t.px(css * (paper ? 0.9 : 0.92))
            let greet = t.uiFont(.body, t.home(.homeGreet), 500).lineHeight
            let height = greet + t.px(paper ? 10 : 15) + CGFloat(lines.count) * pitch + (face.lineHeight - pitch) / 2
            XCTAssertEqual(headline.frame.height, height, accuracy: 1, "\(what): \(lines.count) lines on the \(paper ? ".9" : ".92") pitch")
            XCTAssertEqual(headline.frame.minX, CoachHomeView.gutter(t, width: width), accuracy: 0.5, "\(what): at the gutter")
            XCTAssertLessThanOrEqual(headline.frame.maxX, width - CoachHomeView.gutter(t, width: width) + 1, "\(what): inside the column")
        }
    }

    /// The headline's breaks, as the browser breaks the h1 (white-space: normal, overflow-wrap: break-word): at a space
    /// where the next word would pass the column, white space collapsed, inside a word only when the word alone is
    /// wider than the column, the tracking counted.
    func testHeadlineLinesBreakAsTheBrowserBreaksTheH1() {
        let t = RoomTheme.defaults(.heavyweight, textSize: .xxLarge)
        let anton = t.uiFont(.display, 74, 400)
        func lines(_ s: String, _ width: CGFloat, tracking: CGFloat = 0, font: UIFont? = nil) -> [String] {
            CoachHomeView.headlineLines(s, font: font ?? anton, tracking: tracking, width: width)
        }
        func width(_ s: String, font: UIFont? = nil) -> CGFloat { (s as NSString).size(withAttributes: [.font: font ?? anton]).width }
        let both = width("YOUR COACH.")
        XCTAssertEqual(lines("YOUR COACH.", both + 2), ["YOUR COACH."], "it fits")
        XCTAssertEqual(lines("YOUR COACH.", both - 2), ["YOUR", "COACH."], "the next word would pass the column")
        XCTAssertEqual(lines(" YOUR \n\t COACH. ", both + 2), ["YOUR COACH."], "white space collapses, a line break with it")
        // a no-break space joins its words: never a break there (the pair breaks only as one word wider than the column)
        let joined = lines("YOUR\u{00A0}COACH.", width("YOUR\u{00A0}CO") + 1)
        XCTAssertTrue(joined.first?.hasPrefix("YOUR\u{00A0}C") == true, "\(joined)")
        XCTAssertEqual(joined.joined(), "YOUR\u{00A0}COACH.")
        XCTAssertEqual(lines("", 300), [])
        XCTAssertEqual(lines(" \n ", 300), [])
        // a word alone wider than the column breaks between its letters, every piece inside the column
        let word = lines("CONNECTCONNECT", 300)
        XCTAssertGreaterThan(word.count, 1, "overflow-wrap: break-word")
        XCTAssertEqual(word.joined(), "CONNECTCONNECT", "no letter lost")
        for piece in word { XCTAssertLessThanOrEqual(width(piece), 300.5, "\(piece) fits") }
        // the tracking counts: Lime's -2.6 px a letter fits a line that its letters alone would pass
        let inter = RoomTheme.defaults(.lime).uiFont(.display, 51.675, 800)
        let plain = width("your coach.", font: inter)
        XCTAssertEqual(lines("your coach.", plain - 10, font: inter), ["your", "coach."])
        XCTAssertEqual(lines("your coach.", plain - 10, tracking: -2.6, font: inter), ["your coach."], "11 letters at -2.6 make room")
    }

    /// The help is one element whose two paragraphs draw as two lines (its "\n" a line break, as the web's <br>).
    func testTheHelpsTwoParagraphsDrawAsTwoLines() throws {
        for (roomName, room) in Self.rooms {
            var heights: [CGFloat] = []
            for help in ["Get a key.\nAnthropic bills usage.", "Get a key. Anthropic bills usage."] {
                let m = try Self.model(Self.connectJSON(room: room, help: help))
                let column = Hosted(Phone(model: m, host: Recorder().host(), unscrolledWidth: Self.screen.width), size: Self.screen)
                let el = try XCTUnwrap(column.elements.first { $0.label == help }, "\(roomName): the help element")
                column.close()
                heights.append(el.frame.height)
            }
            // an element's frame is its lines' own box: one line is the face's height, each line after it one more
            // 1.55 pitch (the half-leading above the first and below the last is layout, outside the frame)
            let t = RoomTheme.defaults(room)
            XCTAssertEqual(heights[1], t.uiFont(.body, 12, 400).lineHeight, accuracy: 1, "\(roomName): one paragraph, one line (\(heights))")
            XCTAssertEqual(heights[0] - heights[1], t.px(12 * 1.55), accuracy: 1, "\(roomName): two paragraphs, two lines (\(heights))")
        }
    }

    /// A row's sub wraps as the web's does (`.settings-row-sub` has no nowrap): Open Chat's "N exchanges · preview"
    /// (about 300 pt of 11.5 px text in a column of about 247) takes a second line on its 1.4 pitch where "No messages
    /// yet" (about 165) takes one, so the row grows by that line; VoiceOver's value is the whole sub either way.
    func testARowsSubWrapsAsTheWebsDoes() throws {
        let long = "3 exchanges \u{00B7} Push day went well, the last set moved fast"   // the hub model's own sub
        let short = "No messages yet \u{2014} tap to start"
        for (roomName, room) in Self.rooms {
            var heights: [CGFloat] = []
            for sub in [short, long] {
                let m = try Self.model(Self.hubJSON(room: room).replacingOccurrences(of: long, with: sub))
                let column = Hosted(Phone(model: m, host: Recorder().host(), unscrolledWidth: Self.screen.width), size: Self.screen)
                let row = try XCTUnwrap(column.elements.first { $0.label == "Open Chat" }, "\(roomName): the row")
                column.close()
                XCTAssertEqual(row.value, sub, "\(roomName): VoiceOver's value is the whole sub")
                heights.append(row.frame.height)
            }
            let t = RoomTheme.defaults(room)
            XCTAssertEqual(heights[1] - heights[0], t.px(11.5 * 1.4), accuracy: 1, "\(roomName): the long sub takes a second line (\(heights))")
        }
    }

    /// The press rules: CONNECT dims to .9 and shrinks to .985 (`.kt-cta:active`), under Reduce Motion it only dims;
    /// the starter link, a plain button on the web, dims to .7 and shrinks to .97, under Reduce Motion it dims to .85
    /// and keeps its size (`index.html:169, 1042-1043, 1067`). The next two tests hold that the screen's buttons follow
    /// the system's setting, and that a pressed look draws what these rules say.
    func testCONNECTDoesNotShrinkUnderReduceMotion() {
        XCTAssertEqual(HomeCTAPress.scale(pressed: true, reduceMotion: true), 1, "Reduce Motion: no scale")
        XCTAssertEqual(HomeCTAPress.scale(pressed: true, reduceMotion: false), 0.985, "pressed: .985, as .kt-cta:active")
        XCTAssertEqual(HomeCTAPress.scale(pressed: false, reduceMotion: false), 1)
        XCTAssertEqual(HomeCTAPress.opacity(pressed: true), 0.9, "pressed: opacity .9, Reduce Motion or not")
        XCTAssertEqual(HomeCTAPress.opacity(pressed: false), 1)
        XCTAssertEqual(HomeLinkPress.scale(pressed: true, reduceMotion: false), 0.97, "the link pressed: .97, a plain button's press-down")
        XCTAssertEqual(HomeLinkPress.scale(pressed: true, reduceMotion: true), 1, "the link under Reduce Motion: no scale")
        XCTAssertEqual(HomeLinkPress.scale(pressed: false, reduceMotion: false), 1)
        XCTAssertEqual(HomeLinkPress.opacity(pressed: true, reduceMotion: false), 0.7, "the link pressed: opacity .7")
        XCTAssertEqual(HomeLinkPress.opacity(pressed: true, reduceMotion: true), 0.85, "the link under Reduce Motion: opacity .85")
        XCTAssertEqual(HomeLinkPress.opacity(pressed: false, reduceMotion: true), 1)
        for on in [true, false] {
            XCTAssertEqual(HomePress.cta.look(pressed: false, reduceMotion: on), HomePress.Look(scale: 1, opacity: 1), "CONNECT at rest")
            XCTAssertEqual(HomePress.link.look(pressed: false, reduceMotion: on), HomePress.Look(scale: 1, opacity: 1), "the link at rest")
        }
    }

    /// The connect screen as the tab draws it (the scroll view) and as the walks lay it out, under the system's Reduce
    /// Motion on and off (the environment's value, set through SwiftUI's settable twin as the system sets it), in both
    /// rooms: a press of CONNECT draws at its full size under Reduce Motion and at .985 without it, and the starter
    /// link likewise at its full size and .97. Read through what each button's pressed look publishes (`HomePressKey`):
    /// no finger can press a button in this host, and the pressed look reads Reduce Motion itself, as a press would.
    func testTheConnectScreensButtonsFollowTheSystemsReduceMotion() throws {
        for (roomName, room) in Self.rooms {
            let m = try Self.model(Self.connectJSON(room: room))
            for on in [true, false] {
                for width in [nil, Self.screen.width] as [CGFloat?] {
                    let what = "\(roomName), \(width == nil ? "the tab" : "the column"), Reduce Motion \(on ? "on" : "off")"
                    var looks: [HomePress: HomePress.Look]?
                    let tab = Hosted(Phone(model: m, host: Recorder().host(), unscrolledWidth: width, systemReduceMotion: on,
                                           onPress: { looks = $0 }), size: Self.screen)
                    tab.settle()
                    tab.close()
                    XCTAssertEqual(looks?[.cta], HomePress.Look(scale: on ? 1 : 0.985, opacity: 0.9), "\(what): a press of CONNECT (\(String(describing: looks)))")
                    XCTAssertEqual(looks?[.link], HomePress.Look(scale: on ? 1 : 0.97, opacity: on ? 0.85 : 0.7), "\(what): a press of the starter link")
                }
            }
        }
        // the hub draws neither button
        var hub: [HomePress: HomePress.Look]?
        let tab = Hosted(Phone(model: try Self.model(Self.hubJSON()), host: Recorder().host(), systemReduceMotion: true, onPress: { hub = $0 }),
                         size: Self.screen)
        tab.close()
        XCTAssertEqual(hub ?? [:], [:], "the hub has no CONNECT and no starter link")
    }

    /// A pressed look as drawn: a 200 pt black square on white, held pressed, under Reduce Motion on and off. Its side
    /// (from its inked area, each pixel counted by its darkness over the square's own) is 200 times the scale the rule
    /// gives, and its darkness at the middle the opacity: CONNECT 200 pt at .9 under Reduce Motion, 197 at .9 without;
    /// the link 200 at .85 and 194 at .7 (an edge snapped to the pixel grid is off by half a point at most).
    func testAPressedLookDrawsItsRule() throws {
        let side: CGFloat = 200, canvas = CGSize(width: 240, height: 240)
        for press in HomePress.allCases {
            for on in [true, false] {
                let what = "\(press), Reduce Motion \(on ? "on" : "off")"
                let want = press.look(pressed: true, reduceMotion: on)
                let view = ZStack {
                    Color.white
                    HomePressed(press, pressed: true) { Color.black.frame(width: side, height: side) }
                }
                .frame(width: canvas.width, height: canvas.height)
                .transformEnvironment(\._accessibilityReduceMotion) { $0 = on }
                let image = CoachRenderTests.render(view, size: canvas, phone: .light)
                let c = try XCTUnwrap(image.cgImage, what)
                let px = CoachRenderTests.bytes(c)
                let k = CGFloat(c.width) / canvas.width   // pixels per point
                func dark(_ x: Int, _ y: Int) -> Double { 1 - Double(px[(y * c.width + x) * 4]) / 255 }
                let middle = dark(c.width / 2, c.height / 2)
                var ink = 0.0
                for y in 0..<c.height { for x in 0..<c.width { ink += dark(x, y) } }
                let drawn = (ink / middle).squareRoot() / Double(k)
                XCTAssertEqual(middle, want.opacity, accuracy: 0.01, "\(what): the opacity drawn")
                XCTAssertEqual(drawn, Double(side * want.scale), accuracy: 0.6, "\(what): the side drawn (scale \(want.scale))")
            }
        }
    }

    /// The starter link keeps PressAreaButton's structure (PressAreaTests): its press shape is the outermost part of
    /// the Button's label, around the reach, so it is pressed where the reach says, and the connect block builds the
    /// link on it; one line between the web button's 8 px paddings plus the reach is 44 pt at every size.
    func testTheStarterLinkIsPressedFortyFourPointsTall() throws {
        let link = PressAreaTests.bodyType(HomeLinkButton(v: 11, action: {}) { Color.red.frame(width: 200, height: 22) })
        let label = try XCTUnwrap(PressAreaTests.buttonLabel(in: link), link)
        XCTAssertTrue(label.hasSuffix("_ContentShapeModifier<Rectangle>>"), "the press shape is the Button's label's, around the reach: \(link)")
        let connect = try XCTUnwrap(try Self.model(Self.connectJSON()).connect)
        let block = PressAreaTests.bodyType(HomeConnectBlock(connect: connect, host: Recorder().host()))
        XCTAssertTrue(block.contains("HomeLinkButton<"), "the connect block's starter link is a HomeLinkButton: \(block)")
        for (roomName, room) in Self.rooms {
            for size in [DynamicTypeSize.large, .xLarge, .xxLarge] {
                let t = RoomTheme.defaults(room, textSize: ChatType.textSize(size))
                let drawn = HomeConnectBlock.linkFont(t).lineHeight + 2 * t.px(8)
                XCTAssertGreaterThanOrEqual(drawn + 2 * HomeConnectBlock.linkReach(t), 44 - 0.001, "\(roomName) at \(size): pressed 44 pt tall")
            }
        }
    }

    /// A 320 pt screen (Display Zoom) takes the 16 px gutter and Lime's 41 px headline (`index.html:1580-1585`);
    /// wider screens the 20 px gutter and the viewport clamp.
    func testA320PointScreenTakesTheNarrowGutterAndLimesHeadline() throws {
        let hw = RoomTheme.defaults(.heavyweight), lime = RoomTheme.defaults(.lime)
        XCTAssertEqual(CoachHomeView.gutter(hw, width: 320), 16)
        XCTAssertEqual(CoachHomeView.gutter(lime, width: 360), 16)
        XCTAssertEqual(CoachHomeView.gutter(lime, width: 390), 20)
        XCTAssertEqual(CoachHomeView.gutter(RoomTheme.defaults(.lime, textSize: .xxLarge), width: 320), 16 * 1.24, accuracy: 0.001,
                       "the gutter the media query picks scales with the text")
        XCTAssertEqual(CoachHomeView.headlineSize(lime, width: 320), 41)
        XCTAssertEqual(CoachHomeView.headlineTracking(lime, width: 320), -2.1)
        XCTAssertEqual(CoachHomeView.headlineSize(lime, width: 390), 0.1325 * 390, accuracy: 0.001)
        XCTAssertEqual(CoachHomeView.headlineTracking(lime, width: 390), -2.6)
        XCTAssertEqual(CoachHomeView.headlineSize(lime, width: 500), 56, "Lime's clamp max")
        XCTAssertEqual(CoachHomeView.headlineSize(hw, width: 320), 0.17 * 320, accuracy: 0.001, "Heavyweight keeps its clamp at 320")
        XCTAssertEqual(CoachHomeView.headlineSize(hw, width: 300), 54, "Heavyweight's clamp min")
        XCTAssertEqual(CoachHomeView.headlineSize(hw, width: 500), 74, "Heavyweight's clamp max")
        XCTAssertEqual(CoachHomeView.headlineTracking(hw, width: 320), 0, "Anton is not tracked")
        // laid out: the headline starts at the gutter, two lines of 41 px on a .92 line under the greet
        let m = try Self.model(Self.connectJSON(room: .lime))
        for (size, gutter, title) in [(Self.narrow, CGFloat(16), CGFloat(41)), (Self.screen, CGFloat(20), CGFloat(0.1325 * 390))] {
            let column = Hosted(Phone(model: m, host: Recorder().host(), unscrolledWidth: size.width), size: size)
            let headline = try XCTUnwrap(column.elements.first { $0.traits.contains(.header) })
            column.close()
            // the element's frame is the union of its lines' own boxes: the greet, its 15 px, the two .92 lines, and
            // the last line's face reaching half its (negative) leading below its line box
            let greet = lime.uiFont(.body, 14, 500).lineHeight
            let face = lime.uiFont(.display, title, 800).lineHeight
            let height = greet + 15 + 2 * title * 0.92 + (face - title * 0.92) / 2
            XCTAssertEqual(headline.frame.minX, gutter, accuracy: 0.5, "\(size.width) pt: the gutter")
            XCTAssertEqual(headline.frame.height, height, accuracy: 1, "\(size.width) pt: a \(title) px headline")
        }
    }

    /// The app's Larger Text toggle (`dynTypeOn`, the web's zoom): off, the hub draws at the large size whatever the
    /// system's size, as the page does without its zoom; on, at the system's size kept within large...xxLarge (the web
    /// zoom's 1, 1.12, 1.24). The theme `RoomTheme(home:system:)` makes, then the connect screen laid out at .xxLarge
    /// with the toggle off: its headline and its key field as at the large size, and larger with it on.
    func testLargerTextOffDrawsAtTheLargeSizeWhateverTheSystemsSize() throws {
        for (roomName, room) in Self.rooms {
            let on = try Self.model(Self.connectJSON(room: room))
            let off = try Self.model(Self.connectJSON(room: room).replacingOccurrences(of: "\"dynTypeOn\":true", with: "\"dynTypeOn\":false"))
            XCTAssertTrue(on.dynTypeOn, roomName)
            XCTAssertFalse(off.dynTypeOn, "\(roomName): the toggle off")
            for size in [DynamicTypeSize.small, .large, .xLarge, .xxLarge, .xxxLarge, .accessibility3] {
                let t = RoomTheme(home: off, system: size)
                XCTAssertEqual(t.textSize, .large, "\(roomName), off at \(size): the large size")
                XCTAssertEqual(t.scale, 1, "\(roomName), off at \(size): no zoom")
            }
            let sizes: [(DynamicTypeSize, TextSize, CGFloat)] = [(.small, .large, 1), (.large, .large, 1), (.xLarge, .xLarge, 1.12),
                                                                 (.xxLarge, .xxLarge, 1.24), (.accessibility3, .xxLarge, 1.24)]
            for (size, clamped, scale) in sizes {
                let t = RoomTheme(home: on, system: size)
                XCTAssertEqual(t.textSize, clamped, "\(roomName), on at \(size)")
                XCTAssertEqual(t.scale, scale, accuracy: 0.0001, "\(roomName), on at \(size): the web zoom's factor")
            }
            // laid out: the headline's height and the key field's face
            func laid(_ m: CoachHomeModel, _ size: DynamicTypeSize) throws -> (headline: CGFloat, field: CGFloat) {
                let column = Hosted(Phone(model: m, host: Recorder().host(), size: size, unscrolledWidth: Self.screen.width), size: Self.screen)
                defer { column.close() }
                let headline = try XCTUnwrap(column.elements.first { $0.traits.contains(.header) }, "\(roomName): the headline")
                return (headline.frame.height, try XCTUnwrap(column.field?.font?.pointSize, "\(roomName): the key field"))
            }
            let large = try laid(off, .large)
            let offBig = try laid(off, .xxLarge)
            XCTAssertEqual(offBig.headline, large.headline, accuracy: 0.5, "\(roomName), off: .xxLarge draws the headline as large does")
            XCTAssertEqual(offBig.field, 16, accuracy: 0.01, "\(roomName), off: the key field's face at the large size")
            let onBig = try laid(on, .xxLarge)
            XCTAssertGreaterThan(onBig.headline, large.headline + 10, "\(roomName), on: .xxLarge draws a larger headline")
            XCTAssertEqual(onBig.field, 16 * 1.24, accuracy: 0.01, "\(roomName), on: the key field's face at .xxLarge")
        }
    }
}
#endif
