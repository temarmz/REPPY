import XCTest
final class SafariTests: XCTestCase {
 func testLongSafariNavigation() throws {
  continueAfterFailure = false
  let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
  safari.activate()
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
  let address = safari.textFields["Address"]; XCTAssertTrue(address.waitForExistence(timeout: 10)); address.tap(); address.typeText("http://127.0.0.1:4173/#/student\n")
  XCTAssertTrue(safari.buttons["Главная"].waitForExistence(timeout: 5))
  var count = 0
  for round in 0..<5 {
   for label in ["Главная", "Календарь", "Заметки"] {
    safari.swipeUp(velocity: .fast)
    let button = safari.buttons[label].firstMatch; XCTAssertTrue(button.exists); button.tap(); count += 1
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

}
