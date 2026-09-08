import { useEffect, useRef, useState } from 'react';
import type { DemoState, WorkoutExercise } from './reppy-data';
import { collectExerciseProgress, filterProgressPeriod, progressHref, progressMetric, progressNumber, progressSetLabel, type ProgressEntry } from './exercise-progress';
import Icon from './ui-icon';
import PageHeader from './page-header';

type Props = { data: DemoState; studentId: string; exerciseId?: string; search: string; go: (path: string) => void; back: (fallback: string) => void };
const dateLabel = (entry: ProgressEntry) => new Date(entry.timestamp).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
const timeLabel = (entry: ProgressEntry) => new Date(entry.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const modeLabel = (exercise: WorkoutExercise) => `${exercise.equipment ?? ''} · ${exercise.loadMode === 'bodyweight' ? 'Свой вес' : 'Внешний вес'} · ${exercise.measureType === 'duration' ? 'Время' : 'Повторения'}`;
const sessionCount = (count: number) => `${count} ${{ one: 'занятие', two: 'занятия', few: 'занятия', many: 'занятий', zero: 'занятий', other: 'занятий' }[new Intl.PluralRules('ru').select(count)]}`;
const entryDate = (entry: ProgressEntry, entries: ProgressEntry[]) => `${dateLabel(entry)}${entries.filter((item) => dateLabel(item) === dateLabel(entry)).length > 1 ? ` · ${timeLabel(entry)}` : ''}`;
function ResultSets({ entry, compact = false }: { entry: ProgressEntry; compact?: boolean }) {
  const completed = entry.blocks.flatMap((block) => block.sets.filter((set) => set.valid));
  const shown = compact ? Math.min(3, completed.length) : completed.length;
  return <div className="progress-sets">
    {entry.blocks.map((block, index) => {
      const sets = block.sets.filter((set) => set.valid);
      const visible = compact ? sets.filter((set) => completed.indexOf(set) < 3) : sets;
      if (!visible.length) return null;

      return <div key={block.exercise.id}>
        {entry.blocks.length > 1 && <small>Блок {index + 1}</small>}
        {visible.map((set) => <span className="progress-set" key={set.number}><span className="progress-set-number">{set.number}.</span> {progressSetLabel(block.exercise, set.result!)}</span>)}
      </div>;
    })}
    {compact && completed.length > shown && <small>ещё {completed.length - shown}</small>}
    {entry.completed < entry.total && <small className="progress-muted">Выполнено {entry.completed} из {entry.total}</small>}
  </div>;
}
function ProgressChart({ entries, exercise, go }: { entries: ProgressEntry[]; exercise: WorkoutExercise; go: Props['go'] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [chartWidth, setChartWidth] = useState(600);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => setChartWidth(Math.max(260, Math.min(600, entry.contentRect.width))));
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);
  const ordered = [...entries].reverse();
  const [selectedId, setSelectedId] = useState(entries[0].session.id);
  const selected = entries.find((entry) => entry.session.id === selectedId) ?? entries[0];
  const values = ordered.map((entry) => progressMetric(entry, 'max'));
  const maximum = Math.max(1, ...values) * 1.1;
  const minTime = ordered[0].timestamp;
  const maxTime = ordered[ordered.length - 1].timestamp;
  const points = ordered.map((entry, index) => ({ x: maxTime === minTime ? chartWidth / 2 : 45 + (entry.timestamp - minTime) / (maxTime - minTime) * (chartWidth - 60), y: 195 - values[index] / maximum * 155, entry }));
  const selectedIndex = entries.indexOf(selected);
  const unit = exercise.loadMode === 'external' && exercise.measureType === 'reps' ? 'кг' : exercise.measureType === 'duration' ? 'сек.' : 'повт.';
  return <section className="progress-chart">
    <p className="progress-chart-unit">{exercise.measureType === 'duration' ? 'Максимум секунд в подходе' : exercise.loadMode === 'external' ? 'Максимальный вес, кг' : 'Максимум повторений в подходе'}</p>
    <svg ref={svgRef} viewBox={`0 0 ${chartWidth} 240`} role="group" aria-label="График результатов по датам">
      {[0, 0.5, 1].map((fraction) => <g key={fraction}><line x1="45" x2={chartWidth - 15} y1={195 - fraction * 155} y2={195 - fraction * 155} stroke="currentColor" opacity=".15" /><text x="38" y={199 - fraction * 155} textAnchor="end">{progressNumber(Math.round(maximum * fraction * 10) / 10)}</text></g>)}
      <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />
      {points.map(({ x, y, entry }, index) => <g key={entry.session.id} role="button" tabIndex={0} aria-label={`${dateLabel(entry)} ${timeLabel(entry)}, ${entry.session.workoutSnapshot.name}, ${progressNumber(values[index])} ${unit}`} aria-pressed={selected.session.id === entry.session.id} onClick={() => setSelectedId(entry.session.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(entry.session.id); } }}>
        <circle cx={x} cy={y} r="15" fill="transparent" /><circle cx={x} cy={y} r={selected.session.id === entry.session.id ? 7 : 4} fill="currentColor" />
      </g>)}
      <text x="45" y="225">{dateLabel(ordered[0])}</text>{ordered.length > 1 && <text x={chartWidth - 15} y="225" textAnchor="end">{dateLabel(ordered[ordered.length - 1])}</text>}
    </svg>
    {entries.length === 1 && <p>Для динамики нужно ещё одно занятие.</p>}
    <div className="progress-selected">
      <div className="progress-selection-heading">
        <button type="button" className="wide-secondary" aria-label="Предыдущее занятие" disabled={selectedIndex === entries.length - 1} onClick={() => setSelectedId(entries[selectedIndex + 1].session.id)}><Icon name="chevron-left" /></button>
        <h3>{entryDate(selected, entries)} · {progressNumber(progressMetric(selected, 'max'))} {unit}</h3>
        <button type="button" className="wide-secondary" aria-label="Следующее занятие" disabled={selectedIndex === 0} onClick={() => setSelectedId(entries[selectedIndex - 1].session.id)}><Icon name="chevron-right" /></button>
      </div>
      <ResultSets entry={selected} />
      <button className="wide-secondary" type="button" onClick={() => go(`/trainer/sessions/${selected.session.id}`)}>Открыть тренировку <Icon name="arrow-right" /></button>
    </div>

  </section>;
}
function progressGroups(data: DemoState, studentId: string) {
  return collectExerciseProgress(data.sessions, studentId)
    .map((group) => ({ ...group, entries: filterProgressPeriod(group.entries, 'all') }))
    .filter((group) => group.entries.length);
}

