import SwiftUI
import UniformTypeIdentifiers

struct ExerciseEditorCard: View {
    @EnvironmentObject private var store: AppStore
    @Binding var exercise: WorkoutExercise
    var relationshipID: String
    var onMove: (Int) -> Void
    var onDelete: () -> Void
    @State private var importVideo = false
    @State private var replacement = false
    @State private var recordVideo = false
    @State private var lifetime = UUID()
    var body: some View {
        ReppyCard {
            ReppyExerciseHeader(exercise: exercise) { exerciseMenu }
            ReppyExerciseModes(exercise: $exercise)
            ReppyStack(compact: true) {
                SetColumnLabels(loadMode: exercise.loadMode, unit: exercise.unit)
                ForEach($exercise.plannedSets) { $set in
                    PlanSetRow(number: (exercise.plannedSets.firstIndex { $0.id == set.id } ?? 0) + 1, loadMode: exercise.loadMode, unit: exercise.unit, set: $set) { exercise.plannedSets.removeAll { $0.id == set.id } }
                }
            }
            ReppyButton(title: "Добавить подход", icon: "plus", compact: true) {
                let last = exercise.plannedSets.last ?? SetPlan()
                exercise.plannedSets.append(SetPlan(targetReps: last.targetReps, targetWeight: last.targetWeight))
            }
            ReppyDisclosure(title: "Комментарий тренера") {
                ReppyField(title: "Комментарий тренера", text: Binding(get: { exercise.coachNote ?? "" }, set: { exercise.coachNote = $0 }), multiline: true)
            }
            if store.isTrainer {
                ReppyDisclosure(title: "Инструкция и видео") {
                ReppyField(title: "Подробная инструкция", text: Binding(get: { exercise.instructionText ?? "" }, set: { exercise.instructionText = $0 }), multiline: true)
                if let video = exercise.instructionVideo {
                    ReppyCaption(text: video.name)
                    ReppyButton(title: "Удалить видео из инструкции", kind: .danger, compact: true, disabled: store.busy) { exercise.instructionVideo = nil }
                }
                ReppyButton(title: exercise.instructionVideo == nil ? "Добавить видео" : "Заменить видео", icon: "video", compact: true, disabled: store.busy || relationshipID.isEmpty) { importVideo = true }
                if VideoRecorder.available {
                    ReppyButton(title: "Записать видео", icon: "video.badge.plus", compact: true, disabled: store.busy || relationshipID.isEmpty) {
                        Task {
                            if await VideoRecorder.requestAccess() { recordVideo = true }
                            else { store.present(APIError.message("Разреши доступ к камере и микрофону в настройках iPhone, чтобы записать инструкцию.")) }
                        }
                    }
                }
                }.disabled(store.busy)
            }
        }.fileImporter(isPresented: $importVideo, allowedContentTypes: [.movie]) { result in
            let generation = lifetime
            Task { await store.run {
                let video = try await store.uploadVideo(result.get(), relationshipID: relationshipID)
                if generation == lifetime { exercise.instructionVideo = video }
            } }
        }.sheet(isPresented: $replacement) {
            NavigationStack { ExercisePickerScreen { definition in
                var new = WorkoutExercise(definition: definition); new.plannedSets = exercise.plannedSets
                exercise = new; replacement = false
            } }
        }.sheet(isPresented: $recordVideo) {
            VideoRecorder { url in
                recordVideo = false
                let generation = lifetime
                if let url { Task { await store.run {
                    let video = try await store.uploadVideo(url, relationshipID: relationshipID)
                    if generation == lifetime { exercise.instructionVideo = video }
                } } }
            }.ignoresSafeArea()
        }
        .onDisappear { lifetime = UUID() }
    }
    private var exerciseMenu: some View {
        Menu {
            Button("Заменить упражнение", systemImage: "arrow.triangle.2.circlepath") { replacement = true }
            Button("Переместить выше", systemImage: "arrow.up") { onMove(-1) }
            Button("Переместить ниже", systemImage: "arrow.down") { onMove(1) }
            Button("Удалить упражнение", systemImage: "trash", role: .destructive, action: onDelete)
        } label: { ReppyToolbarIcon(icon: "ellipsis") }.disabled(store.busy).accessibilityLabel("Действия с упражнением: \(exercise.name)")
    }
}
