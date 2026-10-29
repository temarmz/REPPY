import SwiftUI

struct HistoryScreen: View {
    @EnvironmentObject private var store: AppStore
    var relationshipID: String?
    var back = false
    var body: some View {
        ReppyPage(back: back) {
            ReppyTitle(text: "История тренировок")
            let assignments = store.data.assignments.filter { (relationshipID == nil || $0.relationship_id == relationshipID) && $0.status == "completed" }.sorted { $0.scheduled_for > $1.scheduled_for }
            if assignments.isEmpty { ReppyEmpty(title: "История впереди", message: "Здесь появятся результаты завершённых тренировок.", icon: "clock.arrow.circlepath") }
            ForEach(assignments) { AssignmentCard(assignment: $0) }
        }.refreshable { await store.reload() }
    }
}
struct ProgressScreen: View {
    @EnvironmentObject private var store: AppStore
    var relationshipID: String
    @State private var period = 90
    @State private var metric = "max"
    var body: some View {
        ReppyPage(back: true) {
            ReppyTitle(text: "Прогресс")
            ReppyPicker(title: "Период", selection: $period) { Text("30 дней").tag(30); Text("90 дней").tag(90); Text("Всё время").tag(0) }
            ReppyPicker(title: "Показатель", selection: $metric) { Text("Максимум").tag("max"); Text("Сумма повторов / времени").tag("sum") }
            let groups = ExerciseProgress.collect(data: store.data, relationshipID: relationshipID)
            if groups.isEmpty { ReppyEmpty(title: "Пока мало данных", message: "Выполненные подходы появятся здесь после завершения тренировок.", icon: "chart.xyaxis.line") }
            ForEach(groups) { group in
                ReppyCard {
                    ReppyHeading(text: group.exercise.name)
                    ReppyCaption(text: "\(group.exercise.equipment ?? "") · \(group.exercise.loadMode == .bodyweight ? "Свой вес" : "Внешний вес")")
                    let points = group.points.filter { point in point.date <= Date() && (period == 0 || point.date >= Calendar.current.date(byAdding: .day, value: -(period - 1), to: Calendar.current.startOfDay(for: Date()))!) }
                    if points.isEmpty { ReppyCaption(text: "Нет выполнений за выбранный период.") }
                    else {
                        ReppyProgressChart(points: points, metric: metric, unit: metric == "max" && group.exercise.loadMode == .external && group.exercise.measureType == .reps ? "кг" : group.exercise.unit)
                        ForEach(points) { point in
                            ReppyLink(title: "\(ReppyDate.display(ReppyDate.day(point.date))) · \((metric == "max" ? point.maximum : point.total).reppyNumber)") { SessionResultScreen(sessionID: point.session.id) }
                        }
                    }
                }
            }
        }
    }
}
