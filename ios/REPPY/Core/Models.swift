import Foundation

public enum Role: String, Codable, ReppySendable { case trainer, student }
public enum TrainingFormat: String, Codable, CaseIterable, ReppySendable {
    case inPerson = "in-person", online
    public var title: String { self == .online ? "Онлайн" : "Очно" }
}
public enum LoadMode: String, Codable, CaseIterable, ReppySendable { case external, bodyweight }
public enum MeasureType: String, Codable, CaseIterable, ReppySendable { case reps, duration }
public enum Mood: String, Codable, CaseIterable, ReppySendable {
    case great, good, tired, hard
    public var title: String {
        switch self {
        case .great: return "Отлично"
        case .good: return "Хорошо"
        case .tired: return "Устал"
        case .hard: return "Тяжело"
        }
    }
}
public struct Profile: Codable, Identifiable, ReppySendable {
    public var id: String
    public var role: Role
    public var display_name: String
}
public struct Student: Codable, Identifiable, Equatable, ReppySendable {
    public var id: String
    public var account_id: String?
    public var name: String
    public var phone: String?
    public var height_cm: Double?
    public var weight_kg: Double?
    public var gender: String?
    public var contraindications: String?
    public var updated_at: String
}
public struct Relationship: Codable, Identifiable, ReppySendable {
    public var id: String
    public var trainer_id: String
    public var student_id: String
    public var status: String
    public var color: String
    public var updated_at: String
}
public struct InstructionVideo: Codable, Equatable, ReppySendable {
    public var id: String
    public var name: String
    public var mimeType: String
    public var size: Int
    public var createdAt: String
}
public struct SetPlan: Codable, Equatable, Identifiable, ReppySendable {
    public var id = UUID().uuidString.lowercased()
    public var targetReps: Int
    public var targetWeight: Double
    enum CodingKeys: String, CodingKey { case targetReps, targetWeight }
    public static func == (lhs: SetPlan, rhs: SetPlan) -> Bool { lhs.targetReps == rhs.targetReps && lhs.targetWeight == rhs.targetWeight }
    public init(targetReps: Int = 10, targetWeight: Double = 0) {
        self.targetReps = targetReps; self.targetWeight = targetWeight
    }
}
public struct WorkoutExercise: Codable, Identifiable, Equatable, ReppySendable {
    public var id: String
    public var exerciseId: String
    public var name: String
    public var primaryMuscle: String?
    public var muscleGroups: [String]?
    public var equipment: String?
    public var loadMode: LoadMode
    public var measureType: MeasureType
    public var plannedSets: [SetPlan]
    public var coachNote: String?
    public var instructionText: String?
    public var instructionVideo: InstructionVideo?
    public var progressKey: String { "\(exerciseId)|\(loadMode.rawValue)|\(measureType.rawValue)" }
    public var unit: String { measureType == .duration ? "сек." : "повт." }
    public init(definition: ExerciseDefinition) {
        id = UUID().uuidString.lowercased(); exerciseId = definition.id; name = definition.name
        primaryMuscle = definition.primary_muscle; muscleGroups = definition.muscle_groups
        equipment = definition.equipment; loadMode = definition.load_mode; measureType = definition.measure_type
        plannedSets = []
    }
}
public struct Workout: Codable, Identifiable, Equatable, ReppySendable {
    public var id: String
    public var name: String
    public var exercises: [WorkoutExercise]
    public var createdAt: String
    public var updatedAt: String?
    public init(name: String = "Новая тренировка", exercises: [WorkoutExercise] = []) {
        id = UUID().uuidString.lowercased(); self.name = name; self.exercises = exercises
        createdAt = ReppyDate.timestamp()
    }
    public func repeated() -> Workout {
        var copy = self; copy.id = UUID().uuidString.lowercased(); copy.createdAt = ReppyDate.timestamp()
        copy.updatedAt = nil
        copy.exercises = exercises.map { exercise in
            var exercise = exercise; exercise.id = UUID().uuidString.lowercased(); return exercise
        }
        return copy
    }
}
public struct Assignment: Codable, Identifiable, ReppySendable {
    public var id: String
    public var relationship_id: String
    public var assigned_at: String
    public var scheduled_for: String
    public var scheduled_time: String?
    public var format: TrainingFormat
    public var status: String
    public var workout_snapshot: Workout
    public var repeated_from_assignment_id: String?
    public var reschedule_scheduled_for: String?
    public var reschedule_scheduled_time: String?
    public var reschedule_requested_at: String?
    public var revision: Int
    public var scheduleLabel: String {
        ReppyDate.display(scheduled_for) + " · " + (format == .online ? "Онлайн · в удобное время" : String((scheduled_time ?? "").prefix(5)))
    }
    public func canStart(as role: Role, sessions: [WorkoutSession], today: String = ReppyDate.day()) -> Bool {
        status == "assigned" && (role == .trainer || format == .online || scheduled_for == today || sessions.contains { $0.assignment_id == id && $0.completed_at == nil })
    }
}
public struct SetResult: Codable, Identifiable, Equatable, ReppySendable {
    public var session_id: String
    public var exercise_instance_id: String
    public var set_number: Int
    public var actual_reps: Int
    public var actual_weight: Double
    public var completed: Bool
    public var id: String { "\(exercise_instance_id):\(set_number)" }
    public func valid(for exercise: WorkoutExercise) -> Bool {
        completed && actual_reps > 0 && actual_weight.isFinite && (exercise.loadMode == .bodyweight || actual_weight >= 0)
    }
}
public struct WorkoutSession: Codable, Identifiable, ReppySendable {
    public var id: String
    public var assignment_id: String
    public var workout_snapshot: Workout
    public var recorded_by_role: Role
    public var started_at: String
    public var completed_at: String?
    public var mood: Mood?
    public var comment: String?
    public var charge_status: String?
    public var revision: Int
}
public struct SubscriptionEntry: Codable, Identifiable, ReppySendable {
    public var id: String
    public var relationship_id: String
    public var kind: String
    public var lesson_delta: Int
    public var occurred_at: String
    public var created_at: String
    public var updated_at: String?
    public var amount_rub: Double?
    public var payment_method: String?
    public var comment: String?
    public var session_id: String?
    public var workout_name: String?
    public var revision: Int
}
public struct ExerciseDefinition: Codable, Identifiable, ReppySendable {
    public var id: String
    public var slug: String?
    public var owner_id: String?
    public var name: String
    public var primary_muscle: String
    public var muscle_groups: [String]
    public var equipment: String
    public var measure_type: MeasureType
    public var load_mode: LoadMode
    public var archived_at: String?
}
public struct AppData: Codable, ReppySendable {
    public var demoDay: String?
    public var students: [Student] = []
    public var relationships: [Relationship] = []
    public var assignments: [Assignment] = []
    public var sessions: [WorkoutSession] = []
    public var results: [SetResult] = []
    public var subscriptions: [SubscriptionEntry] = []
    public var definitions: [ExerciseDefinition] = []
    public init() {}
    public func relationship(for student: String) -> Relationship? { relationships.first { $0.student_id == student } }
    public func student(for assignment: Assignment) -> Student? {
        let id = relationships.first { $0.id == assignment.relationship_id }?.student_id
        return students.first { $0.id == id }
    }
    public func balance(_ relationshipID: String) -> Int { subscriptions.filter { $0.relationship_id == relationshipID }.reduce(0) { $0 + $1.lesson_delta } }
    public func session(for assignmentID: String) -> WorkoutSession? { sessions.first { $0.assignment_id == assignmentID } }
    public func sessionResults(_ sessionID: String) -> [SetResult] { results.filter { $0.session_id == sessionID } }
    public func rebasedDemo(today: Date = Date()) -> AppData {
        guard let demoDay = demoDay else { return self }
        var copy = self
        let calendar = Calendar(identifier: .gregorian)
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: ReppyDate.fromDay(demoDay)), to: calendar.startOfDay(for: today)).day ?? 0
        func shifted(_ value: String) -> String { ReppyDate.day(calendar.date(byAdding: .day, value: days, to: ReppyDate.fromDay(value))!) }
        func timestamp(_ value: String) -> String { ReppyDate.timestamp(calendar.date(byAdding: .day, value: days, to: ReppyDate.parse(value) ?? today)!) }
        copy.assignments = assignments.map { item in var item = item; item.scheduled_for = shifted(item.scheduled_for); item.assigned_at = timestamp(item.assigned_at); return item }
        copy.sessions = sessions.map { item in var item = item; item.started_at = timestamp(item.started_at); item.completed_at = item.completed_at.map(timestamp); return item }
        copy.subscriptions = subscriptions.map { item in var item = item; item.occurred_at = timestamp(item.occurred_at); return item }
        copy.demoDay = ReppyDate.day(today); return copy
    }
}
public enum ReppyDate {
    public static func timestamp(_ date: Date = Date()) -> String { ISO8601DateFormatter().string(from: date) }
    public static func parse(_ value: String) -> Date? {
        let iso = ISO8601DateFormatter(); iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return iso.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
    public static func day(_ date: Date = Date()) -> String {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian); formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
    public static func fromDay(_ value: String) -> Date {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian); formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: value) ?? Date()
    }
    public static func display(_ value: String) -> String {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "ru_RU"); formatter.dateFormat = "d MMMM"
        return formatter.string(from: fromDay(String(value.prefix(10))))
    }
}
public enum ReppyValidation {
    public static func student(_ student: Student) -> String? {
        let name = student.name.trimmingCharacters(in: .whitespacesAndNewlines)
        if !(2...120).contains(name.count) { return "Укажи имя длиной от 2 до 120 символов." }
        if let height = student.height_cm, !height.isFinite || !(50...260).contains(height) { return "Укажи рост от 50 до 260 см." }
        if let weight = student.weight_kg, !weight.isFinite || !(20...500).contains(weight) { return "Укажи вес от 20 до 500 кг." }
        return nil
    }
    public static func integer(_ value: Double) -> Int {
        guard value.isFinite, value >= 0, value <= Double(Int32.max), value.rounded() == value else { return -1 }
        return Int(value)
    }
    public static func number(_ text: String) -> Double? {
        guard let value = Double(text.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: ",", with: ".")), value.isFinite, value >= 0 else { return nil }
        return value
    }
    public static func workout(_ workout: Workout) -> String? {
        if workout.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "Укажи название тренировки." }
        for exercise in workout.exercises {
            for set in exercise.plannedSets {
                if set.targetReps <= 0 || !set.targetWeight.isFinite || set.targetWeight < 0 { return "Проверь подходы: количество должно быть больше нуля, вес — неотрицательным." }
            }
        }
        return nil
    }
}
