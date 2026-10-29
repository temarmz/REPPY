import Foundation

public struct StudentFormDraft: Codable, Equatable, ReppySendable {
    public var student: Student
    public var height: String
    public var weight: String
    public init(student: Student, height: String, weight: String) { self.student = student; self.height = height; self.weight = weight }
    public func validatedStudent() throws -> Student {
        var copy = student
        let height = self.height.trimmingCharacters(in: .whitespacesAndNewlines)
        let weight = self.weight.trimmingCharacters(in: .whitespacesAndNewlines)
        copy.height_cm = ReppyValidation.number(height); copy.weight_kg = ReppyValidation.number(weight)
        if !height.isEmpty && copy.height_cm == nil { throw APIError.message("Укажи рост от 50 до 260 см.") }
        if !weight.isEmpty && copy.weight_kg == nil { throw APIError.message("Укажи вес от 20 до 500 кг.") }
        if let error = ReppyValidation.student(copy) { throw APIError.message(error) }
        return copy
    }
}
