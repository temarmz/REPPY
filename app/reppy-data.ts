export type Role = 'trainer' | 'student';
export type MoodRating = 'great' | 'good' | 'tired' | 'hard';

export type Student = {
  id: string;
  name: string;
  status: 'active' | 'invited';
  color: 'lime' | 'violet' | 'pink' | 'orange';
  height?: number;
  weight?: number;
  gender?: 'male' | 'female' | 'not-specified';
  phone?: string;
  contraindications?: string;
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
  scheduledFor: string;
  scheduledTime: string;
  status: 'assigned' | 'completed';
  rescheduleRequest?: {
    scheduledFor: string;
    scheduledTime: string;
    requestedAt: string;
  };
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
  mood?: MoodRating;
  comment?: string;
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

export function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

const demoWorkoutNames: Record<string, string> = {
  'push-day': 'Грудь и плечи',
  legs: 'Ноги',
  'pull-day': 'Спина и бицепс',
  'upper-body': 'Верх тела',
  arms: 'Руки',
};

const legacyDemoWorkoutNames: Record<string, string> = {
  'push-day': 'Push Day',
  legs: 'Legs',
  'pull-day': 'Pull Day',
  'upper-body': 'Upper Body',
  arms: 'Arms',
};

function createDemoWorkouts(now: string): Workout[] {
  return [
    {
      id: 'push-day',
      name: demoWorkoutNames['push-day'],
      createdAt: now,
      exercises: [
        workoutExercise('push-bench', 'bench-press', 'Жим лёжа', 4, 8, 80),
        workoutExercise('push-incline', 'incline-dumbbell', 'Жим гантелей на наклонной скамье', 3, 10, 24),
        workoutExercise('push-raise', 'lateral-raise', 'Разведение гантелей в стороны', 3, 15, 10),
      ],
    },
    {
      id: 'legs',
      name: demoWorkoutNames.legs,
      createdAt: now,
      exercises: [
        workoutExercise('legs-squat', 'squat', 'Приседания', 4, 8, 70),
        workoutExercise('legs-press', 'leg-press', 'Жим ногами', 4, 12, 120),
        workoutExercise('legs-deadlift', 'deadlift', 'Становая тяга', 3, 8, 80),
      ],
    },
    {
      id: 'pull-day',
      name: demoWorkoutNames['pull-day'],
      createdAt: now,
      exercises: [
        workoutExercise('pull-ups-main', 'pull-ups', 'Подтягивания', 4, 8, 0),
        workoutExercise('pull-lat', 'lat-pulldown', 'Тяга верхнего блока', 4, 10, 55),
        workoutExercise('pull-curl', 'dumbbell-curl', 'Сгибание рук с гантелями', 3, 12, 14),
      ],
    },
    {
      id: 'upper-body',
      name: demoWorkoutNames['upper-body'],
      createdAt: now,
      exercises: [
        workoutExercise('upper-bench', 'bench-press', 'Жим лёжа', 3, 10, 70),
        workoutExercise('upper-pull-ups', 'pull-ups', 'Подтягивания', 3, 8, 0),
        workoutExercise('upper-incline', 'incline-dumbbell', 'Жим гантелей на наклонной скамье', 3, 10, 22),
        workoutExercise('upper-raise', 'lateral-raise', 'Разведение гантелей в стороны', 3, 15, 8),
      ],
    },
    {
      id: 'arms',
      name: demoWorkoutNames.arms,
      createdAt: now,
      exercises: [
        workoutExercise('arms-curl', 'dumbbell-curl', 'Сгибание рук с гантелями', 4, 10, 14),
        workoutExercise('arms-triceps', 'triceps-pushdown', 'Разгибание рук на блоке', 4, 12, 30),
        workoutExercise('arms-raise', 'lateral-raise', 'Разведение гантелей в стороны', 3, 15, 8),
      ],
    },
  ];
}

function createDemoAssignments(now: string): Assignment[] {
  const after = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return dateKey(date);
  };
  return [
    { id: 'assignment-maria-legs', workoutId: 'legs', studentId: 'maria', assignedAt: now, scheduledFor: after(0), scheduledTime: '18:00', status: 'assigned' },
    { id: 'assignment-artem-push-today', workoutId: 'push-day', studentId: 'artem', assignedAt: now, scheduledFor: after(0), scheduledTime: '19:30', status: 'assigned' },
    { id: 'assignment-artem-push-1', workoutId: 'push-day', studentId: 'artem', assignedAt: now, scheduledFor: after(1), scheduledTime: '19:00', status: 'assigned' },
    { id: 'assignment-anton-push-1', workoutId: 'push-day', studentId: 'anton', assignedAt: now, scheduledFor: after(2), scheduledTime: '17:30', status: 'assigned' },
    { id: 'assignment-maria-push-1', workoutId: 'push-day', studentId: 'maria', assignedAt: now, scheduledFor: after(3), scheduledTime: '10:00', status: 'assigned' },
    { id: 'assignment-artem-legs-1', workoutId: 'legs', studentId: 'artem', assignedAt: now, scheduledFor: after(5), scheduledTime: '19:00', status: 'assigned' },
    { id: 'assignment-anton-legs-1', workoutId: 'legs', studentId: 'anton', assignedAt: now, scheduledFor: after(8), scheduledTime: '17:30', status: 'assigned' },
    { id: 'assignment-artem-push-2', workoutId: 'push-day', studentId: 'artem', assignedAt: now, scheduledFor: after(10), scheduledTime: '19:00', status: 'assigned' },
    { id: 'assignment-maria-legs-2', workoutId: 'legs', studentId: 'maria', assignedAt: now, scheduledFor: after(12), scheduledTime: '18:00', status: 'assigned' },
  ];
}

