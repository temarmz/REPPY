# Операционная готовность — 7 ноября 2026

Изменения подготовлены и проверены локально. Production и его данные не изменялись; GitHub workflows ещё не запускались с этими изменениями. Правила эксплуатации и стоп-условия: [test-operations.md](test-operations.md).

## Реализация

- Веб/iOS diagnostics v2: release, случайные operation/request IDs, status/длительности; веб сохраняет отдельные бизнес-команды и транспорт, iOS — категории API. Серверные Edge handlers возвращают ID и пишут JSON status/duration; зависший handler отмечается через 15 с.
- Сырые ошибки/стеки UI и Telegram удалены из прикладных логов; старый UI-журнал удаляется при загрузке. Health-check не выводит raw outbox errors. Тесты проверяют отсутствие payload, адреса пользователя, URL и токена в экспортах/серверном событии. Инфраструктурные access-логи Supabase этим не проверены.
- Backup v2 дополнен `platform-hooks.sql`: стандартный CLI dump не сохранял прикладной Auth trigger и четыре Storage policies. Проверка контрольных сумм теперь требует все обязательные файлы.
- Deploy сохраняет неизменяемый артефакт статики с SHA-256 и release.json. Отдельный workflow восстанавливает успешный main artifact, сверяет источник/commit/release и не пересобирает код. Локальные drills и проверки WebKit добавлены в основной CI.
- Прокрутка больше не расходует History API quota на каждом кадре. Позиция сохраняется отдельно по записи и маршруту. В WebKit найдена и исправлена гонка capture/bubble: закрытый по Back modal успевал размонтироваться и навигация открывала подтверждение снова. Событие теперь явно помечается. Общие modal-trigger кнопки фокусируются при активации Safari, чтобы возвращение фокуса работало.

## Доказательства

| Проверка | Итог |
| --- | --- |
| `npm test` | 243/243 |
| Основной E2E | 564/564; Chromium 390 px и quality gate WebKit/360 px/light/desktop |
| Operations browser suite | 20/20; Chromium 390 px, WebKit 360 px; обе роли/темы, 160 кадров scroll без history writes, reload, dirty Back/Forward, modal Back/focus |
| Нативный XCTest `NativeAccountTests` | 10/10 на iPhone Simulator iOS 18.3; warnings as errors; HTTP URLProtocol, память вместо личного Keychain в transport-тестах |
| Portable Swift | 57/57 |
| `lint`, `typecheck`, `ios:check`, build, `git diff --check` | Успешно |
| Изолированный restore, финальный повтор | 46 включённых в data dump таблиц, баланс 7, Auth provisioning, owner/outsider RLS, четыре Storage policies, SHA-256 media, отказ при порче; cleanup=true; 9.9 с |
| Статический rollback, финальный повтор | Две сборки на одном origin; предыдущая удалена и заново извлечена из tar, проверены SHA-256/release и сохранность demo localStorage; 1.3 с |
| Локальные Edge probes | Auth 503 без Telegram secrets, notifications OPTIONS 204, webhook OPTIONS 405; все ответы с operation ID. Реальная доставка/Telegram OAuth этим не проверялись |
| Workflow files | YAML разобран; реальный GitHub Actions deploy/rollback не выполнялся |
| Сводка экспорта | 20 synthetic запросов → p95 1800 мс; pending → success одного ID не считается текущим зависанием |

Артефакты исключены из Git: `work/ops-restore-1794040329102/report.json`, `work/ops-rollback/report.json`, `work/ops-native-verified.xcresult`, `work/ops-browser-report.json`, `work/ops-server-probe.json`. Временные аккаунты, тестовые строки, исходное видео и контейнеры восстановления удалены. SQL dumps drills удалены; остался синтетический восстановленный файл и обезличенные отчёты.

Restore bootstrap использовал управляемые схемы и роли **той же локальной платформы**; data/roles/schema/hooks восстановлены из настоящего CLI backup. Векторные и миграционные служебные таблицы CLI не включает в data dump, сравнение на них не распространяется. Сопоставление версий hosted Auth, загрузка восстановленного видео через hosted Storage API и hosted RTO не доказаны. Сохранённые локальные времена не являются целевыми RTO для production.

## Условия перед массовой сессией

Опубликовать изменения веба/Edge Functions и выдать iOS-сборку с уникальным release. Получить два успешных main release artifacts и свежий production backup v2 не старше 24 ч. Проверить доступ оператора к журналам и к запуску rollback, записать baseline задержек. Наблюдение во время теста — каждые 5 минут; детали и пороги в инструкции.

Клиентские события не отправляются в централизованный collector: расследование использует локальный экспорт и серверные журналы. Внешний мониторинг всех клиентских сбоев и автоматические SLO alerts не объявляются реализованными.

Непейсированное превышение системной квоты WebKit при настоящих переходах остаётся известной границей. Исключения не подавляются, фальшивое успешное переключение и автоматический reload не введены. Обычные действия, вызывающие такую ошибку, являются стоп-условием.
