import ProgressChart from './ui/progress-chart';
import { collectExerciseProgress } from './exercise-progress';
import { UI_COMPONENTS } from './ui/catalog';
import { InitialsAvatar } from './ui/avatar';
import Icon from './ui/icon';
import { SectionHeading, Field, Badge, ProgressBar, ListRow, NavigationButton } from './ui/patterns';
import { Page, Paragraph, Section, Box, Heading, Inline, Italic, Strong, Small, SelectOption, Card, Nav } from './ui/elements';
import { useState } from 'react';
import { dateKey, type Workout, type SetResult } from './reppy-data';
import { AppErrorScreen, AppStatusBanner } from './ui/app-status';
import WorkoutScheduleFields from './ui/workout-schedule-fields';
import { SegmentedControl, ActionButton, TextField, Input, Select, Textarea, Switch, IconButton, FormError } from './ui/controls';
import ConfirmationModal from './ui/confirmation-modal';
import PageHeader from './route-page-header';
import ReadOnlyExerciseList from './ui/read-only-exercise-list';
import { ActiveExerciseCard, PlanExerciseCard } from './ui/workout-exercise-card';
import ExerciseInstructionModal from './ui/exercise-instruction-modal';
import { exerciseMetadata } from './workout-display';
import NoteDayCard from './ui/note-day-card';

const exampleWorkout: Workout = {
  id: 'kit-workout', name: 'Пример тренировки', createdAt: '2026-01-01T00:00:00Z',
  exercises: [{ id: 'kit-bench', exerciseId: 'bench-press', name: 'Жим лёжа', primaryMuscle: 'Грудь', equipment: 'Штанга', loadMode: 'external', measureType: 'reps', plannedSets: [{ targetReps: 8, targetWeight: 80 }, { targetReps: 8, targetWeight: 80 }], coachNote: 'Держи лопатки сведёнными', instructionText: 'Сведи лопатки, поставь стопы на пол и плавно опусти штангу к груди.' }],
};

const exampleProgress = collectExerciseProgress([70, 75, 80].map((weight, index) => ({
  id: `kit-session-${index}`, assignmentId: `kit-assignment-${index}`, studentId: 'kit-student',
  workoutSnapshot: exampleWorkout, startedAt: `2026-01-${10 + index}T10:00:00Z`, completedAt: `2026-01-${10 + index}T11:00:00Z`, recordedBy: 'trainer' as const,
  results: exampleWorkout.exercises[0].plannedSets.map((_, setIndex) => ({ exerciseId: 'kit-bench', setNumber: setIndex + 1, actualReps: 8, actualWeight: weight, completed: true })),
})), 'kit-student')[0];

