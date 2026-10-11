import Foundation
import SQLite3

/// Why a store operation did not happen.
public enum KTStoreError: Error, Equatable, CustomStringConvertible, Sendable {
    /// SQLITE_FULL: the disk is full. The facade's answer is `full`.
    case full(String)
    /// SQLITE_BUSY or SQLITE_LOCKED after `busy_timeout`. The answer is `busy`.
    case busy(String)
    /// The file cannot be trusted: corrupt, not a database, an I/O error, cannot be opened (not yet unlocked),
    /// a value that is not UTF-16 or does not match its hash. The store turns itself off for this launch and is
    /// never read as empty, recreated or overwritten.
    case unreadable(String)
    /// This operation failed (out of memory, too big, misuse); the store stays on. The answer is `err`.
    case failed(String)

    public var description: String {
        switch self {
        case .full(let m): return "full: \(m)"
        case .busy(let m): return "busy: \(m)"
        case .unreadable(let m): return "unreadable: \(m)"
        case .failed(let m): return "failed: \(m)"
        }
    }

    /// The facade's answer for a write that failed this way.
    var answer: KTProtocol.Answer {
        switch self {
        case .full: return .full
        case .busy: return .busy
        case .unreadable, .failed: return .err
        }
    }
}

/// SQLite takes its own copy of a bound value.
private let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

/// The store's one connection. Every call runs on KTStore's serial queue; nothing here is shared.
///
/// Any step result other than ROW or DONE throws, so a damaged page can never end a loop early and pass for
/// "the end of the table" (the prototype's fault): corruption reads as unreadable, never as empty.
final class KTSQLite {
    let db: OpaquePointer
    private var cache: [String: KTStatement] = [:]
    private var inTransaction = false
    /// Transactions committed with synchronous=FULL (the ones that wrote a log key).
    private(set) var fullSyncCommits = 0

    private init(_ db: OpaquePointer) { self.db = db }

    /// Opens without SQLITE_OPEN_CREATE unless `create`: an existing file is never replaced by a new one.
    static func open(path: String, create: Bool, protect: Bool, busyTimeoutMs: Int32) throws -> KTSQLite {
        var flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX
        if create { flags |= SQLITE_OPEN_CREATE }
        #if os(iOS)
        // Readable from first unlock until shutdown, so a drain can open it while the phone is locked.
        if protect { flags |= SQLITE_OPEN_FILEPROTECTION_COMPLETEUNTILFIRSTUSERAUTHENTICATION }
        #endif
        var handle: OpaquePointer?
        let rc = sqlite3_open_v2(path, &handle, flags, nil)
        guard rc == SQLITE_OK, let db = handle else {
            let msg = handle.map { String(cString: sqlite3_errmsg($0)) } ?? String(cString: sqlite3_errstr(rc))
            sqlite3_close_v2(handle)
            throw KTStoreError.unreadable("open: \(msg) (\(rc))")
        }
        sqlite3_extended_result_codes(db, 1)
        sqlite3_busy_timeout(db, busyTimeoutMs)
        return KTSQLite(db)
    }

    func close() {
        for st in cache.values { st.finalize() }
        cache.removeAll()
        sqlite3_close_v2(db)
    }

    /// Maps a result code to what it means for the store.
    func error(_ rc: Int32, _ what: String) -> KTStoreError {
        let msg = "\(what): \(String(cString: sqlite3_errmsg(db))) (\(rc))"
        switch rc & 0xFF {
        case SQLITE_FULL: return .full(msg)
        case SQLITE_BUSY, SQLITE_LOCKED: return .busy(msg)
        case SQLITE_NOMEM, SQLITE_TOOBIG, SQLITE_CONSTRAINT, SQLITE_MISMATCH, SQLITE_RANGE, SQLITE_INTERRUPT,
             SQLITE_MISUSE, SQLITE_ABORT:
            return .failed(msg)
        default:  // CORRUPT, NOTADB, IOERR, CANTOPEN, PERM, READONLY, FORMAT, PROTOCOL, ERROR, SCHEMA, ...
            return .unreadable(msg)
        }
    }

    func exec(_ sql: String) throws {
        let rc = sqlite3_exec(db, sql, nil, nil, nil)
        guard rc == SQLITE_OK else { throw error(rc, sql) }
    }

    /// A prepared statement, kept for the connection's life. A statement that cannot be prepared means the
    /// file is not the store this build knows: unreadable.
    func statement(_ sql: String) throws -> KTStatement {
        if let st = cache[sql] {
            st.reset()
            return st
        }
        var handle: OpaquePointer?
        let rc = sqlite3_prepare_v2(db, sql, -1, &handle, nil)
        guard rc == SQLITE_OK, let h = handle else {
            sqlite3_finalize(handle)
            let e = error(rc, "prepare \(sql)")
            if case .failed = e { throw e }
            throw KTStoreError.unreadable("\(e)")
        }
        let st = KTStatement(h, self)
        cache[sql] = st
        return st
    }

    /// The first column of the first row as text, or nil when there is no row.
    func scalarText(_ sql: String) throws -> String? {
        let st = try statement(sql)
        defer { st.reset() }
        return try st.step() ? st.text(0) : nil
    }

    func scalarInt(_ sql: String) throws -> Int64? {
        let st = try statement(sql)
        defer { st.reset() }
        return try st.step() ? (st.isNull(0) ? nil : st.int64(0)) : nil
    }

