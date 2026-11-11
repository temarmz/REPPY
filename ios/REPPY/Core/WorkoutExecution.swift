import Foundation

public struct ExecutionSnapshot: Codable, Equatable, ReppySendable {
    public var workout: Workout
    public var results: [SetResult]
}

/// Mirrors updateSessionWorkout / workoutFromSession in app/reppy-data.ts.
public enum WorkoutExecution {
    public static func initialResults(sessionID: String, workout: Workout) -> [SetResult] {
        workout.exercises.flatMap { exercise in
            exercise.plannedSets.enumerated().map { index, plan in makeResult(sessionID: sessionID, exercise: exercise, number: index + 1, plan: plan) }
        }
    }

    public static func reconcile(sessionID: String, previous: Workout, proposed: Workout, results: [SetResult]) -> ExecutionSnapshot {
        let previousResults = results.filter { $0.session_id == sessionID }
        let workout = proposed
        let reconciled = workout.exercises.flatMap { exercise -> [SetResult] in
            let old = previous.exercises.first { $0.id == exercise.id }
            return exercise.plannedSets.enumerated().map { index, plan in
                guard var result = previousResults.first(where: { $0.exercise_instance_id == exercise.id && $0.set_number == index + 1 }) else {
                    return makeResult(sessionID: sessionID, exercise: exercise, number: index + 1, plan: plan)
                }
                let previousPlan = old.flatMap { $0.plannedSets.indices.contains(index) ? $0.plannedSets[index] : nil }
                // User-entered facts survive plan edits; untouched defaults follow
                // the new plan, just like the web client's reducer.
                if result.actual_reps == previousPlan?.targetReps { result.actual_reps = plan.targetReps }
                if result.actual_weight == previousPlan?.targetWeight { result.actual_weight = plan.targetWeight }
                return result
            }
        }
        return ExecutionSnapshot(workout: workout, results: reconciled)
    }

    public static func planFromActual(sessionID: String, workout: Workout, results: [SetResult]) -> Workout {
        var copy = workout
        copy.exercises = workout.exercises.map { exercise in
            var exercise = exercise
            exercise.plannedSets = exercise.plannedSets.enumerated().map { index, plan in
                guard let actual = results.first(where: { $0.session_id == sessionID && $0.exercise_instance_id == exercise.id && $0.set_number == index + 1 && $0.completed }) else { return plan }
                return SetPlan(targetReps: actual.actual_reps, targetWeight: exercise.loadMode == .bodyweight ? 0 : actual.actual_weight)
            }
            return exercise
        }
        return copy
    }

    public static func validate(sessionID: String, workout: Workout, results: [SetResult]) -> Bool {
        let expected = Set(workout.exercises.flatMap { exercise in exercise.plannedSets.indices.map { "\(exercise.id):\($0 + 1)" } })
        return expected.count == results.count && Set(results.map { $0.id }) == expected && results.allSatisfy {
            $0.session_id == sessionID && $0.actual_reps >= ($0.completed ? 1 : 0) && $0.actual_weight.isFinite && $0.actual_weight >= 0
        }
    }

    private static func makeResult(sessionID: String, exercise: WorkoutExercise, number: Int, plan: SetPlan) -> SetResult {
        SetResult(session_id: sessionID, exercise_instance_id: exercise.id, set_number: number, actual_reps: plan.targetReps,
                  actual_weight: exercise.loadMode == .bodyweight ? 0 : plan.targetWeight, completed: false)
    }
}


extension WorkoutExecution {
    private enum MergeError: Error { case conflict }

    /// Apply only edits relative to the acknowledged base; overlapping edits stop.
    public static func merge(base: ExecutionSnapshot, local: ExecutionSnapshot, remote: ExecutionSnapshot) -> ExecutionSnapshot? {
        do {
            let encoder = JSONEncoder()
            let old = try JSONSerialization.jsonObject(with: encoder.encode(base))
            let outgoing = try JSONSerialization.jsonObject(with: encoder.encode(local))
            let incoming = try JSONSerialization.jsonObject(with: encoder.encode(remote))
            guard let merged = try mergeJSON(base: old, local: outgoing, remote: incoming) else { return nil }
            return try JSONDecoder().decode(ExecutionSnapshot.self, from: JSONSerialization.data(withJSONObject: merged))
        } catch { return nil }
    }
    private static func sameJSON(_ lhs: Any?, _ rhs: Any?) -> Bool {
        if lhs == nil && rhs == nil { return true }
        guard let lhs = lhs as? NSObject, let rhs = rhs as? NSObject else { return false }
        return lhs.isEqual(rhs)
    }
    private static func mergeJSON(base: Any?, local: Any?, remote: Any?) throws -> Any? {
        if sameJSON(local, base) { return remote }
        if sameJSON(remote, base) || sameJSON(local, remote) { return local }
        if let base = base as? [String: Any], let local = local as? [String: Any], let remote = remote as? [String: Any] {
            var result: [String: Any] = [:]
            for key in Set(base.keys).union(local.keys).union(remote.keys) {
                if key == "updatedAt", let localTime = local[key] as? String, let remoteTime = remote[key] as? String {
                    result[key] = max(localTime, remoteTime)
                } else { result[key] = try mergeJSON(base: base[key], local: local[key], remote: remote[key]) }
            }
            return result
        }
        if let base = base as? [Any], let local = local as? [Any], let remote = remote as? [Any] {
            func identity(_ item: Any) -> String? {
                guard let item = item as? [String: Any] else { return nil }
                if let id = item["id"] as? String { return id }
                if let exercise = item["exercise_instance_id"] as? String, let number = item["set_number"] as? Int {
                    return exercise + ":" + String(number)
                }
                return nil
            }
            if (base + local + remote).allSatisfy({ identity($0) != nil }) {
                func index(_ items: [Any]) throws -> [String: Any] {
                    var result: [String: Any] = [:]
                    for item in items {
                        guard let id = identity(item), result[id] == nil else { throw MergeError.conflict }
                        result[id] = item
                    }
                    return result
                }
                let b = try index(base), l = try index(local), r = try index(remote)
                var items: [String: Any] = [:]
                for id in Set(b.keys).union(l.keys).union(r.keys) {
                    items[id] = try mergeJSON(base: b[id], local: l[id], remote: r[id])
                }
                guard let order = try mergeJSON(base: base.compactMap(identity), local: local.compactMap(identity), remote: remote.compactMap(identity)) as? [String] else { throw MergeError.conflict }
                return order.compactMap { items[$0] }
            }
            if base.count == local.count && base.count == remote.count {
                return try base.indices.map { try mergeJSON(base: base[$0], local: local[$0], remote: remote[$0]) ?? NSNull() }
            }
        }
        throw MergeError.conflict
    }
}
