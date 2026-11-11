import XCTest
final class SafariTests: XCTestCase {
 func testFinishModalKeyboard() throws {
  continueAfterFailure = false
  let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari"); safari.activate()
  if safari.buttons["Done"].exists { safari.buttons["Done"].firstMatch.tap() }
  else if safari.buttons["selected"].exists { safari.buttons["selected"].firstMatch.tap() }
  let address = safari.textFields["Address"]
  if !address.exists { safari.swipeDown(); safari.swipeDown() }
  XCTAssertTrue(address.waitForExistence(timeout: 15), safari.debugDescription)
  let url = "http://127.0.0.1:4173/?keyboard-check=" + UUID().uuidString + "#/trainer/workout/assignment-artem-push-today\n"
  address.tap(); address.typeText(url)
  let demo = safari.buttons["Попробовать REPPY"]
  if demo.waitForExistence(timeout: 2) {
   demo.tap()
   address.tap(); address.typeText(url)
  }
  let finish = safari.buttons["Завершить тренировку"]
  XCTAssertTrue(finish.waitForExistence(timeout: 15), safari.debugDescription)
  for _ in 0..<15 { if finish.isHittable && finish.frame.maxY < safari.frame.maxY - 90 { break }; safari.swipeUp() }
  finish.tap()
  let comment = safari.textViews["Комментарий о тренировке"]
  XCTAssertTrue(comment.waitForExistence(timeout: 5), safari.debugDescription)
  comment.tap(); comment.typeText("Проверка клавиатуры Safari")
  XCTAssertTrue(safari.keyboards.firstMatch.waitForExistence(timeout: 5))
  let visible = NSPredicate { _, _ in
   comment.frame.minY > 50 && comment.frame.maxY <= safari.keyboards.firstMatch.frame.minY
  }
  expectation(for: visible, evaluatedWith: comment); waitForExpectations(timeout: 5)
  XCTAssertTrue(comment.isHittable)
  let shot = XCTAttachment(screenshot: safari.screenshot()); shot.name = "finish-keyboard-visible"; shot.lifetime = .keepAlways; add(shot)
  if safari.buttons["Done"].exists { safari.buttons["Done"].firstMatch.tap() }
  else { safari.buttons["selected"].firstMatch.tap() }
  let resume = safari.buttons["Продолжить тренировку"]
  for _ in 0..<4 { if resume.isHittable { break }; safari.swipeUp() }
  XCTAssertTrue(resume.waitForExistence(timeout: 5)); resume.tap()
  XCTAssertFalse(safari.textViews["Комментарий о тренировке"].exists)
 }
 func testLongSafariNavigation() throws {
  continueAfterFailure = false
  let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
  safari.activate()
  if safari.buttons["Done"].exists { safari.buttons["Done"].firstMatch.tap() }
  let address = safari.textFields["Address"]
  XCTAssertTrue(address.waitForExistence(timeout: 15))
  address.tap(); address.typeText("http://127.0.0.1:4173/#/trainer\n")
  let notes = safari.buttons["Заметки"]
  XCTAssertTrue(notes.waitForExistence(timeout: 20), safari.debugDescription)
  var count = 0
  for round in 0..<8 {
   for label in ["Главная", "Календарь", "Ученики", "Заметки"] {
    let button = safari.buttons[label].firstMatch
    XCTAssertTrue(button.exists, "Missing tab \(label)")
    safari.swipeUp(velocity: .fast)
    button.tap(); count += 1
    let markerLabel = ["Главная": "СЕГОДНЯ", "Календарь": "Следующий месяц", "Ученики": "Пригласить ученика", "Заметки": "Следующие четыре дня"][label]!
    let marker = safari.descendants(matching: .any).matching(NSPredicate(format: "label == %@", markerLabel)).firstMatch
    XCTAssertTrue(marker.waitForExistence(timeout: 3), "Tab did not open after one tap: \(label)")
    let shot = XCTAttachment(screenshot: safari.screenshot()); shot.name = "round-\(round)-\(label)"; shot.lifetime = .keepAlways; add(shot)
    if label == "Заметки" {
     for action in ["Следующие четыре дня", "Предыдущие четыре дня", "Сегодня"] {
      let target = safari.buttons[action].firstMatch
      XCTAssertTrue(target.exists, "Missing action \(action)"); target.tap(); count += 1
     }
    }

   }
   safari.buttons["Профиль"].tap(); count += 1
   XCTAssertTrue(safari.buttons["Переключиться в роль ученика"].waitForExistence(timeout: 3))
  }
  print("SAFARI_E2E_ACTIVATIONS=\(count)")
 }
 func testStudentFieldsAndTabs() throws {
  continueAfterFailure = false
  let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari"); safari.activate()
  if safari.buttons["Done"].exists { safari.buttons["Done"].firstMatch.tap() }
  let address = safari.textFields["Address"]; XCTAssertTrue(address.waitForExistence(timeout: 10)); address.tap(); address.typeText("http://127.0.0.1:4173/#/student\n")
  XCTAssertTrue(safari.buttons["Главная"].waitForExistence(timeout: 5))
  XCTAssertFalse(safari.buttons["Ученики"].exists, "Expected student navigation")
  var count = 0
  for round in 0..<5 {
   for label in ["Главная", "Календарь", "Заметки"] {
    safari.swipeUp(velocity: .fast)
    let button = safari.buttons[label].firstMatch; XCTAssertTrue(button.exists); button.tap(); count += 1
    let markerLabel = ["Главная": "Посмотреть тренировку", "Календарь": "Следующий месяц", "Заметки": "Следующие четыре дня"][label]!
    XCTAssertTrue(safari.buttons[markerLabel].waitForExistence(timeout: 3), "Tab did not open after one tap: \(label)")
    if label == "Календарь" {
     for action in ["Следующий месяц", "Предыдущий месяц"] { let control = safari.buttons[action]; XCTAssertTrue(control.waitForExistence(timeout: 3)); control.tap(); count += 1 }
    }
    if label == "Заметки" {
     XCTAssertTrue(safari.buttons["Следующие четыре дня"].waitForExistence(timeout: 3))
     for index in 0..<4 {
      let field = safari.textViews.element(boundBy: index); XCTAssertTrue(field.exists, safari.debugDescription); field.tap(); field.typeText(" test"); count += 1
      let shot = XCTAttachment(screenshot: safari.screenshot()); shot.name = "student-\(round)-field-\(index)"; shot.lifetime = .keepAlways; add(shot)
      safari.buttons["Done"].firstMatch.tap(); count += 1
     }
    }

   }
   safari.buttons["Профиль"].tap(); count += 1
   XCTAssertTrue(safari.buttons["Редактировать"].waitForExistence(timeout: 3))
  }
  print("SAFARI_STUDENT_ACTIVATIONS=\(count)")
 }

