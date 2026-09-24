export type Role = 'trainer' | 'student';
export type MoodRating = 'great' | 'good' | 'tired' | 'hard';
export type TrainingFormat = 'in-person' | 'online';

export type InstructionVideo = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

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
  instructionText?: string;
  instructionVideo?: InstructionVideo;
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

export type Assignment = {
  id: string;
  studentId: string;
  assignedAt: string;
  scheduledFor: string;
  scheduledTime?: string;
  format: TrainingFormat;
  status: 'assigned' | 'completed';
  workoutSnapshot: Workout;
  repeatedFromAssignmentId?: string;
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
  workoutSnapshot: Workout;
  startedAt: string;
  recordedBy: Role;
  completedAt?: string;
  mood?: MoodRating;
  comment?: string;
  subscriptionChargeStatus?: 'charged' | 'waived';
  results: SetResult[];
};

export type PaymentMethod = 'cash' | 'transfer';

export type SubscriptionEntry = {
  id: string;
  trainerId: string;
  studentId: string;
  kind: 'payment' | 'session-charge' | 'session-refund';
  lessonDelta: number;
  occurredAt: string;
  createdAt: string;
  updatedAt?: string;
  amountRub?: number;
  paymentMethod?: PaymentMethod;
  comment?: string;
  sessionId?: string;
  workoutName?: string;
};

export type DemoState = {
  schemaVersion: 6;
  loggedIn: boolean;
  role: Role;
  activeStudentId: string;
  students: Student[];
  assignments: Assignment[];
  sessions: WorkoutSession[];
  subscriptionEntries: SubscriptionEntry[];
};

