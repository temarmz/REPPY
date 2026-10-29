import XCTest
#if canImport(ReppyCore)
@testable import ReppyCore
#else
@testable import REPPY
#endif

final class RefreshGateTests: XCTestCase {
    func testEventWhileBusyStaysPending() throws {
        var gate = SnapshotRefreshGate(); gate.request()
        XCTAssertNil(gate.begin(allowed: false)); XCTAssertTrue(gate.pending)
        let ticket = try XCTUnwrap(gate.begin(allowed: true))
        XCTAssertTrue(gate.accepts(ticket)); XCTAssertFalse(gate.pending)
    }
    func testWriteInvalidatesInFlightReadAndRequiresAnotherSnapshot() throws {
        var gate = SnapshotRefreshGate(); gate.request()
        let old = try XCTUnwrap(gate.begin(allowed: true)); gate.invalidate()
        XCTAssertFalse(gate.accepts(old)); XCTAssertTrue(gate.pending)
        XCTAssertNil(gate.begin(allowed: true))
        gate.finish(old)
        let next = try XCTUnwrap(gate.begin(allowed: true)); XCTAssertNotEqual(old, next)
    }
    func testEventDuringReadIsCoalescedIntoOneFollowup() throws {
        var gate = SnapshotRefreshGate(); gate.request()
        let ticket = try XCTUnwrap(gate.begin(allowed: true))
        gate.request(); gate.request(); XCTAssertNil(gate.begin(allowed: true))
        gate.finish(ticket)
        let followup = try XCTUnwrap(gate.begin(allowed: true))
        gate.finish(followup); XCTAssertNil(gate.begin(allowed: true))
    }
    func testAccountResetRejectsOldReadWithoutFinishingNewAccountsRead() throws {
        var gate = SnapshotRefreshGate(); gate.request()
        let old = try XCTUnwrap(gate.begin(allowed: true))
        gate.reset(); gate.request()
        let next = try XCTUnwrap(gate.begin(allowed: true))
        gate.finish(old)
        XCTAssertFalse(gate.accepts(old)); XCTAssertTrue(gate.accepts(next))
        gate.request(); XCTAssertNil(gate.begin(allowed: true))
        gate.finish(next); XCTAssertNotNil(gate.begin(allowed: true))
    }
}
