import SwiftUI

struct ReppyResultExerciseCard: View {
    var exercise: WorkoutExercise
    var results: [SetResult]
    var body: some View {
        ReppyCard {
            ReppyExerciseHeader(exercise: exercise) { EmptyView() }
            if let note = exercise.coachNote, !note.isEmpty { ReppyCaption(text: note) }
            let recorded = results.filter { $0.exercise_instance_id == exercise.id }.sorted { $0.set_number < $1.set_number }
            ForEach(recorded) { result in
                ReppyRow {
                    ReppyCaption(text: "Подход \(result.set_number)")
                    Spacer()
                    ReppyText(text: (exercise.loadMode == .external ? "\(result.actual_weight.reppyNumber) кг × " : "") + "\(result.actual_reps) \(exercise.unit)")
                    Image(systemName: result.completed ? "checkmark" : "minus").foregroundStyle(result.completed ? ReppyTheme.lime : ReppyTheme.muted)
                        .accessibilityLabel(result.completed ? "Выполнено" : "Не выполнено")
                }.frame(minHeight: ReppyMetrics.small)
            }
            if recorded.isEmpty { ReppyCaption(text: "Нет записанных подходов") }
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
        return String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }
    var body: some View {
        ReppyCard {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), alignment: .leading), count: typeSize.isAccessibilitySize ? 1 : 3), alignment: .leading, spacing: ReppyMetrics.space16) {
                item("Длительность", elapsed)
                item("Подходы", "\(results.filter(\.completed).count) из \(results.count)")
                item("Упражнения", String(session.workout_snapshot.exercises.count))
            }
            if let completed = session.completed_at { ReppyCaption(text: ReppyDate.display(completed)) }
        }
    }
    private func item(_ title: String, _ value: String) -> some View {
        ReppyStack(compact: true) { ReppyCaption(text: title); ReppyHeading(text: value) }
    }
}
struct ReppySubscriptionEntry: View {
    var entry: SubscriptionEntry
    var balanceAfter: Int
    var body: some View {
        ReppyCard {
            ReppyRow {
                ReppyHeading(text: entry.kind == "payment" ? "Пополнение" : entry.kind == "session-refund" ? "Возврат занятия" : "Занятие списано")
                Spacer()
                ReppyText(text: "\(entry.lesson_delta > 0 ? "+" : "")\(entry.lesson_delta)")
            }
            ReppyCaption(text: ReppyDate.display(entry.occurred_at))
            if entry.kind == "payment" { ReppyCaption(text: "\((entry.amount_rub ?? 0).reppyNumber) ₽ · \(entry.payment_method == "cash" ? "Наличные" : "Перевод")") }
            else if let name = entry.workout_name { ReppyText(text: name, tone: .secondary) }
            if let comment = entry.comment, !comment.isEmpty { ReppyText(text: comment, tone: .secondary) }
            ReppyCaption(text: "Баланс после операции: \(balanceAfter)")
            if entry.kind == "payment" { Label("Изменить пополнение", systemImage: "pencil").reppyTypography(.caption) }
        }.foregroundStyle(ReppyTheme.text)
    }
}

struct ReppyExerciseSectionHeader: View {
    var disabled = false
    var add: () -> Void
    var body: some View {
        HStack(spacing: ReppyMetrics.space12) {
            ReppyHeading(text: "Упражнения").frame(maxWidth: .infinity, alignment: .leading)
            Button(action: add) { ReppyToolbarIcon(icon: "plus") }.buttonStyle(.plain).disabled(disabled).accessibilityLabel("Добавить упражнение")
        }
    }
}

