import SwiftUI
import Charts

struct ReppyProgressChart: View {
    var points: [ProgressPoint]
    var metric: String
    var unit: String
    var body: some View {
        Chart(points.sorted { $0.date < $1.date }) { point in
            LineMark(x: .value("Дата", point.date), y: .value(unit, metric == "max" ? point.maximum : point.total)).foregroundStyle(ReppyTheme.lime).symbol(.circle)
        }.chartYAxisLabel(unit).frame(height: 180)
            .accessibilityLabel("График прогресса, \(unit)")
            .accessibilityValue(points.map { "\(ReppyDate.display(ReppyDate.day($0.date))): \((metric == "max" ? $0.maximum : $0.total).reppyNumber) \(unit)" }.joined(separator: "; "))
    }
}
