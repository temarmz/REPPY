import SwiftUI

struct StudentAssignmentPickerScreen: View {
    @EnvironmentObject private var store: AppStore
    var relationshipID: String
    var initialDate = Date()
    @State private var search = ""
    private func completed(_ assignment: Assignment) -> Bool { assignment.status == "completed" || store.data.session(for: assignment.id)?.completed_at != nil }
    private var assignments: [Assignment] {
        store.data.assignments.filter { $0.relationship_id == relationshipID }.sorted {
            if completed($0) != completed($1) { return completed($0) }
            return $0.scheduled_for + ($0.scheduled_time ?? "") > $1.scheduled_for + ($1.scheduled_time ?? "")
        }
    }
    private var matches: [Assignment] {
        assignments.filter {
            let workout = completed($0) ? store.data.session(for: $0.id)?.workout_snapshot ?? $0.workout_snapshot : $0.workout_snapshot
            return search.isEmpty || workout.name.localizedCaseInsensitiveContains(search)
        }
    }
    var body: some View {
        ReppyPage(back: true, nativeList: true) {
            if let relationship = store.data.relationships.first(where: { $0.id == relationshipID }), relationship.status == "active",
               let student = store.data.students.first(where: { $0.id == relationship.student_id }) {
                ReppyCaption(text: "\(student.name) · \(ReppyDate.display(ReppyDate.day(initialDate)))")
                ReppyText(text: "Повтори одну из тренировок \(student.name) или собери новую с нуля.", tone: .secondary)
                ReppyLink(title: "Создать тренировку", icon: "plus", kind: .primary) { AssignmentEditorScreen(relationshipID: relationshipID, initialDate: initialDate) }
                if assignments.isEmpty { ReppyEmpty(title: "Предыдущих тренировок нет", message: "Создай первую тренировку для этого ученика — позже её можно будет повторять на новые даты.", icon: "clock.arrow.circlepath") }
                if !assignments.isEmpty && matches.isEmpty { ReppyEmpty(title: "Ничего не найдено", message: "Измени название в поиске.") }
                ForEach(matches) { assignment in
                    let workout = completed(assignment) ? store.data.session(for: assignment.id)?.workout_snapshot ?? assignment.workout_snapshot : assignment.workout_snapshot
                    let status = completed(assignment) ? "Завершена" : assignment.scheduled_for < ReppyDate.day() ? "Не завершена" : "Запланирована"
                    ReppyWorkoutChoiceLink(title: workout.name, subtitle: "\(status) · \(assignment.scheduleLabel) · \(workout.exercises.count) упр.") {
                        AssignmentEditorScreen(relationshipID: relationshipID, initialDate: initialDate, repeatAssignment: assignment)
                    }
                }

            } else { ReppyEmpty(title: "Назначение недоступно", message: "Ученик должен принять приглашение перед назначением тренировки.", icon: "person.2") }
        }.navigationTitle("Выбрать тренировку").navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: "Название тренировки")
    }
}
struct AssignmentDraft: Codable {
    var id = UUID().uuidString.lowercased()
    var relationshipID = ""
    var workout = Workout(name: "")
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
    @State private var initialDraft: AssignmentDraft?
    private var hasChanges: Bool {
        guard let initialDraft else { return false }
        return draft.workout != initialDraft.workout || draft.relationshipID != initialDraft.relationshipID || draft.date != initialDraft.date || draft.time != initialDraft.time || draft.format != initialDraft.format
    }
    @State private var initialized = false
    @State private var picker = false
    @State private var timeDate = Date()
    @State private var reorder = false
    private var draftKey: String { "assignment:\(original?.id ?? (repeatAssignment.map { "repeat:" + $0.id } ?? (relationshipID ?? "new")))" }
    var body: some View {
        ReppyPage(back: true, title: "Тренировка") {
            ReppyCaption(text: original != nil ? "Изменить тренировку" : repeatAssignment != nil ? "Повторить тренировку" : "Создать тренировку")
            ReppyCard {
                if let relationshipID, let relationship = store.data.relationships.first(where: { $0.id == relationshipID }), let student = store.data.students.first(where: { $0.id == relationship.student_id }) {
                    ReppyStudentContext(name: student.name)
                } else {
                ReppyPicker(title: "Ученик", selection: $draft.relationshipID) {
                    Text("Выбери ученика").tag("")
                    ForEach(store.data.relationships.filter { $0.status == "active" }) { relationship in
                        Text(store.data.students.first { $0.id == relationship.student_id }?.name ?? "Ученик").tag(relationship.id)
                    }
                }
                }
                ReppyField(title: "Название тренировки", text: $draft.workout.name)
                ReppyFormatPicker(selection: $draft.format)
                ReppyDateField(title: draft.format == .online ? "Рекомендованная дата" : "Дата", date: $draft.date, compact: true)
                if draft.format == .inPerson { ReppyDateField(title: "Время", date: $timeDate, time: true, compact: true) }
            }
            ReppyExerciseSectionHeader(disabled: store.busy, reorder: draft.workout.exercises.count > 1 ? { reorder = true } : nil) { picker = true }
            if draft.workout.exercises.isEmpty { ReppyEmpty(title: "Упражнения не добавлены", message: "Можно сохранить пустой план и заполнить его позже.") }
            ForEach($draft.workout.exercises) { $exercise in
                ExerciseEditorCard(exercise: $exercise, relationshipID: draft.relationshipID,
                    onDelete: { draft.workout.exercises.removeAll { $0.id == exercise.id } })
            }
        }.reppyFormActions(saveTitle: original == nil ? "Назначить" : "Сохранить", cancelTitle: "Отмена", disabled: draft.relationshipID.isEmpty || draft.workout.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, busy: store.busy, hasChanges: hasChanges, save: {
                Task {
                    if await store.run({
                        try await store.saveAssignment(id: draft.id, relationshipID: draft.relationshipID, workout: draft.workout, date: draft.date,
                            time: draft.time, format: draft.format, original: draft.original, repeatedFrom: draft.repeatedFrom)
                        try DraftStorage.remove(account: store.accountKey, key: draftKey)
                    }) { dismiss() }
                }
            }, discard: {
                do { try DraftStorage.remove(account: store.accountKey, key: draftKey); dismiss() } catch { store.present(error) }
            }).onAppear { initialize() }
            .onChange(of: draft.workout) { _, _ in saveDraft() }.onChange(of: draft.relationshipID) { _, _ in saveDraft() }
            .onChange(of: draft.date) { _, _ in saveDraft() }.onChange(of: draft.format) { _, _ in saveDraft() }
            .onChange(of: timeDate) { _, date in
                let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "HH:mm"
                draft.time = formatter.string(from: date); saveDraft()
            }
            .sheet(isPresented: $reorder) { NavigationStack { ReppyExerciseOrderEditor(exercises: $draft.workout.exercises) } }
            .sheet(isPresented: $picker) { NavigationStack { ExercisePickerScreen(exercises: $draft.workout.exercises) }.presentationCornerRadius(ReppyMetrics.modalRadius) }

    }
    private func initialize() {
        guard !initialized else { return }; initialized = true
        if let source = original ?? repeatAssignment {
            draft.relationshipID = source.relationship_id; draft.format = source.format
            if repeatAssignment != nil, let session = store.data.session(for: source.id), session.completed_at != nil {
                draft.workout = WorkoutExecution.planFromActual(sessionID: session.id, workout: session.workout_snapshot, results: store.data.sessionResults(session.id)).repeated()
            } else { draft.workout = repeatAssignment == nil ? source.workout_snapshot : source.workout_snapshot.repeated() }
            draft.date = repeatAssignment == nil ? ReppyDate.fromDay(source.scheduled_for) : (initialDate ?? Date())
            draft.time = String((source.scheduled_time ?? "18:00").prefix(5)); draft.original = original
            if original != nil { draft.id = source.id }; draft.repeatedFrom = repeatAssignment?.id
        } else { draft.relationshipID = relationshipID ?? ""; draft.date = initialDate ?? Date() }
        if let relationshipID { draft.relationshipID = relationshipID }
        initialDraft = draft
        if let saved: AssignmentDraft = store.restoreDraft(key: draftKey) { draft = saved }
        let parts = draft.time.split(separator: ":").compactMap { Int($0) }
        if parts.count == 2 { timeDate = Calendar.current.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: Date()) ?? Date() }
    }
    private func saveDraft() { guard initialized else { return }; do { try DraftStorage.save(draft, account: store.accountKey, key: draftKey) } catch { store.present(error) } }
}
