import { ListRow, Badge } from './ui/patterns';
import { SectionHeading } from './ui/patterns';
import { Time, Inline, Strong, Small, Page, Section, Box, Heading, Header, Paragraph, Card, Bold, Italic } from './ui/elements';
import { Button, Switch } from './ui/controls';
import { useState } from 'react';
import {
  dateKey,
  findAssignmentWorkout,
  findSessionWorkout,
  type Assignment,
  type DemoState,
} from './reppy-data';
import Icon from './ui/icon';
import EmptyState from './ui/empty-state';
import Avatar from './ui/avatar';
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
    <ListRow className={`plan-session-row ${assignment.format === 'online' ? 'online' : ''}`} type="button" onClick={() => go(target)} aria-label={`${student?.name}, ${assignmentTimeLabel(assignment)}, ${workout?.name}${completed ? ', тренировка завершена' : ''}`}>
      <Time dateTime={assignmentDateTime(assignment)}>{assignmentTimeLabel(assignment)}</Time>
      <Avatar student={student} />
      <Inline><Strong>{student?.name}</Strong><Small>{workout?.name}</Small></Inline>
      <Inline className="plan-session-status">{completed && <Icon name="check" />}<Icon name="chevron-right" /></Inline>
    </ListRow>
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
    <Page className="content-page trainer-home-page">
      {pendingRequests.length > 0 && <Section className="reschedule-inbox">
        <SectionHeading title="Запросы на перенос" />
        <Box className="connected-list">{pendingRequests.map((assignment) => {
          const student = findStudent(data, assignment.studentId);
          const request = assignment.rescheduleRequest;
          return <ListRow className="reschedule-notification-row" key={assignment.id} type="button" onClick={() => go(`/trainer/assignments/${assignment.id}`)}><Inline><Icon name="calendar" /></Inline><Box><Strong>{student?.name}</Strong><Small>{request ? `${formatScheduleDay(request.scheduledFor)} · ${request.scheduledTime}` : ''}</Small></Box><Icon name="chevron-right" /></ListRow>;
        })}</Box>
      </Section>}

      <Section className="today-schedule">
        <Header>
          <Box><Heading>СЕГОДНЯ</Heading><Paragraph>{formatScheduleDay(todayKey)}</Paragraph></Box>
          {todayAssignments.length > 0 && <Button className="schedule-add-button on-light" type="button" aria-label="Назначить тренировку на сегодня" onClick={() => startAssignment(todayKey)}><Icon name="plus" /></Button>}
        </Header>
        {todayAssignments.length ? (
          <Box className="today-session-list">{todayAssignments.map((assignment) => <TrainerPlanRow key={assignment.id} data={data} assignment={assignment} />)}</Box>
        ) : <Button className="today-empty" type="button" onClick={() => startAssignment(todayKey)}><Icon name="plus" /><Strong>Тренировок нет</Strong><Small>Назначить ученика</Small></Button>}
      </Section>

      <Section className="future-schedule">
        <Box className="future-schedule-heading">
          <Box><Heading>Дальше</Heading><Paragraph>Ближайшие две недели</Paragraph></Box>
          <Switch checked={showAllDays} onCheckedChange={toggleAllDays}>Все дни</Switch>
        </Box>
        {visibleFutureDays.length ? (
          <Box className="schedule-days-list">{visibleFutureDays.map((day) => {
            const parts = planDayParts(day.date);
            if (!day.assignments.length) return (
              <Card className="plan-day-card empty-day" key={day.date}>
                <Button className="empty-day-action" type="button" aria-label={`Назначить ученика на ${formatScheduleDay(day.date)}`} onClick={() => startAssignment(day.date)}>
                  <Time className="plan-day-date" dateTime={day.date}><Strong>{parts.day}</Strong><Inline><Bold>{parts.month}</Bold><Small>{parts.weekday}</Small></Inline></Time>
                  <Inline className="empty-day-plus"><Icon name="plus" /></Inline>
                </Button>
              </Card>
            );
            return <Card className="plan-day-card" key={day.date}>
              <Header>
                <Time className="plan-day-date" dateTime={day.date}><Strong>{parts.day}</Strong><Inline><Bold>{parts.month}</Bold><Small>{parts.weekday}</Small></Inline></Time>
                <Button className="schedule-add-button" type="button" aria-label={`Назначить тренировку на ${formatScheduleDay(day.date)}`} onClick={() => startAssignment(day.date)}><Icon name="plus" /></Button>
              </Header>
              <Box className="day-session-list">{day.assignments.map((assignment) => <TrainerPlanRow key={assignment.id} data={data} assignment={assignment} />)}</Box>
            </Card>;
          })}</Box>
        ) : <EmptyState icon="calendar" title="Остальные дни свободны" text="На ближайшие две недели больше ничего не назначено." />}
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

export function ClientsList({ data }: { data: DemoState }) {
  return (
    <Page className="content-page">
      <Button className="list-primary-action" type="button" onClick={() => go('/trainer/clients/invite')}><Icon name="plus" /> Пригласить ученика</Button>
      <Section className="client-grid">
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
            <Button className="client-card" key={student.id} type="button" onClick={() => go(`/trainer/clients/${student.id}`)}>
              <Avatar student={student} />
              <Inline><Strong>{student.name}</Strong><Small>{status}</Small><Badge as="b" className={`client-subscription ${subscriptionTone(balance, subscriptionEntries.length > 0)}`}>{subscriptionBalanceLabel(balance, subscriptionEntries.length > 0)}</Badge></Inline>
              <Italic><Icon name="chevron-right" /></Italic>
            </Button>
          );
        })}
      </Section>
    </Page>
  );
}
