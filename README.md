# REPPY — Prototype V0

Интерактивный mobile-first прототип сервиса для персонального тренера и его учеников.

В опубликованном приложении тренер и ученик входят только через Telegram. Расписание, тренировки, результаты, абонементы и уведомления синхронизируются через Supabase; локальный режим остаётся для изолированных демо- и E2E-проверок.

## Запуск

```bash
npm install
npm run dev
```

Единственная production-сборка для проверки и публикации на GitHub Pages:

```bash
npm run build:pages
```

Полный набор проверок перед публикацией:

```bash
npm test
npm run lint
npm run typecheck
npm run test:e2e
```

Read-only проверка hosted backend и очереди Telegram запускается отдельно с локальным `.env.admin.local`:

```bash
npm run backend:health
```

Ручной backup бесплатного hosted Supabase и проверка его контрольных сумм:

```bash
npm run backup:create
npm run backup:verify
```

Архивы сохраняются в исключённой из Git папке `.backups`; рабочую копию нужно перенести в зашифрованное хранилище вне компьютера.

Для первого локального запуска E2E-тестов установи Chromium командой `npx playwright install chromium`. Команда `npm run test:e2e` сама собирает production-версию, запускает локальный preview и проверяет основные сценарии тренера и ученика.

Статическая GitHub Pages-версия создаётся в `pages-dist`. Hash-маршруты работают после прямого reload, а workflow `.github/workflows/deploy-pages.yml` публикует папку автоматически из ветки `main`.

Графические исходники хранятся только в `public`. Папка `pages-dist` — временный, исключённый из Git результат сборки: Vite пересоздаёт её командой `npm run build:pages`, копируя туда только материалы, необходимые опубликованному сайту. После локальной проверки папку можно удалить — на публикацию это не влияет.

## Данные и авторизация

При настроенных `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY` приложение использует Supabase и Telegram-only авторизацию. Тренер создаёт кабинет после Telegram OpenID, ученик получает одноразовую ссылку от тренера и принимает её тем же способом. Email и пароль пользователю не нужны.

Без Supabase-переменных включается изолированный демо-адаптер на `localStorage`; видео в нём хранятся в IndexedDB. Этот режим используется для разработки и E2E и не смешивается с рабочими аккаунтами.

Рабочее название всех экранов прототипа — **REPPY**.

## Документация

- [ТЗ: прогрессия ученика по упражнениям](docs/student-exercise-progress.md)
- [ТЗ: абонементы учеников](docs/subscriptions.md)
- [ТЗ: асинхронные онлайн-тренировки](docs/online-workouts.md)
- [Актуальный backlog](docs/backlog.md)
- [Backend: стек, схема и локальный запуск](docs/backend.md)
- [Архив завершённого ТЗ по модели тренировок](docs/archive/training-assignment-model.md)
- [Архитектура данных и путь к backend](docs/data-architecture.md)
