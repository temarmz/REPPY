import SwiftUI

struct NotesScreen: View {
    @EnvironmentObject private var notes: NotesStore
    @State private var date = Date()
    @State private var calendarOpen = false
    @State private var conflictDay: String?
    private var days: [String] { (0..<4).map { ReppyDate.day(Calendar.current.date(byAdding: .day, value: $0, to: date)!) } }
    var body: some View {
        ReppyPage {
            ReppyTitle(text: "Заметки")
            ReppyButton(title: "Сегодня", compact: true) { date = Date() }
            ReppyRow {
                ReppyButton(title: "Предыдущие четыре дня", icon: "chevron.left", compact: true) { shift(-4) }
                ReppyButton(title: "Следующие четыре дня", icon: "chevron.right", compact: true) { shift(4) }
            }
            ReppyButton(title: "\(ReppyDate.display(days[0])) — \(ReppyDate.display(days[3]))", icon: "calendar") { calendarOpen = true }
            if let error = notes.storageError { ReppyStatus(message: error, error: true, actionTitle: "Повторить") { Task { await notes.refresh() } } }
            ReppyNotesGrid {
                ForEach(days, id: \.self) { day in
                    NoteDayCard(day: day, text: Binding(get: { notes.text(day) }, set: { notes.edit(day, $0) }), pending: notes.drafts[day] != nil, error: notes.errors[day]) {
                        if notes.conflicts[day] != nil { conflictDay = day }
                        else { Task { await notes.save(day) } }
                    }
                }
            }
        }.refreshable { await notes.refresh() }
            .onDisappear { Task { await notes.flush() } }
            .sheet(isPresented: $calendarOpen) {
                ReppyPage { ReppyTitle(text: "Выбрать день"); MonthCalendar(date: $date, counts: notes.notes.mapValues { $0.content.isEmpty ? 0 : 1 }); ReppyButton(title: "Готово") { calendarOpen = false } }
            }
            .sheet(isPresented: Binding(get: { conflictDay != nil }, set: { if !$0 { conflictDay = nil } })) {
                ReppyPage {
                    if let day = conflictDay {
                        ReppyTitle(text: "Выбрать версию заметки")
                        ReppyHeading(text: "Твой текст"); ReppyText(text: notes.text(day))
                        ReppyHeading(text: "Текст на сервере"); ReppyText(text: notes.conflicts[day]?.content ?? "")
                        ReppyButton(title: "Оставить мой текст", kind: .primary) { resolve(day, true) }
                        ReppyButton(title: "Использовать серверный текст") { resolve(day, false) }
                    }
                }
            }
    }
    private func shift(_ amount: Int) { Task { await notes.flush() }; date = Calendar.current.date(byAdding: .day, value: amount, to: date)! }
    private func resolve(_ day: String, _ mine: Bool) { Task { await notes.resolve(day, keepMine: mine); if notes.conflicts[day] == nil { conflictDay = nil } } }
}
