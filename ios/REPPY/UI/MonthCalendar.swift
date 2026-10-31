import SwiftUI

struct MonthCalendar: View {
    @Binding var date: Date
    var counts: [String: Int]
    var selectFirstDayOnMonthChange = false
    var showToday = false
    @State private var month = Date()
    @Environment(\.dynamicTypeSize) private var typeSize
    @ScaledMetric(relativeTo: .body) private var dayHeight = ReppyMetrics.small
    private var monthTitle: String {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "ru_RU"); formatter.dateFormat = "LLLL yyyy"
        return formatter.string(from: month).capitalized
    }
    private var calendar: Calendar { var calendar = Calendar(identifier: .gregorian); calendar.locale = Locale(identifier: "ru_RU"); calendar.firstWeekday = 2; return calendar }
    private var start: Date { calendar.date(from: calendar.dateComponents([.year, .month], from: month))! }
    private var days: [Date] {
        let offset = (calendar.component(.weekday, from: start) + 5) % 7
        return (0..<42).map { calendar.date(byAdding: .day, value: $0 - offset, to: start)! }
    }
    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Button { month = calendar.date(byAdding: .month, value: -1, to: month)! } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44).background(ReppyTheme.button, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius)) }.accessibilityLabel("Предыдущий месяц")
                Spacer(); Text(monthTitle).font(.headline).fixedSize(horizontal: false, vertical: true).multilineTextAlignment(.center); Spacer()
                Button { month = calendar.date(byAdding: .month, value: 1, to: month)! } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44).background(ReppyTheme.button, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius)) }.accessibilityLabel("Следующий месяц")
                if showToday { Button { date = Date() } label: { ReppyToolbarIcon(icon: "calendar") }.accessibilityLabel("Сегодня") }
            }.buttonStyle(.plain).font(.system(size: ReppyMetrics.iconSize, weight: .medium))
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(minimum: ReppyMetrics.small), spacing: 0), count: typeSize.isAccessibilitySize ? 3 : 7), spacing: ReppyMetrics.space6) {
                if !typeSize.isAccessibilitySize {
                    ForEach(["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"], id: \.self) { Text($0).font(.subheadline).foregroundStyle(ReppyTheme.secondary) }
                }
                ForEach(Array(days.enumerated()), id: \.offset) { _, day in
                        let selected = calendar.isDate(day, inSameDayAs: date)
                        Button { date = day } label: {
                            VStack(spacing: 2) {
                                if typeSize.isAccessibilitySize { Text(day.formatted(.dateTime.weekday(.abbreviated).locale(Locale(identifier: "ru_RU")))).font(.caption) }
                                Text(String(calendar.component(.day, from: day))).font(.body)
                                Circle().fill(counts[ReppyDate.day(day), default: 0] > 0 ? (selected ? ReppyTheme.selectedText : ReppyTheme.lime) : .clear).frame(width: 4, height: 4)
                            }.frame(maxWidth: .infinity).frame(minHeight: dayHeight)
                                .foregroundStyle(selected ? ReppyTheme.selectedText : calendar.isDate(day, equalTo: month, toGranularity: .month) ? ReppyTheme.text : ReppyTheme.muted)
                                .background(selected ? ReppyTheme.lime : ReppyTheme.button, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius))
                                .overlay(RoundedRectangle(cornerRadius: ReppyMetrics.radius).stroke(calendar.isDateInToday(day) && !selected ? ReppyTheme.lime : .clear, lineWidth: 1))
                        }.buttonStyle(.plain)
                            .accessibilityLabel("\(ReppyDate.display(ReppyDate.day(day))), тренировок: \(counts[ReppyDate.day(day), default: 0])")
                            .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
        }.padding(.vertical, ReppyMetrics.space12).padding(.horizontal, ReppyMetrics.space4)
            .background(ReppyTheme.surface, in: RoundedRectangle(cornerRadius: ReppyMetrics.cardRadius))
            .onAppear { month = date }
            .onChange(of: month) { _, value in if selectFirstDayOnMonthChange && !calendar.isDate(date, equalTo: value, toGranularity: .month) { date = calendar.date(from: calendar.dateComponents([.year, .month], from: value))! } }
            .onChange(of: date) { _, value in if !calendar.isDate(value, equalTo: month, toGranularity: .month) { month = value } }
    }
}
