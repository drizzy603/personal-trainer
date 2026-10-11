import Foundation

/// One snapshot file.
public struct KTSnapInfo: Codable, Equatable, Sendable {
    /// The file name in `snaps/`.
    public var name: String
    /// `daily`, `migrate` (the first copy), `wiped` (rule 3: the store as it was when WebKit came back empty),
    /// `manual`, or `export` (never written to `snaps/`).
    public var kind: String
    /// When it was taken (ms).
    public var at: Int64
    /// The journal's head when it was taken: Put back of a snapshot leaves alone a key the page changed after it.
    public var seq: Int64
    public var keys: Int
    public var bytes: Int
}

/// Builds a snapshot's JSON, value by value, straight from SQLite's BLOB memory:
///
///     {"v":1,"kind":"daily","at":1760140000000,"build":60,"seq":123,"keys":{
///     "kt_a":"...",
///     "kt_b":"..."
///     }}
///
/// Keys and values are JSON literals made like the store's answers (every surrogate half escaped), so a file is
/// valid UTF-8 and JSON.parse in the page gives back the exact code units.
struct KTSnapWriter {
    private(set) var bytes: [UInt8] = []
    private(set) var count = 0
    private var scratch = U16()

    init(kind: String, at: Int64, build: Int, seq: Int64, capacity: Int = 0) {
        bytes.reserveCapacity(capacity + 128)
        bytes.append(contentsOf: Array("{\"v\":1,\"kind\":".utf8))
        KTWire.appendQuotedUTF8(Array(kind.utf16), to: &bytes)
        bytes.append(contentsOf: Array(",\"at\":\(at),\"build\":\(build),\"seq\":\(seq),\"keys\":{".utf8))
    }

    /// A value given as the stored UTF-16LE bytes (the address may be unaligned: they are copied first).
    /// Returns the value's hash, so the caller can check it against the stored one.
    @discardableResult
    mutating func add(_ key: KTKey, utf16le raw: UnsafeRawBufferPointer) -> String {
        let n = raw.count / 2
        if scratch.count < n { scratch = U16(repeating: 0, count: n) }
        scratch.withUnsafeMutableBytes { dst in
            if n > 0 { dst.baseAddress!.copyMemory(from: raw.baseAddress!, byteCount: n * 2) }
        }
        #if _endian(big)
        for i in 0..<n { scratch[i] = UInt16(littleEndian: scratch[i]) }
        #endif
        bytes.append(contentsOf: count == 0 ? [0x0A] : [0x2C, 0x0A])
        KTWire.appendQuotedUTF8(key.units, to: &bytes)
        bytes.append(0x3A)
        var h = ""
        scratch.withUnsafeBufferPointer { all in
            let value = UnsafeBufferPointer(rebasing: all[0..<n])
            h = KTWire.hash(value)
            KTWire.appendQuotedUTF8(value, to: &bytes)
        }
        count += 1
        return h
    }

    @discardableResult
    mutating func add(_ key: KTKey, _ value: U16) -> String {
        value.withUnsafeBytes { add(key, utf16le: $0) }
    }

    mutating func finish() -> [UInt8] {
        bytes.append(contentsOf: Array("\n}}\n".utf8))
        return bytes
    }
}

/// `FPStore/snaps/`: separate files, so a damaged store.sqlite cannot take its safety copies with it. Daily
/// snapshots are `<yyyy-MM-dd>.json`, the newest 7 kept; event snapshots (`migrate`, `wiped`, `manual`) are
/// `<yyyy-MM-dd>-<HHmmss>-<kind>.json`, kept 30 days and never while a Put back offer needs them. Each file is
/// written beside its final name, synced and renamed into place, so a reader sees the old file or the new
/// one, never half of one.
struct KTSnaps {
    static let dailyKept = 7
    static let eventDays = 30