export const TRAINER_ID = 'trainer-demo';
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
  { id: 'dumbbell-bench-press', name: 'Жим гантелей лёжа', primaryMuscle: 'Грудь', equipment: 'Гантели' },
  { id: 'incline-barbell-press', name: 'Жим штанги на наклонной скамье', primaryMuscle: 'Грудь', equipment: 'Штанга' },
  { id: 'pec-deck', name: 'Сведение рук в тренажёре', primaryMuscle: 'Грудь', equipment: 'Тренажёр' },
  { id: 'chest-press-machine', name: 'Жим от груди в тренажёре', primaryMuscle: 'Грудь', equipment: 'Тренажёр' },
  { id: 'pull-ups', name: 'Подтягивания', primaryMuscle: 'Спина', equipment: 'Свой вес' },
  { id: 'lat-pulldown', name: 'Тяга верхнего блока', primaryMuscle: 'Спина', equipment: 'Блок' },
  { id: 'barbell-row', name: 'Тяга штанги в наклоне', primaryMuscle: 'Спина', equipment: 'Штанга' },
  { id: 'seated-row', name: 'Тяга горизонтального блока', primaryMuscle: 'Спина', equipment: 'Блок' },
  { id: 'deadlift', name: 'Становая тяга', primaryMuscle: 'Спина', equipment: 'Штанга' },
  { id: 'one-arm-dumbbell-row', name: 'Тяга гантели одной рукой', primaryMuscle: 'Спина', equipment: 'Гантель' },
  { id: 'chest-supported-row', name: 'Тяга гантелей с упором грудью', primaryMuscle: 'Спина', equipment: 'Гантели' },
  { id: 't-bar-row', name: 'Тяга Т-грифа', primaryMuscle: 'Спина', equipment: 'Тренажёр' },
  { id: 'straight-arm-pulldown', name: 'Тяга верхнего блока прямыми руками', primaryMuscle: 'Спина', equipment: 'Блок' },
  { id: 'hyperextension', name: 'Гиперэкстензия', primaryMuscle: 'Спина', equipment: 'Свой вес' },
  { id: 'overhead-press', name: 'Жим над головой', primaryMuscle: 'Плечи', equipment: 'Штанга' },
  { id: 'lateral-raise', name: 'Разведение гантелей в стороны', primaryMuscle: 'Плечи', equipment: 'Гантели' },
  { id: 'rear-delt-fly', name: 'Разведение на заднюю дельту', primaryMuscle: 'Плечи', equipment: 'Гантели' },
  { id: 'dumbbell-shoulder-press', name: 'Жим гантелей сидя', primaryMuscle: 'Плечи', equipment: 'Гантели' },
  { id: 'arnold-press', name: 'Жим Арнольда', primaryMuscle: 'Плечи', equipment: 'Гантели' },
  { id: 'face-pull', name: 'Тяга каната к лицу', primaryMuscle: 'Плечи', equipment: 'Блок' },
  { id: 'cable-lateral-raise', name: 'Отведение руки в сторону на блоке', primaryMuscle: 'Плечи', equipment: 'Блок' },
  { id: 'reverse-pec-deck', name: 'Обратное сведение рук в тренажёре', primaryMuscle: 'Плечи', equipment: 'Тренажёр' },
  { id: 'dumbbell-curl', name: 'Сгибание рук с гантелями', primaryMuscle: 'Бицепс', equipment: 'Гантели' },
  { id: 'hammer-curl', name: 'Молотковые сгибания', primaryMuscle: 'Бицепс', equipment: 'Гантели' },
  { id: 'barbell-curl', name: 'Сгибание рук со штангой', primaryMuscle: 'Бицепс', equipment: 'Штанга' },
  { id: 'preacher-curl', name: 'Сгибание рук на скамье Скотта', primaryMuscle: 'Бицепс', equipment: 'EZ-гриф' },
  { id: 'cable-curl', name: 'Сгибание рук на нижнем блоке', primaryMuscle: 'Бицепс', equipment: 'Блок' },
  { id: 'triceps-pushdown', name: 'Разгибание рук на блоке', primaryMuscle: 'Трицепс', equipment: 'Блок' },
  { id: 'overhead-triceps', name: 'Разгибание рук из-за головы', primaryMuscle: 'Трицепс', equipment: 'Гантель' },
  { id: 'dips', name: 'Отжимания на брусьях', primaryMuscle: 'Трицепс', equipment: 'Свой вес' },
  { id: 'skull-crusher', name: 'Французский жим лёжа', primaryMuscle: 'Трицепс', equipment: 'EZ-гриф' },
  { id: 'close-grip-bench', name: 'Жим лёжа узким хватом', primaryMuscle: 'Трицепс', equipment: 'Штанга' },
  { id: 'rope-overhead-extension', name: 'Разгибание рук с канатом из-за головы', primaryMuscle: 'Трицепс', equipment: 'Блок' },
  { id: 'squat', name: 'Приседания', primaryMuscle: 'Квадрицепс', equipment: 'Штанга' },
  { id: 'leg-press', name: 'Жим ногами', primaryMuscle: 'Квадрицепс', equipment: 'Тренажёр' },
  { id: 'leg-extension', name: 'Разгибание ног', primaryMuscle: 'Квадрицепс', equipment: 'Тренажёр' },
  { id: 'front-squat', name: 'Фронтальные приседания', primaryMuscle: 'Квадрицепс', equipment: 'Штанга' },
  { id: 'goblet-squat', name: 'Гоблет-приседания', primaryMuscle: 'Квадрицепс', equipment: 'Гантель' },
  { id: 'walking-lunge', name: 'Выпады в движении', primaryMuscle: 'Квадрицепс', equipment: 'Гантели' },
  { id: 'reverse-lunge', name: 'Обратные выпады', primaryMuscle: 'Квадрицепс', equipment: 'Гантели' },
  { id: 'hack-squat', name: 'Гакк-приседания', primaryMuscle: 'Квадрицепс', equipment: 'Тренажёр' },
  { id: 'hip-thrust', name: 'Ягодичный мост', primaryMuscle: 'Ягодицы', equipment: 'Штанга' },
  { id: 'bulgarian-squat', name: 'Болгарские выпады', primaryMuscle: 'Ягодицы', equipment: 'Гантели' },
  { id: 'cable-kickback', name: 'Отведение ноги назад на блоке', primaryMuscle: 'Ягодицы', equipment: 'Блок' },
  { id: 'hip-abduction', name: 'Разведение ног в тренажёре', primaryMuscle: 'Ягодицы', equipment: 'Тренажёр' },
  { id: 'step-up', name: 'Зашагивания на платформу', primaryMuscle: 'Ягодицы', equipment: 'Гантели' },
  { id: 'romanian-deadlift', name: 'Румынская тяга', primaryMuscle: 'Задняя поверхность бедра', equipment: 'Штанга' },
  { id: 'leg-curl', name: 'Сгибание ног', primaryMuscle: 'Задняя поверхность бедра', equipment: 'Тренажёр' },
  { id: 'dumbbell-romanian-deadlift', name: 'Румынская тяга с гантелями', primaryMuscle: 'Задняя поверхность бедра', equipment: 'Гантели' },
  { id: 'single-leg-romanian-deadlift', name: 'Румынская тяга на одной ноге', primaryMuscle: 'Задняя поверхность бедра', equipment: 'Гантель' },
  { id: 'nordic-curl', name: 'Нордические сгибания', primaryMuscle: 'Задняя поверхность бедра', equipment: 'Свой вес' },
  { id: 'calf-raise', name: 'Подъёмы на носки', primaryMuscle: 'Икры', equipment: 'Тренажёр' },
  { id: 'standing-calf-raise', name: 'Подъёмы на носки стоя', primaryMuscle: 'Икры', equipment: 'Тренажёр' },
  { id: 'seated-calf-raise', name: 'Подъёмы на носки сидя', primaryMuscle: 'Икры', equipment: 'Тренажёр' },
  { id: 'plank', name: 'Планка', primaryMuscle: 'Кор', equipment: 'Свой вес', measureType: 'duration' },
  { id: 'crunch', name: 'Скручивания', primaryMuscle: 'Кор', equipment: 'Свой вес' },
  { id: 'dead-bug', name: 'Мёртвый жук', primaryMuscle: 'Кор', equipment: 'Свой вес' },
  { id: 'side-plank', name: 'Боковая планка', primaryMuscle: 'Кор', equipment: 'Свой вес', measureType: 'duration' },
  { id: 'hanging-leg-raise', name: 'Подъём ног в висе', primaryMuscle: 'Кор', equipment: 'Свой вес' },
  { id: 'reverse-crunch', name: 'Обратные скручивания', primaryMuscle: 'Кор', equipment: 'Свой вес' },
  { id: 'russian-twist', name: 'Русские скручивания', primaryMuscle: 'Кор', equipment: 'Медбол' },
  { id: 'pallof-press', name: 'Жим Паллофа', primaryMuscle: 'Кор', equipment: 'Блок' },
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
    instructionText: exercise.instructionText,
    instructionVideo: exercise.instructionVideo ? { ...exercise.instructionVideo } : undefined,
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

