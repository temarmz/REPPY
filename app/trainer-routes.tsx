import { lazy, type ComponentType, type ReactNode } from 'react';
import {
  createWorkoutSession,
  dateKey,
  findAssignmentWorkout,
  findSessionWorkout,
  makeId,
  repeatAssignment,
  workoutFromSession,
  type Assignment,
  type DemoState,
  type Student,
} from './reppy-data';
import type { ReppyCommand } from './reppy-commands';
import ExerciseProgressView from './exercise-progress-view';
import {
  createSubscriptionPayment,
  recentSubscriptionPayments,
  subscriptionBalance,
  updateSubscriptionPayment,
} from './subscription-ledger';
import { go, goBack } from './navigation';
import NotFound from './not-found';
import SessionResult from './session-result';
import WorkoutCalendar from './workout-calendar';
import { isScheduleDate } from './schedule-display';
import { lessonWord } from './workout-display';
const ActiveWorkout = lazy(() => import('./active-workout'));
const TrainerHome = lazy(() => import('./trainer-dashboard').then((module) => ({ default: module.TrainerHome })));
const ClientsList = lazy(() => import('./trainer-dashboard').then((module) => ({ default: module.ClientsList })));
const DesignKitScreen = lazy(() => import('./trainer-design-kit'));
const SubscriptionHistory = lazy(() => import('./trainer-subscriptions').then((module) => ({ default: module.SubscriptionHistory })));
const SubscriptionPaymentForm = lazy(() => import('./trainer-subscriptions').then((module) => ({ default: module.SubscriptionPaymentForm })));
const InviteStudent = lazy(() => import('./trainer-client-screens').then((module) => ({ default: module.InviteStudent })));
const StudentWorkoutHistory = lazy(() => import('./trainer-client-screens').then((module) => ({ default: module.StudentWorkoutHistory })));
const AssignmentDetails = lazy(() => import('./trainer-workout-editor').then((module) => ({ default: module.AssignmentDetails })));
const AssignWorkoutToStudent = lazy(() => import('./trainer-workout-editor').then((module) => ({ default: module.AssignWorkoutToStudent })));
const EditAssignment = lazy(() => import('./trainer-workout-editor').then((module) => ({ default: module.EditAssignment })));
const NewAssignmentForStudent = lazy(() => import('./trainer-workout-editor').then((module) => ({ default: module.NewAssignmentForStudent })));
const RepeatAssignment = lazy(() => import('./trainer-workout-editor').then((module) => ({ default: module.RepeatAssignment })));

function findStudent(data: DemoState, id: string) {
  return data.students.find((student) => student.id === id);
}

function workoutForRepeat(data: DemoState, assignment: Assignment) {
  const completedSession = data.sessions.find((session) => session.assignmentId === assignment.id && session.completedAt);
  return completedSession ? workoutFromSession(completedSession) : findAssignmentWorkout(data, assignment);
}

