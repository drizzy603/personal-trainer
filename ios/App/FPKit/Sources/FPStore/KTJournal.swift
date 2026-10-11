import Foundation

/// One write the store took: the key, the hash it got and the hash it had (`hprev`), so the reconcile can walk
/// the store's state backwards one row at a time.
public struct KTJournalRow: Equatable, Sendable {
    public var seq: Int64
    public var key: KTKey
    public var h: String
    public var hprev: String
    public var at: Int64
    public var src: String
    public var boot: Int64
    public var pseq: Int64

    public init(seq: Int64, key: KTKey, h: String, hprev: String, at: Int64 = 0, src: String = "page",
                boot: Int64 = 0, pseq: Int64 = 0) {
        self.seq = seq
        self.key = key
        self.h = h
        self.hprev = hprev
        self.at = at
        self.src = src
        self.boot = boot
        self.pseq = pseq
    }
}

/// The journal table: `journal(seq, k, h, hprev, at, src, boot, pseq)`.
///
/// **Caps are per key**: each key keeps its last 32 writes, and every row from the last 10 minutes stays. A
/// diagnostic key written 5,000 times cannot push a rarely edited programme out of history (critique 10).
/// Pruning removes the oldest rows of one key only, so each key's retained rows are a suffix of its history,
/// and above the highest seq ever pruned (the horizon, in `meta.jhorizon`) the journal holds every write of
/// every key: the lag walk may reconstruct any state down to it, and never below.
enum KTJournal {
    static let perKeyCap = 32
    static let windowMs: Int64 = 10 * 60 * 1000

    /// Source labels. A page write is mirrored (`page`) or posted (`post`); `adopt:<reason>` follows WebKit at a
    /// document start; `migrate` is the first copy; `putback` is the owner's Put back.
    static let page = "page", post = "post", migrate = "migrate", putback = "putback"
    static func adopt(_ reason: KTReason) -> String { "adopt:" + reason.rawValue }

    /// Sources that mean the page (on this build or another) changed the key, as opposed to the store only
    /// following a loss (`adopt:lag`, `adopt:wiped`). Put back of a snapshot leaves a changed key alone.
    static func isChange(_ src: String) -> Bool {
        src != adopt(.lag) && src != adopt(.wiped)
    }

    static func append(_ sql: KTSQLite, key: KTKey, h: String, hprev: String, at: Int64, src: String,
                       boot: Int64, pseq: Int64) throws -> Int64 {
        let st = try sql.statement(
            "INSERT INTO journal(k, h, hprev, at, src, boot, pseq) VALUES(?, ?, ?, ?, ?, ?, ?)")
        try st.bind(1, key)
        try st.bind(2, h)
        try st.bind(3, hprev)
        try st.bind(4, at)
        try st.bind(5, src)
        try st.bind(6, boot)
        try st.bind(7, pseq)
        try st.run()
        return sql.lastInsertRowID
    }

    /// Drops the key's rows that are both older than its last 32 and older than the 10-minute window (measured
    /// on the store's own monotonic clock, `at`). Returns the highest seq it dropped, if any.
    static func prune(_ sql: KTSQLite, key: KTKey, now: Int64) throws -> Int64? {
        let capSt = try sql.statement("SELECT seq FROM journal WHERE k = ? ORDER BY seq DESC LIMIT 1 OFFSET ?")
        try capSt.bind(1, key)
        try capSt.bind(2, Int64(perKeyCap - 1))
        guard try capSt.step() else { capSt.reset(); return nil }  // 32 rows or fewer
        let capSeq = capSt.int64(0)
        capSt.reset()

        // The first row of the window (`at` never decreases with seq, so `at` order is seq order).
        let winSt = try sql.statement("SELECT seq FROM journal WHERE at >= ? ORDER BY at, seq LIMIT 1")
        try winSt.bind(1, now - windowMs)
        let winSeq = try winSt.step() ? winSt.int64(0) : Int64.max
        winSt.reset()

        let cut = min(capSeq, winSeq)
        let maxSt = try sql.statement("SELECT MAX(seq) FROM journal WHERE k = ? AND seq < ?")
        try maxSt.bind(1, key)
        try maxSt.bind(2, cut)
        let dropped: Int64? = try maxSt.step() && !maxSt.isNull(0) ? maxSt.int64(0) : nil
        maxSt.reset()
        guard let dropped else { return nil }

        let del = try sql.statement("DELETE FROM journal WHERE k = ? AND seq < ?")
        try del.bind(1, key)
        try del.bind(2, cut)
        try del.run()
        return dropped
    }

    /// Every hash the key has held in the retained history (each row's `h` and `hprev`), absence included.
    static func history(_ sql: KTSQLite, key: KTKey) throws -> Set<String> {
        let st = try sql.statement("SELECT h, hprev FROM journal WHERE k = ?")
        defer { st.reset() }
        try st.bind(1, key)
        var out = Set<String>()
        while try st.step() {
            if let h = st.text(0) { out.insert(h) }
            if let p = st.text(1) { out.insert(p) }
        }
        return out
    }

    /// The retained rows above `horizon`, oldest first.
    static func rows(_ sql: KTSQLite, above horizon: Int64) throws -> [KTJournalRow] {
        let st = try sql.statement(
            "SELECT seq, k, h, hprev, at, src, boot, pseq FROM journal WHERE seq > ? ORDER BY seq")
        defer { st.reset() }
        try st.bind(1, horizon)
        var out: [KTJournalRow] = []
        while try st.step() { out.append(try row(st)) }
        return out
    }

    /// The key's retained rows after `seq`, oldest first.
    static func rows(_ sql: KTSQLite, key: KTKey, after seq: Int64) throws -> [KTJournalRow] {
        let st = try sql.statement(
            "SELECT seq, k, h, hprev, at, src, boot, pseq FROM journal WHERE k = ? AND seq > ? ORDER BY seq")
        defer { st.reset() }
        try st.bind(1, key)
        try st.bind(2, seq)
        var out: [KTJournalRow] = []
        while try st.step() { out.append(try row(st)) }
        return out
    }

    /// The newest seq ever given out (AUTOINCREMENT never reuses one, even after pruning).
    static func head(_ sql: KTSQLite) throws -> Int64 {
        try sql.scalarInt("SELECT seq FROM sqlite_sequence WHERE name = 'journal'") ?? 0
    }

    /// The newest row's time, so the store's clock never runs backwards across launches.
    static func lastAt(_ sql: KTSQLite) throws -> Int64 {
        try sql.scalarInt("SELECT at FROM journal ORDER BY seq DESC LIMIT 1") ?? 0
    }

    private static func row(_ st: KTStatement) throws -> KTJournalRow {
        guard let key = st.key(1), let h = st.text(2), let hprev = st.text(3), let src = st.text(5) else {
            throw KTStoreError.unreadable("a journal row with a missing column")
        }
        return KTJournalRow(seq: st.int64(0), key: key, h: h, hprev: hprev, at: st.int64(4), src: src,
                            boot: st.int64(6), pseq: st.int64(7))
    }
}
