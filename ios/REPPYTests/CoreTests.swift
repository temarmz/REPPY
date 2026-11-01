import XCTest
#if canImport(ReppyCore)
@testable import ReppyCore
#else
@testable import REPPY
#endif

final class CoreTests: XCTestCase {
    func testSessionChargeUsesItsRelationshipLedgerAndRecognizesRefunds() throws {
        var data = try fixture()
        let session = try XCTUnwrap(data.sessions.first { session in
            session.charge_status == nil && data.subscriptions.contains { $0.kind == "session-charge" && $0.session_id == session.id }
        })
        let charge = try XCTUnwrap(data.subscriptions.first { $0.kind == "session-charge" && $0.session_id == session.id })
        XCTAssertTrue(data.isSessionCharged(session.id))
        var refund = charge; refund.id = "refund"; refund.kind = "session-refund"; refund.lesson_delta = 1
        refund.relationship_id = "unrelated"; data.subscriptions.append(refund)
        XCTAssertTrue(data.isSessionCharged(session.id))
        refund.id = "matching-refund"; refund.relationship_id = charge.relationship_id; data.subscriptions.append(refund)
        XCTAssertFalse(data.isSessionCharged(session.id))
        XCTAssertFalse(data.isSessionCharged("unknown-session"))
    }
    func testDemoPaymentDatesPreserveTheirDistanceFromTheAnchorDay() throws {
        let data = try fixture()
        let payment = try XCTUnwrap(data.subscriptions.first { $0.kind == "payment" })
        XCTAssertEqual(payment.occurred_at.count, 10)
        let anchor = ReppyDate.fromDay(try XCTUnwrap(data.demoDay))
        let target = try XCTUnwrap(Calendar.current.date(byAdding: .day, value: 2, to: anchor))
        let rebased = data.rebasedDemo(today: target)
        let moved = try XCTUnwrap(rebased.subscriptions.first { $0.id == payment.id })
        XCTAssertEqual(moved.occurred_at, ReppyDate.day(try XCTUnwrap(Calendar.current.date(byAdding: .day, value: 2, to: ReppyDate.fromDay(payment.occurred_at)))))
    }
    func testProgressOrderIsStableForEqualCompletionDates() throws {
        var data = try fixture()
        let relationship = try XCTUnwrap(data.relationships.first)
        data.sessions = data.sessions.map { var session = $0; session.completed_at = "2026-10-29T09:00:00Z"; return session }
        let forward = ExerciseProgress.collect(data: data, relationshipID: relationship.id)
        XCTAssertGreaterThan(forward.count, 1)
        data.sessions.reverse()
        let reversed = ExerciseProgress.collect(data: data, relationshipID: relationship.id)
        XCTAssertEqual(forward.map(\.id), reversed.map(\.id))
        XCTAssertEqual(forward.map { $0.points.map(\.id) }, reversed.map { $0.points.map(\.id) })
        let names = forward.map { $0.exercise.name }
        XCTAssertEqual(names, names.sorted { $0.compare($1, locale: Locale(identifier: "ru_RU")) == .orderedAscending })
    }
    func testProgressComparisonUsesOneActualSetAndDistinguishesMixedChanges() throws {
        let data = try fixture()
        let session = try XCTUnwrap(data.sessions.first)
        var exercise = try XCTUnwrap(session.workout_snapshot.exercises.first)
        exercise.loadMode = .external; exercise.measureType = .reps
        let latest = [SetResult(session_id: session.id, exercise_instance_id: exercise.id, set_number: 1, actual_reps: 8, actual_weight: 80, completed: true),
                      SetResult(session_id: session.id, exercise_instance_id: exercise.id, set_number: 2, actual_reps: 15, actual_weight: 70, completed: true)]
        var previous = latest[0]; previous.actual_weight = 75; previous.actual_reps = 10
        var group = ProgressGroup(exercise: exercise, points: [ProgressPoint(session: session, exercise: exercise, results: latest), ProgressPoint(session: session, exercise: exercise, results: [previous])])
        let comparison = try XCTUnwrap(ProgressComparison(group))
        XCTAssertEqual(comparison.latest.actual_weight, 80); XCTAssertEqual(comparison.latest.actual_reps, 8)
        XCTAssertEqual(comparison.weightChange, 5); XCTAssertEqual(comparison.amountChange, -2); XCTAssertEqual(comparison.trend, .mixed)
        group.points[1].results = [latest[0]]
        XCTAssertEqual(ProgressComparison(group)?.trend, .flat)
        group.points.removeLast()
        XCTAssertNil(ProgressComparison(group)?.previous); XCTAssertEqual(ProgressComparison(group)?.trend, ProgressComparison.Trend.none)
        group.exercise.loadMode = .bodyweight
        group.points[0].exercise.loadMode = .bodyweight
        XCTAssertEqual(ProgressComparison(group)?.latest.actual_reps, 15)
        XCTAssertEqual(ProgressComparison(group)?.weightChange, 0)
    }
    func testInvitationParsingAcceptsCurrentLinksAndRejectsUnrelatedURLs() {
        let token = String(repeating: "a", count: 43)
        XCTAssertEqual(InvitationToken.parse(token), token)
        XCTAssertEqual(InvitationToken.parse("https://temarmz.github.io/REPPY/#/invite/" + token), token)
        XCTAssertEqual(InvitationToken.parse("reppy://invite?token=" + token), token)
        XCTAssertNil(InvitationToken.parse("https://evil.test/REPPY/#/invite/" + token))
        XCTAssertNil(InvitationToken.parse("")); XCTAssertNil(InvitationToken.parse("short"))
    }
    private func fixture() throws -> AppData {
        try TestFixtures.load()
    }
    func testWebSnapshotDecodesAndRoundTripsWithoutLosingExercises() throws {
        let data = try fixture()
        XCTAssertEqual(data.students.count, 3); XCTAssertEqual(data.definitions.count, 92)
        XCTAssertFalse(data.sessions.isEmpty)
        let restored = try JSONDecoder().decode(AppData.self, from: JSONEncoder().encode(data))
        XCTAssertEqual(data.assignments.map { $0.workout_snapshot }, restored.assignments.map { $0.workout_snapshot })
        XCTAssertEqual(data.results, restored.results)
        for exercise in restored.assignments.flatMap({ $0.workout_snapshot.exercises }) {
            XCTAssertEqual(Set(exercise.plannedSets.map { $0.id }).count, exercise.plannedSets.count)
        }
        let definitions = Set(data.definitions.map { $0.id })
        XCTAssertTrue(data.assignments.flatMap { $0.workout_snapshot.exercises }.allSatisfy { definitions.contains($0.exerciseId) })
    }
    func testRepeatingWorkoutPreservesLibraryIDsAndDoesNotMutateHistory() throws {
        let original = try XCTUnwrap(fixture().sessions.first).workout_snapshot
        let repeated = original.repeated()
        XCTAssertNotEqual(original.id, repeated.id)
        XCTAssertEqual(original.exercises.map { $0.exerciseId }, repeated.exercises.map { $0.exerciseId })
        XCTAssertTrue(zip(original.exercises, repeated.exercises).allSatisfy { $0.id != $1.id && $0.plannedSets == $1.plannedSets })
        var changed = repeated; changed.exercises[0].plannedSets[0].targetWeight = 999
        XCTAssertNotEqual(changed.exercises[0].plannedSets, original.exercises[0].plannedSets)
    }
    func testStudentCanStartOnlineAnyDayAndInPersonOnlyOnScheduledDay() throws {
        let data = try fixture(); var assignment = try XCTUnwrap(data.assignments.first { $0.status == "assigned" })
        assignment.format = .inPerson
        XCTAssertTrue(assignment.canStart(as: .student, sessions: [], today: assignment.scheduled_for))
        XCTAssertFalse(assignment.canStart(as: .student, sessions: [], today: "2099-01-01"))
        XCTAssertTrue(assignment.canStart(as: .trainer, sessions: [], today: "2099-01-01"))
        assignment.format = .online
        XCTAssertTrue(assignment.canStart(as: .student, sessions: [], today: "2099-01-01"))
        assignment.status = "completed"
        XCTAssertFalse(assignment.canStart(as: .trainer, sessions: [], today: assignment.scheduled_for))
    }
    func testStudentCanResumeAnActiveInPersonSessionAfterMidnight() throws {
        let data = try fixture(); var assignment = try XCTUnwrap(data.assignments.first)
        var session = try XCTUnwrap(data.sessions.first)
        assignment.status = "assigned"; assignment.format = .inPerson
        session.assignment_id = assignment.id; session.completed_at = nil
        XCTAssertTrue(assignment.canStart(as: .student, sessions: [session], today: "2099-01-01"))
    }
    func testBalancesAreLedgerSumsAndAllowDebt() throws {
        var data = try fixture(); let relationship = try XCTUnwrap(data.relationships.first)
        var entry = try XCTUnwrap(data.subscriptions.first)
        entry.relationship_id = relationship.id; entry.lesson_delta = -3; data.subscriptions = [entry]
        XCTAssertEqual(data.balance(relationship.id), -3)
        var payment = entry; payment.id = "new-payment"; payment.lesson_delta = 8
        data.subscriptions.append(payment); XCTAssertEqual(data.balance(relationship.id), 5)
        XCTAssertEqual(data.balance("unrelated"), 0)
    }
    func testDecimalCommaAndInvalidInput() {
        XCTAssertEqual(ReppyValidation.number(" 75,25 "), 75.25)
        XCTAssertEqual(ReppyValidation.number("0"), 0)
        for text in ["", "-1", "nan", "inf", "1,2,3", "abc"] { XCTAssertNil(ReppyValidation.number(text), text) }
        XCTAssertEqual(ReppyValidation.integer(10), 10)
        for value in [Double.infinity, Double.nan, 1e40, 10.5, -1] { XCTAssertEqual(ReppyValidation.integer(value), -1) }
    }
    func testLostAcknowledgementRecognizesOnlyEquivalentDatabaseFields() {
        XCTAssertTrue(DatabaseAcknowledgement.matches(row: ["name": "План", "revision": 2, "scheduled_time": "18:00:00"], intended: ["name": "План", "scheduled_time": "18:00"]))
        XCTAssertTrue(DatabaseAcknowledgement.matches(row: ["amount_rub": 75.26], intended: ["amount_rub": 75.255]))
        XCTAssertTrue(DatabaseAcknowledgement.matches(row: ["occurred_at": "2026-10-29T09:00:00+00:00"], intended: ["occurred_at": "2026-10-29T09:00:00Z"]))
        XCTAssertFalse(DatabaseAcknowledgement.matches(row: ["name": "Другой план", "revision": 2], intended: ["name": "План"]))
        XCTAssertFalse(DatabaseAcknowledgement.matches(row: [:], intended: ["name": "План"]))
        XCTAssertFalse(DatabaseAcknowledgement.matches(row: ["name": NSNull()], intended: ["name": "План"]))
        XCTAssertFalse(DatabaseAcknowledgement.matches(row: ["occurred_at": "2026-10-29T09:00:00.100Z"], intended: ["occurred_at": "2026-10-29T09:00:00.200Z"]))
    }
    func testEmptyPlansAreSupportedAndInvalidSetsAreRejected() throws {
        XCTAssertNil(ReppyValidation.workout(Workout(name: "Пустой план")))
        var workout = try XCTUnwrap(fixture().assignments.first).workout_snapshot
        workout.exercises[0].plannedSets[0].targetReps = 0
        XCTAssertNotNil(ReppyValidation.workout(workout))
        workout.exercises[0].plannedSets[0].targetReps = 10; workout.exercises[0].plannedSets[0].targetWeight = .infinity
        XCTAssertNotNil(ReppyValidation.workout(workout))
    }
    func testProgressUsesOnlyCompletedValidSetsAndSeparatesMeasurementModes() throws {
        var data = try fixture(); let relationship = try XCTUnwrap(data.relationships.first { $0.student_id == "artem" })
        let groups = ExerciseProgress.collect(data: data, relationshipID: relationship.id)
        XCTAssertFalse(groups.isEmpty)
        XCTAssertTrue(groups.allSatisfy { !$0.points.isEmpty })
        data.results = data.results.map { result in var result = result; result.completed = false; return result }
        XCTAssertTrue(ExerciseProgress.collect(data: data, relationshipID: relationship.id).isEmpty)
    }
    func testProgressDoesNotIncludeAnotherStudent() throws {
        let data = try fixture()
        XCTAssertTrue(ExerciseProgress.collect(data: data, relationshipID: "unknown").isEmpty)
        let ids = Set(data.relationships.filter { $0.student_id == "artem" }.map { $0.id })
        let groups = ExerciseProgress.collect(data: data, relationshipID: try XCTUnwrap(ids.first))
        for group in groups { for point in group.points { XCTAssertTrue(data.assignments.contains { ids.contains($0.relationship_id) && $0.id == point.session.assignment_id }) } }
    }
    func testDemoRebasesCalendarAndPreservesBalancesAndSnapshots() throws {
        let data = try fixture(); let date = ReppyDate.fromDay("2027-02-14")
        let rebased = data.rebasedDemo(today: date)
        XCTAssertEqual(rebased.demoDay, "2027-02-14")
        XCTAssertTrue(rebased.assignments.contains { $0.scheduled_for == "2027-02-14" })
        XCTAssertEqual(data.assignments.map { $0.workout_snapshot }, rebased.assignments.map { $0.workout_snapshot })
        for relationship in data.relationships { XCTAssertEqual(data.balance(relationship.id), rebased.balance(relationship.id)) }
    }
    func testDateParsingHandlesFractionalAndPlainUTCTimestamps() {
        XCTAssertNotNil(ReppyDate.parse("2026-10-29T09:00:00Z"))
        XCTAssertNotNil(ReppyDate.parse("2026-10-29T09:00:00.123+00:00"))
        XCTAssertNil(ReppyDate.parse("not a date"))
        XCTAssertEqual(ReppyDate.day(ReppyDate.fromDay("2026-10-29")), "2026-10-29")
    }
    func testBodyweightAndDurationProgressNeverUsesExternalWeightAsMetric() throws {
        var data = try fixture(); let definition = try XCTUnwrap(data.definitions.first)
        var exercise = WorkoutExercise(definition: definition); exercise.loadMode = .bodyweight; exercise.measureType = .duration
        exercise.plannedSets = [SetPlan(targetReps: 60, targetWeight: 0)]
        var session = try XCTUnwrap(data.sessions.first); session.workout_snapshot.exercises = [exercise]
        var result = try XCTUnwrap(data.results.first); result.session_id = session.id; result.exercise_instance_id = exercise.id
        result.set_number = 1; result.actual_reps = 60; result.actual_weight = 500; result.completed = true
        data.sessions = [session]; data.results = [result]
        let assignment = try XCTUnwrap(data.assignments.first { $0.id == session.assignment_id })
        let point = try XCTUnwrap(ExerciseProgress.collect(data: data, relationshipID: assignment.relationship_id).first?.points.first)
        XCTAssertEqual(point.maximum, 60); XCTAssertEqual(point.total, 60)
    }
}