export default function TrainerRoutes({ path, data, dispatch, showToast, createStudentInvitation, StudentProfileComponent }: {
  path: string;
  data: DemoState;
  dispatch: (command: ReppyCommand) => void;
  showToast: (message: string) => void;
  createStudentInvitation: ((name: string) => Promise<{ student: Student; token: string; expiresAt: string }>) | null;
  StudentProfileComponent: ComponentType<{ data: DemoState; studentId: string; onUpdate: (student: Student) => void; trainerView?: boolean }>;
}) {
  let content: ReactNode;
  const createCustomExercise = (definition: DemoState['customExercises'][number]) => {
    dispatch({ type: 'exercise-definition.create', definition });
    showToast(`Упражнение «${definition.name}» сохранено`);
  };
  const updateCustomExercise = (definition: DemoState['customExercises'][number]) => {
    dispatch({ type: 'exercise-definition.update', definition });
    showToast(`Упражнение «${definition.name}» обновлено`);
  };
    const [progressPath, progressSearch = ''] = path.split('?');
    const progressMatch = progressPath.match(/^\/trainer\/clients\/([^/]+)\/progress(?:\/([^/]+))?$/);
    const subscriptionPaymentMatch = path.match(/^\/trainer\/clients\/([^/]+)\/subscription\/payments\/([^/]+)$/);
    const subscriptionNewMatch = path.match(/^\/trainer\/clients\/([^/]+)\/subscription\/new$/);
    const subscriptionMatch = path.match(/^\/trainer\/clients\/([^/]+)\/subscription$/);
    const clientAssignCopyMatch = path.match(/^\/trainer\/clients\/([^/]+)\/assign\/copy\/([^/]+)$/);
    const clientAssignMatch = path.match(/^\/trainer\/clients\/([^/]+)\/assign(?:\/([^/]+))?$/);
    const clientMatch = path.match(/^\/trainer\/clients\/([^/]+)$/);
    const assignmentEditMatch = path.match(/^\/trainer\/assignments\/([^/]+)\/edit$/);
    const assignmentRepeatMatch = path.match(/^\/trainer\/assignments\/([^/]+)\/repeat$/);
    const assignmentMatch = path.match(/^\/trainer\/assignments\/([^/]+)$/);
    const trainerActiveMatch = path.match(/^\/trainer\/workout\/([^/]+)$/);
    const scheduleCopyMatch = path.match(/^\/trainer\/schedule\/(\d{4}-\d{2}-\d{2})\/([^/]+)\/copy\/([^/]+)$/);
    const scheduleNewMatch = path.match(/^\/trainer\/schedule\/(\d{4}-\d{2}-\d{2})\/([^/]+)\/new$/);
    const scheduleStudentMatch = path.match(/^\/trainer\/schedule\/(\d{4}-\d{2}-\d{2})\/([^/]+)$/);
    const sessionMatch = path.match(/^\/trainer\/sessions\/([^/]+)$/);

    if (path === '/trainer/design-kit') {
      content = <DesignKitScreen />;
    } else if (progressMatch?.[2]) {
      content = <ExerciseProgressView key={progressPath} data={data} studentId={progressMatch[1]} exerciseId={progressMatch[2]} search={progressSearch} go={go} back={goBack} />;
    } else if (path === '/trainer/calendar') {
      content = <WorkoutCalendar data={data} area="trainer" />;
    } else if (scheduleCopyMatch) {
      const [scheduledFor, studentId, sourceAssignmentId] = scheduleCopyMatch.slice(1);
      const student = findStudent(data, studentId);
      const sourceAssignment = data.assignments.find((item) => item.id === sourceAssignmentId && item.studentId === studentId);
      const sourceWorkout = sourceAssignment && workoutForRepeat(data, sourceAssignment);
      content = student?.status === 'active' && sourceAssignment && sourceWorkout && isScheduleDate(scheduledFor) ? (
        <AssignWorkoutToStudent
          student={student}
          workout={sourceWorkout}
          customExercises={data.customExercises}
          onCreateCustomExercise={createCustomExercise}
          onUpdateCustomExercise={updateCustomExercise}
          initialScheduledFor={scheduledFor}
          initialScheduledTime={sourceAssignment.scheduledTime}
          initialFormat={sourceAssignment.format}
          backPath={`/trainer/schedule/${scheduledFor}/${student.id}`}
          title="ПОВТОРИТЬ ТРЕНИРОВКУ"
          submitLabel="Назначить тренировку"
          submitIcon="plus"
          onAssign={(nextDate, scheduledTime, format, workoutSnapshot) => {
            const assignment = { ...repeatAssignment(sourceAssignment, workoutSnapshot, nextDate, scheduledTime), format };
            dispatch({ type: 'assignment.create', assignment });
            showToast(`Тренировка назначена: ${student.name}`);
            go('/trainer', true);
          }}
        />
      ) : <NotFound />;
    } else if (scheduleNewMatch) {
      const [scheduledFor, studentId] = scheduleNewMatch.slice(1);
      const student = findStudent(data, studentId);
      content = student?.status === 'active' && isScheduleDate(scheduledFor) ? (
        <NewAssignmentForStudent
          student={student}
          customExercises={data.customExercises}
          onCreateCustomExercise={createCustomExercise}
          onUpdateCustomExercise={updateCustomExercise}
          initialScheduledFor={scheduledFor}
          backPath={`/trainer/schedule/${scheduledFor}/${student.id}`}
          onAssign={(nextDate, scheduledTime, format, workoutSnapshot) => {
            const assignment: Assignment = {
              id: makeId('assignment'),
              studentId: student.id,
              assignedAt: new Date().toISOString(),
              scheduledFor: nextDate,
              scheduledTime,
              format,
              status: 'assigned',
              workoutSnapshot,
            };
            dispatch({ type: 'assignment.create', assignment });
            showToast(`Тренировка назначена: ${student.name}`);
            go('/trainer', true);
          }}
        />
      ) : <NotFound />;
    } else if (scheduleStudentMatch) {
      const [scheduledFor, studentId] = scheduleStudentMatch.slice(1);
      const student = findStudent(data, studentId);
      content = student?.status === 'active' && isScheduleDate(scheduledFor)
        ? <StudentWorkoutHistory data={data} student={student} scheduledFor={scheduledFor} backPath="/trainer" routeBase={`/trainer/schedule/${scheduledFor}/${student.id}`} />
        : <NotFound />;
    } else if (path === '/trainer/clients') {
      content = <ClientsList data={data} />;
    } else if (path === '/trainer/clients/invite') {
      content = (
        <InviteStudent
          onCreate={(student) => dispatch({ type: 'student.create', student })}
          onInvite={createStudentInvitation ?? undefined}
        />
      );
    } else if (subscriptionPaymentMatch) {
      const student = findStudent(data, subscriptionPaymentMatch[1]);
      const payment = data.subscriptionEntries.find((entry) => (
        entry.id === subscriptionPaymentMatch[2]
        && entry.studentId === subscriptionPaymentMatch[1]
        && entry.kind === 'payment'
      ));
      content = student && payment ? (
        <SubscriptionPaymentForm
          student={student}
          initial={payment}
          onSave={(input) => {
            dispatch({ type: 'subscription.payment.update', entry: updateSubscriptionPayment(payment, input) });
            showToast('Пополнение исправлено');
            go(`/trainer/clients/${student.id}/subscription`, true);
          }}
          onDelete={() => {
            dispatch({ type: 'subscription.payment.delete', entryId: payment.id });
            showToast('Пополнение удалено');
            go(`/trainer/clients/${student.id}/subscription`, true);
          }}
        />
      ) : <NotFound />;
    } else if (subscriptionNewMatch) {
      const student = findStudent(data, subscriptionNewMatch[1]);
      const lastPayment = student ? recentSubscriptionPayments(data.subscriptionEntries, student.id, 1)[0] : undefined;
      content = student ? (
        <SubscriptionPaymentForm
          student={student}
          defaults={lastPayment}
          onSave={(input) => {
            dispatch({ type: 'subscription.payment.create', entry: createSubscriptionPayment(student.id, input) });
            showToast(`Абонемент пополнен на ${input.lessons} ${lessonWord(input.lessons)}`);
            go(`/trainer/clients/${student.id}`, true);
          }}
        />
      ) : <NotFound />;
    } else if (subscriptionMatch) {
      const student = findStudent(data, subscriptionMatch[1]);
      content = student ? <SubscriptionHistory
        data={data}
        student={student}
        onDelete={() => {
          dispatch({ type: 'subscription.clear', studentId: student.id });
          showToast('Абонемент и его история удалены');
          go(`/trainer/clients/${student.id}`);
        }}
      /> : <NotFound />;
    } else if (clientAssignCopyMatch) {
      const [studentId, sourceAssignmentId] = clientAssignCopyMatch.slice(1);
      const student = findStudent(data, studentId);
      const sourceAssignment = data.assignments.find((item) => item.id === sourceAssignmentId && item.studentId === studentId);
      const sourceWorkout = sourceAssignment && workoutForRepeat(data, sourceAssignment);
      content = student?.status === 'active' && sourceAssignment && sourceWorkout ? (
        <AssignWorkoutToStudent
          student={student}
          workout={sourceWorkout}
          customExercises={data.customExercises}
          onCreateCustomExercise={createCustomExercise}
          onUpdateCustomExercise={updateCustomExercise}
          initialScheduledFor={dateKey()}
          initialScheduledTime={sourceAssignment.scheduledTime}
          initialFormat={sourceAssignment.format}
          backPath={`/trainer/clients/${student.id}/assign`}
          title="ПОВТОРИТЬ ТРЕНИРОВКУ"
          submitLabel="Назначить тренировку"
          submitIcon="plus"
          onAssign={(nextDate, scheduledTime, format, workoutSnapshot) => {
            const assignment = { ...repeatAssignment(sourceAssignment, workoutSnapshot, nextDate, scheduledTime), format };
            dispatch({ type: 'assignment.create', assignment });
            showToast(`Тренировка назначена: ${student.name}`);
            go(`/trainer/clients/${student.id}`);
          }}
        />
      ) : <NotFound />;
    } else if (clientAssignMatch?.[2] === 'new') {
      const student = findStudent(data, clientAssignMatch[1]);
      content = student ? (
        <NewAssignmentForStudent
          student={student}
          customExercises={data.customExercises}
          onCreateCustomExercise={createCustomExercise}
          onUpdateCustomExercise={updateCustomExercise}
          backPath={`/trainer/clients/${student.id}/assign`}
          onAssign={(scheduledFor, scheduledTime, format, workoutSnapshot) => {
            const assignment: Assignment = {
              id: makeId('assignment'),
              studentId: student.id,
              assignedAt: new Date().toISOString(),
              scheduledFor,
              scheduledTime,
              format,
              status: 'assigned',
              workoutSnapshot,
            };
            dispatch({ type: 'assignment.create', assignment });
            showToast(`Тренировка назначена: ${student.name}`);
            go(`/trainer/clients/${student.id}`);
          }}
        />
      ) : <NotFound />;
    } else if (clientAssignMatch) {
      const student = findStudent(data, clientAssignMatch[1]);
      content = student ? <StudentWorkoutHistory data={data} student={student} scheduledFor={dateKey()} backPath={`/trainer/clients/${student.id}`} routeBase={`/trainer/clients/${student.id}/assign`} /> : <NotFound />;
    } else if (clientMatch || progressMatch) {
      content = <StudentProfileComponent data={data} studentId={(clientMatch ?? progressMatch)![1]} trainerView onUpdate={(updated) => {
        dispatch({ type: 'student.update', student: updated });
        showToast('Профиль ученика сохранён');
      }} />;
    } else if (assignmentEditMatch) {
      const assignment = data.assignments.find((item) => item.id === assignmentEditMatch[1]);
      content = assignment && assignment.status === 'assigned' ? (
        <EditAssignment
          data={data}
          assignment={assignment}
          onCreateCustomExercise={createCustomExercise}
          onUpdateCustomExercise={updateCustomExercise}
          onSave={(updated) => {
            dispatch({ type: 'assignment.update', assignment: updated });
            showToast('Назначение сохранено');
            go(`/trainer/assignments/${updated.id}`);
          }}
          onDelete={(deleted) => {
            dispatch({
              type: 'assignment.delete',
              assignmentId: deleted.id,
              sessionId: data.sessions.find((session) => session.assignmentId === deleted.id)?.id,
            });
            showToast('Тренировка удалена из расписания');
            go(`/trainer/clients/${deleted.studentId}`);
          }}
        />
      ) : <NotFound />;
    } else if (assignmentRepeatMatch) {
      const assignment = data.assignments.find((item) => item.id === assignmentRepeatMatch[1]);
      const sourceWorkout = assignment && workoutForRepeat(data, assignment);
      content = assignment && sourceWorkout ? (
        <RepeatAssignment
          data={data}
          assignment={assignment}
          sourceWorkout={sourceWorkout}
          onCreateCustomExercise={createCustomExercise}
          onUpdateCustomExercise={updateCustomExercise}
          onSave={(scheduledFor, scheduledTime, format, workout) => {
            const next = { ...repeatAssignment(assignment, workout, scheduledFor, scheduledTime), format };
            dispatch({ type: 'assignment.create', assignment: next });
            showToast('Повтор тренировки назначен');
            go(`/trainer/assignments/${next.id}`);
          }}
        />
      ) : <NotFound />;
    } else if (assignmentMatch) {
      const assignment = data.assignments.find((item) => item.id === assignmentMatch[1]);
      content = assignment ? <AssignmentDetails
        data={data}
        assignment={assignment}
        onAcceptRequest={() => {
          const request = assignment.rescheduleRequest;
          if (!request) return;
          dispatch({ type: 'assignment.update', assignment: {
            ...assignment,
            scheduledFor: request.scheduledFor,
            scheduledTime: request.scheduledTime,
            rescheduleRequest: undefined,
          } });
          showToast('Новое время подтверждено');
        }}
        onDeclineRequest={() => {
          dispatch({ type: 'assignment.update', assignment: { ...assignment, rescheduleRequest: undefined } });
          showToast('Запрос отклонён');
        }}
      /> : <NotFound />;
    } else if (trainerActiveMatch) {
      const assignment = data.assignments.find((item) => item.id === trainerActiveMatch[1]);
      const session = assignment && data.sessions.find((item) => item.assignmentId === assignment.id && !item.completedAt);
      const workout = assignment && (session ? findSessionWorkout(data, session) : findAssignmentWorkout(data, assignment));
      content = assignment && workout && assignment.status === 'assigned' ? (
        <ActiveWorkout
          workout={workout}
          customExercises={data.customExercises}
          onCreateCustomExercise={createCustomExercise}
          onUpdateCustomExercise={updateCustomExercise}
          session={session}
          student={findStudent(data, assignment.studentId)}
          scheduledFor={assignment.scheduledFor}
          scheduledTime={assignment.scheduledTime}
          format={assignment.format}
          backPath={`/trainer/assignments/${assignment.id}`}
          trainerCanWaiveCharge
          balance={subscriptionBalance(data.subscriptionEntries, assignment.studentId)}
          onStart={() => {
            if (session) return;
            const nextSession = createWorkoutSession(assignment, workout, 'trainer');
            dispatch({ type: 'session.start', session: nextSession });
          }}
          onUpdate={(sessionId, results) => dispatch({ type: 'session.progress', sessionId, results })}
          onWorkoutUpdate={(sessionId, nextWorkout) => dispatch({ type: 'session.progress', sessionId, workoutSnapshot: nextWorkout })}
          onFinish={(sessionId, { chargeSubscription }) => {
            const completedAt = new Date().toISOString();
            dispatch({ type: 'session.complete', sessionId, assignmentId: assignment.id, completedAt, chargeSubscription, workoutName: workout.name });
            showToast(chargeSubscription ? 'Тренировка завершена, занятие списано' : 'Тренировка завершена без списания');
            go(`/trainer/sessions/${sessionId}`, true);
          }}
        />
      ) : <NotFound />;
    } else if (sessionMatch) {
      const session = data.sessions.find((item) => item.id === sessionMatch[1]);
      content = session ? <SessionResult
        data={data}
        session={session}
        trainerView
        onRepeat={() => go(`/trainer/assignments/${session.assignmentId}/repeat`)}
        onDelete={() => {
          dispatch({ type: 'session.archive', session, workoutName: session.workoutSnapshot.name });
          showToast('Завершённая тренировка удалена');
          go(`/trainer/clients/${session.studentId}`);
        }}
      /> : <NotFound />;
    } else if (path === '/trainer') {
      content = <TrainerHome data={data} />;
    } else {
      content = <NotFound />;
    }
  return content;
}
