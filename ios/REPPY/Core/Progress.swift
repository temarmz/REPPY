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
}
public struct ProgressGroup: Identifiable, ReppySendable {
    public var id: String { exercise.progressKey }
    public var exercise: WorkoutExercise
    public var points: [ProgressPoint]
}
public enum ExerciseProgress {
    public static func collect(data: AppData, relationshipID: String) -> [ProgressGroup] {
        let ids = Set(data.assignments.filter { $0.relationship_id == relationshipID }.map { $0.id })
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
            var group = group; group.points.sort { $0.date > $1.date }
            if let point = group.points.first { group.exercise = point.exercise }
            return group
        }.sorted { ($0.points.first?.date ?? .distantPast) > ($1.points.first?.date ?? .distantPast) }
    }
}
