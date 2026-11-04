import SwiftUI

struct AssignmentScreen: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    var assignmentID: String
    @State private var activeID: String?
    @State private var showActive = false
    @State private var reschedule = false
    @State private var date = Date()
    @State private var time = Date()
    @State private var confirmDelete = false
    var body: some View {
        ReppyPage(back: true, title: "Тренировка") {
            if let assignment = store.data.assignments.first(where: { $0.id == assignmentID }) {
                let session = store.data.session(for: assignment.id)
                ReppyCaption(text: store.isTrainer ? "\(store.data.student(for: assignment)?.name ?? "Ученик") · \(assignment.statusLabel(sessions: store.data.sessions))" : assignment.statusLabel(sessions: store.data.sessions))
                ReppyTitle(text: assignment.workout_snapshot.name)
                ReppyCaption(text: assignment.scheduleLabel)
                if let session, session.completed_at != nil {
                    ReppyLink(title: "Посмотреть результат", icon: "checkmark.circle") { SessionResultScreen(sessionID: session.id) }
                } else {
                    if store.data.balance(assignment.relationship_id) <= 0 { ReppyStatus(message: "Тренировку можно завершить в долг. Одно занятие спишется как обычно.") }
                    if assignment.reschedule_requested_at != nil {
                        ReppyCard {
                            ReppyHeading(text: "Запрошен перенос")
                            ReppyText(text: "\(ReppyDate.display(assignment.reschedule_scheduled_for ?? "")) · \(String((assignment.reschedule_scheduled_time ?? "").prefix(5)))")
                            if store.isTrainer {
                                ReppyButton(title: "Подтвердить перенос", kind: .primary, disabled: store.busy) { Task { await store.run { try await store.decideReschedule(assignment, accept: true) } } }
                                ReppyButton(title: "Отклонить", disabled: store.busy) { Task { await store.run { try await store.decideReschedule(assignment, accept: false) } } }
                            } else { ReppyCaption(text: "Тренер подтвердит или отклонит новое время.") }
                        }
                    }
                    if assignment.canStart(as: store.profile?.role ?? .student, sessions: store.data.sessions) {
                        ReppyButton(title: session == nil ? "Начать тренировку" : "Продолжить тренировку", icon: "play", kind: .primary, disabled: store.busy) {
                            Task { if await store.run({ activeID = try await store.startSession(assignment) }) { showActive = true } }
                        }
                    } else {
                        ReppyCaption(text: assignment.scheduled_for < ReppyDate.day()
                            ? "Назначенный день уже прошёл. Предложи другое время тренеру."
                            : "Очную тренировку можно начать в назначенный день.")
                    }
                    if !store.isTrainer && assignment.format == .inPerson && assignment.reschedule_requested_at == nil {
                        ReppyButton(title: "Предложить другое время", icon: "calendar", disabled: store.busy) {
                            date = ReppyDate.fromDay(assignment.scheduled_for)
                            let parts = (assignment.scheduled_time ?? "18:00").split(separator: ":").compactMap { Int($0) }
                            time = Calendar.current.date(bySettingHour: parts.first ?? 18, minute: parts.dropFirst().first ?? 0, second: 0, of: date) ?? date
                            reschedule = true
                        }
                    }
                    if store.isTrainer && session == nil { ReppyLink(title: "Редактировать план", icon: "pencil") { AssignmentEditorScreen(original: assignment) } }
                }
                if store.isTrainer { ReppyLink(title: "Повторить на другую дату", icon: "doc.on.doc") { AssignmentEditorScreen(repeatAssignment: assignment) } }
                ReppyHeading(text: "Упражнения")
                if assignment.workout_snapshot.exercises.isEmpty { ReppyEmpty(title: "План пока пуст", message: "Тренер ещё не добавил упражнения.") }
                let progressKeys = Set(store.progressGroups(relationshipIDs: [assignment.relationship_id]).map(\.id))
                ForEach(Array(assignment.workout_snapshot.exercises.enumerated()), id: \.element.id) { index, exercise in
                    ReadOnlyExerciseCard(exercise: exercise, number: index + 1, relationshipID: store.isTrainer && progressKeys.contains(exercise.progressKey) ? assignment.relationship_id : nil)
                }
                if store.isTrainer {
                    ReppyButton(title: "Удалить тренировку", kind: .danger, disabled: store.busy) { confirmDelete = true }
                }
            } else { ReppyEmpty(title: "Тренировка не найдена", message: "Возможно, она была удалена на другом устройстве.") }
        }.navigationDestination(isPresented: $showActive) { if let activeID { ActiveWorkoutScreen(sessionID: activeID) } }
            .sheet(isPresented: $reschedule) {
                NavigationStack {
                    ReppyPage(back: true, title: "Перенос") {
                        ReppyText(text: "Предложи удобные дату и время. Тренер подтвердит перенос.", tone: .secondary)
                        ReppyCard {
                            ReppyDateField(title: "Новая дата", date: $date)
                            ReppyDateField(title: "Новое время", date: $time, time: true)
                        }
                    }.reppyFormActions(saveTitle: "Отправить", saveLabel: "Отправить тренеру", cancelIcon: true, busy: store.busy, hasChanges: false, save: {
                        guard let assignment = store.data.assignments.first(where: { $0.id == assignmentID }) else { return }
                        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "HH:mm"
                        Task { if await store.run({ try await store.requestReschedule(assignment, date: date, time: formatter.string(from: time)) }) { reschedule = false } }
                    }, discard: { reschedule = false })
                }
            }
            .alert("Удалить тренировку?", isPresented: $confirmDelete) {
                Button("Удалить", role: .destructive) { Task {
                    if let assignment = store.data.assignments.first(where: { $0.id == assignmentID }), await store.run({ try await store.deleteAssignment(assignment) }) { dismiss() }
                } }
                Button("Отмена", role: .cancel) {}
            } message: { Text("Если занятие было списано, оно вернётся в абонемент.") }
    }
}