struct ReppyExerciseHeader<Actions: View>: View {
    var exercise: WorkoutExercise
    @ViewBuilder var actions: () -> Actions
    var body: some View {
        VStack(alignment: .leading, spacing: ReppyMetrics.space8) {
            HStack(alignment: .top, spacing: ReppyMetrics.space12) {
                ReppyHeading(text: exercise.name).frame(maxWidth: .infinity, alignment: .leading)
                actions()
            }
            ReppyCaption(text: [exercise.equipment, exercise.loadMode == .bodyweight ? "Свой вес" : "Внешний вес", exercise.measureType == .duration ? "Длительность" : "Повторения"].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
        }
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
    var onInstruction: () -> Void
    var body: some View {
        ReppyCard {
            ReppyExerciseHeader(exercise: exercise) {
                Button(action: onInstruction) { ReppyToolbarIcon(icon: "questionmark.circle") }.buttonStyle(.plain).accessibilityLabel("Инструкция: \(exercise.name)")
            }
            if let note = exercise.coachNote, !note.isEmpty { ReppyText(text: note, tone: .secondary) }
            ReppyStack(compact: true) {
                SetColumnLabels(loadMode: exercise.loadMode, unit: exercise.unit)
                ForEach($results) { $result in
                    if result.exercise_instance_id == exercise.id { ActiveSetRow(exercise: exercise, result: $result, onChange: {}) }
                }
                if !results.contains(where: { $0.exercise_instance_id == exercise.id }) { ReppyCaption(text: "Подходы не заданы") }
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

struct ReppyProfileSegments: View {
    @Binding var selection: String
    var body: some View {
        Picker("Раздел профиля", selection: $selection) { Text("Данные").tag("data"); Text("Прогресс").tag("progress") }.pickerStyle(.segmented).frame(minHeight: ReppyMetrics.small)
    }
}
struct ReppyStudentDetails: View {
    var student: Student
    var body: some View {
        HStack(alignment: .top, spacing: ReppyMetrics.space12) {
            VStack(alignment: .leading, spacing: ReppyMetrics.space6) {
                if let phone = student.phone, !phone.isEmpty { ReppyCaption(text: phone) }
                if let height = student.height_cm { ReppyCaption(text: "Рост: \(height.reppyNumber) см") }
                if let weight = student.weight_kg { ReppyCaption(text: "Вес: \(weight.reppyNumber) кг") }
                if let text = student.contraindications, !text.isEmpty { ReppyCaption(text: "Ограничения: \(text)") }
            }.frame(maxWidth: .infinity, alignment: .leading)
            NavigationLink { StudentFormScreen(student: student) } label: { ReppyToolbarIcon(icon: "pencil") }.buttonStyle(.plain).accessibilityLabel("Изменить личные данные")
        }
    }
}
struct ReppyAgendaLink<Destination: View>: View {
    var title: String
    var subtitle: String
    var completed = false
    var card = true
    @ViewBuilder var destination: () -> Destination
    var body: some View {
        NavigationLink(destination: destination) {
            HStack(spacing: ReppyMetrics.space12) {
                if completed { Image(systemName: "checkmark.circle.fill").foregroundStyle(ReppyTheme.lime).accessibilityLabel("Завершена") }
                VStack(alignment: .leading, spacing: ReppyMetrics.space6) {
                    Text(title).reppyTypography(.heading)
                    Text(subtitle).reppyTypography(.caption).foregroundStyle(ReppyTheme.secondary)
                }.frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").accessibilityHidden(true)
            }.foregroundStyle(ReppyTheme.text).padding(ReppyMetrics.space16).frame(minHeight: ReppyMetrics.control)
                .background(card ? ReppyTheme.surface : ReppyTheme.button, in: RoundedRectangle(cornerRadius: ReppyMetrics.cardRadius))
        }.buttonStyle(.plain)
    }
}
struct ReppyBalanceSummary: View {
    var balance: Int
    var body: some View {
        ReppyCard {
            ReppyCaption(text: "Абонемент")
            ReppyText(text: balance < 0 ? "Долг: \(-balance) занятий" : "Осталось \(balance) занятий", tone: balance <= 0 ? .warning : .normal)
        }
    }
}
struct ExerciseProgressSummary: View {
    @EnvironmentObject private var store: AppStore
    var relationshipID: String
    var hideEmpty = false
    var body: some View {
        let groups = ExerciseProgress.collect(data: store.data, relationshipID: relationshipID)
        if !hideEmpty || !groups.isEmpty {
            ReppyHeading(text: "Прогресс по упражнениям")
            if groups.isEmpty { ReppyEmpty(title: "Пока нет прогресса", message: "Результаты упражнений появятся после первой завершённой тренировки.") }
            ForEach(groups) { group in
                ReppyAgendaLink(title: group.exercise.name, subtitle: summary(group)) { ProgressScreen(relationshipID: relationshipID, exerciseKey: group.id) }
            }
        }
    }
    private func summary(_ group: ProgressGroup) -> String {
        let values = group.points.prefix(2).compactMap { point -> String? in
            let exercise = group.exercise
            let best = point.results.sorted { a, b in
                if exercise.loadMode == .external && exercise.measureType == .reps && a.actual_weight != b.actual_weight { return a.actual_weight > b.actual_weight }
                if a.actual_reps != b.actual_reps { return a.actual_reps > b.actual_reps }
                if exercise.loadMode == .external && a.actual_weight != b.actual_weight { return a.actual_weight > b.actual_weight }
                return a.set_number < b.set_number
            }.first
            guard let best else { return nil }
            return (exercise.loadMode == .external ? "\(best.actual_weight.reppyNumber) кг × " : "") + "\(best.actual_reps) \(exercise.unit)"
        }
        guard let latest = values.first else { return "Нет результатов" }
        return values.count > 1 ? "Было: \(values[1])\nСтало: \(latest)" : latest
    }
}
import AVKit

struct PlanSetRow: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    var number: Int
    var loadMode: LoadMode
    var unit: String
    @Binding var set: SetPlan
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
            Button(action: onDelete) { ReppyToolbarIcon(icon: "minus") }.buttonStyle(.plain).accessibilityLabel("Удалить подход \(number)")
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
            ReppyNumericField(title: "Фактически, \(exercise.unit), подход \(result.set_number)", value: Binding(get: { Double(result.actual_reps) }, set: { result.actual_reps = ReppyValidation.integer($0) }), integer: true)
            Button {
                result.completed.toggle(); UISelectionFeedbackGenerator().selectionChanged(); onChange()
            } label: {
                Image(systemName: result.completed ? "checkmark" : "circle").font(.system(size: 20, weight: .semibold))
                    .frame(width: ReppyMetrics.small, height: ReppyMetrics.small)
                    .foregroundStyle(result.completed ? ReppyTheme.selectedText : ReppyTheme.secondary)
                    .background(result.completed ? ReppyTheme.lime : ReppyTheme.button, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius))
            }.buttonStyle(.plain).accessibilityLabel("Подход \(result.set_number): \(result.completed ? "выполнен" : "не выполнен")")
                .accessibilityHint("\(exercise.name). \(result.completed ? "Снять отметку выполнения." : "Отметить подход выполненным.")")
                .accessibilityAddTraits(result.completed ? .isSelected : [])
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
    @State private var showInstruction = false
    var body: some View {
        ReppyCard {
            ReppyExerciseHeader(exercise: exercise) { EmptyView() }
            if let note = exercise.coachNote, !note.isEmpty { ReppyText(text: note, tone: .secondary) }
            ForEach(Array(exercise.plannedSets.enumerated()), id: \.offset) { index, plan in
                let result = results?.first { $0.exercise_instance_id == exercise.id && $0.set_number == index + 1 }
                HStack {
                    Text("\(index + 1)").frame(width: 24).foregroundStyle(ReppyTheme.secondary)
                    if exercise.loadMode == .external { Text("\((result?.actual_weight ?? plan.targetWeight).reppyNumber) кг").monospacedDigit() }
                    Spacer()
                    Text("\(result?.actual_reps ?? plan.targetReps) \(exercise.unit)").monospacedDigit()
                    if let result { Image(systemName: result.completed ? "checkmark.circle.fill" : "circle").foregroundStyle(result.completed ? ReppyTheme.lime : ReppyTheme.muted).accessibilityLabel(result.completed ? "Выполнено" : "Пропущено") }
                }.font(.system(size: 20)).frame(minHeight: ReppyMetrics.small)
            }
            if exercise.plannedSets.isEmpty { ReppyCaption(text: "Подходы не заданы") }
            ReppyButton(title: "Инструкция", icon: "questionmark.circle", compact: true) { showInstruction = true }
        }.sheet(isPresented: $showInstruction) { NavigationStack { InstructionScreen(exercise: exercise) }.presentationCornerRadius(ReppyMetrics.modalRadius) }
    }
}
struct InstructionScreen: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    var exercise: WorkoutExercise
    @State private var player: AVPlayer?
    @State private var error: String?
    var body: some View {
        ReppyPage(back: true) {
            ReppyTitle(text: exercise.name)
            ReppyCard {
                ReppyText(text: exercise.instructionText?.isEmpty == false ? exercise.instructionText! : "Тренер пока не добавил подробную инструкцию.", tone: .secondary)
                if let player { ReppyVideo(player: player) }
                if let error { ReppyStatus(message: error, error: true) }
                if let video = exercise.instructionVideo {
                    ReppyButton(title: "Открыть видео", icon: "play.circle") {
                        Task { do { player = AVPlayer(url: try await store.videoURL(video)); error = nil } catch { self.error = error.localizedDescription } }
                    }
                }
            }
            ReppyButton(title: "Закрыть", compact: true) { dismiss() }
        }.onDisappear { player?.pause(); player = nil }
    }
}
struct ReppyVideo: View {
    var player: AVPlayer
    var body: some View { VideoPlayer(player: player).aspectRatio(9 / 16, contentMode: .fit).clipShape(RoundedRectangle(cornerRadius: ReppyMetrics.radius)) }
}
