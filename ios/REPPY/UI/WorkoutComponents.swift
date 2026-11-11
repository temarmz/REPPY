import SwiftUI
import AVKit

struct ReppyResultExerciseCard: View {
    var exercise: WorkoutExercise
    var results: [SetResult]
    var number: Int? = nil
    var relationshipID: String? = nil
    var body: some View {
        ReppyCard {
            ReppyExerciseHeader(exercise: exercise, number: number) { EmptyView() }
            if let note = exercise.coachNote, !note.isEmpty { ReppyCaption(text: note) }
            let recorded = results.filter { $0.exercise_instance_id == exercise.id }.sorted { $0.set_number < $1.set_number }
            ForEach(recorded) { result in
                ReppySetSummaryRow(number: result.set_number, value: (exercise.loadMode == .external ? "\(result.actual_weight.reppyNumber) кг × " : "") + "\(result.actual_reps) \(exercise.unit)", completed: result.completed)
            }
            if recorded.isEmpty { ReppyCaption(text: "Нет записанных подходов") }
            if let relationshipID { ReppyLink(title: "Прогресс упражнения", icon: "chart.xyaxis.line") { ProgressScreen(relationshipID: relationshipID, exerciseKey: exercise.progressKey) } }
        }
    }
}

struct ReppySessionSummary: View {
    var session: WorkoutSession
    var results: [SetResult]
    @Environment(\.dynamicTypeSize) private var typeSize
    private var elapsed: String {
        guard let start = ReppyDate.parse(session.started_at), let end = ReppyDate.parse(session.completed_at ?? "") else { return "—" }
        let seconds = max(0, Int(end.timeIntervalSince(start)))
        return ReppyElapsedTime.label(seconds: seconds)
    }
    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), alignment: .leading), count: typeSize.isAccessibilitySize ? 1 : 3), alignment: .leading, spacing: ReppyMetrics.space16) {
            item("Длительность", elapsed)
            item("Подходы", "\(results.count)")
            item("Упражнения", String(session.workout_snapshot.exercises.count))
        }
    }
    private func item(_ title: String, _ value: String) -> some View {
        ReppyStack(compact: true) { ReppyCaption(text: title); ReppyHeading(text: value) }
    }
}
struct ReppyExerciseSectionHeader: View {
    var disabled = false
    var reorder: (() -> Void)? = nil
    var add: () -> Void
    var body: some View {
        HStack(spacing: ReppyMetrics.space12) {
            ReppyHeading(text: "Упражнения").frame(maxWidth: .infinity, alignment: .leading)
            if let reorder { Button(action: reorder) { ReppyToolbarIcon(icon: "arrow.up.arrow.down") }.buttonStyle(.plain).disabled(disabled).accessibilityLabel("Изменить порядок упражнений") }
            Button(action: add) {
                Image(systemName: "plus")
                    .font(.system(size: ReppyMetrics.addExerciseIcon, weight: .medium))
                    .foregroundStyle(disabled ? ReppyTheme.muted : ReppyTheme.selectedText)
                    .frame(width: ReppyMetrics.control, height: ReppyMetrics.control)
                    .background(disabled ? ReppyTheme.button : ReppyTheme.lime, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius))
            }
            .buttonStyle(.plain)
            .disabled(disabled)
            .accessibilityLabel("Добавить упражнение")
        }
    }
}

struct ReppyExerciseQuantityRow: View {
    var name: String
    var equipment: String
    var count: Int
    var onRemove: () -> Void
    var onAdd: () -> Void
    var body: some View {
        HStack(spacing: ReppyMetrics.space12) {
            VStack(alignment: .leading, spacing: ReppyMetrics.space8) {
                Text(name).reppyTypography(.body)
                Text(equipment).reppyTypography(.caption).foregroundStyle(ReppyTheme.secondary)
            }.frame(maxWidth: .infinity, alignment: .leading)
            Button(action: onRemove) { ReppyToolbarIcon(icon: "minus") }.disabled(count == 0).accessibilityLabel("Убрать \(name)")
            Text("\(count)").monospacedDigit().frame(minWidth: ReppyMetrics.quantityWidth).accessibilityLabel("Добавлено: \(count)")
            Button(action: onAdd) { ReppyToolbarIcon(icon: "plus") }.accessibilityLabel("Добавить \(name)")
        }.buttonStyle(.plain).listRowBackground(count > 0 ? ReppyTheme.brandSoft : ReppyTheme.surface)
    }
}

