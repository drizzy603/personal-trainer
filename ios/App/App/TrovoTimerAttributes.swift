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
    }
    var exerciseName: String
}
