import Foundation

/// Fetches a complete account snapshot. The caller decides whether it is still current.
@MainActor struct AppSnapshotLoader {
    let api: SupabaseAPI

    func profile() async throws -> Profile {
        guard let id = api.session?.user.id else { throw APIError.signedOut }
        let rows: [Profile] = try await api.rows("profiles", query: ["id": "eq.\(id)"])
        guard let profile = rows.first else { throw APIError.message("Профиль аккаунта не найден.") }
        return profile
    }

    func data(for role: Role) async throws -> AppData {
        async let students: [Student] = api.rows("students")
        async let relationships: [Relationship] = api.rows("trainer_student_relationships")
        async let assignments: [Assignment] = api.rows("assignments")
        async let sessions: [WorkoutSession] = api.rows("workout_sessions")
        async let results: [SetResult] = api.rows("set_results")
        async let definitions: [ExerciseDefinition] = api.rows("exercise_definitions", query: ["archived_at": "is.null"])
        let subscriptions: [SubscriptionEntry]
        if role == .trainer { subscriptions = try await api.rpc("get_trainer_subscription_entries") }
        else { subscriptions = try await api.rows("subscription_entries") }
        var snapshot = AppData()
        snapshot.students = try await students
        snapshot.relationships = try await relationships
        snapshot.assignments = try await assignments
        snapshot.sessions = try await sessions
        snapshot.results = try await results
        snapshot.definitions = try await definitions
        snapshot.subscriptions = subscriptions
        try Task.checkCancellation()
        return snapshot
    }
}
