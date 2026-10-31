import SwiftUI

struct HistoryScreen: View {
    @EnvironmentObject private var store: AppStore
    var relationshipID: String?
    var back = false
    var body: some View {
        ReppyPage(back: back) {
            ReppyTitle(text: "История тренировок")
            let assignments = store.data.assignments.filter { (relationshipID == nil || $0.relationship_id == relationshipID) && $0.status == "completed" }.sorted { $0.scheduled_for > $1.scheduled_for }
            if assignments.isEmpty { ReppyEmpty(title: "История впереди", message: "Здесь появятся результаты завершённых тренировок.", icon: "clock.arrow.circlepath") }
            ForEach(assignments) { AssignmentCard(assignment: $0) }
        }.refreshable { await store.reload() }
    }
}
struct ProgressScreen: View {
    @EnvironmentObject private var store: AppStore
    var relationshipID: String
    var exerciseKey: String? = nil
    var body: some View {
        ReppyPage(back: true) {
            ReppyTitle(text: "Прогресс")
            let groups = ExerciseProgress.collect(data: store.data, relationshipID: relationshipID).filter { exerciseKey == nil || $0.id == exerciseKey }
            if groups.isEmpty { ReppyEmpty(title: "Пока мало данных", message: "Выполненные подходы появятся здесь после завершения тренировок.", icon: "chart.xyaxis.line") }
            ForEach(groups) { group in
                ReppyCard {
                    ReppyHeading(text: group.exercise.name)
                    ReppyCaption(text: "\(group.exercise.equipment ?? "") · \(group.exercise.loadMode == .bodyweight ? "Свой вес" : "Внешний вес")")
                    let points = group.points.filter { $0.date > .distantPast && $0.date <= Date() }
                    ReppyCaption(text: "Всё время · \(points.count) занятий")
                    if points.isEmpty { ReppyCaption(text: "Нет выполнений за выбранный период.") }
                    else {
                        ReppyCaption(text: group.exercise.measureType == .duration ? "Максимальная длительность" : group.exercise.loadMode == .external ? "Максимальный вес" : "Максимум повторений")
                        ReppyProgressChart(points: points, metric: "max", unit: group.exercise.loadMode == .external && group.exercise.measureType == .reps ? "кг" : group.exercise.unit)
                    }
                }
            }
        }
    }
}