function createDemoPlans(now: string): Workout[] {
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

function createDemoAssignments(now: string, plans: Workout[]): Assignment[] {
  const after = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return dateKey(date);
  };
  const assignment = (id: string, planId: string, studentId: string, days: number, scheduledTime: string): Assignment => {
    const workout = plans.find((item) => item.id === planId);
    if (!workout) throw new Error(`Не найден план демо-тренировки: ${planId}`);
    return {
      id,
      studentId,
      assignedAt: now,
      scheduledFor: after(days),
      scheduledTime,
      format: 'in-person',
      status: 'assigned',
      workoutSnapshot: cloneWorkout(workout),
    };
  };
  return [
    assignment('assignment-maria-legs', 'legs', 'maria', 0, '18:00'),
    assignment('assignment-artem-push-today', 'push-day', 'artem', 0, '19:30'),
    assignment('assignment-anton-push-1', 'push-day', 'anton', 2, '17:30'),
    assignment('assignment-maria-push-1', 'push-day', 'maria', 3, '10:00'),
    assignment('assignment-anton-legs-1', 'legs', 'anton', 8, '17:30'),
    assignment('assignment-maria-legs-2', 'legs', 'maria', 12, '18:00'),
  ];
}

const artemLegProgress = [
  { daysAgo: 29, squat: [60, 8], press: [100, 10], deadlift: [70, 6] },
  { daysAgo: 22, squat: [62.5, 8], press: [105, 10], deadlift: [72.5, 6] },
  { daysAgo: 15, squat: [65, 9], press: [110, 11], deadlift: [75, 7] },
  { daysAgo: 8, squat: [67.5, 9], press: [115, 11], deadlift: [77.5, 7] },
  { daysAgo: 1, squat: [70, 10], press: [120, 12], deadlift: [80, 8] },
] as const;

