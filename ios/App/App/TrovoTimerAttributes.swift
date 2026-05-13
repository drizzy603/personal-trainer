import ActivityKit
import Foundation

struct TrovoTimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var endDate: Date
        var nextSet: Int
        var totalSets: Int
    }
    var exerciseName: String
}
