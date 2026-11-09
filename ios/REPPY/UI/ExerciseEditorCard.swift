import SwiftUI
import UniformTypeIdentifiers

struct ExerciseEditorCard: View {
    @EnvironmentObject private var store: AppStore
    @Binding var exercise: WorkoutExercise
    var relationshipID: String
    var onDelete: () -> Void
    @State private var instructionOpen = false
    @State private var replacement = false
    var body: some View {
        ReppyCard {
            ReppyExerciseHeader(exercise: exercise) {
                HStack(spacing: ReppyMetrics.space8) {
                    if store.isTrainer {
                        Button { instructionOpen = true } label: { ReppyToolbarIcon(icon: "video") }
                            .accessibilityLabel("Инструкция и видео: \(exercise.name)")
                    }
                    exerciseMenu
                }
            }
            ReppyExerciseModes(exercise: $exercise)
            ReppyStack(compact: true) {
                if !exercise.plannedSets.isEmpty { SetColumnLabels(loadMode: exercise.loadMode, unit: exercise.unit) }
                ForEach($exercise.plannedSets) { $set in
                    PlanSetRow(number: (exercise.plannedSets.firstIndex { $0.id == set.id } ?? 0) + 1, loadMode: exercise.loadMode, unit: exercise.unit, set: $set) { exercise.plannedSets.removeAll { $0.id == set.id } }
                }
            }
            ReppyButton(title: "Добавить подход", icon: "plus", compact: true) {
                exercise.plannedSets.append(SetPlan())
            }
            ReppyDisclosure(title: "Комментарий тренера") {
                ReppyField(title: "Комментарий тренера", text: Binding(get: { exercise.coachNote ?? "" }, set: { exercise.coachNote = $0 }), multiline: true)
            }
        }.sheet(isPresented: $instructionOpen) {
            NavigationStack { InstructionEditorScreen(exercise: $exercise, relationshipID: relationshipID) }.presentationCornerRadius(ReppyMetrics.modalRadius)
        }.sheet(isPresented: $replacement) {
            NavigationStack { ExercisePickerScreen { definition in
                var new = WorkoutExercise(definition: definition); new.plannedSets = exercise.plannedSets
                exercise = new; replacement = false
            } }
        }
    }
    private var exerciseMenu: some View {
        Menu {
            Button("Заменить упражнение", systemImage: "arrow.triangle.2.circlepath") { replacement = true }
            Button("Удалить упражнение", systemImage: "trash", role: .destructive, action: onDelete)
        } label: { ReppyToolbarIcon(icon: "ellipsis") }.disabled(store.busy).accessibilityLabel("Действия с упражнением: \(exercise.name)")
    }
}

