import SwiftUI

struct ProfileScreen: View {
    @EnvironmentObject private var store: AppStore
    @AppStorage("appearance") private var appearance = "system"
    @State private var confirmSignOut = false
    var body: some View {
        ReppyPage(back: true) {
            ReppyTitle(text: "Профиль", subtitle: store.profile?.display_name)
            ReppyCard {
                ReppyCaption(text: store.isTrainer ? "Тренер" : "Ученик")
                ReppyPicker(title: "Оформление", selection: $appearance) {
                    Text("Как в системе").tag("system"); Text("Светлое").tag("light"); Text("Тёмное").tag("dark")
                }
            }
            if !store.isTrainer, let student = store.ownStudent {
                StudentDetailsCard(student: student)
                ReppyLink(title: "Изменить личные данные", icon: "pencil") { StudentFormScreen(student: student) }
                if let relationship = store.ownRelationship {
                    BalanceCard(relationshipID: relationship.id)
                    ReppyLink(title: "Прогресс по упражнениям", icon: "chart.xyaxis.line") { ProgressScreen(relationshipID: relationship.id) }
                }
            }
            if store.isTrainer {
                ReppyLink(title: "Библиотека упражнений", icon: "dumbbell") { ExerciseLibraryScreen() }
                ReppyLink(title: "Открыть дизайн-кит", icon: "square.grid.2x2") { DesignKitScreen() }
            }
            ReppyCard {
                ReppyHeading(text: "Уведомления")
                ReppyText(text: "Напоминания и изменения расписания приходят в Telegram, как и в веб-версии.", tone: .secondary)
                ReppyLink(title: "Подключение Telegram", icon: "paperplane") { TelegramConnectionScreen() }
            }
            ReppyButton(title: "Обновить данные", icon: "arrow.clockwise", disabled: store.busy) { Task { await store.reload() } }
            ReppyButton(title: store.isDemo ? "Выйти из демо" : "Выйти из аккаунта", kind: .danger, disabled: store.busy) { confirmSignOut = true }
        }.confirmationDialog("Выйти из аккаунта? Черновики останутся на этом iPhone и будут доступны после входа в тот же аккаунт.", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Выйти", role: .destructive) { Task { await store.signOut() } }
            Button("Отмена", role: .cancel) {}
        }
    }
}
struct TelegramConnectionScreen: View {
    @EnvironmentObject private var store: AppStore
    @State private var status = "Проверяем подключение…"
    @State private var link: String?
    var body: some View {
        ReppyPage(back: true) {
            ReppyTitle(text: "Telegram")
            ReppyCard {
                ReppyText(text: status)
                if let link { ReppyExternalLink(title: "Открыть бота", url: URL(string: link)!) }
            }
        }.task {
            if store.isDemo { status = "В демо уведомления не отправляются."; return }
            do {
                struct Connection: Decodable { var connected: Bool; var username: String?; var first_name: String? }
                guard let api = store.api else { return }
                let connections: [Connection] = try await api.rpc("get_telegram_connection")
                let connection = connections.first
                status = connection?.connected == true ? "Подключён: \(connection?.username.map { "@" + $0 } ?? connection?.first_name ?? "Telegram")" : "Telegram пока не подключён."
                if connection?.connected != true {
                    struct Code: Decodable { var code: String }
                    let codes: [Code] = try await api.rpc("create_telegram_link_code")
                    guard let code = codes.first else { throw APIError.invalidResponse }
                    link = "https://t.me/reppyappbot?start=\(code.code)"
                }
            } catch { status = error.localizedDescription }
        }
    }
}
