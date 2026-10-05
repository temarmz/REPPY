import { useState } from 'react';
import { dateKey, findAssignmentWorkout, findSessionWorkout, type DemoState, type Student, type Workout } from './reppy-data';
import Icon from './ui-icon';
import EmptyState from './empty-state';
import MonthDatePicker from './month-date-picker';
import ModalFrame from './modal-frame';
import Avatar from './avatar';
import { go } from './navigation';
import { moodLabel } from './mood';
import { assignmentSortValue, assignmentTimeLabel, formatScheduleDay, isScheduleDate } from './schedule-display';

function exercisePreview(workout?: Workout) {
  if (!workout?.exercises.length) return 'Упражнения не добавлены';
  const preview = workout.exercises.slice(0, 3).map((exercise) => exercise.name).join(' · ');
  return workout.exercises.length > 3 ? `${preview} · …` : preview;
}

export default function WorkoutCalendar({ data, area }: { data: DemoState; area: 'trainer' | 'student' }) {
  const today = new Date();
  const [selectedDay, setSelectedDay] = useState(dateKey(today));
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
    <main className="content-page calendar-page">
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

      <section className="calendar-agenda">
        <div className="section-heading">
          <h2>{selectedTitle}</h2>
          {area === 'trainer' && isScheduleDate(selectedDay) && <button className="schedule-add-button" type="button" aria-label={`Назначить тренировку на ${selectedTitle}`} onClick={() => setAssignDate(selectedDay)}><Icon name="plus" /></button>}
        </div>
        {selectedAssignments.length ? <div className="agenda-list">{selectedAssignments.map((assignment) => {
          const student = data.students.find((item) => item.id === assignment.studentId);
          const session = data.sessions.find((item) => item.assignmentId === assignment.id && item.completedAt);
          const workout = session ? findSessionWorkout(data, session) : findAssignmentWorkout(data, assignment);
          const target = area === 'trainer'
            ? session ? `/trainer/sessions/${session.id}` : `/trainer/assignments/${assignment.id}`
            : session ? `/student/history/${session.id}` : `/student/assignments/${assignment.id}`;
          return (
            <button key={assignment.id} type="button" onClick={() => go(target)}>
              <span className={`agenda-status ${assignment.status}`}><Icon name={assignment.status === 'completed' ? 'check' : 'workout'} /></span>
              <div><strong>{area === 'trainer' ? student?.name : workout?.name}</strong><small>{assignmentTimeLabel(assignment)} · {area === 'trainer' ? workout?.name : exercisePreview(workout)}</small>{session?.comment && <p>«{session.comment}»</p>}</div>
              <span className="agenda-tail">{assignment.status === 'completed' && <b>{session?.mood ? moodLabel(session.mood) : 'Готово'}</b>}<Icon name="chevron-right" /></span>
            </button>
          );
        })}</div> : <EmptyState icon="calendar" title="Свободный день" text={area === 'trainer' ? 'У команды нет тренировок в этот день.' : 'На этот день тренировка не запланирована.'} />}
      </section>
      {assignDate && <ScheduleStudentPicker
        date={assignDate}
        students={data.students}
        onClose={() => setAssignDate(null)}
        onSelect={(student) => {
          setAssignDate(null);
          go(`/trainer/schedule/${assignDate}/${student.id}`);
        }}
      />}
    </main>
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
      {students.length ? <div className="schedule-student-list">{students.map((student) => (
        <button key={student.id} type="button" disabled={student.status === 'invited'} onClick={() => onSelect(student)}>
          <Avatar student={student} />
          <span><strong>{student.name}</strong><small>{student.status === 'invited' ? 'Сначала ученик должен принять приглашение' : 'Выбрать тренировки'}</small></span>
          <Icon name="chevron-right" />
        </button>
      ))}</div> : <EmptyState icon="plus" title="Сначала добавь ученика" text="Назначить тренировку пока некому." action="Пригласить" onAction={() => go('/trainer/clients/invite')} />}
    </ModalFrame>
  );
}
