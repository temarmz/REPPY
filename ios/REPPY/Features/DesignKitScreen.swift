import SwiftUI

struct DesignKitScreen: View {
    @State private var text = "Длинное название упражнения для проверки переноса"
    @State private var number = 75.25
    @State private var toggle = true
    @State private var date = Date()
    @State private var modal = false
    @State private var orderOpen = false
    @State private var orderedExercises: [WorkoutExercise] = []
    @State private var profileSection = "data"
    @State private var sampleExercise: WorkoutExercise?
    @State private var sampleResults: [SetResult] = []
    @EnvironmentObject private var store: AppStore
    var body: some View {
        ReppyPage(back: true, title: "Дизайн-кит") {
            ReppyCaption(text: "Общие компоненты iPhone")
            ReppyCard {
                ReppyHeading(text: "Основа дизайн-системы")
                ReppyCaption(text: "Контролы 44 / 48 / 56 · карточки 20 · интервал 24")
                ReppyText(text: "Системный шрифт iOS поддерживает Dynamic Type. Цвета и геометрия синхронизируются с вебом.")
                ReppyField(title: "Поле с ошибкой", text: $text, error: "Проверь введённое значение")
                ReppyField(title: "Недоступное поле", text: $text).disabled(true)
                ReppyButton(title: "Компактное действие", compact: true) {}
            }
            ReppyAppearancePicker(selection: .constant("system"))
            ReppyTelegramStatus()
            ReppyDiagnosticExport()
            ReppyAuthIntro()
            ReppyNotesHeader(date: date, onToday: {}, onPrevious: {}, onNext: {}, onCalendar: {})
            ReppyInstructionMedia(video: nil, editable: true)
            ReppyInstructionEquipment(equipment: "Гантели")
            ReppyLedgerSummary(balance: 11, hasEntries: true) { ReppyButton(title: "Добавить пополнение", kind: .primary) {} }
            ReppyPaymentMethodPicker(selection: .constant("cash"))
            ReppyConnectedList(items: Array(store.data.subscriptions.prefix(3))) { ReppySubscriptionEntry(entry: $0, balanceAfter: 11, card: false) }
            ReppyInvitationReady(name: "Демо ученик", link: "https://demo.reppy.invalid/invite/example", expiresAt: nil, demo: true) {}
            ReppyWorkoutOverview(elapsed: "1:02:03", completed: 3, total: 12)
            ReppySetSummaryRow(number: 1, value: "80 кг × 10 повт.", completed: true)
            ReppySetSummaryRow(number: 2, value: "45 сек.", completed: false)
            ReppyFeedbackSummary(mood: .great, comment: "Длинный отзыв ученика о прошедшей тренировке.")
            ReppyChargeSummary(charged: true)
            ReppyChargeSummary(charged: false)
            ReppyStudentLink(name: "Мария с длинным именем", status: "Сегодня · 18:00 · Длинное название тренировки", balance: 0, hasSubscription: false) { ReppyText(text: "Профиль ученика") }
            ReppyStudentContext(name: "Мария А.")
            ReppyFormatPicker(selection: .constant(.inPerson))
            ReppySubscriptionSummary(balance: 3, entries: store.data.subscriptions, trainer: true, relationshipID: store.data.relationships.first?.id)
            ReppyProfileIdentity(name: "Александр с длинным именем", role: "Тренер")
            if let student = store.data.students.first { ReppyProfileIdentity(name: student.name, role: "Ученик", student: student) }
            ReppyWorkoutFocus(name: "Длинное название ближайшей тренировки", schedule: "Сегодня · 19:30", preview: "Жим лёжа · Приседания", progress: (1, 6)) { ReppyText(text: "Тренировка") }
            ReppySubscriptionSummary(balance: -2, entries: store.data.subscriptions)
            ReppySubscriptionSummary(balance: 0, entries: [])
            if let relationship = store.data.relationships.first, let group = store.progressGroups(relationshipIDs: [relationship.id]).first {
                ReppyProgressComparisonLink(group: group, relationshipIDs: [relationship.id])
            }
            ReppyScheduleHeader(date: Date(), today: true) { ReppyText(text: "Назначение") }
            ReppyScheduleHeader(date: Date()) { ReppyText(text: "Назначение") }
            ReppyScheduleLink(name: "Мария А.", workout: "Длинное название тренировки", time: "18:00", completed: true) { ReppyText(text: "Результат") }
            ReppyLink(title: "Посмотреть тренировку", icon: "calendar", kind: .primary) { ReppyText(text: "Тренировка") }
            if let session = store.data.sessions.first {
                ReppySessionSummary(session: session, results: store.data.sessionResults(session.id))
                if let exercise = session.workout_snapshot.exercises.first { ReppyResultExerciseCard(exercise: exercise, results: store.data.sessionResults(session.id)) }
            }
            if let entry = store.data.subscriptions.first { ReppySubscriptionEntry(entry: entry, balanceAfter: 3) }
            if let relationship = store.data.relationships.first, let group = store.progressGroups(relationshipIDs: [relationship.id]).first {
                ReppyCard { ReppyProgressChart(points: group.points, metric: "max", unit: group.exercise.loadMode == .external && group.exercise.measureType == .reps ? "кг" : group.exercise.unit) }
            }
            ReppyWorkoutSaveState(status: "Все изменения сохранены", saving: false)
            ReppyWorkoutSaveState(status: "Сохраняем…", saving: true)
            ReppyExerciseSectionHeader {}.onAppear {
                guard sampleExercise == nil, var exercise = store.data.assignments.first?.workout_snapshot.exercises.first else { return }
                exercise.plannedSets = [SetPlan(targetReps: 8, targetWeight: 75.25), SetPlan(targetReps: 10, targetWeight: 70)]
                sampleExercise = exercise
                sampleResults = exercise.plannedSets.enumerated().map { index, plan in
                    SetResult(session_id: "design-kit", exercise_instance_id: exercise.id, set_number: index + 1, actual_reps: plan.targetReps, actual_weight: plan.targetWeight, completed: index == 0)
                }
            }
            if let exercise = sampleExercise {
                ExerciseEditorCard(exercise: Binding(get: { sampleExercise ?? exercise }, set: { sampleExercise = $0 }), relationshipID: "", onDelete: { sampleExercise = nil })
                ReppyActiveExerciseCard(exercise: exercise, results: $sampleResults) { modal = true }
            }
            ReppyBalanceSummary(balance: 3)
            ReppyProfileSegments(selection: $profileSection)
            ReppyAgendaLink(title: "Длинное название тренировки для проверки переноса", subtitle: "Сегодня · 18:00", completed: true) { ReppyText(text: "Пример перехода") }
            if let student = store.data.students.first { ReppyStudentDetails(student: student); ReppyStudentEditButton(student: student) }
            if let relationship = store.data.relationships.first { ExerciseProgressSummary(relationshipID: relationship.id) }
            ReppyRow { ReppyHeaderBrand(); ReppyToolbarIcon(icon: "person.crop.circle") }
            ReppyCard {
                ReppyHeading(text: "Типографика и данные")
                ReppyText(text: text); ReppyCaption(text: "Вторичный текст"); ReppyNumber(value: "75,25")
                ReppyField(title: "Поле", text: $text)
                ReppyNumericField(title: "Вес", value: $number)
                ReppyToggle(title: "Выбор", value: $toggle)
                ReppyDateField(title: "Дата", date: $date)
                ReppyButton(title: "Основное действие", kind: .primary) {}
                ReppyButton(title: "Вторичное действие") {}
                ReppyButton(title: "Опасное действие", kind: .danger) {}
                ReppyButton(title: "Недоступно", disabled: true) {}
                ReppyButton(title: "Открыть окно") { modal = true }
                ReppyProgressBar(completed: 3, total: 8)
            }
            ReppyStatus(message: "Ошибка сохранения. Повтори попытку.", error: true, actionTitle: "Повторить") {}
            ReppyToast(message: "Не удалось сохранить заметку", actionTitle: "Повторить") {}
            ReppyWorkoutSuccessArt()
            ReppyEmpty(title: "Пустое состояние", message: "Описание следующего действия")
            NoteDayCard(day: ReppyDate.day(), text: $text)
            NoteDayCard(day: ReppyDate.day(), text: .constant(""), loaded: false)
            NoteDayCard(day: ReppyDate.day(), text: .constant("Несохранённый текст"))
            MonthCalendar(date: $date, counts: [ReppyDate.day(): 2])
            ReppyActionGroup { ReppyButton(title: "Продлить", icon: "plus", kind: .primary) {}; ReppyButton(title: "История", icon: "clock.arrow.circlepath") {} }
            ReppyCard { ReppyChoiceRow(title: "Жим лёжа", subtitle: "Штанга") {} }
            ReppyCard { ReppyWorkoutChoiceLink(title: "Повторить тренировку", subtitle: "Завершена · 1 ноября") { ReppyText(text: "Повтор") } }
            ReppyInvitationInput(text: $text)
            ReppyButton(title: "Порядок упражнений") { orderOpen = true }
            if let exercise = store.data.assignments.first?.workout_snapshot.exercises.first { ReadOnlyExerciseCard(exercise: exercise) }
            ReppyCard {
                ReppyHeading(text: "Каталог")
                ForEach(NativeComponentCatalog.components.map(\.0), id: \.self) { ReppyCaption(text: $0) }
            }
        }.sheet(isPresented: $orderOpen) {
            NavigationStack { ReppyExerciseOrderEditor(exercises: $orderedExercises) }
                .onAppear { orderedExercises = store.data.assignments.first?.workout_snapshot.exercises ?? [] }
        }.sheet(isPresented: $modal) { NavigationStack { ReppyPage(back: true) { ReppyTitle(text: "Модальное окно"); ReppyField(title: "Поле с клавиатурой", text: $text); } .reppyFormActions(hasChanges: false, save: { modal = false }, discard: { modal = false }) }.presentationCornerRadius(ReppyMetrics.modalRadius) }
    }
}