struct ReppyExerciseHeader<Actions: View>: View {
    var exercise: WorkoutExercise
    var number: Int? = nil
    @ViewBuilder var actions: () -> Actions
    var body: some View {
        VStack(alignment: .leading, spacing: ReppyMetrics.space8) {
            HStack(alignment: .top, spacing: ReppyMetrics.space12) {
                if let number { Text(String(format: "%02d", number)).reppyTypography(.caption).foregroundStyle(ReppyTheme.trendUp) }
                ReppyHeading(text: exercise.name).frame(maxWidth: .infinity, alignment: .leading)
                actions()
            }
            ReppyCaption(text: Self.metadata(for: exercise))
        }
    }
    static func metadata(for exercise: WorkoutExercise) -> String {
        var seen = Set<String>()
        return [exercise.primaryMuscle, exercise.equipment, exercise.loadMode == .bodyweight ? "Свой вес" : nil,
                exercise.measureType == .duration ? "Длительность" : nil]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty && seen.insert($0.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)).inserted }
            .joined(separator: " · ")
    }
}
struct ReppyExerciseModes: View {
    @Binding var exercise: WorkoutExercise
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: ReppyMetrics.space8)) : AnyLayout(HStackLayout(spacing: ReppyMetrics.space8))
        layout {
            ReppyPicker(title: "Нагрузка", selection: $exercise.loadMode, compact: true) { Text("Внешний вес").tag(LoadMode.external); Text("Свой вес").tag(LoadMode.bodyweight) }
            ReppyPicker(title: "Измерение", selection: $exercise.measureType, compact: true) { Text("Повторы").tag(MeasureType.reps); Text("Длительность").tag(MeasureType.duration) }
        }
    }
}
struct ReppyDisclosure<Content: View>: View {
    var title: String
    @ViewBuilder var content: () -> Content
    var body: some View {
        DisclosureGroup(title, content: content).tint(ReppyTheme.text)
            .padding(ReppyMetrics.space12).background(ReppyTheme.button, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius))
    }
}
struct ReppyActiveExerciseCard: View {
    var exercise: WorkoutExercise
    @Binding var results: [SetResult]
    var number: Int? = nil
    var onInstruction: () -> Void
    var onAddSet: () -> Void = {}
    var onRemoveSet: () -> Void = {}
    var canRemoveSet = false
    var onMoveUp: () -> Void = {}
    var onMoveDown: () -> Void = {}
    var onEditPlan: () -> Void = {}
    var canMoveUp = false
    var canMoveDown = false
    var onDelete: () -> Void = {}
    var canDelete = true
    var onNoteChange: (String) -> Void = { _ in }
    @State private var commentOpen = false
    var body: some View {
        ReppyCard {
            ReppyExerciseHeader(exercise: exercise, number: number) {
                HStack(spacing: ReppyMetrics.space8) {
                    Button(action: onInstruction) { ReppyToolbarIcon(icon: "questionmark.circle") }.buttonStyle(.plain).accessibilityLabel("Инструкция: \(exercise.name)")
                    Menu {
                        Button("Изменить план и упражнение", systemImage: "pencil", action: onEditPlan)
                        Button("Выше", systemImage: "arrow.up", action: onMoveUp).disabled(!canMoveUp)
                        Button("Ниже", systemImage: "arrow.down", action: onMoveDown).disabled(!canMoveDown)
                        Button("Удалить упражнение", systemImage: "trash", role: .destructive, action: onDelete).disabled(!canDelete)
                    } label: { ReppyToolbarIcon(icon: "ellipsis") }.accessibilityLabel("Действия с упражнением: \(exercise.name)")
                }
            }
            ReppyStack(compact: true) {
                if results.contains(where: { $0.exercise_instance_id == exercise.id }) {
                    SetColumnLabels(loadMode: exercise.loadMode, unit: exercise.unit)
                }
                ForEach($results) { $result in
                    if result.exercise_instance_id == exercise.id { ActiveSetRow(exercise: exercise, result: $result, onChange: {}) }
                }
                if !results.contains(where: { $0.exercise_instance_id == exercise.id }) { ReppyCaption(text: "Подходы не заданы") }
            }
            ReppyExerciseFooter(note: Binding(get: { exercise.coachNote ?? "" }, set: { onNoteChange($0) }), commentOpen: $commentOpen,
                count: exercise.plannedSets.count, canRemove: canRemoveSet, onRemove: onRemoveSet, onAdd: onAddSet)
        }
    }
}

