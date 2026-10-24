import { createRoot } from 'react-dom/client';
import { InviteStudent } from '../../app/trainer-client-screens';

type Account = 'trainer-a' | 'trainer-b' | 'demo';
const root = createRoot(document.getElementById('root')!);
const created: Array<{ account: Account; name: string }> = [];

declare global {
  interface Window {
    inviteDraftQa: { selectAccount: (account: Account) => void; created: typeof created; fail: boolean };
  }
}

window.inviteDraftQa = {
  created,
  fail: false,
  selectAccount(account) {
    root.render(<InviteStudent key={account} draftIdentity={account} onCreate={() => { throw new Error('Unexpected demo write'); }}
      onInvite={async (name) => {
        if (window.inviteDraftQa.fail) throw new Error('Сеть недоступна');
        created.push({ account, name });
        return { student: { id: `${account}-student`, name, status: 'invited', color: 'orange' }, token: 'isolated-token', expiresAt: '2030-01-01T00:00:00Z' };
      }} />);
  },
};
window.inviteDraftQa.selectAccount('trainer-a');
