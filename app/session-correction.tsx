import { useState } from 'react';
import ActiveWorkout from './active-workout';
import { type DemoState, type WorkoutSession, updateSessionWorkout } from './reppy-data';
import type { ReppyCommand } from './reppy-commands';
import { go, useUnsavedNavigationGuard } from './navigation';

export default function SessionCorrection({ data, session, dispatch }: { data: DemoState; session: WorkoutSession; dispatch: (command: ReppyCommand) => void }) {
  const [draft, setDraft] = useState(() => structuredClone(session));
  const back = `/trainer/sessions/${session.id}`;
  const { allowNextNavigation, discardPrompt } = useUnsavedNavigationGuard(JSON.stringify(draft) !== JSON.stringify(session), () => undefined);
  const assignment = data.assignments.find((item) => item.id === session.assignmentId);
  return <>
    <ActiveWorkout editingHistory workout={draft.workoutSnapshot} session={draft} student={data.students.find((item) => item.id === session.studentId)} scheduledFor={assignment?.scheduledFor ?? session.startedAt.slice(0, 10)} scheduledTime={assignment?.scheduledTime} format={assignment?.format ?? 'in-person'} backPath={back}
      onStart={() => undefined} onUpdate={(_, results) => setDraft((value) => ({ ...value, results }))}
      onWorkoutUpdate={(_, workout) => setDraft((value) => updateSessionWorkout(value, workout))}
      onFinish={() => { dispatch({ type: 'session.progress', sessionId: session.id, workoutSnapshot: draft.workoutSnapshot, results: draft.results }); allowNextNavigation(); go(back, true); }} />
    {discardPrompt}
  </>;
}
