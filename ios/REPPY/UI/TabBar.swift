import SwiftUI

enum AppTab: String, CaseIterable {
    case home, calendar, clients, history, profile
    var title: String {
        switch self { case .home: return "Главная"; case .calendar: return "Календарь"; case .clients: return "Ученики"; case .history: return "История"; case .profile: return "Профиль" }
    }
    var icon: String {
        switch self { case .home: return "house"; case .calendar: return "calendar"; case .clients: return "person.2"; case .history: return "clock.arrow.circlepath"; case .profile: return "person.crop.circle" }
    }
}
struct ReppyTabBar: View {
    var tabs: [AppTab]
    @Binding var selected: AppTab
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        HStack(spacing: 4) {
            ForEach(tabs, id: \.self) { tab in
                Button { selected = tab } label: {
                    VStack(spacing: 4) {
                        Image(systemName: tab.icon).font(.system(size: 20, weight: .medium))
                        if !typeSize.isAccessibilitySize { Text(tab.title).font(.caption2.weight(.medium)).lineLimit(1) }
                    }.frame(maxWidth: .infinity).frame(minHeight: ReppyMetrics.control)
                        .foregroundStyle(selected == tab ? ReppyTheme.selectedText : ReppyTheme.secondary)
                        .background(selected == tab ? ReppyTheme.lime : .clear, in: Capsule())
                }.buttonStyle(.plain).accessibilityLabel(tab.title).accessibilityAddTraits(selected == tab ? .isSelected : [])
            }
        }.padding(6).background(ReppyTheme.surface, in: Capsule()).padding(.horizontal, 16).padding(.bottom, 8).padding(.top, 8)
            .background(ReppyTheme.background.ignoresSafeArea(edges: .bottom))
    }
}
