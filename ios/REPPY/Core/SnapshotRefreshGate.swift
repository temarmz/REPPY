import Foundation

/// Tracks pending server events independently of an editor's error state.
/// A write invalidates older reads; an event received while busy stays pending.
public struct SnapshotRefreshGate: ReppySendable {
    public private(set) var revision: UInt64 = 0
    public private(set) var pending = false
    private var active: UInt64?
    public init() {}
    public mutating func request() { pending = true }
    public mutating func invalidate() {
        revision &+= 1
        if active != nil { pending = true }
    }
    public mutating func reset() { revision &+= 1; active = nil; pending = false }
    public mutating func begin(allowed: Bool) -> UInt64? {
        guard allowed, pending, active == nil else { return nil }
        pending = false; active = revision; return revision
    }
    public func accepts(_ ticket: UInt64) -> Bool { ticket == revision }
    public mutating func finish(_ ticket: UInt64) {
        if active == ticket { active = nil }
    }
}
