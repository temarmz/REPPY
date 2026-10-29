import SwiftUI

private struct FeedbackDraft: Codable { var mood: Mood; var comment: String }

struct SessionResultScreen: View {
    @EnvironmentObject private var store: AppStore
    var sessionID: String
    @State private var mood = Mood.good
    @State private var comment = ""
    @State private var initialized = false
    var body: some View {
        ReppyPage(back: true) {
            if let session = store.data.sessions.first(where: { $0.id == sessionID }) {
                ReppyTitle(text: session.workout_snapshot.name, subtitle: "Тренировка завершена")
                let results = store.data.sessionResults(sessionID)
                ReppyCard {
                    ReppyNumber(value: "\(results.filter(\.completed).count) / \(results.count)")
                    ReppyCaption(text: "Выполнено подходов")
                    ReppyText(text: session.charge_status == "charged" ? "Списано одно занятие" : "Без списания занятия", tone: .secondary)
                    if let completed = session.completed_at { ReppyCaption(text: ReppyDate.display(completed)) }
                }
                if !store.isTrainer {
                    ReppyCard {
                        ReppyHeading(text: "Как прошла тренировка?")
                        ReppyPicker(title: "Самочувствие", selection: $mood) { ForEach(Mood.allCases, id: \.self) { Text($0.title).tag($0) } }
                        ReppyField(title: "Комментарий тренеру", text: $comment, multiline: true)
                        ReppyButton(title: "Сохранить обратную связь", kind: .primary, disabled: store.busy) { Task { await store.run {
                            try await store.saveFeedback(session, mood: mood, comment: comment)
                            try DraftStorage.remove(account: store.accountKey, key: "feedback:\(sessionID)")
                        } } }
                    }
                } else {
                    if let mood = session.mood { ReppyCard { ReppyHeading(text: "Самочувствие: \(mood.title)"); ReppyText(text: session.comment ?? "", tone: .secondary) } }
                    if let assignment = store.data.assignments.first(where: { $0.id == session.assignment_id }) {
                        ReppyLink(title: "Повторить на другую дату", icon: "doc.on.doc") { AssignmentEditorScreen(repeatAssignment: assignment) }
                        ReppyLink(title: "Открыть тренировку") { AssignmentScreen(assignmentID: assignment.id) }
                        ReppyLink(title: "Прогресс по упражнениям", icon: "chart.xyaxis.line") { ProgressScreen(relationshipID: assignment.relationship_id) }
                    }
                }
                ForEach(session.workout_snapshot.exercises) { ReadOnlyExerciseCard(exercise: $0, results: results) }
            } else { ReppyEmpty(title: "Результат не найден", message: "Обнови данные и вернись к истории.") }
        }.onAppear {
            guard !initialized else { return }; initialized = true
            if let draft: FeedbackDraft = store.restoreDraft(key: "feedback:\(sessionID)") { mood = draft.mood; comment = draft.comment }
            else if let session = store.data.sessions.first(where: { $0.id == sessionID }) { mood = session.mood ?? .good; comment = session.comment ?? "" }
        }.onChange(of: mood) { _, _ in saveDraft() }.onChange(of: comment) { _, _ in saveDraft() }
    }
    private func saveDraft() {
        guard initialized, !store.isTrainer else { return }
        do { try DraftStorage.save(FeedbackDraft(mood: mood, comment: comment), account: store.accountKey, key: "feedback:\(sessionID)") } catch { store.present(error) }
    }
}
