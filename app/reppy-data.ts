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
  primaryMuscle?: MuscleGroup;
  equipment?: string;
  loadMode: 'external' | 'bodyweight';
  measureType: 'reps' | 'duration';
  plannedSets: WorkoutSetPlan[];
  coachNote?: string;
};

export type WorkoutSetPlan = {
  targetReps: number;
  targetWeight: number;
};

export type Workout = {
  id: string;
  name: string;
  exercises: WorkoutExercise[];
  createdAt: string;
  updatedAt?: string;
};

export type AssignmentSource = 'template' | 'student-version' | 'manual-edit' | 'repeated';

export type Assignment = {
  id: string;
  workoutId: string;
  studentId: string;
  assignedAt: string;
  scheduledFor: string;
  scheduledTime: string;
  status: 'assigned' | 'completed';
  workoutSnapshot: Workout;
  source: AssignmentSource;
  repeatedFromAssignmentId?: string;
  rescheduleRequest?: {
    scheduledFor: string;
    scheduledTime: string;
    requestedAt: string;
  };
};

export type StudentWorkoutVersion = {
  id: string;
  studentId: string;
  baseWorkoutId: string;
  name: string;
  exercises: WorkoutExercise[];
  createdAt: string;
  updatedAt: string;
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
  workoutSnapshot: Workout;
  startedAt: string;
  recordedBy: Role;
  completedAt?: string;
  mood?: MoodRating;
  comment?: string;
  results: SetResult[];
};

export type DemoState = {
  schemaVersion: 2;
  loggedIn: boolean;
  role: Role;
  activeStudentId: string;
  students: Student[];
  workouts: Workout[];
  studentWorkoutVersions: StudentWorkoutVersion[];
  assignments: Assignment[];
  sessions: WorkoutSession[];
};

export const TRAINER_NAME = 'Евгений Ч.';

export function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const muscleGroups = [
  'Грудь',
  'Спина',
  'Плечи',
  'Бицепс',
  'Трицепс',
  'Квадрицепс',
  'Ягодицы',
  'Задняя поверхность бедра',
  'Икры',
  'Кор',
] as const;

export type MuscleGroup = typeof muscleGroups[number];

export type ExerciseDefinition = {
  id: string;
  name: string;
  primaryMuscle: MuscleGroup;
  equipment: string;
  measureType?: 'reps' | 'duration';
};

export const exerciseLibrary: ExerciseDefinition[] = [
  { id: 'bench-press', name: 'Жим лёжа', primaryMuscle: 'Грудь', equipment: 'Штанга' },
  { id: 'incline-dumbbell', name: 'Жим гантелей на наклонной скамье', primaryMuscle: 'Грудь', equipment: 'Гантели' },
  { id: 'push-ups', name: 'Отжимания', primaryMuscle: 'Грудь', equipment: 'Свой вес' },
  { id: 'cable-fly', name: 'Сведение рук в кроссовере', primaryMuscle: 'Грудь', equipment: 'Блок' },
  { id: 'pull-ups', name: 'Подтягивания', primaryMuscle: 'Спина', equipment: 'Свой вес' },
  { id: 'lat-pulldown', name: 'Тяга верхнего блока', primaryMuscle: 'Спина', equipment: 'Блок' },
  { id: 'barbell-row', name: 'Тяга штанги в наклоне', primaryMuscle: 'Спина', equipment: 'Штанга' },
  { id: 'seated-row', name: 'Тяга горизонтального блока', primaryMuscle: 'Спина', equipment: 'Блок' },
  { id: 'deadlift', name: 'Становая тяга', primaryMuscle: 'Спина', equipment: 'Штанга' },
  { id: 'overhead-press', name: 'Жим над головой', primaryMuscle: 'Плечи', equipment: 'Штанга' },
  { id: 'lateral-raise', name: 'Разведение гантелей в стороны', primaryMuscle: 'Плечи', equipment: 'Гантели' },
  { id: 'rear-delt-fly', name: 'Разведение на заднюю дельту', primaryMuscle: 'Плечи', equipment: 'Гантели' },
  { id: 'dumbbell-curl', name: 'Сгибание рук с гантелями', primaryMuscle: 'Бицепс', equipment: 'Гантели' },
  { id: 'hammer-curl', name: 'Молотковые сгибания', primaryMuscle: 'Бицепс', equipment: 'Гантели' },
  { id: 'triceps-pushdown', name: 'Разгибание рук на блоке', primaryMuscle: 'Трицепс', equipment: 'Блок' },
  { id: 'overhead-triceps', name: 'Разгибание рук из-за головы', primaryMuscle: 'Трицепс', equipment: 'Гантель' },
  { id: 'dips', name: 'Отжимания на брусьях', primaryMuscle: 'Трицепс', equipment: 'Свой вес' },
  { id: 'squat', name: 'Приседания', primaryMuscle: 'Квадрицепс', equipment: 'Штанга' },
  { id: 'leg-press', name: 'Жим ногами', primaryMuscle: 'Квадрицепс', equipment: 'Тренажёр' },
  { id: 'leg-extension', name: 'Разгибание ног', primaryMuscle: 'Квадрицепс', equipment: 'Тренажёр' },
  { id: 'hip-thrust', name: 'Ягодичный мост', primaryMuscle: 'Ягодицы', equipment: 'Штанга' },
  { id: 'bulgarian-squat', name: 'Болгарские выпады', primaryMuscle: 'Ягодицы', equipment: 'Гантели' },
  { id: 'romanian-deadlift', name: 'Румынская тяга', primaryMuscle: 'Задняя поверхность бедра', equipment: 'Штанга' },
  { id: 'leg-curl', name: 'Сгибание ног', primaryMuscle: 'Задняя поверхность бедра', equipment: 'Тренажёр' },
  { id: 'calf-raise', name: 'Подъёмы на носки', primaryMuscle: 'Икры', equipment: 'Тренажёр' },
  { id: 'plank', name: 'Планка', primaryMuscle: 'Кор', equipment: 'Свой вес', measureType: 'duration' },
  { id: 'crunch', name: 'Скручивания', primaryMuscle: 'Кор', equipment: 'Свой вес' },
  { id: 'dead-bug', name: 'Мёртвый жук', primaryMuscle: 'Кор', equipment: 'Свой вес' },
];

