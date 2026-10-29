import SwiftUI

struct SignInScreen: View {
    @EnvironmentObject private var store: AppStore
    @State private var preview: InvitationPreview?
    @State private var invitationError: String?
    private struct InvitationPreview: Decodable { var studentName: String; var trainerName: String; var expiresAt: String }
    var body: some View {
        ReppyPage {
            ReppyBrand()
            ReppyTitle(text: "Тренировки с твоим тренером", subtitle: "Планы, результаты и прогресс — в одном месте.")
            ReppyCard {
                if store.pendingRegistration {
                    ReppyHeading(text: "Создать кабинет тренера")
                    ReppyField(title: "Как тебя зовут", text: $store.registrationName)
                    ReppyButton(title: store.busy ? "Создаём кабинет…" : "Создать кабинет", kind: .primary,
                        disabled: store.busy || store.registrationName.trimmingCharacters(in: .whitespacesAndNewlines).count < 2) { Task { await store.login(register: true) } }
                    ReppyCaption(text: "Если ты ученик, вставь приглашение от своего тренера и войди заново.")
                } else {
                    ReppyHeading(text: "Войти в REPPY")
                    ReppyText(text: "Используй тот же Telegram, что и в веб-версии. Все тренировки уже будут здесь.", tone: .secondary)
                }
                ReppyField(title: "Приглашение от тренера, если есть", text: $store.invitation)
                if let preview {
                    ReppyHeading(text: "\(preview.studentName), тебя приглашает \(preview.trainerName)")
                    ReppyCaption(text: "Приглашение действует до \(ReppyDate.display(preview.expiresAt)). При входе будет создана связь с этим тренером.")
                }
                if let invitationError { ReppyStatus(message: invitationError, error: true) }
                ReppyButton(title: store.busy ? "Входим…" : "Войти через Telegram", icon: "paperplane", kind: .primary,
                    disabled: store.busy || store.api == nil) { Task { await store.login() } }
                if store.api == nil { ReppyCaption(text: "Рабочее подключение ещё не настроено. Для знакомства открой демо ниже.") }
            }
            ReppyCard {
                ReppyHeading(text: "Посмотреть приложение")
                ReppyCaption(text: "Изолированное демо. Изменения не затрагивают рабочие аккаунты.")
                ReppyButton(title: "Демо тренера", disabled: store.busy) { do { try store.openDemo(.trainer) } catch { store.present(error) } }
                ReppyButton(title: "Демо ученика", disabled: store.busy) { do { try store.openDemo(.student) } catch { store.present(error) } }
            }
        }.task(id: store.invitation) {
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
}
