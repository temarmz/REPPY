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
                ReppyTitle(text: value.workout.name)
                ReppyCaption(text: status)
                if store.conflict {
                    ReppyButton(title: "Загрузить актуальную тренировку", icon: "arrow.clockwise", disabled: saving || store.busy) { confirmReload = true }
                }
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    ReppyText(text: "Время: \(elapsed(from: value.session.started_at, now: context.date))", tone: .secondary)
                }
                let count = value.results.filter(\.completed).count
                ReppyProgressBar(completed: count, total: value.results.count)
                ReppyCaption(text: "Выполнено \(count) из \(value.results.count) подходов")
                ReppyButton(title: "Сохранить сейчас", icon: "arrow.clockwise", compact: true, disabled: saving || store.busy) { Task { await flush() } }
                ReppyButton(title: "Изменить упражнения и подходы", icon: "pencil", compact: true, disabled: saving || store.busy) { structure = true }
                ForEach(value.workout.exercises) { exercise in
                    ReppyCard {
                        ReppyHeading(text: exercise.name)
                        if let note = exercise.coachNote, !note.isEmpty { ReppyText(text: note, tone: .secondary) }
                        ReppyStack(compact: true) {
                            SetColumnLabels(loadMode: exercise.loadMode, unit: exercise.unit)
                            ForEach(value.results.filter { $0.exercise_instance_id == exercise.id }) { result in
                                ActiveSetRow(exercise: exercise, result: resultBinding(result), onChange: {})
                            }
                        }
                        ReppyButton(title: "Инструкция", icon: "questionmark.circle", compact: true) { instruction = exercise }
                    }
                }
                ReppyButton(title: "Завершить тренировку", icon: "checkmark", kind: .primary, disabled: saving || store.busy) { finish = true }
                if finish {
                    ReppyCard {
                        ReppyHeading(text: "Завершить тренировку?")
                        ReppyText(text: "Выполнено \(count) из \(value.results.count) подходов. Остальные останутся невыполненными.", tone: .secondary)
                        if store.isTrainer { ReppyToggle(title: "Списать одно занятие", value: $charge) }
                        ReppyButton(title: "Подтвердить завершение", kind: .primary, disabled: saving || store.busy) { Task { await complete() } }
                        ReppyButton(title: "Продолжить тренировку") { finish = false }
                    }
                }
            } else { ReppyEmpty(title: "Не удалось открыть тренировку", message: "Вернись к плану и обнови данные.") }
        }.onAppear { initialize() }
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
            .sheet(item: $instruction) { exercise in NavigationStack { InstructionScreen(exercise: exercise) } }
            .sheet(isPresented: $structure) {
                if draft != nil { NavigationStack { ActiveStructureScreen(workout: Binding(get: { draft!.workout }, set: { draft?.workout = $0 }), relationshipID: relationshipID) } }
            }
            .navigationDestination(isPresented: $completed) { SessionResultScreen(sessionID: sessionID) }
            .confirmationDialog("Отбросить несохранённые изменения этого iPhone и загрузить данные сервера?", isPresented: $confirmReload, titleVisibility: .visible) {
                Button("Загрузить данные сервера", role: .destructive) { Task {
                    await store.reload()
                    guard store.error == nil, let session = store.data.sessions.first(where: { $0.id == sessionID }) else { return }
                    draft = SessionDraft(session: session, workout: session.workout_snapshot, results: store.data.sessionResults(sessionID))
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
        let success = await store.run { try await store.saveProgress(value.session, workout: value.workout, results: value.results) }
        saving = false
        if success, let session = store.data.sessions.first(where: { $0.id == sessionID }) {
            draft?.session = session; savedRevision = version
            if revision == version {
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
        return String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }
}
struct ActiveStructureScreen: View {
    @EnvironmentObject private var store: AppStore
    @Binding var workout: Workout
    var relationshipID: String
    @State private var picker = false
    var body: some View {
        ReppyPage(back: true) {
            ReppyTitle(text: "План выполнения")
            ReppyButton(title: "Добавить упражнение", icon: "plus") { picker = true }
            ForEach($workout.exercises) { $exercise in
                ExerciseEditorCard(exercise: $exercise, relationshipID: relationshipID, onMove: { offset in
                    if let index = workout.exercises.firstIndex(where: { $0.id == exercise.id }), workout.exercises.indices.contains(index + offset) { workout.exercises.swapAt(index, index + offset) }
                }, onDelete: { workout.exercises.removeAll { $0.id == exercise.id } })
            }
        }.sheet(isPresented: $picker) { NavigationStack { ExercisePickerScreen { workout.exercises.append(WorkoutExercise(definition: $0)); picker = false } } }
    }
}
