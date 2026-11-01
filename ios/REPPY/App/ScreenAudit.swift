#if DEBUG
import SwiftUI

// Deterministic, demo-only entry points for visual acceptance on Simulator.
// Release builds do not contain the audit host or its launch arguments.
struct ScreenAuditHost: View {
    static var route: String? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "--audit-screen"), arguments.indices.contains(index + 1) else { return nil }
        return arguments[index + 1]
    }
    @EnvironmentObject private var store: AppStore
    @StateObject private var notes = NotesStore()
    @State private var tab = AppTab.home
    @State private var pushed = false
    @State private var modal = false
    @State private var ready = false
    @State private var sessionID = ""
    @State private var workout = Workout()
    private var route: String { Self.route ?? "home" }
    private var relationship: Relationship? { store.data.relationships.first }
    private var assignment: Assignment? { store.data.assignments.first { $0.id == "assignment-artem-push-today" } }
    private var result: WorkoutSession? { store.data.sessions.first }
    private var modalRoutes: Set<String> { ["student-form", "instruction", "instruction-editor", "reorder", "structure", "exercise-picker"] }
    var body: some View {
        TabView(selection: $tab) {
            NavigationStack {
                DashboardScreen().navigationDestination(isPresented: $pushed) { destination }
            }.tabItem { Label("Главная", systemImage: "house") }.tag(AppTab.home)
            NavigationStack { CalendarScreen() }.tabItem { Label("Календарь", systemImage: "calendar") }.tag(AppTab.calendar)
            if store.isTrainer { NavigationStack { StudentsScreen() }.tabItem { Label("Ученики", systemImage: "person.2") }.tag(AppTab.clients) }
            NavigationStack { NotesScreen() }.tabItem { Label("Заметки", systemImage: "note.text") }.tag(AppTab.notes)
        }
        .environmentObject(notes)
        .sheet(isPresented: $modal) { NavigationStack { destination } }
        .task {
            guard !ready else { return }; ready = true
            if ProcessInfo.processInfo.arguments.contains("--audit-large-progress") { store.data = largeProgressHistory() }
            await notes.start(store: store)
            if ["active", "structure", "finish"].contains(route), let assignment {
                do { sessionID = try await store.startSession(assignment) } catch { store.present(error) }
            }
            workout = assignment?.workout_snapshot ?? Workout()
            if route == "invited", let index = store.data.relationships.firstIndex(where: { $0.id == relationship?.id }) { store.data.relationships[index].status = "invited" }
            if route == "long-editor", let index = store.data.assignments.firstIndex(where: { $0.id == assignment?.id }) {
                store.data.assignments[index].workout_snapshot.name = "Силовая тренировка на всё тело с акцентом на технику"
                for exerciseIndex in store.data.assignments[index].workout_snapshot.exercises.indices {
                    store.data.assignments[index].workout_snapshot.exercises[exerciseIndex].name += " с длинным пояснением техники выполнения"
                }
            }
            if route == "empty-library" { store.data.definitions = [] }
            if route == "empty-history" { store.data.assignments = [] }
            if route == "empty-progress" { store.data.sessions = []; store.data.results = [] }
            if route == "notes-conflict" {
                let day = notes.firstDay
                notes.drafts[day] = NoteDraft(content: "Мой текст: план на сегодня и наблюдения по технике.", revision: 1, mutationID: "audit")
                notes.conflicts[day] = PersonalNote(note_date: day, content: "Текст с другого устройства: обновлённый план.", revision: 2, mutation_id: "audit-server")
                notes.errors[day] = "Эта заметка изменилась на другом устройстве."
            }
            if route == "empty-home" { store.data.assignments = []; store.data.sessions = []; store.data.results = []; store.data.subscriptions = [] }
            if route == "error" { store.error = "Не удалось сохранить изменения. Проверь подключение и повтори попытку." }
            switch route {
            case "home", "empty-home", "error": break
            case "calendar": tab = .calendar
            case "students": tab = .clients
            case "notes", "notes-calendar", "notes-conflict": tab = .notes
            default: if modalRoutes.contains(route) { modal = true } else { pushed = true }
            }
        }
        .onDisappear { notes.stop() }
    }
    private func largeProgressHistory() -> AppData {
        var data = store.data
        guard var source = data.sessions.first(where: { session in
            session.completed_at != nil && data.assignments.contains { $0.id == session.assignment_id && (store.isTrainer || store.ownRelationshipIDs.contains($0.relationship_id)) }
        }), let exercise = source.workout_snapshot.exercises.first else { return data }
        let valid = data.sessionResults(source.id).filter { $0.exercise_instance_id == exercise.id && $0.valid(for: exercise) }
        guard !valid.isEmpty else { return data }
        source.workout_snapshot.exercises = (0..<30).map { index in
            var copy = exercise; copy.id = "stress-instance-\(index)"; copy.exerciseId = "stress-exercise-\(index)"
            copy.name = String(format: "Нагрузочное упражнение %02d", index + 1); return copy
        }
        data.sessions = []; data.results = []
        for index in 0..<156 {
            var session = source; session.id = "stress-session-\(index)"
            session.completed_at = ReppyDate.timestamp(Date().addingTimeInterval(-Double((156 - index) * 2 * 86400)))
            data.sessions.append(session)
            for item in session.workout_snapshot.exercises {
                for result in valid {
                    var copy = result; copy.session_id = session.id; copy.exercise_instance_id = item.id
                    copy.actual_weight += Double(index); data.results.append(copy)
                }
            }
        }
        return data
    }
    @ViewBuilder private var destination: some View {
        switch route {
        case "profile": ProfileScreen()
        case "student", "invited": if let student = store.data.students.first { StudentScreen(studentID: student.id) }
        case "student-form": if let student = store.data.students.first { StudentFormScreen(student: student) }
        case "invite", "invite-ready": InviteStudentScreen()
        case "repeat": if let relationship { StudentAssignmentPickerScreen(relationshipID: relationship.id) }
        case "editor", "long-editor": AssignmentEditorScreen(original: assignment)
        case "new-editor": AssignmentEditorScreen(relationshipID: relationship?.id)
        case "assignment", "reschedule": if let assignment { AssignmentScreen(assignmentID: assignment.id) }
        case "history", "empty-history": HistoryScreen(relationshipID: store.isTrainer ? relationship?.id : nil, back: true)
        case "result", "feedback": if let result { SessionResultScreen(sessionID: result.id) }
        case "progress", "empty-progress": ProgressScreen(relationshipID: relationship?.id)
        case "progress-detail": ProgressScreen(relationshipID: relationship?.id, exerciseKey: relationship.flatMap { store.progressGroups(relationshipIDs: [$0.id]).first?.id })
        case "ledger": if let relationship { SubscriptionHistoryScreen(relationshipID: relationship.id) }
        case "payment": if let relationship { PaymentFormScreen(relationshipID: relationship.id) }
        case "edit-payment": if let relationship { PaymentFormScreen(relationshipID: relationship.id, original: store.data.subscriptions.first { $0.kind == "payment" }) }
        case "library", "empty-library": ExerciseLibraryScreen()
        case "definition": DefinitionFormScreen()
        case "exercise-picker": ExercisePickerScreen { _ in }
        case "instruction": if let exercise = workout.exercises.first { InstructionScreen(exercise: exercise) }
        case "instruction-editor": if !workout.exercises.isEmpty { InstructionEditorScreen(exercise: $workout.exercises[0], relationshipID: relationship?.id ?? "") }
        case "reorder": ReppyExerciseOrderEditor(exercises: $workout.exercises)
        case "active", "finish": if !sessionID.isEmpty { ActiveWorkoutScreen(sessionID: sessionID) }
        case "structure": ActiveStructureScreen(workout: $workout, relationshipID: relationship?.id ?? "")
        case "telegram": TelegramConnectionScreen()
        case "design-kit": DesignKitScreen()
        default: EmptyView()
        }
    }
}
#endif
