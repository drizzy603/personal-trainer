import Foundation

/// What Put back will do (or did) for one key.
public struct KTPutBackItem: Codable, Equatable, Sendable {
    public enum Outcome: String, Codable, Sendable {
        /// The value goes back into WebKit and the store at the next document start.
        case putBack = "put back"
        /// The key changed after the value was given up (a later edit, an older build's change): left alone.
        case changedSince = "changed since"
        /// WebKit already holds it, or the log already has every record.
        case nothingToAdd = "nothing to add"
        /// A log key whose values are not both JSON arrays.
        case unmergeable
        /// No such conflict, or a snapshot that cannot be read.
        case notFound = "not found"
        /// A row in an encoding this build does not read.
        case untouched
    }

    public var key: String
    public var outcome: Outcome
    /// Log keys: the records the merge adds.
    public var added: Int?
    /// Log keys: which records it adds (at most 20), each "<date> <name>": the record's `date`, then its day name
    /// (`label`), else its `type` or `sport`. A merge only adds, so this is what deleting would undo.
    public var records: [String]?
    /// `conflict:<id>[,<id>...]` or `snap:<name>`.
    public var origin: String
    /// true when this Put back deletes the key: the value kept was "no value" (an older build created the key, a
    /// loss took back a removal), so the facade removes it from WebKit and the store. Only ever on a `putBack` of a
    /// key that is not a log (a log is merged, never removed). Absent from the JSON otherwise, so Storage can say
    /// "Remove ...?" before it asks, instead of promising that nothing is removed.
    public var removes: Bool?

    public init(key: String, outcome: Outcome, added: Int? = nil, origin: String, removes: Bool? = nil, records: [String]? = nil) {
        self.key = key
        self.outcome = outcome
        self.added = added
        self.origin = origin
        self.removes = removes
        self.records = records
    }

    /// How many added records an item names.
    public static let recordsListed = 20
}

public struct KTPutBackPlan: Codable, Equatable, Sendable {
    public var items: [KTPutBackItem]
    /// Keys the Put back writes, removals included.
    public var count: Int { items.filter { $0.outcome == .putBack }.count }
    /// Of those, the keys it deletes.
    public var removals: Int { items.filter { $0.outcome == .putBack && $0.removes == true }.count }
    public init(items: [KTPutBackItem]) { self.items = items }
}

/// Put back of a log key (`kt_sessions`, `kt_runs`, `kt_sports`, `kt_bw`, `kt_measurements`): a record merge,
/// never a replacement, so no record is ever dropped.
///
/// Records the given-up value holds and the current value lacks are added, matched by their `id` token (a record
/// without one, such as a `kt_measurements` entry, by its whole text). A record both hold keeps the current
/// version. The result is ordered by the page's own rule (index.html `lsSet`: newest `date` first, then the larger
/// `id`), with a stable sort, and written by joining the records' exact text: nothing is re-serialized, so every
/// field and every lone-surrogate escape survives.
enum KTMerge {
    struct Result: Equatable {
        var merged: U16
        var added: Int
        /// Each added record as "<date> <name>" (KTPutBackItem.records), in the order they were added.
        var addedRecords: [String] = []
    }

    /// nil when either side is not a JSON array. A nil `current` is an absent key: an empty log.
    static func logs(current: U16?, extra: U16) -> Result? {
        let base = current ?? Array("[]".utf16)
        guard let baseParts = KTJSON.arrayElements(base), let extraParts = KTJSON.arrayElements(extra) else { return nil }
        var records: [Record] = []
        records.reserveCapacity(baseParts.count + extraParts.count)
        var ids = Set<U16>(), texts = Set<U16>()
        for r in baseParts {
            let rec = Record(base, r)
            if let id = rec.idToken { ids.insert(id) } else { texts.insert(rec.text) }
            records.append(rec)
        }
        var added = 0
        var summaries: [String] = []
        for r in extraParts {
            let rec = Record(extra, r)
            if let id = rec.idToken {
                if ids.contains(id) { continue }
            } else if texts.contains(rec.text) {
                continue
            }
            records.append(rec)
            added += 1
            summaries.append(rec.summary)
        }
        let sorted = stableSort(records)
        var out: U16 = [0x5B]
        for (i, rec) in sorted.enumerated() {
            if i > 0 { out.append(0x2C) }
            out.append(contentsOf: rec.text)
        }
        out.append(0x5D)
        return Result(merged: out, added: added, addedRecords: summaries)
    }

