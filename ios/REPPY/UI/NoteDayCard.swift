import SwiftUI

struct ReppyNotesGrid<Content: View>: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    @ViewBuilder var content: () -> Content
    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: ReppyMetrics.notesGap), count: typeSize.isAccessibilitySize ? 1 : 2), spacing: ReppyMetrics.notesGap, content: content)
    }
}

struct NoteDayCard: View {
    var day: String
    @Binding var text: String
    var pending = false
    var loaded = true
    var editable = true
    var error: String?
    var conflict = false
    var onBlur: () -> Void = {}
    var onFocus: () -> Void = {}
    var retry: () -> Void = {}
    @FocusState private var focused: Bool
    @ScaledMetric(relativeTo: .body) private var cardHeight = ReppyMetrics.notesMinHeight
    @ScaledMetric(relativeTo: .body) private var textSize = ReppyMetrics.notesFont
    private var shortDate: String {
        let date = ReppyDate.fromDay(day)
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ru_RU")
        formatter.dateFormat = "MMM"
        return "\(Calendar.current.component(.day, from: date)) \(formatter.string(from: date).prefix(3))"
    }
    var body: some View {
        VStack(alignment: .leading, spacing: ReppyMetrics.space4) {
            HStack(alignment: .firstTextBaseline, spacing: ReppyMetrics.space4) {
                Text(shortDate).font(.subheadline.weight(.semibold))
                Text("· " + (Calendar.current.isDateInToday(ReppyDate.fromDay(day)) ? "Сегодня" : ReppyDate.fromDay(day).formatted(.dateTime.weekday(.abbreviated).locale(Locale(identifier: "ru_RU"))))).font(.caption).foregroundStyle(ReppyTheme.secondary)
            }.lineLimit(1).minimumScaleFactor(0.8)
            TextEditor(text: $text).font(.system(size: textSize)).scrollContentBackground(.hidden).focused($focused).disabled(!loaded || !editable)
                .overlay(alignment: .topLeading) {
                    if text.isEmpty { Text(loaded ? "Запиши здесь…" : "Загружаем…").font(.system(size: textSize)).foregroundStyle(ReppyTheme.muted).padding(.top, ReppyMetrics.space8).padding(.leading, ReppyMetrics.space4).allowsHitTesting(false).accessibilityHidden(true) }
                }.frame(height: cardHeight * 0.7).accessibilityLabel("Заметка на \(ReppyDate.display(day))").accessibilityIdentifier("note-" + day)
            if let error { ReppyStatus(message: error, error: true, actionTitle: conflict ? "Выбрать версию" : "Повторить", action: retry) }
            if text.count >= 50_000 { ReppyCaption(text: "Лимит: 50 000 знаков") }
        }.padding(ReppyMetrics.notesPadding).frame(height: error == nil && text.count < 50_000 ? cardHeight : nil)
            .background(ReppyTheme.surface, in: RoundedRectangle(cornerRadius: ReppyMetrics.cardRadius))
            .onChange(of: focused) { was, active in
                if active { onFocus() }
                else if was { onBlur() }
            }
    }
}

struct ReppyNotesHeader: View {
    var date: Date
    var onToday: () -> Void
    var onPrevious: () -> Void
    var onNext: () -> Void
    var onCalendar: () -> Void
    private var range: String {
        let end = Calendar.current.date(byAdding: .day, value: 3, to: date)!
        let style = Date.FormatStyle.dateTime.day().month(.abbreviated).locale(Locale(identifier: "ru_RU"))
        if Calendar.current.isDate(date, equalTo: end, toGranularity: .month) {
            return "\(Calendar.current.component(.day, from: date))–\(end.formatted(style)), \(Calendar.current.component(.year, from: end))"
        }
        return "\(date.formatted(style)) — \(end.formatted(style)), \(Calendar.current.component(.year, from: end))"
    }
    var body: some View {
        ReppyStack {
            ReppyRow { ReppyTitle(text: "Заметки"); Spacer(minLength: 0); ReppyButton(title: "Сегодня", compact: true, action: onToday).fixedSize(horizontal: true, vertical: false) }
            HStack(spacing: ReppyMetrics.space8) {
                arrow("chevron.left", title: "Предыдущие четыре дня", action: onPrevious)
                ReppyButton(title: range, icon: "calendar", compact: true, action: onCalendar).accessibilityLabel("Выбрать дату, " + range).accessibilityIdentifier("notes-date-range")
                arrow("chevron.right", title: "Следующие четыре дня", action: onNext)
            }
        }
    }
    private func arrow(_ icon: String, title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: icon).frame(width: ReppyMetrics.compact).frame(minHeight: ReppyMetrics.compact, maxHeight: .infinity).background(ReppyTheme.button, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius)) }.buttonStyle(.plain).accessibilityLabel(title)
    }
}
