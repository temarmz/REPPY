import Foundation

/// Recognize a committed write after its HTTP acknowledgement was lost. Never
/// adopt a newer revision when the stored fields differ from the intended edit.
public enum DatabaseAcknowledgement {
    public static func matches(row: [String: Any], intended: [String: Any]) -> Bool {
        var actual: [String: Any] = [:], expected: [String: Any] = [:]
        for (key, value) in intended {
            guard let saved = row[key] else { return false }
            actual[key] = canonical(saved, key: key); expected[key] = canonical(value, key: key)
        }
        return NSDictionary(dictionary: actual).isEqual(to: expected)
    }
    private static func canonical(_ value: Any, key: String) -> Any {
        if let text = value as? String {
            if ["occurred_at", "reschedule_requested_at"].contains(key), let date = ReppyDate.parse(text) { return date.timeIntervalSince1970 }
            if ["scheduled_time", "reschedule_scheduled_time"].contains(key), text.count == 5 { return text + ":00" }
        }
        if ["amount_rub", "height_cm", "weight_kg"].contains(key), !(value is NSNull) {
            let number = NSDecimalNumber(string: String(describing: value), locale: Locale(identifier: "en_US_POSIX"))
            if number != .notANumber {
                return number.rounding(accordingToBehavior: NSDecimalNumberHandler(roundingMode: .plain, scale: 2, raiseOnExactness: false, raiseOnOverflow: false, raiseOnUnderflow: false, raiseOnDivideByZero: false))
            }
        }
        return value
    }
}
