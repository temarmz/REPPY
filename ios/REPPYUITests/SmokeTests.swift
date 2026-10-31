import XCTest

final class SmokeTests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }
    @MainActor func testActiveWorkoutKeyboardAndFinishOnSmallScreen() {
        runActiveWorkoutScenario(accessibility: false)
    }
    @MainActor func testActiveWorkoutWithLargestText() {
        runActiveWorkoutScenario(accessibility: true)
    }
    @MainActor private func runActiveWorkoutScenario(accessibility: Bool) {
        let app = XCUIApplication()
        app.launchArguments = ["--demo-student", "-appearance", "dark"]
        if accessibility { app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"] }
        app.launch()
        let open = app.buttons["Открыть тренировку"].firstMatch
        XCTAssertTrue(open.waitForExistence(timeout: 15)); open.tap()
        let start = app.buttons.matching(NSPredicate(format: "label IN %@", ["Начать тренировку", "Продолжить тренировку"])).firstMatch
        XCTAssertTrue(start.waitForExistence(timeout: 5)); start.tap()
        let weight = app.textFields.matching(NSPredicate(format: "label BEGINSWITH %@", "Фактический вес подхода 1")).firstMatch
        for _ in 0..<10 { if weight.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(weight.isHittable); weight.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        weight.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 12) + "75,5")
        app.buttons["dismiss-keyboard"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Календарь"].waitForExistence(timeout: 5))
        XCTAssertEqual(weight.value as? String, "75,5")
        let done = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Подход 1:")).firstMatch
        for _ in 0..<4 { if done.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(done.isHittable); done.tap()
        let finish = app.buttons["Завершить тренировку"]
        for _ in 0..<18 { if finish.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(finish.isHittable); finish.tap()
        let confirm = app.buttons["Подтвердить завершение"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        for _ in 0..<10 { if confirm.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(confirm.isHittable)
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = accessibility ? "active-finish-largest-text" : "active-finish-small"; screenshot.lifetime = .keepAlways; add(screenshot)
        confirm.tap()
        XCTAssertTrue(app.staticTexts["Длительность"].waitForExistence(timeout: 10))
        app.terminate()
    }
    @MainActor func testProfileKeyboardCancelOnSmallScreen() {
        let app = XCUIApplication(); app.launchArguments = ["--demo-student", "-appearance", "light"]; app.launch()
        XCTAssertTrue(app.buttons["Профиль"].waitForExistence(timeout: 15)); app.buttons["Профиль"].tap()
        app.buttons["Изменить личные данные"].tap()
        let name = app.textFields["Имя"]
        XCTAssertTrue(name.waitForExistence(timeout: 5)); let original = name.value as? String
        name.tap(); name.typeText(" тест")
        XCTAssertTrue(app.keyboards.firstMatch.exists)
        app.buttons["dismiss-keyboard"].firstMatch.tap()
        let cancel = app.buttons["Отмена"]
        for _ in 0..<12 { if cancel.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(cancel.isHittable); cancel.tap()
        app.buttons["Изменить личные данные"].tap()
        XCTAssertTrue(name.waitForExistence(timeout: 5)); XCTAssertEqual(name.value as? String, original)
        app.terminate()
    }
    @MainActor func testSmallScreenDynamicType() {
        for role in ["trainer", "student"] {
            for size in ["UICTContentSizeCategoryL", "UICTContentSizeCategoryAccessibilityXXXL"] {
                let app = XCUIApplication()
                app.launchArguments = ["--demo-" + role, "-appearance", role == "trainer" ? "light" : "dark", "-UIPreferredContentSizeCategoryName", size]
                app.launch()
                let calendar = app.buttons["Календарь"]
                XCTAssertTrue(calendar.waitForExistence(timeout: 15))
                XCTAssertTrue(calendar.isHittable)
                XCTAssertGreaterThanOrEqual(calendar.frame.height, 44)
                XCTAssertLessThanOrEqual(calendar.frame.maxX, app.frame.maxX)
                calendar.tap()
                let next = app.buttons["Следующий месяц"]
                XCTAssertTrue(next.waitForExistence(timeout: 5)); XCTAssertTrue(next.isHittable)
                XCTAssertLessThanOrEqual(next.frame.maxX, app.frame.maxX)
                let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "small-calendar-\(role)-\(size)"; screenshot.lifetime = .keepAlways; add(screenshot)
                let firstDay = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "тренировок:")).firstMatch
                for _ in 0..<4 { if firstDay.isHittable { break }; app.swipeUp() }
                XCTAssertTrue(firstDay.isHittable)
                XCTAssertGreaterThanOrEqual(firstDay.frame.height, 44)
                XCTAssertGreaterThanOrEqual(firstDay.frame.width, 44)
                XCTAssertLessThanOrEqual(firstDay.frame.maxX, app.frame.maxX)
                let days = XCTAttachment(screenshot: app.screenshot()); days.name = "small-days-\(role)-\(size)"; days.lifetime = .keepAlways; add(days)
                app.buttons["Профиль"].tap()
                let signOut = app.buttons["Выйти из демо"]
                for _ in 0..<18 { if signOut.isHittable { break }; app.swipeUp() }
                XCTAssertTrue(signOut.isHittable)
                XCTAssertLessThanOrEqual(signOut.frame.maxX, app.frame.maxX)
                app.terminate()
            }
        }
    }
    @MainActor func testResultSummaryBothThemes() {
        for theme in ["light", "dark"] {
            let app = XCUIApplication(); app.launchArguments = ["--demo-student", "-appearance", theme]; app.launch()
            XCTAssertTrue(app.buttons["Календарь"].waitForExistence(timeout: 15)); app.buttons["Календарь"].tap()
            let history = app.buttons["История тренировок"]
            for _ in 0..<8 { if history.isHittable { break }; app.swipeUp() }
            XCTAssertTrue(history.isHittable); history.tap()
            let result = app.buttons["Посмотреть результат"].firstMatch
            XCTAssertTrue(result.waitForExistence(timeout: 5)); result.tap()
            XCTAssertTrue(app.staticTexts["Длительность"].waitForExistence(timeout: 5))
            XCTAssertTrue(app.staticTexts["Подходы"].exists)
            XCTAssertTrue(app.staticTexts["Упражнения"].exists)
            let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "result-summary-\(theme)"; screenshot.lifetime = .keepAlways; add(screenshot)
            app.terminate()
        }
    }
    @MainActor func testWorkoutEditorSetRows() {
        for theme in ["light", "dark"] {
            let app = XCUIApplication(); app.launchArguments = ["--demo-trainer", "-appearance", theme]; app.launch()
            let assign = app.buttons["Назначить тренировку"]
            XCTAssertTrue(assign.waitForExistence(timeout: 15)); assign.tap()
            let addExercise = app.buttons["Добавить упражнение"]
            for _ in 0..<6 { if addExercise.isHittable { break }; app.swipeUp() }
            XCTAssertTrue(addExercise.isHittable); addExercise.tap()
            let search = app.textFields["Поиск"]
            XCTAssertTrue(search.waitForExistence(timeout: 5)); search.tap(); search.typeText("Жим")
            let choice = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Жим")).firstMatch
            XCTAssertTrue(choice.waitForExistence(timeout: 5)); choice.tap()
            let set = app.buttons["Добавить подход"].firstMatch
            for _ in 0..<8 { if set.isHittable { break }; app.swipeUp() }
            XCTAssertTrue(set.isHittable); set.tap()
            XCTAssertTrue(app.buttons["Удалить подход 1"].exists)
            let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "editor-sets-\(theme)"; screenshot.lifetime = .keepAlways; add(screenshot)
            app.buttons["Удалить подход 1"].tap()
            XCTAssertFalse(app.buttons["Удалить подход 1"].exists)
            app.terminate()
        }
    }
    @MainActor func testHomeProfileCalendarComposition() {
        for role in ["trainer", "student"] {
            for theme in ["light", "dark"] {
                let app = XCUIApplication(); app.launchArguments = ["--demo-" + role, "-appearance", theme]; app.launch()
                XCTAssertTrue(app.buttons["Календарь"].waitForExistence(timeout: 15))
                if role == "trainer" { XCTAssertTrue(app.switches["Все дни"].exists) }
                let home = XCTAttachment(screenshot: app.screenshot()); home.name = "home-\(role)-\(theme)"; home.lifetime = .keepAlways; add(home)
                app.buttons["Профиль"].tap()
                XCTAssertTrue(app.staticTexts["Оформление"].waitForExistence(timeout: 5))
                if role == "student" {
                    XCTAssertTrue(app.buttons["Изменить личные данные"].exists)
                    app.buttons["Изменить личные данные"].tap()
                    XCTAssertTrue(app.textFields["Имя"].waitForExistence(timeout: 5))
                }
                app.buttons["Календарь"].tap()
                XCTAssertTrue(app.buttons["Сегодня"].waitForExistence(timeout: 5))
                app.buttons["Следующий месяц"].tap(); app.buttons["Сегодня"].tap()
                let calendar = XCTAttachment(screenshot: app.screenshot()); calendar.name = "calendar-\(role)-\(theme)"; calendar.lifetime = .keepAlways; add(calendar)
                app.terminate()
            }
        }
    }
    @MainActor func testShellNavigationAndKeyboard() {
        for role in ["trainer", "student"] {
            for theme in ["light", "dark"] {
                let app = XCUIApplication(); app.launchArguments = ["--demo-" + role, "-appearance", theme]; app.launch()
                XCTAssertTrue(app.buttons["Профиль"].waitForExistence(timeout: 15))
                XCTAssertFalse(app.tabBars.firstMatch.exists)
                XCTAssertEqual(app.buttons["Ученики"].exists, role == "trainer")
                XCTAssertFalse(app.tabBars.firstMatch.exists)
                app.buttons["Профиль"].tap()
                XCTAssertTrue(app.staticTexts["Оформление"].waitForExistence(timeout: 5))
                app.navigationBars.buttons.firstMatch.tap()
                XCTAssertTrue(app.buttons["Профиль"].waitForExistence(timeout: 5))
                app.buttons["Заметки"].tap()
                let editor = app.textViews.firstMatch
                for _ in 0..<4 { if editor.isHittable { break }; app.swipeUp() }
                XCTAssertTrue(editor.isHittable); editor.tap()
                XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
                let hidden = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.buttons["Календарь"])
                XCTAssertEqual(XCTWaiter.wait(for: [hidden], timeout: 5), .completed)
                app.buttons["dismiss-keyboard"].firstMatch.tap()
                XCTAssertTrue(app.buttons["Календарь"].waitForExistence(timeout: 5))
                app.buttons["Календарь"].tap()
                XCTAssertTrue(app.buttons["Следующий месяц"].waitForExistence(timeout: 5))
                let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "shell-\(role)-\(theme)"; screenshot.lifetime = .keepAlways; add(screenshot)
                app.terminate()
            }
        }
    }
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
        XCTAssertTrue(app.buttons["Календарь"].waitForExistence(timeout: 15)); app.buttons["Календарь"].tap()
        let history = app.buttons["История тренировок"]
        for _ in 0..<6 { if history.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(history.waitForExistence(timeout: 15)); history.tap()
        XCTAssertTrue(app.staticTexts["История тренировок"].exists)
    }
}
