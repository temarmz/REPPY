import SwiftUI

struct StudentsScreen: View {
    @EnvironmentObject private var store: AppStore
    @State private var search = ""
    var body: some View {
        ReppyPage {
            if !store.data.students.isEmpty { ReppyLink(title: "Пригласить ученика", icon: "plus", kind: .primary) { InviteStudentScreen() } }
            if store.data.students.count > 8 { ReppySearch(text: $search) }
            let students = store.data.students.filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) }
            if students.isEmpty { ReppyEmpty(title: search.isEmpty ? "Учеников пока нет" : "Ничего не найдено", message: search.isEmpty ? "Пригласи первого ученика, чтобы составить ему план тренировок." : "Попробуй другое имя или очисти поиск.", icon: "person.2") }
            if store.data.students.isEmpty { ReppyLink(title: "Пригласить ученика", icon: "plus", kind: .primary) { InviteStudentScreen() } }
            ForEach(students) { student in
                if let relationship = store.data.relationship(for: student.id) {
                    ReppyStudentLink(name: student.name, status: status(relationship), balance: store.data.balance(relationship.id), hasSubscription: store.data.subscriptions.contains { $0.relationship_id == relationship.id }) { StudentScreen(studentID: student.id) }
                }
            }
        }.refreshable { await store.reload() }
    }
    private func status(_ relationship: Relationship) -> String {
        if relationship.status == "invited" { return "Ожидает приглашения" }
        let assignments = store.data.assignments.filter { $0.relationship_id == relationship.id }
        if let next = assignments.filter({ $0.status == "assigned" }).sorted(by: { $0.scheduled_for + ($0.scheduled_time ?? "") < $1.scheduled_for + ($1.scheduled_time ?? "") }).first {
            return "\(next.scheduleLabel) · \(next.workout_snapshot.name)"
        }
        let ids = Set(assignments.map(\.id))
        if let recent = store.data.sessions.filter({ ids.contains($0.assignment_id) && $0.completed_at != nil }).sorted(by: { ($0.completed_at ?? "") > ($1.completed_at ?? "") }).first { return "Завершил · \(recent.workout_snapshot.name)" }
        return "Нет назначений"
    }
}
struct StudentScreen: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.presentationMode) private var presentation
    var studentID: String
    @State private var section = "data"
    @State private var confirmDelete = false
    private var studentAvailable: Bool {
        store.data.students.contains(where: { $0.id == studentID }) && store.data.relationship(for: studentID) != nil
    }
    var body: some View {
        ReppyPage(back: true) {
            if let student = store.data.students.first(where: { $0.id == studentID }), let relationship = store.data.relationship(for: studentID) {
                ReppyTitle(text: student.name)
                ReppyStudentDetails(student: student)
                if relationship.status == "active" { ReppyProfileSegments(selection: $section) }
                if section == "progress" && relationship.status == "active" { ExerciseProgressSummary(relationshipID: relationship.id) }
                else {
                if relationship.status == "active" {
                ReppyHeading(text: "Предстоящие тренировки")
                ReppyLink(title: "Назначить тренировку", icon: "plus", kind: .primary) { StudentAssignmentPickerScreen(relationshipID: relationship.id) }
                let planned = store.data.assignments.filter { $0.relationship_id == relationship.id && $0.status == "assigned" }.sorted { $0.scheduled_for + ($0.scheduled_time ?? "") < $1.scheduled_for + ($1.scheduled_time ?? "") }
                if planned.isEmpty { ReppyEmpty(title: "Пока пусто", message: "Назначь тренировку прямо из профиля ученика и подстрой план под него.", icon: "calendar") }
                ForEach(planned) { assignment in
                    ReppyAgendaLink(title: assignment.workout_snapshot.name, subtitle: assignment.scheduleLabel) { AssignmentScreen(assignmentID: assignment.id) }
                }
                BalanceCard(relationshipID: relationship.id)
                ReppyHeading(text: "Последняя активность")
                let assignmentIDs = Set(store.data.assignments.filter { $0.relationship_id == relationship.id }.map(\.id))
                let recent = store.data.sessions.filter { assignmentIDs.contains($0.assignment_id) && $0.completed_at != nil }.sorted { ($0.completed_at ?? "") > ($1.completed_at ?? "") }
                if recent.isEmpty { ReppyEmpty(title: "Ещё нет результатов", message: "Завершённые тренировки ученика появятся в этом блоке.") }
                ForEach(Array(recent.prefix(3))) { session in
                    ReppyAgendaLink(title: session.workout_snapshot.name, subtitle: ReppyDate.display(session.completed_at ?? ""), completed: true) { SessionResultScreen(sessionID: session.id) }
                }
                ReppyLink(title: "История тренировок", icon: "clock.arrow.circlepath") { HistoryScreen(relationshipID: relationship.id, back: true) }
                } else {
                    ReppyEmpty(title: "Ожидает подключения", message: "Ученик ещё не принял приглашение.", icon: "person.2")
                    ReppyLink(title: "Создать новую ссылку приглашения", icon: "person.badge.plus") { InviteStudentScreen(existing: relationship, initialName: student.name) }
                    ReppyButton(title: "Удалить ученика", icon: "trash", kind: .danger, disabled: store.busy) { confirmDelete = true }
                }
                }
            }
        }
        .onAppear { returnToListIfMissing() }
        .onChange(of: studentAvailable) { _, _ in returnToListIfMissing() }
        .onChange(of: store.busy) { _, _ in returnToListIfMissing() }
        .confirmationDialog("Удалить приглашённого ученика? Ссылка перестанет действовать.", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Удалить ученика", role: .destructive) { Task { if await store.run({ try await store.deletePendingStudent(studentID) }) { presentation.wrappedValue.dismiss() } } }.accessibilityIdentifier("confirm-delete-pending-student")
            Button("Отмена", role: .cancel) {}
        }
    }
    private func returnToListIfMissing() {
        if !studentAvailable && !store.busy && !store.loading { presentation.wrappedValue.dismiss() }
    }
}
struct StudentDetailsCard: View {
    var student: Student
    var body: some View {
        ReppyCard {
            if let phone = student.phone, !phone.isEmpty { ReppyText(text: phone) }
            if let height = student.height_cm { ReppyText(text: "Рост: \(height.reppyNumber) см") }
            if let weight = student.weight_kg { ReppyText(text: "Вес: \(weight.reppyNumber) кг") }
            if let notes = student.contraindications, !notes.isEmpty { ReppyHeading(text: "Ограничения по здоровью"); ReppyText(text: notes, tone: .secondary) }
            if student.height_cm == nil && student.weight_kg == nil && (student.contraindications ?? "").isEmpty { ReppyCaption(text: "Личные данные ещё не заполнены.") }
        }
    }
}
struct StudentFormScreen: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State var student: Student
    @State private var height = ""
    @State private var weight = ""
    @State private var restored = false
    @State private var initialDraft: StudentFormDraft?
    var body: some View {
        ReppyPage(back: true, title: "Личные данные") {
            ReppyCard {
                ReppyField(title: "Имя", text: $student.name)
                ReppyField(title: "Телефон", text: Binding(get: { student.phone ?? "" }, set: { student.phone = $0 }), keyboard: .phonePad)
                ReppyField(title: "Рост, см", text: $height, keyboard: .decimalPad)
                ReppyField(title: "Вес, кг", text: $weight, keyboard: .decimalPad)
                ReppyPicker(title: "Пол", selection: Binding(get: { student.gender ?? "not-specified" }, set: { student.gender = $0 })) {
                    Text("Не указан").tag("not-specified"); Text("Мужской").tag("male"); Text("Женский").tag("female")
                }
                ReppyField(title: "Противопоказания и ограничения", text: Binding(get: { student.contraindications ?? "" }, set: { student.contraindications = $0 }), multiline: true)
            }
        }.reppyFormActions(busy: store.busy, hasChanges: initialDraft != nil && initialDraft != StudentFormDraft(student: student, height: height, weight: weight), save: {
                Task {
                    let saved = await store.run {
                        let edited = try StudentFormDraft(student: student, height: height, weight: weight).validatedStudent()
                        try await store.saveStudent(edited)
                        try DraftStorage.remove(account: store.accountKey, key: "student:\(student.id)")
                    }
                    if saved { dismiss() }
                }
            }, discard: {
                do { try DraftStorage.remove(account: store.accountKey, key: "student:\(student.id)"); dismiss() } catch { store.present(error) }
            }).onAppear {
            guard !restored else { return }; restored = true
            initialDraft = StudentFormDraft(student: student, height: student.height_cm?.reppyNumber ?? "", weight: student.weight_kg?.reppyNumber ?? "")
            if let draft: StudentFormDraft = store.restoreDraft(key: "student:\(student.id)") { student = draft.student; height = draft.height; weight = draft.weight }
            else { height = student.height_cm?.reppyNumber ?? ""; weight = student.weight_kg?.reppyNumber ?? "" }
        }.onChange(of: student) { _, _ in saveDraft() }.onChange(of: height) { _, _ in saveDraft() }.onChange(of: weight) { _, _ in saveDraft() }
        .onDisappear { /* A successful save explicitly removes the draft. */ }
    }
    private func saveDraft() {
        let draft = StudentFormDraft(student: student, height: height, weight: weight)
        do { try DraftStorage.save(draft, account: store.accountKey, key: "student:\(student.id)") } catch { store.present(error) }
    }
}
struct InviteStudentScreen: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    var existing: Relationship? = nil
    var initialName = ""
    @State private var name = ""
    @State private var invitation: StudentInvitationLink?
    @State private var initialized = false
    private var draftKey: String { "invitation:" + (existing?.id ?? "new") }
    var body: some View {
        ReppyPage(back: true, title: invitation == nil ? "Пригласить ученика" : "Ссылка готова") {
            ReppyCaption(text: "Новый участник команды")
            if let invitation {
                ReppyInvitationReady(name: name, link: invitation.link, expiresAt: invitation.expiresAt, demo: store.isDemo) { dismiss() }
            } else {
              ReppyCard {
                if existing == nil { ReppyField(title: "Имя ученика", text: $name) }
                else { ReppyStudentContext(name: initialName) }
                ReppyCaption(text: "Мы добавим ученика в список со статусом «Ожидает приглашения».")
                    ReppyButton(title: store.busy ? "Создаём…" : "Продолжить", icon: "arrow.right", kind: .primary, disabled: store.busy || name.trimmingCharacters(in: .whitespacesAndNewlines).count < 2) {
                        Task { await store.run {
                            invitation = try await store.createInvitation(name: name, existing: existing)
                            try DraftStorage.remove(account: store.accountKey, key: draftKey)
                        } }
                    }
              }
            }
        }.onAppear {
            guard !initialized else { return }; initialized = true
            if existing == nil, let restored: String = store.restoreDraft(key: draftKey) { name = restored } else { name = initialName }
        }.onChange(of: name) { _, _ in
            guard initialized, invitation == nil else { return }
            do { try DraftStorage.save(name, account: store.accountKey, key: draftKey) } catch { store.present(error) }
        }
    }
}