function demoDate(daysAgo: number, hour: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function createArtemLegHistory(plans: Workout[]): { assignments: Assignment[]; sessions: WorkoutSession[] } {
  const workout = plans.find((item) => item.id === 'legs');
  if (!workout) throw new Error('Не найден план демо-тренировки: legs');

  const assignments = artemLegProgress.map((progress, index): Assignment => {
    const date = demoDate(progress.daysAgo, 19);
    return {
      id: `assignment-artem-legs-history-${index + 1}`,
      studentId: 'artem',
      assignedAt: new Date(date.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      scheduledFor: dateKey(date),
      scheduledTime: '19:00',
      format: 'in-person',
      status: 'completed',
      workoutSnapshot: cloneWorkout(workout),
    };
  });

  const sessions = assignments.map((assignment, index): WorkoutSession => {
    const progress = artemLegProgress[index];
    const completedAt = demoDate(progress.daysAgo, 20).toISOString();
    const exerciseValues = new Map<string, readonly [number, number]>([
      ['squat', progress.squat],
      ['leg-press', progress.press],
      ['deadlift', progress.deadlift],
    ]);
    return {
      id: `session-artem-legs-history-${index + 1}`,
      assignmentId: assignment.id,
      studentId: 'artem',
      workoutSnapshot: cloneWorkout(workout),
      startedAt: demoDate(progress.daysAgo, 19).toISOString(),
      completedAt,
      recordedBy: 'student',
      mood: index < 2 ? 'good' : 'great',
      results: workout.exercises.flatMap((exercise) => {
        const [weight, reps] = exerciseValues.get(exercise.exerciseId) ?? [0, 1];
        return getExerciseSetPlans(exercise).map((_, setIndex) => ({
          exerciseId: exercise.id,
          setNumber: setIndex + 1,
          actualWeight: weight,
          actualReps: Math.max(1, reps - (setIndex === getExerciseSetPlans(exercise).length - 1 ? 1 : 0)),
          completed: true,
        }));
      }),
    };
  });

  return { assignments, sessions };
}

function createDemoSubscriptionEntries(sessions: WorkoutSession[]): SubscriptionEntry[] {
  const createdAt = new Date().toISOString();
  const payments: SubscriptionEntry[] = [
    {
      id: 'subscription-payment-artem-1',
      trainerId: TRAINER_ID,
      studentId: 'artem',
      kind: 'payment',
      lessonDelta: 8,
      amountRub: 11400,
      paymentMethod: 'cash',
      occurredAt: dateKey(demoDate(35, 12)),
      createdAt,
    },
    {
      id: 'subscription-payment-artem-2',
      trainerId: TRAINER_ID,
      studentId: 'artem',
      kind: 'payment',
      lessonDelta: 8,
      amountRub: 11400,
      paymentMethod: 'cash',
      occurredAt: dateKey(demoDate(16, 12)),
      createdAt,
    },
  ];
  const charges = sessions.map((session): SubscriptionEntry => ({
    id: `subscription-charge-${session.id}`,
    trainerId: TRAINER_ID,
    studentId: session.studentId,
    kind: 'session-charge',
    lessonDelta: -1,
    occurredAt: session.completedAt ?? session.startedAt,
    createdAt,
    sessionId: session.id,
    workoutName: session.workoutSnapshot.name,
  }));
  return [...payments, ...charges];
}

export function createInitialState(): DemoState {
  const now = new Date().toISOString();
  const plans = createDemoPlans(now);
  const artemHistory = createArtemLegHistory(plans);

  return {
    schemaVersion: 6,
    loggedIn: false,
    role: 'trainer',
    activeStudentId: 'artem',
    students: [
      { id: 'artem', name: 'Артем А.', status: 'active', color: 'lime', height: 182, weight: 86, gender: 'male', phone: '+7 916 482-17-35', contraindications: 'Иногда болит левое запястье при жимовых упражнениях.' },
      { id: 'maria', name: 'Мария А.', status: 'active', color: 'violet', height: 168, weight: 61, gender: 'female', phone: '+7 903 754-26-81', contraindications: '' },
      { id: 'anton', name: 'Антон К.', status: 'active', color: 'pink', height: 176, weight: 74, gender: 'male', phone: '+7 925 318-64-09', contraindications: 'Протрузия поясничного отдела. Избегать резкой осевой нагрузки.' },
    ],
    assignments: [...createDemoAssignments(now, plans), ...artemHistory.assignments],
    sessions: artemHistory.sessions,
    subscriptionEntries: createDemoSubscriptionEntries(artemHistory.sessions),
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

type PersistedAssignment = Omit<Assignment, 'scheduledFor' | 'scheduledTime' | 'format' | 'workoutSnapshot'> & {
  scheduledFor?: string;
  scheduledTime?: string;
  workoutSnapshot?: Workout;
  workoutId?: string;
  source?: string;
  format?: TrainingFormat;
};

type PersistedWorkoutSession = Omit<WorkoutSession, 'workoutSnapshot' | 'recordedBy'> & {
  workoutSnapshot?: Workout;
  workoutId?: string;
  recordedBy?: Role;
};

type PersistedDemoState = Omit<DemoState, 'schemaVersion' | 'assignments' | 'sessions' | 'subscriptionEntries'> & {
  schemaVersion?: number;
  assignments: PersistedAssignment[];
  sessions: PersistedWorkoutSession[];
  subscriptionEntries?: SubscriptionEntry[];
  workouts?: Workout[];
  studentWorkoutVersions?: unknown[];
};

function normalizeWorkout(workout: Workout): Workout {
  const localizedName = demoWorkoutNames[workout.id];
  const legacyName = legacyDemoWorkoutNames[workout.id];
  const normalized = cloneWorkout(workout);
  return localizedName && workout.name === legacyName ? { ...normalized, name: localizedName } : normalized;
}

export function migrateDemoState(state: PersistedDemoState): DemoState {
  if (!Array.isArray(state.students) || !Array.isArray(state.assignments) || !Array.isArray(state.sessions)) {
    throw new Error('Сохранённое состояние REPPY имеет неверный формат.');
  }

  const currentId = (id: string) => legacyStudentIds[id] ?? id;
  const savedPlans = Array.isArray(state.workouts) ? state.workouts.map(normalizeWorkout) : [];
  const seedPlans = createDemoPlans(new Date().toISOString());
  const legacyPlans = [
    ...savedPlans,
    ...seedPlans.filter((plan) => !savedPlans.some((saved) => saved.id === plan.id)),
  ];
  const migratedAssignments = state.assignments.map((assignment): Assignment => {
    const workoutId = assignment.workoutId;
    const currentAssignment = { ...assignment };
    delete currentAssignment.workoutId;
    delete currentAssignment.source;
    const fallback = legacyPlans.find((plan) => plan.id === workoutId) ?? {
      id: workoutId ?? `workout-${assignment.id}`,
      name: 'Тренировка',
      exercises: [],
      createdAt: assignment.assignedAt,
    };
    return {
      ...currentAssignment,
      studentId: currentId(assignment.studentId),
      scheduledFor: assignment.scheduledFor ?? dateKey(new Date(assignment.assignedAt)),
      scheduledTime: assignment.format === 'online' ? undefined : assignment.scheduledTime ?? '18:00',
      format: assignment.format ?? 'in-person',
      workoutSnapshot: normalizeWorkout(assignment.workoutSnapshot ?? fallback),
    };
  });
  const needsProgressDemo = (state.schemaVersion ?? 0) < 3;
  const artemHistory = createArtemLegHistory(legacyPlans);
  const assignments = needsProgressDemo
    ? [
        ...migratedAssignments.filter((assignment) => assignment.studentId !== 'artem'),
        ...createDemoAssignments(new Date().toISOString(), legacyPlans).filter((assignment) => assignment.studentId === 'artem'),
        ...artemHistory.assignments,
      ]
    : migratedAssignments;
  const savedSessions: PersistedWorkoutSession[] = needsProgressDemo
    ? [
        ...state.sessions.filter((session) => currentId(session.studentId) !== 'artem'),
        ...artemHistory.sessions,
      ]
    : state.sessions;
  const sessions = savedSessions.map((session): WorkoutSession => {
    const { workoutId, ...currentSession } = session;
    const assignmentWorkout = assignments.find((assignment) => assignment.id === session.assignmentId)?.workoutSnapshot;
    const fallback = legacyPlans.find((plan) => plan.id === workoutId) ?? {
      id: workoutId ?? `workout-${session.assignmentId}`,
      name: 'Тренировка',
      exercises: [],
      createdAt: session.startedAt,
    };
    return {
      ...currentSession,
      studentId: currentId(session.studentId),
      recordedBy: session.recordedBy ?? 'student',
      workoutSnapshot: normalizeWorkout(session.workoutSnapshot ?? assignmentWorkout ?? fallback),
    };
  });

  return {
    schemaVersion: 6,
    loggedIn: state.loggedIn,
    role: state.role,
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
    assignments,
    sessions,
    subscriptionEntries: (state.subscriptionEntries ?? []).map((entry) => ({
      ...entry,
      trainerId: entry.trainerId ?? TRAINER_ID,
      studentId: currentId(entry.studentId),
    })),
  };
}

export function cloneWorkout(workout: Workout): Workout {
  return {
    ...workout,
    exercises: workout.exercises.map(normalizeWorkoutExercise),
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
  scheduledTime: string | undefined,
  now = new Date().toISOString(),
): Assignment {
  return {
    id: makeId('assignment'),
    studentId: source.studentId,
    assignedAt: now,
    scheduledFor,
    scheduledTime,
    format: source.format ?? 'in-person',
    status: 'assigned',
    workoutSnapshot: {
      ...cloneWorkout(sourceWorkout),
      id: makeId('workout'),
      exercises: sourceWorkout.exercises.map((exercise) => normalizeWorkoutExercise({ ...exercise, id: makeId('exercise') })),
      updatedAt: now,
    },
    repeatedFromAssignmentId: source.id,
  };
}

export function findAssignmentWorkout(_data: DemoState, assignment: Assignment) {
  return assignment.workoutSnapshot;
}

export function findSessionWorkout(data: DemoState, session: WorkoutSession) {
  if (session.workoutSnapshot) return session.workoutSnapshot;
  const assignment = data.assignments.find((item) => item.id === session.assignmentId);
  return assignment && findAssignmentWorkout(data, assignment);
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
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  }).format(date).replace(/\s*г\.$/, '');
}

export function formatCalendarDay(value?: string) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (value === dateKey()) return 'Сегодня';
  const today = new Date();
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  }).format(date).replace(/\s*г\.$/, '');
}
