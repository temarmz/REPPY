import SwiftUI

struct ExerciseProgressSummary: View {
    @EnvironmentObject private var store: AppStore
    var relationshipID: String? = nil
    var relationshipIDs: Set<String>? = nil
    var hideEmpty = false
    var compact = false
    var showHeading = true
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var search = ""
    @State private var muscle = "Все мышцы"
    var body: some View {
        let scope = store.isTrainer ? (relationshipIDs ?? Set(relationshipID.map { [$0] } ?? [])) : store.ownRelationshipIDs
        let groups = ExerciseProgress.orderedGroups(store.progressGroups(relationshipIDs: scope), prioritizeGains: compact)
        if !hideEmpty || !groups.isEmpty {
            if showHeading { ReppyHeading(text: "Прогресс по упражнениям") }
            if groups.isEmpty { ReppyEmpty(title: "Пока нет прогресса", message: "Результаты упражнений появятся после первой завершённой тренировки.") }
            if compact && !groups.isEmpty {
                let columns = Array(repeating: GridItem(.flexible(), spacing: ReppyMetrics.cardGap), count: typeSize.isAccessibilitySize ? 1 : 2)
                LazyVGrid(columns: columns, alignment: .leading, spacing: ReppyMetrics.cardGap) {
                    ForEach(groups.prefix(6)) { group in
                        ReppyProgressComparisonLink(group: group, relationshipIDs: scope, compact: true)
                    }
                }
                ReppyLink(title: "Все упражнения") { ProgressScreen(relationshipIDs: scope) }
            } else if !groups.isEmpty {
                ReppySearch(text: $search)
                ReppyPicker(title: "Мышечная группа", selection: $muscle) {
                    Text("Все мышцы").tag("Все мышцы")
                    ForEach(Array(Set(groups.flatMap { $0.exercise.muscleGroups ?? [$0.exercise.primaryMuscle ?? "Другое"] })).sorted(), id: \.self) { Text($0).tag($0) }
                }
            }
            let visible = groups.filter { group in
                (muscle == "Все мышцы" || (group.exercise.muscleGroups ?? [group.exercise.primaryMuscle ?? "Другое"]).contains(muscle)) &&
                (search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || "\(group.exercise.name) \(group.exercise.equipment ?? "") \((group.exercise.muscleGroups ?? [group.exercise.primaryMuscle ?? "Другое"]).joined(separator: " "))".localizedCaseInsensitiveContains(search.trimmingCharacters(in: .whitespacesAndNewlines)))
            }
            if !compact && !groups.isEmpty && visible.isEmpty { ReppyEmpty(title: "Ничего не найдено", message: "Измени поиск или мышечную группу.") }
            if !compact {
                ForEach(visible) { group in
                    ReppyProgressComparisonLink(group: group, relationshipIDs: scope)
                }
            }
        }
    }
}
struct ReppyProgressComparisonLink: View {
    var group: ProgressGroup
    var relationshipIDs: Set<String>
    var compact = false
    var body: some View {
        NavigationLink {
            ProgressScreen(relationshipIDs: relationshipIDs, exerciseKey: group.id)
        } label: {
            ReppyRow {
                ReppyStack(compact: true) {
                    ReppyHeading(text: group.exercise.name)
                    if let comparison = ProgressComparison(group) {
                        if !compact, let previous = comparison.previous { ReppyCaption(text: "Было: \(setLabel(previous))") }
                        ReppyCaption(text: "\(compact || comparison.previous == nil ? "" : "Стало: ")\(setLabel(comparison.latest))")
                        if comparison.previous != nil && (!compact || comparison.trend == .up) {
                            Text(changeLabel(comparison)).reppyTypography(.button).foregroundStyle(comparison.trend == .up ? ReppyTheme.trendUp : comparison.trend == .down ? ReppyTheme.trendDown : ReppyTheme.muted)
                        }
                    }
                }
                if !compact { Image(systemName: "chevron.right").foregroundStyle(ReppyTheme.muted).accessibilityHidden(true) }
            }.padding(compact ? ReppyMetrics.space12 : ReppyMetrics.space16).background(ReppyTheme.surface, in: RoundedRectangle(cornerRadius: ReppyMetrics.cardRadius))
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
        if !compact && weight != 0 && amount == 0 { return "\(signed(weight)) кг при \(group.exercise.measureType == .duration ? "том же времени" : "тех же повторах")" }
        return [weight != 0 ? "\(signed(weight)) кг" : nil, amount != 0 ? "\(signed(Double(amount))) \(unit)" : nil].compactMap { $0 }.joined(separator: ", ")
    }
}
