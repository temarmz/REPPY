import Foundation

public struct ProgressPoint: Identifiable, ReppySendable {
    public var id: String { session.id }
    public var session: WorkoutSession
    public var exercise: WorkoutExercise
    public var results: [SetResult]
    public var date: Date { ReppyDate.parse(session.completed_at ?? "") ?? .distantPast }
    public var maximum: Double {
        results.map { exercise.loadMode == .external && exercise.measureType == .reps ? $0.actual_weight : Double($0.actual_reps) }.max() ?? 0
    }
    public var total: Double { results.reduce(0) { $0 + Double($1.actual_reps) } }
    public var bestSet: SetResult? {
        results.sorted { a, b in
            if exercise.loadMode == .external && exercise.measureType == .reps && a.actual_weight != b.actual_weight { return a.actual_weight > b.actual_weight }
            if a.actual_reps != b.actual_reps { return a.actual_reps > b.actual_reps }
            if exercise.loadMode == .external && a.actual_weight != b.actual_weight { return a.actual_weight > b.actual_weight }
            return a.set_number < b.set_number
        }.first
    }
}
public struct ProgressGroup: Identifiable, ReppySendable {
    public var id: String { exercise.progressKey }
    public var exercise: WorkoutExercise
    public var points: [ProgressPoint]
}
public enum ExerciseProgress {
    public static func collect(data: AppData, relationshipID: String) -> [ProgressGroup] {
        collect(data: data, relationshipIDs: [relationshipID])
    }
    public static func collect(data: AppData, relationshipIDs: Set<String>) -> [ProgressGroup] {
        let ids = Set(data.assignments.filter { relationshipIDs.contains($0.relationship_id) }.map { $0.id })
        var groups: [String: ProgressGroup] = [:]
        for session in data.sessions where ids.contains(session.assignment_id) && session.completed_at != nil {
            for exercise in session.workout_snapshot.exercises {
                let results = data.sessionResults(session.id).filter { $0.exercise_instance_id == exercise.id && $0.set_number > 0 && $0.set_number <= exercise.plannedSets.count && $0.valid(for: exercise) }
                guard !results.isEmpty else { continue }
                let key = exercise.progressKey
                if groups[key] == nil { groups[key] = ProgressGroup(exercise: exercise, points: []) }
                if let index = groups[key]!.points.firstIndex(where: { $0.session.id == session.id }) {
                    groups[key]!.points[index].results += results
                } else {
                    groups[key]!.points.append(ProgressPoint(session: session, exercise: exercise, results: results))
                }
            }
        }
        return groups.values.map { group in
            var group = group; group.points.sort { $0.date == $1.date ? $0.session.id > $1.session.id : $0.date > $1.date }
            if let point = group.points.first { group.exercise = point.exercise }
            return group
        }.sorted {
            let a = $0.points.first?.date ?? .distantPast, b = $1.points.first?.date ?? .distantPast
            if a != b { return a > b }
            let order = $0.exercise.name.compare($1.exercise.name, locale: Locale(identifier: "ru_RU"))
            return order == .orderedSame ? $0.id < $1.id : order == .orderedAscending
        }
    }
}
public struct ProgressComparison: ReppySendable {
    public enum Trend: ReppySendable { case none, flat, up, down, mixed }
    public var latest: SetResult
    public var previous: SetResult?
    public var weightChange: Double
    public var amountChange: Int
    public var trend: Trend {
        guard previous != nil else { return .none }
        if weightChange == 0 && amountChange == 0 { return .flat }
        if weightChange >= 0 && amountChange >= 0 { return .up }
        if weightChange <= 0 && amountChange <= 0 { return .down }
        return .mixed
    }
    public init?(_ group: ProgressGroup) {
        guard let latest = group.points.first?.bestSet else { return nil }
        self.latest = latest
        previous = group.points.dropFirst().first?.bestSet
        weightChange = previous.map { group.exercise.loadMode == .external ? ((latest.actual_weight - $0.actual_weight) * 1000).rounded() / 1000 : 0 } ?? 0
        amountChange = previous.map { latest.actual_reps - $0.actual_reps } ?? 0
    }
}
