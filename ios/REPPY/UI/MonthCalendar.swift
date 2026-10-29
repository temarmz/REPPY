import SwiftUI

struct MonthCalendar: View {
    @Binding var date: Date
    var counts: [String: Int]
    @State private var month = Date()
    private var calendar: Calendar { var calendar = Calendar(identifier: .gregorian); calendar.locale = Locale(identifier: "ru_RU"); calendar.firstWeekday = 2; return calendar }
    private var start: Date { calendar.date(from: calendar.dateComponents([.year, .month], from: month))! }
    private var days: [Date?] {
        let offset = (calendar.component(.weekday, from: start) + 5) % 7
        let count = calendar.range(of: .day, in: .month, for: start)!.count
        return Array(repeating: nil, count: offset) + (0..<count).map { calendar.date(byAdding: .day, value: $0, to: start) }
    }
    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Button { month = calendar.date(byAdding: .month, value: -1, to: month)! } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44).background(ReppyTheme.button, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius)) }.accessibilityLabel("Предыдущий месяц")
                Spacer(); Text(month.formatted(.dateTime.month(.wide).year())).font(.headline); Spacer()
                Button { month = calendar.date(byAdding: .month, value: 1, to: month)! } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44).background(ReppyTheme.button, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius)) }.accessibilityLabel("Следующий месяц")
            }.buttonStyle(.plain)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(minimum: 44), spacing: 0), count: 7), spacing: 6) {
                ForEach(["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"], id: \.self) { Text($0).font(.subheadline).foregroundStyle(ReppyTheme.secondary) }
                ForEach(Array(days.enumerated()), id: \.offset) { _, day in
                    if let day {
                        let selected = calendar.isDate(day, inSameDayAs: date)
                        Button { date = day } label: {
                            VStack(spacing: 2) {
                                Text(String(calendar.component(.day, from: day))).font(.body)
                                Circle().fill(counts[ReppyDate.day(day), default: 0] > 0 ? (selected ? ReppyTheme.selectedText : ReppyTheme.lime) : .clear).frame(width: 4, height: 4)
                            }.frame(maxWidth: .infinity).frame(height: ReppyMetrics.small)
                                .foregroundStyle(selected ? ReppyTheme.selectedText : ReppyTheme.text)
                                .background(selected ? ReppyTheme.lime : ReppyTheme.button, in: RoundedRectangle(cornerRadius: ReppyMetrics.radius))
                        }.buttonStyle(.plain).padding(.horizontal, 2)
                            .accessibilityLabel("\(ReppyDate.display(ReppyDate.day(day))), тренировок: \(counts[ReppyDate.day(day), default: 0])")
                            .accessibilityAddTraits(selected ? .isSelected : [])
                    } else { Color.clear.frame(height: ReppyMetrics.small) }
                }
            }
        }.onAppear { month = date }
    }
}
