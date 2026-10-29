import Foundation

public struct ExecutionSnapshot: Codable, Equatable {
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
        let completed = previousResults.filter { $0.completed }
        let proposedIDs = Set(proposed.exercises.map { $0.id })
        func retainingCompletedSets(_ exercise: WorkoutExercise) -> WorkoutExercise {
            var exercise = exercise
            let last = completed.filter { $0.exercise_instance_id == exercise.id }.map { $0.set_number }.max() ?? 0
            let fallback = exercise.plannedSets.last ?? SetPlan()
            while exercise.plannedSets.count < last {
                exercise.plannedSets.append(SetPlan(targetReps: fallback.targetReps, targetWeight: fallback.targetWeight))
            }
            return exercise
        }
        var workout = proposed
        workout.exercises = proposed.exercises.map(retainingCompletedSets)
        // Removing an unfinished exercise is fine. Completed work remains in the
        // snapshot, even if a stale editor submits a structure without it.
        workout.exercises += previous.exercises.filter { exercise in
            !proposedIDs.contains(exercise.id) && completed.contains { $0.exercise_instance_id == exercise.id }
        }.map(retainingCompletedSets)
        let reconciled = workout.exercises.flatMap { exercise -> [SetResult] in
            let old = previous.exercises.first { $0.id == exercise.id }
            return exercise.plannedSets.enumerated().map { index, plan in
                guard var result = previousResults.first(where: { $0.exercise_instance_id == exercise.id && $0.set_number == index + 1 }) else {
                    return makeResult(sessionID: sessionID, exercise: exercise, number: index + 1, plan: plan)
                }
                guard !result.completed else { return result }
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
            $0.session_id == sessionID && $0.actual_reps >= 0 && $0.actual_weight.isFinite && $0.actual_weight >= 0
        }
    }

    private static func makeResult(sessionID: String, exercise: WorkoutExercise, number: Int, plan: SetPlan) -> SetResult {
        SetResult(session_id: sessionID, exercise_instance_id: exercise.id, set_number: number, actual_reps: plan.targetReps,
                  actual_weight: exercise.loadMode == .bodyweight ? 0 : plan.targetWeight, completed: false)
    }
}
