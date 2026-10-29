import SwiftUI

struct AssignmentDraft: Codable {
    var id = UUID().uuidString.lowercased()
    var relationshipID = ""
    var workout = Workout()
    var date = Date()
    var time = "18:00"
    var format = TrainingFormat.inPerson
    var original: Assignment?
    var repeatedFrom: String?
}
struct AssignmentEditorScreen: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    var relationshipID: String? = nil
    var initialDate: Date? = nil
    var original: Assignment? = nil
    var repeatAssignment: Assignment? = nil
    @State private var draft = AssignmentDraft()
    @State private var initialized = false
    @State private var picker = false
    @State private var timeDate = Date()
    @State private var confirmCancel = false
    private var draftKey: String { "assignment:\(original?.id ?? (repeatAssignment.map { "repeat:" + $0.id } ?? (relationshipID ?? "new")))" }
    var body: some View {
        ReppyPage(back: true) {
            ReppyTitle(text: original != nil ? "Изменить тренировку" : repeatAssignment != nil ? "Повторить тренировку" : "Новая тренировка")
            ReppyCard {
                ReppyPicker(title: "Ученик", selection: $draft.relationshipID) {
                    Text("Выбери ученика").tag("")
                    ForEach(store.data.relationships) { relationship in
                        Text(store.data.students.first { $0.id == relationship.student_id }?.name ?? "Ученик").tag(relationship.id)
                    }
                }
                ReppyField(title: "Название тренировки", text: $draft.workout.name)
                ReppyPicker(title: "Формат", selection: $draft.format) { ForEach(TrainingFormat.allCases, id: \.self) { Text($0.title).tag($0) } }
                ReppyDateField(title: draft.format == .online ? "Рекомендованная дата" : "Дата", date: $draft.date)
                if draft.format == .inPerson { ReppyDateField(title: "Время", date: $timeDate, time: true) }
            }
            ReppyHeading(text: "Упражнения")
            ReppyButton(title: "Добавить упражнение", icon: "plus", disabled: store.busy) { picker = true }
            if draft.workout.exercises.isEmpty { ReppyEmpty(title: "Упражнения не добавлены", message: "Можно сохранить пустой план и заполнить его позже.") }
            ForEach($draft.workout.exercises) { $exercise in
                ExerciseEditorCard(exercise: $exercise, relationshipID: draft.relationshipID,
                    onMove: { offset in move(exercise.id, by: offset) }, onDelete: { draft.workout.exercises.removeAll { $0.id == exercise.id } })
            }
            ReppyButton(title: store.busy ? "Сохраняем…" : "Сохранить тренировку", kind: .primary, disabled: store.busy || draft.relationshipID.isEmpty) {
                Task {
                    if await store.run({
                        try await store.saveAssignment(id: draft.id, relationshipID: draft.relationshipID, workout: draft.workout, date: draft.date,
                            time: draft.time, format: draft.format, original: draft.original, repeatedFrom: draft.repeatedFrom)
                        try DraftStorage.remove(account: store.accountKey, key: draftKey)
                    }) { dismiss() }
                }
            }
            ReppyButton(title: "Отменить изменения", disabled: store.busy) { confirmCancel = true }
        }.onAppear { initialize() }
            .onChange(of: draft.workout) { _, _ in saveDraft() }.onChange(of: draft.relationshipID) { _, _ in saveDraft() }
            .onChange(of: draft.date) { _, _ in saveDraft() }.onChange(of: draft.format) { _, _ in saveDraft() }
            .onChange(of: timeDate) { _, date in
                let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "HH:mm"
                draft.time = formatter.string(from: date); saveDraft()
            }
            .sheet(isPresented: $picker) { NavigationStack { ExercisePickerScreen { definition in draft.workout.exercises.append(WorkoutExercise(definition: definition)); picker = false } }.presentationCornerRadius(ReppyMetrics.modalRadius) }
            .confirmationDialog("Удалить несохранённые изменения?", isPresented: $confirmCancel, titleVisibility: .visible) {
                Button("Удалить изменения", role: .destructive) { do { try DraftStorage.remove(account: store.accountKey, key: draftKey); dismiss() } catch { store.present(error) } }
                Button("Продолжить редактирование", role: .cancel) {}
            }
    }
    private func initialize() {
        guard !initialized else { return }; initialized = true
        if let saved: AssignmentDraft = store.restoreDraft(key: draftKey) { draft = saved }
        else if let source = original ?? repeatAssignment {
            draft.relationshipID = source.relationship_id; draft.format = source.format
            if repeatAssignment != nil, let session = store.data.session(for: source.id), session.completed_at != nil {
                draft.workout = WorkoutExecution.planFromActual(sessionID: session.id, workout: session.workout_snapshot, results: store.data.sessionResults(session.id)).repeated()
            } else { draft.workout = repeatAssignment == nil ? source.workout_snapshot : source.workout_snapshot.repeated() }
            draft.date = repeatAssignment == nil ? ReppyDate.fromDay(source.scheduled_for) : (initialDate ?? Date())
            draft.time = String((source.scheduled_time ?? "18:00").prefix(5)); draft.original = original
            if original != nil { draft.id = source.id }; draft.repeatedFrom = repeatAssignment?.id
        } else { draft.relationshipID = relationshipID ?? ""; draft.date = initialDate ?? Date() }
        let parts = draft.time.split(separator: ":").compactMap { Int($0) }
        if parts.count == 2 { timeDate = Calendar.current.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: Date()) ?? Date() }
    }
    private func saveDraft() { guard initialized else { return }; do { try DraftStorage.save(draft, account: store.accountKey, key: draftKey) } catch { store.present(error) } }
    private func move(_ id: String, by offset: Int) {
        guard let index = draft.workout.exercises.firstIndex(where: { $0.id == id }), draft.workout.exercises.indices.contains(index + offset) else { return }
        draft.workout.exercises.swapAt(index, index + offset)
    }
}
