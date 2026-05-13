import ActivityKit
import WidgetKit
import SwiftUI

// Accent colour matching the app's lime (#C8FF00 ≈ rgb(0.78, 1.0, 0.0))
private let lime = Color(red: 0.78, green: 1.0, blue: 0.0)

struct TrovoTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TrovoTimerAttributes.self) { context in
            // ── Lock Screen / StandBy banner ─────────────────────────────
            LockScreenView(context: context)
                .activityBackgroundTint(Color.black)
                .activitySystemActionForegroundColor(lime)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded (long-press)
                DynamicIslandExpandedRegion(.leading) {
                    Label {
                        Text("REST")
                            .font(.system(size: 11, weight: .semibold, design: .monospaced))
                            .foregroundColor(.secondary)
                    } icon: {
                        Image(systemName: "dumbbell.fill")
                            .foregroundColor(lime)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(timerInterval: Date.now...context.state.endDate, countsDown: true)
                        .font(.system(size: 22, weight: .bold, design: .monospaced))
                        .foregroundColor(lime)
                        .monospacedDigit()
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.exerciseName)
                        .font(.system(size: 14, weight: .semibold))
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("SET \(context.state.nextSet) OF \(context.state.totalSets)")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundColor(.secondary)
                }
            } compactLeading: {
                Image(systemName: "dumbbell.fill")
                    .foregroundColor(lime)
                    .font(.system(size: 13))
            } compactTrailing: {
                Text(timerInterval: Date.now...context.state.endDate, countsDown: true)
                    .font(.system(size: 13, weight: .bold, design: .monospaced))
                    .foregroundColor(lime)
                    .monospacedDigit()
                    .frame(width: 44)
            } minimal: {
                Text(timerInterval: Date.now...context.state.endDate, countsDown: true)
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundColor(lime)
                    .monospacedDigit()
            }
            .keylineTint(lime)
        }
    }
}

// ── Lock Screen view ─────────────────────────────────────────────────────────

struct LockScreenView: View {
    let context: ActivityViewContext<TrovoTimerAttributes>

    var body: some View {
        HStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("REST TIMER")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundColor(.secondary)
                Text(context.attributes.exerciseName)
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                Text("SET \(context.state.nextSet) OF \(context.state.totalSets)")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundColor(.secondary)
            }
            Spacer()
            Text(timerInterval: Date.now...context.state.endDate, countsDown: true)
                .font(.system(size: 48, weight: .bold, design: .monospaced))
                .foregroundColor(lime)
                .monospacedDigit()
                .minimumScaleFactor(0.6)
                .frame(width: 110, alignment: .trailing)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }
}

// ── Widget bundle entry point ────────────────────────────────────────────────

@main
struct TrovoTimerWidgetBundle: WidgetBundle {
    var body: some Widget {
        TrovoTimerLiveActivity()
    }
}