struct ReppyExerciseFooter: View {
    @Binding var note: String
    @Binding var commentOpen: Bool
    var count: Int
    var canRemove: Bool
    var onRemove: () -> Void
    var onAdd: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        ReppyStack(compact: true) {
            if commentOpen { ReppyField(title: "Комментарий к упражнению", text: $note, multiline: true, placeholder: "Например: держи локти вдоль тела") }
            let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: ReppyMetrics.space8)) : AnyLayout(HStackLayout(spacing: ReppyMetrics.space8))
            layout {
                ReppyButton(title: commentOpen ? "Скрыть комментарий" : note.isEmpty ? "Добавить комментарий" : "Показать комментарий", icon: "pencil", compact: true) { commentOpen.toggle() }
                if count == 0 { ReppyButton(title: "Добавить подход", icon: "plus", compact: true, action: onAdd) }
                else {
                    HStack(spacing: ReppyMetrics.space8) {
                        Text("Подходы").reppyTypography(.caption).foregroundStyle(ReppyTheme.secondary)
                        Button(action: onRemove) { ReppyToolbarIcon(icon: "minus") }.buttonStyle(.plain).disabled(!canRemove).accessibilityLabel("Удалить последний подход")
                        Button(action: onAdd) { ReppyToolbarIcon(icon: "plus") }.buttonStyle(.plain).accessibilityLabel("Добавить подход")
                    }.fixedSize(horizontal: true, vertical: false)
                }
            }
        }
    }
}
struct ReppyWorkoutSaveState: View {
    var status: String
    var saving: Bool
    var body: some View {
        HStack(spacing: ReppyMetrics.space8) {
            if saving { ProgressView().controlSize(.small) }
            Text(status).reppyTypography(.caption).foregroundStyle(ReppyTheme.secondary).lineLimit(2)
        }.accessibilityElement(children: .combine).accessibilityLabel("Сохранение тренировки").accessibilityValue(status).accessibilityIdentifier("workout-save-state")
    }
}

