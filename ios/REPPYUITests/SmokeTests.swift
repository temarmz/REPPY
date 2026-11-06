import XCTest

final class SmokeTests: XCTestCase {
    @MainActor func testNativeRepeatReorderAndDraftExit() {
        let app = XCUIApplication(); app.launchArguments = ["--demo-trainer", "-appearance", "dark"]; app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 15))
        app.tabBars.buttons["Ученики"].tap()
        revealAndTap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Артем А.,")).firstMatch, in: app)
        revealAndTap(app.buttons["Назначить тренировку"], in: app)
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5), app.debugDescription); search.tap(); search.typeText("zzzzzzz")
        XCTAssertTrue(app.staticTexts["Ничего не найдено"].waitForExistence(timeout: 5))
        search.buttons.firstMatch.tap()
        if app.buttons["Отменить"].exists { app.buttons["Отменить"].tap() } else { app.swipeUp() }
        let previous = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Завершена")).firstMatch
        revealAndTap(previous, in: app)
        let name = app.textFields["Название тренировки"]
        XCTAssertTrue(name.waitForExistence(timeout: 5)); let original = name.value as? String ?? ""
        revealAndTap(app.buttons["Изменить порядок упражнений"], in: app)
        let cells = app.cells
        XCTAssertGreaterThan(cells.count, 1)
        let first = cells.element(boundBy: 0).staticTexts.firstMatch.label
        let second = cells.element(boundBy: 1).staticTexts.firstMatch.label
        let handle = cells.element(boundBy: 0).buttons.firstMatch
        XCTAssertTrue(handle.exists)
        handle.press(forDuration: 0.7, thenDragTo: cells.element(boundBy: 1))
        XCTAssertEqual(cells.element(boundBy: 0).staticTexts.firstMatch.label, second)
        XCTAssertEqual(cells.element(boundBy: 1).staticTexts.firstMatch.label, first)
        capture(app, "native-reorder-dark")
        app.navigationBars.buttons["Готово"].tap()
        revealAndTap(name, in: app); name.typeText(" native-draft")
        app.buttons["dismiss-keyboard"].firstMatch.tap()
        app.navigationBars.buttons["Отмена"].tap(); app.buttons["Сохранить черновик и выйти"].tap()
        revealAndTap(previous, in: app)
        XCTAssertTrue(name.waitForExistence(timeout: 5)); XCTAssertTrue((name.value as? String ?? "").contains("native-draft"))
        app.navigationBars.buttons["Отмена"].tap(); app.buttons["Удалить изменения"].tap()
        revealAndTap(previous, in: app)
        XCTAssertTrue(name.waitForExistence(timeout: 5), app.debugDescription); XCTAssertEqual(name.value as? String, original)
        capture(app, "native-editor-dark")
        app.terminate()
    }
    @MainActor func testNotesCompactNavigation() {
        for theme in ["light", "dark"] {
            let app = XCUIApplication(); app.launchArguments = ["--demo-trainer", "-appearance", theme]; app.launch()
            XCTAssertTrue(app.buttons["Заметки"].waitForExistence(timeout: 15)); app.buttons["Заметки"].tap()
            XCTAssertTrue(app.textViews.firstMatch.waitForExistence(timeout: 5))
            let height = app.buttons["notes-date-range"].frame.height
            XCTAssertEqual(app.buttons["Предыдущие четыре дня"].frame.height, height, accuracy: 1)
            XCTAssertEqual(app.buttons["Следующие четыре дня"].frame.height, height, accuracy: 1)
            XCTAssertLessThan(app.buttons["Сегодня"].frame.width, app.frame.width / 2)
            capture(app, "notes-final-trainer-" + theme); app.terminate()
        }
    }
    @MainActor func testNotesAndInstructionParity() {
        for role in ["trainer", "student"] { for theme in ["light", "dark"] { runNotesAndInstructions(role: role, theme: theme) } }
    }
    @MainActor func testNotesAndInstructionsLargestText() { runNotesAndInstructions(role: "trainer", theme: "dark", largest: true) }
    @MainActor private func runNotesAndInstructions(role: String, theme: String, largest: Bool = false) {
        let app = XCUIApplication(); app.launchArguments = ["--demo-" + role, "-appearance", theme]
        if largest { app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"] }
        let suffix = role + "-" + theme + (largest ? "-largest" : "")
        app.launch(); XCTAssertTrue(app.buttons["Заметки"].waitForExistence(timeout: 15)); app.buttons["Заметки"].tap()
        let note = app.textViews.firstMatch
        XCTAssertTrue(note.waitForExistence(timeout: 5))
        let todayID = note.identifier, marker = "Личная заметка " + role + " " + theme
        if !largest { XCTAssertEqual(app.textViews.count, 4) }
        XCTAssertFalse((note.value as? String ?? "").contains("Личная заметка " + (role == "trainer" ? "student" : "trainer")))
        revealAndTap(note, in: app); note.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 80) + marker)
        app.buttons["dismiss-keyboard"].firstMatch.tap(); capture(app, "notes-" + suffix)
        let range = app.buttons["notes-date-range"].label
        revealAndTap(app.buttons["Следующие четыре дня"], in: app)
        XCTAssertNotEqual(app.buttons["notes-date-range"].label, range)
        revealAndTap(app.buttons["notes-date-range"], in: app)
        XCTAssertTrue(app.buttons["Перейти к сегодня"].waitForExistence(timeout: 5)); capture(app, "notes-calendar-" + suffix)
        revealAndTap(app.buttons["Перейти к сегодня"], in: app)
        XCTAssertTrue(app.textViews[todayID].waitForExistence(timeout: 5)); XCTAssertTrue((app.textViews[todayID].value as? String ?? "").contains(marker))
        app.terminate(); app.launch(); XCTAssertTrue(app.buttons["Заметки"].waitForExistence(timeout: 15)); app.buttons["Заметки"].tap()
        XCTAssertTrue(app.textViews[todayID].waitForExistence(timeout: 5)); XCTAssertTrue((app.textViews[todayID].value as? String ?? "").contains(marker))
        app.buttons["Главная"].tap()
        if role == "trainer" {
            app.buttons["Ученики"].tap()
            revealAndTap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Артем А.,")).firstMatch, in: app)
            revealAndTap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Грудь и плечи")).firstMatch, in: app)
        } else { revealAndTap(app.buttons["Посмотреть тренировку"].firstMatch, in: app) }
        revealAndTap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Инструкция:")).firstMatch, in: app)
        XCTAssertTrue(app.staticTexts["Тренер пока не добавил видео"].waitForExistence(timeout: 5)); capture(app, "instruction-" + suffix)
        revealAndTap(app.buttons["Закрыть"], in: app)
        if role == "trainer" {
            revealAndTap(app.buttons["Редактировать план"], in: app)
            revealAndTap(app.buttons["Инструкция и видео"].firstMatch, in: app)
            XCTAssertTrue(app.buttons["Сохранить инструкцию"].waitForExistence(timeout: 5)); capture(app, "instruction-editor-" + suffix)
            let text = app.textFields["Подробное описание упражнения"]
            revealAndTap(text, in: app); text.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 200) + "Проверка техники")
            app.buttons["dismiss-keyboard"].firstMatch.tap()
            revealAndTap(app.buttons["Сохранить инструкцию"], in: app)
            revealAndTap(app.buttons["Инструкция и видео"].firstMatch, in: app)
            XCTAssertTrue(text.waitForExistence(timeout: 5)); XCTAssertTrue((text.value as? String ?? "").contains("Проверка техники"))
            tapVisibleButton("Отмена", in: app)
            if app.buttons["Удалить изменения"].exists { app.buttons["Удалить изменения"].tap() }
            let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: text)
            XCTAssertEqual(XCTWaiter.wait(for: [closed], timeout: 5), .completed)
            tapVisibleButton("Отмена", in: app)
            XCTAssertTrue(app.buttons["Удалить изменения"].waitForExistence(timeout: 5)); app.buttons["Удалить изменения"].tap()
        }
        app.terminate()
    }
    @MainActor func testPaymentFormOpensFromHistory() {
      for largest in [false, true] {
        let app = XCUIApplication(); app.launchArguments = ["--demo-trainer", "-appearance", "light"]; app.launch()
        if largest {
            app.terminate(); app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]; app.launch()
        }
        XCTAssertTrue(app.buttons["Ученики"].waitForExistence(timeout: 15)); app.buttons["Ученики"].tap()
        revealAndTap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Артем А.,")).firstMatch, in: app)
        revealAndTap(app.buttons["История"], in: app)
        revealAndTap(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Пополнение на 8 занятий")).firstMatch, in: app)
        XCTAssertTrue(app.textFields["Количество занятий"].waitForExistence(timeout: 5))
        capture(app, largest ? "payment-open-largest" : "payment-open")
        revealAndTap(app.buttons["Сохранить изменения"], in: app)
        XCTAssertTrue(app.staticTexts["История абонемента"].waitForExistence(timeout: 5))
        app.terminate()
      }
    }
    @MainActor func testLedgerAndInvitationParity() {
        for theme in ["light", "dark"] { runLedgerAndInvitation(theme: theme) }
    }
    @MainActor func testLedgerAndInvitationLargestText() { runLedgerAndInvitation(theme: "dark", largest: true) }
    @MainActor private func runLedgerAndInvitation(theme: String, largest: Bool = false) {
        let app = XCUIApplication(); app.launchArguments = ["--demo-trainer", "-appearance", theme]
        if largest { app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"] }
        let suffix = theme + (largest ? "-largest" : "")
        app.launch(); XCTAssertTrue(app.buttons["Ученики"].waitForExistence(timeout: 15)); app.buttons["Ученики"].tap()
        revealAndTap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Артем А.,")).firstMatch, in: app)
        revealAndTap(app.buttons["История"], in: app)
        XCTAssertTrue(app.staticTexts["История абонемента"].waitForExistence(timeout: 5)); capture(app, "history-\(suffix)")
        let payment = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Пополнение на 8 занятий")).firstMatch
        XCTAssertTrue(payment.exists)
        let oldLabel = payment.label
        let dateRange = oldLabel.range(of: #"\d{1,2}\s+[а-яё]+\s+\d{4}\s*г\.?"#, options: .regularExpression)
        XCTAssertNotNil(dateRange, oldLabel)
        let oldDate = dateRange.map { String(oldLabel[$0]) } ?? ""
        revealAndTap(payment, in: app)
        XCTAssertTrue(app.textFields["Количество занятий"].waitForExistence(timeout: 5)); capture(app, "payment-\(suffix)")
        let comment = app.textFields["Комментарий"]
        revealAndTap(comment, in: app); comment.typeText("Проверка даты")
        app.buttons["dismiss-keyboard"].firstMatch.tap()
        revealAndTap(app.buttons["Сохранить изменения"], in: app)
        let edited = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Проверка даты")).firstMatch
        XCTAssertTrue(edited.waitForExistence(timeout: 5)); XCTAssertTrue(edited.label.contains(oldDate))
        revealAndTap(edited, in: app)
        revealAndTap(app.buttons["Удалить это пополнение"], in: app)
        XCTAssertTrue(app.buttons["Удалить"].waitForExistence(timeout: 5)); app.buttons["Удалить"].tap()
        XCTAssertTrue(app.staticTexts["Осталось 3 занятия"].waitForExistence(timeout: 5))
        revealAndTap(app.buttons["Добавить пополнение"], in: app)
        let lessons = app.textFields["Количество занятий"]
        XCTAssertTrue(lessons.waitForExistence(timeout: 5)); capture(app, "new-\(suffix)")
        revealAndTap(lessons, in: app); lessons.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 20) + "0")
        app.buttons["dismiss-keyboard"].firstMatch.tap()
        revealAndTap(app.buttons["Добавить пополнение"], in: app)
        XCTAssertTrue(app.staticTexts["Укажи целое количество занятий больше нуля."].exists)
        revealAndTap(lessons, in: app); lessons.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 20) + "8")
        app.buttons["dismiss-keyboard"].firstMatch.tap()
        revealAndTap(app.buttons["Добавить пополнение"], in: app)
        XCTAssertTrue(app.staticTexts["Осталось 11 занятий"].waitForExistence(timeout: 5))
        revealAndTap(app.buttons["Удалить полностью"], in: app)
        XCTAssertTrue(app.buttons["Отмена"].waitForExistence(timeout: 5)); app.buttons["Отмена"].tap()
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["Ученики"].waitForExistence(timeout: 15)); app.buttons["Ученики"].tap()
        revealAndTap(app.buttons["Пригласить ученика"], in: app)
        let name = app.textFields["Имя ученика"]
        XCTAssertTrue(name.waitForExistence(timeout: 5)); capture(app, "invite-\(suffix)")
        revealAndTap(name, in: app); name.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 50) + "Демо ученик")
        app.buttons["dismiss-keyboard"].firstMatch.tap()
        revealAndTap(app.buttons["Продолжить"], in: app)
        XCTAssertTrue(app.staticTexts["Ссылка готова"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Скопировать ссылку"].isEnabled); capture(app, "ready-\(suffix)")
        revealAndTap(app.buttons["Готово"], in: app)
        let invited = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Демо ученик,")).firstMatch
        revealAndTap(invited, in: app)
        XCTAssertTrue(app.staticTexts["Ожидает подключения"].waitForExistence(timeout: 5)); capture(app, "pending-\(suffix)")
        XCTAssertFalse(app.buttons["Назначить тренировку"].exists)
        revealAndTap(app.buttons["Удалить ученика"], in: app)
        XCTAssertTrue(app.buttons["Отмена"].waitForExistence(timeout: 5))
        app.buttons["confirm-delete-pending-student"].tap()
        XCTAssertTrue(app.buttons["Пригласить ученика"].waitForExistence(timeout: 5)); XCTAssertFalse(invited.exists)
        app.terminate()
    }
    @MainActor func testWorkoutScreenParity() {
        for role in ["trainer", "student"] {
            for theme in ["light", "dark"] {
                let app = XCUIApplication(); app.launchArguments = ["--demo-" + role, "-appearance", theme]; app.launch()
                XCTAssertTrue(app.buttons["Календарь"].waitForExistence(timeout: 15))
                if role == "trainer" {
                    app.buttons["Ученики"].tap()
                    revealAndTap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Артем А.,")).firstMatch, in: app)
                    revealAndTap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Грудь и плечи")).firstMatch, in: app)
                } else { revealAndTap(app.buttons["Посмотреть тренировку"].firstMatch, in: app) }
                let start = app.buttons["Начать тренировку"]
                XCTAssertTrue(start.waitForExistence(timeout: 5)); capture(app, "\(role)-assignment-\(theme)")
                revealAndTap(start, in: app)
                XCTAssertTrue(app.buttons["Действия тренировки"].waitForExistence(timeout: 5))
                capture(app, "\(role)-active-\(theme)")
                let actions = app.buttons["Действия тренировки"]
                let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: actions)
                XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 5), .completed)
                actions.tap()
                XCTAssertTrue(app.buttons["Изменить упражнения и подходы"].waitForExistence(timeout: 5))
                app.buttons["Сохранить сейчас"].tap()
                app.terminate(); app.launch()
                XCTAssertTrue(app.buttons["Календарь"].waitForExistence(timeout: 15))
                if role == "trainer" {
                    app.buttons["Ученики"].tap()
                    revealAndTap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Артем А.,")).firstMatch, in: app)
                } else { app.buttons["Календарь"].tap() }
                revealAndTap(app.buttons["История тренировок"], in: app)
                revealAndTap(app.buttons["Посмотреть результат"].firstMatch, in: app)
                XCTAssertTrue(app.staticTexts["Длительность"].waitForExistence(timeout: 5))
                XCTAssertTrue(app.staticTexts["1:00:00"].exists)
                if role == "trainer" { XCTAssertTrue(app.staticTexts["Одно занятие списано"].exists) }
                capture(app, "\(role)-result-\(theme)")
                if role == "student" {
                    revealAndTap(app.buttons["Изменить отзыв"], in: app)
                    let comment = app.textFields["Комментарий тренеру"]
                    XCTAssertTrue(comment.waitForExistence(timeout: 5)); capture(app, "feedback-\(theme)")
                    revealAndTap(app.buttons["Отмена"], in: app)
                    XCTAssertTrue(app.buttons["Изменить отзыв"].waitForExistence(timeout: 5))
                } else {
                    revealAndTap(app.buttons["Удалить тренировку"], in: app)
                    XCTAssertTrue(app.buttons["Отмена"].waitForExistence(timeout: 5)); app.buttons["Отмена"].tap()
                    XCTAssertTrue(app.staticTexts["Длительность"].exists)
                }
                app.terminate()
            }
        }
    }
    @MainActor func testStudentManagementParity() {
        for theme in ["light", "dark"] { runStudentManagement(theme: theme) }
    }
    @MainActor func testStudentManagementLargestText() { runStudentManagement(theme: "dark", largest: true) }
    @MainActor private func runStudentManagement(theme: String, largest: Bool = false) {
            let app = XCUIApplication(); app.launchArguments = ["--demo-trainer", "-appearance", theme]
            if largest { app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"] }
            app.launch()
            let theme = largest ? theme + "-largest" : theme
            XCTAssertTrue(app.buttons["Ученики"].waitForExistence(timeout: 15)); app.buttons["Ученики"].tap()
            let student = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Артем А.,")).firstMatch
            XCTAssertTrue(student.waitForExistence(timeout: 5))
            capture(app, "students-\(theme)")
            revealAndTap(student, in: app)
            let assign = app.buttons["Назначить тренировку"]
            XCTAssertTrue(assign.waitForExistence(timeout: 5)); capture(app, "student-\(theme)")
            revealAndTap(assign, in: app)
            let create = app.buttons["Создать тренировку"]
            XCTAssertTrue(create.waitForExistence(timeout: 5)); capture(app, "picker-\(theme)")
            revealAndTap(create, in: app)
            let name = app.textFields["Название тренировки"]
            XCTAssertTrue(name.waitForExistence(timeout: 5))
            XCTAssertGreaterThanOrEqual(name.frame.minX, app.frame.minX)
            XCTAssertLessThanOrEqual(name.frame.maxX, app.frame.maxX)
            capture(app, "editor-\(theme)")
            revealAndTap(app.segmentedControls.buttons["Онлайн"], in: app)
            XCTAssertTrue(app.staticTexts["Рекомендованная дата"].exists)
            XCTAssertFalse(app.buttons["Время"].exists)
            if largest {
                revealAndTap(app.buttons["Рекомендованная дата"], in: app)
                XCTAssertTrue(app.pickerWheels.firstMatch.waitForExistence(timeout: 5))
                capture(app, "date-picker-\(theme)")
                app.buttons["Готово"].tap()
            }
            revealAndTap(app.segmentedControls.buttons["Очно"], in: app)
            app.navigationBars.buttons.firstMatch.tap()
            if app.buttons["Удалить изменения"].exists { app.buttons["Удалить изменения"].tap() }
            XCTAssertTrue(create.waitForExistence(timeout: 5))
            let repeated = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Завершена")).firstMatch
            XCTAssertTrue(repeated.exists); revealAndTap(repeated, in: app)
            XCTAssertTrue(app.staticTexts["Повторить тренировку"].waitForExistence(timeout: 5))
            let addSet = app.buttons["Добавить подход"].firstMatch
            for _ in 0..<8 { if addSet.isHittable { break }; app.swipeUp() }
            XCTAssertTrue(addSet.isHittable); capture(app, "repeat-\(theme)")
            app.terminate()
    }
    @MainActor private func tapVisibleButton(_ title: String, in app: XCUIApplication) {
        let buttons = app.buttons.matching(NSPredicate(format: "label == %@", title))
        XCTAssertTrue(buttons.firstMatch.waitForExistence(timeout: 5))
        guard let visible = buttons.allElementsBoundByIndex.first(where: { $0.isHittable }) else {
            XCTFail("Нет доступной кнопки \(title): \(app.debugDescription)"); return
        }
        visible.tap()
    }
    @MainActor func testNativeInstructionToolbarWithLargestText() {
        let app = XCUIApplication(); app.launchArguments = ["--demo-trainer", "-appearance", "dark", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]; app.launch()
        XCTAssertTrue(app.buttons["Ученики"].waitForExistence(timeout: 15)); app.buttons["Ученики"].tap()
        revealAndTap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Артем А.,")).firstMatch, in: app)
        revealAndTap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Грудь и плечи")).firstMatch, in: app)
        revealAndTap(app.buttons["Редактировать план"], in: app)
        revealAndTap(app.buttons["Инструкция и видео"].firstMatch, in: app)
        let field = app.textFields["Подробное описание упражнения"]
        revealAndTap(field, in: app); field.typeText(" нативная проверка")
        app.buttons["dismiss-keyboard"].firstMatch.tap()
        tapVisibleButton("Сохранить инструкцию", in: app)
        revealAndTap(app.buttons["Инструкция и видео"].firstMatch, in: app)
        XCTAssertTrue(field.waitForExistence(timeout: 5)); XCTAssertTrue((field.value as? String ?? "").contains("нативная проверка"))
        capture(app, "native-instruction-largest")
        tapVisibleButton("Отмена", in: app)
        let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: field)
        XCTAssertEqual(XCTWaiter.wait(for: [closed], timeout: 5), .completed)
        tapVisibleButton("Отмена", in: app)
        XCTAssertTrue(app.buttons["Удалить изменения"].waitForExistence(timeout: 5)); app.buttons["Удалить изменения"].tap()
        app.terminate()
    }
    @MainActor private func revealAndTap(_ element: XCUIElement, in app: XCUIApplication) {
        XCTAssertTrue(element.waitForExistence(timeout: 5))
        for _ in 0..<16 {
            let bar = app.tabBars.firstMatch
            let coveredByTabs = bar.exists && bar.isHittable && element.frame.midY >= bar.frame.minY
            let field = element.elementType == .textField || element.elementType == .textView
            let headerBottom = app.navigationBars.allElementsBoundByIndex.last?.frame.maxY ?? app.frame.minY
            let coveredByHeader = field && element.frame.minY < headerBottom + 8
            if element.isHittable && !coveredByTabs && !coveredByHeader { break }
            if coveredByHeader || element.frame.midY < app.frame.midY { app.swipeDown(velocity: .slow) } else { app.swipeUp(velocity: .slow) }
        }
        XCTAssertTrue(element.isHittable); element.tap()
    }
    @MainActor private func capture(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot()); attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
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
        let open = app.buttons["Посмотреть тренировку"].firstMatch
        XCTAssertTrue(open.waitForExistence(timeout: 15))
        let home = XCTAttachment(screenshot: app.screenshot()); home.name = accessibility ? "student-home-largest-text" : "student-home-small"; home.lifetime = .keepAlways; add(home)
        revealAndTap(open, in: app)
        let start = app.buttons.matching(NSPredicate(format: "label IN %@", ["Начать тренировку", "Продолжить тренировку"])).firstMatch
        XCTAssertTrue(start.waitForExistence(timeout: 5)); revealAndTap(start, in: app)
        let instruction = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Инструкция:")).firstMatch
        revealAndTap(instruction, in: app)
        XCTAssertTrue(app.buttons["Закрыть"].waitForExistence(timeout: 5))
        capture(app, accessibility ? "instruction-largest-text" : "instruction-small")
        revealAndTap(app.buttons["Закрыть"], in: app)
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
        revealAndTap(app.buttons["Как прошла тренировка?"], in: app)
        let feedback = app.textFields["Комментарий тренеру"]
        XCTAssertTrue(feedback.waitForExistence(timeout: 5)); revealAndTap(feedback, in: app)
        feedback.typeText("Тренировка прошла хорошо")
        app.buttons["dismiss-keyboard"].firstMatch.tap()
        revealAndTap(app.buttons["Сохранить обратную связь"], in: app)
        XCTAssertTrue(app.staticTexts["Тренировка прошла хорошо"].waitForExistence(timeout: 10))
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
        app.buttons["Удалить изменения"].tap()
        let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: name)
        XCTAssertEqual(XCTWaiter.wait(for: [closed], timeout: 5), .completed)
        revealAndTap(app.buttons["Изменить личные данные"], in: app)
        XCTAssertTrue(name.waitForExistence(timeout: 5), app.debugDescription); XCTAssertEqual(name.value as? String, original)
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
    @MainActor func testNamedEmptyAssignmentCannotBePublished() {
        for theme in ["light", "dark"] {
            let app = XCUIApplication()
            app.launchArguments = ["--demo-trainer", "-appearance", theme, "--audit-screen", "new-editor"]
            app.launch()
            let name = app.textFields["Название тренировки"]
            XCTAssertTrue(name.waitForExistence(timeout: 15)); name.tap(); name.typeText("Empty publication test")
            let publish = app.navigationBars.buttons["Назначить"]
            XCTAssertTrue(publish.exists); XCTAssertFalse(publish.isEnabled)
            let message = app.staticTexts["Добавь упражнения перед назначением. До назначения черновик виден только тебе."]
            XCTAssertTrue(message.exists)
            if app.buttons["dismiss-keyboard"].firstMatch.exists { app.buttons["dismiss-keyboard"].firstMatch.tap() }
            app.swipeUp()
            capture(app, "empty-assignment-disabled-" + theme)
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
            let search = app.searchFields["Поиск"]
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
                let profile = XCTAttachment(screenshot: app.screenshot()); profile.name = "profile-\(role)-\(theme)"; profile.lifetime = .keepAlways; add(profile)
                if role == "student" {
                    XCTAssertTrue(app.buttons["Изменить личные данные"].exists)
                    app.buttons["Изменить личные данные"].tap()
                    XCTAssertTrue(app.textFields["Имя"].waitForExistence(timeout: 5))
                    app.navigationBars.allElementsBoundByIndex.last!.buttons["Отмена"].tap()
                    if app.buttons["Удалить изменения"].exists { app.buttons["Удалить изменения"].tap() }
                }
                app.buttons["Календарь"].tap()
                XCTAssertTrue(app.buttons["Сегодня"].waitForExistence(timeout: 5))
                app.buttons["Следующий месяц"].tap(); app.buttons["Сегодня"].tap()
                let calendar = XCTAttachment(screenshot: app.screenshot()); calendar.name = "calendar-\(role)-\(theme)"; calendar.lifetime = .keepAlways; add(calendar)
                app.terminate()
            }
        }
    }
    @MainActor func testStudentProfileSubscriptionBothThemes() {
        for theme in ["light", "dark"] {
            let app = XCUIApplication(); app.launchArguments = ["--demo-student", "-appearance", theme]; app.launch()
            XCTAssertTrue(app.buttons["Профиль"].waitForExistence(timeout: 15)); app.buttons["Профиль"].tap()
            XCTAssertTrue(app.staticTexts["Мужской"].waitForExistence(timeout: 5))
            let payments = app.staticTexts.matching(NSPredicate(format: "label == %@", "ПОСЛЕДНИЕ ПОПОЛНЕНИЯ")).firstMatch
            for _ in 0..<12 {
                if payments.isHittable { break }
                app.swipeUp(velocity: .slow)
            }
            XCTAssertTrue(payments.isHittable)
            XCTAssertTrue(app.staticTexts["Осталось 11 занятий"].exists)
            XCTAssertEqual(app.staticTexts.matching(NSPredicate(format: "label == %@", "+8 занятий")).count, 2)
            let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "profile-subscription-\(theme)"; screenshot.lifetime = .keepAlways; add(screenshot)
            let edit = app.buttons["Изменить личные данные"]
            for _ in 0..<6 { if edit.isHittable { break }; app.swipeDown() }
            XCTAssertTrue(edit.isHittable); edit.tap()
            XCTAssertTrue(app.textFields["Имя"].waitForExistence(timeout: 5))
            app.terminate()
        }
    }
    @MainActor func testShellNavigationAndKeyboard() {
        for role in ["trainer", "student"] {
            for theme in ["light", "dark"] {
                let app = XCUIApplication(); app.launchArguments = ["--demo-" + role, "-appearance", theme]; app.launch()
                XCTAssertTrue(app.buttons["Профиль"].waitForExistence(timeout: 15))
                XCTAssertTrue(app.tabBars.firstMatch.exists)
                XCTAssertEqual(app.buttons["Ученики"].exists, role == "trainer")
                XCTAssertTrue(app.tabBars.firstMatch.exists)
                app.buttons["Профиль"].tap()
                XCTAssertTrue(app.staticTexts["Оформление"].waitForExistence(timeout: 5))
                app.navigationBars.buttons.firstMatch.tap()
                XCTAssertTrue(app.buttons["Профиль"].waitForExistence(timeout: 5))
                app.buttons["Заметки"].tap()
                let editor = app.textViews.firstMatch
                for _ in 0..<4 { if editor.isHittable { break }; app.swipeUp() }
                XCTAssertTrue(editor.isHittable); editor.tap()
                XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
                // The system owns tab bar placement while the keyboard is visible.
                XCTAssertTrue(app.buttons["dismiss-keyboard"].firstMatch.isHittable)
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
            XCTAssertTrue(app.buttons["Вставить приглашение"].exists)
            capture(app, "native-invitation-" + theme)
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
