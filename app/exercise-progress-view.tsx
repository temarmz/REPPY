import { useEffect, useRef, useState } from 'react';
import type { DemoState, WorkoutExercise } from './reppy-data';
import { collectExerciseProgress, filterProgressPeriod, progressHref, progressMetric, progressNumber, progressSetLabel, type ProgressEntry, type ProgressPeriod } from './exercise-progress';
import Icon from './ui-icon';

type Props = { data: DemoState; studentId: string; exerciseId?: string; search: string; go: (path: string) => void; back: (fallback: string) => void };
const dateLabel = (entry: ProgressEntry) => new Date(entry.timestamp).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
const timeLabel = (entry: ProgressEntry) => new Date(entry.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const modeLabel = (exercise: WorkoutExercise) => `${exercise.equipment ?? ''} · ${exercise.loadMode === 'bodyweight' ? 'Свой вес' : 'Внешний вес'} · ${exercise.measureType === 'duration' ? 'Время' : 'Повторения'}`;
const moods = { great: 'Отлично', good: 'Хорошо', tired: 'Устал', hard: 'Было непросто' };
function ResultSets({ entry, compact = false }: { entry: ProgressEntry; compact?: boolean }) {
  let shown = 0;
  const count = entry.blocks.reduce((sum, block) => sum + block.sets.length, 0);
  return <div className="progress-sets">{entry.blocks.map((block) => <div key={block.exercise.id}>
    {entry.blocks.length > 1 && <small>{block.exercise.name} · блок {entry.blocks.indexOf(block) + 1}</small>}
    {block.sets.map((set) => {
      shown++;
      if (compact && shown > 3) return null;
      return <span className={`progress-set ${set.valid ? '' : 'progress-muted'}`} key={set.number}><small>{set.number}.</small> {set.valid ? progressSetLabel(block.exercise, set.result!) : set.result?.completed ? 'Некорректные данные' : 'Не выполнен'}</span>;
    })}
  </div>)}{compact && count > 3 && <small>ещё {count - 3}</small>}</div>;
}
function EntryDetails({ entry, go }: { entry: ProgressEntry; go: Props['go'] }) {
  return <div className="progress-entry-details">
    {entry.blocks.map((block) => <div key={block.exercise.id}><strong>{block.exercise.name}</strong>{block.sets.map((set, index) => {
      const plan = block.exercise.plannedSets[index];
      return <p key={set.number}><span>Подход {set.number}</span><span>План: {progressSetLabel(block.exercise, { actualReps: plan.targetReps, actualWeight: plan.targetWeight })}</span><span>Факт: {set.valid ? progressSetLabel(block.exercise, set.result!) : set.result?.completed ? 'Некорректные данные' : 'Не выполнен'}</span></p>;
    })}{block.exercise.coachNote && <p>Заметка тренера: {block.exercise.coachNote}</p>}</div>)}
    {entry.session.mood && <p>Самочувствие: {moods[entry.session.mood]}</p>}
    {entry.session.comment && <p>Комментарий к тренировке: {entry.session.comment}</p>}
    <button className="wide-secondary" onClick={() => go(`/trainer/sessions/${entry.session.id}`)}>Открыть тренировку <Icon name="arrow-right" /></button>
  </div>;
}
function ProgressChart({ entries, exercise, metric, go }: { entries: ProgressEntry[]; exercise: WorkoutExercise; metric: 'max' | 'sum'; go: Props['go'] }) {
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
  const values = ordered.map((entry) => progressMetric(entry, metric));
  const maximum = Math.max(1, ...values) * 1.1;
  const minTime = ordered[0].timestamp;
  const maxTime = ordered[ordered.length - 1].timestamp;
  const points = ordered.map((entry, index) => ({ x: maxTime === minTime ? chartWidth / 2 : 45 + (entry.timestamp - minTime) / (maxTime - minTime) * (chartWidth - 60), y: 195 - values[index] / maximum * 155, entry }));
  const heaviestSet = selected.blocks.flatMap((block) => block.sets.filter((set) => set.valid).map((set) => ({ exercise: block.exercise, result: set.result! }))).sort((a, b) => b.result.actualWeight - a.result.actualWeight || b.result.actualReps - a.result.actualReps || a.result.setNumber - b.result.setNumber)[0];
  const unit = metric === 'max' && exercise.loadMode === 'external' && exercise.measureType === 'reps' ? 'кг' : exercise.measureType === 'duration' ? 'сек.' : 'повт.';
  return <section className="progress-chart">
    <p className="progress-muted">{unit} · Дата завершения занятия</p>
    <svg ref={svgRef} viewBox={`0 0 ${chartWidth} 240`} role="group" aria-label="График результатов по датам">
      {[0, 0.5, 1].map((fraction) => <g key={fraction}><line x1="45" x2={chartWidth - 15} y1={195 - fraction * 155} y2={195 - fraction * 155} stroke="currentColor" opacity=".15" /><text x="38" y={199 - fraction * 155} textAnchor="end">{progressNumber(Math.round(maximum * fraction * 10) / 10)}</text></g>)}
      <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />
      {points.map(({ x, y, entry }, index) => <g key={entry.session.id} role="button" tabIndex={0} aria-label={`${dateLabel(entry)} ${timeLabel(entry)}, ${entry.session.workoutSnapshot.name}, ${progressNumber(values[index])} ${unit}`} aria-pressed={selected.session.id === entry.session.id} onClick={() => setSelectedId(entry.session.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(entry.session.id); } }}>
        <circle cx={x} cy={y} r="15" fill="transparent" /><circle cx={x} cy={y} r={selected.session.id === entry.session.id ? 7 : 4} fill="currentColor" />
      </g>)}
      <text x="45" y="225">{dateLabel(ordered[0])}</text>{ordered.length > 1 && <text x={chartWidth - 15} y="225" textAnchor="end">{dateLabel(ordered[ordered.length - 1])}</text>}
    </svg>
    {entries.length === 1 && <p>Для динамики нужно ещё одно занятие.</p>}
    <label className="progress-point-picker">Занятие<select value={selected.session.id} onChange={(event) => setSelectedId(event.target.value)}>{entries.map((entry) => <option key={entry.session.id} value={entry.session.id}>{dateLabel(entry)} {timeLabel(entry)} · {entry.session.workoutSnapshot.name}</option>)}</select></label>
    <div className="progress-selected"><h3>{dateLabel(selected)} · {progressNumber(progressMetric(selected, metric))} {unit}</h3><p>{timeLabel(selected)} · {selected.session.workoutSnapshot.name}</p>{unit === 'кг' && heaviestSet && <p>Подход с максимальным весом: {progressSetLabel(heaviestSet.exercise, heaviestSet.result)}</p>}<ResultSets entry={selected} /><EntryDetails entry={selected} go={go} /></div>
  </section>;
}
export default function ExerciseProgressView({ data, studentId, exerciseId, search, go, back }: Props) {
  const [limit, setLimit] = useState(20);
  const params = new URLSearchParams(search);
  const period: ProgressPeriod = params.get('period') === 'all' ? 'all' : params.get('period') === '30' ? '30' : '90';
  const query = params.get('q') ?? '';
  const view = params.get('view') === 'chart' ? 'chart' : 'table';
  const metric = params.get('metric') === 'sum' ? 'sum' : 'max';
  const student = data.students.find((item) => item.id === studentId);
  const groups = collectExerciseProgress(data.sessions, studentId);
  const matches = groups.filter((item) => item.exercise.exerciseId === exerciseId);
  const group = matches.find((item) => (!params.has('loadMode') || item.exercise.loadMode === params.get('loadMode')) && (!params.has('measureType') || item.exercise.measureType === params.get('measureType')));
  const update = (name: string, value: string) => {
    const next = new URLSearchParams(search);
    next.set(name, value);
    const href = progressHref(studentId, exerciseId ? group?.exercise : undefined, next.toString());
    window.history.replaceState(window.history.state, '', `#${href}`);
    window.dispatchEvent(new Event('reppy:navigate'));
  };
  const entries = group ? filterProgressPeriod(group.entries, period) : [];
  const filtered = groups.map((item) => ({ ...item, entries: filterProgressPeriod(item.entries, period) })).filter((item) => item.entries.length);
  const found = filtered.filter((item) => item.exercise.name.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')));
  return <main className="content-page progress-page">
    <header className="progress-header"><button className="progress-back" aria-label="Назад" onClick={() => back(exerciseId ? progressHref(studentId, undefined, search) : `/trainer/clients/${studentId}`)}><Icon name="chevron-left" /></button><div><p className="eyebrow">{student?.name ?? 'Ученик не найден'}</p><h1>{exerciseId ? group?.exercise.name ?? 'Нет данных об упражнении' : 'Прогресс по упражнениям'}</h1>{group && <p className="progress-muted">{modeLabel(group.exercise)}</p>}</div></header>
    {!student || (exerciseId && !group) ? <div className="progress-empty"><p>Результаты не найдены.</p><button className="wide-secondary" onClick={() => go(student ? progressHref(studentId) : '/trainer/clients')}>Вернуться к {student ? 'упражнениям' : 'ученикам'}</button></div> : <>
      <div className="progress-toolbar"><div className="progress-segment" aria-label="Период">{(['30', '90', 'all'] as const).map((value) => <button key={value} aria-pressed={period === value} onClick={() => update('period', value)}>{value === 'all' ? 'Всё время' : `${value} дней`}</button>)}</div>{!exerciseId && <label className="progress-search"><span>Поиск упражнения</span><input type="search" value={query} placeholder="Название упражнения" onChange={(event) => update('q', event.target.value)} /></label>}</div>
      {(!exerciseId && !found.length) || (exerciseId && !entries.length) ? <div className="progress-empty"><Icon name="history" /><h2>{!groups.length ? 'Ещё нет результатов' : !filtered.length || exerciseId ? 'За этот период нет результатов' : 'Упражнения не найдены'}</h2><p>{!groups.length ? 'Здесь появится прогресс по упражнениям после первой завершённой тренировки.' : 'Измените период или сбросьте поиск.'}</p>{groups.length > 0 && <button className="wide-secondary" onClick={() => !filtered.length || exerciseId ? update('period', 'all') : update('q', '')}>{!filtered.length || exerciseId ? 'Показать всё время' : 'Сбросить поиск'}</button>}</div> : !exerciseId ? <div className="progress-overview"><div className="progress-overview-head"><span>Упражнение</span><span>Последний результат</span><span>Занятий</span></div>{found.map((item) => <button className="progress-overview-row" key={item.key} onClick={() => go(progressHref(studentId, item.exercise, search))}><span><strong>{item.exercise.name}</strong><small>{modeLabel(item.exercise)}</small><small>{dateLabel(item.entries[0])}</small></span><ResultSets entry={item.entries[0]} compact /><span className="progress-count">{item.entries.length}<Icon name="chevron-right" /></span></button>)}</div> : group && <>
        <section className="progress-latest"><p className="eyebrow">Последний результат за период</p><h2>{dateLabel(entries[0])}</h2><ResultSets entry={entries[0]} /><p className="progress-muted">Занятий за период: {entries.length}</p></section>
        <div className="progress-segment progress-view-toggle"><button aria-pressed={view === 'table'} onClick={() => update('view', 'table')}>Таблица</button><button aria-pressed={view === 'chart'} onClick={() => update('view', 'chart')}>График</button></div>
        {view === 'chart' ? <><label className="progress-metric">Показатель<select value={metric} onChange={(event) => update('metric', event.target.value)}><option value="max">{group.exercise.measureType === 'duration' ? 'Максимальная длительность подхода' : group.exercise.loadMode === 'external' ? 'Максимальный вес подхода' : 'Максимум повторений в подходе'}</option><option value="sum">{group.exercise.measureType === 'duration' ? 'Сумма времени' : 'Сумма повторений'}</option></select></label><ProgressChart entries={entries} exercise={group.exercise} metric={metric} go={go} /></> : <section className="progress-history" aria-label="История подходов"><div className="progress-history-head"><span>Дата / тренировка</span><span>Подходы</span><span>Выполнено</span></div>{entries.slice(0, limit).map((entry) => <article className="progress-history-entry" key={entry.session.id}><div className="progress-history-row"><div><strong>{dateLabel(entry)}</strong><small>{timeLabel(entry)} · {entry.session.workoutSnapshot.name}</small></div><ResultSets entry={entry} /><span>{entry.completed} из {entry.total}</span></div><details><summary>План, факт и комментарии</summary><EntryDetails entry={entry} go={go} /></details><button className="progress-session-link" onClick={() => go(`/trainer/sessions/${entry.session.id}`)}>Открыть тренировку <Icon name="arrow-right" /></button></article>)}{limit < entries.length && <button className="wide-secondary" onClick={() => setLimit(limit + 20)}>Показать ещё</button>}</section>}
      </>}
    </>}
  </main>;
}
