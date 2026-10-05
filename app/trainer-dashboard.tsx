import { useState } from 'react';
import {
  dateKey,
  findAssignmentWorkout,
  findSessionWorkout,
  type Assignment,
  type DemoState,
} from './reppy-data';
import Icon from './ui-icon';
import EmptyState from './empty-state';
import Avatar from './avatar';
import { go } from './navigation';
import { ScheduleStudentPicker } from './workout-calendar';
import {
  assignmentDateTime,
  assignmentScheduleLabel,
  assignmentSortValue,
  assignmentTimeLabel,
  dateAfter,
  formatScheduleDay,
  planDayParts,
} from './schedule-display';
import { subscriptionBalance, subscriptionEntriesFor } from './subscription-ledger';
import { subscriptionBalanceLabel, subscriptionTone } from './workout-display';
import { loadAllDaysPreference, saveAllDaysPreference } from './ui-persistence';

function findStudent(data: DemoState, id: string) {
  return data.students.find((student) => student.id === id);
}

function TrainerPlanRow({ data, assignment }: { data: DemoState; assignment: Assignment }) {
  const student = findStudent(data, assignment.studentId);
  const session = data.sessions.find((item) => item.assignmentId === assignment.id && item.completedAt);
  const workout = session ? findSessionWorkout(data, session) : findAssignmentWorkout(data, assignment);
  const completed = assignment.status === 'completed' || Boolean(session);
  const target = completed
    ? session ? `/trainer/sessions/${session.id}` : `/trainer/clients/${assignment.studentId}`
    : `/trainer/assignments/${assignment.id}`;

  return (
    <button className={`plan-session-row ${assignment.format === 'online' ? 'online' : ''}`} type="button" onClick={() => go(target)} aria-label={`${student?.name}, ${assignmentTimeLabel(assignment)}, ${workout?.name}${completed ? ', тренировка завершена' : ''}`}>
      <time dateTime={assignmentDateTime(assignment)}>{assignmentTimeLabel(assignment)}</time>
      <Avatar student={student} />
      <span><strong>{student?.name}</strong><small>{workout?.name}</small></span>
      <span className="plan-session-status">{completed && <Icon name="check" />}<Icon name="chevron-right" /></span>
    </button>
  );
}

