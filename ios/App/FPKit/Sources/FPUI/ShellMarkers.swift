#if os(iOS)
import Foundation
import FPCore

/// The shell's short-section crash markers (build 61; contract 10.2, D20; 11-shell.md H6).
///
/// One file per kind in `Application Support/FPShell`, beside build 60's `presenting.<screen>.marker` (ScreenMarkers):
/// - `section.tabs.marker` holds `tabs@<page> shell <n>`: the tab root's construction (from RootTabController's init to
///   the end of its first layout pass, inside SceneDelegate's synchronous build), each funnel run, each bar hide or show
///   and the fallback. A verdict gives the classic root for that (shell, page) pair.
/// - `model.<screen>.marker` holds `model <screen>@<page> shell <n>`: each model's decode and apply, for every screen of
///   the binary (ShellBridge writes it around every decoder, N's included). A verdict turns that piece off for the pair.
///
/// The store marker's pattern (FPHost StoreMarker; FPUI cannot import FPHost): the marker line, a newline and one state
/// byte, `1` inside a section and `0` outside, flipped by one `pwrite` each way on a descriptor kept open for the launch,
/// so a process that dies inside a section leaves `1` behind. Nested sections of one kind hold the byte until the last
/// one ends. A new page build rewrites the line between sections, never inside one. Written whatever the app's state:
/// the windows are milliseconds, so a background kill inside one is not a realistic false verdict.
///
/// Build 60 lists only `presenting.*.marker` files and its line reader returns nil for these lines, so it never reads
/// them. A file left at `0`, or one whose line does not read as its own kind, is no verdict.
final class SectionMarker: @unchecked Sendable {
    /// The state byte inside a section (`1`) and outside one (`0`), as the store's marker has them.
    static let inside = StoreOpMarker.inFlight
    static let outside = StoreOpMarker.idle

    let piece: CrashMarker.Piece
    let url: URL
    private let lock = NSLock()
    private var fd: Int32 = -1
    private var offset: off_t = 0
    private var depth = 0
    private(set) var header: (shell: String, page: String)?

    /// Nil for a piece no short section names: a screen's `presenting` marker (ScreenMarkers), the store's (FPHost), or a
    /// model for a screen name that cannot name a file.
    init?(folder: URL, piece: CrashMarker.Piece) {
        guard let name = Self.fileName(piece) else { return nil }
        self.piece = piece
        url = folder.appendingPathComponent(name)
    }

    deinit {
        if fd >= 0 { close(fd) }
    }

    /// The file a kind is kept in: `section.tabs.marker`, `model.<screen>.marker`.
    static func fileName(_ piece: CrashMarker.Piece) -> String? {
        switch piece {
        case .tabs: return "section.tabs.marker"
        case .model(let screen) where nameable(screen): return "model.\(screen).marker"
        case .model, .screen, .store: return nil
        }
    }

    /// A screen name that can name a file and a marker line (the binary's screens are ASCII letters and digits).
    static func nameable(_ screen: String) -> Bool {
        guard !screen.isEmpty, screen.utf8.count <= 64 else { return false }
        return screen.unicodeScalars.allSatisfy { s in
            switch s.value {
            case 0x30...0x39, 0x41...0x5A, 0x61...0x7A: return true   // 0-9, A-Z, a-z
            default: return false
            }
        }
    }

    /// The line and its newline for this kind and pair.
    static func head(_ piece: CrashMarker.Piece, shell: String, page: String) -> Data {
        Data((CrashMarker(piece: piece, pageBuild: page, shellBuild: shell).line + "\n").utf8)
    }

    /// Starts this launch's file for the pair, outside a section, and keeps it open for the state byte. Called before
    /// each section: nothing happens while the pair is the one written; a new pair (a page build served later in the
    /// process) rewrites the file between sections and is ignored inside one. false when the file cannot be written:
    /// the marker is then off until a later call succeeds.
    @discardableResult
    func begin(shell: String, page: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if let h = header, h.shell == shell, h.page == page, fd >= 0 { return true }
        guard depth == 0 else { return fd >= 0 }
        if fd >= 0 {
            close(fd)
            fd = -1
            header = nil
        }
        let head = Self.head(piece, shell: shell, page: page)
        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try (head + Data([Self.outside])).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch {
            return false
        }
        let opened = url.withUnsafeFileSystemRepresentation { p -> Int32 in
            guard let p else { return -1 }
            return open(p, O_RDWR | O_CLOEXEC)
        }
        guard opened >= 0 else { return false }
        fd = opened
        offset = off_t(head.count)
        header = (shell, page)
        return true
    }

    /// A section begins.
    func enter() {
        lock.lock()
        depth += 1
        if depth == 1 { write(Self.inside) }
        lock.unlock()
    }

    /// The section ended (one leave too many is harmless).
    func leave() {
        lock.lock()
        if depth > 0 { depth -= 1 }
        if depth == 0 { write(Self.outside) }
        lock.unlock()
    }

    /// Runs `body` as one section.
    func around<T>(_ body: () throws -> T) rethrows -> T {
        enter()
        defer { leave() }
        return try body()
    }

    /// Whether a section of this kind is open now.
    var isInside: Bool {
        lock.lock()
        defer { lock.unlock() }
        return depth > 0
    }

    private func write(_ byte: UInt8) {
        guard fd >= 0 else { return }
        var b = byte
        _ = pwrite(fd, &b, 1, offset)
    }

    // MARK: What the last launch left

    /// The short-section files the last launch left inside a section: every `section.*.marker` and `model.*.marker` in
    /// the folder whose state byte is `1`, with its marker (ShellBridge's launch records each as a verdict and removes
    /// the file, so it acts once). 60's `presenting.*.marker` files are ScreenMarkers' (`found`), the store's FPHost's.
    static func stale(folder: URL) -> [(url: URL, marker: CrashMarker)] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: folder.path)) ?? []
        return names.filter(isShortSectionFile).sorted().compactMap { name in
            let u = folder.appendingPathComponent(name)
            guard let data = try? Data(contentsOf: u), let r = read(data, name: name), r.inside else { return nil }
            return (u, r.marker)
        }
    }

    /// `section.<kind>.marker` or `model.<screen>.marker`.
    static func isShortSectionFile(_ name: String) -> Bool {
        (name.hasPrefix("section.") || name.hasPrefix("model.")) && name.hasSuffix(".marker")
    }

    /// The marker and whether its section was open, for a file called `name`; nil for bytes that do not read, or for a
    /// line of another kind than the file's name says.
    static func read(_ data: Data, name: String) -> (marker: CrashMarker, inside: Bool)? {
        guard let nl = data.firstIndex(of: 0x0A), nl + 1 < data.endIndex else { return nil }
        let line = String(decoding: data[data.startIndex ..< nl], as: UTF8.self)
        guard let marker = CrashMarker(line: line), fileName(marker.piece) == name else { return nil }
        let state = data[nl + 1]
        guard state == inside || state == outside else { return nil }
        return (marker, state == inside)
    }
}
#endif
