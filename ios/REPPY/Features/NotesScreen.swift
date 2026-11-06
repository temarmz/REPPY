import SwiftUI

struct NotesScreen: View {
    @EnvironmentObject private var notes: NotesStore
    private var date: Date { ReppyDate.fromDay(notes.firstDay) }
    @State private var calendarOpen = false
    @State private var conflictDay: String?
    @State private var resolving = false
    @State private var focusedDay: String?
    private var days: [String] { (0..<4).map { ReppyDate.day(Calendar.current.date(byAdding: .day, value: $0, to: date)!) } }
    private var notice: (message: String, day: String?)? {
        if let error = notes.storageError { return (error, nil) }
        for day in days {
            if let error = notes.errors[day] { return (error, day) }
        }
        return nil
    }
    var body: some View {
        ScrollViewReader { scroll in
        ReppyPage {
            ReppyNotesHeader(date: date, onToday: { notes.selectDay(Date()) }, onPrevious: { shift(-4) }, onNext: { shift(4) }, onCalendar: { calendarOpen = true })
            ReppyNotesGrid {
                ForEach(days, id: \.self) { day in
                    NoteDayCard(day: day, text: Binding(get: { notes.text(day) }, set: { notes.edit(day, $0) }), loaded: notes.loaded, editable: notes.canEdit, onBlur: { if focusedDay == day { focusedDay = nil }; Task { await notes.save(day) } }, onFocus: { focusedDay = day }).id(day)
                }
            }
        }.onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardDidShowNotification)) { _ in
            if let focusedDay { withAnimation { scroll.scrollTo(focusedDay, anchor: .bottom) } }
        }.onChange(of: focusedDay) { _, day in
            if let day { withAnimation { scroll.scrollTo(day, anchor: .bottom) } }
        }
        }.overlay(alignment: .top) {
            if let notice {
                ReppyToast(message: notice.message, actionTitle: notice.day.flatMap { notes.conflicts[$0] == nil ? "Повторить" : "Выбрать версию" } ?? "Повторить") {
                    if let day = notice.day {
                        if notes.conflicts[day] != nil { conflictDay = day }
                        else { Task { await notes.save(day) } }
                    } else { Task { await notes.refresh() } }
                }.padding(.horizontal, ReppyMetrics.pageInset).padding(.top, ReppyMetrics.space8)
            }
        }.refreshable { await notes.refresh() }
            .onDisappear { Task { await notes.flush() } }
            .sheet(isPresented: $calendarOpen) {
                NavigationStack { ReppyPage(back: true, title: "Выбрать день") {
                    ReppyText(text: "Выбранный день и три следующих останутся рядом.", tone: .secondary)
                    MonthCalendar(date: Binding(get: { date }, set: { notes.selectDay($0); calendarOpen = false }), counts: notes.markedDays, countLabel: "заметка")
                    ReppyButton(title: "Перейти к сегодня") { notes.selectDay(Date()); calendarOpen = false }
                }.reppyDismissAction() }.presentationCornerRadius(ReppyMetrics.modalRadius)
            }
            .sheet(isPresented: Binding(get: { conflictDay != nil }, set: { if !$0 { conflictDay = nil } })) {
                NavigationStack { ReppyPage(back: true, title: "Версия заметки") {
                    if let day = conflictDay {
                        ReppyText(text: "Эта запись изменилась на другом устройстве. Выбери, какой текст оставить.", tone: .secondary)
                        ReppyHeading(text: "Твой текст"); ReppyText(text: notes.text(day))
                        ReppyHeading(text: "Текст на сервере"); ReppyText(text: notes.conflicts[day]?.content ?? "")
                        if let error = notes.errors[day] { ReppyStatus(message: error, error: true) }
                        ReppyButton(title: "Оставить мой текст", kind: .primary, disabled: resolving) { resolve(day, true) }
                        ReppyButton(title: "Использовать серверный", disabled: resolving) { resolve(day, false) }
                    }
                }.reppyDismissAction(disabled: resolving) }.interactiveDismissDisabled(resolving)
            }
    }
    private func shift(_ amount: Int) { notes.selectDay(Calendar.current.date(byAdding: .day, value: amount, to: date)!) }
    private func resolve(_ day: String, _ mine: Bool) { guard !resolving else { return }; resolving = true; Task { await notes.resolve(day, keepMine: mine); resolving = false; if notes.conflicts[day] == nil { conflictDay = nil } } }
}
