import Foundation
import SQLite3

/// FPStore's placeholder from the package skeleton (plan task S1).
///
/// FPStore will hold KTStore, the native SQLite copy of every kt_* value in the page's exact UTF-16 code
/// units (BLOB, never TEXT): the wire codec, the reconcile, the journal, snaps and Put back (S2), and the
/// shadow facade, Resources/ktstore.js (S3). For now it only shows the target links the system SQLite.
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
