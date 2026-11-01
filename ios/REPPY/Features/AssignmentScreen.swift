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
        ReppyPage(back: true) {
            if let assignment = store.data.assignments.first(where: { $0.id == assignmentID }) {
                let session = store.data.session(for: assignment.id)
                ReppyCaption(text: store.isTrainer ? "\(store.data.student(for: assignment)?.name ?? "Ученик") · \(assignment.scheduleLabel)" : session?.completed_at == nil && session != nil ? "Незавершённая тренировка" : "Предстоящая тренировка")
                ReppyTitle(text: assignment.workout_snapshot.name)
                if !store.isTrainer { ReppyCaption(text: assignment.scheduleLabel) }
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
                    } else if !store.isTrainer && assignment.format == .inPerson {
                        ReppyButton(title: "Предложить другое время", icon: "calendar", disabled: store.busy) { reschedule.toggle() }
                    }
                    if reschedule {
                        ReppyCard {
                            ReppyDateField(title: "Новая дата", date: $date)
                            ReppyDateField(title: "Новое время", date: $time, time: true)
                            ReppyButton(title: "Отправить тренеру", kind: .primary, disabled: store.busy) {
                                let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "HH:mm"
                                Task { if await store.run({ try await store.requestReschedule(assignment, date: date, time: formatter.string(from: time)) }) { reschedule = false } }
                            }
                        }
                    }
                    if assignment.canStart(as: store.profile?.role ?? .student, sessions: store.data.sessions) {
                        ReppyButton(title: session == nil ? "Начать тренировку" : "Продолжить тренировку", icon: "play", kind: .primary, disabled: store.busy) {
                            Task { if await store.run({ activeID = try await store.startSession(assignment) }) { showActive = true } }
                        }
                    } else { ReppyCaption(text: "Очную тренировку можно начать в назначенный день.") }
                    if store.isTrainer && session == nil { ReppyLink(title: "Редактировать план", icon: "pencil") { AssignmentEditorScreen(original: assignment) } }
                }
                if store.isTrainer { ReppyLink(title: "Повторить на другую дату", icon: "doc.on.doc") { AssignmentEditorScreen(repeatAssignment: assignment) } }
                ReppyHeading(text: "Упражнения")
                if assignment.workout_snapshot.exercises.isEmpty { ReppyEmpty(title: "План пока пуст", message: "Тренер ещё не добавил упражнения.") }
                let progressKeys = Set(ExerciseProgress.collect(data: store.data, relationshipID: assignment.relationship_id).map(\.id))
                ForEach(Array(assignment.workout_snapshot.exercises.enumerated()), id: \.element.id) { index, exercise in
                    ReadOnlyExerciseCard(exercise: exercise, number: index + 1, relationshipID: store.isTrainer && progressKeys.contains(exercise.progressKey) ? assignment.relationship_id : nil)
                }
                if store.isTrainer {
                    ReppyButton(title: "Удалить тренировку", kind: .danger, disabled: store.busy) { confirmDelete = true }
                }
            } else { ReppyEmpty(title: "Тренировка не найдена", message: "Возможно, она была удалена на другом устройстве.") }
        }.navigationDestination(isPresented: $showActive) { if let activeID { ActiveWorkoutScreen(sessionID: activeID) } }
            .confirmationDialog("Удалить тренировку? Если занятие было списано, оно вернётся в абонемент.", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Удалить", role: .destructive) { Task {
                    if let assignment = store.data.assignments.first(where: { $0.id == assignmentID }), await store.run({ try await store.deleteAssignment(assignment) }) { dismiss() }
                } }
                Button("Отмена", role: .cancel) {}
            }
    }
}