export function StudentExerciseProgress({ data, studentId, go }: Pick<Props, 'data' | 'studentId' | 'go'>) {
  const groups = progressGroups(data, studentId);
  return <section className="section-block student-exercise-progress" aria-label="Прогресс по упражнениям">
    <div className="section-heading"><h2>Прогресс по упражнениям</h2></div>
    {groups.length ? <div className="connected-list">
      {groups.map((group) => <button className="workout-row" type="button" key={group.key} onClick={() => go(progressHref(studentId, group.exercise))}>
        <span><strong>{group.exercise.name}</strong>
          {groups.filter((item) => item.exercise.exerciseId === group.exercise.exerciseId).length > 1 && <small>{modeLabel(group.exercise)}</small>}
          <small className="progress-last-date">Последнее выполнение · {dateLabel(group.entries[0])}</small>
          <ResultSets entry={group.entries[0]} compact />
        </span><i><Icon name="chevron-right" /></i>
      </button>)}
    </div> : <p className="progress-muted">Здесь появятся результаты выполненных упражнений.</p>}
  </section>;
}

export default function ExerciseProgressView({ data, studentId, exerciseId, search, go, back }: Props) {
  const params = new URLSearchParams(search);
  const student = data.students.find((item) => item.id === studentId);
  const groups = progressGroups(data, studentId);
  const group = groups.find((item) => item.exercise.exerciseId === exerciseId
    && (!params.has('loadMode') || item.exercise.loadMode === params.get('loadMode'))
    && (!params.has('measureType') || item.exercise.measureType === params.get('measureType')));
  return <main className="content-page narrow-page progress-page">
    <PageHeader eyebrow={student?.name ?? 'Ученик не найден'} title={group?.exercise.name.toUpperCase() ?? 'НЕТ РЕЗУЛЬТАТОВ'} onBack={() => back(`/trainer/clients/${studentId}`)} />
    {!student || !group ? <div className="empty-state"><p>Результаты не найдены.</p><button className="wide-secondary" type="button" onClick={() => go(student ? `/trainer/clients/${studentId}` : '/trainer/clients')}>Вернуться к {student ? 'ученику' : 'ученикам'}</button></div> : <>
      <p className="progress-muted progress-period">Всё время · {sessionCount(group.entries.length)}</p>
      <ProgressChart key={group.key} entries={group.entries} exercise={group.exercise} go={go} />
    </>}
  </main>;
}
