import XCTest
#if canImport(ReppyCore)
@testable import ReppyCore
#else
@testable import REPPY
#endif

final class StudentFormTests: XCTestCase {
    func testRawInvalidInputSurvivesDraftRoundTripWithoutChangingSavedStudent() throws {
        let student = try XCTUnwrap(TestFixtures.load().students.first)
        let draft = StudentFormDraft(student: student, height: "182,5", weight: "75,2,3")
        let restored = try JSONDecoder().decode(StudentFormDraft.self, from: JSONEncoder().encode(draft))
        XCTAssertEqual(restored, draft); XCTAssertEqual(restored.student, student)
        XCTAssertThrowsError(try restored.validatedStudent())
    }
    func testValidValuesUseTheSameRangesAsTheWebAndDatabase() throws {
        let student = try XCTUnwrap(TestFixtures.load().students.first)
        let draft = StudentFormDraft(student: student, height: "182,5", weight: "75,25")
        let saved = try draft.validatedStudent()
        XCTAssertEqual(saved.height_cm, 182.5); XCTAssertEqual(saved.weight_kg, 75.25)
        for (height, weight) in [("0", "75"), ("261", "75"), ("182", "19.9"), ("182", "501")] {
            XCTAssertThrowsError(try StudentFormDraft(student: student, height: height, weight: weight).validatedStudent())
        }
    }
    func testOptionalFieldsCanBeClearedAndNameUsesDatabaseLimits() throws {
        var student = try XCTUnwrap(TestFixtures.load().students.first)
        let saved = try StudentFormDraft(student: student, height: " ", weight: "").validatedStudent()
        XCTAssertNil(saved.height_cm); XCTAssertNil(saved.weight_kg)
        for name in ["", "А", String(repeating: "А", count: 121)] {
            student.name = name
            XCTAssertNotNil(ReppyValidation.student(student))
        }
    }
}
