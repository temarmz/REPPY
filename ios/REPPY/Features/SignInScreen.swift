import SwiftUI

struct SignInScreen: View {
    @EnvironmentObject private var store: AppStore
    @State private var preview: InvitationPreview?
    @State private var invitationError: String?
    @State private var invitationOpen = false
    @State private var demoOpen = false
    private struct InvitationPreview: Decodable { var studentName: String; var trainerName: String; var expiresAt: String }
    var body: some View {
        ReppyAuthPage {
            ReppyAuthIntro()
            if let error = store.error { ReppyStatus(message: error, error: true) }
            if !store.networkAvailable { ReppyStatus(message: "Нет подключения к интернету. Подключись к сети, чтобы войти.") }
            ReppyStack {
                if store.pendingRegistration {
                    ReppyHeading(text: "Создать кабинет тренера")
                    ReppyField(title: "Как тебя зовут", text: $store.registrationName)
                    ReppyButton(title: store.busy ? "Создаём кабинет…" : "Создать кабинет", kind: .primary,
                        disabled: store.busy || store.registrationName.trimmingCharacters(in: .whitespacesAndNewlines).count < 2) { Task { await store.login(register: true) } }
                    ReppyCaption(text: "Если ты ученик, вставь приглашение от своего тренера и войди заново.")
                }
                if let preview {
                    ReppyHeading(text: "\(preview.studentName), тебя приглашает \(preview.trainerName)")
                    ReppyCaption(text: "Приглашение действует до \(ReppyDate.display(preview.expiresAt)). При входе будет создана связь с этим тренером.")
                }
                if let invitationError { ReppyStatus(message: invitationError, error: true) }
                if !store.pendingRegistration {
                    ReppyButton(title: store.busy ? "Входим…" : "Войти через Telegram", icon: "paperplane.fill", kind: .primary,
                        disabled: store.busy || store.api == nil || !store.networkAvailable) { Task { await store.login() } }
                    ReppyCaption(text: "Используй свой Telegram. Если ты уже в REPPY, твои данные появятся после входа.")
                }
                ReppyButton(title: store.invitation.isEmpty ? "У меня есть приглашение" : "Изменить приглашение", icon: "link", disabled: store.busy) { invitationOpen = true }
                if store.pendingRegistration {
                    ReppyButton(title: "Вернуться ко входу", disabled: store.busy) { store.cancelRegistration() }
                }
                if store.api == nil { ReppyCaption(text: "Рабочее подключение ещё не настроено. Для знакомства открой демо ниже.") }
            }
            ReppyButton(title: "Посмотреть демо", compact: true, disabled: store.busy) { demoOpen = true }
        }
        .sheet(isPresented: $invitationOpen) {
            NavigationStack {
                ReppyPage {
                    ReppyTitle(text: "Приглашение от тренера")
                    ReppyCaption(text: "Вставь ссылку или токен, который прислал тренер.")
                    ReppyField(title: "Приглашение", text: $store.invitation)
                    ReppyButton(title: "Готово", kind: .primary) { store.cancelRegistration(); invitationOpen = false }
                }
            }
        }
        .sheet(isPresented: $demoOpen) {
            NavigationStack {
                ReppyPage {
                    ReppyTitle(text: "Попробовать REPPY")
                    ReppyCaption(text: "Демо с тестовыми данными. Выбери роль.")
                    ReppyButton(title: "Демо тренера") { openDemo(.trainer) }
                    ReppyButton(title: "Демо ученика") { openDemo(.student) }
                    ReppyButton(title: "Закрыть", compact: true) { demoOpen = false }
                }
            }
        }
        .task(id: store.invitation) {
            preview = nil; invitationError = nil
            guard let token = store.invitationToken, let api = store.api else { return }
            do {
                try await Task.sleep(for: .milliseconds(400))
                let next: InvitationPreview = try await api.rpc("get_student_invitation_preview", ["p_token": token], authenticated: false)
                if !Task.isCancelled, store.invitationToken == token { preview = next }
            } catch {
                if !Task.isCancelled, store.invitationToken == token { invitationError = "Приглашение недоступно или истекло. Попроси тренера проверить ссылку." }
            }
        }
    }
    private func openDemo(_ role: Role) {
        do { demoOpen = false; try store.openDemo(role) } catch { store.present(error) }
    }
}
