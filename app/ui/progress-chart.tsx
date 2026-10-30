import { Box, Small, Inline, Section, Paragraph, Svg, SvgGroup, SvgLine, SvgText, SvgPolyline, SvgCircle, SvgRect, Subheading } from './elements';
import { useEffect, useRef, useState } from 'react';
import type { WorkoutExercise } from '../reppy-data';
import { progressMetric, progressNumber, progressSetLabel, type ProgressEntry } from '../exercise-progress';
import Icon from './icon';
import { ActionButton, Button } from './controls';

const dateLabel = (entry: ProgressEntry) => new Date(entry.timestamp).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
const timeLabel = (entry: ProgressEntry) => new Date(entry.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const entryDate = (entry: ProgressEntry, entries: ProgressEntry[]) => `${dateLabel(entry)}${entries.filter((item) => dateLabel(item) === dateLabel(entry)).length > 1 ? ` · ${timeLabel(entry)}` : ''}`;
function ResultSets({ entry }: { entry: ProgressEntry }) {
  return <Box className="progress-sets">
    {entry.blocks.map((block, index) => {
      const visible = block.sets.filter((set) => set.valid);
      if (!visible.length) return null;

      return <Box key={block.exercise.id}>
        {entry.blocks.length > 1 && <Small>Блок {index + 1}</Small>}
        {visible.map((set) => <Inline className="progress-set" key={set.number}><Inline className="progress-set-number">{set.number}.</Inline> {progressSetLabel(block.exercise, set.result!)}</Inline>)}
      </Box>;
    })}
    {entry.completed < entry.total && <Small className="progress-muted">Выполнено {entry.completed} из {entry.total}</Small>}
  </Box>;
}
export default function ProgressChart({ entries, exercise, go, sessionHref = (sessionId) => `/trainer/sessions/${sessionId}` }: { entries: ProgressEntry[]; exercise: WorkoutExercise; go: (path: string) => void; sessionHref?: (sessionId: string) => string }) {
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
  const setValues = ordered.map((entry) => entry.completed);
  const setMaximum = Math.max(2, Math.ceil(Math.max(...setValues) / 2) * 2);
  const minTime = ordered[0].timestamp;
  const maxTime = ordered[ordered.length - 1].timestamp;
  const plotRight = chartWidth - 45;
  const points = ordered.map((entry, index) => ({
    x: maxTime === minTime ? chartWidth / 2 : 45 + (entry.timestamp - minTime) / (maxTime - minTime) * (plotRight - 45),
    y: 195 - values[index] / maximum * 155,
    setY: 195 - setValues[index] / setMaximum * 155,
    entry,
  }));
  const selectedIndex = entries.indexOf(selected);
  const unit = exercise.loadMode === 'external' && exercise.measureType === 'reps' ? 'кг' : exercise.measureType === 'duration' ? 'сек.' : 'повт.';
  return <Section className="progress-chart">
    <Paragraph className="progress-chart-unit">{exercise.measureType === 'duration' ? 'Максимум секунд и выполненные подходы' : exercise.loadMode === 'external' ? 'Максимальный вес и выполненные подходы' : 'Максимум повторений и выполненные подходы'}</Paragraph>
    <Box className="progress-chart-legend" aria-hidden="true"><Inline className="metric">{unit}</Inline><Inline className="sets">Подходы</Inline></Box>
    <Svg ref={svgRef} viewBox={`0 0 ${chartWidth} 240`} role="group" aria-label="График результатов по датам">
      {[0, 0.5, 1].map((fraction) => <SvgGroup key={fraction}><SvgLine x1="45" x2={plotRight} y1={195 - fraction * 155} y2={195 - fraction * 155} stroke="currentColor" opacity=".15" /><SvgText x="38" y={199 - fraction * 155} textAnchor="end">{progressNumber(Math.round(maximum * fraction * 10) / 10)}</SvgText><SvgText className="progress-set-axis" x={chartWidth - 38} y={199 - fraction * 155}>{Math.round(setMaximum * fraction)}</SvgText></SvgGroup>)}
      <SvgPolyline className="progress-metric-line" points={points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />
      <SvgPolyline className="progress-sets-line" points={points.map((point) => `${point.x},${point.setY}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />
      {points.map(({ x, y, setY, entry }, index) => <SvgGroup key={entry.session.id} role="button" tabIndex={0} aria-label={`${dateLabel(entry)} ${timeLabel(entry)}, ${entry.session.workoutSnapshot.name}, ${progressNumber(values[index])} ${unit}, подходов: ${setValues[index]}`} aria-pressed={selected.session.id === entry.session.id} onClick={() => setSelectedId(entry.session.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(entry.session.id); } }}>
        <SvgCircle className="progress-point-hitarea" cx={x} cy={(y + setY) / 2} r="22" fill="transparent" /><SvgCircle className="progress-metric-point" cx={x} cy={y} r={selected.session.id === entry.session.id ? 7 : 4} fill="currentColor" /><SvgRect className="progress-sets-point" x={x - (selected.session.id === entry.session.id ? 6 : 4)} y={setY - (selected.session.id === entry.session.id ? 6 : 4)} width={selected.session.id === entry.session.id ? 12 : 8} height={selected.session.id === entry.session.id ? 12 : 8} rx="2" fill="currentColor" />
      </SvgGroup>)}
      <SvgText x="45" y="225">{dateLabel(ordered[0])}</SvgText>{ordered.length > 1 && <SvgText x={chartWidth - 15} y="225" textAnchor="end">{dateLabel(ordered[ordered.length - 1])}</SvgText>}
    </Svg>
    {entries.length === 1 && <Paragraph>Для динамики нужно ещё одно занятие.</Paragraph>}
    <Box className="progress-selected">
      <Box className="progress-selection-heading">
        <Button type="button" className="wide-secondary" aria-label="Предыдущее занятие" disabled={selectedIndex === entries.length - 1} onClick={() => setSelectedId(entries[selectedIndex + 1].session.id)}><Icon name="chevron-left" /></Button>
        <Subheading>{entryDate(selected, entries)} · {progressNumber(progressMetric(selected, 'max'))} {unit} · {selected.completed} подх.</Subheading>
        <Button type="button" className="wide-secondary" aria-label="Следующее занятие" disabled={selectedIndex === 0} onClick={() => setSelectedId(entries[selectedIndex - 1].session.id)}><Icon name="chevron-right" /></Button>
      </Box>
      <ResultSets entry={selected} />
      <ActionButton variant="secondary" onClick={() => go(sessionHref(selected.session.id))}>Открыть тренировку <Icon name="arrow-right" /></ActionButton>
    </Box>

  </Section>;
}
