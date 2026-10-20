import Foundation
import XCTest
import FPCore

/// Fixtures/shell/negotiation.json (contract D42), read by PiecesTests and LinkStateTests: the rows and the few readers
/// both need. The page's mock is held to the same file (P13).
enum NegotiationTable {
    static let pieces = ShellPieces.all
    static let page = "P1"

    static func rows(_ section: String) throws -> [JSONValue] {
        let table = try FixtureFiles.json("shell/negotiation.json")
        return try XCTUnwrap(table[section]?.array, "negotiation.json has no \(section) rows")
    }

    static func strings(_ v: JSONValue?) -> [String] { (v?.array ?? []).compactMap(\.string) }

    static func needs(_ v: JSONValue?) -> [String: [String]] {
        (v?.object ?? [:]).mapValues { strings($0) }
    }

    /// The pieces off `needs` in a gate's answer, with what they need.
    static func needs(of off: [String: ScreenGate.Off]) -> [String: [String]] {
        off.compactMapValues { if case .needs(let n) = $0 { return n } else { return nil } }
    }

    /// A row's `want.off`: each screens.off the page hears, as (screen, reason code, needs).
    static func offs(_ v: JSONValue?) -> [Off] {
        (v?.array ?? []).map { Off(screen: $0["screen"]?.string ?? "?", why: $0["why"]?.string ?? "?", needs: strings($0["needs"])) }
    }

    struct Off: Equatable, CustomStringConvertible {
        var screen: String
        var why: String
        var needs: [String]

        init(screen: String, why: String, needs: [String] = []) {
            self.screen = screen
            self.why = why
            self.needs = needs
        }

        var description: String { needs.isEmpty ? "\(screen) \(why)" : "\(screen) \(why) \(needs)" }
    }
}

/// The pieces that depend on each other (contract 2.2, 3.2, 10.3, I12, ShellPieces), as a rule and as the shared table.
final class PiecesTests: XCTestCase {
    private let all = ShellPieces.all
    private let shell61 = ShellContract(shell: "61")

    // MARK: The rule

    /// Every subset of the three pieces with a live tab root and without (16 rows), from the table: the pieces on and
    /// the `needs` of each piece off only because of another, `["root"]` included.
    func testEverySubsetWithAndWithoutATabRoot() throws {
        let rows = try NegotiationTable.rows("resolve")
        var seen = Set<String>()
        for row in rows {
            let base = NegotiationTable.strings(row["base"])
            let tabsRoot = try XCTUnwrap(row["tabsRoot"]?.bool)
            let tag = "\(base) tabsRoot \(tabsRoot)"
            XCTAssertEqual(base, all.filter(base.contains), "\(tag): the table lists pieces in the binary's order")
            let r = ShellPieces.resolve(base, tabsRoot: tabsRoot)
            XCTAssertEqual(r.on, NegotiationTable.strings(row["on"]), tag)
            XCTAssertEqual(r.needs, NegotiationTable.needs(row["needs"]), tag)
            // the set form agrees, and a piece off for its own reason never reports needs
            let s = ShellPieces.resolve(base: Set(base), tabsRoot: tabsRoot)
            XCTAssertEqual(s.on, Set(r.on), tag)
            XCTAssertEqual(s.needs, r.needs, tag)
            XCTAssertTrue(Set(r.needs.keys).isSubset(of: Set(base).subtracting(r.on)), tag)
            XCTAssertTrue(seen.insert(tag).inserted, "\(tag) twice")
        }
        // every subset, under both roots, exactly once
        var subsets: [[String]] = [[]]
        for p in all { subsets += subsets.map { $0 + [p] } }
        XCTAssertEqual(seen, Set(subsets.flatMap { s in [true, false].map { "\(s) tabsRoot \($0)" } }))
        XCTAssertEqual(rows.count, 16)
    }

    /// The contract's own sentences, written out beside the table (a second oracle for it).
    func testTheRuleAsTheContractWritesIt() {
        // 2.2: tabs on iff its checks pass and the root is a live tab root; under any other root it needs the root
        XCTAssertEqual(ShellPieces.resolve(["tabs"], tabsRoot: true).on, ["tabs"])
        XCTAssertEqual(ShellPieces.resolve(["tabs"], tabsRoot: false).needs, ["tabs": ["root"]])
        XCTAssertEqual(ShellPieces.root, "root")
        // coachHome iff its checks pass, tabs on and coach's checks pass; it needs whichever is missing
        XCTAssertEqual(ShellPieces.resolve(all, tabsRoot: true).on, all)
        XCTAssertEqual(ShellPieces.resolve(["coachHome", "tabs"], tabsRoot: true).needs, ["coachHome": ["coach"]])
        XCTAssertEqual(ShellPieces.resolve(["coach", "coachHome"], tabsRoot: true).needs["coachHome"], ["tabs"])
        XCTAssertEqual(ShellPieces.resolve(["coachHome"], tabsRoot: false).needs, ["coachHome": ["tabs", "coach"]])
        // coach under a live tab root is joint with coachHome; under a classic root it is 60's overlay, alone
        XCTAssertEqual(ShellPieces.resolve(["coach", "tabs"], tabsRoot: true).on, ["tabs"])
        XCTAssertEqual(ShellPieces.resolve(["coach", "tabs"], tabsRoot: true).needs, ["coach": ["coachHome"]])
        XCTAssertEqual(ShellPieces.resolve(all, tabsRoot: false).on, ["coach"])
        XCTAssertEqual(ShellPieces.resolve(all, tabsRoot: false).needs, ["tabs": ["root"], "coachHome": ["tabs"]])
        // a piece off for its own reason never reports needs
        XCTAssertEqual(ShellPieces.resolve(["coach"], tabsRoot: false).needs, [:])
        XCTAssertNil(ShellPieces.resolve(["coach", "coachHome"], tabsRoot: true).needs["tabs"])
        // a name the rule does not know passes through; the list's order is kept, each piece once
        XCTAssertEqual(ShellPieces.resolve(["settings", "coach", "coachHome", "tabs"], tabsRoot: true).on, ["settings", "coach", "coachHome", "tabs"])
        XCTAssertEqual(ShellPieces.resolve(["settings", "coach"], tabsRoot: true).on, ["settings"])
        XCTAssertEqual(ShellPieces.resolve(["tabs", "coach", "coachHome", "coach"], tabsRoot: true).on, ["tabs", "coach", "coachHome"])
        XCTAssertEqual(ShellPieces.all, ShellContract.binaryScreens, "the rule knows exactly build 61's pieces")
    }

