#if os(iOS)
import Foundation

/// The shell's own device switches (build 61; contract 3.5, 10.1, D5; 11-shell.md H6): `tabs` in 61, the native tab bar
/// (Settings > About > Native tab bar, through TrovoShell `setSwitch`). The root is built at scene connect, before the
/// page boots, so no WebKit key can decide it.
///
/// `Application Support/FPShell/switches.json` holds them (`{"tabs": false}`), written atomically; UserDefaults keeps a
/// copy (`fp.shell.switches`), read only when the file does not read: UserDefaults reaches its disk later, through
/// cfprefsd, and came back stale after a kill and a quick reinstall on iOS 27, as the breaker book's copy did
/// (`breakers.json`). A piece no switch names is on; a piece of a later build is kept as read and written back.
///
/// Off acts at once (the scene falls back, H8) and at every launch after; on acts from the next launch. The Native Coach
/// switch stays the page's `kt_native_off`: it acts inside the document and is never here. Build 60 ignores the file.
struct ShellSwitches {
    static let fileName = "switches.json"
    static let defaultsKey = "fp.shell.switches"
    /// The pieces the shell keeps a switch for: `setSwitch` refuses any other `no-switch` (contract 3.5).
    static let pieces = ["tabs"]

    let url: URL
    let defaults: UserDefaults
    /// The switches as stored, piece to on.
    private(set) var values: [String: Bool]

    /// Reads the file, else the copy (a launch). `folder`: `Application Support/FPShell`, the bridge's.
    init(folder: URL, defaults: UserDefaults) {
        url = folder.appendingPathComponent(Self.fileName)
        self.defaults = defaults
        values = Self.load(url: url, defaults: defaults)
    }

    /// The pieces switched off on this device: ScreenGate's `deviceOff`.
    var deviceOff: Set<String> { Set(values.compactMap { $0.value ? nil : $0.key }) }

    /// A piece no switch names is on.
    func isOn(_ piece: String) -> Bool { values[piece] ?? true }

    /// Sets a piece's switch: in force at once for this launch, then the copy in UserDefaults, then the file, written
    /// atomically (a new file renamed over the old one, never a half-written file). false when the file could not be
    /// written (the copy holds the switch; a file already there stays as it was, never deleted: a write refused before
    /// the first unlock must not take a good file away).
    @discardableResult
    mutating func set(_ piece: String, on: Bool) -> Bool {
        values[piece] = on
        let data = Self.encode(values)
        defaults.set(data, forKey: Self.defaultsKey)
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            return true
        } catch {
            return false
        }
    }

    /// The file when it reads, else the UserDefaults copy, else none (every piece on).
    static func load(url: URL, defaults: UserDefaults) -> [String: Bool] {
        if let data = try? Data(contentsOf: url), let read = decode(data) { return read }
        return defaults.data(forKey: defaultsKey).flatMap(decode) ?? [:]
    }

    /// A JSON object of booleans; nil for anything else.
    static func decode(_ data: Data) -> [String: Bool]? {
        try? JSONDecoder().decode([String: Bool].self, from: data)
    }

    static func encode(_ values: [String: Bool]) -> Data {
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys]
        return (try? e.encode(values)) ?? Data("{}".utf8)
    }
}
#endif
