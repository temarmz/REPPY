import { useState } from 'react';
import { dateKey, type Workout } from './reppy-data';
import { AppStatusBanner } from './app-status';
import WorkoutScheduleFields from './workout-schedule-fields';
import { ActionButton, TextField, Input, Select, Textarea, Switch, IconButton, FormError } from './ui-controls';
import ConfirmationModal from './confirmation-modal';
import PageHeader from './route-page-header';
import ReadOnlyExerciseList from './read-only-exercise-list';

const exampleWorkout: Workout = {
  id: 'kit-workout', name: 'Пример тренировки', createdAt: '2026-01-01T00:00:00Z',
  exercises: [{ id: 'kit-bench', exerciseId: 'bench-press', name: 'Жим лёжа', primaryMuscle: 'Грудь', equipment: 'Штанга', loadMode: 'external', measureType: 'reps', plannedSets: [{ targetReps: 8, targetWeight: 80 }, { targetReps: 8, targetWeight: 80 }], coachNote: 'Держи лопатки сведёнными', instructionText: 'Сведи лопатки, поставь стопы на пол и плавно опусти штангу к груди.' }],
};

export default function DesignKitScreen() {
  const [scheduledFor, setScheduledFor] = useState(dateKey());
  const [scheduledTime, setScheduledTime] = useState('18:00');
  const [toggleActive, setToggleActive] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <main className="content-page narrow-page design-kit-page">
      <PageHeader back="/trainer" eyebrow="Внутренний экран" title="ДИЗАЙН-КИТ" />
      <p className="design-kit-intro">Библиотека компонентов REPPY. Здесь используются те же контролы, карточки и стили, что на экранах тренера и ученика. Переключи тему в верхней панели, чтобы проверить оба оформления.</p>

      <section className="design-kit-section" aria-labelledby="kit-colors-title">
        <div className="section-heading"><h2 id="kit-colors-title">Цвета и поверхности</h2><span>Токены темы</span></div>
        <div className="design-kit-swatches" role="list">
          <div role="listitem"><i className="kit-color-background" /><span><strong>Фон</strong><small>--app-bg</small></span></div>
          <div role="listitem"><i className="kit-color-surface" /><span><strong>Поверхность</strong><small>--surface</small></span></div>
          <div role="listitem"><i className="kit-color-raised" /><span><strong>Выше фона</strong><small>--surface-2</small></span></div>
          <div role="listitem"><i className="kit-color-text" /><span><strong>Текст</strong><small>--text-primary</small></span></div>
          <div role="listitem"><i className="kit-color-muted" /><span><strong>Вторичный</strong><small>--muted</small></span></div>
          <div role="listitem"><i className="kit-color-accent" /><span><strong>Акцент</strong><small>--lime</small></span></div>
        </div>
      </section>

      <section className="design-kit-section" aria-labelledby="kit-type-title">
        <div className="section-heading"><h2 id="kit-type-title">Типографика</h2><span>Основные уровни</span></div>
        <div className="design-kit-type-samples">
          <p className="eyebrow">Служебная подпись</p>
          <h2>Заголовок секции</h2>
          <p>Основной текст интерфейса для коротких объяснений и значимых сообщений.</p>
          <small>Вторичный текст и уточнение состояния.</small>
        </div>
      </section>

      <section className="design-kit-section" aria-labelledby="kit-sizes-title">
        <div className="section-heading"><h2 id="kit-sizes-title">Размеры и скругления</h2><span>Общие параметры</span></div>
        <div className="design-kit-metrics" role="list">
          <div role="listitem"><i className="kit-radius-small" /><span>Малое скругление</span></div>
          <div role="listitem"><i className="kit-radius-medium" /><span>Поля и контролы</span></div>
          <div role="listitem"><i className="kit-radius-large" /><span>Карточки</span></div>
        </div>
      </section>

      <section className="design-kit-section" aria-labelledby="kit-actions-title">
        <div className="section-heading"><h2 id="kit-actions-title">Действия</h2><span>Обычные и опасные</span></div>
        <div className="design-kit-button-grid">
          <ActionButton icon="plus">Основное действие</ActionButton>
          <ActionButton variant="secondary" icon="edit">Вторичное действие</ActionButton>
          <ActionButton variant="danger" icon="trash">Опасное действие</ActionButton>
          <ActionButton variant="secondary" icon="check" disabled>Недоступно</ActionButton>
        </div>
        <div className="design-kit-compact-row" aria-label="Размеры кнопок">
          <ActionButton size="small">Маленькая</ActionButton>
          <ActionButton size="medium">Средняя</ActionButton>
          <ActionButton size="large">Большая</ActionButton>
        </div>
        <div className="design-kit-compact-row">
          <IconButton icon="plus" label="Добавить" />
          <Switch checked={toggleActive} onCheckedChange={setToggleActive}>Переключатель</Switch>
          <ActionButton variant="secondary" className="design-kit-modal-button" onClick={() => setModalOpen(true)}>Открыть модалку</ActionButton>
        </div>
      </section>

      <section className="design-kit-section" aria-labelledby="kit-fields-title">
        <div className="section-heading"><h2 id="kit-fields-title">Поля</h2><span>Общие размеры</span></div>
        <TextField id="kit-name" label="Название тренировки" defaultValue="Грудь и плечи" />
        <WorkoutScheduleFields scheduledFor={scheduledFor} scheduledTime={scheduledTime} onDateChange={setScheduledFor} onTimeChange={setScheduledTime} />
        <label className="design-kit-textarea-field"><span>Комментарий</span><Textarea defaultValue="Держи лопатки сведёнными" /></label>
        <div className="athlete-form design-kit-field-grid">
          <label><span>Выбор значения</span><Select defaultValue="online"><option value="online">Онлайн</option><option value="in-person">В зале</option></Select></label>
          <label><span>Числовое поле</span><Input type="number" min={0} step="0.5" defaultValue={80} /></label>
          <label><span>Поиск</span><Input type="search" placeholder="Найти упражнение" /></label>
          <label><span>Недоступное поле</span><Input disabled value="Недоступно" readOnly /></label>
          <label><span>Ошибка заполнения</span><Input aria-invalid="true" aria-describedby="kit-error" defaultValue="" placeholder="Обязательное значение" /></label>
          <div id="kit-error"><FormError>Заполни обязательное поле</FormError></div>
        </div>
      </section>

      <section className="design-kit-section" aria-labelledby="kit-states-title">
        <div className="section-heading"><h2 id="kit-states-title">Состояния</h2><span>Короткие статусы</span></div>
        <div className="design-kit-statuses"><span>Запланирована</span><span className="completed">Завершена</span><span className="attention">Требует внимания</span></div>
        <div className="design-kit-system-states" aria-label="Системные состояния">
          <AppStatusBanner phase="loading" online onRetry={() => undefined} preview />
          <AppStatusBanner phase="saving" online onRetry={() => undefined} preview />
          <AppStatusBanner phase="idle" online={false} onRetry={() => undefined} preview />
          <AppStatusBanner phase="error" online onRetry={() => undefined} preview />
          <AppStatusBanner phase="error" online conflict onRetry={() => undefined} onReload={() => undefined} preview />
        </div>
      </section>

      <section className="design-kit-section" aria-labelledby="kit-exercise-title">
        <div className="section-heading"><h2 id="kit-exercise-title">Карточка упражнения</h2><span>Эталон порядка</span></div>
        <ReadOnlyExerciseList workout={exampleWorkout} />
      </section>

      {modalOpen && <ConfirmationModal title="Пример модального окна" text="Здесь проверяются фон, отступы, кнопки и контраст модального слоя." confirmLabel="Подтвердить" onClose={() => setModalOpen(false)} onConfirm={() => setModalOpen(false)} />}
    </main>
  );
}
