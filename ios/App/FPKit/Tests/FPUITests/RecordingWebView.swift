#if os(iOS)
import UIKit
import WebKit

/// A web view that logs every move into or out of a window (contract I1, delta 9 / H-G10: `ShellWebView` is final, so the
/// tests count with their own subclass). The log is the class's, across instances, so one check at the end of a test
/// class still sees a late move; `live` is false only once a test lets the view go on purpose.
final class RecordingWebView: WKWebView {
    struct Move {
        /// The view's `serial`.
        let view: Int
        /// Whether the view goes into a window (false: out of every window).
        let intoWindow: Bool
        /// Whether the test still expected it in its window.
        let live: Bool
        let at: Date
    }

    /// Every move of every RecordingWebView, in order.
    @MainActor static var moves: [Move] = []

    /// While true, a move out of the window is a fault.
    var live = true

    @MainActor private static var serials = 0
    /// This view's number in the log: an ObjectIdentifier can come back for a view made after another one was freed.
    private(set) lazy var serial: Int = {
        Self.serials += 1
        return Self.serials
    }()

    /// Moves out of every window made while the view was live, for all views or for this one.
    @MainActor static func nilMovesWhileLive(of view: RecordingWebView? = nil) -> Int {
        moves.filter { !$0.intoWindow && $0.live && (view == nil || $0.view == view!.serial) }.count
    }

    override func willMove(toWindow newWindow: UIWindow?) {
        Self.moves.append(Move(view: serial, intoWindow: newWindow != nil, live: live, at: Date()))
        super.willMove(toWindow: newWindow)
    }
}
#endif
