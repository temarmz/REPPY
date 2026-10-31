import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createInitialState, createWorkoutSession, updateSessionWorkout, workoutFromSession, exerciseLibrary, exerciseMuscleGroups } from '../../app/reppy-data.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const check = process.argv.includes('--check');
const css = await readFile(path.join(root, 'app/ui/tokens.css'), 'utf8');
const declarations = (source) => Object.fromEntries([...source.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
const dark = declarations(css.split('/* Semantic light theme. */')[0]);
const light = { ...dark, ...declarations(css.split('/* Semantic light theme. */')[1]) };
function resolve(token, values, depth = 0) {
  if (depth > 20 || !values[token]) throw new Error(`Cannot resolve ${token}`);
  return values[token].replace(/var\((--[\w-]+)\)/g, (_, next) => resolve(next, values, depth + 1));
}
function color(token, values) {
  const value = resolve(token, values);
  const channels = value.replace(/rgba?\(|\)/g, '').split(',').map(Number);
  if (channels.length < 3 || channels.some((channel) => !Number.isFinite(channel))) throw new Error(`Not a color: ${token} ${value}`);
  return ['0x' + channels.slice(0, 3).map((channel) => channel.toString(16).padStart(2, '0')).join(''), channels[3] ?? 1];
}
function dimension(token) {
  const value = resolve(token, dark).replace(/calc|px/g, '');
  if (!/^[\d\s.*()+/-]+$/.test(value)) throw new Error(`Not a dimension: ${token}`);
  return Function(`"use strict"; return (${value})`)();
}
const colors = { background: '--app-bg', surface: '--surface', field: '--field-bg', text: '--text-primary', secondary: '--text-secondary', muted: '--muted', lime: '--lime', error: '--error-color', warning: '--badge-warning-text', button: '--button-bg', outline: '--field-outline' };
const dimensions = { control: '--control-height-large', compact: '--control-height-medium', small: '--control-height-small', radius: '--control-radius', cardRadius: '--card-radius', modalRadius: '--modal-radius', cardGap: '--card-list-gap', exerciseTitle: '--exercise-title-font-size', pageInset: '--space-20' };
dimensions.iconSize = '--size-20';
// Native text retains iOS readability and Dynamic Type; geometry comes from web.
Object.assign(dimensions, { space4: '--space-4', space6: '--space-6', space8: '--space-8', space12: '--space-12', space16: '--space-16', controlPadding: '--control-padding', bodyFont: '--font-size-17', captionFont: '--font-size-15', titleFont: '--font-size-34', numberFont: '--font-size-34', setNumberFont: '--font-size-20', focusWidth: '--focus-ring-width' });
const generated = `// Generated from app/ui/tokens.css by ios/scripts/sync-web-contract.mjs.\n// Edit the web tokens, then run npm run ios:sync.\nimport SwiftUI\n\nenum ReppyTheme {\n    static func adaptive(_ dark: UInt32, _ light: UInt32, darkAlpha: CGFloat = 1, lightAlpha: CGFloat = 1) -> Color {\n        Color(uiColor: UIColor { traits in\n            let hex = traits.userInterfaceStyle == .dark ? dark : light\n            return UIColor(red: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: traits.userInterfaceStyle == .dark ? darkAlpha : lightAlpha)\n        })\n    }\n${Object.entries(colors).map(([name, token]) => {
  const [a, alpha] = color(token, dark), [b, beta] = color(token, light);
  return `    static let ${name} = adaptive(${a}, ${b}, darkAlpha: ${alpha}, lightAlpha: ${beta})`;
}).join('\n')}\n    static let selectedText = Color(red: 7.0 / 255, green: 9.0 / 255, blue: 8.0 / 255)\n}\nenum ReppyMetrics {\n${Object.entries(dimensions).map(([name, token]) => `    static let ${name}: CGFloat = ${dimension(token)}`).join('\n')}\n}\n`;
async function output(relative, data) {
  const file = path.join(root, relative);
  if (check) {
    if (await readFile(file, 'utf8').catch(() => '') !== data) throw new Error(`${relative} is stale; run npm run ios:sync`);
  } else { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, data); }
}
await output('ios/REPPY/UI/Tokens.generated.swift', generated);

// Freeze the same web seed for reproducible cross-client fixtures. The app moves
// its calendar relative to demoDay on launch, so the demo never becomes stale.
const RealDate = Date;
const anchor = '2026-10-29T09:00:00.000Z';
process.env.TZ = 'Europe/Moscow';
globalThis.Date = class extends RealDate {
  constructor(...args) { if (args.length) super(...args); else super(anchor); }
  static now() { return new RealDate(anchor).getTime(); }
};
const seed = createInitialState();
const uuid = (key) => { const hex = createHash('sha256').update(key).digest('hex'); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`; };
const definitionID = (id) => uuid(`definition:${id}`);
const workout = (value) => ({ ...value, exercises: value.exercises.map((exercise) => ({ ...exercise, exerciseId: definitionID(exercise.exerciseId) })) });
const relationshipID = (student) => uuid(`relationship:${student}`);
const fixture = {
  demoDay: '2026-10-29',
  students: seed.students.map((student, index) => ({ id: student.id, account_id: index === 0 ? 'student-demo' : null, name: student.name, phone: student.phone ?? null,
    height_cm: student.height ?? null, weight_kg: student.weight ?? null, gender: student.gender ?? null, contraindications: student.contraindications ?? null, updated_at: anchor })),
  relationships: seed.students.map((student) => ({ id: relationshipID(student.id), trainer_id: 'trainer-demo', student_id: student.id, status: student.status, color: student.color, updated_at: anchor })),
  assignments: seed.assignments.map((assignment) => ({ id: assignment.id, relationship_id: relationshipID(assignment.studentId), assigned_at: assignment.assignedAt,
    scheduled_for: assignment.scheduledFor, scheduled_time: assignment.scheduledTime ?? null, format: assignment.format, status: assignment.status, workout_snapshot: workout(assignment.workoutSnapshot),
    repeated_from_assignment_id: assignment.repeatedFromAssignmentId ?? null, reschedule_scheduled_for: assignment.rescheduleRequest?.scheduledFor ?? null,
    reschedule_scheduled_time: assignment.rescheduleRequest?.scheduledTime ?? null, reschedule_requested_at: assignment.rescheduleRequest?.requestedAt ?? null, revision: 1 })),
  sessions: seed.sessions.map((session) => ({ id: session.id, assignment_id: session.assignmentId, workout_snapshot: workout(session.workoutSnapshot), recorded_by_role: session.recordedBy,
    started_at: session.startedAt, completed_at: session.completedAt ?? null, mood: session.mood ?? null, comment: session.comment ?? null, charge_status: session.subscriptionChargeStatus ?? null, revision: 1 })),
  results: seed.sessions.flatMap((session) => session.results.map((result) => ({ session_id: session.id, exercise_instance_id: result.exerciseId, set_number: result.setNumber,
    actual_reps: result.actualReps, actual_weight: result.actualWeight, completed: result.completed }))),
  subscriptions: seed.subscriptionEntries.map((entry) => ({ id: entry.id, relationship_id: relationshipID(entry.studentId), kind: entry.kind, lesson_delta: entry.lessonDelta,
    occurred_at: entry.occurredAt, created_at: entry.createdAt, updated_at: entry.updatedAt ?? null, amount_rub: entry.amountRub ?? null, payment_method: entry.paymentMethod ?? null,
    comment: entry.comment ?? null, session_id: entry.sessionId ?? null, workout_name: entry.workoutName ?? null, revision: 1 })),
  definitions: [...exerciseLibrary, ...seed.customExercises].map((definition) => ({ id: definitionID(definition.id), slug: definition.id, owner_id: null, name: definition.name,
    primary_muscle: definition.primaryMuscle ?? 'Другое', muscle_groups: exerciseMuscleGroups(definition), equipment: definition.equipment,
    load_mode: definition.loadMode ?? (definition.equipment === 'Свой вес' ? 'bodyweight' : 'external'), measure_type: definition.measureType ?? 'reps', archived_at: null })),
};
await output('ios/REPPY/Resources/DemoData.json', JSON.stringify(fixture, null, 2) + '\n');
await output('ios/REPPYTests/Fixtures/WebContract.json', JSON.stringify(fixture, null, 2) + '\n');
// Expected transitions come from the live web reducer, rather than a second
// handwritten set of expected values in the Swift tests.
const toResults = (session) => session.results.map((result) => ({ session_id: session.id, exercise_instance_id: result.exerciseId,
  set_number: result.setNumber, actual_reps: result.actualReps, actual_weight: result.actualWeight, completed: result.completed }));
function executionCase(name, modify) {
  const assignment = structuredClone(seed.assignments[0]);
  const session = createWorkoutSession(assignment, assignment.workoutSnapshot, 'trainer', anchor);
  session.id = 'contract-session';
  const proposed = structuredClone(session.workoutSnapshot);
  modify(session, proposed);
  const expected = updateSessionWorkout(session, proposed);
  return { name, sessionID: session.id, previous: workout(session.workoutSnapshot), proposed: workout(proposed),
    results: toResults(session), expectedWorkout: workout(expected.workoutSnapshot), expectedResults: toResults(expected),
    expectedRepeatPlan: workout(workoutFromSession(session)) };
}
const transitions = [
  executionCase('remove completed exercise', (session, proposed) => { session.results[0].completed = true; session.results[0].actualWeight = 75.25; proposed.exercises.shift(); }),
  executionCase('remove completed last set', (session, proposed) => { session.results[3].completed = true; proposed.exercises[0].plannedSets = []; }),
  executionCase('remove unfinished exercise', (_, proposed) => { proposed.exercises.shift(); }),
  executionCase('follow changed untouched defaults', (_, proposed) => { proposed.exercises[0].plannedSets[0] = { targetReps: 12, targetWeight: 80 }; }),
  executionCase('retain edited facts after plan change', (session, proposed) => { session.results[0].actualReps = 15; session.results[0].actualWeight = 85; proposed.exercises[0].plannedSets[0] = { targetReps: 12, targetWeight: 80 }; }),
  executionCase('repeat completed facts and keep skipped plan', (session) => { session.results[0].completed = true; session.results[0].actualReps = 6; session.results[0].actualWeight = 75.25; session.results[1].actualWeight = 99; }),
  executionCase('add a set', (_, proposed) => { proposed.exercises[0].plannedSets.push({ targetReps: 10, targetWeight: 77.5 }); }),
  executionCase('empty active plan retains completed work', (session, proposed) => { session.results[0].completed = true; proposed.exercises = []; }),
];
globalThis.Date = RealDate;
await output('ios/REPPYTests/Fixtures/ExecutionContract.json', JSON.stringify(transitions, null, 2) + '\n');
for (const [source, target] of [
  ['public/icon-1024.png', 'ios/REPPY/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png'],
  ['public/logo-wordmark.png', 'ios/REPPY/Resources/Assets.xcassets/Wordmark.imageset/Wordmark.png'],
]) {
  const bytes = await readFile(path.join(root, source));
  if (check) {
    const current = await readFile(path.join(root, target)).catch(() => Buffer.alloc(0));
    if (!current.equals(bytes)) throw new Error(`${target} is stale; run npm run ios:sync`);
  } else { await writeFile(path.join(root, target), bytes); }
}
console.log(check ? 'iOS tokens and web contract are current.' : 'Updated iOS tokens and the shared web fixture.');