type LegacyWorkoutExercise = Omit<WorkoutExercise, 'loadMode' | 'measureType' | 'plannedSets'> & {
  loadMode?: WorkoutExercise['loadMode'];
  measureType?: WorkoutExercise['measureType'];
  plannedSets?: WorkoutSetPlan[];
  sets?: number;
  targetReps?: number;
  targetWeight?: number;
};

export function getExerciseSetPlans(exercise: WorkoutExercise | LegacyWorkoutExercise): WorkoutSetPlan[] {
  const legacy = exercise as LegacyWorkoutExercise;
  const savedPlans = Array.isArray(exercise.plannedSets) ? exercise.plannedSets : [];
  const count = Math.max(1, savedPlans.length || legacy.sets || 1);
  const fallbackReps = Math.max(1, legacy.targetReps || (exercise.measureType === 'duration' ? 30 : 10));
  const fallbackWeight = Math.max(0, legacy.targetWeight || 0);
  return Array.from({ length: count }, (_, index) => ({
    targetReps: Math.max(1, savedPlans[index]?.targetReps || fallbackReps),
    targetWeight: exercise.loadMode === 'bodyweight' ? 0 : Math.max(0, savedPlans[index]?.targetWeight ?? fallbackWeight),
  }));
}

export function withExerciseSetPlans(exercise: WorkoutExercise, plannedSets: WorkoutSetPlan[]): WorkoutExercise {
  const safePlans = (plannedSets.length ? plannedSets : [{ targetReps: exercise.measureType === 'duration' ? 30 : 10, targetWeight: 0 }]).map((set) => ({
    targetReps: Math.max(1, set.targetReps || 1),
    targetWeight: exercise.loadMode === 'bodyweight' ? 0 : Math.max(0, set.targetWeight || 0),
  }));
  return {
    ...exercise,
    plannedSets: safePlans,
  };
}

export function normalizeWorkoutExercise(exercise: WorkoutExercise | LegacyWorkoutExercise): WorkoutExercise {
  const definition = exerciseLibrary.find((item) => item.id === exercise.exerciseId);
  const loadMode = exercise.loadMode ?? (definition?.equipment === 'Свой вес' ? 'bodyweight' : 'external');
  const measureType = exercise.measureType ?? definition?.measureType ?? 'reps';
  const withMetadata: WorkoutExercise = {
    id: exercise.id,
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    primaryMuscle: exercise.primaryMuscle ?? definition?.primaryMuscle,
    equipment: exercise.equipment ?? definition?.equipment ?? (loadMode === 'bodyweight' ? 'Свой вес' : undefined),
    loadMode,
    measureType,
    plannedSets: [],
    coachNote: exercise.coachNote,
  };
  return withExerciseSetPlans(withMetadata, getExerciseSetPlans(exercise));
}

