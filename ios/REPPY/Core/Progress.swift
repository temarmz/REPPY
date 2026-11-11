import Foundation

public struct ProgressPoint: Identifiable, ReppySendable {
    public var id: String { session.id }
    public var session: WorkoutSession {
        didSet { date = ReppyDate.parse(session.completed_at ?? "") ?? .distantPast }
    }
    public var exercise: WorkoutExercise
    public var results: [SetResult]
    public private(set) var date: Date
    public init(session: WorkoutSession, exercise: WorkoutExercise, results: [SetResult], date: Date? = nil) {
        self.session = session; self.exercise = exercise; self.results = results
        self.date = date ?? ReppyDate.parse(session.completed_at ?? "") ?? .distantPast
    }
    public var maximum: Double {
        results.map { exercise.loadMode == .external && exercise.measureType == .reps ? $0.actual_weight : Double($0.actual_reps) }.max() ?? 0
    }
    public var total: Double { results.reduce(0) { $0 + Double($1.actual_reps) } }
    public var bestSet: SetResult? {
        results.sorted { a, b in
            if exercise.loadMode == .external && exercise.measureType == .reps && a.actual_weight != b.actual_weight { return a.actual_weight > b.actual_weight }
            if a.actual_reps != b.actual_reps { return a.actual_reps > b.actual_reps }
            if exercise.loadMode == .external && a.actual_weight != b.actual_weight { return a.actual_weight > b.actual_weight }
            return a.set_number < b.set_number
        }.first
    }
}
public struct ProgressGroup: Identifiable, ReppySendable {
    public var id: String { exercise.progressKey }
    public var exercise: WorkoutExercise
    public var points: [ProgressPoint]
}
public enum ExerciseProgress {
    public static func orderedGroups(_ groups: [ProgressGroup], prioritizeGains: Bool = false, now: Date = Date()) -> [ProgressGroup] {
        let ranked = groups.compactMap { group -> (group: ProgressGroup, latest: ProgressPoint, gain: Bool, position: Int)? in
            var group = group
            group.points = group.points.filter { $0.date > .distantPast && $0.date <= now }
            guard let latest = group.points.first else { return nil }
            group.exercise = latest.exercise
            let position = latest.session.workout_snapshot.exercises.firstIndex { $0.id == latest.exercise.id } ?? Int.max
            return (group, latest, prioritizeGains && ProgressComparison(group)?.trend == .up, position)
        }
        return ranked.sorted { a, b in
            if a.gain != b.gain { return a.gain }
            if a.latest.date != b.latest.date { return a.latest.date > b.latest.date }
            if a.latest.session.id != b.latest.session.id { return a.latest.session.id > b.latest.session.id }
            if a.position != b.position { return a.position < b.position }
            return a.group.id < b.group.id
        }.map { $0.group }
    }

    public static func collect(data: AppData, relationshipID: String) -> [ProgressGroup] {
        collect(data: data, relationshipIDs: [relationshipID])
    }
    public static func collect(data: AppData, relationshipIDs: Set<String>) -> [ProgressGroup] {
        let ids = Set(data.assignments.filter { relationshipIDs.contains($0.relationship_id) }.map { $0.id })
        let resultsBySession = Dictionary(grouping: data.results, by: \.session_id)
        var groups: [String: ProgressGroup] = [:]
        for session in data.sessions where ids.contains(session.assignment_id) && session.completed_at != nil {
            let date = ReppyDate.parse(session.completed_at ?? "") ?? .distantPast
            let resultsByExercise = Dictionary(grouping: resultsBySession[session.id] ?? [], by: \.exercise_instance_id)
            var sessionPoints: [String: ProgressPoint] = [:]
            for exercise in session.workout_snapshot.exercises {
                let results = (resultsByExercise[exercise.id] ?? []).filter { $0.set_number > 0 && $0.set_number <= exercise.plannedSets.count && $0.valid(for: exercise) }
                guard !results.isEmpty else { continue }
                let key = exercise.progressKey
                if var point = sessionPoints[key] {
                    point.results += results; sessionPoints[key] = point
                } else {
                    sessionPoints[key] = ProgressPoint(session: session, exercise: exercise, results: results, date: date)
                }
            }
            for (key, point) in sessionPoints {
                if groups[key] == nil { groups[key] = ProgressGroup(exercise: point.exercise, points: []) }
                groups[key]!.points.append(point)
            }
        }
        return groups.values.map { group in
            var group = group; group.points.sort { $0.date == $1.date ? $0.session.id > $1.session.id : $0.date > $1.date }
            if let point = group.points.first { group.exercise = point.exercise }
            return group
        }.sorted {
            let a = $0.points.first?.date ?? .distantPast, b = $1.points.first?.date ?? .distantPast
            if a != b { return a > b }
            let order = $0.exercise.name.compare($1.exercise.name, locale: Locale(identifier: "ru_RU"))
            return order == .orderedSame ? $0.id < $1.id : order == .orderedAscending
        }
    }
}
/// Prepared once when chart input changes, never while selecting a date or drawing a mark.
public struct ProgressTimeline: ReppySendable {
    public let points: [ProgressPoint]
    public let monthly: Bool
    public init(points: [ProgressPoint], calendar: Calendar = .current) {
        let chronological = points.sorted { $0.date == $1.date ? $0.id < $1.id : $0.date < $1.date }
        monthly = points.count > 60 || (chronological.last?.date.timeIntervalSince(chronological.first?.date ?? .distantPast) ?? 0) > 180 * 86400
        if monthly {
            var months: [DateComponents: ProgressPoint] = [:]
            for point in chronological { months[calendar.dateComponents([.era, .year, .month], from: point.date)] = point }
            self.points = months.values.sorted { $0.date == $1.date ? $0.id < $1.id : $0.date < $1.date }
        } else { self.points = chronological }
    }
}

public struct ProgressComparison: ReppySendable {
    public enum Trend: ReppySendable { case none, flat, up, down, mixed }
    public var latest: SetResult
    public var previous: SetResult?
    public var weightChange: Double
    public var amountChange: Int
    public var trend: Trend {
        guard previous != nil else { return .none }
        if weightChange == 0 && amountChange == 0 { return .flat }
        if weightChange >= 0 && amountChange >= 0 { return .up }
        if weightChange <= 0 && amountChange <= 0 { return .down }
        return .mixed
    }
    public init?(_ group: ProgressGroup) {
        guard let latest = group.points.first?.bestSet else { return nil }
        self.latest = latest
        previous = group.points.dropFirst().first?.bestSet
        weightChange = previous.map { group.exercise.loadMode == .external ? ((latest.actual_weight - $0.actual_weight) * 1000).rounded() / 1000 : 0 } ?? 0
        amountChange = previous.map { latest.actual_reps - $0.actual_reps } ?? 0
    }
}
