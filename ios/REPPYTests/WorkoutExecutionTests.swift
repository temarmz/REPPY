import XCTest
#if canImport(ReppyCore)
@testable import ReppyCore
#else
@testable import REPPY
#endif

final class WorkoutExecutionTests: XCTestCase {
    func testUnfilledWebPlanCanSaveProgressButCannotCompleteAnEmptySet() throws {
        var workout = try XCTUnwrap(TestFixtures.load().assignments.first).workout_snapshot
        workout.exercises[0].plannedSets.append(SetPlan(targetReps: 0))
        XCTAssertNil(ReppyValidation.workout(workout))
        XCTAssertNil(ReppyValidation.workout(workout, allowUnfilledSets: true))
        var results = WorkoutExecution.initialResults(sessionID: "session", workout: workout)
        XCTAssertTrue(WorkoutExecution.validate(sessionID: "session", workout: workout, results: results))
        let index = try XCTUnwrap(results.firstIndex { $0.actual_reps == 0 })
        results[index].completed = true
        XCTAssertFalse(WorkoutExecution.validate(sessionID: "session", workout: workout, results: results))
        results[index].actual_reps = 20
        XCTAssertTrue(WorkoutExecution.validate(sessionID: "session", workout: workout, results: results))
        workout.exercises[0].plannedSets[0].targetReps = -1
        XCTAssertNotNil(ReppyValidation.workout(workout, allowUnfilledSets: true))
    }
    private struct Transition: Decodable {
        var name: String; var sessionID: String; var previous: Workout; var proposed: Workout
        var results: [SetResult]; var expectedWorkout: Workout; var expectedResults: [SetResult]; var expectedRepeatPlan: Workout
    }
    func testStructuralEditsMatchTheWebReducerIncludingCompletedWork() throws {
        let cases = try TestFixtures.load([Transition].self, name: "ExecutionContract")
        XCTAssertEqual(cases.count, 8)
        for test in cases {
            let next = WorkoutExecution.reconcile(sessionID: test.sessionID, previous: test.previous, proposed: test.proposed, results: test.results)
            var expected = test.expectedWorkout
            // The server revision is the native editing guard. Web's client-only
            // updatedAt timestamp is not part of the structural comparison.
            expected.updatedAt = test.proposed.updatedAt
            XCTAssertEqual(next.workout, expected, test.name)
            XCTAssertEqual(next.results, test.expectedResults, test.name)
            XCTAssertTrue(WorkoutExecution.validate(sessionID: test.sessionID, workout: next.workout, results: next.results), test.name)
        }
    }
    func testRepeatPlanMatchesWebActualResultsAndDoesNotChangeItsSource() throws {
        let cases = try TestFixtures.load([Transition].self, name: "ExecutionContract")
        for test in cases {
            let plan = WorkoutExecution.planFromActual(sessionID: test.sessionID, workout: test.previous, results: test.results)
            XCTAssertEqual(plan, test.expectedRepeatPlan, test.name)
            let repeatPlan = plan.repeated()
            XCTAssertNotEqual(plan.id, repeatPlan.id)
            XCTAssertEqual(plan.exercises.map { $0.plannedSets }, repeatPlan.exercises.map { $0.plannedSets })
        }
    }
    func testNewExercisesStartWithOneZeroSet() throws {
        let definition = try XCTUnwrap(TestFixtures.load().definitions.first)
        let exercise = WorkoutExercise(definition: definition)
        XCTAssertEqual(exercise.plannedSets, [SetPlan(targetReps: 0, targetWeight: 0)])
    }
    func testResultValidationRejectsDuplicatesWrongSessionAndMissingSets() throws {
        let workout = try XCTUnwrap(TestFixtures.load().assignments.first).workout_snapshot
        let valid = WorkoutExecution.initialResults(sessionID: "session", workout: workout)
        XCTAssertTrue(WorkoutExecution.validate(sessionID: "session", workout: workout, results: valid))
        var duplicate = valid; duplicate[1] = duplicate[0]
        XCTAssertFalse(WorkoutExecution.validate(sessionID: "session", workout: workout, results: duplicate))
        XCTAssertFalse(WorkoutExecution.validate(sessionID: "another-session", workout: workout, results: valid))
        XCTAssertFalse(WorkoutExecution.validate(sessionID: "session", workout: workout, results: Array(valid.dropLast())))
    }
    func testResultsFromAnotherSessionCannotLeakIntoThePlan() throws {
        let workout = try XCTUnwrap(TestFixtures.load().assignments.first).workout_snapshot
        var foreign = WorkoutExecution.initialResults(sessionID: "foreign", workout: workout)
        foreign[0].completed = true; foreign[0].actual_weight = 999
        let plan = WorkoutExecution.planFromActual(sessionID: "session", workout: workout, results: foreign)
        XCTAssertEqual(plan, workout)
        let next = WorkoutExecution.reconcile(sessionID: "session", previous: workout, proposed: workout, results: foreign)
        XCTAssertTrue(next.results.allSatisfy { $0.session_id == "session" && !$0.completed })
    }
}


