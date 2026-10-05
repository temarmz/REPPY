import { useState } from 'react';
import { dateKey } from './reppy-data';
import Icon from './ui-icon';
import { AppStatusBanner } from './app-status';
import WorkoutScheduleFields from './workout-schedule-fields';
import { ActionButton, TextField } from './ui-controls';
import ConfirmationModal from './confirmation-modal';
import PageHeader from './route-page-header';

export default function DesignKitScreen() {
  const [scheduledFor, setScheduledFor] = useState(dateKey());
  const [scheduledTime, setScheduledTime] = useState('18:00');
  const [toggleActive, setToggleActive] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <main className="content-page narrow-page design-kit-page">
      <PageHeader back="/trainer" eyebrow="Внутренний экран" title="ДИЗАЙН-КИТ" />
      <p className="design-kit-intro">Контрольная страница основных элементов REPPY. Она не входит в рабочую навигацию и нужна для согласования размеров, состояний и будущих тем.</p>

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

      <section className="design-kit-section" aria-labelledby="kit-actions-title">
        <div className="section-heading"><h2 id="kit-actions-title">Действия</h2><span>Обычные и опасные</span></div>
        <div className="design-kit-button-grid">
          <ActionButton icon="plus">Основное действие</ActionButton>
          <ActionButton variant="secondary" icon="edit">Вторичное действие</ActionButton>
          <ActionButton variant="danger" icon="trash">Опасное действие</ActionButton>
          <ActionButton variant="secondary" icon="check" disabled>Недоступно</ActionButton>
        </div>
        <div className="design-kit-compact-row">
          <button className="schedule-add-button" type="button" aria-label="Добавить"><Icon name="plus" /></button>
          <button className={`schedule-view-toggle ${toggleActive ? 'active' : ''}`} type="button" role="switch" aria-checked={toggleActive} onClick={() => setToggleActive((current) => !current)}>
            <span className="schedule-view-icon" aria-hidden="true"><Icon name="calendar" /></span><strong>Переключатель</strong><span className="toggle-track" aria-hidden="true"><i /></span>
          </button>
          <ActionButton variant="secondary" className="design-kit-modal-button" onClick={() => setModalOpen(true)}>Открыть модалку</ActionButton>
        </div>
      </section>

      <section className="design-kit-section" aria-labelledby="kit-fields-title">
        <div className="section-heading"><h2 id="kit-fields-title">Поля</h2><span>Общие размеры</span></div>
        <TextField id="kit-name" label="Название тренировки" defaultValue="Грудь и плечи" />
        <WorkoutScheduleFields scheduledFor={scheduledFor} scheduledTime={scheduledTime} onDateChange={setScheduledFor} onTimeChange={setScheduledTime} />
        <label className="design-kit-textarea-field"><span>Комментарий</span><textarea defaultValue="Держи лопатки сведёнными" /></label>
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
        <section className="readonly-exercise-list" aria-label="Пример упражнения">
          <article className="readonly-exercise-card">
            <header><span>01</span><div><h2>Жим лёжа</h2><small>Грудь · Штанга</small></div></header>
            <div className="readonly-set-list"><p><span>Подход 1</span><strong>80 кг × 8</strong></p><p><span>Подход 2</span><strong>80 кг × 8</strong></p></div>
            <p className="readonly-coach-note"><Icon name="edit" /> Держи лопатки сведёнными</p>
            <ActionButton variant="secondary" className="exercise-progress-button" icon="history">Прогресс упражнения</ActionButton>
          </article>
        </section>
      </section>

      {modalOpen && <ConfirmationModal title="Пример модального окна" text="Здесь проверяются фон, отступы, кнопки и контраст модального слоя." confirmLabel="Подтвердить" onClose={() => setModalOpen(false)} onConfirm={() => setModalOpen(false)} />}
    </main>
  );
}
