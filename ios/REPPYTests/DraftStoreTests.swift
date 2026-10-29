import XCTest
#if canImport(ReppyCore)
@testable import ReppyCore
#else
@testable import REPPY
#endif

final class DraftStoreTests: XCTestCase {
    private var root: URL!
    private var store: FileDraftStore!
    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent("reppy-drafts-" + UUID().uuidString, isDirectory: true)
        store = FileDraftStore(root: root)
    }
    override func tearDownWithError() throws {
        if FileManager.default.fileExists(atPath: root.path) { try FileManager.default.removeItem(at: root) }
    }
    private func onlyFile() throws -> URL {
        let items = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)!.allObjects as! [URL]
        return try XCTUnwrap(items.first { $0.pathExtension == "json" })
    }
    func testMissingDraftIsDifferentFromInvalidDraft() throws {
        let absent: String? = try store.load(account: "account", key: "form")
        XCTAssertNil(absent)
        try store.remove(account: "account", key: "form")
        try store.save("unfinished text", account: "account", key: "form")
        let restored: String? = try store.load(account: "account", key: "form")
        XCTAssertEqual(restored, "unfinished text")
    }
    func testDraftsAreIsolatedAcrossAccountsAndForms() throws {
        try store.save("account A", account: "a", key: "form")
        try store.save("account B", account: "b", key: "form")
        try store.save("another form", account: "a", key: "other")
        let a: String? = try store.load(account: "a", key: "form")
        let b: String? = try store.load(account: "b", key: "form")
        XCTAssertEqual(a, "account A"); XCTAssertEqual(b, "account B")
        try store.remove(account: "a", key: "form")
        let other: String? = try store.load(account: "a", key: "other")
        XCTAssertEqual(other, "another form")
        let stillB: String? = try store.load(account: "b", key: "form")
        XCTAssertEqual(stillB, "account B")
    }
    func testCorruptDraftIsPreservedAndCannotBeOverwrittenUntilDiscarded() throws {
        try store.save("text", account: "a", key: "form")
        let url = try onlyFile(); let damaged = Data("broken JSON".utf8)
        try damaged.write(to: url)
        XCTAssertThrowsError(try store.load(account: "a", key: "form") as String?) { XCTAssertEqual($0 as? DraftStorageFailure, .corrupted) }
        XCTAssertThrowsError(try store.save("replacement", account: "a", key: "form"))
        XCTAssertEqual(try Data(contentsOf: url), damaged)
        try store.remove(account: "a", key: "form")
        try store.save("replacement", account: "a", key: "form")
        let restored: String? = try store.load(account: "a", key: "form")
        XCTAssertEqual(restored, "replacement")
    }
    func testNewerEnvelopeVersionIsPreserved() throws {
        try store.save("text", account: "a", key: "form")
        let url = try onlyFile()
        var envelope = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: Any]
        envelope["version"] = 2; let updated = try JSONSerialization.data(withJSONObject: envelope); try updated.write(to: url)
        XCTAssertThrowsError(try store.load(account: "a", key: "form") as String?) { XCTAssertEqual($0 as? DraftStorageFailure, .unsupportedVersion) }
        XCTAssertThrowsError(try store.save("replacement", account: "a", key: "form"))
        XCTAssertEqual(try Data(contentsOf: url), updated)
    }
    func testCopiedEnvelopeCannotImpersonateAnotherAccount() throws {
        try store.save("private text", account: "a", key: "form")
        let url = try onlyFile()
        var envelope = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: Any]
        envelope["account"] = "another"; try JSONSerialization.data(withJSONObject: envelope).write(to: url)
        XCTAssertThrowsError(try store.load(account: "a", key: "form") as String?) { XCTAssertEqual($0 as? DraftStorageFailure, .wrongIdentity) }
    }
    func testUnsafeIdentityCharactersNeverBecomePathComponents() throws {
        try store.save("text", account: "../../account", key: "../form/../key")
        let url = try onlyFile().standardizedFileURL
        XCTAssertTrue(url.path.hasPrefix(root.standardizedFileURL.path + "/"))
        let restored: String? = try store.load(account: "../../account", key: "../form/../key")
        XCTAssertEqual(restored, "text")
    }
    func testUnreadableFileIsNotTreatedAsAnAbsentDraft() throws {
        try store.save("text", account: "a", key: "form")
        let url = try onlyFile(); try FileManager.default.removeItem(at: url)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: false)
        XCTAssertThrowsError(try store.load(account: "a", key: "form") as String?)
    }
    func testRoundTripPreservesWorkoutMetadataAndFractionalWeights() throws {
        var workout = try XCTUnwrap(TestFixtures.load().assignments.first).workout_snapshot
        workout.exercises[0].plannedSets[0].targetWeight = 75.25
        workout.exercises[0].instructionText = "Длинная инструкция\nВторая строка"
        try store.save(workout, account: "a", key: "assignment")
        let restored: Workout? = try store.load(account: "a", key: "assignment")
        XCTAssertEqual(restored, workout)
    }
}
