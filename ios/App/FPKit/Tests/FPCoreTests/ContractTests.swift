import Foundation
import XCTest
import FPCore

final class ContractTests: XCTestCase {
    private let shell60 = ShellContract(shell: "60")
    private let t0 = Date(timeIntervalSince1970: 1_791_500_000)

    func testBuild60SpeaksContractV1WithTheCoach() {
        XCTAssertEqual(shell60.v, 1)
        XCTAssertEqual(shell60.min, 1)
        XCTAssertEqual(shell60.screens, ["coach"])
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
        XCTAssertThrowsError(try PageMessage(method: "selectTab", options: ["tab": "log"])) {
            XCTAssertEqual($0 as? PageMessage.DecodeError, .unknownMethod("selectTab"))
        }
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
        XCTAssertEqual(messages[13], .status)
        XCTAssertEqual(messages[14], .reset(screen: "coach"))
        XCTAssertEqual(messages[15], .visibility(VisibilityReport(state: "hidden", at: Date(timeIntervalSince1970: 1_760_000_000.5))))
        XCTAssertEqual(messages[16], .visibility(VisibilityReport(state: "visible")), "no time: the shell's own")
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
            let r = ScreenGate.evaluate(binary: ["coach"], deviceOff: deviceOff, policy: policy, book: book, shellBuild: "60", pageBuild: page)
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
