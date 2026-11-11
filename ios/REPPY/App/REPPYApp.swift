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
            else if let profile = store.profile {
#if DEBUG
                if ScreenAuditHost.route != nil && store.isDemo { ScreenAuditHost().id(profile.id + profile.role.rawValue) }
                else { MainScreen().id(profile.id + profile.role.rawValue) }
#else
                MainScreen().id(profile.id + profile.role.rawValue)
#endif
            }
            else { NavigationStack { SignInScreen() } }
        }
        .sheet(isPresented: Binding(get: { store.profile != nil && !store.invitation.isEmpty }, set: { if !$0 && !store.busy { store.invitation = "" } })) {
            NavigationStack { SignInScreen().reppyDismissAction(disabled: store.busy) }
        }
    }
}
struct MainScreen: View {
    @EnvironmentObject private var store: AppStore
    @State private var tab: AppTab = .home
    @StateObject private var notes = NotesStore()
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        TabView(selection: $tab) {
            NavigationStack { DashboardScreen() }.tabItem { Label(AppTab.home.title, systemImage: AppTab.home.icon) }.tag(AppTab.home)
            NavigationStack { CalendarScreen() }.tabItem { Label(AppTab.calendar.title, systemImage: AppTab.calendar.icon) }.tag(AppTab.calendar)
            if store.isTrainer {
                NavigationStack { StudentsScreen() }.tabItem { Label(AppTab.clients.title, systemImage: AppTab.clients.icon) }.tag(AppTab.clients)
            }
            NavigationStack { NotesScreen() }.tabItem { Label(AppTab.notes.title, systemImage: AppTab.notes.icon) }.tag(AppTab.notes)
        }
            .tint(ReppyTheme.text)
            .environmentObject(notes)
            .onChange(of: tab) { _, next in ActivityLog.record("tab." + next.rawValue); if next == .notes { notes.selectDay(Date()) } }
            .task { await notes.start(store: store) }
            .onChange(of: scenePhase) { _, phase in
                Task { if phase == .active { await notes.refresh() } else { await notes.flush() } }
            }
            .onChange(of: store.networkAvailable) { _, available in if available { Task { await notes.refresh() } } }
            .onDisappear { notes.stop() }
    }
}
