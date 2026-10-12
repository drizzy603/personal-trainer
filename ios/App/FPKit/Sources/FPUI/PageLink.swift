#if os(iOS)
import Foundation
import WebKit
import os.log
import FPCore

/// Swift to page (plan task C5; decision.md section 6, "Swift to page"): every intent goes to
/// `window.FPScreens.call(name, args)` through `callAsyncJavaScript` in the page's own world, one at a time and first
/// in, first out, each with its own timeout (2 s; 5 s for a snapshot, `Intent.timeout`).
///
/// - Bound to one web view by weak reference: a scene that connects again makes a new link for its own web view, and
///   nothing here keeps a web view alive.
/// - Every intent carries the boot (the document) it was asked for under. When that document goes (a reload, a
///   WebContent restart: `setBoot`), whatever is queued or in flight for it ends as `documentGone` and is never sent
///   again, to the new document or anywhere else. An answer that comes after its timeout, or from a document that has
///   gone, is dropped.
/// - An error answer that a page whose content process just died also gives (WebKit reports such a call as
///   "returned a result of an unsupported type") waits `documentGrace` (0.8 s) before it counts: if its document went
///   meanwhile (a new document started, a reload is under way) it ends as `documentGone`.
/// - With no document linked, an intent ends at once as `notLinked`, unsent.
/// - Only one intent is in the page at a time, so each timeout measures the page's own answer, never the queue in
///   front of it.
///
/// The outcome goes back to the caller (ShellBridge), which hands every answered one to LinkState: a timeout, a script
/// error, an answer without `ok` or a failure code counts toward the 3-failure breaker; the page's own refusals do not.
@MainActor
public final class PageLink {
    public enum Outcome: Equatable, Sendable {
        /// The page answered (or the bridge failed: a timeout, a script error, a malformed answer).
        case answered(IntentOutcome)
        /// Its document went before it was answered: not resent.
        case documentGone
        /// No document was linked when it was asked for: not sent.
        case notLinked

        /// For the log: done, refused <why>, failed <why>, gone, not linked.
        public var word: String {
            switch self {
            case .answered(.done): return "done"
            case .answered(.refused(let why)): return "refused " + why
            case .answered(.failed(.timeout)): return "failed timeout"
            case .answered(.failed(.javascript(let m))): return "failed script error: " + String(m.prefix(80))
            case .answered(.failed(.malformedReply(let m))): return "failed bad answer: " + String(m.prefix(40))
            case .answered(.failed(.page(let code))): return "failed page " + code
            case .documentGone: return "gone"
            case .notLinked: return "not linked"
            }
        }
    }

    /// One intent as the link handled it (for the log and the scenario runner).
    public struct Record: Equatable, Sendable {
        public var seq: Int
        public var name: String
        /// The document it was asked for under ("-" with none linked).
        public var boot: String
        /// Its nonce or message id, when it carries one.
        public var key: String?
        /// Sent into the page (false: it ended before it was).
        public var sent: Bool
        /// nil while queued or in the page.
        public var outcome: String?
        public var ms: Double?
    }

    private struct Item {
        let seq: Int
        let intent: Intent
        let boot: String
        let done: (Outcome) -> Void
        var sentAt: Date?
    }

    static let log = Logger(subsystem: "app.kt.trainer", category: "link")

    public private(set) weak var webView: WKWebView?
    /// The linked document's boot; nil while none is linked (before the first hello, or between a document start and
    /// the next hello).
    public private(set) var boot: String?
    private var queue: [Item] = []
    private var inFlight: Item?
    /// Answered with an error that a page whose process just died also gives: held for `documentGrace` to see whether
    /// their document went (a new document's start, a reload under way) before they count as failures.
    private var suspects: [(item: Item, error: Error)] = []
    /// How long an error answer waits to show whether its document went.
    var documentGrace: TimeInterval = 0.8
    private var timer: DispatchWorkItem?
    private var seq = 0
    /// Every intent asked for, newest last (the last 200).
    public private(set) var records: [Record] = []
    /// Called with each record as it changes (ShellProbe logs them).
    public var onRecord: ((Record) -> Void)?
    /// Scales every timeout (tests).
    var timeoutScale: Double = 1
    /// What runs in the page: `return await window.FPScreens.call(name, args);` (tests point it elsewhere).
    var source = Intent.callSource

    public init(webView: WKWebView) {
        self.webView = webView
    }

    /// Intents queued or in the page.
    public var pending: Int { queue.count + (inFlight == nil ? 0 : 1) }

    /// The document now linked (its hello was answered), or nil while a new one's hello is awaited. Whatever was asked
    /// for under another boot ends as `documentGone`, unsent or unanswered, and is never sent again.
    public func setBoot(_ newBoot: String?) {
        guard newBoot != boot else { return }
        boot = newBoot
        // Every intent of another document leaves the link before any of them is told (a caller told may ask again).
        var gone: [Item] = []
        if let item = inFlight, item.boot != newBoot {
            inFlight = nil
            timer?.cancel()
            timer = nil
            gone.append(item)
        }
        gone += queue.filter { $0.boot != newBoot }
        queue.removeAll { $0.boot != newBoot }
        gone += suspects.filter { $0.item.boot != newBoot }.map(\.item)
        suspects.removeAll { $0.item.boot != newBoot }
        for item in gone { finish(item, .documentGone) }
        pump()
    }

