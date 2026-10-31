import SwiftUI

struct DashboardScreen: View {
    @EnvironmentObject private var store: AppStore
    @AppStorage("showAllScheduleDays") private var showAllDays = false
    private var upcoming: [Assignment] {
        let today = ReppyDate.day()
        let horizon = ReppyDate.day(Calendar.current.date(byAdding: .day, value: 14, to: Date())!)
        return store.data.assignments.filter { assignment in
            (store.isTrainer || assignment.status == "assigned") && (store.isTrainer || assignment.relationship_id == store.ownRelationship?.id) &&
            (assignment.scheduled_for >= today || assignment.format == .online || store.data.session(for: assignment.id) != nil) && assignment.scheduled_for <= horizon
        }.sorted { ($0.scheduled_for + ($0.scheduled_time ?? "")) < ($1.scheduled_for + ($1.scheduled_time ?? "")) }
    }
    var body: some View {
        ReppyPage {
            if store.isTrainer {
                ForEach(store.data.assignments.filter { $0.reschedule_requested_at != nil }) { assignment in
                    ReppyCard {
                        ReppyHeading(text: "Запрос переноса")
                        ReppyText(text: store.data.student(for: assignment)?.name ?? "Ученик")
                        ReppyCaption(text: "\(ReppyDate.display(assignment.reschedule_scheduled_for ?? "")) · \(String((assignment.reschedule_scheduled_time ?? "").prefix(5)))")
                        ReppyLink(title: assignment.workout_snapshot.name) { AssignmentScreen(assignmentID: assignment.id) }
                    }
                }
                ReppyTitle(text: "Сегодня", subtitle: ReppyDate.display(ReppyDate.day()))
                if !upcoming.contains(where: { $0.scheduled_for == ReppyDate.day() }) { ReppyCaption(text: "Тренировок нет") }
                ForEach(upcoming.filter { $0.scheduled_for == ReppyDate.day() }) { AssignmentAgendaRow(assignment: $0) }
                ReppyLink(title: "Назначить тренировку", icon: "plus") { AssignmentEditorScreen() }
                ReppyTitle(text: "Дальше", subtitle: "Ближайшие две недели")
                ReppyToggle(title: "Все дни", value: $showAllDays)
                if !showAllDays && !upcoming.contains(where: { $0.scheduled_for > ReppyDate.day() }) {
                    ReppyEmpty(title: "Остальные дни свободны", message: "На ближайшие две недели больше ничего не назначено.", icon: "calendar")
                }
                ForEach(1...14, id: \.self) { offset in
                    let day = Calendar.current.date(byAdding: .day, value: offset, to: Date())!
                    let planned = upcoming.filter { $0.scheduled_for == ReppyDate.day(day) }
                    if showAllDays || !planned.isEmpty {
                        ReppyCard {
                            ReppyHeading(text: ReppyDate.display(ReppyDate.day(day)))
                            ForEach(planned) { AssignmentAgendaRow(assignment: $0, card: false) }
                            ReppyLink(title: "Назначить ученика", icon: "plus") { AssignmentEditorScreen(initialDate: day) }
                        }
                    }
                }
            } else {
                if let relationship = store.ownRelationship, store.data.subscriptions.contains(where: { $0.relationship_id == relationship.id }) {
                    ReppyBalanceSummary(balance: store.data.balance(relationship.id))
                }
                if let first = upcoming.first { AssignmentCard(assignment: first) }
                else { ReppyEmpty(title: "Две недели свободны", message: "На ближайшие две недели тренер пока ничего не назначил.", icon: "sun.max") }
                if let relationship = store.ownRelationship { ExerciseProgressSummary(relationshipID: relationship.id, hideEmpty: true) }
                if upcoming.count > 1 {
                    ReppyHeading(text: "Следующие тренировки")
                    ForEach(Array(upcoming.dropFirst())) { AssignmentAgendaRow(assignment: $0) }
                }
            }
        }.refreshable { await store.reload() }
    }
}
struct AssignmentAgendaRow: View {
    @EnvironmentObject private var store: AppStore
    var assignment: Assignment
    var card = true
    var body: some View {
        ReppyAgendaLink(title: store.isTrainer ? store.data.student(for: assignment)?.name ?? "Ученик" : assignment.workout_snapshot.name,
            subtitle: "\(assignment.scheduleLabel) · \(assignment.workout_snapshot.name)", completed: assignment.status == "completed", card: card) {
                if let session = store.data.session(for: assignment.id), session.completed_at != nil { SessionResultScreen(sessionID: session.id) }
                else { AssignmentScreen(assignmentID: assignment.id) }
            }
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
