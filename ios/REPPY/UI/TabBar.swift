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
