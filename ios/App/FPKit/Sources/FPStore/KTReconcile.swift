import Foundation

/// Why the store took WebKit's value for a key at a document start. Recorded on the journal row (`adopt:<reason>`)
/// and, when the store gave a value up, on its conflicts row.
public enum KTReason: String, Codable, Sendable {
    /// The first copy into an empty store. Nothing was given up.
    case migrate
    /// Rule 4: the witness is unknown, so an older or facade-less build wrote WebKit.
    case olderBuild = "older build"
    /// Rule 5: the facade's gap note names the key; the store missed that write. Its stale value is not kept.
    case gap
    /// Rule 6: WebKit lost the store's newest writes (a hard kill right after a burst).
    case lag
    /// Rule 7: none of the above explains it.
    case unexplained
    /// The follow-up of rule 3: WebKit was wiped and the page booted fresh without the facade.
    case wiped
    /// The owner's Put back, written into WebKit at a document start.
    case putback

    /// Whether the value the store gives up goes to `conflicts` (for Put back and diagnostics).
    public var keepsGivenUp: Bool { self != .migrate && self != .gap }
}

/// One key the store follows WebKit on: the hash WebKit holds ("-" = absent, so the store writes a tombstone).
public struct KTChange: Equatable, Sendable {
    public var target: String
    public var reason: KTReason

    public init(target: String, reason: KTReason) {
        self.target = target
        self.reason = reason
    }
}

/// What the reconcile sees at a document start. Plain values, so the seven rules are testable on their own.
public struct KTReconcileInput: Sendable {
    /// WebKit's hash per key, from hello (every key WebKit holds).
    public var manifest: [KTKey: String]
    /// The facade's gap note, if WebKit holds one the store could read.
    public var gap: KTProtocol.GapNote?
    /// The store's hash per key ("-" for a tombstone), rows whose encoding this build reads.
    public var store: [KTKey: String]
    /// Every kv row, unknown encodings and tombstones included: 0 means a new store (migration).
    public var storeRows: Int
    /// Rows whose `enc` this build does not know: never adopted, repaired, counted or deleted.
    public var unknownEnc: Set<KTKey>
    /// `meta.wkExcluded`: keys deliberately absent from WebKit, never adopted, repaired or counted.
    public var wkExcluded: Set<KTKey>
    /// Every hash the witness (`kt_last_open`) has held in the store: kv now, and each retained journal row's
    /// `h` and `hprev`.
    public var witnessHistory: Set<String>
    /// The retained journal above the prune horizon, oldest first (needed only when something differs).
    public var journal: [KTJournalRow]
    /// Put back entries handed to the facade (`pb`) and not yet confirmed: the staged hash and the store hash
    /// they were resolved against.
    public var putBack: [KTKey: (h: String, hbase: String)]
    /// The kept values' hashes of a wipe whose follow-up has not run yet (rule 3's snapshot).
    public var wipe: [KTKey: String]?

    public init(manifest: [KTKey: String], gap: KTProtocol.GapNote? = nil, store: [KTKey: String],
                storeRows: Int? = nil, unknownEnc: Set<KTKey> = [], wkExcluded: Set<KTKey> = [],
                witnessHistory: Set<String> = [], journal: [KTJournalRow] = [],
                putBack: [KTKey: (h: String, hbase: String)] = [:], wipe: [KTKey: String]? = nil) {
        self.manifest = manifest
        self.gap = gap
        self.store = store
        self.storeRows = storeRows ?? store.count + unknownEnc.count
        self.unknownEnc = unknownEnc
        self.wkExcluded = wkExcluded
        self.witnessHistory = witnessHistory
        self.journal = journal
        self.putBack = putBack
        self.wipe = wipe
    }
}