struct InstructionEditorScreen: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.presentationMode) private var presentation
    @Binding var exercise: WorkoutExercise
    var relationshipID: String
    @State private var text = ""
    @State private var video: InstructionVideo?
    @State private var pendingURL: URL?
    @State private var pendingSize: Int?
    @State private var initialized = false
    @State private var chooseVideo = false
    @State private var importVideo = false
    @State private var recordVideo = false
    @State private var saving = false
    @State private var error: String?
    @State private var lifetime = UUID()
    private var draftKey: String { "instruction:" + exercise.id }
    var body: some View {
        ReppyPage(back: true, title: "Инструкция") {
            ReppyHeading(text: exercise.name)
            ReppyCard {
                ReppyInstructionMedia(video: video, localURL: pendingURL, localSize: pendingSize, editable: true)
                ReppyButton(title: video == nil && pendingURL == nil ? "Записать или выбрать видео" : "Заменить видео", icon: "video", disabled: saving || relationshipID.isEmpty) { chooseVideo = true }
                if video != nil || pendingURL != nil { ReppyButton(title: "Удалить видео", icon: "trash", kind: .danger, compact: true, disabled: saving) { video = nil; pendingURL = nil; pendingSize = nil; error = nil } }
                ReppyCaption(text: "Короткий ролик: 2–3 повтора, до 100 МБ.")
                ReppyInstructionEquipment(equipment: exercise.equipment)
                ReppyHeading(text: "Как выполнять")
                ReppyField(title: "Подробное описание упражнения", text: $text, multiline: true).disabled(saving)
                ReppyCaption(text: "\(text.count)/1500")
                if let error { ReppyStatus(message: error, error: true) }

            }

        }.reppyFormActions(saveLabel: "Сохранить инструкцию", busy: saving, hasChanges: text != (exercise.instructionText ?? "") || video != exercise.instructionVideo || pendingURL != nil, allowsKeepDraft: pendingURL == nil && video == exercise.instructionVideo, save: { save() }, discard: {
            do { try DraftStorage.remove(account: store.accountKey, key: draftKey); presentation.wrappedValue.dismiss() } catch { self.error = error.localizedDescription }
        }).onAppear {
            guard !initialized else { return }; initialized = true
            let restored: String? = store.restoreDraft(key: draftKey)
            text = restored ?? exercise.instructionText ?? ""; video = exercise.instructionVideo
        }.onChange(of: text) { _, value in
            guard initialized else { return }
            if value.count > 1500 { text = String(value.prefix(1500)) }
            do { try DraftStorage.save(text, account: store.accountKey, key: draftKey) } catch { self.error = error.localizedDescription }
        }.onDisappear { lifetime = UUID(); saving = false }
        .confirmationDialog("Видео упражнения", isPresented: $chooseVideo, titleVisibility: .visible) {
            Button("Выбрать видео из файлов") { importVideo = true }
            if VideoRecorder.available { Button("Записать видео") { Task {
                if await VideoRecorder.requestAccess() { recordVideo = true }
                else { error = "Разреши доступ к камере и микрофону в настройках iPhone, чтобы записать инструкцию." }
            } } }
            Button("Отмена", role: .cancel) {}
        }.fileImporter(isPresented: $importVideo, allowedContentTypes: [.movie]) { result in
            switch result {
            case .success(let url): selectVideo(url)
            case .failure(let failure): if (failure as NSError).code != NSUserCancelledError { error = failure.localizedDescription }
            }
        }.sheet(isPresented: $recordVideo) { VideoRecorder { url in recordVideo = false; if let url { selectVideo(url) } }.ignoresSafeArea() }
    }
    private func selectVideo(_ url: URL) {
        let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
        do {
            let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size > 0, size <= 100 * 1024 * 1024 else { throw APIError.message("Видео должно быть не больше 100 МБ и не быть пустым.") }
            guard ["mov", "mp4", "webm"].contains(url.pathExtension.lowercased()) else { throw APIError.message("Выбери видео MP4, MOV или WebM.") }
            pendingURL = url; pendingSize = size; error = nil
        } catch { self.error = error.localizedDescription }
    }
    private func save() {
        guard !saving else { return }; saving = true; error = nil
        let generation = lifetime, sourceID = exercise.id
        Task {
            do {
                let savedVideo: InstructionVideo?
                if let pendingURL { savedVideo = try await store.uploadVideo(pendingURL, relationshipID: relationshipID) }
                else { savedVideo = video }
                guard generation == lifetime, exercise.id == sourceID else { return }
                video = savedVideo; pendingURL = nil; pendingSize = nil
                try DraftStorage.remove(account: store.accountKey, key: draftKey)
                exercise.instructionText = text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : text.trimmingCharacters(in: .whitespacesAndNewlines)
                exercise.instructionVideo = savedVideo
                presentation.wrappedValue.dismiss()
            } catch { if generation == lifetime { self.error = error.localizedDescription } }
            if generation == lifetime { saving = false }
        }
    }
}

struct ReppyExerciseOrderEditor: View {
    @Binding var exercises: [WorkoutExercise]
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        List {
            ForEach(exercises) { exercise in
                Text(exercise.name).reppyTypography(.heading)
            }.onMove { source, destination in exercises.move(fromOffsets: source, toOffset: destination) }
        }
        .environment(\.editMode, .constant(.active))
        .navigationTitle("Порядок упражнений").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Готово") { dismiss() }.modifier(ReppySecondaryToolbarStyle()) } }
    }
}