    let dir: URL
    let timeZone: TimeZone
    let protect: Bool

    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = timeZone
        return c
    }

    private func dayString(_ date: Date) -> String {
        let d = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", d.year ?? 0, d.month ?? 0, d.day ?? 0)
    }

    private func timeString(_ date: Date) -> String {
        let d = calendar.dateComponents([.hour, .minute, .second], from: date)
        return String(format: "%02d%02d%02d", d.hour ?? 0, d.minute ?? 0, d.second ?? 0)
    }

    func dailyName(_ date: Date) -> String { dayString(date) + ".json" }

    func eventName(_ kind: String, _ date: Date) -> String {
        var name = "\(dayString(date))-\(timeString(date))-\(kind).json"
        var n = 2
        while FileManager.default.fileExists(atPath: dir.appendingPathComponent(name).path) {
            name = "\(dayString(date))-\(timeString(date))-\(kind)-\(n).json"
            n += 1
        }
        return name
    }

    func hasDaily(_ date: Date) -> Bool {
        FileManager.default.fileExists(atPath: dir.appendingPathComponent(dailyName(date)).path)
    }

    func ensureDir() throws {
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        #if os(iOS)
        if protect {
            try? FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                                                   ofItemAtPath: dir.path)
        }
        #endif
    }

    /// Writes `bytes` as `name`, atomically.
    func write(_ bytes: [UInt8], name: String) throws {
        try ensureDir()
        try KTSnaps.writeAtomically(bytes, to: dir.appendingPathComponent(name), protect: protect)
    }

    /// Reads a snapshot back: its header and every value, exact.
    func read(_ name: String) throws -> (info: KTSnapInfo, values: [KTKey: U16]) {
        let data = try Data(contentsOf: dir.appendingPathComponent(name))
        return try KTSnaps.parse(data, name: name)
    }

    static func parse(_ data: Data, name: String) throws -> (info: KTSnapInfo, values: [KTKey: U16]) {
        let u = Array(String(decoding: data, as: UTF8.self).utf16)
        guard let members = KTJSON.objectMembers(u) else { throw KTStoreError.failed("\(name) is not a snapshot") }
        var info = KTSnapInfo(name: name, kind: "", at: 0, seq: 0, keys: 0, bytes: data.count)
        var values: [KTKey: U16] = [:]
        var version = ""
        for (field, range) in members {
            switch String(decoding: field, as: UTF16.self) {
            case "v": version = KTJSON.ascii(u, range)
            case "kind": info.kind = KTJSON.string(u, range).map { String(decoding: $0, as: UTF16.self) } ?? ""
            case "at": info.at = Int64(KTJSON.ascii(u, range)) ?? 0
            case "seq": info.seq = Int64(KTJSON.ascii(u, range)) ?? 0
            case "keys":
                guard let entries = KTJSON.objectMembers(u, range) else {
                    throw KTStoreError.failed("\(name): keys is not an object")
                }
                for (k, vr) in entries {
                    guard let key = KTKey(units: k), let v = KTJSON.string(u, vr) else {
                        throw KTStoreError.failed("\(name): an entry that is not a key and a string")
                    }
                    values[key] = v
                }
            default: continue
            }
        }
        guard version == "1" else { throw KTStoreError.failed("\(name): not a version 1 snapshot") }
        info.keys = values.count
        return (info, values)
    }

    /// The snapshots on disk, newest name first.
    func list() -> [String] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []
        return names.filter { $0.hasSuffix(".json") && !$0.hasPrefix(".") }.sorted(by: >)
    }

    static func isDaily(_ name: String) -> Bool { name.count == "yyyy-MM-dd.json".count }

    /// Keeps the newest 7 daily snapshots and event snapshots younger than 30 days, plus `keep`.
    func rotate(now: Date, keep: Set<String>) {
        let names = list()
        let cutoff = dayString(now.addingTimeInterval(-Double(KTSnaps.eventDays) * 86_400))
        var daily = 0
        for name in names where !keep.contains(name) {
            if KTSnaps.isDaily(name) {
                daily += 1
                if daily > KTSnaps.dailyKept { try? FileManager.default.removeItem(at: dir.appendingPathComponent(name)) }
            } else if String(name.prefix(10)) < cutoff {
                try? FileManager.default.removeItem(at: dir.appendingPathComponent(name))
            }
        }
        // Leftovers of a write killed before its rename.
        if let all = try? FileManager.default.contentsOfDirectory(atPath: dir.path) {
            for name in all where name.hasPrefix(".") && name.hasSuffix(".tmp") {
                try? FileManager.default.removeItem(at: dir.appendingPathComponent(name))
            }
        }
    }

    /// Writes beside `url`, fsyncs, renames over `url`, then fsyncs the folder.
    static func writeAtomically(_ bytes: [UInt8], to url: URL, protect: Bool) throws {
        let folder = url.deletingLastPathComponent()
        let tmp = folder.appendingPathComponent(".\(url.lastPathComponent).\(UUID().uuidString).tmp")
        let fd = Darwin.open(tmp.path, O_WRONLY | O_CREAT | O_EXCL, 0o600)
        guard fd >= 0 else { throw KTStoreError.failed("snapshot: cannot create \(tmp.lastPathComponent): errno \(errno)") }
        var renamed = false
        defer { if !renamed { unlink(tmp.path) } }
        var failure: KTStoreError?
        bytes.withUnsafeBytes { raw in
            var off = 0
            while off < raw.count {
                let n = Darwin.write(fd, raw.baseAddress! + off, raw.count - off)
                if n < 0 {
                    if errno == EINTR { continue }
                    failure = errno == ENOSPC ? .full("snapshot: disk full") : .failed("snapshot: write errno \(errno)")
                    return
                }
                off += n
            }
        }
        if failure == nil, fsync(fd) != 0 { failure = .failed("snapshot: fsync errno \(errno)") }
        Darwin.close(fd)
        if let failure { throw failure }
        #if os(iOS)
        if protect {
            try? FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                                                   ofItemAtPath: tmp.path)
        }
        #endif
        guard rename(tmp.path, url.path) == 0 else { throw KTStoreError.failed("snapshot: rename errno \(errno)") }
        renamed = true
        let dfd = Darwin.open(folder.path, O_RDONLY)
        if dfd >= 0 {
            _ = fsync(dfd)
            Darwin.close(dfd)
        }
    }
}