 func testWorkoutEditorControls() throws {
  continueAfterFailure = false
  let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari"); safari.activate()
  if safari.buttons["Выйти без сохранения"].exists { safari.buttons["Выйти без сохранения"].tap() }
  if safari.buttons["Done"].exists { safari.buttons["Done"].firstMatch.tap() }
  let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
  let day = formatter.string(from: Calendar.current.date(byAdding: .day, value: 370, to: Date())!)
  let address = safari.textFields["Address"]; XCTAssertTrue(address.waitForExistence(timeout: 10)); address.tap(); address.typeText("http://127.0.0.1:4173/#/trainer/schedule/\(day)/artem/new\n")
  let priorDraft = safari.buttons["Выйти без сохранения"]; if priorDraft.waitForExistence(timeout: 1) { priorDraft.tap() }
  let name = safari.textFields["Название тренировки"]; XCTAssertTrue(name.waitForExistence(timeout: 5), safari.debugDescription); name.tap(); name.typeText("Safari simulator")
  safari.buttons["Done"].firstMatch.tap()
  func reveal(_ element: XCUIElement) {
   for _ in 0..<4 {
    let boundary = safari.buttons["Ученики"].frame.minY
    if element.exists && element.frame.maxY < boundary - 8 && element.frame.minY > 130 { return }
    if element.exists && element.frame.minY <= 130 { safari.swipeDown() } else { safari.swipeUp() }
   }
  }
  let openPicker = safari.buttons["Добавить упражнение"].firstMatch
  reveal(openPicker); openPicker.tap()
  let addButton = safari.buttons["Добавить Жим лёжа"]; XCTAssertTrue(addButton.waitForExistence(timeout: 5), safari.debugDescription); addButton.tap(); safari.buttons["Готово"].tap()
  let addSet = safari.buttons["Добавить подход — Жим лёжа"]
  if !safari.textFields["КГ"].firstMatch.exists { reveal(addSet); addSet.tap() }
  for label in ["КГ", "ПОВТОРЫ"] {
   let field = safari.textFields[label].firstMatch; XCTAssertTrue(field.waitForExistence(timeout: 3), safari.debugDescription); reveal(field); field.tap(); field.typeText("10"); safari.buttons["Done"].firstMatch.tap()
  }
  reveal(addSet); addSet.tap()
  let removeSet = safari.buttons["Удалить последний подход — Жим лёжа"]; removeSet.tap()
  let removeExercise = safari.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Действия — Жим лёжа")).firstMatch; reveal(removeExercise); removeExercise.tap()
  let stay = safari.buttons["Закрыть действия"]; XCTAssertTrue(stay.waitForExistence(timeout: 3)); stay.tap()
  XCTAssertTrue(removeExercise.exists)
  let shot = XCTAttachment(screenshot: safari.screenshot()); shot.name = "workout-editor-fields"; shot.lifetime = .keepAlways; add(shot)
  safari.buttons["Назад"].firstMatch.tap()
  let discard = safari.buttons["Выйти без сохранения"]; XCTAssertTrue(discard.waitForExistence(timeout: 3)); discard.tap()
 }

}