    /// One record: its exact text and what lsSet's comparator reads from it.
    struct Record {
        let text: U16
        /// The raw `id` token (absent or `null`: none).
        let idToken: U16?
        /// `String((r && r.date) || '')`.
        let date: U16
        /// `(r && r.id) || 0`, as the subtraction reads it (NaN for a non-numeric string).
        let id: Double
        /// What Storage calls it: the day's name (`label`), else `type`, else `sport` (strings only).
        let name: U16?

        /// "<date> <name>", for KTPutBackItem.records.
        var summary: String {
            var s = String(decoding: date, as: UTF16.self)
            if let name, !name.isEmpty { s += (s.isEmpty ? "" : " ") + String(decoding: name, as: UTF16.self) }
            return s
        }

        init(_ u: U16, _ range: Range<Int>) {
            text = Array(u[range])
            var idToken: U16?
            var date: U16 = []
            var id = 0.0
            var label: U16?, type: U16?, sport: U16?
            if let members = KTJSON.objectMembers(u, range) {
                for (name, vr) in members {
                    if name == Array("id".utf16) {
                        let tok = Array(u[vr])
                        if tok != Array("null".utf16) { idToken = tok }
                        id = Record.number(u, vr)
                    } else if name == Array("date".utf16) {
                        date = Record.string(u, vr)
                    } else if name == Array("label".utf16) {
                        label = KTJSON.string(u, vr)
                    } else if name == Array("type".utf16) {
                        type = KTJSON.string(u, vr)
                    } else if name == Array("sport".utf16) {
                        sport = KTJSON.string(u, vr)
                    }
                }
            }
            self.idToken = idToken
            self.date = date
            self.id = id
            func named(_ v: U16?) -> U16? { (v?.isEmpty ?? true) ? nil : v }
            self.name = named(label) ?? named(type) ?? named(sport)
        }

        /// JavaScript's `String(x || '')` for a JSON token.
        static func string(_ u: U16, _ r: Range<Int>) -> U16 {
            if let s = KTJSON.string(u, r) { return s }  // "" is falsy: '' either way
            let tok = KTJSON.ascii(u, r)
            switch tok {
            case "null", "false": return []
            case "true": return Array("true".utf16)
            default:
                guard let d = Double(tok) else { return Array(u[r]) }  // an object or array: its text
                if d == 0 { return [] }
                if d == d.rounded(), abs(d) < 1e21 { return Array(String(Int64(d)).utf16) }
                return Array(tok.utf16)
            }
        }

        /// JavaScript's `(x || 0)` as `b.id - a.id` reads it.
        static func number(_ u: U16, _ r: Range<Int>) -> Double {
            if let s = KTJSON.string(u, r) {
                let t = String(decoding: s, as: UTF16.self).trimmingCharacters(in: .whitespacesAndNewlines)
                if t.isEmpty { return 0 }
                return Double(t) ?? .nan
            }
            let tok = KTJSON.ascii(u, r)
            switch tok {
            case "null", "false": return 0
            case "true": return 1
            default: return Double(tok) ?? .nan
            }
        }
    }

    /// lsSet's comparator: > 0 puts `b` first. A NaN difference counts as equal, as Array.prototype.sort reads it.
    static func compare(_ a: Record, _ b: Record) -> Int {
        if a.date != b.date { return a.date.lexicographicallyPrecedes(b.date) ? 1 : -1 }
        let d = b.id - a.id
        if d.isNaN || d == 0 { return 0 }
        return d > 0 ? 1 : -1
    }

    /// A merge sort that keeps equal records in their order (Array.prototype.sort is stable since ES2019).
    static func stableSort(_ items: [Record]) -> [Record] {
        guard items.count > 1 else { return items }
        let mid = items.count / 2
        let left = stableSort(Array(items[..<mid])), right = stableSort(Array(items[mid...]))
        var out: [Record] = []
        out.reserveCapacity(items.count)
        var i = 0, j = 0
        while i < left.count && j < right.count {
            if compare(left[i], right[j]) > 0 { out.append(right[j]); j += 1 } else { out.append(left[i]); i += 1 }
        }
        out.append(contentsOf: left[i...])
        out.append(contentsOf: right[j...])
        return out
    }
}
