import SwiftUI

struct DashboardScreen: View {
    @EnvironmentObject private var store: AppStore
    @AppStorage("showAllScheduleDays") private var showAllDays = false
    private func upcoming(today: String, horizon: String) -> [Assignment] {
        let activeSessionAssignments = Set(store.data.sessions.map(\.assignment_id))
        let ownRelationshipIDs = store.ownRelationshipIDs
        let isTrainer = store.isTrainer
        return store.data.assignments.filter { assignment in
            (isTrainer || assignment.status == "assigned") && (isTrainer || ownRelationshipIDs.contains(assignment.relationship_id)) &&
            (assignment.scheduled_for >= today || assignment.format == .online || activeSessionAssignments.contains(assignment.id)) && assignment.scheduled_for <= horizon
        }.sorted { ($0.scheduled_for + ($0.scheduled_time ?? "")) < ($1.scheduled_for + ($1.scheduled_time ?? "")) }
    }
    var body: some View {
        ReppyPage(lazyContent: true) {
            let todayDate = Date()
            let today = ReppyDate.day(todayDate)
            let horizon = ReppyDate.day(Calendar.current.date(byAdding: .day, value: 14, to: todayDate)!)
            let upcoming = upcoming(today: today, horizon: horizon)
            let byDay = Dictionary(grouping: upcoming, by: \.scheduled_for)
            if store.isTrainer {
                ForEach(store.data.assignments.filter { $0.reschedule_requested_at != nil }) { assignment in
                    ReppyCard {
                        ReppyHeading(text: "Запрос переноса")
                        ReppyText(text: store.data.student(for: assignment)?.name ?? "Ученик")
                        ReppyCaption(text: "\(ReppyDate.display(assignment.reschedule_scheduled_for ?? "")) · \(String((assignment.reschedule_scheduled_time ?? "").prefix(5)))")
                        ReppyLink(title: assignment.workout_snapshot.name) { AssignmentScreen(assignmentID: assignment.id) }
                    }
                }
                ReppyScheduleHeader(date: todayDate, today: true) { AssignmentEditorScreen() }
                if byDay[today, default: []].isEmpty { ReppyCaption(text: "Тренировок нет") }
                ForEach(byDay[today, default: []]) { AssignmentAgendaRow(assignment: $0, schedule: true) }
                ReppyRow {
                    ReppyStack(compact: true) { ReppyHeading(text: "Дальше"); ReppyCaption(text: "Ближайшие две недели") }
                    ReppyToggle(title: "Все дни", value: $showAllDays)
                }
                if !showAllDays && !upcoming.contains(where: { $0.scheduled_for > today }) {
                    ReppyEmpty(title: "Остальные дни свободны", message: "На ближайшие две недели больше ничего не назначено.", icon: "calendar")
                }
                ForEach(1...14, id: \.self) { offset in
                    let day = Calendar.current.date(byAdding: .day, value: offset, to: todayDate)!
                    let planned = byDay[ReppyDate.day(day), default: []]
                    if showAllDays || !planned.isEmpty {
                        ReppyStack {
                            ReppyScheduleHeader(date: day, actionLabel: "Назначить ученика на \(ReppyDate.display(ReppyDate.day(day)))") { AssignmentEditorScreen(initialDate: day) }
                            ForEach(planned) { AssignmentAgendaRow(assignment: $0, schedule: true) }
                        }
                    }
                }
            } else {
                let studentUpcoming = upcoming.filter { $0.scheduled_for >= today } + upcoming.filter { $0.scheduled_for < today }
                if store.ownRelationshipIDs.count == 1 && !store.ownSubscriptions.isEmpty {
                    NavigationLink { ProfileScreen() } label: { ReppyBalanceSummary(balance: store.ownBalance) }.buttonStyle(.plain).accessibilityLabel("Абонемент: открыть профиль")
                }
                if store.ownRelationshipIDs.count > 1 { ReppyLink(title: "Абонементы по тренерам", icon: "person.2") { ProfileScreen() } }
                if let first = studentUpcoming.first { AssignmentCard(assignment: first, focus: true) }
                else { ReppyEmpty(title: "Две недели свободны", message: "На ближайшие две недели тренер пока ничего не назначил.", icon: "sun.max") }
                ExerciseProgressSummary(relationshipIDs: store.ownRelationshipIDs, hideEmpty: true)
                if studentUpcoming.count > 1 {
                    ReppyHeading(text: "Следующие тренировки")
                    ForEach(Array(studentUpcoming.dropFirst())) { AssignmentAgendaRow(assignment: $0) }
                }
            }
        }.refreshable { await store.reload() }
    }
}
struct AssignmentAgendaRow: View {
    @EnvironmentObject private var store: AppStore
    var assignment: Assignment
    var card = true
    var schedule = false
    var dayContext = false
    private var subtitle: String {
        let when = dayContext ? (assignment.format == .online ? "Онлайн · в удобное время" : String((assignment.scheduled_time ?? "—").prefix(5))) : assignment.scheduleLabel
        return store.isTrainer ? "\(when) · \(assignment.workout_snapshot.name)" : "\(when) · \(store.data.trainerName(for: assignment.relationship_id) ?? "Тренер")"
    }
    var body: some View {
        if schedule {
            ReppyScheduleLink(name: store.data.student(for: assignment)?.name ?? "Ученик", workout: assignment.workout_snapshot.name,
                time: assignment.format == .online ? "Онлайн" : String((assignment.scheduled_time ?? "—").prefix(5)), completed: assignment.status == "completed") {
                destination
            }
        } else {
            ReppyAgendaLink(title: store.isTrainer ? store.data.student(for: assignment)?.name ?? "Ученик" : assignment.workout_snapshot.name,
                subtitle: subtitle, completed: assignment.status == "completed", card: card) {
                destination
            }
        }
    }
    @ViewBuilder private var destination: some View {
        if let session = store.data.session(for: assignment.id), session.completed_at != nil { SessionResultScreen(sessionID: session.id) }
        else { AssignmentScreen(assignmentID: assignment.id) }
    }
}
struct AssignmentCard: View {
    @EnvironmentObject private var store: AppStore
    var assignment: Assignment
    var focus = false
    private var progress: (completed: Int, total: Int)? {
        guard let session = store.data.session(for: assignment.id), session.completed_at == nil else { return nil }
        let results = store.data.sessionResults(session.id)
        return (results.filter(\.completed).count, results.count)
    }
    var body: some View {
        if focus {
        ReppyWorkoutFocus(name: assignment.workout_snapshot.name, schedule: assignment.scheduleLabel + (store.ownRelationshipIDs.count > 1 ? " · \(store.data.trainerName(for: assignment.relationship_id) ?? "Тренер")" : ""),
            preview: assignment.workout_snapshot.exercises.prefix(3).map(\.name).joined(separator: " · "), completed: assignment.status == "completed", progress: progress) {
            if let session = store.data.session(for: assignment.id), session.completed_at != nil { SessionResultScreen(sessionID: session.id) }
            else { AssignmentScreen(assignmentID: assignment.id) }
        }
        } else {
            ReppyCard {
                if store.isTrainer { ReppyCaption(text: store.data.student(for: assignment)?.name ?? "Ученик") }
                ReppyCaption(text: assignment.scheduleLabel)
                ReppyTitle(text: assignment.workout_snapshot.name)
                ReppyText(text: assignment.workout_snapshot.exercises.prefix(3).map(\.name).joined(separator: " · "), tone: .secondary)
                if let progress {
                    ReppyProgressBar(completed: progress.completed, total: progress.total)
                    ReppyCaption(text: "Тренировка начата")
                }
                ReppyLink(title: assignment.status == "completed" ? "Посмотреть результат" : "Посмотреть тренировку", icon: "calendar", kind: .primary) {
                    if let session = store.data.session(for: assignment.id), session.completed_at != nil { SessionResultScreen(sessionID: session.id) }
                    else { AssignmentScreen(assignmentID: assignment.id) }
                }
            }
        }
    }
}
