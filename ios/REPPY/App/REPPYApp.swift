import SwiftUI

@main struct REPPYApp: App {
    @StateObject private var store = AppStore()
    @AppStorage("appearance") private var appearance = "system"
    @Environment(\.scenePhase) private var scenePhase
    var body: some Scene {
        WindowGroup {
            RootScreen().environmentObject(store)
                .preferredColorScheme(appearance == "dark" ? .dark : appearance == "light" ? .light : nil)
                .environment(\.locale, Locale(identifier: "ru_RU"))
                .tint(ReppyTheme.text).foregroundStyle(ReppyTheme.text)
                .task { await store.bootstrap() }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { Task { await store.foreground() } }
                    if phase == .background { store.background() }
                }
                .onOpenURL { url in
                    if url.scheme == "reppy", url.host == "invite", let token = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "token" })?.value {
                        store.invitation = token
                    }
                }
        }
    }
}
struct RootScreen: View {
    @EnvironmentObject private var store: AppStore
    var body: some View {
        Group {
            if store.loading { ReppyLoading() }
            else if let profile = store.profile { MainScreen().id(profile.id + profile.role.rawValue) }
            else { NavigationStack { SignInScreen() } }
        }
    }
}
struct MainScreen: View {
    @EnvironmentObject private var store: AppStore
    @State private var tab: AppTab = .home
    var body: some View {
        TabView(selection: $tab) {
            NavigationStack { DashboardScreen() }.tag(AppTab.home)
            NavigationStack { CalendarScreen() }.tag(AppTab.calendar)
            if store.isTrainer { NavigationStack { StudentsScreen() }.tag(AppTab.clients) }
            else { NavigationStack { HistoryScreen(relationshipID: store.ownRelationship?.id) }.tag(AppTab.history) }
            NavigationStack { ProfileScreen() }.tag(AppTab.profile)
        }
        .toolbar(.hidden, for: .tabBar)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            ReppyTabBar(tabs: store.isTrainer ? [.home, .calendar, .clients, .profile] : [.home, .calendar, .history, .profile], selected: $tab)
        }.background(ReppyTheme.background)
    }
}