struct ReppyWorkoutFocus<Destination: View>: View {
    var name: String
    var schedule: String
    var preview: String
    var completed = false
    var progress: (completed: Int, total: Int)? = nil
    @ViewBuilder var destination: () -> Destination
    @ScaledMetric(relativeTo: .largeTitle) private var titleSize = ReppyMetrics.focusTitleFont
    var body: some View {
        VStack(alignment: .leading, spacing: ReppyMetrics.space16) {
            Text(schedule).reppyTypography(.caption).foregroundStyle(ReppyTheme.focusMeta)
            Spacer(minLength: ReppyMetrics.cardGap)
            Text(name).font(.system(size: titleSize, weight: .bold)).foregroundStyle(ReppyTheme.focusText).fixedSize(horizontal: false, vertical: true).accessibilityAddTraits(.isHeader)
            Text(preview).reppyTypography(.body).foregroundStyle(ReppyTheme.focusSecondary).fixedSize(horizontal: false, vertical: true)
            if progress != nil {
                Text("Тренировка начата").reppyTypography(.caption).foregroundStyle(ReppyTheme.focusSecondary)
            }
            NavigationLink(destination: destination) { Label(completed ? "Посмотреть результат" : "Посмотреть тренировку", systemImage: "calendar") }
                .buttonStyle(ReppyButtonStyle(kind: .primary))
        }.padding(ReppyMetrics.focusInset).frame(maxWidth: .infinity, minHeight: ReppyMetrics.focusMinHeight, alignment: .leading)
            .background(ReppyTheme.focusSurface, in: RoundedRectangle(cornerRadius: ReppyMetrics.cardRadius))
    }
}
struct PlanSetRow: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    var number: Int
    var loadMode: LoadMode
    var unit: String
    @Binding var set: SetPlan
    var showsRemove = true
    var onDelete: () -> Void
    var body: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: ReppyMetrics.space8)) : AnyLayout(HStackLayout(spacing: ReppyMetrics.space8))
        layout {
            Text(typeSize.isAccessibilitySize ? "Подход \(number)" : String(number)).font(.body).frame(width: typeSize.isAccessibilitySize ? nil : 24)
            if loadMode == .external {
                if typeSize.isAccessibilitySize { ReppyCaption(text: "Вес, кг") }
                ReppyNumericField(title: "Вес подхода \(number), кг", value: $set.targetWeight)
            }
            if typeSize.isAccessibilitySize { ReppyCaption(text: unit) }
            ReppyNumericField(title: "Подход \(number), \(unit)", value: Binding(get: { Double(set.targetReps) }, set: { set.targetReps = ReppyValidation.integer($0) }), integer: true)
            if showsRemove { Button(action: onDelete) { ReppyToolbarIcon(icon: "minus") }.buttonStyle(.plain).accessibilityLabel("Удалить подход \(number)") }
        }
    }
}
struct ActiveSetRow: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    var exercise: WorkoutExercise
    @Binding var result: SetResult
    var onChange: () -> Void
    var body: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: ReppyMetrics.space8)) : AnyLayout(HStackLayout(spacing: ReppyMetrics.space8))
        layout {
            Text(typeSize.isAccessibilitySize ? "Подход \(result.set_number)" : String(result.set_number)).font(.body).frame(width: typeSize.isAccessibilitySize ? nil : 24)
            if exercise.loadMode == .external {
                if typeSize.isAccessibilitySize { ReppyCaption(text: "Фактический вес, кг") }
                ReppyNumericField(title: "Фактический вес подхода \(result.set_number), кг", value: $result.actual_weight)
            }
            if typeSize.isAccessibilitySize { ReppyCaption(text: exercise.unit) }
            ReppyNumericField(title: "Фактически, \(exercise.unit), подход \(result.set_number)", value: Binding(get: { Double(result.actual_reps) }, set: { result.actual_reps = ReppyValidation.integer($0); result.completed = false }), integer: true)
        }
    }
}
struct SetColumnLabels: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    var loadMode: LoadMode
    var unit: String
    var body: some View {
        if !typeSize.isAccessibilitySize { HStack(spacing: 8) {
            Text("№").frame(width: 24)
            if loadMode == .external { Text("кг").frame(maxWidth: .infinity) }
            Text(unit).frame(maxWidth: .infinity)
            Color.clear.frame(width: ReppyMetrics.small, height: 1)
        }.font(.subheadline).foregroundStyle(ReppyTheme.secondary).accessibilityHidden(true) }
    }
}
struct ReadOnlyExerciseCard: View {
    var exercise: WorkoutExercise
    var results: [SetResult]? = nil
    var number: Int? = nil
    var relationshipID: String? = nil
    @State private var showInstruction = false
    var body: some View {
        ReppyCard {
            ReppyExerciseHeader(exercise: exercise, number: number) {
                Button { showInstruction = true } label: { ReppyToolbarIcon(icon: "questionmark.circle") }.buttonStyle(.plain).accessibilityLabel("Инструкция: \(exercise.name)")
            }
            if let note = exercise.coachNote, !note.isEmpty { ReppyText(text: note, tone: .secondary) }
            ForEach(Array(exercise.plannedSets.enumerated()), id: \.offset) { index, plan in
                let result = results?.first { $0.exercise_instance_id == exercise.id && $0.set_number == index + 1 }
                ReppySetSummaryRow(number: index + 1, value: (exercise.loadMode == .external ? "\((result?.actual_weight ?? plan.targetWeight).reppyNumber) кг × " : "") + "\(result?.actual_reps ?? plan.targetReps) \(exercise.unit)", completed: result?.completed)
            }
            if exercise.plannedSets.isEmpty { ReppyCaption(text: "Подходы не заданы") }
            if let relationshipID { ReppyLink(title: "Прогресс упражнения", icon: "chart.xyaxis.line") { ProgressScreen(relationshipID: relationshipID, exerciseKey: exercise.progressKey) } }
        }.sheet(isPresented: $showInstruction) { NavigationStack { InstructionScreen(exercise: exercise) }.presentationCornerRadius(ReppyMetrics.modalRadius) }
    }
}
struct ReppySetSummaryRow: View {
    var number: Int
    var value: String
    var completed: Bool? = nil
    var body: some View {
        ReppyRow {
            ReppyCaption(text: "Подход \(number)")
            Spacer(minLength: 0)
            Text(value).reppyTypography(.setNumber).monospacedDigit().fixedSize(horizontal: false, vertical: true)
        }.frame(minHeight: ReppyMetrics.small).accessibilityElement(children: .combine)
    }
}
enum ReppyElapsedTime {
    static func label(seconds: Int) -> String {
        let seconds = max(0, seconds)
        return seconds >= 3600 ? String(format: "%d:%02d:%02d", seconds / 3600, (seconds / 60) % 60, seconds % 60) : String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }
}
struct ReppyWorkoutOverview: View {
    var elapsed: String
    var completed: Int
    var total: Int
    var body: some View {
        ReppyStack(compact: true) {
            ReppyRow {
                Label(elapsed, systemImage: "timer").reppyTypography(.heading).monospacedDigit().accessibilityLabel("Время тренировки: \(elapsed)")
                Spacer(minLength: 0)
            }
        }
    }
}
struct ReppyFeedbackSummary: View {
    var mood: Mood?
    var comment: String?
    var body: some View {
        ReppyCard {
            ReppyCaption(text: "КАК ПРОШЛА ТРЕНИРОВКА")
            if let mood { Label(mood.title, systemImage: "sun.max").reppyTypography(.heading) }
            if let comment, !comment.isEmpty { ReppyText(text: comment, tone: .secondary) }
        }
    }
}
struct ReppyChargeSummary: View {
    var charged: Bool
    var body: some View {
        ReppyCard {
            ReppyRow {
                Image(systemName: charged ? "checkmark" : "minus").foregroundStyle(ReppyTheme.trendUp).accessibilityHidden(true)
                ReppyStack(compact: true) {
                    ReppyCaption(text: "АБОНЕМЕНТ")
                    ReppyText(text: charged ? "Одно занятие списано" : "Занятие не списано")
                }
            }
        }
    }
}
struct InstructionScreen: View {
    @Environment(\.presentationMode) private var presentation
    var exercise: WorkoutExercise
    var body: some View {
        ReppyPage(back: true, title: "Инструкция") {
            ReppyHeading(text: exercise.name)
            ReppyCard {
                ReppyInstructionMedia(video: exercise.instructionVideo)
                ReppyInstructionEquipment(equipment: exercise.equipment)
                ReppyHeading(text: "Как выполнять")
                let instruction = exercise.instructionText?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                ReppyText(text: instruction.isEmpty ? "Подробное описание пока не добавлено. Выполняй движение плавно и остановись при резкой боли." : instruction, tone: instruction.isEmpty ? .secondary : .normal)
            }
        }.reppyDismissAction()
    }
}
struct ReppyInstructionEquipment: View {
    var equipment: String?
    var body: some View {
        if let equipment, !equipment.isEmpty, equipment != "Свой вес" {
            ReppyStack(compact: true) { ReppyCaption(text: "ОБОРУДОВАНИЕ"); ReppyHeading(text: equipment) }
        }
    }
}
struct ReppyInstructionMedia: View {
    @EnvironmentObject private var store: AppStore
    var video: InstructionVideo?
    var localURL: URL? = nil
    var localSize: Int? = nil
    var editable = false
    @State private var player: AVPlayer?
    @State private var observer: NSKeyValueObservation?
    @State private var scopedURL: URL?
    @State private var loading = false
    @State private var error: String?
    @State private var retry = UUID()
    private var requestKey: String { (localURL?.absoluteString ?? video?.id ?? "empty") + retry.uuidString }
    var body: some View {
        ReppyStack(compact: true) {
            if let player, error == nil { ReppyVideo(player: player) }
            else {
                VStack(spacing: ReppyMetrics.space12) {
                    Image(systemName: "figure.strengthtraining.traditional").font(.largeTitle).accessibilityHidden(true)
                    ReppyCaption(text: loading ? "Загружаем видео…" : error != nil ? "Видео недоступно" : editable ? "Видео не добавлено" : "Тренер пока не добавил видео")
                }.frame(maxWidth: .infinity).frame(minHeight: ReppyMetrics.mediaMinHeight).padding(ReppyMetrics.space12)
                    .background(ReppyTheme.field, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius))
            }
            if let video, localURL == nil { ReppyCaption(text: video.name + " · " + Self.fileSize(video.size)) }
            if let localURL { ReppyCaption(text: localURL.lastPathComponent + (localSize.map { " · " + Self.fileSize($0) } ?? "")) }
            if let error { ReppyStatus(message: error, error: true, actionTitle: "Повторить") { retry = UUID() } }
        }.task(id: requestKey) { await load() }.onDisappear { release() }
    }
    static func fileSize(_ bytes: Int) -> String {
        bytes < 1024 * 1024 ? "\(max(1, Int((Double(bytes) / 1024).rounded()))) КБ" : "\((Double(bytes) / (1024 * 1024)).formatted(.number.precision(.fractionLength(0...1)).locale(Locale(identifier: "ru_RU")))) МБ"
    }
    private func release() {
        observer = nil; player?.pause(); player = nil
        scopedURL?.stopAccessingSecurityScopedResource(); scopedURL = nil
    }
    @MainActor private func load() async {
        release(); error = nil; loading = video != nil || localURL != nil
        guard loading else { return }
        do {
            let url: URL
            if let localURL { url = localURL; if url.startAccessingSecurityScopedResource() { scopedURL = url } }
            else if let video { url = try await store.videoURL(video) }
            else { return }
            guard !Task.isCancelled else { return }
            let item = AVPlayerItem(url: url)
            player = AVPlayer(playerItem: item)
            observer = item.observe(\.status, options: [.initial, .new]) { item, _ in
                Task { @MainActor in
                    guard player?.currentItem === item, item.status == .failed else { return }
                    error = "Не удалось открыть видео. Проверь соединение и попробуй ещё раз."
                }
            }
            loading = false
        } catch { if !Task.isCancelled { self.error = error.localizedDescription; loading = false } }
    }
}
struct ReppyVideo: View {
    var player: AVPlayer
    var body: some View { VideoPlayer(player: player).aspectRatio(16 / 9, contentMode: .fit).clipShape(RoundedRectangle(cornerRadius: ReppyMetrics.radius)) }
}

struct ReppyWorkoutChoiceLink<Destination: View>: View {
    var title: String
    var subtitle: String
    @ViewBuilder var destination: () -> Destination
    var body: some View {
        NavigationLink(destination: destination) {
            ReppyStack(compact: true) {
                ReppyHeading(text: title)
                ReppyCaption(text: subtitle)
            }
        }
    }
}

struct ReppyStudentEditButton: View {
    var student: Student
    @State private var editing = false
    var body: some View {
        Button { editing = true } label: { ReppyToolbarIcon(icon: "pencil") }
            .buttonStyle(.plain).accessibilityLabel("Изменить личные данные")
            .sheet(isPresented: $editing) { NavigationStack { StudentFormScreen(student: student) } }
    }
}

struct ReppyChoiceRow: View {
    var title: String
    var subtitle: String
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            ReppyStack(compact: true) {
                ReppyHeading(text: title)
                ReppyCaption(text: subtitle)
            }.frame(minHeight: ReppyMetrics.small).contentShape(Rectangle())
        }.buttonStyle(.plain)
    }
}