    // MARK: The hello

    /// Every hello row of the table: the gate's own checks for P1 (the OS step from `os`), the hello through
    /// ShellPieces.hello, then the gate again after the hello's declines and on the root after it (About's `needs`).
    func testEveryHelloRow() throws {
        let rows = try NegotiationTable.rows("hello")
        XCTAssertGreaterThanOrEqual(rows.count, 20)
        for row in rows {
            let tag = row["case"]?.string ?? "?"
            let base = NegotiationTable.strings(row["base"])
            let os = try XCTUnwrap(row["os"]?.int, tag)
            let root = try XCTUnwrap(row["root"]?.string, tag)
            XCTAssertTrue(["tabs", "classic", "fellBack"].contains(root), tag)
            XCTAssertFalse(root == "tabs" && os < ScreenGate.tabsMinOS, "\(tag): no tab root below iOS \(ScreenGate.tabsMinOS)")
            let want = try XCTUnwrap(row["want"], tag)
            let hello = HelloRequest(v: try XCTUnwrap(row["hello"]?["v"]?.int, tag), page: NegotiationTable.page,
                                     screens: NegotiationTable.strings(row["hello"]?["screens"]))
            // the pieces outside `base` fail their own checks (the device switch stands for any own reason here)
            let deviceOff = Set(all).subtracting(base)
            let gate = ScreenGate.base(binary: all, deviceOff: deviceOff, policy: .defaults, book: BreakerBook(), shellBuild: "61",
                                       pageBuild: NegotiationTable.page, os: os)
            if os < ScreenGate.tabsMinOS { XCTAssertEqual(gate.off["tabs"], .os, tag) }
            let live = root == "tabs"
            let o = ShellPieces.hello(hello, shell: shell61, available: gate.on, tabsRoot: live)
            let reply = HelloReply(o.negotiation)
            XCTAssertEqual(reply.v, want["v"]?.int, "\(tag): v")
            XCTAssertEqual(reply.why, want["why"]?.string, "\(tag): why")
            XCTAssertEqual(o.screens, NegotiationTable.strings(want["screens"]), "\(tag): screens")
            XCTAssertEqual(reply.screens, o.screens, tag)
            XCTAssertEqual(o.screens.contains("tabs"), want["tabs"]?.bool, "\(tag): tabs in the reply")
            XCTAssertEqual(o.declined, NegotiationTable.strings(want["declined"]), "\(tag): declined")
            XCTAssertEqual(o.fellBack?.rawValue, want["fellBack"]?.string, "\(tag): fellBack")
            // the gate after the hello: its declines recorded, the classic rule once fallen back
            var book = BreakerBook()
            for p in o.declined { book.decline(piece: p, page: NegotiationTable.page) }
            let after = ScreenGate.evaluate(binary: all, deviceOff: deviceOff, policy: .defaults, book: book, shellBuild: "61",
                                            pageBuild: NegotiationTable.page, tabsRoot: live && o.fellBack == nil, os: os)
            XCTAssertEqual(NegotiationTable.needs(of: after.off), NegotiationTable.needs(want["needs"]), "\(tag): needs")
            for p in o.declined { XCTAssertEqual(after.off[p], .declined(page: NegotiationTable.page), "\(tag): \(p) off page") }
            // I12: under a live tab root coach and coachHome are both negotiated or both not; never a fallback without one
            if live && o.fellBack == nil { XCTAssertEqual(o.screens.contains("coach"), o.screens.contains("coachHome"), "\(tag): joint") }
            if !live { XCTAssertNil(o.fellBack, "\(tag): only a live tab root falls back"); XCTAssertEqual(o.declined, [], tag) }
        }
    }

    /// A hello on a binary without `tabs` (build 60's shape) never reads a tab root, whatever the host says.
    func testABinaryWithoutTabsHasNoTabRoot() {
        let shell60 = ShellContract(shell: "60", screens: ["coach"])
        let o = ShellPieces.hello(HelloRequest(v: 1, page: "P1", screens: ["coach"]), shell: shell60, available: ["coach"], tabsRoot: true)
        XCTAssertEqual(o, ShellPieces.HelloOutcome(negotiation: .linked(v: 1, screens: ["coach"])))
        let gate = ScreenGate.evaluate(binary: ["coach"], deviceOff: [], policy: .defaults, book: BreakerBook(), shellBuild: "60",
                                       pageBuild: "P1", tabsRoot: true)
        XCTAssertEqual(gate.on, ["coach"])
        XCTAssertEqual(gate.off, [:])
    }
}
