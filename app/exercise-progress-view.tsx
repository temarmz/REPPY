import ProgressChart from './ui/progress-chart';
import { ListRow } from './ui/patterns';
import { SectionHeading } from './ui/patterns';
import { Box, Small, Inline, Section, Paragraph, Strong, Italic, Page } from './ui/elements';

import type { DemoState, WorkoutExercise } from './reppy-data';
import { collectExerciseProgress, compareProgress, filterProgressPeriod, progressHref, progressSetLabel } from './exercise-progress';
import Icon from './ui/icon';
import PageHeader from './ui/page-header';
import EmptyState from './ui/empty-state';


type Props = { data: DemoState; studentId: string; exerciseId?: string; search: string; go: (path: string) => void; back: (fallback: string) => void };
const modeLabel = (exercise: WorkoutExercise) => `${exercise.equipment ?? ''} · ${exercise.loadMode === 'bodyweight' ? 'Свой вес' : 'Внешний вес'} · ${exercise.measureType === 'duration' ? 'Время' : 'Повторения'}`;
const sessionCount = (count: number) => `${count} ${{ one: 'занятие', two: 'занятия', few: 'занятия', many: 'занятий', zero: 'занятий', other: 'занятий' }[new Intl.PluralRules('ru').select(count)]}`;
function progressGroups(data: DemoState, studentId: string) {
  return collectExerciseProgress(data.sessions, studentId)
    .map((group) => ({ ...group, entries: filterProgressPeriod(group.entries, 'all') }))
    .filter((group) => group.entries.length);
}

export function StudentExerciseProgress({ data, studentId, go }: Pick<Props, 'data' | 'studentId' | 'go'>) {
  const groups = progressGroups(data, studentId);
  return <Section className="section-block student-exercise-progress" aria-label="Прогресс по упражнениям">
    <SectionHeading title="Прогресс по упражнениям" />
    {groups.length ? <Box className="connected-list">
      {groups.map((group) => {
        const comparison = compareProgress(group.entries)!;
        return <ListRow className="workout-row" type="button" key={group.key} onClick={() => go(progressHref(studentId, group.exercise))}>
        <Inline><Strong>{group.exercise.name}</Strong>
          {groups.filter((item) => item.exercise.exerciseId === group.exercise.exerciseId).length > 1 && <Small>{modeLabel(group.exercise)}</Small>}
          <Inline className="progress-comparison-values">
            {comparison.previous && <Inline>Было: {progressSetLabel(group.exercise, comparison.previous)}</Inline>}
            <Inline>{comparison.previous ? 'Стало: ' : ''}{progressSetLabel(group.exercise, comparison.latest)}</Inline>
          </Inline>
          {comparison.label && <Inline className={`progress-comparison-change trend-${comparison.trend}`}>{comparison.label}</Inline>}
        </Inline><Italic>
          <Icon name="chevron-right" />
        </Italic>
      </ListRow>; })}
    </Box> : <EmptyState icon="history" title="Пока нет прогресса" text="Результаты упражнений появятся после первой завершённой тренировки." />}
  </Section>;
}

export default function ExerciseProgressView({ data, studentId, exerciseId, search, go, back }: Props) {
  const params = new URLSearchParams(search);
  const student = data.students.find((item) => item.id === studentId);
  const groups = progressGroups(data, studentId);
  const group = groups.find((item) => item.exercise.exerciseId === exerciseId
    && (!params.has('loadMode') || item.exercise.loadMode === params.get('loadMode'))
    && (!params.has('measureType') || item.exercise.measureType === params.get('measureType')));
  return <Page className="content-page narrow-page progress-page">
    <PageHeader eyebrow={student?.name ?? 'Ученик не найден'} title={group?.exercise.name.toUpperCase() ?? 'НЕТ РЕЗУЛЬТАТОВ'} onBack={() => back(`/trainer/clients/${studentId}`)} />
    {!student || !group ? <EmptyState icon="history" title="Результаты не найдены" text={student ? 'У этого упражнения пока нет завершённых подходов.' : 'Проверь ссылку или вернись к списку учеников.'} action={`Вернуться к ${student ? 'ученику' : 'ученикам'}`} onAction={() => go(student ? `/trainer/clients/${studentId}` : '/trainer/clients')} /> : <>
      <Paragraph className="progress-muted progress-period">Всё время · {sessionCount(group.entries.length)}</Paragraph>
      <ProgressChart key={group.key} entries={group.entries} exercise={group.exercise} go={go} />
    </>}
  </Page>;
}
