export type Role = 'trainer' | 'student';

export type Student = {
  id: string;
  name: string;
  status: 'active' | 'invited';
  color: 'lime' | 'violet' | 'pink' | 'orange';
};

export type WorkoutExercise = {
  id: string;
  exerciseId: string;
  name: string;
  sets: number;
  targetReps: number;
  targetWeight: number;
};

export type Workout = {
  id: string;
  name: string;
  exercises: WorkoutExercise[];
  createdAt: string;
};

export type Assignment = {
  id: string;
  workoutId: string;
  studentId: string;
  assignedAt: string;
  status: 'assigned' | 'completed';
};

export type SetResult = {
  exerciseId: string;
  setNumber: number;
  actualReps: number;
  actualWeight: number;
  completed: boolean;
};

export type WorkoutSession = {
  id: string;
  assignmentId: string;
  studentId: string;
  workoutId: string;
  startedAt: string;
  completedAt?: string;
  results: SetResult[];
};

export type DemoState = {
  loggedIn: boolean;
  role: Role;
  activeStudentId: string;
  students: Student[];
  workouts: Workout[];
  assignments: Assignment[];
  sessions: WorkoutSession[];
};

export const STORAGE_KEY = 'reppy-demo-v0';
export const TRAINER_NAME = 'Евгений Ч.';

export const exerciseLibrary = [
  { id: 'bench-press', name: 'Жим лёжа' },
  { id: 'incline-dumbbell', name: 'Жим гантелей на наклонной скамье' },
  { id: 'squat', name: 'Приседания' },
  { id: 'deadlift', name: 'Становая тяга' },
  { id: 'pull-ups', name: 'Подтягивания' },
  { id: 'lat-pulldown', name: 'Тяга верхнего блока' },
  { id: 'dumbbell-curl', name: 'Сгибание рук с гантелями' },
  { id: 'triceps-pushdown', name: 'Разгибание рук на блоке' },
  { id: 'lateral-raise', name: 'Разведение гантелей в стороны' },
  { id: 'leg-press', name: 'Жим ногами' },
];

const workoutExercise = (
  id: string,
  exerciseId: string,
  name: string,
  sets: number,
  targetReps: number,
  targetWeight: number,
): WorkoutExercise => ({ id, exerciseId, name, sets, targetReps, targetWeight });

export function createInitialState(): DemoState {
  const now = new Date().toISOString();

  return {
    loggedIn: false,
    role: 'trainer',
    activeStudentId: 'artem',
    students: [
      { id: 'artem', name: 'Артем А.', status: 'active', color: 'lime' },
      { id: 'maria', name: 'Мария А.', status: 'active', color: 'violet' },
      { id: 'anton', name: 'Антон К.', status: 'active', color: 'pink' },
    ],
    workouts: [
      {
        id: 'push-day',
        name: 'Push Day',
        createdAt: now,
        exercises: [
          workoutExercise('push-bench', 'bench-press', 'Жим лёжа', 4, 8, 80),
          workoutExercise('push-incline', 'incline-dumbbell', 'Жим гантелей на наклонной скамье', 3, 10, 24),
          workoutExercise('push-raise', 'lateral-raise', 'Разведение гантелей в стороны', 3, 15, 10),
        ],
      },
      {
        id: 'legs',
        name: 'Legs',
        createdAt: now,
        exercises: [
          workoutExercise('legs-squat', 'squat', 'Приседания', 4, 8, 70),
          workoutExercise('legs-press', 'leg-press', 'Жим ногами', 4, 12, 120),
          workoutExercise('legs-deadlift', 'deadlift', 'Становая тяга', 3, 8, 80),
        ],
      },
    ],
    assignments: [
      {
        id: 'assignment-maria-legs',
        workoutId: 'legs',
        studentId: 'maria',
        assignedAt: now,
        status: 'assigned',
      },
    ],
    sessions: [],
  };
}

const legacyStudentIds: Record<string, string> = {
  richard: 'artem',
  mikhail: 'maria',
  anna: 'anton',
};

const demoStudentProfiles: Record<string, Pick<Student, 'name' | 'color'>> = {
  artem: { name: 'Артем А.', color: 'lime' },
  maria: { name: 'Мария А.', color: 'violet' },
  anton: { name: 'Антон К.', color: 'pink' },
};

export function migrateDemoState(state: DemoState): DemoState {
  const currentId = (id: string) => legacyStudentIds[id] ?? id;

  return {
    ...state,
    activeStudentId: currentId(state.activeStudentId),
    students: state.students.map((student) => {
      const id = currentId(student.id);
      const profile = demoStudentProfiles[id];
      return profile ? { ...student, id, ...profile } : student;
    }),
    assignments: state.assignments.map((assignment) => ({
      ...assignment,
      studentId: currentId(assignment.studentId),
    })),
    sessions: state.sessions.map((session) => ({
      ...session,
      studentId: currentId(session.studentId),
    })),
  };
}

export function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function totalSets(workout?: Workout) {
  return workout?.exercises.reduce((sum, exercise) => sum + exercise.sets, 0) ?? 0;
}

export function formatDay(iso?: string) {
  if (!iso) return '';
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Сегодня';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(date);
}
