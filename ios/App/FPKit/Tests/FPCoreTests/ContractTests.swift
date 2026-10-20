import Foundation
import XCTest
import FPCore

final class ContractTests: XCTestCase {
    private let shell60 = ShellContract(shell: "60", screens: ["coach"])
    private let shell61 = ShellContract(shell: "61")
    private let t0 = Date(timeIntervalSince1970: 1_791_500_000)

    func testBuild60SpeaksContractV1WithTheCoach() {
        XCTAssertEqual(shell60.v, 1)
        XCTAssertEqual(shell60.min, 1)
        XCTAssertEqual(shell60.screens, ["coach"])
    }

    /// Build 61's pieces (contract 1.1), and the four canonical flags of contract 2.1, byte for byte.
    func testBuild61FlagsAreTheContractsCanonicalOnes() {
        XCTAssertEqual(ShellContract.binaryScreens, ["coach", "coachHome", "tabs"])
        XCTAssertEqual(shell61.screens, ShellContract.binaryScreens)
        XCTAssertEqual(shell61.v, 1, "every 61 change is an addition within v1")
        let bar = TabsFlag(selected: "log", h: 83, safe: 34)
        XCTAssertEqual(ShellFlag(contract: shell61, screens: ["coach", "coachHome", "tabs"], tabs: bar).script,
                       #"window.__FP_SHELL = {"binary":["coach","coachHome","tabs"],"min":1,"screens":["coach","coachHome","tabs"],"shell":"61","tabs":{"bar":{"h":83,"safe":34},"selected":"log"},"v":1};"#)
        XCTAssertEqual(ShellFlag(contract: shell61, screens: ["tabs"], tabs: bar).script,
                       #"window.__FP_SHELL = {"binary":["coach","coachHome","tabs"],"min":1,"screens":["tabs"],"shell":"61","tabs":{"bar":{"h":83,"safe":34},"selected":"log"},"v":1};"#)
        XCTAssertEqual(ShellFlag(contract: shell61, screens: ["coach"]).script,
                       #"window.__FP_SHELL = {"binary":["coach","coachHome","tabs"],"min":1,"screens":["coach"],"shell":"61","v":1};"#)
        XCTAssertEqual(ShellFlag(contract: shell61, screens: []).script,
                       #"window.__FP_SHELL = {"binary":["coach","coachHome","tabs"],"min":1,"screens":[],"shell":"61","v":1};"#)
        // dev keys sit beside tabs, sorted
        XCTAssertEqual(ShellFlag(contract: shell61, screens: [], devNav: "coach/chat", tabs: TabsFlag(selected: "coach", h: 49, safe: 0)).script,
                       #"window.__FP_SHELL = {"binary":["coach","coachHome","tabs"],"dev":{"nav":"coach/chat"},"min":1,"screens":[],"shell":"61","tabs":{"bar":{"h":49,"safe":0},"selected":"coach"},"v":1};"#)
    }

    /// hello's `tabs` (contract 3.2): only when set, and the takeover keeps it.
    func testHelloRepliesWithAndWithoutTabs() {
        let tabs = TabsReply(selected: "progress", seq: 3, bar: BarMetrics(h: 83, safe: 34, rev: 2))
        let reply = HelloReply(v: 1, screens: ["coach", "coachHome", "tabs"], tabs: tabs)
        XCTAssertEqual(reply.json, ["v": 1, "screens": ["coach", "coachHome", "tabs"],
                                    "tabs": ["selected": "progress", "seq": 3, "bar": ["h": 83, "safe": 34, "rev": 2]]])
        XCTAssertEqual(reply.json.jsonText,
                       #"{"screens":["coach","coachHome","tabs"],"tabs":{"bar":{"h":83,"rev":2,"safe":34},"selected":"progress","seq":3},"v":1}"#)
        let taking = reply.takingOver(["coachHome", "coach"])
        XCTAssertEqual(taking.tabs, tabs, "the takeover keeps tabs")
        XCTAssertEqual(taking.up, ["coachHome", "coach"])
        XCTAssertEqual(HelloReply(v: 1, screens: ["coach"]).json, ["v": 1, "screens": ["coach"]], "no tabs key without tabs")
        XCTAssertNil(HelloReply(.linked(v: 1, screens: ["coach"])).tabs)
        XCTAssertEqual(BarMetrics(h: 49, safe: 0, rev: 0).json, ["h": 49, "safe": 0, "rev": 0])
    }

    /// The first tab (contract 2.4, 9): Coach for a share; else the dev route's head when it names a tab other than Log.
    func testFirstTab() {
        XCTAssertEqual(ShellTabs.ids, ["log", "progress", "coach", "settings"])
        XCTAssertTrue(ShellTabs.isTab("settings"))
        XCTAssertFalse(ShellTabs.isTab("runner"))
        XCTAssertFalse(ShellTabs.isTab("Log"))
        XCTAssertEqual(ShellTabs.firstTab(share: true, devNav: nil), "coach")
        XCTAssertEqual(ShellTabs.firstTab(share: true, devNav: "progress"), "coach", "a share wins")
        let cases: [(String?, String)] = [
            ("log/run", "log"), ("runner/rest", "log"), ("modal/build", "log"), ("overlay/how", "log"), ("demo/x", "log"),
            ("progress", "progress"), ("progress/day", "progress"), ("coach", "coach"), ("coach/chat", "coach"),
            ("settings/storage-sheet", "settings"), ("settingsx", "log"), ("nowhere/at/all", "log"), ("", "log"), ("/coach", "log"),
            (nil, "log"),
        ]
        for (nav, tab) in cases { XCTAssertEqual(ShellTabs.firstTab(share: false, devNav: nav), tab, nav ?? "nil") }
    }

    /// The fixed words of `fellBack.why` (contract 10.3, 10.5).
    func testFellBackWhyWords() {
        XCTAssertEqual(FellBackWhy.allCases.map(\.rawValue), ["page", "refused", "no-hello", "failures", "policy", "switch"])
        XCTAssertEqual(FellBackWhy(rawValue: "no-hello"), .noHello)
        XCTAssertNil(FellBackWhy(rawValue: "needs"))
    }

    func testShellFlagScript() throws {
        let flag = ShellFlag(contract: shell60, screens: ["coach"], devNav: "coach/chat", devTheme: "dark")
        XCTAssertEqual(flag.script, #"window.__FP_SHELL = {"binary":["coach"],"dev":{"nav":"coach/chat","theme":"dark"},"min":1,"screens":["coach"],"shell":"60","v":1};"#)
        // a test launch's stand-in for the Messages API (plan task C7)
        let api = ShellFlag(contract: shell60, screens: ["coach"], devNav: "coach/chat", devAPI: "http://127.0.0.1:47811")
        XCTAssertEqual(api.script, #"window.__FP_SHELL = {"binary":["coach"],"dev":{"api":"http://127.0.0.1:47811","nav":"coach/chat"},"min":1,"screens":["coach"],"shell":"60","v":1};"#)
        XCTAssertEqual(ShellFlag(contract: shell60, screens: []).script, #"window.__FP_SHELL = {"binary":["coach"],"min":1,"screens":[],"shell":"60","v":1};"#,
                       "no dev key without launch arguments; no screens when every one is off, and the binary's screens all the same")
        // a line separator in a dev argument cannot break the script
        let odd = ShellFlag(contract: shell60, screens: ["coach"], devNav: "a\u{2028}b").script
        XCTAssertFalse(odd.contains("\u{2028}"))
        let json = String(odd.dropFirst("window.__FP_SHELL = ".count).dropLast())
        XCTAssertEqual(try JSONText.parse(json)["dev"]?["nav"], "a\u{2028}b")
    }

    func testNegotiation() {
        func n(_ v: Int, _ screens: [String], available: [String] = ["coach"], shell: ShellContract? = nil) -> Negotiation {
            Negotiation.negotiate(HelloRequest(v: v, page: "20261012-1", screens: screens), shell: shell ?? shell60, available: available)
        }
        XCTAssertEqual(n(1, ["coach"]), .linked(v: 1, screens: ["coach"]))
        XCTAssertEqual(n(2, ["coach", "settings"]), .linked(v: 1, screens: ["coach"]), "a newer page speaks v1 to a v1 shell")
        XCTAssertEqual(n(0, ["coach"]), .refused(.noVersion))
        XCTAssertEqual(n(1, []), .linked(v: 1, screens: []))
        XCTAssertEqual(n(1, ["coach"], available: []), .linked(v: 1, screens: []), "every screen off: linked with none")
        XCTAssertEqual(n(1, ["settings"]), .linked(v: 1, screens: []), "a screen this binary lacks")
        let v2only = ShellContract(v: 2, min: 2, shell: "70", screens: ["coach", "settings"])
        XCTAssertEqual(n(1, ["coach"], shell: v2only), .refused(.pageTooOld))
        let v2 = ShellContract(v: 2, min: 1, shell: "62", screens: ["coach"])
        XCTAssertEqual(n(1, ["coach"], shell: v2), .linked(v: 1, screens: ["coach"]), "a newer shell still speaks v1 to an older page")
        XCTAssertEqual(n(3, ["coach"], shell: v2), .linked(v: 2, screens: ["coach"]))
        XCTAssertEqual(HelloReply(.linked(v: 1, screens: ["coach"])).json, ["v": 1, "screens": ["coach"]])
        XCTAssertEqual(HelloReply(.refused(.noVersion)).json, ["v": 0, "screens": [], "why": "no-version"])
    }

    /// A reload under a native screen: the answer names the screens the shell still shows that this document may have
    /// (the page takes them over); never one it may not, never on a refusal, and no key at all when there is none.
    func testHelloReplyNamesTheScreensStillUp() {
        let linked = HelloReply(.linked(v: 1, screens: ["coach"]))
        XCTAssertEqual(linked.takingOver(["coach"]).json, ["v": 1, "screens": ["coach"], "up": ["coach"]])
        XCTAssertEqual(linked.takingOver([]).json, ["v": 1, "screens": ["coach"]], "nothing up: the reply is v1's as before")
        XCTAssertEqual(HelloReply(.linked(v: 1, screens: [])).takingOver(["coach"]).json, ["v": 1, "screens": []],
                       "a screen this document may not have is not taken over (the shell takes it down)")
        XCTAssertEqual(HelloReply(.refused(.pageTooOld)).takingOver(["coach"]).up, [])
        XCTAssertEqual(HelloReply(v: 1, screens: ["coach"], up: ["coach"]).up, ["coach"])
    }

    func testHelloDecoding() {
        let h = HelloRequest(json: ["v": 1, "page": "20261012-1", "screens": ["coach", 3, "settings"], "boot": "b1"])
        XCTAssertEqual(h, HelloRequest(v: 1, page: "20261012-1", screens: ["coach", "settings"], boot: "b1"))
        XCTAssertEqual(HelloRequest(json: ["page": "x"]).v, 0)
        XCTAssertNil(HelloRequest(json: ["v": 1, "boot": ""]).boot)
    }

    /// Every TrovoShell method decodes, and the methods and their required arguments are intents.json's.
    func testPageMessagesMatchIntentsJSON() throws {
        let contract = try IntentTests.contractFile()
        let listed = try XCTUnwrap(contract["messages"]?.array)
        XCTAssertEqual(listed.compactMap { $0["name"]?.string }, PageMessage.methods)
        let calls = try XCTUnwrap(FixtureFiles.json("shell/page-messages.json")["calls"]?.array)
        var seen = Set<String>()
        for call in calls {
            let method = try XCTUnwrap(call["method"]?.string)
            let options = try XCTUnwrap(call["options"])
            XCTAssertNoThrow(try PageMessage(method: method, options: options), method)
            seen.insert(method)
            // the fixture call carries every argument intents.json requires, of its type
            let spec = try XCTUnwrap(listed.first { $0["name"]?.string == method }?["args"]?.object)
            for (arg, typeSpec) in spec {
                let type = typeSpec.string ?? ""
                guard let a = IntentSignature.Arg(name: arg, spec: type) else { XCTFail("\(method).\(arg): \(type)"); continue }
                guard let v = options[arg] else {
                    if !a.optional && !(method == "hello" && arg == "boot") { XCTFail("\(method) lacks \(arg)") }
                    continue
                }
                XCTAssertTrue(a.accepts(v), "\(method).\(arg) is not \(type)")
            }
        }
        XCTAssertEqual(seen, Set(PageMessage.methods), "a fixture call of every method")
        XCTAssertEqual(PageMessage.methods, ["hello", "bootDone", "present", "dismiss", "model", "toast", "confirm", "log", "status", "reset",
                                             "visibility", "selectTab", "sheets", "setSwitch"], "contract 3.1's list, in its order")
        XCTAssertThrowsError(try PageMessage(method: "coachFetch", options: [:])) {
            XCTAssertEqual($0 as? PageMessage.DecodeError, .unknownMethod("coachFetch"))
        }
        XCTAssertThrowsError(try PageMessage(method: "selectTab", options: ["intent": "chat"])) { XCTAssertEqual($0 as? PageMessage.DecodeError, .missing("tab")) }
        XCTAssertThrowsError(try PageMessage(method: "sheets", options: [:])) { XCTAssertEqual($0 as? PageMessage.DecodeError, .missing("open")) }
        XCTAssertThrowsError(try PageMessage(method: "sheets", options: ["open": "yes"])) { XCTAssertEqual($0 as? PageMessage.DecodeError, .missing("open")) }
        XCTAssertThrowsError(try PageMessage(method: "setSwitch", options: ["on": false])) { XCTAssertEqual($0 as? PageMessage.DecodeError, .missing("screen")) }
        XCTAssertThrowsError(try PageMessage(method: "setSwitch", options: ["screen": "tabs"])) { XCTAssertEqual($0 as? PageMessage.DecodeError, .missing("on")) }
        XCTAssertThrowsError(try PageMessage(method: "present", options: [:])) { XCTAssertEqual($0 as? PageMessage.DecodeError, .missing("screen")) }
        XCTAssertThrowsError(try PageMessage(method: "model", options: ["screen": "coach", "json": "{}"])) { XCTAssertEqual($0 as? PageMessage.DecodeError, .missing("rev")) }
        XCTAssertThrowsError(try PageMessage(method: "hello", options: ["page": "x"])) { XCTAssertEqual($0 as? PageMessage.DecodeError, .missing("v")) }
        XCTAssertThrowsError(try PageMessage(method: "reset", options: [:])) { XCTAssertEqual($0 as? PageMessage.DecodeError, .missing("screen")) }
        XCTAssertThrowsError(try PageMessage(method: "visibility", options: ["at": 1])) { XCTAssertEqual($0 as? PageMessage.DecodeError, .missing("state")) }
    }

    func testPageMessagesCarryWhatTheShellNeeds() throws {
        let calls = try XCTUnwrap(FixtureFiles.json("shell/page-messages.json")["calls"]?.array)
        let messages = try calls.map { try PageMessage(method: $0["method"]!.string!, options: $0["options"]!) }
        XCTAssertEqual(messages[0], .hello(HelloRequest(v: 1, page: "20261012-1", screens: ["coach"], boot: "b1760000000000-4f2a")))
        XCTAssertEqual(messages[2], .bootDone(page: "20261012-1"))
        XCTAssertEqual(messages[3], .present(screen: "coach"))
        guard case .model(let push) = messages[5] else { return XCTFail("model") }
        let model = try CoachModel.decode(push.json)
        XCTAssertEqual(model.rev, push.rev)
        XCTAssertEqual(model.boot, "b1760000000000-4f2a")
        guard case .toast(let ok) = messages[6], case .toast(let pr) = messages[7], case .toast(let err) = messages[8], case .toast(let undo) = messages[9] else { return XCTFail("toasts") }
        XCTAssertEqual([ok.duration, pr.duration, err.duration, undo.duration], [2.2, 3.5, 3.5, 6], "showToast's and showUndoToast's timings")
        XCTAssertEqual([ok.style, pr.style, err.style], [.ok, .pr, .err])
        XCTAssertEqual(undo.undo, "t-17")
        XCTAssertTrue(err.assertive)
        XCTAssertFalse(ok.assertive)
        guard case .confirm(let restore) = messages[10], case .confirm(let stop) = messages[11] else { return XCTFail("confirms") }
        XCTAssertEqual(restore.title, "Restore previous programme?")
        XCTAssertEqual(restore.confirm, "Restore")
        XCTAssertEqual(restore.tone, .danger)
        XCTAssertEqual(stop.tone, .accent)
        XCTAssertEqual(restore.answer(true), .confirm(id: "c-3", yes: true))
        XCTAssertEqual(messages[12], .log(LogLine(text: "fp: hello v1 coach", level: "info")))
        // Settings > About: the status, "Try the native chat again", and the page hidden under a native screen
        XCTAssertEqual(messages[13], .status(refresh: false), "build 60's plain status")
        XCTAssertEqual(messages[14], .reset(screen: "coach"))
        XCTAssertEqual(messages[15], .visibility(VisibilityReport(state: "hidden", at: Date(timeIntervalSince1970: 1_760_000_000.5))))
        XCTAssertEqual(messages[16], .visibility(VisibilityReport(state: "visible")), "no time: the shell's own")
        // build 61's (contract 3.3-3.5, 3.10)
        XCTAssertEqual(messages[17], .status(refresh: true))
        XCTAssertEqual(messages[18], .selectTab(tab: "coach", intent: "chat"))
        XCTAssertEqual(messages[19], .sheets(open: true))
        XCTAssertEqual(messages[20], .setSwitch(screen: "tabs", on: false))
        XCTAssertEqual(try PageMessage(method: "selectTab", options: ["tab": "log"]), .selectTab(tab: "log", intent: nil))
        XCTAssertEqual(try PageMessage(method: "selectTab", options: ["tab": "log", "intent": ""]), .selectTab(tab: "log", intent: nil))
        XCTAssertEqual(try PageMessage(method: "status", options: ["refresh": "yes", "other": 1]), .status(refresh: false), "an unreadable option is ignored")
        XCTAssertTrue(VisibilityReport(state: "hidden").hidden)
        XCTAssertFalse(VisibilityReport(state: "visible").hidden)
        // defaults the page may leave out
        let bare = ConfirmRequest(id: "c", title: "Sure?", body: "", confirm: nil, cancel: "", tone: nil)
        XCTAssertEqual([bare.confirm, bare.cancel], ["Confirm", "Cancel"])
        XCTAssertNil(bare.body)
        XCTAssertEqual(bare.tone, .danger, "the page's confirm is red unless it says otherwise")
        XCTAssertEqual(ToastRequest(text: "x", style: "sparkle", undo: "").style, .other("sparkle"))
        XCTAssertNil(ToastRequest(text: "x", style: nil, undo: "").undo)
    }

    /// The flag's screens: this binary's, less the device switch, the policy file, a stale crash
    /// marker and the native breaker for the page build being served.
    func testScreenGate() {
        var book = BreakerBook()
        func gate(deviceOff: Set<String> = [], policy: Policy = .defaults, page: String? = "P1") -> ([String], ScreenGate.Off?) {
            let r = ScreenGate.evaluate(binary: ["coach"], deviceOff: deviceOff, policy: policy, book: book, shellBuild: "60", pageBuild: page, os: 27)
            return (r.on, r.off["coach"])
        }
        XCTAssertEqual(gate().0, ["coach"])
        XCTAssertEqual(gate(deviceOff: ["coach"]).1, .deviceSwitch)
        XCTAssertEqual(gate(policy: Policy(screens: ["coach": .off])).1, .policy)
        let pair = book.recordStaleMarkers([CrashMarker(piece: .screen("coach"), pageBuild: "P1", shellBuild: "60")], at: t0)[0]
        XCTAssertEqual(gate().1, .crashMarker(pair))
        XCTAssertEqual(gate(page: "P2").0, ["coach"], "a new page build starts clean")
        book.clearDisabled(piece: "coach")
        let trip = book.trip(screen: "coach", pageBuild: "P1", reason: .noHello, detail: "no hello", at: t0)!
        XCTAssertEqual(gate().1, .breaker(trip))
        XCTAssertEqual(gate(page: "P2").0, ["coach"])
        XCTAssertEqual(gate(deviceOff: ["coach"]).1, .deviceSwitch, "the owner's switch is named first")
    }

    /// Build 61's gate (contract 2.2): the OS (for `tabs` alone), the device switch, the policy file, a crash verdict for
    /// the (shell, page) pair, the breaker for the page build, a decline by the page build, then the dependencies; each
    /// piece names the first own reason that applies, and `needs` only once its own checks pass.
    func testBuild61sGateInItsOrder() throws {
        let all = ShellContract.binaryScreens
        var book = BreakerBook()
        func gate(_ os: Int = 27, deviceOff: Set<String> = [], policy: Policy = .defaults, page: String? = "P1",
                  tabsRoot: Bool = true) -> (on: [String], off: [String: ScreenGate.Off]) {
            ScreenGate.evaluate(binary: all, deviceOff: deviceOff, policy: policy, book: book, shellBuild: "61", pageBuild: page,
                                tabsRoot: tabsRoot, os: os)
        }
        XCTAssertEqual(gate().on, all)
        XCTAssertEqual(gate().off, [:])
        // every own reason at once for tabs: each step in turn names the first that applies
        let pair = try XCTUnwrap(book.recordStaleMarkers([CrashMarker(piece: .tabs, pageBuild: "P1", shellBuild: "61")], at: t0).first)
        let trip = try XCTUnwrap(book.trip(screen: "tabs", pageBuild: "P1", reason: .failures, detail: "3 in a row", at: t0))
        XCTAssertTrue(book.decline(piece: "tabs", page: "P1"))
        let off = Policy(screens: ["tabs": .off])
        XCTAssertEqual(gate(18, deviceOff: ["tabs"], policy: off).off["tabs"], .os)
        XCTAssertEqual(gate(27, deviceOff: ["tabs"], policy: off).off["tabs"], .deviceSwitch)
        XCTAssertEqual(gate(27, policy: off).off["tabs"], .policy)
        XCTAssertEqual(gate().off["tabs"], .crashMarker(pair))
        book.clearDisabled(piece: "tabs")
        XCTAssertEqual(gate().off["tabs"], .breaker(trip))
        book.screens["tabs"] = nil
        XCTAssertEqual(gate().off["tabs"], .declined(page: "P1"))
        XCTAssertNil(gate(page: "P2").off["tabs"], "a decline for another page build leaves the piece on")
        XCTAssertEqual(gate(page: "P2").on, all)
        XCTAssertNil(gate(page: nil).off["tabs"], "no page build known: no decline read")
        // the pieces that need tabs, under the root still live: needs, never an own reason of theirs
        XCTAssertEqual(gate().off["coachHome"], .needs(["tabs"]))
        XCTAssertEqual(gate().off["coach"], .needs(["coachHome"]))
        XCTAssertEqual(gate().on, [])
        XCTAssertTrue(book.turnBackOn(screen: "tabs"))
        XCTAssertEqual(gate().on, all, "Try again clears the decline")
        // the OS: 17 and 18 turn tabs off os and leave coach on (the classic rule); 26 and 27 leave it to the other steps
        for os in [17, 18] {
            for root in [false, true] {
                let g = gate(os, tabsRoot: root)
                XCTAssertEqual(g.on, ["coach"], "iOS \(os): no tab root below 26, whatever the host says")
                XCTAssertEqual(g.off, ["tabs": .os, "coachHome": .needs(["tabs"])], "iOS \(os)")
            }
            XCTAssertEqual(gate(os, deviceOff: ["coach"]).off["coach"], .deviceSwitch)
            XCTAssertEqual(ScreenGate.base(binary: all, deviceOff: [], policy: .defaults, book: book, shellBuild: "61", pageBuild: "P1", os: os).on,
                           ["coach", "coachHome"], "the root decision reads tabs in base: the classic root")
        }
        for os in [26, 27] {
            XCTAssertEqual(gate(os).on, all, "iOS \(os)")
            XCTAssertEqual(gate(os, tabsRoot: false).off, ["tabs": .needs(["root"]), "coachHome": .needs(["tabs"])], "iOS \(os), a classic root")
            XCTAssertEqual(ScreenGate.base(binary: all, deviceOff: [], policy: .defaults, book: book, shellBuild: "61", pageBuild: "P1", os: os).on, all)
        }
        XCTAssertEqual(ScreenGate.tabsMinOS, 26)
        // needs only when the piece's own checks pass: coach off by the policy takes the Coach tab with it (joint)
        let coachOff = gate(policy: Policy(screens: ["coach": .off]))
        XCTAssertEqual(coachOff.off, ["coach": .policy, "coachHome": .needs(["coach"])])
        XCTAssertEqual(coachOff.on, ["tabs"])
        let homeOff = gate(deviceOff: ["coachHome"])
        XCTAssertEqual(homeOff.off, ["coachHome": .deviceSwitch, "coach": .needs(["coachHome"])])
        XCTAssertEqual(homeOff.on, ["tabs"])
        // the classic root: coach as 60, the bar and the Coach tab say what they need
        XCTAssertEqual(gate(tabsRoot: false).on, ["coach"])
        // the classic root (tabsRoot's default) is build 60's semantics for a 60 binary, on every OS (the floor is tabs')
        for os in [17, 18, 26, 27] {
            XCTAssertEqual(ScreenGate.evaluate(binary: ["coach"], deviceOff: [], policy: .defaults, book: book, shellBuild: "60", pageBuild: "P1", os: os).on, ["coach"])
        }
    }

    func testStoreGate() {
        var book = BreakerBook()
        func gate(deviceOff: Bool = false, policy: Policy = .defaults) -> StoreGate.Off? {
            StoreGate.evaluate(deviceOff: deviceOff, policy: policy, book: book, shellBuild: "60", pageBuild: "P1")
        }
        XCTAssertNil(gate())
        XCTAssertEqual(gate(deviceOff: true), .deviceSwitch)
        XCTAssertEqual(gate(policy: Policy(facade: .off)), .policy)
        XCTAssertNil(gate(policy: Policy(repair: .on)), "repair is not the facade")
        let pair = book.recordStaleMarkers([CrashMarker(piece: .store, pageBuild: "P1", shellBuild: "60")], at: t0)[0]
        XCTAssertEqual(gate(), .crashMarker(pair))
        book.clearDisabled(piece: "store")
        book.store.documentStart(pageBuild: "P1", at: t0)
        XCTAssertNil(gate(), "armed is not yet tripped")
        XCTAssertFalse(book.store.launch(at: t0 + 60))
        XCTAssertEqual(gate(), .unfinishedBoot)
    }
}
