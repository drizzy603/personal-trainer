import Foundation

// The pieces that depend on each other (contract 2.2, 3.2, 10.1, 10.3, I12): which of build 61's three native pieces may
// be on, given the pieces whose own checks pass and the scene's root, and what a hello does under a live tab root.
//
// - `tabs` (the native tab bar root) is on iff its own checks pass and the scene's root is a live tab root. Its checks
//   passing under a classic root (one built before the gate changed, by a SuperoViewController made without
//   SceneDelegate's launch values, or one that fell back) reports `needs: ["root"]`.
// - `coachHome` (the native Coach tab) is on iff its own checks pass, `tabs` is on and `coach`'s own checks pass.
// - `coach` (the native chat) under a live tab root is on iff its own checks pass and `coachHome` is on (joint: there
//   the chat's only host is the Coach tab's stack); under a classic root iff its own checks pass (build 60's overlay).
// - A piece off for its own reason never reports `needs`. A name the rule does not know (a later build's screen) passes
//   through untouched.
// - A hello under a live tab root whose answer leaves `tabs` out falls the scene back first and is then negotiated on
//   the classic rule, so `coach` alone may come back (60's overlay at once): the page left `tabs` out (`page`, and its
//   page build declines `tabs`), a version refusal (`refused`, a decline too), or `tabs` no longer passing its own
//   checks since the root was built (`policy`: the policy file turned it off before this hello; no decline). A hello
//   that names `tabs` but leaves `coachHome` out while it was on offer declines `coachHome`.
//
// One rule serves the gate at scene connect, every hello (before and after negotiation), every cascade inside a
// document and the status Settings > About shows, so it cannot drift between them. Tests/FPCoreTests/Fixtures/shell/
// negotiation.json holds it as a table, which PiecesTests and LinkStateTests read and the page's mock is held to.

public enum ShellPieces {
    /// Every piece this rule knows, in the binary's order (contract 1.1).
    public static let all = ["coach", "coachHome", "tabs"]

    /// What `needs` names for `tabs` whose own checks pass under a root that is not a live tab root.
    public static let root = "root"

    /// `base`: the pieces whose own checks pass (or those a hello negotiated, or those still live in a document);
    /// `tabsRoot`: the scene's root is a live tab root. Returns the pieces on and, for each piece of `base` that is off
    /// only because of another, what it needs (pieces in the rule's order, or `"root"`).
    public static func resolve(base: Set<String>, tabsRoot: Bool) -> (on: Set<String>, needs: [String: [String]]) {
        var on = base.subtracting(all)
        var needs: [String: [String]] = [:]
        // tabs: a live tab root
        if base.contains("tabs") {
            if tabsRoot { on.insert("tabs") } else { needs["tabs"] = [root] }
        }
        // coachHome: tabs on, and coach's own checks passed
        if base.contains("coachHome") {
            var missing: [String] = []
            if !on.contains("tabs") { missing.append("tabs") }
            if !base.contains("coach") { missing.append("coach") }
            if missing.isEmpty { on.insert("coachHome") } else { needs["coachHome"] = missing }
        }
        // coach: joint with coachHome under a live tab root, alone otherwise
        if base.contains("coach") {
            if !tabsRoot || on.contains("coachHome") { on.insert("coach") } else { needs["coach"] = ["coachHome"] }
        }
        return (on, needs)
    }

    /// `resolve` on an ordered list: the pieces on in the list's order (each once).
    public static func resolve(_ base: [String], tabsRoot: Bool) -> (on: [String], needs: [String: [String]]) {
        let r = resolve(base: Set(base), tabsRoot: tabsRoot)
        var seen: Set<String> = []
        return (base.filter { r.on.contains($0) && seen.insert($0).inserted }, r.needs)
    }

    /// What a hello comes to (contract 3.2, 10.3).
    public struct HelloOutcome: Equatable, Sendable {
        /// The version and the screens the reply carries (after a fallback: negotiated on the classic rule).
        public var negotiation: Negotiation
        /// The pieces the hello's page build declines (contract 10.1), in the rule's order.
        public var declined: [String]
        /// The live tab root falls back at this hello, and why; nil when it does not (or there was none).
        public var fellBack: FellBackWhy?

        public init(negotiation: Negotiation, declined: [String] = [], fellBack: FellBackWhy? = nil) {
            self.negotiation = negotiation
            self.declined = declined
            self.fellBack = fellBack
        }

        /// The screens the reply carries.
        public var screens: [String] {
            if case .linked(_, let s) = negotiation { return s }
            return []
        }
    }

    /// A hello negotiated with the dependency rule (contract 3.2): `available` are the pieces whose own checks pass for
    /// the hello's page build (`ScreenGate.base`), less those off in this document; `tabsRoot` says the scene's root is
    /// a live tab root. The rule applies to `available` before `Negotiation.negotiate` and once more to what it gives (a
    /// page that names `coach` and `tabs` but not `coachHome` gets `tabs` alone).
    public static func hello(_ h: HelloRequest, shell: ShellContract, available: [String], tabsRoot: Bool) -> HelloOutcome {
        let live = tabsRoot && shell.screens.contains("tabs")
        func negotiate(live: Bool) -> Negotiation {
            let n = Negotiation.negotiate(h, shell: shell, available: resolve(available, tabsRoot: live).on)
            guard case .linked(let v, let screens) = n else { return n }
            return .linked(v: v, screens: resolve(screens, tabsRoot: live).on)
        }
        let n = negotiate(live: live)
        guard live else { return HelloOutcome(negotiation: n) }
        guard case .linked(_, let screens) = n else {
            // a version refusal: the page build declines tabs, and the scene falls back
            return HelloOutcome(negotiation: n, declined: ["tabs"], fellBack: .refused)
        }
        let offered = resolve(available, tabsRoot: true).on
        if screens.contains("tabs") {
            let declined = offered.contains("coachHome") && !h.screens.contains("coachHome") ? ["coachHome"] : []
            return HelloOutcome(negotiation: n, declined: declined)
        }
        // tabs left out of the answer: the page left it out of its hello (it was on offer), or its own checks no longer
        // pass (the policy turned it off since the root was built). The scene falls back, then this same hello is
        // negotiated on the classic rule.
        let why: FellBackWhy = offered.contains("tabs") ? .page : .policy
        return HelloOutcome(negotiation: negotiate(live: false), declined: why == .page ? ["tabs"] : [], fellBack: why)
    }
}