const workoutExercise = (
  id: string,
  exerciseId: string,
  name: string,
  sets: number,
  targetReps: number,
  targetWeight: number,
): WorkoutExercise => normalizeWorkoutExercise({
  id,
  exerciseId,
  name,
  loadMode: exerciseLibrary.find((exercise) => exercise.id === exerciseId)?.equipment === 'Свой вес' ? 'bodyweight' : 'external',
  measureType: exerciseLibrary.find((exercise) => exercise.id === exerciseId)?.measureType ?? 'reps',
  plannedSets: Array.from({ length: sets }, () => ({ targetReps, targetWeight })),
});

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

function createDemoAssignments(now: string, workouts: Workout[]): Assignment[] {
  const after = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return dateKey(date);
  };
  const assignment = (id: string, workoutId: string, studentId: string, days: number, scheduledTime: string): Assignment => {
    const workout = workouts.find((item) => item.id === workoutId);
    if (!workout) throw new Error(`Не найден шаблон демо-тренировки: ${workoutId}`);
    return {
      id,
      workoutId,
      studentId,
      assignedAt: now,
      scheduledFor: after(days),
      scheduledTime,
      status: 'assigned',
      workoutSnapshot: cloneWorkout(workout),
      source: 'template',
    };
  };
  return [
    assignment('assignment-maria-legs', 'legs', 'maria', 0, '18:00'),
    assignment('assignment-artem-push-today', 'push-day', 'artem', 0, '19:30'),
    assignment('assignment-artem-push-1', 'push-day', 'artem', 1, '19:00'),
    assignment('assignment-anton-push-1', 'push-day', 'anton', 2, '17:30'),
    assignment('assignment-maria-push-1', 'push-day', 'maria', 3, '10:00'),
    assignment('assignment-artem-legs-1', 'legs', 'artem', 5, '19:00'),
    assignment('assignment-anton-legs-1', 'legs', 'anton', 8, '17:30'),
    assignment('assignment-artem-push-2', 'push-day', 'artem', 10, '19:00'),
    assignment('assignment-maria-legs-2', 'legs', 'maria', 12, '18:00'),
  ];
}

export function createInitialState(): DemoState {
  const now = new Date().toISOString();
  const workouts = createDemoWorkouts(now);

  return {
    schemaVersion: 2,
    loggedIn: false,
    role: 'trainer',
    activeStudentId: 'artem',
    students: [
      { id: 'artem', name: 'Артем А.', status: 'active', color: 'lime', height: 182, weight: 86, gender: 'male', phone: '+7 916 482-17-35', contraindications: 'Иногда болит левое запястье при жимовых упражнениях.' },
      { id: 'maria', name: 'Мария А.', status: 'active', color: 'violet', height: 168, weight: 61, gender: 'female', phone: '+7 903 754-26-81', contraindications: '' },
      { id: 'anton', name: 'Антон К.', status: 'active', color: 'pink', height: 176, weight: 74, gender: 'male', phone: '+7 925 318-64-09', contraindications: 'Протрузия поясничного отдела. Избегать резкой осевой нагрузки.' },
    ],
    workouts,
    studentWorkoutVersions: [],
    assignments: createDemoAssignments(now, workouts),
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
    const normalized = { ...workout, exercises: workout.exercises.map(normalizeWorkoutExercise) };
    return localizedName && workout.name === legacyName ? { ...normalized, name: localizedName } : normalized;
  });
  const missingDemoWorkouts = createDemoWorkouts(new Date().toISOString())
    .filter((workout) => !state.workouts.some((item) => item.id === workout.id));
  const workouts = [...localizedWorkouts, ...missingDemoWorkouts];
  const migratedAssignments = state.assignments.map((assignment) => {
    const template = workouts.find((item) => item.id === assignment.workoutId);
    const fallback: Workout = template ?? {
      id: assignment.workoutId,
      name: 'Тренировка',
      exercises: [],
      createdAt: assignment.assignedAt,
    };
    return {
      ...assignment,
      studentId: currentId(assignment.studentId),
      scheduledFor: assignment.scheduledFor ?? dateKey(new Date(assignment.assignedAt)),
      scheduledTime: assignment.scheduledTime ?? '18:00',
      workoutSnapshot: cloneWorkout(assignment.workoutSnapshot ?? fallback),
      source: assignment.source ?? 'template',
    };
  });
  return {
    ...state,
    schemaVersion: 2,
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
    workouts,
    studentWorkoutVersions: (state.studentWorkoutVersions ?? []).map((version) => ({
      ...version,
      studentId: currentId(version.studentId),
      exercises: version.exercises.map(normalizeWorkoutExercise),
    })),
    sessions: state.sessions.map((session) => ({
      ...session,
      studentId: currentId(session.studentId),
      recordedBy: session.recordedBy ?? 'student',
      workoutSnapshot: cloneWorkout(
        session.workoutSnapshot
          ?? migratedAssignments.find((assignment) => assignment.id === session.assignmentId)?.workoutSnapshot
          ?? workouts.find((workout) => workout.id === session.workoutId)
          ?? { id: session.workoutId, name: 'Тренировка', exercises: [], createdAt: session.startedAt },
      ),
    })),
  };
}

