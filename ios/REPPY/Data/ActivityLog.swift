import Foundation

/// Session diagnostics contain event codes only; no account IDs, tokens or user content.
@MainActor enum ActivityLog {
    struct Entry: Codable { let at: Date; let event: String; let outcome: String }
    private static var entries: [Entry] = []
    static func record(_ event: String, outcome: String = "success") {
        let safe = String(event.prefix(100).filter { $0.isASCII && ($0.isLetter || $0.isNumber || ".-_():".contains($0)) })
        entries.append(Entry(at: .now, event: safe, outcome: outcome))
        if entries.count > 500 { entries.removeFirst(entries.count - 500) }
    }
    static func export() throws -> URL {
        record("diagnostics.export")
        struct Export: Encodable { let version = 1; let platform = "ios"; let scope = "current-app-session"; let events: [Entry] }
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]; encoder.dateEncodingStrategy = .iso8601
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("reppy-activity-log.json")
        try encoder.encode(Export(events: entries)).write(to: url, options: [.atomic, .completeFileProtection])
        return url
    }
}
