import SwiftUI
import Charts

struct ReppyProgressChart: View {
    var points: [ProgressPoint]
    var metric: String
    var unit: String
    @State private var selectedDate: Date?
    @State private var selectedID: String?
    private let timeline: ProgressTimeline
    private let accessibilitySummary: String
    init(points: [ProgressPoint], metric: String, unit: String) {
        self.points = points; self.metric = metric; self.unit = unit
        let timeline = ProgressTimeline(points: points)
        self.timeline = timeline
        self.accessibilitySummary = timeline.points.map {
            "\($0.date.formatted(date: .abbreviated, time: .omitted)): \((metric == "max" ? $0.maximum : $0.total).reppyNumber) \(unit)"
        }.joined(separator: "; ")
    }
    private var ordered: [ProgressPoint] { timeline.points }
    private var monthly: Bool { timeline.monthly }
    private var showReps: Bool { points.first?.exercise.loadMode == .external && points.first?.exercise.measureType == .reps }
    private var selected: ProgressPoint? { ordered.first { $0.id == selectedID } ?? ordered.last }
    var body: some View {
        let ordered = timeline.points
        let selected = ordered.first { $0.id == selectedID } ?? ordered.last
        if monthly { ReppyCaption(text: "По месяцам · последнее занятие месяца") }
        Chart(ordered) { point in
            LineMark(x: .value("Дата", point.date), y: .value(unit, metric == "max" ? point.maximum : point.total)).foregroundStyle(ReppyTheme.trendUp).symbol(.circle)
            if point.id == selected?.id { RuleMark(x: .value("Выбранное занятие", point.date)).foregroundStyle(ReppyTheme.secondary) }
        }.chartYAxisLabel(unit).frame(height: 180)
            .chartXSelection(value: $selectedDate)
            .onChange(of: selectedDate) { _, date in
                if let date { selectedID = ordered.min { abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date)) }?.id }
            }
            .accessibilityLabel("График прогресса, \(unit)")
            .accessibilityValue(accessibilitySummary)
        if showReps {
            Chart(ordered) { point in
                LineMark(x: .value("Дата", point.date), y: .value("Повторы", point.bestSet?.actual_reps ?? 0))
                    .foregroundStyle(ReppyTheme.trendDown).symbol(.circle)
                if point.id == selected?.id { RuleMark(x: .value("Выбранное занятие", point.date)).foregroundStyle(ReppyTheme.secondary) }
            }.chartYAxisLabel("повт.").frame(height: 120)
                .chartXSelection(value: $selectedDate)
                .accessibilityLabel("Повторы подхода с показанным весом")
        }
        if let selected {
            HStack(spacing: ReppyMetrics.space12) {
                Button { move(-1) } label: { ReppyToolbarIcon(icon: "chevron.left") }
                    .disabled(selected.id == ordered.first?.id).accessibilityLabel("Предыдущее занятие").accessibilityIdentifier("progress-previous-session")
                Text(monthly ? selected.date.formatted(.dateTime.month(.wide).year()) : selected.date.formatted(date: .abbreviated, time: .shortened))
                    .font(.subheadline.weight(.medium)).multilineTextAlignment(.center).frame(maxWidth: .infinity).accessibilityIdentifier("progress-selected-date")
                Button { move(1) } label: { ReppyToolbarIcon(icon: "chevron.right") }
                    .disabled(selected.id == ordered.last?.id).accessibilityLabel("Следующее занятие").accessibilityIdentifier("progress-next-session")
            }.buttonStyle(.plain)
            if monthly { ReppyCaption(text: selected.date.formatted(date: .abbreviated, time: .shortened)) }
            ForEach(selected.results.sorted { $0.exercise_instance_id == $1.exercise_instance_id ? $0.set_number < $1.set_number : $0.exercise_instance_id < $1.exercise_instance_id }) { result in
                ReppyText(text: "\(result.set_number). " + (selected.exercise.loadMode == .external ? "\(result.actual_weight.reppyNumber) кг × " : "") + "\(result.actual_reps) \(selected.exercise.unit)")
            }
            ReppyLink(title: "Открыть тренировку") { SessionResultScreen(sessionID: selected.session.id) }
        }
        if points.count == 1 { ReppyCaption(text: "Для динамики нужно ещё одно занятие.") }
    }
    private func move(_ offset: Int) {
        guard let selected, let index = ordered.firstIndex(where: { $0.id == selected.id }), ordered.indices.contains(index + offset) else { return }
        selectedID = ordered[index + offset].id
    }
}