extension WorkoutExecutionTests {
    func testCoachNotesAndStudentSetsMergeInBothDirections() throws {
        let workout = try XCTUnwrap(TestFixtures.load().assignments.first).workout_snapshot
        let base = ExecutionSnapshot(workout: workout, results: WorkoutExecution.initialResults(sessionID: "session", workout: workout))
        var coach = base; coach.workout.exercises[0].coachNote = "Keep your back straight"
        var student = base; student.results[0].completed = true; student.results[1].completed = true
        for (local, remote) in [(coach, student), (student, coach)] {
            let merged = try XCTUnwrap(WorkoutExecution.merge(base: base, local: local, remote: remote))
            XCTAssertEqual(merged.workout.exercises[0].coachNote, coach.workout.exercises[0].coachNote)
            XCTAssertTrue(merged.results[0].completed); XCTAssertTrue(merged.results[1].completed)
        }
    }
    func testIndependentEditsCanShareTheLastEditTimestamp() throws {
        var workout = try XCTUnwrap(TestFixtures.load().assignments.first).workout_snapshot
        workout.updatedAt = "2026-11-05T10:00:00Z"
        let base = ExecutionSnapshot(workout: workout, results: [])
        var local = base; local.workout.name = "Renamed"; local.workout.updatedAt = "2026-11-05T10:01:00Z"
        var remote = base; remote.workout.exercises[0].coachNote = "Remote"; remote.workout.updatedAt = "2026-11-05T10:02:00Z"
        let merged = try XCTUnwrap(WorkoutExecution.merge(base: base, local: local, remote: remote))
        XCTAssertEqual(merged.workout.name, "Renamed")
        XCTAssertEqual(merged.workout.exercises[0].coachNote, "Remote")
        XCTAssertEqual(merged.workout.updatedAt, remote.workout.updatedAt)
    }
    func testConflictingResultEditsRequireRecovery() throws {
        let workout = try XCTUnwrap(TestFixtures.load().assignments.first).workout_snapshot
        let base = ExecutionSnapshot(workout: workout, results: WorkoutExecution.initialResults(sessionID: "session", workout: workout))
        var local = base; local.results[0].actual_weight += 10
        var remote = base; remote.results[0].actual_weight += 20
        XCTAssertNil(WorkoutExecution.merge(base: base, local: local, remote: remote))
    }
    func testDeletingAnExerciseCannotDiscardConcurrentEdits() throws {
        let workout = try XCTUnwrap(TestFixtures.load().assignments.first).workout_snapshot
        let base = ExecutionSnapshot(workout: workout, results: WorkoutExecution.initialResults(sessionID: "session", workout: workout))
        var local = base; local.workout.exercises.removeFirst()
        var remote = base; remote.workout.exercises[0].coachNote = "Remote instruction"
        XCTAssertNil(WorkoutExecution.merge(base: base, local: local, remote: remote))
    }
    func testEditsQueuedDuringSavingKeepMergedRemoteValues() throws {
        let workout = try XCTUnwrap(TestFixtures.load().assignments.first).workout_snapshot
        let sent = ExecutionSnapshot(workout: workout, results: WorkoutExecution.initialResults(sessionID: "session", workout: workout))
        var pending = sent; pending.results[1].completed = true
        var acknowledged = sent; acknowledged.workout.exercises[0].coachNote = "Remote instruction"; acknowledged.results[0].completed = true
        let merged = try XCTUnwrap(WorkoutExecution.merge(base: sent, local: pending, remote: acknowledged))
        XCTAssertEqual(merged.workout.exercises[0].coachNote, "Remote instruction")
        XCTAssertTrue(merged.results[0].completed); XCTAssertTrue(merged.results[1].completed)
    }
}
