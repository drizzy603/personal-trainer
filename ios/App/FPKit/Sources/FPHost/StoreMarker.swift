#if os(iOS)
import Foundation
import FPCore

/// The store's crash marker (plan task S5; decision.md section 6, "Breakers and switches").
///
/// One file beside the store, `store.marker`: the line `store@<page build> shell <shell build>`, a newline, and one
/// state byte (`StoreOpMarker`). The byte goes to "1" before each native store operation StoreAttach runs (a
/// prompt answer, an async post, a checkpoint, a snapshot, the store's open) and back to "0" after, with one
/// `pwrite` each way on a descriptor kept open for the launch, so a process that dies in the middle leaves "1"
/// behind. The next launch reads it before anything attaches: a stale "1" means the process died inside a store
/// operation, and StoreAttach turns the facade off for that (shell build, page build) pair (BreakerBook), which
/// Storage reports. A garbled file, or one left at "0", is no verdict.
///
/// Operations can overlap (a prompt answer on the main thread while a checkpoint runs on a utility queue): the
/// byte stays "1" until the last one ends.
final class StoreMarker: @unchecked Sendable {
    let url: URL
    private let lock = NSLock()
    private var fd: Int32 = -1
    private var offset: off_t = 0
    private var depth = 0
    private(set) var header: (shell: String, page: String)?

    init(url: URL) {
        self.url = url
    }

    deinit {
        if fd >= 0 { close(fd) }
    }

    /// What the last launch left: the marker when its state byte says an operation was in flight.
    func stale() -> CrashMarker? {
        guard let data = try? Data(contentsOf: url), let read = StoreOpMarker.read(data), read.inFlight else { return nil }
        return read.marker
    }

    /// Starts this launch's file (idle) for the pair and keeps it open for the state byte. A page build that changes
    /// within the process (a scene that reconnects serves a page staged meanwhile) writes the header again, between
    /// operations. false when the file cannot be written (the marker is then off for the launch).
    @discardableResult
    func begin(shell: String, page: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if let h = header, h.shell == shell, h.page == page, fd >= 0 { return true }
        guard depth == 0 else { return fd >= 0 }
        if fd >= 0 { close(fd); fd = -1 }
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let body = StoreOpMarker.file(shell: shell, page: page, inFlight: false)
        do {
            try body.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch {
            return false
        }
        let opened = url.withUnsafeFileSystemRepresentation { p -> Int32 in
            guard let p else { return -1 }
            return open(p, O_RDWR | O_CLOEXEC)
        }
        guard opened >= 0 else { return false }
        fd = opened
        offset = off_t(StoreOpMarker.stateOffset(shell: shell, page: page))
        header = (shell, page)
        return true
    }

    /// An operation begins.
    func enter() {
        lock.lock()
        depth += 1
        if depth == 1 { write(StoreOpMarker.inFlight) }
        lock.unlock()
    }

    /// The operation ended.
    func leave() {
        lock.lock()
        if depth > 0 { depth -= 1 }
        if depth == 0 { write(StoreOpMarker.idle) }
        lock.unlock()
    }

    /// Runs `body` as one marked operation.
    func around<T>(_ body: () throws -> T) rethrows -> T {
        enter()
        defer { leave() }
        return try body()
    }

    private func write(_ byte: UInt8) {
        guard fd >= 0 else { return }
        var b = byte
        _ = pwrite(fd, &b, 1, offset)
    }
}
#endif