export default function DesignKitScreen() {
  const [scheduledFor, setScheduledFor] = useState(dateKey());
  const [scheduledTime, setScheduledTime] = useState('18:00');
  const [toggleActive, setToggleActive] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [instructionOpen, setInstructionOpen] = useState(false);
  const [note, setNote] = useState('Анна: обсудить самочувствие\n• Проверить технику приседа\n• Уточнить удобное время');
  const [exercise, setExercise] = useState(exampleWorkout.exercises[0]);
  const [results, setResults] = useState<SetResult[]>(() => exampleWorkout.exercises[0].plannedSets.map((set, index) => ({ exerciseId: 'kit-bench', setNumber: index + 1, actualWeight: set.targetWeight, actualReps: set.targetReps, completed: index === 0 })));
  const exerciseProps = {
    exercise, metadata: exerciseMetadata(exercise), index: 0, totalExercises: 1, recentlyMoved: false,
    onMoveUp: () => undefined, onMoveDown: () => undefined,
    onShowInstruction: () => setInstructionOpen(true), onShowActions: () => setModalOpen(true),
    onNoteChange: (coachNote: string) => setExercise((current) => ({ ...current, coachNote })),
  };
  return (
    <Page className="content-page narrow-page design-kit-page">
      <PageHeader back="/trainer" eyebrow="Внутренний экран" title="ДИЗАЙН-КИТ" />
      <Paragraph className="design-kit-intro">Библиотека компонентов REPPY. Здесь используются те же контролы, карточки и стили, что на экранах тренера и ученика. Переключи тему в верхней панели, чтобы проверить оба оформления.</Paragraph>

      <Section className="design-kit-section" aria-labelledby="kit-colors-title">
        <SectionHeading title={<>Цвета и поверхности</>}  titleId="kit-colors-title"><Inline>Токены темы</Inline></SectionHeading>
        <Box className="design-kit-swatches" role="list">
          <Box role="listitem"><Italic className="kit-color-background" /><Inline><Strong>Фон</Strong><Small>--app-bg</Small></Inline></Box>
          <Box role="listitem"><Italic className="kit-color-surface" /><Inline><Strong>Поверхность</Strong><Small>--surface</Small></Inline></Box>
          <Box role="listitem"><Italic className="kit-color-raised" /><Inline><Strong>Выше фона</Strong><Small>--surface-2</Small></Inline></Box>
          <Box role="listitem"><Italic className="kit-color-text" /><Inline><Strong>Текст</Strong><Small>--text-primary</Small></Inline></Box>
          <Box role="listitem"><Italic className="kit-color-muted" /><Inline><Strong>Вторичный</Strong><Small>--muted</Small></Inline></Box>
          <Box role="listitem"><Italic className="kit-color-accent" /><Inline><Strong>Акцент</Strong><Small>--lime</Small></Inline></Box>
        </Box>
      </Section>

      <Section className="design-kit-section" aria-labelledby="kit-type-title">
        <SectionHeading title={<>Типографика</>}  titleId="kit-type-title"><Inline>Основные уровни</Inline></SectionHeading>
        <Box className="design-kit-type-samples">
          <Paragraph className="eyebrow">Служебная подпись</Paragraph>
          <Heading>Заголовок секции</Heading>
          <Paragraph>Основной текст интерфейса для коротких объяснений и значимых сообщений.</Paragraph>
          <Small>Вторичный текст и уточнение состояния.</Small>
        </Box>
      </Section>

      <Section className="design-kit-section" aria-labelledby="kit-sizes-title">
        <SectionHeading title={<>Размеры и скругления</>}  titleId="kit-sizes-title"><Inline>44 / 48 / 56 px</Inline></SectionHeading>
        <Box className="design-kit-metrics" role="list">
          <Box role="listitem"><Italic className="kit-radius-small" /><Inline>Малое скругление</Inline></Box>
          <Box role="listitem"><Italic className="kit-radius-medium" /><Inline>Поля и контролы</Inline></Box>
          <Box role="listitem"><Italic className="kit-radius-large" /><Inline>Карточки</Inline></Box>
        </Box>
      </Section>

      <Section className="design-kit-section" aria-labelledby="kit-actions-title">
        <SectionHeading title={<>Действия</>}  titleId="kit-actions-title"><Inline>Обычные и опасные</Inline></SectionHeading>
        <Box className="design-kit-button-grid">
          <ActionButton icon="plus">Основное действие</ActionButton>
          <ActionButton variant="secondary" icon="edit">Вторичное действие</ActionButton>
          <ActionButton variant="danger" icon="trash">Опасное действие</ActionButton>
          <ActionButton variant="secondary" icon="check" disabled>Недоступно</ActionButton>
        </Box>
        <Box className="design-kit-compact-row" aria-label="Размеры кнопок">
          <ActionButton size="small">Маленькая</ActionButton>
          <ActionButton size="medium">Средняя</ActionButton>
          <ActionButton size="large">Большая</ActionButton>
        </Box>
        <Box className="design-kit-compact-row">
          <IconButton icon="plus" label="Добавить" />
          <Switch checked={toggleActive} onCheckedChange={setToggleActive}>Переключатель</Switch>
          <ActionButton variant="secondary" className="design-kit-modal-button" onClick={() => setModalOpen(true)}>Открыть модалку</ActionButton>
        </Box>
      </Section>

      <Section className="design-kit-section" aria-labelledby="kit-fields-title">
        <SegmentedControl label="Пример разделов" value={toggleActive ? 'data' : 'progress'} onChange={(value) => setToggleActive(value === 'data')} options={[{ value: 'data', label: 'Данные' }, { value: 'progress', label: 'Прогресс' }]} />
        <SectionHeading title={<>Поля</>}  titleId="kit-fields-title"><Inline>Общие размеры</Inline></SectionHeading>
        <TextField id="kit-name" label="Название тренировки" defaultValue="Грудь и плечи" />
        <WorkoutScheduleFields scheduledFor={scheduledFor} scheduledTime={scheduledTime} onDateChange={setScheduledFor} onTimeChange={setScheduledTime} />
        <Field label={<>Комментарий</>} className="design-kit-textarea-field"><Textarea defaultValue="Держи лопатки сведёнными" /></Field>
        <Box className="athlete-form design-kit-field-grid">
          <Field label={<>Выбор значения</>} ><Select defaultValue="online"><SelectOption value="online">Онлайн</SelectOption><SelectOption value="in-person">В зале</SelectOption></Select></Field>
          <Field label={<>Числовое поле</>} ><Input type="number" min={0} step="0.5" defaultValue={80} /></Field>
          <Field label={<>Поиск</>} ><Input type="search" placeholder="Найти упражнение" /></Field>
          <Field label={<>Недоступное поле</>} ><Input disabled value="Недоступно" readOnly /></Field>
          <Field label={<>Ошибка заполнения</>} ><Input aria-invalid="true" aria-describedby="kit-error" defaultValue="" placeholder="Обязательное значение" /></Field>
          <Box id="kit-error"><FormError>Заполни обязательное поле</FormError></Box>
        </Box>
      </Section>

      <Section className="design-kit-section" aria-label="Дневник тренера">
        <SectionHeading title="Дневник тренера" />
        <Box className="notes-grid">
          <NoteDayCard date={dateKey()} today value={note} phase="idle" onChange={setNote} />
          <NoteDayCard date="2026-10-30" value="" phase="idle" onChange={() => undefined} />
          <NoteDayCard date="2026-10-29" value="Несохранённый текст остаётся на устройстве" phase="error" onChange={() => undefined} onRetry={() => undefined} />
          <NoteDayCard date="2026-10-28" value="Запись изменилась на другом устройстве" phase="conflict" onChange={() => undefined} onConflict={() => undefined} />
        </Box>
      </Section>

      <Section className="design-kit-section" aria-labelledby="kit-states-title">
        <SectionHeading title={<>Состояния</>}  titleId="kit-states-title"><Inline>Короткие статусы</Inline></SectionHeading>
        <Box className="design-kit-statuses"><Badge>Запланирована</Badge><Badge className="completed">Завершена</Badge><Badge className="attention">Требует внимания</Badge></Box>
        <Box className="design-kit-system-states" aria-label="Системные состояния">
          <AppStatusBanner phase="loading" online onRetry={() => undefined} preview />
          <AppStatusBanner phase="saving" online onRetry={() => undefined} preview />
          <AppStatusBanner phase="idle" online={false} onRetry={() => undefined} preview />
          <AppStatusBanner phase="error" online onRetry={() => undefined} preview />
          <AppStatusBanner phase="error" online conflict onRetry={() => undefined} onReload={() => undefined} preview />
        </Box>
        <AppErrorScreen onRecover={() => undefined} preview />
      </Section>

      <Section className="design-kit-section" aria-labelledby="kit-exercise-title">
        <SectionHeading title={<>Карточка упражнения</>}  titleId="kit-exercise-title"><Inline>Просмотр</Inline></SectionHeading>
        <ReadOnlyExerciseList workout={exampleWorkout} />
      </Section>

      <Section className="design-kit-section" aria-label="Планирование упражнения">
        <SectionHeading title="Планирование упражнения" />
        <PlanExerciseCard {...exerciseProps}
          canRemoveSet={exercise.plannedSets.length > 1}
          onAddSet={() => setExercise((current) => ({ ...current, plannedSets: [...current.plannedSets, { targetWeight: 80, targetReps: 8 }] }))}
          onRemoveSet={() => setExercise((current) => ({ ...current, plannedSets: current.plannedSets.slice(0, -1) }))}
          onSetChange={(index, patch) => setExercise((current) => ({ ...current, plannedSets: current.plannedSets.map((set, setIndex) => setIndex === index ? { ...set, ...patch } : set) }))}
        />
      </Section>

      <Section className="design-kit-section" aria-label="Выполнение упражнения">
        <SectionHeading title="Выполнение упражнения" />
        <ActiveExerciseCard {...exerciseProps} results={results}
          canRemoveSet={results.length > 1}
          onAddSet={() => setResults((current) => [...current, { exerciseId: exercise.id, setNumber: current.length + 1, actualWeight: 80, actualReps: 8, completed: false }])}
          onRemoveSet={() => setResults((current) => current.slice(0, -1))}
          onResultChange={(setNumber, patch) => setResults((current) => current.map((set) => set.setNumber === setNumber ? { ...set, ...patch } : set))}
        />
      </Section>

      <Section className="design-kit-section" aria-labelledby="kit-patterns-title">
        <SectionHeading title="Карточки, списки и навигация" titleId="kit-patterns-title" />
        <Card className="ui-preview-card">
          <SectionHeading title="Общая карточка"><Badge tone="success">Готово</Badge></SectionHeading>
          <Paragraph>Карточки, текст, подписи и медиа используют общие визуальные элементы.</Paragraph>
          <Box className="design-kit-compact-row"><InitialsAvatar name="Анна Иванова" className="person-avatar violet" /><Badge tone="warning">Требует внимания</Badge><Badge tone="danger">Ошибка</Badge></Box>
          <ProgressBar value={65} label="Пример прогресса" />
        </Card>
        <Box className="connected-list">
          <ListRow className="workout-row"><Inline className="workout-number">01</Inline><Inline><Strong>Строка списка</Strong><Small>Название и описание</Small></Inline><Icon name="chevron-right" /></ListRow>
        </Box>
        <Nav className="ui-preview-nav" aria-label="Пример навигации"><NavigationButton active>Активная вкладка</NavigationButton><NavigationButton active={false}>Обычная вкладка</NavigationButton></Nav>
      </Section>

      <Section className="design-kit-section" aria-labelledby="kit-chart-title">
        <SectionHeading title="График прогресса" titleId="kit-chart-title" />
        <ProgressChart entries={exampleProgress.entries} exercise={exampleProgress.exercise} go={() => undefined} />
      </Section>

      <Section className="design-kit-section" aria-labelledby="kit-inventory-title">
        <SectionHeading title="Состав библиотеки" titleId="kit-inventory-title"><Small>{Object.keys(UI_COMPONENTS).length} компонентов</Small></SectionHeading>
        <Paragraph className="design-kit-intro">Общий источник оформления — папка app/ui. Этот список строится из зарегистрированных компонентов библиотеки.</Paragraph>
        <Box className="ui-component-inventory">{Object.keys(UI_COMPONENTS).sort().map((name) => <Inline key={name}>{name}</Inline>)}</Box>
      </Section>

      {modalOpen && <ConfirmationModal title="Пример модального окна" text="Здесь проверяются фон, отступы, кнопки и контраст модального слоя." confirmLabel="Подтвердить" onClose={() => setModalOpen(false)} onConfirm={() => setModalOpen(false)} />}
      {instructionOpen && <ExerciseInstructionModal exercise={exercise} onClose={() => setInstructionOpen(false)} />}
    </Page>
  );
}