export function createInitialState(): DemoState {
  const now = new Date().toISOString();

  return {
    loggedIn: false,
    role: 'trainer',
    activeStudentId: 'artem',
    students: [
      { id: 'artem', name: 'Артем А.', status: 'active', color: 'lime', height: 182, weight: 86, gender: 'male', phone: '+7 916 482-17-35', contraindications: 'Иногда болит левое запястье при жимовых упражнениях.' },
      { id: 'maria', name: 'Мария А.', status: 'active', color: 'violet', height: 168, weight: 61, gender: 'female', phone: '+7 903 754-26-81', contraindications: '' },
      { id: 'anton', name: 'Антон К.', status: 'active', color: 'pink', height: 176, weight: 74, gender: 'male', phone: '+7 925 318-64-09', contraindications: 'Протрузия поясничного отдела. Избегать резкой осевой нагрузки.' },
    ],
    workouts: createDemoWorkouts(now),
    assignments: createDemoAssignments(now),
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

const demoHealthDefaults: Record<string, Pick<Student, 'height' | 'weight' | 'gender' | 'phone' | 'contraindications'>> = {
  artem: { height: 182, weight: 86, gender: 'male', phone: '+7 916 482-17-35', contraindications: 'Иногда болит левое запястье при жимовых упражнениях.' },
  maria: { height: 168, weight: 61, gender: 'female', phone: '+7 903 754-26-81', contraindications: '' },
  anton: { height: 176, weight: 74, gender: 'male', phone: '+7 925 318-64-09', contraindications: 'Протрузия поясничного отдела. Избегать резкой осевой нагрузки.' },
};

export function migrateDemoState(state: DemoState): DemoState {
  const currentId = (id: string) => legacyStudentIds[id] ?? id;
  const localizedWorkouts = state.workouts.map((workout) => {
    const localizedName = demoWorkoutNames[workout.id];
    const legacyName = legacyDemoWorkoutNames[workout.id];
    return localizedName && workout.name === legacyName ? { ...workout, name: localizedName } : workout;
  });
  const missingDemoWorkouts = createDemoWorkouts(new Date().toISOString())
    .filter((workout) => !state.workouts.some((item) => item.id === workout.id));
  const migratedAssignments = state.assignments.map((assignment) => ({
    ...assignment,
    studentId: currentId(assignment.studentId),
    scheduledFor: assignment.scheduledFor ?? dateKey(new Date(assignment.assignedAt)),
    scheduledTime: assignment.scheduledTime ?? '18:00',
  }));
  return {
    ...state,
    activeStudentId: currentId(state.activeStudentId),
    students: state.students.map((student) => {
      const id = currentId(student.id);
      const profile = demoStudentProfiles[id];
      const health = demoHealthDefaults[id];
      return profile ? {
        ...student,
        id,
        ...profile,
        height: student.height ?? health?.height,
        weight: student.weight ?? health?.weight,
        gender: student.gender ?? health?.gender ?? 'not-specified',
        phone: student.phone ?? health?.phone ?? '',
        contraindications: student.contraindications ?? health?.contraindications ?? '',
      } : student;
    }),
    assignments: migratedAssignments,
    workouts: [...localizedWorkouts, ...missingDemoWorkouts],
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

export function formatCalendarDay(value?: string) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (value === dateKey()) return 'Сегодня';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(date);
}
