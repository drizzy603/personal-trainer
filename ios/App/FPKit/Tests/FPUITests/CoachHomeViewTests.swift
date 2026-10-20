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
/// out; the field reports only whether it holds text; a typed canary leaves no trace in UserDefaults or the app's
/// files; the meta row publishes its bottom; the help's two paragraphs are two lines; CONNECT does not shrink under
/// Reduce Motion; a 320 pt screen takes the narrow gutter and Lime's 41 pt headline.
///
/// How this host is driven (probed on iOS 27.0's simulator): SwiftUI vends its accessibility elements to a test only
/// outside a scroll view (inside one it vends none without an accessibility client such as VoiceOver), so the walks
/// lay the same column out unscrolled (`CoachHomeOptions.unscrolledWidth`), with the accessibility switches on for
/// the class (below). UIKit's own accessibility is not loaded in a test host, so the secure field shows up in the walk
/// as its `UITextField` (the platform view SwiftUI hands VoiceOver), its label unread. A press goes through
/// `accessibilityActivate()`, as the probe's `press` does; keys and Return reach SwiftUI's text field as UIKit delivers
/// them, the field's editing-changed and primary actions sent to their targets (`UIControl.sendActions` does not reach
/// them in this host).
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

    /// What the view asked of its host.
    final class Recorder {
        var actions: [CoachHomeAction] = []
        var typed: [Bool] = []

        func host(connecting: Bool = false) -> CoachHomeHost {
            CoachHomeHost(act: { [unowned self] in self.actions.append($0) }, connecting: connecting,
                          fieldTyped: { [unowned self] in self.typed.append($0) })
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

    /// The coachHome fixtures FPCoreTests decodes (`Tests/FPCoreTests/Fixtures/coachHome`), read from the source tree:
    /// the hand-made ones now, the page-built ones as they land (the folder is listed, never named file by file).
    enum HomeFixtures {
        static let dir: URL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("FPCoreTests/Fixtures/coachHome", isDirectory: true)

        static func names() throws -> [String] {
            try FileManager.default.contentsOfDirectory(atPath: dir.path).filter { $0.hasSuffix(".json") }.map { String($0.dropLast(5)) }.sorted()
        }

        /// The fixture in `room`: its own room keeps the file's tokens, another room takes that room's compiled defaults.
        static func model(_ name: String, in room: Room) throws -> CoachHomeModel {
            let json = try JSONText.parse(utf8: Data(contentsOf: dir.appendingPathComponent(name + ".json")))
            let own = try CoachHomeModel(json: json)
            guard own.room != room, case .object(var o) = json else { return own }
            o["room"] = .string(room.id)
            o["paper"] = .bool(room.isPaper ?? own.paper)
            o["tokens"] = nil
            return try CoachHomeModel(json: .object(o))
        }
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

        var body: some View {
            CoachHomeView(model: model, host: host, options: CoachHomeOptions(unscrolledWidth: unscrolledWidth))
                .safeAreaPadding(.top, CoachHomeViewTests.safeTop)
                .safeAreaPadding(.bottom, CoachHomeViewTests.safeBottom)
                .environment(\.dynamicTypeSize, size)
                .onPreferenceChange(HubHeaderBottomKey.self) { y in MainActor.assumeIsolated { onBottom?(y) } }
        }
    }

    /// A view in a key window of `size`, laid out until it settles.
    @MainActor final class Hosted {
        let host: UIHostingController<Phone>
        let window: UIWindow

        init(_ phone: Phone, size: CGSize) {
            host = UIHostingController(rootView: phone)
            host.safeAreaRegions = []
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

    /// Checks a walk against what VoiceOver must meet: the order, each element's label (the field's when it reports
    /// one), value and traits, and the contract's rules (no element named the avatar's letter, the field label's text
    /// never on another element, no two elements with one label).
    static func check(_ got: [AXElement], against m: CoachHomeModel, _ what: String, file: StaticString = #filePath, line: UInt = #line) {
        let want = wanted(m)
        XCTAssertEqual(got.count, want.count, "\(what): \(got.count) elements, wanted \(want.count): \(got)", file: file, line: line)
        for (i, (g, w)) in zip(got, want).enumerated() {
            let at = "\(what), element \(i) (\(g))"
            switch w.kind {
            case .field:
                XCTAssertTrue(g.isField, "\(at): the key field", file: file, line: line)
                if !g.label.isEmpty { XCTAssertEqual(g.label, w.label, "\(at): the field's label", file: file, line: line) }
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
            XCTAssertLessThanOrEqual(got.filter { $0.label == c.label }.count, 1, "\(what): the field label's text once", file: file, line: line)
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
        let names = try HomeFixtures.names()
        XCTAssertFalse(names.isEmpty, "the coachHome fixtures")
        for name in names {
            for (roomName, room) in Self.rooms {
                let m = try HomeFixtures.model(name, in: room)
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
        let fc = try HomeFixtures.model("forward-compat", in: .heavyweight)
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

    /// `fieldTyped` says only whether the field holds text: true once typed into, false once emptied, false once the
    /// route leaves the connect screen (which empties it); a model that keeps the route (a refusal, a key out) keeps
    /// the text and says nothing.
    func testTheFieldReportsOnlyWhetherItHoldsText() throws {
        let connect = try Self.model(Self.connectJSON())
        let rec = Recorder()
        let tab = Hosted(Phone(model: connect, host: rec.host()), size: Self.screen)
        let tf = try XCTUnwrap(tab.field)
        XCTAssertEqual(rec.typed, [], "nothing typed, nothing said")
        Self.type("sk-", into: tf, tab)
        XCTAssertEqual(rec.typed, [true], "typed")
        Self.type("ant", into: tf, tab)
        XCTAssertEqual(rec.typed, [true], "said once while it holds text")
        Self.clear(tf, tab)
        XCTAssertEqual(rec.typed, [true, false], "emptied")
        Self.type("sk-ant-three", into: tf, tab)
        XCTAssertEqual(rec.typed, [true, false, true])
        // a newer model on the same route (the page refused the key, `invalid`): the text stays
        tab.host.rootView = Phone(model: try Self.model(Self.connectJSON(rev: 5)), host: rec.host())
        tab.settle()
        XCTAssertEqual(tab.field?.text, "sk-ant-three", "the text stays after a refusal")
        XCTAssertEqual(rec.typed, [true, false, true])
        // the key saved: the route leaves the connect screen and the field goes
        tab.host.rootView = Phone(model: try Self.model(Self.hubJSON()), host: rec.host())
        tab.settle()
        XCTAssertNil(tab.field, "no field on the hub")
        XCTAssertEqual(rec.typed, [true, false, true, false], "the route left the connect screen: the field holds nothing")
        // back to the connect screen (Disconnect): a new, empty field
        tab.host.rootView = Phone(model: connect, host: rec.host())
        tab.settle()
        XCTAssertEqual(try XCTUnwrap(tab.field).text ?? "", "", "a new field is empty")
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

    func testCONNECTDoesNotShrinkUnderReduceMotion() {
        XCTAssertEqual(HomeCTAPress.scale(pressed: true, reduceMotion: true), 1, "Reduce Motion: no scale")
        XCTAssertEqual(HomeCTAPress.scale(pressed: true, reduceMotion: false), 0.985, "pressed: .985, as .kt-cta:active")
        XCTAssertEqual(HomeCTAPress.scale(pressed: false, reduceMotion: false), 1)
        XCTAssertEqual(HomeCTAPress.opacity(pressed: true), 0.9, "pressed: opacity .9, Reduce Motion or not")
        XCTAssertEqual(HomeCTAPress.opacity(pressed: false), 1)
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
}
#endif
