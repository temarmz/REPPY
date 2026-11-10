import { useState } from 'react';
import { ActionButton, Input, Select } from './ui/controls';
import ProgressChart from './ui/progress-chart';
import { ListRow } from './ui/patterns';
import { SectionHeading } from './ui/patterns';
import { Box, Small, Inline, Section, Paragraph, Strong, Italic, Page, SelectOption } from './ui/elements';

import { exerciseMuscleGroups, type DemoState, type WorkoutExercise, type MuscleGroup } from './reppy-data';
import { collectExerciseProgress, compareProgress, filterProgressPeriod, orderProgressGroups, progressHref, progressSetLabel } from './exercise-progress';
import Icon from './ui/icon';
import PageHeader from './ui/page-header';
import EmptyState from './ui/empty-state';


type ProgressArea = 'trainer' | 'student';
type Props = { data: DemoState; studentId: string; exerciseId?: string; search: string; go: (path: string) => void; back: (fallback: string) => void; area?: ProgressArea };
const modeLabel = (exercise: WorkoutExercise) => `${exercise.equipment ?? ''} · ${exercise.loadMode === 'bodyweight' ? 'Свой вес' : 'Внешний вес'} · ${exercise.measureType === 'duration' ? 'Время' : 'Повторения'}`;
const sessionCount = (count: number) => `${count} ${{ one: 'занятие', two: 'занятия', few: 'занятия', many: 'занятий', zero: 'занятий', other: 'занятий' }[new Intl.PluralRules('ru').select(count)]}`;
function progressGroups(data: DemoState, studentId: string) {
  return collectExerciseProgress(data.sessions, studentId)
    .map((group) => ({ ...group, entries: filterProgressPeriod(group.entries, 'all') }))
    .filter((group) => group.entries.length);
}

export function StudentExerciseProgress({ data, studentId, go, area = 'trainer', hideEmpty = false, compact = false, showHeading = true }: Pick<Props, 'data' | 'studentId' | 'go' | 'area'> & { hideEmpty?: boolean; compact?: boolean; showHeading?: boolean }) {
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState<'all' | MuscleGroup>('all');
  const groups = orderProgressGroups(progressGroups(data, studentId), compact);
  const muscles = [...new Set(groups.flatMap((group) => exerciseMuscleGroups(group.exercise)))];
  const visible = compact ? groups.slice(0, 6) : groups.filter(({ exercise }) => (muscle === 'all' || exerciseMuscleGroups(exercise).includes(muscle)) && `${exercise.name} ${exercise.equipment ?? ''} ${exerciseMuscleGroups(exercise).join(' ')}`.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')));
  if (hideEmpty && !groups.length) return null;
  return <Section className="section-block student-exercise-progress" aria-label="Прогресс по упражнениям">
    {showHeading && <SectionHeading title="Прогресс по упражнениям" />}
    {!compact && groups.length > 0 && <Box className="progress-filters">
      <Input type="search" aria-label="Поиск в прогрессе" placeholder="Поиск упражнения" value={search} onChange={(event) => setSearch(event.target.value)} />
      <Select aria-label="Мышечная группа" value={muscle} onChange={(event) => setMuscle(event.target.value as 'all' | MuscleGroup)}><SelectOption value="all">Все мышцы</SelectOption>{muscles.map((item) => <SelectOption key={item} value={item}>{item}</SelectOption>)}</Select>
    </Box>}
    {groups.length > 0 && !visible.length && <EmptyState icon="history" title="Ничего не найдено" text="Измени поиск или мышечную группу." />}
    {groups.length ? <Box className={compact ? "progress-card-list progress-tile-grid" : "progress-card-list"}>
      {visible.map((group) => {
        const comparison = compareProgress(group.entries)!;
        return <ListRow className={compact ? "workout-row progress-tile" : "workout-row"} type="button" key={group.key} onClick={() => go(progressHref(studentId, group.exercise, area))}>
        <Inline><Strong>{group.exercise.name}</Strong>
          {groups.filter((item) => item.exercise.exerciseId === group.exercise.exerciseId).length > 1 && <Small>{modeLabel(group.exercise)}</Small>}
          <Inline className="progress-comparison-values">
            {!compact && comparison.previous && <Inline>Было: {progressSetLabel(group.exercise, comparison.previous)}</Inline>}
            <Inline>{!compact && comparison.previous ? 'Стало: ' : ''}{progressSetLabel(group.exercise, comparison.latest)}</Inline>
          </Inline>
          {comparison.label && (!compact || comparison.trend === 'up') && <Inline className={`progress-comparison-change trend-${comparison.trend}`}>{compact ? comparison.label.split(' при ')[0] : comparison.label}</Inline>}
        </Inline>{!compact && <Italic>
          <Icon name="chevron-right" />
        </Italic>}
      </ListRow>; })}
    </Box> : <EmptyState icon="history" title="Пока нет прогресса" text="Результаты упражнений появятся после первой завершённой тренировки." />}
    {compact && groups.length > 0 && <ActionButton variant="secondary" icon="chevron-right" onClick={() => go("/student/progress")}>Все упражнения</ActionButton>}
  </Section>;
}

export default function ExerciseProgressView({ data, studentId, exerciseId, search, go, back, area = 'trainer' }: Props) {
  if (!exerciseId && area === 'student') return <Page className="content-page narrow-page progress-page">
    <PageHeader title="Все упражнения" onBack={() => back('/student')} />
    <StudentExerciseProgress data={data} studentId={studentId} go={go} area="student" showHeading={false} />
  </Page>;
  const params = new URLSearchParams(search);
  const student = data.students.find((item) => item.id === studentId);
  const groups = progressGroups(data, studentId);
  const group = groups.find((item) => item.exercise.exerciseId === exerciseId
    && (!params.has('loadMode') || item.exercise.loadMode === params.get('loadMode'))
    && (!params.has('measureType') || item.exercise.measureType === params.get('measureType')));
  return <Page className="content-page narrow-page progress-page">
    <PageHeader eyebrow={area === 'student' ? 'Мой прогресс' : student?.name ?? 'Ученик не найден'} title={group?.exercise.name.toUpperCase() ?? 'НЕТ РЕЗУЛЬТАТОВ'} onBack={() => back(area === 'student' ? '/student' : `/trainer/clients/${studentId}`)} />
    {!student || !group ? <EmptyState icon="history" title="Результаты не найдены" text={student ? 'У этого упражнения пока нет завершённых подходов.' : 'Проверь ссылку или вернись к списку учеников.'} action={area === 'student' ? 'Вернуться на главную' : `Вернуться к ${student ? 'ученику' : 'ученикам'}`} onAction={() => go(area === 'student' ? '/student' : student ? `/trainer/clients/${studentId}` : '/trainer/clients')} /> : <>
      <Paragraph className="progress-muted progress-period">Всё время · {sessionCount(group.entries.length)}</Paragraph>
      <ProgressChart key={group.key} entries={group.entries} exercise={group.exercise} go={go} sessionHref={(sessionId) => area === 'student' ? `/student/calendar/sessions/${sessionId}` : `/trainer/sessions/${sessionId}`} />
    </>}
  </Page>;
}
