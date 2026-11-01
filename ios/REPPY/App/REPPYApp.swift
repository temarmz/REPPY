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
    @StateObject private var notes = NotesStore()
    @State private var keyboardVisible = false
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        TabView(selection: $tab) {
            NavigationStack { DashboardScreen() }.tag(AppTab.home)
            NavigationStack { CalendarScreen() }.tag(AppTab.calendar)
            if store.isTrainer { NavigationStack { StudentsScreen() }.tag(AppTab.clients) }
            NavigationStack { NotesScreen() }.tag(AppTab.notes)
        }
        .toolbar(.hidden, for: .tabBar)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if !keyboardVisible {
                ReppyTabBar(tabs: store.isTrainer ? [.home, .calendar, .clients, .notes] : [.home, .calendar, .notes], selected: $tab)
            }
        }.background(ReppyTheme.background)
            .environmentObject(notes)
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in keyboardVisible = true }
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in keyboardVisible = false }
            .task { await notes.start(store: store) }
            .onChange(of: scenePhase) { _, phase in
                Task { if phase == .active { await notes.refresh() } else { await notes.flush() } }
            }
            .onChange(of: store.networkAvailable) { _, available in if available { Task { await notes.refresh() } } }
            .onDisappear { notes.stop() }
    }
}
