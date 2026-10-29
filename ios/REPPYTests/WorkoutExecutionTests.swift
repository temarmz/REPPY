import XCTest
#if canImport(ReppyCore)
@testable import ReppyCore
#else
@testable import REPPY
#endif

final class WorkoutExecutionTests: XCTestCase {
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
    func testNewExercisesStartWithNoUnrequestedSets() throws {
        let definition = try XCTUnwrap(TestFixtures.load().definitions.first)
        let exercise = WorkoutExercise(definition: definition)
        XCTAssertTrue(exercise.plannedSets.isEmpty)
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
