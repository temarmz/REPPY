import { createRoot } from 'react-dom/client';
import TrainerRoutes from '../../app/trainer-routes';
import { createInitialState, createWorkoutSession } from '../../app/reppy-data';

const root = createRoot(document.getElementById('root')!);
const data = createInitialState();
const assignment = data.assignments.find(item => item.id === 'assignment-artem-push-today')!;
const session = createWorkoutSession(assignment, assignment.workoutSnapshot, 'student');
data.sessions = [session];
const render = () => root.render(<TrainerRoutes path={`/trainer/workout/${assignment.id}`} data={{ ...data }}
  draftIdentity="remote-completion-qa" dispatch={() => {}} createStudentInvitation={null} StudentProfileComponent={() => null} />);
declare global { interface Window { completeRemoteWorkout: () => void } }
window.completeRemoteWorkout = () => {
  session.completedAt = new Date().toISOString();
  session.results = session.results.map(result => ({ ...result, completed: true }));
  assignment.status = 'completed';
  render();
};
render();
