import SwiftUI

struct DesignKitScreen: View {
    @State private var text = "Длинное название упражнения для проверки переноса"
    @State private var number = 75.25
    @State private var toggle = true
    @State private var date = Date()
    @State private var tab = AppTab.home
    @State private var modal = false
    @State private var profileSection = "data"
    @State private var sampleExercise: WorkoutExercise?
    @State private var sampleResults: [SetResult] = []
    @EnvironmentObject private var store: AppStore
    var body: some View {
        ReppyPage(back: true) {
            ReppyTitle(text: "Дизайн-кит", subtitle: "Общие компоненты iPhone")
            ReppyCard {
                ReppyHeading(text: "Основа дизайн-системы")
                ReppyCaption(text: "Контролы 44 / 48 / 56 · карточки 20 · интервал 24")
                ReppyText(text: "Системный шрифт iOS поддерживает Dynamic Type. Цвета и геометрия синхронизируются с вебом.")
                ReppyField(title: "Поле с ошибкой", text: $text, error: "Проверь введённое значение")
                ReppyField(title: "Недоступное поле", text: $text).disabled(true)
                ReppyButton(title: "Компактное действие", compact: true) {}
            }
            ReppyAuthIntro()
            if let session = store.data.sessions.first {
                ReppySessionSummary(session: session, results: store.data.sessionResults(session.id))
                if let exercise = session.workout_snapshot.exercises.first { ReppyResultExerciseCard(exercise: exercise, results: store.data.sessionResults(session.id)) }
            }
            if let entry = store.data.subscriptions.first { ReppySubscriptionEntry(entry: entry, balanceAfter: 3) }
            if let relationship = store.data.relationships.first, let group = ExerciseProgress.collect(data: store.data, relationshipID: relationship.id).first {
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
                ExerciseEditorCard(exercise: Binding(get: { sampleExercise ?? exercise }, set: { sampleExercise = $0 }), relationshipID: "", onMove: { _ in }, onDelete: { sampleExercise = nil })
                ReppyActiveExerciseCard(exercise: exercise, results: $sampleResults) { modal = true }
            }
            ReppyBalanceSummary(balance: 3)
            ReppyProfileSegments(selection: $profileSection)
            ReppyAgendaLink(title: "Длинное название тренировки для проверки переноса", subtitle: "Сегодня · 18:00", completed: true) { ReppyText(text: "Пример перехода") }
            if let student = store.data.students.first { ReppyStudentDetails(student: student) }
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
            ReppyEmpty(title: "Пустое состояние", message: "Описание следующего действия")
            NoteDayCard(day: ReppyDate.day(), text: $text)
            MonthCalendar(date: $date, counts: [ReppyDate.day(): 2])
            ReppyTabBar(tabs: [.home, .calendar, .clients, .notes], selected: $tab)
            if let exercise = store.data.assignments.first?.workout_snapshot.exercises.first { ReadOnlyExerciseCard(exercise: exercise) }
            ReppyCard {
                ReppyHeading(text: "Каталог")
                ForEach(NativeComponentCatalog.components.map(\.0), id: \.self) { ReppyCaption(text: $0) }
            }
        }.sheet(isPresented: $modal) { NavigationStack { ReppyPage(back: true) { ReppyTitle(text: "Модальное окно"); ReppyField(title: "Поле с клавиатурой", text: $text); ReppyButton(title: "Закрыть") { modal = false } } }.presentationCornerRadius(ReppyMetrics.modalRadius) }
    }
}
