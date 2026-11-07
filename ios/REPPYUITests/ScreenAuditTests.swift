import XCTest

final class ScreenAuditTests: XCTestCase {
    @MainActor func testServerValueReplacesFocusedNumericText() {
        for theme in ["dark", "light"] {
            let app = XCUIApplication()
            app.launchArguments = ["--demo-student", "-appearance", theme, "--audit-screen", "numeric-sync", "--audit-namespace", UUID().uuidString]
            app.launch()
            let field = app.textFields["Повторы"]
            XCTAssertTrue(field.waitForExistence(timeout: 15))
            app.buttons["Запланировать серверное обновление"].tap()
            field.tap(); field.typeText("22")
            XCTAssertEqual(field.value as? String, "22")
            let serverText = NSPredicate(format: "value == %@", "20")
            expectation(for: serverText, evaluatedWith: field)
            waitForExpectations(timeout: 10)
            app.terminate()
        }
    }
    override func setUpWithError() throws { continueAfterFailure = false }
    @MainActor func testProgressLargeHistoryRemainsInteractive() {
        for (role, theme) in [("student", "dark"), ("trainer", "light")] {
            let app = XCUIApplication()
            app.launchArguments = ["--demo-" + role, "-appearance", theme, "--audit-screen", role == "trainer" ? "progress" : "home", "--audit-large-progress"]
            app.launch()
            let first = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "progress-summary-")).firstMatch
            for _ in 0..<10 { if first.exists && first.isHittable { break }; app.swipeUp() }
            XCTAssertTrue(first.waitForExistence(timeout: 10)); first.tap()
            let previous = app.buttons["progress-previous-session"], next = app.buttons["progress-next-session"]
            for _ in 0..<12 {
                let bottom = app.tabBars.firstMatch.frame.minY
                if previous.exists && previous.isHittable && previous.frame.maxY < bottom { break }
                app.swipeUp()
            }
            XCTAssertTrue(previous.waitForExistence(timeout: 5))
            XCTAssertTrue(app.staticTexts["По месяцам · последнее занятие месяца"].exists)
            for _ in 0..<3 {
                let date = app.staticTexts["progress-selected-date"]
                let before = date.label
                let start = Date(); previous.tap()
                XCTAssertNotEqual(date.label, before)
                XCTAssertLessThan(Date().timeIntervalSince(start), 10, "Date selection blocked the UI")
                XCTAssertTrue(next.isEnabled)
            }
            capture(app, "progress-large-history-" + role + "-" + theme)
            app.navigationBars.buttons.firstMatch.tap()
            XCTAssertTrue(first.waitForExistence(timeout: 5))
            app.swipeUp(); app.swipeUp(); app.swipeDown()
            capture(app, "progress-long-feed-" + role + "-" + theme)
            app.terminate()
        }
    }
    @MainActor func testTrainerScreenInventory() {
        let routes = ["home", "calendar", "students", "student", "invited", "student-form", "invite", "repeat", "editor", "new-editor", "assignment", "history", "result", "progress", "ledger", "payment", "edit-payment", "library", "definition", "exercise-picker", "instruction", "instruction-editor", "reorder", "active", "structure", "profile", "telegram", "notes", "notes-calendar", "empty-home", "error", "design-kit"]
        for theme in ["light", "dark"] { for route in routes { captureRoute(route, role: "trainer", theme: theme) } }
    }
    @MainActor func testStudentScreenInventory() {
        for theme in ["light", "dark"] {
            for route in ["home", "calendar", "assignment", "reschedule", "active", "history", "result", "feedback", "progress", "profile", "student-form", "telegram", "notes", "notes-calendar", "empty-home"] { captureRoute(route, role: "student", theme: theme) }
        }
    }
    @MainActor func testPersistentPickerTitles() {
        for theme in ["light", "dark"] {
            let app = XCUIApplication(); app.launchArguments = ["--demo-trainer", "-appearance", theme, "--audit-screen", "repeat"]; app.launch()
            XCTAssertTrue(app.navigationBars["Выбрать тренировку"].waitForExistence(timeout: 15)); capture(app, "picker-title-" + theme); app.terminate()
            app.launchArguments = ["--audit-sign-in", "-appearance", theme]; app.launch()
            XCTAssertTrue(app.buttons["У меня есть приглашение"].waitForExistence(timeout: 15)); app.buttons["У меня есть приглашение"].tap()
            XCTAssertTrue(app.navigationBars["Приглашение"].waitForExistence(timeout: 5)); capture(app, "invitation-title-" + theme); app.terminate()
        }
    }
    @MainActor func testSubscriptionActionsRemainReadable() {
        for large in [false, true] {
            let app = XCUIApplication(); app.launchArguments = ["--demo-trainer", "-appearance", large ? "dark" : "light", "--audit-screen", "student"]
            if large { app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"] }
            app.launch(); XCTAssertTrue(app.buttons["История"].waitForExistence(timeout: 15))
            let renew = app.buttons["Продлить"]
            for _ in 0..<16 { if renew.isHittable { break }; app.swipeUp() }
            XCTAssertTrue(renew.isHittable)
            XCTAssertLessThanOrEqual(renew.frame.maxX, app.frame.maxX)
            capture(app, large ? "subscription-actions-largest" : "subscription-actions-normal")
            if !large { XCTAssertLessThan(app.staticTexts["Продлить"].frame.height, 30) }
            else { XCTAssertLessThan(renew.frame.height, 120) }
            renew.tap(); XCTAssertTrue(app.textFields["Количество занятий"].waitForExistence(timeout: 5)); app.terminate()
        }
    }
    @MainActor func testProductPolishScreens() {
        for theme in ["light", "dark"] {
            for route in ["students", "result", "definition", "history", "progress-detail", "notes-calendar"] { captureRoute(route, role: "trainer", theme: theme) }
        }
    }
    @MainActor func testSecondaryStatesInventory() {
        for theme in ["light", "dark"] {
            for route in ["finish", "invite-ready", "notes-conflict", "empty-library", "empty-history", "empty-progress", "long-editor"] { captureRoute(route, role: "trainer", theme: theme) }
        }
    }
    @MainActor func testAuthenticationInventory() {
        for theme in ["light", "dark"] {
            let app = XCUIApplication(); app.launchArguments = ["--audit-sign-in", "-appearance", theme]; app.launch()
            XCTAssertTrue(app.buttons["Войти через Telegram"].waitForExistence(timeout: 15)); capture(app, "auth-" + theme + "-sign-in")
            app.buttons["У меня есть приглашение"].tap()
            XCTAssertTrue(app.textFields["Приглашение"].waitForExistence(timeout: 5)); capture(app, "auth-" + theme + "-invitation")
            app.textFields["Приглашение"].tap(); app.textFields["Приглашение"].typeText("draft-token")
            app.buttons["dismiss-keyboard"].firstMatch.tap()
            app.navigationBars.buttons["Назад"].tap()
            XCTAssertTrue(app.buttons["У меня есть приглашение"].waitForExistence(timeout: 5))
            app.buttons["Посмотреть демо"].tap()
            XCTAssertTrue(app.buttons["Демо тренера"].waitForExistence(timeout: 5)); capture(app, "auth-" + theme + "-demo")
            app.terminate(); app.launchArguments += ["--audit-registration"]; app.launch()
            XCTAssertTrue(app.buttons["Создать кабинет"].waitForExistence(timeout: 15)); capture(app, "auth-" + theme + "-registration"); app.terminate()
        }
    }
    @MainActor func testHistoryProgressAndRescheduleFlow() {
        let app = XCUIApplication(); app.launchArguments = ["--demo-student", "-appearance", "light"]; app.launch()
        XCTAssertTrue(app.buttons["Календарь"].waitForExistence(timeout: 15)); app.buttons["Календарь"].tap()
        let history = app.buttons["История тренировок"]
        for _ in 0..<8 { if history.isHittable { break }; app.swipeUp() }; history.tap()
        XCTAssertTrue(app.navigationBars["История тренировок"].waitForExistence(timeout: 5))
        app.buttons["Посмотреть результат"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Длительность"].waitForExistence(timeout: 5))
        app.terminate(); app.launchArguments += ["--audit-screen", "progress"]; app.launch()
        XCTAssertTrue(app.navigationBars["Прогресс"].waitForExistence(timeout: 15))
        let exercise = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Жим ногами")).firstMatch
        XCTAssertTrue(exercise.waitForExistence(timeout: 5)); exercise.tap()
        for _ in 0..<5 { if app.buttons["progress-previous-session"].exists && app.buttons["progress-previous-session"].isHittable { break }; app.swipeUp() }
        XCTAssertTrue(app.buttons["progress-previous-session"].waitForExistence(timeout: 5)); XCTAssertTrue(app.buttons["progress-previous-session"].isEnabled)
        app.buttons["progress-previous-session"].tap(); XCTAssertTrue(app.buttons["progress-next-session"].isEnabled)
        app.terminate(); app.launchArguments = ["--demo-student", "-appearance", "light"]; app.launch()
        XCTAssertTrue(app.buttons["Посмотреть тренировку"].firstMatch.waitForExistence(timeout: 15)); app.buttons["Посмотреть тренировку"].firstMatch.tap()
        let start = app.buttons["Начать тренировку"], reschedule = app.buttons["Предложить другое время"]
        XCTAssertTrue(reschedule.waitForExistence(timeout: 5)); XCTAssertLessThan(start.frame.minY, reschedule.frame.minY)
        reschedule.tap(); XCTAssertTrue(app.navigationBars["Перенос"].waitForExistence(timeout: 5))
        capture(app, "flow-reschedule-initial-date")
        app.navigationBars.buttons["Отмена"].tap(); XCTAssertTrue(start.waitForExistence(timeout: 5)); XCTAssertFalse(app.staticTexts["Запрошен перенос"].exists)
        app.terminate()
    }
    @MainActor func testSmallPhoneKeyScreens() {
        for theme in ["light", "dark"] {
            for route in ["profile", "student-form", "editor", "history", "progress", "progress-detail", "instruction-editor", "exercise-picker", "payment", "repeat", "library", "definition"] { captureRoute(route, role: "trainer", theme: theme) }
            for route in ["assignment", "reschedule", "feedback"] { captureRoute(route, role: "student", theme: theme) }
        }
    }
    @MainActor private func captureRoute(_ route: String, role: String, theme: String) {
        let app = XCUIApplication()
        app.launchArguments = ["--demo-" + role, "-appearance", theme, "--audit-screen", route, "--audit-namespace", UUID().uuidString]
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15))
        // Querying the hierarchy waits for presentation and SwiftUI layout to settle.
        _ = app.debugDescription
        switch route {
        case "finish":
            let finish = app.buttons["Завершить тренировку"]
            for _ in 0..<16 { if finish.isHittable { break }; app.swipeUp() }; finish.tap()
            XCTAssertTrue(app.buttons["Подтвердить завершение"].waitForExistence(timeout: 5))
        case "invite-ready":
            let field = app.textFields["Имя ученика"]
            XCTAssertTrue(field.waitForExistence(timeout: 5)); field.tap(); field.typeText("Демо ученик")
            app.buttons["dismiss-keyboard"].firstMatch.tap(); app.buttons["Продолжить"].tap()
            XCTAssertTrue(app.staticTexts["Ссылка готова"].waitForExistence(timeout: 5))
        case "notes-conflict":
            let resolve = app.buttons["Выбрать версию"]
            XCTAssertTrue(resolve.waitForExistence(timeout: 5)); resolve.tap()
            XCTAssertTrue(app.buttons["Оставить мой текст"].waitForExistence(timeout: 5))
        case "notes-calendar":
            XCTAssertTrue(app.buttons["notes-date-range"].waitForExistence(timeout: 5)); app.buttons["notes-date-range"].tap()
            XCTAssertTrue(app.staticTexts["Выбрать день"].waitForExistence(timeout: 5))
        case "reschedule":
            XCTAssertTrue(app.buttons["Предложить другое время"].waitForExistence(timeout: 5)); app.buttons["Предложить другое время"].tap()
        case "feedback":
            let feedback = app.buttons.matching(NSPredicate(format: "label == %@ OR label == %@", "Как прошла тренировка?", "Изменить отзыв")).firstMatch
            XCTAssertTrue(feedback.waitForExistence(timeout: 5)); feedback.tap()
        default: break
        }
        let name = role + "-" + theme + "-" + route
        capture(app, name + "-top")
        if !["reorder", "telegram", "empty-home", "feedback", "new-editor"].contains(route) {
            let scroll = app.scrollViews.firstMatch
            if scroll.exists { scroll.swipeUp(); scroll.swipeUp(); capture(app, name + "-bottom") }
            else if app.collectionViews.firstMatch.exists { app.collectionViews.firstMatch.swipeUp(); capture(app, name + "-bottom") }
        }
        app.terminate()
    }
    @MainActor private func capture(_ app: XCUIApplication, _ name: String) {
        Thread.sleep(forTimeInterval: 0.35) // Allow native sheet presentation to finish before visual capture.
        let screenshot = app.screenshot()
        let image = XCTAttachment(screenshot: screenshot); image.name = name; image.lifetime = .keepAlways; add(image)
        let folder = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("screen-audit")
        do { try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true); try screenshot.pngRepresentation.write(to: folder.appendingPathComponent(name + ".png")) } catch { XCTFail("Не удалось сохранить снимок: \(error)") }
    }
}
