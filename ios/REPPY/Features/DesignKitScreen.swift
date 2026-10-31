import SwiftUI

struct DesignKitScreen: View {
    @State private var text = "Длинное название упражнения для проверки переноса"
    @State private var number = 75.25
    @State private var toggle = true
    @State private var date = Date()
    @State private var tab = AppTab.home
    @State private var modal = false
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
