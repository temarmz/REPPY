import SwiftUI
import Charts

struct ReppyProgressChart: View {
    var points: [ProgressPoint]
    var metric: String
    var unit: String
    @State private var selectedDate: Date?
    @State private var selectedID: String?
    private var ordered: [ProgressPoint] { points.sorted { $0.date == $1.date ? $0.id < $1.id : $0.date < $1.date } }
    private var selected: ProgressPoint? { ordered.first { $0.id == selectedID } ?? ordered.last }
    var body: some View {
        Chart(ordered) { point in
            LineMark(x: .value("Дата", point.date), y: .value(unit, metric == "max" ? point.maximum : point.total)).foregroundStyle(ReppyTheme.lime).symbol(.circle)
            if point.id == selected?.id { RuleMark(x: .value("Выбранное занятие", point.date)).foregroundStyle(ReppyTheme.secondary) }
        }.chartYAxisLabel(unit).frame(height: 180)
            .chartXSelection(value: $selectedDate)
            .onChange(of: selectedDate) { _, date in
                if let date { selectedID = ordered.min { abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date)) }?.id }
            }
            .accessibilityLabel("График прогресса, \(unit)")
            .accessibilityValue(points.map { "\(ReppyDate.display(ReppyDate.day($0.date))): \((metric == "max" ? $0.maximum : $0.total).reppyNumber) \(unit)" }.joined(separator: "; "))
        if let selected {
            ReppyRow {
                ReppyButton(title: "Предыдущее занятие", icon: "chevron.left", compact: true, disabled: selected.id == ordered.first?.id) { move(-1) }
                ReppyButton(title: "Следующее занятие", icon: "chevron.right", compact: true, disabled: selected.id == ordered.last?.id) { move(1) }
            }
            ReppyHeading(text: selected.date.formatted(date: .abbreviated, time: .shortened))
            ReppyNumber(value: "\(selected.maximum.reppyNumber) \(unit)")
            ForEach(selected.results.sorted { $0.exercise_instance_id == $1.exercise_instance_id ? $0.set_number < $1.set_number : $0.exercise_instance_id < $1.exercise_instance_id }) { result in
                ReppyText(text: "\(result.set_number). " + (selected.exercise.loadMode == .external ? "\(result.actual_weight.reppyNumber) кг × " : "") + "\(result.actual_reps) \(selected.exercise.unit)")
            }
            let planned = selected.session.workout_snapshot.exercises.filter { $0.progressKey == selected.exercise.progressKey }.reduce(0) { $0 + $1.plannedSets.count }
            if selected.results.count < planned { ReppyCaption(text: "Выполнено \(selected.results.count) из \(planned)") }
            ReppyLink(title: "Открыть тренировку") { SessionResultScreen(sessionID: selected.session.id) }
        }
        if points.count == 1 { ReppyCaption(text: "Для динамики нужно ещё одно занятие.") }
    }
    private func move(_ offset: Int) {
        guard let selected, let index = ordered.firstIndex(where: { $0.id == selected.id }), ordered.indices.contains(index + offset) else { return }
        selectedID = ordered[index + offset].id
    }
}
