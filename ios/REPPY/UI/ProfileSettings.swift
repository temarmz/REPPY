import SwiftUI

struct ReppyAppearancePicker: View {
    @Binding var selection: String
    private let options = [("system", "Как в системе"), ("light", "Светлое"), ("dark", "Тёмное")]
    var body: some View {
        Menu {
            Picker("Оформление", selection: $selection) {
                ForEach(options, id: \.0) { value, title in Text(title).tag(value) }
            }
        } label: {
            HStack {
                Label("Оформление", systemImage: "circle.lefthalf.filled")
                Spacer()
                Text(options.first { $0.0 == selection }?.1 ?? "Как в системе").foregroundStyle(ReppyTheme.secondary)
                Image(systemName: "chevron.up.chevron.down").font(.caption)
            }.font(.body).foregroundStyle(ReppyTheme.text)
        }.buttonStyle(ReppyButtonStyle(kind: .secondary))
            .onChange(of: selection) { _, _ in ActivityLog.record("appearance.changed") }
    }
}

struct ReppyTelegramStatus: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.openURL) private var openURL
    @State private var connected = false
    @State private var loaded = false
    @State private var busy = false
    @State private var status = "Проверяем подключение…"
    @State private var failed = false
    var body: some View {
        ReppyCard {
            ReppyHeading(text: connected ? "Telegram подключён" : "Telegram")
            ReppyText(text: status)
            if failed {
                ReppyButton(title: "Повторить проверку", kind: .secondary, disabled: busy) { Task { await load() } }
            } else if loaded && !connected && !store.isDemo {
                ReppyButton(title: "Подключить Telegram", kind: .secondary, disabled: busy) { Task { await connect() } }
            }
        }.task { await load() }
    }
    private func load() async {
        guard !busy else { return }
        if store.isDemo { loaded = true; status = "В демо уведомления не отправляются."; return }
        busy = true; failed = false
        defer { busy = false }
        do {
            struct Connection: Decodable { var connected: Bool; var username: String?; var first_name: String? }
            guard let api = store.api else { throw APIError.invalidResponse }
            let result: [Connection] = try await api.rpc("get_telegram_connection")
            connected = result.first?.connected == true
            status = connected ? (result.first?.username.map { "@" + $0 } ?? result.first?.first_name ?? "Уведомления о тренировках включены.") : "Подключи бота, чтобы получать уведомления о тренировках."
            loaded = true
        } catch { failed = true; status = "Не удалось проверить подключение."; ActivityLog.record("telegram.status", outcome: "error") }
    }
    private func connect() async {
        guard !busy else { return }
        busy = true; defer { busy = false }
        do {
            struct Code: Decodable { var code: String }
            guard let api = store.api else { throw APIError.invalidResponse }
            let codes: [Code] = try await api.rpc("create_telegram_link_code")
            guard let code = codes.first, let url = URL(string: "https://t.me/reppyappbot?start=\(code.code)") else { throw APIError.invalidResponse }
            ActivityLog.record("telegram.connect")
            openURL(url)
        } catch { failed = true; status = "Не удалось открыть подключение. Повтори проверку."; ActivityLog.record("telegram.connect", outcome: "error") }
    }
}

struct ReppyDiagnosticExport: View {
    @State private var file: URL?
    @State private var failed = false
    var body: some View {
        Group {
        if let file {
            ShareLink(item: file) { Label("Скачать логи", systemImage: "square.and.arrow.up") }
                .buttonStyle(ReppyButtonStyle(kind: .secondary))
                .simultaneousGesture(TapGesture().onEnded { prepare() })
        } else {
            ReppyButton(title: "Скачать логи", kind: .secondary) { prepare() }
        }
        if failed { ReppyCaption(text: "Не удалось подготовить логи. Попробуй ещё раз.") }
        }.onAppear { prepare() }
    }
    private func prepare() {
        do { file = try ActivityLog.export(); failed = false } catch { failed = true }
    }
}
