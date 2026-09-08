import type { SetResult, WorkoutExercise, WorkoutSession } from './reppy-data';

export type ProgressPeriod = '30' | '90' | 'all';
export type ProgressBlock = { exercise: WorkoutExercise; sets: { number: number; result?: SetResult; valid: boolean }[] };
export type ProgressEntry = { session: WorkoutSession; timestamp: number; blocks: ProgressBlock[]; completed: number; total: number };
export type ProgressGroup = { key: string; exercise: WorkoutExercise; entries: ProgressEntry[] };
export const progressKey = (exercise: WorkoutExercise) => JSON.stringify([exercise.exerciseId, exercise.loadMode, exercise.measureType]);
export function validProgressResult(result: SetResult | undefined, exercise: WorkoutExercise): boolean {
  return !!result?.completed && Number.isFinite(result.actualReps) && result.actualReps > 0
    && (exercise.loadMode === 'bodyweight' || (Number.isFinite(result.actualWeight) && result.actualWeight >= 0));
}
export function collectExerciseProgress(sessions: WorkoutSession[], studentId: string): ProgressGroup[] {
  const groups = new Map<string, ProgressGroup>();
  for (const session of sessions) {
    const timestamp = Date.parse(session.completedAt ?? '');
    if (session.studentId !== studentId || !Number.isFinite(timestamp)) continue;
    const entries = new Map<string, ProgressEntry>();
    for (const exercise of session.workoutSnapshot.exercises) {
      const key = progressKey(exercise);
      const sets = exercise.plannedSets.map((_, index) => {
        const result = session.results.find((item) => item.exerciseId === exercise.id && item.setNumber === index + 1);
        return { number: index + 1, result, valid: validProgressResult(result, exercise) };
      });
      const entry = entries.get(key) ?? { session, timestamp, blocks: [], completed: 0, total: 0 };
      entry.blocks.push({ exercise, sets });
      entry.completed += sets.filter((set) => set.valid).length;
      entry.total += sets.length;
      entries.set(key, entry);
      if (!groups.has(key)) groups.set(key, { key, exercise, entries: [] });
    }
    for (const [key, entry] of entries) {
      if (entry.completed) groups.get(key)!.entries.push(entry);
    }
  }
  return [...groups.values()].filter((group) => group.entries.length).map((group) => {
    group.entries.sort((a, b) => b.timestamp - a.timestamp || b.session.id.localeCompare(a.session.id));
    group.exercise = group.entries[0].blocks[0].exercise;
    return group;
  }).sort((a, b) => b.entries[0].timestamp - a.entries[0].timestamp || a.exercise.name.localeCompare(b.exercise.name, 'ru'));
}
export function filterProgressPeriod(entries: ProgressEntry[], period: ProgressPeriod, now = new Date()): ProgressEntry[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period !== 'all') start.setDate(start.getDate() - Number(period) + 1);
  return entries.filter((entry) => entry.timestamp <= now.getTime() && (period === 'all' || entry.timestamp >= start.getTime()));
}
export function progressMetric(entry: ProgressEntry, metric: 'max' | 'sum'): number {
  const values = entry.blocks.flatMap((block) => block.sets.filter((set) => set.valid).map((set) =>
    metric === 'max' && block.exercise.loadMode === 'external' && block.exercise.measureType === 'reps'
      ? set.result!.actualWeight : set.result!.actualReps));
  return metric === 'sum' ? values.reduce((sum, value) => sum + value, 0) : Math.max(0, ...values);
}
export const progressNumber = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
export function progressSetLabel(exercise: WorkoutExercise, result: Pick<SetResult, 'actualReps' | 'actualWeight'>): string {
  const amount = `${progressNumber(result.actualReps)} ${exercise.measureType === 'duration' ? 'сек.' : 'повт.'}`;
  return exercise.loadMode === 'external' ? `${progressNumber(result.actualWeight)} кг × ${amount}` : amount;
}
export function progressHref(studentId: string, exercise?: WorkoutExercise): string {
  const base = `/trainer/clients/${encodeURIComponent(studentId)}`;
  if (!exercise) return base;
  const params = new URLSearchParams({ loadMode: exercise.loadMode, measureType: exercise.measureType });
  return `${base}/progress/${encodeURIComponent(exercise.exerciseId)}?${params}`;
}

/** Compare actual sets, never combine the weight of one set with reps of another. */
export function bestProgressSet(entry: ProgressEntry): SetResult | undefined {
  const exercise = entry.blocks[0].exercise;
  return entry.blocks.flatMap((block) => block.sets.filter((set) => set.valid).map((set) => set.result!))
    .sort((a, b) => exercise.measureType === 'reps' && exercise.loadMode === 'external'
      ? b.actualWeight - a.actualWeight || b.actualReps - a.actualReps || a.setNumber - b.setNumber
      : b.actualReps - a.actualReps || (exercise.loadMode === 'external' ? b.actualWeight - a.actualWeight : 0) || a.setNumber - b.setNumber)[0];
}

export function compareProgress(entries: ProgressEntry[]) {
  const latest = entries[0] && bestProgressSet(entries[0]);
  const previous = entries[1] && bestProgressSet(entries[1]);
  if (!latest) return undefined;
  if (!previous) return { latest, previous, label: '', trend: 'none' as const };
  const exercise = entries[0].blocks[0].exercise;
  const weight = exercise.loadMode === 'external' ? Number((latest.actualWeight - previous.actualWeight).toFixed(3)) : 0;
  const amount = Number((latest.actualReps - previous.actualReps).toFixed(3));
  const signed = (value: number) => `${value > 0 ? '+' : '−'}${progressNumber(Math.abs(value))}`;
  const unit = exercise.measureType === 'duration' ? 'сек.' : 'повт.';
  const label = !weight && !amount ? 'Без изменений'
    : weight && !amount ? `${signed(weight)} кг при ${exercise.measureType === 'duration' ? 'том же времени' : 'тех же повторах'}`
    : [weight ? `${signed(weight)} кг` : '', amount ? `${signed(amount)} ${unit}` : ''].filter(Boolean).join(', ');
  const trend = !weight && !amount ? 'flat' : weight >= 0 && amount >= 0 ? 'up' : weight <= 0 && amount <= 0 ? 'down' : 'mixed';
  return { latest, previous, label, trend };
}
