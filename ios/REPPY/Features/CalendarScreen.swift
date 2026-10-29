import SwiftUI

struct CalendarScreen: View {
    @EnvironmentObject private var store: AppStore
    @State private var date = Date()
    private var assignments: [Assignment] { store.data.assignments.filter { store.isTrainer || $0.relationship_id == store.ownRelationship?.id } }
    var body: some View {
        ReppyPage {
            ReppyTitle(text: "Календарь")
            MonthCalendar(date: $date, counts: Dictionary(grouping: assignments, by: \.scheduled_for).mapValues(\.count))
            ReppyHeading(text: ReppyDate.display(ReppyDate.day(date)))
            let selected = assignments.filter { $0.scheduled_for == ReppyDate.day(date) }.sorted { ($0.scheduled_time ?? "") < ($1.scheduled_time ?? "") }
            if selected.isEmpty { ReppyEmpty(title: "Свободный день", message: "На эту дату тренировки не назначены.", icon: "calendar") }
            ForEach(selected) { assignment in AssignmentCard(assignment: assignment) }
            if store.isTrainer { ReppyLink(title: "Назначить тренировку", icon: "plus") { AssignmentEditorScreen(initialDate: date) } }
        }.refreshable { await store.reload() }
    }
}
