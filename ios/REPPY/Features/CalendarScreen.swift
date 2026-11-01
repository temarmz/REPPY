import SwiftUI

struct CalendarScreen: View {
    @EnvironmentObject private var store: AppStore
    @State private var date = Date()
    private var assignments: [Assignment] { store.data.assignments.filter { store.isTrainer || $0.relationship_id == store.ownRelationship?.id } }
    var body: some View {
        ReppyPage {
            MonthCalendar(date: $date, counts: Dictionary(grouping: assignments, by: \.scheduled_for).mapValues(\.count), selectFirstDayOnMonthChange: true, showToday: true)
            if store.isTrainer {
                ReppyScheduleHeader(date: date, compactDate: true) { AssignmentEditorScreen(initialDate: date) }
            } else { ReppyHeading(text: date.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(Locale(identifier: "ru_RU")))) }
            let selected = assignments.filter { $0.scheduled_for == ReppyDate.day(date) }.sorted { ($0.scheduled_time ?? "") < ($1.scheduled_time ?? "") }
            if selected.isEmpty { ReppyEmpty(title: "Свободный день", message: "На эту дату тренировки не назначены.", icon: "calendar") }
            ForEach(selected) { assignment in AssignmentAgendaRow(assignment: assignment, dayContext: true) }
            if !store.isTrainer { ReppyLink(title: "История тренировок", icon: "clock.arrow.circlepath") { HistoryScreen(relationshipID: store.ownRelationship?.id, back: true) } }
        }.refreshable { await store.reload() }
    }
}
