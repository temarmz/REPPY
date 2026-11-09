import SwiftUI

struct ExerciseProgressSummary: View {
    @EnvironmentObject private var store: AppStore
    var relationshipID: String? = nil
    var relationshipIDs: Set<String>? = nil
    var hideEmpty = false
    @State private var search = ""
    @State private var muscle = "Все мышцы"
    var body: some View {
        let scope = store.isTrainer ? (relationshipIDs ?? Set(relationshipID.map { [$0] } ?? [])) : store.ownRelationshipIDs
        let groups = store.progressGroups(relationshipIDs: scope)
        if !hideEmpty || !groups.isEmpty {
            ReppyHeading(text: "Прогресс по упражнениям")
            if groups.isEmpty { ReppyEmpty(title: "Пока нет прогресса", message: "Результаты упражнений появятся после первой завершённой тренировки.") }
            if !groups.isEmpty {
                ReppySearch(text: $search)
                ReppyPicker(title: "Мышечная группа", selection: $muscle) {
                    Text("Все мышцы").tag("Все мышцы")
                    ForEach(Array(Set(groups.flatMap { $0.exercise.muscleGroups ?? [$0.exercise.primaryMuscle ?? "Другое"] })).sorted(), id: \.self) { Text($0).tag($0) }
                }
            }
            let visible = groups.filter { group in
                (muscle == "Все мышцы" || (group.exercise.muscleGroups ?? [group.exercise.primaryMuscle ?? "Другое"]).contains(muscle)) &&
                (search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || "\(group.exercise.name) \(group.exercise.equipment ?? "")".localizedCaseInsensitiveContains(search.trimmingCharacters(in: .whitespacesAndNewlines)))
            }
            if !groups.isEmpty && visible.isEmpty { ReppyEmpty(title: "Ничего не найдено", message: "Измени поиск или мышечную группу.") }
            ForEach(visible) { group in
                ReppyProgressComparisonLink(group: group, relationshipIDs: scope)
            }
        }
    }
}
struct ReppyProgressComparisonLink: View {
    var group: ProgressGroup
    var relationshipIDs: Set<String>
    var body: some View {
        NavigationLink {
            ProgressScreen(relationshipIDs: relationshipIDs, exerciseKey: group.id)
        } label: {
            ReppyRow {
                ReppyStack(compact: true) {
                    ReppyHeading(text: group.exercise.name)
                    if let comparison = ProgressComparison(group) {
                        if let previous = comparison.previous { ReppyCaption(text: "Было: \(setLabel(previous))") }
                        ReppyCaption(text: "\(comparison.previous == nil ? "" : "Стало: ")\(setLabel(comparison.latest))")
                        if comparison.previous != nil {
                            Text(changeLabel(comparison)).reppyTypography(.button).foregroundStyle(comparison.trend == .up ? ReppyTheme.trendUp : comparison.trend == .down ? ReppyTheme.trendDown : ReppyTheme.muted)
                        }
                    }
                }
                Image(systemName: "chevron.right").foregroundStyle(ReppyTheme.muted).accessibilityHidden(true)
            }.padding(ReppyMetrics.space16).background(ReppyTheme.surface, in: RoundedRectangle(cornerRadius: ReppyMetrics.cardRadius))
        }.buttonStyle(.plain).accessibilityIdentifier("progress-summary-" + group.id)
    }
    private var unit: String { group.exercise.measureType == .duration ? "сек." : "повт." }
    private func setLabel(_ set: SetResult) -> String {
        (group.exercise.loadMode == .external ? "\(set.actual_weight.reppyNumber) кг × " : "") + "\(set.actual_reps) \(unit)"
    }
    private func signed(_ value: Double) -> String { "\(value > 0 ? "+" : "−")\(abs(value).reppyNumber)" }
    private func changeLabel(_ comparison: ProgressComparison) -> String {
        let weight = comparison.weightChange, amount = comparison.amountChange
        if weight == 0 && amount == 0 { return "Без изменений" }
        if weight != 0 && amount == 0 { return "\(signed(weight)) кг при \(group.exercise.measureType == .duration ? "том же времени" : "тех же повторах")" }
        return [weight != 0 ? "\(signed(weight)) кг" : nil, amount != 0 ? "\(signed(Double(amount))) \(unit)" : nil].compactMap { $0 }.joined(separator: ", ")
    }
}
