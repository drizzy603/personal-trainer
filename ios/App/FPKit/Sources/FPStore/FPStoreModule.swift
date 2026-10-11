import Foundation
import SQLite3

/// FPStore: KTStore, the native SQLite copy of every kt_* value in the page's exact UTF-16 code units (BLOB,
/// never TEXT), with its wire codec, the seven-rule reconcile, the journal, snaps and Put back (plan task S2;
/// see README.md, "FPStore"). The shadow facade, Resources/ktstore.js, comes with plan task S3.
public enum FPStoreModule {
    /// The module's name: its folder under Sources/, and the category its log lines can use.
    public static let name = "FPStore"

    /// The SQLite library this process runs against, such as "3.54.0".
    public static var sqliteVersion: String {
        String(cString: sqlite3_libversion())
    }

    /// The same version as a number, such as 3054000.
    public static var sqliteVersionNumber: Int {
        Int(sqlite3_libversion_number())
    }
}
