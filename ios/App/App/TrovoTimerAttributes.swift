import Foundation
#if os(iOS)
import ActivityKit

extension Notification.Name {
    static let trovoTimerStart = Notification.Name("TrovoTimerStart")
    static let trovoTimerEnd   = Notification.Name("TrovoTimerEnd")
}

struct TrovoTimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var endDate: Date
        var nextSet: Int
        var totalSets: Int
        // What comes next, already formatted in the user's units by the page
        // ("160 lb × 8", or "Overhead Press · 100 lb × 8" when the next set
        // is another exercise). Pages before 20260923-5 send none.
        var detail: String? = nil
        // When the granted rest began (endDate - total), so the bar drains like
        // the in-app one after +30s / -15s. Shells before build 57 store none.
        var startDate: Date? = nil
    }
    var exerciseName: String
    // The phone's room when the rest began (each rest is a new activity).
    // Pages before 20261001-1 send none: the views fall back to the Home
    // Screen widget's summary theme, then to the Lime room.
    var theme: TimerTheme? = nil
}
#endif

// The room's tokens as the page sends them (THEMES in index.html). Outside the
// iOS guard so the macOS mockup renderer (screenshots/live-activity) compiles it too.
struct TimerTheme: Codable, Hashable {
    var room: String? = nil        // "heavyweight" | "dark"
    var paper: Bool? = nil         // a paper room (Heavyweight)
    var bg: String? = nil          // room background
    var card: String? = nil        // card surface (white in Heavyweight)
    var text: String? = nil        // ink
    var muted: String? = nil
    var accent: String? = nil      // the action colour: blue (Heavyweight) / lime (Lime)
    var onAccent: String? = nil
    var earned: String? = nil      // the earned state: lime
    var earnedInk: String? = nil   // lime's ink on paper
    var satAccent: String? = nil   // the action colour tuned for black (Dynamic Island)
}
