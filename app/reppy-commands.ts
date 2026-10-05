import {
  chargeSubscriptionForSession,
  refundSubscriptionForSession,
} from './subscription-ledger.ts';
import type {
  Assignment,
  DemoState,
  ExerciseDefinition,
  SetResult,
  Student,
  SubscriptionEntry,
  Workout,
  WorkoutSession,
} from './reppy-data.ts';
import { updateSessionWorkout } from './reppy-data.ts';

export type ReppyCommand =
  | { type: 'exercise-definition.create'; definition: ExerciseDefinition }
  | { type: 'exercise-definition.update'; definition: ExerciseDefinition }
  | { type: 'student.create'; student: Student }
  | { type: 'student.update'; student: Student }
  | { type: 'assignment.create'; assignment: Assignment }
  | { type: 'assignment.update'; assignment: Assignment }
  | { type: 'assignment.delete'; assignmentId: string; sessionId?: string }
  | { type: 'session.start'; session: WorkoutSession }
  | { type: 'session.progress'; sessionId: string; workoutSnapshot?: Workout; results?: SetResult[] }
  | {
      type: 'session.complete';
      sessionId: string;
      assignmentId: string;
      completedAt: string;
      chargeSubscription: boolean;
      workoutName: string;
    }
  | { type: 'session.feedback'; sessionId: string; mood: WorkoutSession['mood']; comment: string }
  | { type: 'session.archive'; session: WorkoutSession; workoutName: string }
  | { type: 'subscription.payment.create'; entry: SubscriptionEntry }
  | { type: 'subscription.payment.update'; entry: SubscriptionEntry }
  | { type: 'subscription.payment.delete'; entryId: string }
  | { type: 'subscription.clear'; studentId: string };

export function applyReppyCommand(state: DemoState, command: ReppyCommand): DemoState {
  switch (command.type) {
    case 'exercise-definition.create': {
      const normalizedName = command.definition.name.trim().toLocaleLowerCase('ru');
      return state.customExercises.some((definition) => (
        definition.id === command.definition.id
        || definition.name.trim().toLocaleLowerCase('ru') === normalizedName
      )) ? state : {
        ...state,
        customExercises: [...state.customExercises, { ...command.definition, name: command.definition.name.trim() }],
      };
    }
    case 'exercise-definition.update': {
      const normalizedName = command.definition.name.trim();
      return {
        ...state,
        customExercises: state.customExercises.map((definition) => definition.id === command.definition.id
          ? { ...command.definition, name: normalizedName }
          : definition),
      };
    }
    case 'student.create':
      return state.students.some((student) => student.id === command.student.id)
        ? state
        : { ...state, students: [...state.students, command.student] };
    case 'student.update':
      return {
        ...state,
        students: state.students.map((student) => student.id === command.student.id ? command.student : student),
      };
    case 'assignment.create':
      return { ...state, assignments: [...state.assignments, command.assignment] };
    case 'assignment.update':
      return {
        ...state,
        assignments: state.assignments.map((assignment) => (
          assignment.id === command.assignment.id ? command.assignment : assignment
        )),
      };
    case 'assignment.delete':
      return {
        ...state,
        assignments: state.assignments.filter((assignment) => assignment.id !== command.assignmentId),
        sessions: state.sessions.filter((session) => session.assignmentId !== command.assignmentId),
      };
    case 'session.start':
      return state.sessions.some((session) => session.id === command.session.id)
        ? state
        : { ...state, sessions: [...state.sessions, command.session] };
    case 'session.progress':
      return {
        ...state,
        sessions: state.sessions.map((session) => {
          if (session.id !== command.sessionId) return session;
          const updated = command.workoutSnapshot
            ? updateSessionWorkout(session, command.workoutSnapshot)
            : session;
          return command.results ? { ...updated, results: command.results } : updated;
        }),
      };
    case 'session.complete': {
      const session = state.sessions.find((item) => item.id === command.sessionId);
      const completedSession = session ? {
        ...session,
        completedAt: command.completedAt,
        subscriptionChargeStatus: command.chargeSubscription ? 'charged' as const : 'waived' as const,
      } : undefined;
      return {
        ...state,
        assignments: state.assignments.map((assignment) => assignment.id === command.assignmentId
          ? { ...assignment, status: 'completed' }
          : assignment),
        sessions: state.sessions.map((item) => item.id === command.sessionId && completedSession ? completedSession : item),
        subscriptionEntries: command.chargeSubscription && completedSession
          ? chargeSubscriptionForSession(
              state.subscriptionEntries,
              completedSession,
              command.workoutName,
              command.completedAt,
            )
          : state.subscriptionEntries,
      };
    }
    case 'session.feedback':
      return {
        ...state,
        sessions: state.sessions.map((session) => session.id === command.sessionId ? {
          ...session,
          mood: command.mood,
          comment: command.comment.trim(),
        } : session),
      };
    case 'session.archive':
      return {
        ...state,
        assignments: state.assignments.filter((assignment) => assignment.id !== command.session.assignmentId),
        sessions: state.sessions.filter((session) => session.assignmentId !== command.session.assignmentId),
        subscriptionEntries: refundSubscriptionForSession(
          state.subscriptionEntries,
          command.session,
          command.workoutName,
        ),
      };
    case 'subscription.payment.create':
      return { ...state, subscriptionEntries: [...state.subscriptionEntries, command.entry] };
    case 'subscription.payment.update':
      return {
        ...state,
        subscriptionEntries: state.subscriptionEntries.map((entry) => (
          entry.id === command.entry.id ? command.entry : entry
        )),
      };
    case 'subscription.payment.delete':
      return {
        ...state,
        subscriptionEntries: state.subscriptionEntries.filter((entry) => entry.id !== command.entryId),
      };
    case 'subscription.clear':
      return {
        ...state,
        subscriptionEntries: state.subscriptionEntries.filter((entry) => entry.studentId !== command.studentId),
      };
  }
}