/// The verdict for one document start.
public struct KTReconcilePlan: Equatable, Sendable {
    /// 0 = in step (nothing differs beyond the gap note and confirmed Put back), else the rule (3...7) that
    /// decided. Rules 1 and 2 (store unreadable or refused, WebKit unreadable) never reach the classifier.
    public var rule: Int
    public var label: String
    /// false only for rule 3: the facade stays off for this document, so the store keeps its set exactly.
    public var attach: Bool
    /// Every key the store follows WebKit on. Build 60 follows WebKit for every key here (observe mode).
    public var changes: [KTKey: KTChange]
    /// Rule 6: the keys whose newer values WebKit lost, which a repair would write back.
    public var wouldRepair: [KTKey]
    /// Rule 6: WebKit holds exactly the store's state after this journal seq.
    public var lagSeq: Int64?

    public init(rule: Int, label: String, attach: Bool = true, changes: [KTKey: KTChange] = [:],
                wouldRepair: [KTKey] = [], lagSeq: Int64? = nil) {
        self.rule = rule
        self.label = label
        self.attach = attach
        self.changes = changes
        self.wouldRepair = wouldRepair
        self.lagSeq = lagSeq
    }

    /// Keys whose values the facade must send (`need`): every change WebKit holds a value for.
    public var need: [KTKey] { changes.filter { $0.value.target != KTWire.absent }.map(\.key).sorted() }
}

/// The reconcile, build 60 (observe mode): it decides from the `kt_last_open` witness, never from "a core key is
/// missing", and every outcome but rule 3 leaves kv equal to WebKit. What differs is what gets recorded: the
/// values given up (conflicts, for Put back), would-repair, and the counts in Settings > About > Storage.
///
/// | # | Situation | Build 60 does |
/// |---|---|---|
/// | 1 | store unreadable, or `meta.minReader` above this build | attach nothing (KTStore, before this) |
/// | 2 | WebKit unreadable (`hello nowk`) | facade off, reconcile nothing (KTStore, before this) |
/// | 3 | no witness in WebKit, WebKit near-empty, the store holds a full set | snapshot first, adopt nothing, offer Put back; the facade stays off for this document |
/// | 4 | WebKit's witness is neither in the store's history of it nor in the gap note with that hash | adopt every difference, deletions included; replaced values to conflicts ("older build"); nothing refilled |
/// | 5 | witness known; key named in the gap note | adopt WebKit's value (the store missed that write) |
/// | 6 | witness known; WebKit's whole manifest (less gap keys) equals the store's state at one journal seq | record would-repair; newer values to conflicts ("lag"); adopt WebKit |
/// | 7 | witness known; anything else | adopt WebKit; replaced values to conflicts ("unexplained"); counted |
///
/// Keys only in the store follow the same rules (absence is a value) and are never refilled. Reserved keys
/// (`kt_apikey`, `kt__store*`), `wkExcluded` and unknown encodings take no part.
public enum KTReconcile {
    /// Rule 3's "near-empty": WebKit holds at most this many keys (a wiped WebKit at document start holds none,
    /// or one a tool injected).
    public static let wipedMaxWebKitKeys = 2
    /// Rule 3's "full set": the store holds at least this many live values.
    public static let wipedMinStoreKeys = 5