export function cloneWorkout(workout: Workout): Workout {
  return {
    ...workout,
    exercises: workout.exercises.map(normalizeWorkoutExercise),
  };
}

export function createWorkoutTemplate(
  source: Workout,
  name: string,
  now = new Date().toISOString(),
): Workout {
  return {
    id: makeId('workout'),
    name: name.trim() || `${source.name} — копия`,
    exercises: source.exercises.map((exercise) => normalizeWorkoutExercise({ ...exercise, id: makeId('exercise') })),
    createdAt: now,
  };
}

export function createWorkoutSession(
  assignment: Assignment,
  workout: Workout,
  recordedBy: Role,
  now = new Date().toISOString(),
): WorkoutSession {
  return {
    id: makeId('session'),
    assignmentId: assignment.id,
    studentId: assignment.studentId,
    workoutId: assignment.workoutId,
    workoutSnapshot: cloneWorkout(workout),
    startedAt: now,
    recordedBy,
    results: workout.exercises.flatMap((exercise) =>
      getExerciseSetPlans(exercise).map((set, index) => ({
        exerciseId: exercise.id,
        setNumber: index + 1,
        actualReps: set.targetReps,
        actualWeight: exercise.loadMode === 'bodyweight' ? 0 : set.targetWeight,
        completed: false,
      })),
    ),
  };
}

export function updateSessionWorkout(session: WorkoutSession, workout: Workout): WorkoutSession {
  const completedResults = session.results.filter((result) => result.completed);
  const nextExerciseIds = new Set(workout.exercises.map((exercise) => exercise.id));
  const adjustedExercises = workout.exercises.map((exercise) => {
    const highestCompletedSet = Math.max(0, ...completedResults
      .filter((result) => result.exerciseId === exercise.id)
      .map((result) => result.setNumber));
    const plannedSets = getExerciseSetPlans(exercise);
    const fallback = plannedSets.at(-1) ?? { targetReps: 10, targetWeight: 0 };
    while (plannedSets.length < highestCompletedSet) plannedSets.push({ ...fallback });
    return withExerciseSetPlans(exercise, plannedSets);
  });
  const preservedExercises = session.workoutSnapshot.exercises
    .filter((exercise) => !nextExerciseIds.has(exercise.id) && completedResults.some((result) => result.exerciseId === exercise.id))
    .map((exercise) => {
      const highestCompletedSet = Math.max(getExerciseSetPlans(exercise).length, ...completedResults
        .filter((result) => result.exerciseId === exercise.id)
        .map((result) => result.setNumber));
      const plannedSets = getExerciseSetPlans(exercise);
      const fallback = plannedSets.at(-1) ?? { targetReps: 10, targetWeight: 0 };
      while (plannedSets.length < highestCompletedSet) plannedSets.push({ ...fallback });
      return withExerciseSetPlans(exercise, plannedSets);
    });
  const nextWorkout: Workout = {
    ...cloneWorkout(workout),
    exercises: [...adjustedExercises, ...preservedExercises],
    updatedAt: new Date().toISOString(),
  };

  const results = nextWorkout.exercises.flatMap((exercise) => {
    const previousExercise = session.workoutSnapshot.exercises.find((item) => item.id === exercise.id);
    const previousPlans = previousExercise ? getExerciseSetPlans(previousExercise) : [];
    return getExerciseSetPlans(exercise).map((plan, index) => {
      const setNumber = index + 1;
      const previousPlan = previousPlans[index];
      const existing = session.results.find((result) => result.exerciseId === exercise.id && result.setNumber === setNumber);
      if (!existing || existing.completed) {
        return existing ?? {
          exerciseId: exercise.id,
          setNumber,
          actualReps: plan.targetReps,
          actualWeight: exercise.loadMode === 'bodyweight' ? 0 : plan.targetWeight,
          completed: false,
        };
      }
      return {
        ...existing,
        actualReps: existing.actualReps === previousPlan?.targetReps ? plan.targetReps : existing.actualReps,
        actualWeight: existing.actualWeight === previousPlan?.targetWeight ? plan.targetWeight : existing.actualWeight,
      };
    });
  });

  return { ...session, workoutSnapshot: nextWorkout, results };
}

