# Переезд и продолжение разработки

## Чистое клонирование

Нужны Git и Node.js >=22.13.0. Обычный clone загружает историю и удалённые ветки; не используйте `--single-branch` или ZIP, если нужно продолжить незавершённую работу.

```sh
git clone https://github.com/temarmz/REPPY.git
cd REPPY
git branch -r
```

Основная версия находится в `main`. Незавершённые QA-исправления находятся в [PR #20](https://github.com/temarmz/REPPY/pull/20). Пока PR открыт, для продолжения именно этой работы:

```sh
git switch --track origin/qa/2026-10-30-touch-activation
npm ci
npm run dev
```

Если PR уже смержен, оставайтесь в свежей `main`. Проверяйте статус PR, а не считайте этот документ доказательством актуального CI.

```sh
npm test
npm run lint
npm run typecheck
npm run build:pages
npx playwright install --with-deps chromium webkit
npm run test:e2e
```

Установка системных зависимостей Playwright на Linux может потребовать прав администратора. Для изолированных демо/E2E не задавайте Supabase-переменные. Backend-проверки и локальный Supabase описаны в [backend.md](backend.md); не запускайте изменяющие данные проверки против production.

## Что переносится отдельно

- Исходники веба/iOS, изображения `public`, миграции, тесты, lockfile и CI workflows находятся в Git. `node_modules`, `pages-dist`, браузеры Playwright и Xcode DerivedData пересоздаются, их не нужно коммитить.
- Локальные `.env.local`, `.env.admin.local`, `ios/Config/Local.xcconfig`, ключи подписи и резервные копии намеренно исключены из Git. Настройки восстанавливаются из безопасного хранилища и примеров `.env.example`, `.env.admin.example`, `ios/Config/Local.example.xcconfig`. Не публикуйте service-role ключи, токены или архивы данных.
- Без Supabase-переменных веб работает в изолированном демо. Hosted Supabase не переносится клонированием и остаётся отдельным сервисом. Демо-данные/черновики браузера (localStorage/IndexedDB), сессии и Keychain не входят в Git.
- Для iOS нужен Mac с Xcode 16+, см. [ios/README.md](../ios/README.md). Simulator-артефакт CI не является подписанной сборкой для физического iPhone.
- Автоматизация REPPY QA Review, чат и внешние диагностические архивы не являются частью clone. В новом рабочем окружении автоматизацию нужно проверить отдельно. Текущий договор: после локальных проверок и push/обновления PR завершать запуск без ожидания CI/deployment; в следующем запуске проверить прошлый CI один раз. Не мерджить непроверенные обязательные gates.

## Точка продолжения QA, 31 октября 2026

База PR #20: `01d2429d0660da7a8f0c239f1f05563c143acff9`. Исправления общего Button сохраняют нативные submit/reset и отмену DOM click; экран прогресса ученика относится к вкладке «Профиль». CSS, токены, зависимости и backend не менялись.

Последний известный CI исходного head `e87781032f36ffd397f55a0e256d6935ae711348`: [run 41072922799](https://github.com/temarmz/REPPY/actions/runs/41072922799). Backend, 207 unit, lint и typecheck прошли; E2E: 566 passed / 4 failed, deployment skipped. PR не был смержен.

Три падения Chromium вызваны старыми fault-injection обработчиками в `mobile-viewport.spec.ts` и `student-calendar-back.spec.ts`: они блокировали не только browser compatibility click, но и программную DOM-активацию. Сохранённые правки ограничивают эту имитацию `event.isTrusted`, не убирая assertions. Локальная повторная проверка этих двух файлов дала 6 passed; это не результат нового CI.

Остаётся WebKit-падение `critical navigation stays responsive for trainer and student` в `quality-gate.spec.ts`: центр строки прогресса «Жим ногами» перекрыт вкладкой «Календарь» около y=804. Helper проверки доступности уже учитывает прокрутку документа и проходит Chromium, но в WebKit причина ещё не установлена. Исследовать фактический scroll container, момент обновления геометрии и hit-test; не ослаблять assertions и не считать это исправленным.

Все 15 новых WebKit-тестов активации контролов прошли в указанном CI. Локально WebKit был недоступен из-за отсутствующих системных библиотек; реальный iPhone, системная клавиатура и live Telegram не проверены. Нативный callback allowlist подготовлен в исходниках, но по iOS-документации требует отдельной публикации функции. Серверная идемпотентность создания приглашения после commit + lost response остаётся отдельной задачей.

Для следующего запуска: прочитать AGENTS, проверить status/актуальный main и PR/CI один раз, затем продолжить WebKit-диагностику в изолированном demo. Старые отчёты не заменяют текущие проверки. Внешние скриншоты и traces старого рабочего каталога не требуются для сборки; диагностика неуспешного CI доступна в артефактах указанного run, пока не истёк их срок хранения.
