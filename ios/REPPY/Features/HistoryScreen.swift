import SwiftUI

struct HistoryScreen: View {
    @EnvironmentObject private var store: AppStore
    var relationshipID: String?
    var back = false
    var body: some View {
        ReppyPage(back: back, lazyContent: true, title: "История тренировок") {
            if store.isTrainer, let relationshipID, let relationship = store.data.relationships.first(where: { $0.id == relationshipID }), let student = store.data.students.first(where: { $0.id == relationship.student_id }) { ReppyCaption(text: student.name) }
            let assignments = store.data.assignments.filter { (store.isTrainer || store.ownRelationshipIDs.contains($0.relationship_id)) && (relationshipID == nil || $0.relationship_id == relationshipID) && store.data.session(for: $0.id)?.completed_at != nil }.sorted { $0.scheduled_for > $1.scheduled_for }
            if assignments.isEmpty { ReppyEmpty(title: "История впереди", message: "Здесь появятся результаты завершённых тренировок.", icon: "clock.arrow.circlepath") }
            ForEach(assignments) { assignment in
                if let session = store.data.session(for: assignment.id) {
                    ReppyAgendaLink(title: session.workout_snapshot.name,
                        subtitle: store.isTrainer && relationshipID == nil ? "\(store.data.student(for: assignment)?.name ?? "Ученик") · \(assignment.scheduleLabel)" : assignment.scheduleLabel, completed: true) { SessionResultScreen(sessionID: session.id) }
                        .accessibilityIdentifier("Посмотреть результат")
                } else { AssignmentCard(assignment: assignment) }
            }
        }.refreshable { await store.reload() }
    }
}
struct ProgressScreen: View {
    @EnvironmentObject private var store: AppStore
    var relationshipID: String? = nil
    var relationshipIDs: Set<String>? = nil
    var exerciseKey: String? = nil
    var body: some View {
        ReppyPage(back: true, lazyContent: exerciseKey == nil, title: exerciseKey == nil ? "Все упражнения" : "Прогресс") {
            let scope = store.isTrainer ? (relationshipIDs ?? Set(relationshipID.map { [$0] } ?? [])) : store.ownRelationshipIDs
            if store.isTrainer, scope.count == 1, let relationship = store.data.relationships.first(where: { scope.contains($0.id) }), let student = store.data.students.first(where: { $0.id == relationship.student_id }) { ReppyCaption(text: student.name) }
            let groups = store.progressGroups(relationshipIDs: scope).filter { exerciseKey == nil || $0.id == exerciseKey }
            if exerciseKey != nil && groups.isEmpty { ReppyEmpty(title: "Пока мало данных", message: "Выполненные подходы появятся здесь после завершения тренировок.", icon: "chart.xyaxis.line") }
            if exerciseKey == nil {
                ExerciseProgressSummary(relationshipIDs: scope, showHeading: false)
            } else {
                ForEach(groups) { group in
                    ReppyCard {
                        ReppyHeading(text: group.exercise.name)
                        ReppyCaption(text: [group.exercise.equipment, group.exercise.loadMode == .bodyweight ? "Свой вес" : "Внешний вес"]
                            .compactMap { $0 }.reduce(into: [String]()) { parts, value in if !parts.contains(value) { parts.append(value) } }.joined(separator: " · "))
                        let points = group.points.filter { $0.date > .distantPast && $0.date <= Date() }
                        ReppyCaption(text: "Всё время · \(points.count) занятий")
                        if points.isEmpty { ReppyCaption(text: "Для этого упражнения пока нет выполненных подходов.") }
                        else {
                            ReppyProgressChart(points: points, metric: "max", unit: group.exercise.loadMode == .external && group.exercise.measureType == .reps ? "кг" : group.exercise.unit)
                        }
                    }
                }
            }
        }
    }
}