    /// Asks the page. `done` is called once, on the main thread, never before this returns.
    public func send(_ intent: Intent, done: @escaping (Outcome) -> Void = { _ in }) {
        seq += 1
        guard let boot, webView != nil else {
            let r = Record(seq: seq, name: intent.name, boot: "-", key: Self.key(intent), sent: false, outcome: Outcome.notLinked.word)
            note(r)
            DispatchQueue.main.async { done(.notLinked) }
            return
        }
        let item = Item(seq: seq, intent: intent, boot: boot, done: done)
        queue.append(item)
        note(Record(seq: item.seq, name: intent.name, boot: boot, key: Self.key(intent), sent: false))
        pump()
    }

    private func pump() {
        // `inFlight` is checked each turn: an outcome told below may have asked again and sent its intent already.
        while inFlight == nil, !queue.isEmpty {
            var item = queue.removeFirst()
            guard item.boot == boot, let wv = webView else {
                finish(item, .documentGone)
                continue
            }
            item.sentAt = Date()
            inFlight = item
            update(item.seq) { $0.sent = true }
            let seq = item.seq
            wv.callAsyncJavaScript(source, arguments: item.intent.callArguments, in: nil, in: .page) { [weak self] result in
                MainActor.assumeIsolated { self?.answered(seq: seq, result: result) }
            }
            let t = DispatchWorkItem { [weak self] in MainActor.assumeIsolated { self?.timedOut(seq: seq) } }
            timer = t
            DispatchQueue.main.asyncAfter(deadline: .now() + item.intent.timeout * timeoutScale, execute: t)
            return
        }
    }

    private func answered(seq: Int, result: Result<Any, Error>) {
        guard let item = inFlight, item.seq == seq else {
            Self.log.info("link: a late answer to intent #\(seq) dropped")
            return
        }
        timer?.cancel()
        timer = nil
        inFlight = nil
        switch result {
        case .success(let value):
            finish(item, .answered(IntentOutcome.classify(result: value, error: nil)))
        case .failure(let error):
            // The page's process died or the frame went with the call in it: the document is gone, which is no
            // failure of the bridge (the new document's start says so too, a moment later).
            if Self.documentWentAway(error) || webView?.isLoading == true {
                finish(item, .documentGone)
            } else {
                // WebKit fails a call whose content process was just killed with codes a broken bridge can give too
                // (seen on the simulator: "returned a result of an unsupported type"): the document gets a moment to
                // show it has gone before this counts.
                suspects.append((item, error))
                let seq = item.seq
                DispatchQueue.main.asyncAfter(deadline: .now() + documentGrace) { [weak self] in
                    MainActor.assumeIsolated { self?.resolveSuspect(seq: seq) }
                }
            }
        }
        pump()
    }

    private func resolveSuspect(seq: Int) {
        guard let i = suspects.firstIndex(where: { $0.item.seq == seq }) else { return }
        let (item, error) = suspects.remove(at: i)
        let gone = item.boot != boot || webView == nil || webView?.isLoading == true
        finish(item, gone ? .documentGone : .answered(IntentOutcome.classify(result: nil, error: error)))
    }

    private func timedOut(seq: Int) {
        guard let item = inFlight, item.seq == seq else { return }
        timer = nil
        inFlight = nil
        // WebKit never answers a call whose document a navigation replaced: one under way now took it
        finish(item, webView?.isLoading == true ? .documentGone : .answered(.failed(.timeout)))
        pump()
    }

    private func finish(_ item: Item, _ outcome: Outcome) {
        let ms = item.sentAt.map { Date().timeIntervalSince($0) * 1000 }
        update(item.seq) {
            $0.outcome = outcome.word
            $0.ms = ms
        }
        if case .answered(.done) = outcome {} else {
            Self.log.info("link: \(item.intent.name, privacy: .public) #\(item.seq) \(outcome.word, privacy: .public)")
        }
        item.done(outcome)
    }

    /// The errors WebKit reports when the call's document goes with it: the content process ended, the web view was
    /// torn down, the frame is no longer there, or the async function's result became unreachable (a navigation).
    nonisolated static func documentWentAway(_ error: Error) -> Bool {
        let e = error as NSError
        if e.domain == WKError.errorDomain {
            switch e.code {
            case WKError.webContentProcessTerminated.rawValue, WKError.webViewInvalidated.rawValue,
                 WKError.javaScriptInvalidFrameTarget.rawValue:
                return true
            default:
                break
            }
        }
        let text = (e.userInfo["WKJavaScriptExceptionMessage"] as? String ?? "") + " " + e.localizedDescription
        return text.localizedCaseInsensitiveContains("unreachable") || text.localizedCaseInsensitiveContains("navigat")
    }

    // MARK: Records

    private func note(_ r: Record) {
        records.append(r)
        if records.count > 200 { records.removeFirst(records.count - 200) }
        onRecord?(r)
    }

    private func update(_ seq: Int, _ change: (inout Record) -> Void) {
        guard let i = records.lastIndex(where: { $0.seq == seq }) else { return }
        change(&records[i])
        onRecord?(records[i])
    }

    /// The nonce or message id an intent carries (what a resend would repeat).
    static func key(_ intent: Intent) -> String? {
        let a = intent.arguments
        return a["nonce"]?.string ?? a["id"]?.string ?? a["key"]?.string
    }
}
#endif
