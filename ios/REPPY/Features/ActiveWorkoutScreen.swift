import SwiftUI

struct SessionDraft: Codable {
    var session: WorkoutSession
    var workout: Workout
    var results: [SetResult]
}
struct ActiveWorkoutScreen: View {
    @EnvironmentObject private var store: AppStore
    var sessionID: String
    @State private var draft: SessionDraft?
    @State private var baseResults: [SetResult] = []
    @State private var revision = 0
    @State private var savedRevision = 0
    @State private var saving = false
    @State private var status = "Все изменения сохранены"
    @State private var debounce: Task<Void, Never>?
    @State private var finish = false
    @State private var structure = false
    @State private var charge = true
    @State private var completed = false
    @State private var instruction: WorkoutExercise?
    @State private var confirmReload = false
    @State private var draftAccount = ""
    private var draftKey: String { "active:\(sessionID)" }
    var body: some View {
        ReppyPage(back: true) {
            if let value = draft {
                if let assignment = store.data.assignments.first(where: { $0.id == value.session.assignment_id }) { ReppyCaption(text: "\(store.data.student(for: assignment)?.name ?? "Ученик") · \(assignment.scheduleLabel)") }
                ReppyTitle(text: value.workout.name)
                if store.conflict {
                    ReppyButton(title: "Загрузить актуальную тренировку", icon: "arrow.clockwise", disabled: saving || store.busy) { confirmReload = true }
                }
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    ReppyWorkoutOverview(elapsed: elapsed(from: value.session.started_at, now: context.date), completed: value.results.filter(\.completed).count, total: value.results.count)
                }
                ForEach(Array(value.workout.exercises.enumerated()), id: \.element.id) { index, exercise in
                    ReppyActiveExerciseCard(exercise: exercise, results: Binding(get: { draft?.results ?? [] }, set: { draft?.results = $0 }), number: index + 1) { instruction = exercise }
                }
                ReppyButton(title: "Завершить тренировку", icon: "checkmark", kind: .primary, disabled: saving || store.busy) { finish = true }
            } else { ReppyEmpty(title: "Не удалось открыть тренировку", message: "Вернись к плану и обнови данные.") }
        }.toolbar {
            ToolbarItem(placement: .principal) { ReppyWorkoutSaveState(status: status, saving: saving) }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Сохранить сейчас", systemImage: "arrow.clockwise") { Task { await flush() } }
                    Button("Изменить упражнения и подходы", systemImage: "pencil") { structure = true }
                } label: { ReppyToolbarIcon(icon: "ellipsis") }.disabled(saving || store.busy || draft == nil).accessibilityLabel("Действия тренировки")
            }
        }
            .onAppear { initialize() }
            .onChange(of: draft?.results) { _, _ in changed() }
            .onChange(of: draft?.workout) { old, _ in reconcileResults(previous: old); changed() }
            .onChange(of: store.busy) { _, busy in
                if !busy, !saving, store.error == nil, !store.conflict, revision != savedRevision { Task { await flush() } }
            }
            .onChange(of: store.networkAvailable) { _, available in if available { Task { await flush() } } }
            .onDisappear {
                debounce?.cancel()
                if !completed, revision != savedRevision, !draftAccount.isEmpty, let draft { do { try DraftStorage.save(draft, account: draftAccount, key: draftKey) } catch { store.present(error) } }
            }
            .sheet(isPresented: $finish) {
                NavigationStack {
                    ReppyPage(back: true) {
                        ReppyTitle(text: "Завершить тренировку?")
                        if let draft {
                            ReppyText(text: "Выполнено \(draft.results.filter(\.completed).count) из \(draft.results.count) подходов. Остальные останутся невыполненными.", tone: .secondary)
                        }
                        if store.isTrainer { ReppyToggle(title: "Списать одно занятие", value: $charge) }
                        ReppyButton(title: "Подтвердить завершение", kind: .primary, disabled: saving || store.busy) { Task { await complete(); if completed { finish = false } } }
                        ReppyButton(title: "Продолжить тренировку", disabled: saving || store.busy) { finish = false }
                    }
                }.presentationCornerRadius(ReppyMetrics.modalRadius).interactiveDismissDisabled(saving || store.busy)
            }
            .sheet(item: $instruction) { exercise in NavigationStack { InstructionScreen(exercise: exercise) } }
            .sheet(isPresented: $structure) {
                if draft != nil { NavigationStack { ActiveStructureScreen(workout: Binding(get: { draft!.workout }, set: { draft?.workout = $0 }), relationshipID: relationshipID) } }
            }
            .navigationDestination(isPresented: $completed) { SessionResultScreen(sessionID: sessionID) }
            .confirmationDialog("Изменения тренировки отличаются на двух устройствах. Выбери, какой вариант сохранить.", isPresented: $confirmReload, titleVisibility: .visible) {
                Button("Сохранить мой вариант") { Task {
                    guard let local = draft else { return }
                    await store.reload()
                    guard store.error == nil, let remote = store.data.sessions.first(where: { $0.id == sessionID }), remote.completed_at == nil else { return }
                    baseResults = store.data.sessionResults(sessionID)
                    draft = SessionDraft(session: remote, workout: local.workout, results: local.results)
                    revision += 1; savedRevision = 0
                    await flush()
                } }
                Button("Загрузить данные сервера", role: .destructive) { Task {
                    await store.reload()
                    guard store.error == nil, let session = store.data.sessions.first(where: { $0.id == sessionID }) else { return }
                    draft = SessionDraft(session: session, workout: session.workout_snapshot, results: store.data.sessionResults(sessionID))
                    baseResults = store.data.sessionResults(sessionID)
                    revision = 0; savedRevision = 0; status = "Все изменения сохранены"
                    do { try DraftStorage.remove(account: store.accountKey, key: draftKey) } catch { store.present(error) }
                    if session.completed_at != nil { completed = true }
                } }
                Button("Оставить черновик", role: .cancel) {}
            }
    }
    private var relationshipID: String { store.data.assignments.first { $0.id == draft?.session.assignment_id }?.relationship_id ?? "" }
    private func resultBinding(_ fallback: SetResult) -> Binding<SetResult> {
        Binding(get: { draft?.results.first { $0.id == fallback.id } ?? fallback }, set: { result in
            if let index = draft?.results.firstIndex(where: { $0.id == fallback.id }) { draft?.results[index] = result }
        })
    }
    private func initialize() {
        guard draft == nil, let session = store.data.sessions.first(where: { $0.id == sessionID }) else { return }
        draftAccount = store.accountKey
        if session.completed_at != nil { completed = true; return }
        baseResults = store.data.sessionResults(sessionID)
        if let restored: SessionDraft = store.restoreDraft(key: draftKey) {
            draft = restored; revision = 1; savedRevision = 0
            if restored.session.revision != session.revision { store.present(APIError.conflict); status = "Нужна проверка изменений на другом устройстве" }
            else { status = "Восстановлен несохранённый прогресс" }
        } else { draft = SessionDraft(session: session, workout: session.workout_snapshot, results: store.data.sessionResults(sessionID)); reconcileResults() }
    }
    private func reconcileResults(previous: Workout? = nil) {
        guard let value = draft else { return }
        let next = WorkoutExecution.reconcile(sessionID: sessionID, previous: previous ?? value.session.workout_snapshot, proposed: value.workout, results: value.results)
        if next.workout != value.workout { draft?.workout = next.workout }
        if next.results != value.results { draft?.results = next.results }
    }
    private func changed() {
        guard let draft, draft.session.completed_at == nil, !completed else { return }
        if let saved = store.data.sessions.first(where: { $0.id == sessionID }), draft.workout == saved.workout_snapshot,
           draft.results.sorted(by: { $0.id < $1.id }) == store.data.sessionResults(sessionID).sorted(by: { $0.id < $1.id }) {
            savedRevision = revision; status = "Все изменения сохранены"; return
        }
        revision += 1; status = "Есть несохранённые изменения"
        do { try DraftStorage.save(draft, account: store.accountKey, key: draftKey) } catch { store.present(error) }
        debounce?.cancel()
        debounce = Task { try? await Task.sleep(for: .milliseconds(700)); guard !Task.isCancelled else { return }; await flush() }
    }
    private func flush() async {
        guard let value = draft, !saving, !store.busy, revision != savedRevision else { return }
        guard !store.conflict else { status = "Конфликт изменений"; return }
        saving = true; status = "Сохраняем…"; let version = revision
        let success = await store.run { try await store.saveProgress(value.session, workout: value.workout, results: value.results, baseResults: baseResults) }
        saving = false
        if success, let session = store.data.sessions.first(where: { $0.id == sessionID }) {
            draft?.session = session; savedRevision = version
            if revision == version {
                draft?.workout = session.workout_snapshot
                draft?.results = store.data.sessionResults(sessionID)
                baseResults = store.data.sessionResults(sessionID)
                status = "Все изменения сохранены"
                do { try DraftStorage.remove(account: store.accountKey, key: draftKey) } catch { store.present(error) }
            } else {
                if let draft { do { try DraftStorage.save(draft, account: store.accountKey, key: draftKey) } catch { store.present(error) } }
                await flush()
            }
        } else { status = "Не сохранено · повтори сохранение" }
    }
    private func complete() async {
        await flush()
        guard savedRevision == revision, let session = store.data.sessions.first(where: { $0.id == sessionID }), !saving else { return }
        if await store.run({ try await store.completeSession(session, charge: charge) }) {
            do { try DraftStorage.remove(account: store.accountKey, key: draftKey) } catch { store.present(error) }
            completed = true
        }
    }
    private func elapsed(from: String, now: Date) -> String {
        let seconds = max(0, Int(now.timeIntervalSince(ReppyDate.parse(from) ?? now)))
        return ReppyElapsedTime.label(seconds: seconds)
    }
}
struct ActiveStructureScreen: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @Binding var workout: Workout
    var relationshipID: String
    @State private var picker = false
    @State private var reorder = false
    var body: some View {
        ReppyPage(back: true, title: "План выполнения") {
            ReppyExerciseSectionHeader(reorder: workout.exercises.count > 1 ? { reorder = true } : nil) { picker = true }
            ForEach($workout.exercises) { $exercise in
                ExerciseEditorCard(exercise: $exercise, relationshipID: relationshipID, onDelete: { workout.exercises.removeAll { $0.id == exercise.id } })
            }
        }.reppyFormActions(saveTitle: "Готово", showsCancel: false, hasChanges: false, save: { dismiss() }, discard: {})
        .sheet(isPresented: $reorder) { NavigationStack { ReppyExerciseOrderEditor(exercises: $workout.exercises) } }
        .sheet(isPresented: $picker) { NavigationStack { ExercisePickerScreen { workout.exercises.append(WorkoutExercise(definition: $0)); picker = false } } }
    }
}
