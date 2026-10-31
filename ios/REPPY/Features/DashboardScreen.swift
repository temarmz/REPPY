import SwiftUI

struct DashboardScreen: View {
    @EnvironmentObject private var store: AppStore
    private var upcoming: [Assignment] {
        let today = ReppyDate.day()
        let horizon = ReppyDate.day(Calendar.current.date(byAdding: .day, value: 14, to: Date())!)
        return store.data.assignments.filter { assignment in
            assignment.status == "assigned" && (store.isTrainer || assignment.relationship_id == store.ownRelationship?.id) &&
            (assignment.scheduled_for >= today || assignment.format == .online || store.data.session(for: assignment.id) != nil) && assignment.scheduled_for <= horizon
        }.sorted { ($0.scheduled_for + ($0.scheduled_time ?? "")) < ($1.scheduled_for + ($1.scheduled_time ?? "")) }
    }
    var body: some View {
        ReppyPage {
            ReppyBrand()
            ReppyTitle(text: store.isTrainer ? "Рабочий день" : "Твои тренировки", subtitle: store.profile?.display_name)
            if store.isDemo { ReppyCaption(text: "Демо · изменения действуют до выхода") }
            if store.isTrainer {
                ReppyRow {
                    ReppyCard { ReppyNumber(value: String(store.data.students.count)); ReppyCaption(text: "учеников") }
                    ReppyCard { ReppyNumber(value: String(upcoming.filter { $0.scheduled_for == ReppyDate.day() }.count)); ReppyCaption(text: "сегодня") }
                }
                ReppyLink(title: "Назначить тренировку", icon: "plus") { AssignmentEditorScreen() }
                ForEach(store.data.assignments.filter { $0.reschedule_requested_at != nil }) { assignment in
                    ReppyCard {
                        ReppyHeading(text: "Запрос переноса")
                        ReppyText(text: store.data.student(for: assignment)?.name ?? "Ученик")
                        ReppyCaption(text: "\(ReppyDate.display(assignment.reschedule_scheduled_for ?? "")) · \(String((assignment.reschedule_scheduled_time ?? "").prefix(5)))")
                        ReppyLink(title: assignment.workout_snapshot.name) { AssignmentScreen(assignmentID: assignment.id) }
                    }
                }
            } else if let relationship = store.ownRelationship { BalanceCard(relationshipID: relationship.id) }
            ReppyHeading(text: store.isTrainer ? "Ближайшие тренировки" : "План на две недели")
            if upcoming.isEmpty { ReppyEmpty(title: "Пока нет тренировок", message: store.isTrainer ? "Назначь первую тренировку ученику." : "Здесь появятся тренировки, которые назначит твой тренер.", icon: "calendar") }
            ForEach(upcoming) { assignment in AssignmentCard(assignment: assignment) }
            if !store.isTrainer, let relationship = store.ownRelationship {
                ReppyLink(title: "История тренировок", icon: "clock.arrow.circlepath") { HistoryScreen(relationshipID: relationship.id, back: true) }
                if !ExerciseProgress.collect(data: store.data, relationshipID: relationship.id).isEmpty {
                    ReppyLink(title: "Прогресс по упражнениям", icon: "chart.xyaxis.line") { ProgressScreen(relationshipID: relationship.id) }
                }
            }
        }.refreshable { await store.reload() }
    }
}
struct AssignmentCard: View {
    @EnvironmentObject private var store: AppStore
    var assignment: Assignment
    var body: some View {
        ReppyCard {
            if store.isTrainer { ReppyCaption(text: store.data.student(for: assignment)?.name ?? "Ученик") }
            ReppyHeading(text: assignment.workout_snapshot.name)
            ReppyCaption(text: assignment.scheduleLabel)
            ReppyText(text: assignment.workout_snapshot.exercises.prefix(3).map(\.name).joined(separator: " · "), tone: .secondary)
            if let session = store.data.session(for: assignment.id), session.completed_at == nil {
                let results = store.data.sessionResults(session.id)
                ReppyProgressBar(completed: results.filter(\.completed).count, total: results.count)
                ReppyCaption(text: "Тренировка начата")
            }
            ReppyLink(title: assignment.status == "completed" ? "Посмотреть результат" : "Открыть тренировку") { AssignmentScreen(assignmentID: assignment.id) }
        }
    }
}