export function TrainerHome({ data }: { data: DemoState }) {
  const [showAllDays, setShowAllDays] = useState(loadAllDaysPreference);
  const [assignDate, setAssignDate] = useState<string | null>(null);
  const todayKey = dateKey();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 14);
  const horizonKey = dateKey(horizon);
  const upcoming = data.assignments
    .filter((item) => item.scheduledFor >= todayKey && item.scheduledFor <= horizonKey)
    .sort((a, b) => assignmentSortValue(a).localeCompare(assignmentSortValue(b)));
  const todayAssignments = upcoming.filter((item) => item.scheduledFor === todayKey);
  const futureAssignments = upcoming.filter((item) => item.scheduledFor !== todayKey);
  const pendingRequests = data.assignments.filter((item) => item.rescheduleRequest);
  const futureDays = Array.from({ length: 14 }, (_, index) => {
    const date = dateAfter(todayKey, index + 1);
    return { date, assignments: futureAssignments.filter((item) => item.scheduledFor === date) };
  });
  const visibleFutureDays = showAllDays ? futureDays : futureDays.filter((day) => day.assignments.length > 0);
  const startAssignment = (date: string) => setAssignDate(date);
  const toggleAllDays = () => setShowAllDays((current) => {
    const next = !current;
    saveAllDaysPreference(next);
    return next;
  });

  return (
    <main className="content-page trainer-home-page">
      {pendingRequests.length > 0 && <section className="reschedule-inbox">
        <div className="section-heading"><h2>Запросы на перенос</h2></div>
        <div className="connected-list">{pendingRequests.map((assignment) => {
          const student = findStudent(data, assignment.studentId);
          const request = assignment.rescheduleRequest;
          return <button className="reschedule-notification-row" key={assignment.id} type="button" onClick={() => go(`/trainer/assignments/${assignment.id}`)}><span><Icon name="calendar" /></span><div><strong>{student?.name}</strong><small>{request ? `${formatScheduleDay(request.scheduledFor)} · ${request.scheduledTime}` : ''}</small></div><Icon name="chevron-right" /></button>;
        })}</div>
      </section>}

      <section className="today-schedule">
        <header>
          <div><h2>СЕГОДНЯ</h2><p>{formatScheduleDay(todayKey)}</p></div>
          {todayAssignments.length > 0 && <button className="schedule-add-button on-light" type="button" aria-label="Назначить тренировку на сегодня" onClick={() => startAssignment(todayKey)}><Icon name="plus" /></button>}
        </header>
        {todayAssignments.length ? (
          <div className="today-session-list">{todayAssignments.map((assignment) => <TrainerPlanRow key={assignment.id} data={data} assignment={assignment} />)}</div>
        ) : <button className="today-empty" type="button" onClick={() => startAssignment(todayKey)}><Icon name="plus" /><strong>Тренировок нет</strong><small>Назначить ученика</small></button>}
      </section>

      <section className="future-schedule">
        <div className="future-schedule-heading">
          <div><h2>Дальше</h2><p>Ближайшие две недели</p></div>
          <button className={`schedule-view-toggle ${showAllDays ? 'active' : ''}`} type="button" role="switch" aria-checked={showAllDays} onClick={toggleAllDays}>
            <span className="schedule-view-icon" aria-hidden="true"><Icon name="calendar" /></span>
            <strong>Все дни</strong>
            <span className="toggle-track" aria-hidden="true"><i /></span>
          </button>
        </div>
        {visibleFutureDays.length ? (
          <div className="schedule-days-list">{visibleFutureDays.map((day) => {
            const parts = planDayParts(day.date);
            if (!day.assignments.length) return (
              <article className="plan-day-card empty-day" key={day.date}>
                <button className="empty-day-action" type="button" aria-label={`Назначить ученика на ${formatScheduleDay(day.date)}`} onClick={() => startAssignment(day.date)}>
                  <time className="plan-day-date" dateTime={day.date}><strong>{parts.day}</strong><span><b>{parts.month}</b><small>{parts.weekday}</small></span></time>
                  <span className="empty-day-plus"><Icon name="plus" /></span>
                </button>
              </article>
            );
            return <article className="plan-day-card" key={day.date}>
              <header>
                <time className="plan-day-date" dateTime={day.date}><strong>{parts.day}</strong><span><b>{parts.month}</b><small>{parts.weekday}</small></span></time>
                <button className="schedule-add-button" type="button" aria-label={`Назначить тренировку на ${formatScheduleDay(day.date)}`} onClick={() => startAssignment(day.date)}><Icon name="plus" /></button>
              </header>
              <div className="day-session-list">{day.assignments.map((assignment) => <TrainerPlanRow key={assignment.id} data={data} assignment={assignment} />)}</div>
            </article>;
          })}</div>
        ) : <EmptyState icon="calendar" title="Остальные дни свободны" text="На ближайшие две недели больше ничего не назначено." />}
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

export function ClientsList({ data }: { data: DemoState }) {
  return (
    <main className="content-page">
      <button className="list-primary-action" type="button" onClick={() => go('/trainer/clients/invite')}><Icon name="plus" /> Пригласить ученика</button>
      <section className="client-grid">
        {data.students.map((student) => {
          const subscriptionEntries = subscriptionEntriesFor(data.subscriptionEntries, student.id);
          const balance = subscriptionBalance(data.subscriptionEntries, student.id);
          const assigned = data.assignments
            .filter((item) => item.studentId === student.id && item.status === 'assigned')
            .sort((a, b) => assignmentSortValue(a).localeCompare(assignmentSortValue(b)))[0];
          const recent = [...data.sessions].reverse().find((item) => item.studentId === student.id && item.completedAt);
          const status = student.status === 'invited'
            ? 'Ожидает приглашения'
            : assigned
              ? `${assignmentScheduleLabel(assigned)} · ${findAssignmentWorkout(data, assigned)?.name}`
              : recent
                ? `Завершил · ${findSessionWorkout(data, recent)?.name}`
                : 'Нет назначений';
          return (
            <button className="client-card" key={student.id} type="button" onClick={() => go(`/trainer/clients/${student.id}`)}>
              <Avatar student={student} />
              <span><strong>{student.name}</strong><small>{status}</small><b className={`client-subscription ${subscriptionTone(balance, subscriptionEntries.length > 0)}`}>{subscriptionBalanceLabel(balance, subscriptionEntries.length > 0)}</b></span>
              <i><Icon name="chevron-right" /></i>
            </button>
          );
        })}
      </section>
    </main>
  );
}
