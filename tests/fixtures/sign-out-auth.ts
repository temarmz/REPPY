import { useCallback, useState } from 'react';
import type { TelegramConnection } from '../../app/reppy-auth';

export const signOutFixture: { calls: number; fail: () => void; succeed: () => void } = {
  calls: 0,
  fail: () => { throw new Error('No pending logout'); },
  succeed: () => { throw new Error('No pending logout'); },
};

export function useReppyAuth() {
  const [anonymous, setAnonymous] = useState(false);
  const params = new URLSearchParams(location.search);
  const missing = params.get('account') === 'missing';
  const role = params.get('account') === 'student' ? 'student' as const : 'trainer' as const;
  const signOut = useCallback(() => {
    signOutFixture.calls++;
    return new Promise<void>((resolve, reject) => {
      signOutFixture.fail = () => reject(new Error('Не удалось выйти: соединение прервано.'));
      signOutFixture.succeed = () => { setAnonymous(true); resolve(); };
    });
  }, []);
  const getTelegramConnection = useCallback(async (): Promise<TelegramConnection> => ({
    connected: true, username: 'isolated_qa', firstName: 'QA', linkedAt: null,
  }), []);
  return {
    enabled: true, status: anonymous ? 'anonymous' : missing ? 'profile-missing' : 'authenticated',
    profile: anonymous || missing ? null : { id: `isolated-${role}`, role, displayName: 'Изолированный QA аккаунт' },
    session: anonymous ? null : { user: { email: '' } }, error: '', signOut, getTelegramConnection,
    signInWithTelegram: async () => null, finishTelegramTrainerRegistration: async () => {},
    resumeTelegramRedirect: async () => null, previewInvitation: async () => ({ studentName: '', trainerName: '', expiresAt: '' }),
    acceptStudentInvitationWithTelegram: async () => {}, acceptInvitation: async () => {}, createTelegramLink: async () => '',
  };
}
