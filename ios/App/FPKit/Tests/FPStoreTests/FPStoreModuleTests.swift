import Foundation
import SQLite3
import XCTest
import FPStore

final class FPStoreModuleTests: XCTestCase {
    /// FPStore links the system SQLite, and that SQLite keeps a BLOB exact across a close and a reopen in WAL
    /// mode. The store keeps every kt_* value as the page's UTF-16 code units in a BLOB, never TEXT (TEXT
    /// corrupts half an emoji); a lone surrogate, U+2028 and NUL are the units a text path would damage.
    func testSystemSQLiteKeepsUTF16BlobExactAcrossReopen() throws {
        XCTAssertTrue(FPStoreModule.sqliteVersion.hasPrefix("3."), FPStoreModule.sqliteVersion)
        XCTAssertGreaterThanOrEqual(FPStoreModule.sqliteVersionNumber, 3_024_000,
                                    "the store's upserts (ON CONFLICT DO UPDATE) need SQLite 3.24 or later")

        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("FPStoreModuleTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let path = dir.appendingPathComponent("store.sqlite").path

        // "a", a lone high surrogate (half of an emoji), LINE SEPARATOR, NUL, "b"
        let value: [UInt16] = [0x0061, 0xD83D, 0x2028, 0x0000, 0x0062]

        do {
            let db = try Self.open(path)
            defer { XCTAssertEqual(sqlite3_close(db), SQLITE_OK) }
            XCTAssertEqual(try Self.text(db, "PRAGMA journal_mode=WAL"), "wal")
            try Self.run(db, "CREATE TABLE kv(k TEXT PRIMARY KEY, v BLOB)")
            try Self.put(db, key: "kt_probe", units: value)
        }
        do {
            let db = try Self.open(path)
            defer { XCTAssertEqual(sqlite3_close(db), SQLITE_OK) }
            XCTAssertEqual(try Self.text(db, "PRAGMA quick_check"), "ok")
            XCTAssertEqual(try Self.text(db, "SELECT typeof(v) FROM kv WHERE k = 'kt_probe'"), "blob")
            XCTAssertEqual(try Self.blob(db, key: "kt_probe"), value)
        }
    }

    // Just enough of the C API for the check above.

    private struct SQLiteError: Error, CustomStringConvertible {
        let description: String
    }

    /// SQLITE_TRANSIENT: SQLite takes its own copy of a bound value.
    private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    private static func open(_ path: String) throws -> OpaquePointer {
        var db: OpaquePointer?
        let rc = sqlite3_open_v2(path, &db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE, nil)
        guard rc == SQLITE_OK, let db else {
            sqlite3_close(db)
            throw SQLiteError(description: "open \(path): \(String(cString: sqlite3_errstr(rc)))")
        }
        return db
    }

    private static func prepare(_ db: OpaquePointer, _ sql: String) throws -> OpaquePointer {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
            throw SQLiteError(description: "prepare \(sql): \(String(cString: sqlite3_errmsg(db)))")
        }
        return statement
    }

    private static func run(_ db: OpaquePointer, _ sql: String) throws {
        let statement = try prepare(db, sql)
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_DONE else {
            throw SQLiteError(description: "run \(sql): \(String(cString: sqlite3_errmsg(db)))")
        }
    }

    /// The first column of the first row, as text.
    private static func text(_ db: OpaquePointer, _ sql: String) throws -> String {
        let statement = try prepare(db, sql)
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_ROW, let text = sqlite3_column_text(statement, 0) else {
            throw SQLiteError(description: "no row for \(sql): \(String(cString: sqlite3_errmsg(db)))")
        }
        return String(cString: text)
    }

    private static func put(_ db: OpaquePointer, key: String, units: [UInt16]) throws {
        let statement = try prepare(db, "INSERT INTO kv(k, v) VALUES(?, ?)")
        defer { sqlite3_finalize(statement) }
        let boundKey = sqlite3_bind_text(statement, 1, key, -1, transient)
        let boundValue = units.withUnsafeBytes { sqlite3_bind_blob(statement, 2, $0.baseAddress, Int32($0.count), transient) }
        guard boundKey == SQLITE_OK, boundValue == SQLITE_OK, sqlite3_step(statement) == SQLITE_DONE else {
            throw SQLiteError(description: "insert \(key): \(String(cString: sqlite3_errmsg(db)))")
        }
    }

    private static func blob(_ db: OpaquePointer, key: String) throws -> [UInt16] {
        let statement = try prepare(db, "SELECT v FROM kv WHERE k = ?")
        defer { sqlite3_finalize(statement) }
        sqlite3_bind_text(statement, 1, key, -1, transient)
        guard sqlite3_step(statement) == SQLITE_ROW else {
            throw SQLiteError(description: "no row for \(key): \(String(cString: sqlite3_errmsg(db)))")
        }
        let bytes = sqlite3_column_blob(statement, 0)  // the blob first, then its size (SQLite's documented order)
        let count = Int(sqlite3_column_bytes(statement, 0))
        guard let bytes, count % 2 == 0 else {
            throw SQLiteError(description: "\(key) is not a UTF-16 blob (\(count) bytes)")
        }
        var units = [UInt16](repeating: 0, count: count / 2)
        units.withUnsafeMutableBytes { $0.copyMemory(from: UnsafeRawBufferPointer(start: bytes, count: count)) }
        return units
    }
}
