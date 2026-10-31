import SwiftUI

enum AppTab: String, CaseIterable {
    case home, calendar, clients, history, profile, notes
    var title: String {
        switch self { case .home: return "Главная"; case .calendar: return "Календарь"; case .clients: return "Ученики"; case .history: return "История"; case .profile: return "Профиль"; case .notes: return "Заметки" }
    }
    var icon: String {
        switch self { case .home: return "house"; case .calendar: return "calendar"; case .clients: return "person.2"; case .history: return "clock.arrow.circlepath"; case .profile: return "person.crop.circle"; case .notes: return "note.text" }
    }
}
struct ReppyTabBar: View {
    var tabs: [AppTab]
    @Binding var selected: AppTab
    @Environment(\.dynamicTypeSize) private var typeSize
    @ScaledMetric(relativeTo: .caption) private var labelSize: CGFloat = 14
    var body: some View {
        HStack(spacing: ReppyMetrics.space4) {
            ForEach(tabs, id: \.self) { tab in
                Button { selected = tab } label: {
                    VStack(spacing: ReppyMetrics.space4) {
                        Image(systemName: tab.icon).font(.system(size: 20, weight: .medium))
                        if !typeSize.isAccessibilitySize { Text(tab.title).font(.system(size: labelSize, weight: .medium)).lineLimit(1).fixedSize(horizontal: true, vertical: false) }
                    }.frame(maxWidth: .infinity).frame(minHeight: ReppyMetrics.compact)
                        .foregroundStyle(selected == tab ? ReppyTheme.selectedText : ReppyTheme.secondary)
                        .background(selected == tab ? ReppyTheme.lime : .clear, in: Capsule())
                        .contentShape(Rectangle())
                }.buttonStyle(.plain).frame(maxWidth: .infinity).accessibilityLabel(tab.title).accessibilityAddTraits(selected == tab ? .isSelected : [])
            }
        }.padding(ReppyMetrics.space6).background(ReppyTheme.surface, in: Capsule())
            .padding(.horizontal, ReppyMetrics.space12).padding(.vertical, ReppyMetrics.space8)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("reppy-tab-bar")
    }
}
