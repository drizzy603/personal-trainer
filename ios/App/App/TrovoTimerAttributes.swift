import ActivityKit
import Foundation

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
    }
    var exerciseName: String
}
