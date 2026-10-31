import XCTest

final class SmokeTests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }
    @MainActor func testDesignSystemFoundation() {
        for theme in ["light", "dark"] {
            let app = XCUIApplication(); app.launchArguments = ["--demo-trainer", "-appearance", theme]; app.launch()
            XCTAssertTrue(app.buttons["Профиль"].waitForExistence(timeout: 15)); app.buttons["Профиль"].tap()
            let kit = app.buttons["Открыть дизайн-кит"]
            for _ in 0..<5 { if kit.isHittable { break }; app.swipeUp() }
            XCTAssertTrue(kit.isHittable); kit.tap()
            XCTAssertTrue(app.staticTexts["Основа дизайн-системы"].waitForExistence(timeout: 5))
            let disabled = app.textFields["Недоступное поле"]
            XCTAssertTrue(disabled.exists); XCTAssertFalse(disabled.isEnabled)
            let field = app.textFields["Поле с ошибкой"]
            field.tap()
            XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
            let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "foundation-\(theme)-keyboard"; screenshot.lifetime = .keepAlways; add(screenshot)
            app.terminate()
        }
    }
    @MainActor func testMinimalSignInAndDemoSheet() {
        for theme in ["light", "dark"] {
            let app = XCUIApplication(); app.launchArguments = ["-appearance", theme]; app.launch()
            XCTAssertTrue(app.buttons["Войти через Telegram"].waitForExistence(timeout: 15))
            XCTAssertFalse(app.buttons["Профиль"].exists)
            let screenshot = XCTAttachment(screenshot: app.screenshot())
            screenshot.name = "sign-in-\(theme)"; screenshot.lifetime = .keepAlways; add(screenshot)
            app.buttons["Посмотреть демо"].tap()
            XCTAssertTrue(app.buttons["Демо тренера"].waitForExistence(timeout: 5))
            XCTAssertTrue(app.buttons["Демо ученика"].exists)
            app.buttons["Закрыть"].tap()
            app.buttons["У меня есть приглашение"].tap()
            XCTAssertTrue(app.textFields["Приглашение"].waitForExistence(timeout: 5))
            app.buttons["Готово"].tap()
            app.terminate()
        }
    }
    @MainActor func testPersonalNotesForBothRoles() {
        for role in ["trainer", "student"] {
            let app = XCUIApplication(); app.launchArguments = ["--demo-" + role]; app.launch()
            XCTAssertTrue(app.buttons["Заметки"].waitForExistence(timeout: 15))
            app.buttons["Заметки"].tap()
            let editor = app.textViews.firstMatch
            XCTAssertTrue(editor.waitForExistence(timeout: 5))
            editor.tap(); editor.typeText("iOS note")
            app.terminate(); app.launch()
            app.buttons["Заметки"].tap()
            XCTAssertTrue(app.textViews.firstMatch.waitForExistence(timeout: 5))
            XCTAssertTrue((app.textViews.firstMatch.value as? String ?? "").contains("iOS note"))
            app.terminate()
        }
    }
    @MainActor func testBothRolesAndBothThemes() {
        for role in ["trainer", "student"] {
            for theme in ["light", "dark"] {
                let app = XCUIApplication(); app.launchArguments = ["--demo-" + role, "-appearance", theme]; app.launch()
                XCTAssertTrue(app.buttons["Профиль"].waitForExistence(timeout: 15))
                app.buttons["Профиль"].tap()
                XCTAssertTrue(app.staticTexts["Оформление"].exists)
                let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "\(role)-\(theme)"; screenshot.lifetime = .keepAlways; add(screenshot)
                app.buttons["Календарь"].tap()
                XCTAssertTrue(app.buttons["Следующий месяц"].exists)
                app.terminate()
            }
        }
    }
    @MainActor func testTrainerCanOpenEditorAndStudentCanOpenHistory() {
        let app = XCUIApplication(); app.launchArguments = ["--demo-trainer"]; app.launch()
        let assign = app.buttons["Назначить тренировку"]
        XCTAssertTrue(assign.waitForExistence(timeout: 15)); assign.tap()
        XCTAssertTrue(app.textFields["Название тренировки"].waitForExistence(timeout: 5))
        app.terminate(); app.launchArguments = ["--demo-student"]; app.launch()
        let history = app.buttons["История тренировок"]
        for _ in 0..<6 { if history.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(history.waitForExistence(timeout: 15)); history.tap()
        XCTAssertTrue(app.staticTexts["История тренировок"].exists)
    }
}