    /// One write transaction. `full`: commit with synchronous=FULL (set outside the transaction: SQLite refuses
    /// to change it inside one), then back to NORMAL. Any error rolls back and rethrows.
    func transaction<T>(full: Bool, _ body: () throws -> T) throws -> T {
        precondition(!inTransaction, "FPStore transactions do not nest")
        if full { try exec("PRAGMA synchronous=FULL") }
        defer { if full { _ = sqlite3_exec(db, "PRAGMA synchronous=NORMAL", nil, nil, nil) } }
        try exec("BEGIN IMMEDIATE")
        inTransaction = true
        defer { inTransaction = false }
        do {
            let value = try body()
            try exec("COMMIT")
            if full { fullSyncCommits += 1 }
            return value
        } catch {
            _ = sqlite3_exec(db, "ROLLBACK", nil, nil, nil)
            throw error
        }
    }

    var changes: Int { Int(sqlite3_changes(db)) }
    var lastInsertRowID: Int64 { sqlite3_last_insert_rowid(db) }
}

/// A prepared statement with exact binding: keys as UTF-8 TEXT with an explicit length, values as BLOBs of
/// UTF-16LE code units (an empty value is a zero-length BLOB, never NULL; NULL is a tombstone).
final class KTStatement {
    private let handle: OpaquePointer
    private unowned let owner: KTSQLite

    fileprivate init(_ handle: OpaquePointer, _ owner: KTSQLite) {
        self.handle = handle
        self.owner = owner
    }

    fileprivate func finalize() { sqlite3_finalize(handle) }

    func reset() {
        sqlite3_reset(handle)
        sqlite3_clear_bindings(handle)
    }

    /// true for a row, false when done; anything else throws.
    func step() throws -> Bool {
        let rc = sqlite3_step(handle)
        if rc == SQLITE_ROW { return true }
        if rc == SQLITE_DONE { return false }
        throw owner.error(rc, "step")
    }

    /// Runs a statement that returns no rows.
    func run() throws {
        defer { reset() }
        while try step() {}
    }

    // MARK: Binding (1-based)

    func bind(_ i: Int32, _ text: String) throws {
        let bytes = Array(text.utf8)
        let rc = bytes.withUnsafeBufferPointer { p -> Int32 in
            guard let base = p.baseAddress, !p.isEmpty else { return sqlite3_bind_text(handle, i, "", 0, transient) }
            return base.withMemoryRebound(to: CChar.self, capacity: p.count) {
                sqlite3_bind_text(handle, i, $0, Int32(p.count), transient)
            }
        }
        try check(rc)
    }

    func bind(_ i: Int32, _ key: KTKey) throws { try bind(i, key.string) }

    func bind(_ i: Int32, _ value: Int64) throws { try check(sqlite3_bind_int64(handle, i, value)) }

    func bindNull(_ i: Int32) throws { try check(sqlite3_bind_null(handle, i)) }

    /// nil binds NULL (a tombstone); an empty value binds a zero-length BLOB.
    func bind(_ i: Int32, units: U16?) throws {
        guard let units else { return try bindNull(i) }
        if units.isEmpty { return try check(sqlite3_bind_zeroblob(handle, i, 0)) }
        #if _endian(big)
        let stored = units.map { $0.littleEndian }
        #else
        let stored = units
        #endif
        let rc = stored.withUnsafeBytes { sqlite3_bind_blob(handle, i, $0.baseAddress, Int32($0.count), transient) }
        try check(rc)
    }

    private func check(_ rc: Int32) throws {
        guard rc == SQLITE_OK else { throw owner.error(rc, "bind") }
    }

    // MARK: Columns (0-based)

    func isNull(_ c: Int32) -> Bool { sqlite3_column_type(handle, c) == SQLITE_NULL }

    func int64(_ c: Int32) -> Int64 { sqlite3_column_int64(handle, c) }

    func text(_ c: Int32) -> String? {
        guard !isNull(c) else { return nil }
        let p = sqlite3_column_text(handle, c)  // the text first, then its size (SQLite's documented order)
        let n = Int(sqlite3_column_bytes(handle, c))
        guard let p else { return n == 0 ? "" : nil }
        return String(decoding: UnsafeBufferPointer(start: p, count: n), as: UTF8.self)
    }

    func key(_ c: Int32) -> KTKey? { text(c).map { KTKey($0) } }

    /// A UTF-16 BLOB copied out exactly (nil for NULL). A BLOB of odd length is not UTF-16: unreadable.
    func units(_ c: Int32) throws -> U16? {
        guard !isNull(c) else { return nil }
        return try withBlob(c) { raw in
            var out = U16(repeating: 0, count: raw.count / 2)
            if !raw.isEmpty {
                out.withUnsafeMutableBytes { $0.copyMemory(from: raw) }
            }
            #if _endian(big)
            for i in out.indices { out[i] = UInt16(littleEndian: out[i]) }
            #endif
            return out
        }
    }

    /// The BLOB's bytes without a copy, valid only inside `body`. Its address may be unaligned for UInt16.
    func withBlob<T>(_ c: Int32, _ body: (UnsafeRawBufferPointer) throws -> T) throws -> T {
        let p = sqlite3_column_blob(handle, c)  // the pointer first, then the size (SQLite's documented order)
        let n = Int(sqlite3_column_bytes(handle, c))
        guard n % 2 == 0 else { throw KTStoreError.unreadable("a stored value of \(n) bytes is not UTF-16") }
        guard n > 0, let p else { return try body(UnsafeRawBufferPointer(start: nil, count: 0)) }
        return try body(UnsafeRawBufferPointer(start: p, count: n))
    }
}
