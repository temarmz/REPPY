import SwiftUI

// Actual type references keep the native design kit tied to the library.
enum NativeComponentCatalog {
    static let components: [(String, Any.Type)] = [
        ("Page", ReppyPage<EmptyView>.self), ("Card", ReppyCard<EmptyView>.self),
        ("Title", ReppyTitle.self), ("Heading", ReppyHeading.self), ("Text", ReppyText.self),
        ("Caption", ReppyCaption.self), ("Number", ReppyNumber.self), ("Button", ReppyButton.self),
        ("Link", ReppyLink<EmptyView>.self), ("Field", ReppyField.self), ("NumericField", ReppyNumericField.self),
        ("DateField", ReppyDateField.self), ("Toggle", ReppyToggle.self), ("Empty", ReppyEmpty.self),
        ("Status", ReppyStatus.self), ("ProgressBar", ReppyProgressBar.self), ("TabBar", ReppyTabBar.self),
        ("MonthCalendar", MonthCalendar.self), ("PlanSetRow", PlanSetRow.self), ("ActiveSetRow", ActiveSetRow.self),
        ("ReadOnlyExerciseCard", ReadOnlyExerciseCard.self), ("ExerciseEditorCard", ExerciseEditorCard.self),
        ("ProgressChart", ReppyProgressChart.self), ("Loading", ReppyLoading.self), ("Share", ReppyShare.self),
        ("Video", ReppyVideo.self), ("VideoRecorder", VideoRecorder.self), ("ExternalLink", ReppyExternalLink.self)
    ]
}
