import SwiftUI

private struct FeedbackDraft: Codable { var mood: Mood; var comment: String }

struct SessionResultScreen: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    var sessionID: String
    @State private var mood = Mood.good
    @State private var comment = ""
    @State private var initialized = false
    @State private var feedbackEditing = false
    @State private var confirmDelete = false
    var body: some View {
        ReppyPage(back: true, title: "Результат тренировки") {
            if let session = store.data.sessions.first(where: { $0.id == sessionID }) {
                let assignment = store.data.assignments.first { $0.id == session.assignment_id }
                // Keep the header tied to the scheduled workout day. A session may be
                // completed later when an overdue workout is opened from history.
                let displayDate = assignment?.scheduled_for ?? session.completed_at ?? session.started_at
                let state = session.completed_at == nil ? "Незавершённая тренировка" : "Завершённая тренировка"
                ReppyCaption(text: (store.isTrainer ? "\(assignment.flatMap { store.data.student(for: $0)?.name } ?? "Ученик") · " : "") + state)
                ReppyTitle(text: session.workout_snapshot.name)
                ReppyCaption(text: assignment?.scheduleLabel ?? ReppyDate.display(displayDate))
                let results = store.data.sessionResults(sessionID)
                ReppySessionSummary(session: session, results: results)
                if session.completed_at != nil && !results.contains(where: \.completed) {
                    ReppyCaption(text: "Тренировка завершена без отмеченных подходов.")
                }
                let charged = store.data.isSessionCharged(sessionID)
                if store.isTrainer, charged || session.charge_status == "waived" {
                    ReppyChargeSummary(charged: charged)
                }
                if session.mood != nil || !(session.comment ?? "").isEmpty { ReppyFeedbackSummary(mood: session.mood, comment: session.comment) }
                if !store.isTrainer {
                    ReppyButton(title: session.mood == nil && (session.comment ?? "").isEmpty ? "Как прошла тренировка?" : "Изменить отзыв", icon: "square.and.pencil", compact: true) { feedbackEditing = true }
                } else if let assignment {
                        ReppyLink(title: "Повторить на другую дату", icon: "doc.on.doc") { AssignmentEditorScreen(repeatAssignment: assignment) }
                }
                let progressKeys = Set(assignment.map { store.progressGroups(relationshipIDs: [$0.relationship_id]).map(\.id) } ?? [])
                ForEach(Array(session.workout_snapshot.exercises.enumerated()), id: \.element.id) { index, exercise in
                    ReppyResultExerciseCard(exercise: exercise, results: results, number: index + 1, relationshipID: progressKeys.contains(exercise.progressKey) ? assignment?.relationship_id : nil)
                }
                if store.isTrainer, let assignment {
                    ReppyLink(title: "Открыть тренировку") { AssignmentScreen(assignmentID: assignment.id) }
                    ReppyLink(title: "Прогресс по упражнениям", icon: "chart.xyaxis.line") { ProgressScreen(relationshipID: assignment.relationship_id) }
                    ReppyButton(title: "Удалить тренировку", icon: "trash", kind: .danger, disabled: store.busy) { confirmDelete = true }
                }
            } else { ReppyEmpty(title: "Результат не найден", message: "Обнови данные и вернись к истории.") }
        }.onAppear {
            guard !initialized else { return }; initialized = true
            if let draft: FeedbackDraft = store.restoreDraft(key: "feedback:\(sessionID)") { mood = draft.mood; comment = draft.comment }
            else if let session = store.data.sessions.first(where: { $0.id == sessionID }) { mood = session.mood ?? .good; comment = session.comment ?? "" }
        }.onChange(of: mood) { _, _ in saveDraft() }.onChange(of: comment) { _, _ in saveDraft() }
            .sheet(isPresented: $feedbackEditing) {
                NavigationStack {
                    ReppyPage(back: true, title: "Отзыв") {
                        ReppyPicker(title: "Самочувствие", selection: $mood) { ForEach(Mood.allCases, id: \.self) { Text($0.title).tag($0) } }
                        ReppyField(title: "Комментарий тренеру", text: $comment, multiline: true)

                    }.reppyFormActions(saveLabel: "Сохранить обратную связь", busy: store.busy, hasChanges: mood != (store.data.sessions.first { $0.id == sessionID }?.mood ?? .good) || comment != (store.data.sessions.first { $0.id == sessionID }?.comment ?? ""), save: {Task {
                            guard let session = store.data.sessions.first(where: { $0.id == sessionID }) else { return }
                            if await store.run({
                                try await store.saveFeedback(session, mood: mood, comment: comment)
                                try DraftStorage.remove(account: store.accountKey, key: "feedback:\(sessionID)")
                            }) { feedbackEditing = false }
                        }}, discard: {
                            feedbackEditing = false
                            if let session = store.data.sessions.first(where: { $0.id == sessionID }) { mood = session.mood ?? .good; comment = session.comment ?? "" }
                            do { try DraftStorage.remove(account: store.accountKey, key: "feedback:\(sessionID)") } catch { store.present(error) }})
                }.presentationCornerRadius(ReppyMetrics.modalRadius)
            }
            .confirmationDialog("Удалить завершённую тренировку? Если занятие списано, оно вернётся в абонемент ученика.", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Удалить тренировку", role: .destructive) { Task {
                    guard let assignment = store.data.assignments.first(where: { $0.id == store.data.sessions.first(where: { $0.id == sessionID })?.assignment_id }) else { return }
                    if await store.run({ try await store.deleteAssignment(assignment) }) { dismiss() }
                } }
                Button("Отмена", role: .cancel) {}
            }
    }
    private func saveDraft() {
        guard initialized, !store.isTrainer, feedbackEditing else { return }
        do { try DraftStorage.save(FeedbackDraft(mood: mood, comment: comment), account: store.accountKey, key: "feedback:\(sessionID)") } catch { store.present(error) }
    }
}
