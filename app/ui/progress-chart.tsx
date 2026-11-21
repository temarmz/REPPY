import { Box, Small, Inline, Section, Paragraph, Svg, SvgGroup, SvgLine, SvgText, SvgPolyline, SvgCircle, Subheading } from './elements';
import { useLayoutEffect, useRef, useState } from 'react';
import type { WorkoutExercise } from '../reppy-data';
import { bestProgressSet, progressMetric, progressNumber, progressSetLabel, type ProgressEntry } from '../exercise-progress';
import Icon from './icon';
import { repetitionWord } from '../workout-display';
import { ActionButton, Button } from './controls';

const dateLabel = (entry: ProgressEntry) => new Date(entry.timestamp).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
const timeLabel = (entry: ProgressEntry) => new Date(entry.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const entryDate = (entry: ProgressEntry) => `${dateLabel(entry)} · ${timeLabel(entry)}`;
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
  </Box>;
}
export default function ProgressChart({ entries, exercise, go, sessionHref = (sessionId) => `/trainer/sessions/${sessionId}` }: { entries: ProgressEntry[]; exercise: WorkoutExercise; go: (path: string) => void; sessionHref?: (sessionId: string) => string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [chartWidth, setChartWidth] = useState(600);
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const updateWidth = (width: number) => setChartWidth(Math.max(260, Math.min(600, width)));
    updateWidth(svg.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => updateWidth(entry.contentRect.width));
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);
  const chronological = [...entries].reverse();
  const monthly = entries.length > 60 || chronological.at(-1)!.timestamp - chronological[0].timestamp > 180 * 86400000;
  const months = new Map<string, ProgressEntry>();
  if (monthly) for (const entry of chronological) {
    const date = new Date(entry.timestamp);
    months.set(`${date.getFullYear()}-${date.getMonth()}`, entry);
  }
  const ordered = monthly ? [...months.values()] : chronological;
  const visibleEntries = [...ordered].reverse();
  const showReps = exercise.loadMode === 'external' && exercise.measureType === 'reps';
  const [selectedId, setSelectedId] = useState(entries[0].session.id);
  const selected = visibleEntries.find((entry) => entry.session.id === selectedId) ?? visibleEntries[0];
  const selectedIndex = visibleEntries.indexOf(selected);
  const unit = showReps ? 'кг' : exercise.measureType === 'duration' ? 'сек.' : 'Повторы';
  const minTime = ordered[0].timestamp;
  const maxTime = ordered[ordered.length - 1].timestamp;
  const left = 45;
  const right = chartWidth - 16;
  const plot = (label: string, values: number[], secondary = false) => {
    const bottom = secondary ? 109 : 145;
    const top = 18;
    const maximum = Math.max(1, Math.ceil(Math.max(...values) * 1.1));
    const points = ordered.map((entry, index) => ({
      x: maxTime === minTime ? (left + right) / 2 : left + (entry.timestamp - minTime) / (maxTime - minTime) * (right - left),
      y: bottom - values[index] / maximum * (bottom - top),
      entry,
    }));
    return <Box>
      <Box className="progress-chart-legend"><Inline className={secondary ? 'sets' : 'metric'}>{label}</Inline></Box>
      <Svg ref={secondary ? undefined : svgRef} className={secondary ? 'progress-chart-secondary' : undefined}
        viewBox={`0 0 ${chartWidth} ${bottom + 36}`} role="group" aria-label={`График результатов · ${label}`}>
        {[0, 0.5, 1].map((fraction) => {
          const y = bottom - (bottom - top) * fraction;
          return <SvgGroup key={fraction}>
            <SvgLine x1={left} x2={right} y1={y} y2={y} stroke="currentColor" opacity=".15" />
            <SvgText x={left - 7} y={y + 4} textAnchor="end">{progressNumber(maximum * fraction)}</SvgText>
          </SvgGroup>;
        })}
        {points.filter(({ entry }) => entry.session.id === selected.session.id).map(({ x, entry }) =>
          <SvgLine key={entry.session.id} x1={x} x2={x} y1={top} y2={bottom} stroke="currentColor" opacity=".25" />)}
        <SvgPolyline points={points.map(({ x, y }) => `${x},${y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />
        {points.map(({ x, y, entry }, index) => <SvgGroup key={entry.session.id} role="button" tabIndex={0}
          aria-label={`${entryDate(entry)}, ${entry.session.workoutSnapshot.name}, ${progressNumber(values[index])} ${label === 'Повторы' ? repetitionWord(values[index]) : label}`}
          aria-pressed={selected.session.id === entry.session.id} onClick={() => setSelectedId(entry.session.id)}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(entry.session.id); } }}>
          <SvgCircle className="progress-point-hitarea" cx={x} cy={y} r="22" fill="transparent" />
          <SvgCircle cx={x} cy={y} r={selected.session.id === entry.session.id ? 7 : 4} fill="currentColor" />
        </SvgGroup>)}
        <SvgText x={left} y={bottom + 27}>{dateLabel(ordered[0])}</SvgText>
        {ordered.length > 1 && <SvgText x={right} y={bottom + 27} textAnchor="end">{dateLabel(ordered[ordered.length - 1])}</SvgText>}
      </Svg>
    </Box>;
  };

  return <Section className="progress-chart">
    {monthly && <Paragraph className="progress-chart-unit">По месяцам · последнее занятие месяца</Paragraph>}
    {plot(unit, ordered.map((entry) => progressMetric(entry, 'max')))}
    {showReps && plot('Повторы', ordered.map((entry) => bestProgressSet(entry)?.actualReps ?? 0), true)}
    {entries.length === 1 && <Paragraph>Для динамики нужно ещё одно занятие.</Paragraph>}
    <Box className="progress-selected">
      <Box className="progress-selection-heading">
        <Button type="button" className="wide-secondary" aria-label="Предыдущее занятие" disabled={selectedIndex === visibleEntries.length - 1} onClick={() => setSelectedId(visibleEntries[selectedIndex + 1].session.id)}><Icon name="chevron-left" /></Button>
        <Subheading>{monthly ? new Date(selected.timestamp).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : entryDate(selected)}</Subheading>
        <Button type="button" className="wide-secondary" aria-label="Следующее занятие" disabled={selectedIndex === 0} onClick={() => setSelectedId(visibleEntries[selectedIndex - 1].session.id)}><Icon name="chevron-right" /></Button>
      </Box>
      {monthly && <Small className="progress-selected-date">{entryDate(selected)}</Small>}
      <ResultSets entry={selected} />
      <ActionButton variant="secondary" onClick={() => go(sessionHref(selected.session.id))}>Открыть тренировку <Icon name="arrow-right" /></ActionButton>
    </Box>

  </Section>;
}
