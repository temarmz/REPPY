import SwiftUI

struct ProfileScreen: View {
    @EnvironmentObject private var store: AppStore
    @AppStorage("appearance") private var appearance = "system"
    @State private var confirmSignOut = false
    var body: some View {
        ReppyPage(back: true, title: "Профиль") {
            ReppyProfileIdentity(name: store.profile?.display_name ?? "", role: store.isTrainer ? "Тренер" : "Ученик", student: store.isTrainer ? nil : store.ownStudent)
            if !store.isTrainer, !store.ownRelationshipIDs.isEmpty {
                ForEach(store.data.relationships.filter { store.ownRelationshipIDs.contains($0.id) }) { relationship in
                    ReppyHeading(text: store.data.trainerName(for: relationship.id) ?? "Тренер")
                    ReppySubscriptionSummary(balance: store.data.balance(relationship.id), entries: store.data.subscriptions.filter { $0.relationship_id == relationship.id })
                }
            }
            ReppyHeading(text: "Настройки")
            ReppyAppearancePicker(selection: $appearance)
            if store.isTrainer {
                ReppyLink(title: "Библиотека упражнений", icon: "dumbbell") { ExerciseLibraryScreen() }
                ReppyLink(title: "Открыть дизайн-кит", icon: "square.grid.2x2") { DesignKitScreen() }
            }
            ReppyTelegramStatus()
            ReppyDiagnosticExport()
            ReppyButton(title: store.isDemo ? "Выйти из демо" : "Выйти из аккаунта", kind: .danger, disabled: store.busy) { confirmSignOut = true }
        }.confirmationDialog("Выйти из аккаунта? Черновики останутся на этом iPhone и будут доступны после входа в тот же аккаунт.", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Выйти", role: .destructive) { Task { await store.signOut() } }
            Button("Отмена", role: .cancel) {}
        }
    }
}
struct TelegramConnectionScreen: View {
    var body: some View { ReppyPage(back: true, title: "Telegram") { ReppyTelegramStatus() } }
}