    public static func classify(_ input: KTReconcileInput) -> KTReconcilePlan {
        let skip = input.unknownEnc.union(input.wkExcluded)
        func takesPart(_ k: KTKey) -> Bool { !KTProtocol.isReserved(k) && !skip.contains(k) }
        let W = input.manifest.filter { takesPart($0.key) }
        let S = input.store.filter { takesPart($0.key) }
        let absent = KTWire.absent
        func web(_ k: KTKey) -> String { W[k] ?? absent }
        func kept(_ k: KTKey) -> String { S[k] ?? absent }
        func differs(_ k: KTKey) -> Bool { web(k) != kept(k) }
        let witness = KTProtocol.witnessKey

        // Rule 3: WebKit wiped. Absence of the witness is the evidence: no page code erases localStorage, and
        // every installable page stamps kt_last_open at boot.
        let liveStore = S.values.filter { $0 != absent }.count
        if W[witness] == nil && W.count <= wipedMaxWebKitKeys && liveStore >= wipedMinStoreKeys {
            return KTReconcilePlan(rule: 3, label: "wiped", attach: false)
        }

        // A value the store gives up is labelled "wiped" while a wipe's follow-up is pending and it is the
        // value the wipe kept.
        func reason(_ k: KTKey, _ r: KTReason) -> KTReason {
            if let wipe = input.wipe, let h = wipe[k], h == kept(k) { return .wiped }
            return r
        }
        let allKeys = Set(W.keys).union(S.keys)

        // Rule 4: the witness is unknown. An absent witness vouches for nothing.
        let hw = web(witness)
        let known = hw != absent && (input.witnessHistory.contains(hw) || input.gap?.keys[witness] == hw)
        if !known {
            let migrate = input.storeRows == 0
            var changes: [KTKey: KTChange] = [:]
            for k in allKeys where differs(k) {
                changes[k] = KTChange(target: web(k), reason: migrate ? .migrate : reason(k, .olderBuild))
            }
            return KTReconcilePlan(rule: 4, label: migrate ? "migrate" : "older build", changes: changes)
        }

        var changes: [KTKey: KTChange] = [:]
        var remaining = allKeys

        // Put back the facade wrote into WebKit but never confirmed: WebKit holds the staged value and the store
        // still holds what it was resolved against.
        for (k, pb) in input.putBack where takesPart(k) && web(k) == pb.h && kept(k) == pb.hbase {
            if differs(k) { changes[k] = KTChange(target: pb.h, reason: .putback) }
            remaining.remove(k)
        }

        // Rule 5: keys the gap note names.
        if let gap = input.gap {
            for k in remaining where gap.names(k) {
                if differs(k) { changes[k] = KTChange(target: web(k), reason: .gap) }
                remaining.remove(k)
            }
        }

        let differing = remaining.filter(differs)
        if differing.isEmpty {
            let gapOnly = changes.values.contains { $0.reason == .gap }
            return KTReconcilePlan(rule: gapOnly ? 5 : 0, label: gapOnly ? "gap" : "in step", changes: changes)
        }

        // Rule 6: WebKit lost a suffix of the store's writes.
        if let lag = lagPoint(webkit: W, store: S, keys: remaining, journal: input.journal) {
            for k in differing { changes[k] = KTChange(target: web(k), reason: reason(k, .lag)) }
            return KTReconcilePlan(rule: 6, label: "lag", changes: changes, wouldRepair: lag.wouldRepair,
                                   lagSeq: lag.seq)
        }

        // Rule 7.
        for k in differing { changes[k] = KTChange(target: web(k), reason: reason(k, .unexplained)) }
        return KTReconcilePlan(rule: 7, label: "unexplained", changes: changes)
    }

    /// Walks the journal back from its head, undoing one write at a time (`state[k] = hprev`), and returns the
    /// first seq j at which the store's state over `keys` equals WebKit's manifest: WebKit lost the writes after
    /// j. One backward pass, tracking only how many keys still differ. Stops (nil) when a row does not lead to
    /// the state it should (an incomplete history) or when the retained journal runs out.
    static func lagPoint(webkit W: [KTKey: String], store S: [KTKey: String], keys: Set<KTKey>,
                         journal: [KTJournalRow]) -> (seq: Int64, wouldRepair: [KTKey])? {
        let absent = KTWire.absent
        var state: [KTKey: String] = [:]
        for k in keys { state[k] = S[k] ?? absent }
        var differing = Set(keys.filter { (W[$0] ?? absent) != state[$0] })
        guard !differing.isEmpty else { return nil }
        let wouldRepair = differing.sorted()
        for row in journal.reversed() where keys.contains(row.key) {
            guard state[row.key] == row.h else { return nil }
            state[row.key] = row.hprev
            if (W[row.key] ?? absent) == row.hprev { differing.remove(row.key) } else { differing.insert(row.key) }
            if differing.isEmpty { return (row.seq - 1, wouldRepair) }
        }
        return nil
    }
}
