import { Badge } from './ui/patterns';
import { SectionHeading } from './ui/patterns';
import { Page, Section, Box, Inline, Strong, Small, Paragraph, Bold } from './ui/elements';
import { Button } from './ui/controls';
import { useState } from 'react';
import { dateKey, findAssignmentWorkout, findSessionWorkout, type DemoState, type Student, type Workout } from './reppy-data';
import Icon from './ui/icon';
import EmptyState from './ui/empty-state';
import MonthDatePicker from './ui/month-date-picker';
import ModalFrame from './ui/modal-frame';
import Avatar from './ui/avatar';
import { go } from './navigation';
import { moodLabel } from './mood';
import { assignmentSortValue, assignmentTimeLabel, formatScheduleDay, isScheduleDate } from './schedule-display';

function calendarStateKey(area: 'trainer' | 'student') {
  return `reppy-ui:calendar-day:${area}`;
}

function loadSelectedDay(area: 'trainer' | 'student', fallback: string) {
  try {
    return window.sessionStorage.getItem(calendarStateKey(area)) || fallback;
  } catch {
    return fallback;
  }
}

function exercisePreview(workout?: Workout) {
  if (!workout?.exercises.length) return 'Упражнения не добавлены';
  const preview = workout.exercises.slice(0, 3).map((exercise) => exercise.name).join(' · ');
  return workout.exercises.length > 3 ? `${preview} · …` : preview;
}

export default function WorkoutCalendar({ data, area }: { data: DemoState; area: 'trainer' | 'student' }) {
  const today = new Date();
  const [selectedDay, setSelectedDayState] = useState(() => loadSelectedDay(area, dateKey(today)));
  const setSelectedDay = (day: string) => {
    setSelectedDayState(day);
    try { window.sessionStorage.setItem(calendarStateKey(area), day); } catch { /* best effort */ }
  };
  const [assignDate, setAssignDate] = useState<string | null>(null);
  const assignments = data.assignments
    .filter((item) => area === 'trainer' || item.studentId === data.activeStudentId)
    .sort((a, b) => assignmentSortValue(a).localeCompare(assignmentSortValue(b)));
  const assignmentCounts = assignments.reduce((counts, assignment) => {
    counts.set(assignment.scheduledFor, (counts.get(assignment.scheduledFor) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const selectedAssignments = assignments.filter((item) => item.scheduledFor === selectedDay);
  const selectedTitle = formatScheduleDay(selectedDay);

  return (
    <Page className="content-page calendar-page">
      <MonthDatePicker
        value={selectedDay}
        onChange={setSelectedDay}
        markedDates={assignmentCounts}
        selectFirstDayOnMonthChange
        dateAriaLabel={(day, count) => {
          const fullDate = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(day);
          return `${fullDate}. ${count ? `Тренировок: ${count}` : 'Тренировок нет'}`;
        }}
      />

      <Section className="calendar-agenda">
        <SectionHeading title={<>{selectedTitle}</>} >
          {area === 'trainer' && isScheduleDate(selectedDay) && <Button className="schedule-add-button" type="button" aria-label={`Назначить тренировку на ${selectedTitle}`} onClick={() => setAssignDate(selectedDay)}><Icon name="plus" /></Button>}
        </SectionHeading>
        {selectedAssignments.length ? <Box className="agenda-list">{selectedAssignments.map((assignment) => {
          const student = data.students.find((item) => item.id === assignment.studentId);
          const session = data.sessions.find((item) => item.assignmentId === assignment.id && item.completedAt);
          const workout = session ? findSessionWorkout(data, session) : findAssignmentWorkout(data, assignment);
          const target = area === 'trainer'
            ? session ? `/trainer/sessions/${session.id}` : `/trainer/assignments/${assignment.id}`
            : session ? `/student/calendar/sessions/${session.id}` : `/student/calendar/assignments/${assignment.id}`;
          return (
            <Button key={assignment.id} type="button" onClick={() => go(target)}>
              <Badge className={`agenda-status ${assignment.status}`}><Icon name={assignment.status === 'completed' ? 'check' : 'workout'} /></Badge>
              <Box><Strong>{area === 'trainer' ? student?.name : workout?.name}</Strong><Small>{assignmentTimeLabel(assignment)} · {area === 'trainer' ? workout?.name : exercisePreview(workout)}</Small>{session?.comment && <Paragraph>«{session.comment}»</Paragraph>}</Box>
              <Inline className="agenda-tail">{assignment.status === 'completed' && <Bold>{session?.mood ? moodLabel(session.mood) : 'Готово'}</Bold>}<Icon name="chevron-right" /></Inline>
            </Button>
          );
        })}</Box> : <EmptyState icon="calendar" title="Свободный день" text={area === 'trainer' ? 'У команды нет тренировок в этот день.' : 'На этот день тренировка не запланирована.'} />}
      </Section>
      {assignDate && <ScheduleStudentPicker
        date={assignDate}
        students={data.students}
        onClose={() => setAssignDate(null)}
        onSelect={(student) => {
          setAssignDate(null);
          go(`/trainer/schedule/${assignDate}/${student.id}`);
        }}
      />}
    </Page>
  );
}


export function ScheduleStudentPicker({ date, students, onClose, onSelect }: { date: string; students: Student[]; onClose: () => void; onSelect: (student: Student) => void }) {
  return (
    <ModalFrame
      title="Выбери ученика"
      eyebrow={formatScheduleDay(date)}
      className="schedule-student-picker"
      ariaLabel={`Кого назначить на ${formatScheduleDay(date)}`}
      closeLabel="Закрыть выбор ученика"
      onClose={onClose}
    >
      {students.length ? <Box className="schedule-student-list">{students.map((student) => (
        <Button key={student.id} type="button" disabled={student.status === 'invited'} onClick={() => onSelect(student)}>
          <Avatar student={student} />
          <Inline><Strong>{student.name}</Strong><Small>{student.status === 'invited' ? 'Сначала ученик должен принять приглашение' : 'Выбрать тренировки'}</Small></Inline>
          <Icon name="chevron-right" />
        </Button>
      ))}</Box> : <EmptyState icon="plus" title="Сначала добавь ученика" text="Назначить тренировку пока некому." action="Пригласить" onAction={() => go('/trainer/clients/invite')} />}
    </ModalFrame>
  );
}
