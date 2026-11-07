import Foundation

/// Session diagnostics contain event codes only; no account IDs, tokens or user content.
@MainActor enum ActivityLog {
    struct Entry: Codable { let at: Date; let event: String; let outcome: String }
    struct Operation: Codable {
        let at: Date; let operationId: String; let operation: String; let outcome: String
        let durationMs: Int; let status: Int?; let requestId: String?
    }
    static var release: String {
        if let revision = Bundle.main.object(forInfoDictionaryKey: "REPPY_RELEASE") as? String,
           !revision.isEmpty, !revision.contains("$(") { return revision }
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "development"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "local"
        return "ios-\(version)-\(build)"
    }
    private static var operations: [Operation] = []
    static func operation(_ operation: String, id: UUID, started: Date, outcome: String, status: Int? = nil, requestId: String? = nil) {
        operations.append(Operation(at: .now, operationId: id.uuidString.lowercased(), operation: operation, outcome: outcome,
            durationMs: max(0, Int(Date().timeIntervalSince(started) * 1000)), status: status,
            requestId: requestId.flatMap { UUID(uuidString: $0) == nil ? nil : $0 }))
        if operations.count > 200 { operations.removeFirst(operations.count - 200) }
    }
    private static var entries: [Entry] = []
    static func record(_ event: String, outcome: String = "success") {
        let safe = String(event.prefix(100).filter { $0.isASCII && ($0.isLetter || $0.isNumber || ".-_():".contains($0)) })
        entries.append(Entry(at: .now, event: safe, outcome: outcome))
        if entries.count > 500 { entries.removeFirst(entries.count - 500) }
    }
    static func export() throws -> URL {
        record("diagnostics.export")
        struct Export: Encodable { let version = 2; let release: String; let operations: [Operation]; let platform = "ios"; let scope = "current-app-session"; let events: [Entry] }
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]; encoder.dateEncodingStrategy = .iso8601
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("reppy-activity-log.json")
        try encoder.encode(Export(release: release, operations: operations, events: entries)).write(to: url, options: [.atomic, .completeFileProtection])
        return url
    }
}
