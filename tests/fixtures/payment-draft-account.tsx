import { createRoot } from 'react-dom/client';
import TrainerRoutes from '../../app/trainer-routes';
import { createInitialState } from '../../app/reppy-data';
import type { ReppyCommand } from '../../app/reppy-commands';

const root = createRoot(document.getElementById('root')!);
const student = { id: 'shared-student', name: 'Общий ученик', status: 'active' as const, color: 'lime' as const };
const data = { ...createInitialState(), students: [student], subscriptionEntries: [] };
const commands: { account: string; command: ReppyCommand }[] = [];
const render = (account: string) => root.render(<TrainerRoutes
  path={`/trainer/clients/${student.id}/subscription/new`} data={data} draftIdentity={account}
  dispatch={command => commands.push({ account, command })} createStudentInvitation={null} StudentProfileComponent={() => null} />);
declare global { interface Window { paymentDraftQa: { select: (account: string) => void; commands: typeof commands } } }
window.paymentDraftQa = { select: render, commands };
render('trainer-a');