export function workoutFromSession(session: WorkoutSession): Workout {
  const snapshot = cloneWorkout(session.workoutSnapshot);
  return {
    ...snapshot,
    exercises: snapshot.exercises.map((exercise) => {
      const results = session.results.filter((result) => result.exerciseId === exercise.id);
      const plans = getExerciseSetPlans(exercise).map((plan, index) => {
        const result = results.find((item) => item.setNumber === index + 1);
        if (!result?.completed) return plan;
        return {
          targetReps: result.actualReps,
          targetWeight: exercise.loadMode === 'bodyweight' ? 0 : result.actualWeight,
        };
      });
      return withExerciseSetPlans(exercise, plans);
    }),
  };
}

export function repeatAssignment(
  source: Assignment,
  sourceWorkout: Workout,
  scheduledFor: string,
  scheduledTime: string,
  now = new Date().toISOString(),
): Assignment {
  return {
    id: makeId('assignment'),
    workoutId: source.workoutId,
    studentId: source.studentId,
    assignedAt: now,
    scheduledFor,
    scheduledTime,
    status: 'assigned',
    workoutSnapshot: {
      ...cloneWorkout(sourceWorkout),
      exercises: sourceWorkout.exercises.map((exercise) => normalizeWorkoutExercise({ ...exercise, id: makeId('exercise') })),
      updatedAt: now,
    },
    source: 'repeated',
    repeatedFromAssignmentId: source.id,
  };
}

export function findAssignmentWorkout(data: DemoState, assignment: Assignment) {
  return assignment.workoutSnapshot ?? data.workouts.find((workout) => workout.id === assignment.workoutId);
}

export function findSessionWorkout(data: DemoState, session: WorkoutSession) {
  if (session.workoutSnapshot) return session.workoutSnapshot;
  const assignment = data.assignments.find((item) => item.id === session.assignmentId);
  return (assignment && findAssignmentWorkout(data, assignment))
    ?? data.workouts.find((workout) => workout.id === session.workoutId);
}

export function findStudentWorkoutVersion(data: DemoState, studentId: string, workoutId: string) {
  return data.studentWorkoutVersions.find((version) => version.studentId === studentId && version.baseWorkoutId === workoutId);
}

export function resolveAssignmentWorkout(data: DemoState, studentId: string, workout: Workout, useOriginalTemplate = false): Pick<Assignment, 'workoutSnapshot' | 'source'> {
  const version = useOriginalTemplate ? undefined : findStudentWorkoutVersion(data, studentId, workout.id);
  if (!version) return { workoutSnapshot: cloneWorkout(workout), source: 'template' };
  return {
    workoutSnapshot: {
      ...cloneWorkout(workout),
      name: version.name,
      exercises: version.exercises.map(normalizeWorkoutExercise),
      updatedAt: version.updatedAt,
    },
    source: 'student-version',
  };
}

export function resolveEditedAssignmentSource(
  currentSource: AssignmentSource,
  exercisesChanged: boolean,
  rememberForStudent: boolean,
): AssignmentSource {
  if (rememberForStudent) return 'student-version';
  return exercisesChanged ? 'manual-edit' : currentSource;
}

export function upsertStudentWorkoutVersion(
  versions: StudentWorkoutVersion[],
  studentId: string,
  baseWorkoutId: string,
  workout: Workout,
  now = new Date().toISOString(),
) {
  const existing = versions.find((version) => version.studentId === studentId && version.baseWorkoutId === baseWorkoutId);
  const next: StudentWorkoutVersion = {
    id: existing?.id ?? makeId('student-workout'),
    studentId,
    baseWorkoutId,
    name: workout.name,
    exercises: workout.exercises.map((exercise) => ({ ...exercise })),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return existing
    ? versions.map((version) => version.id === existing.id ? next : version)
    : [...versions, next];
}

export function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function totalSets(workout?: Workout) {
  return workout?.exercises.reduce((sum, exercise) => sum + getExerciseSetPlans(exercise).length, 0) ?? 0;
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
