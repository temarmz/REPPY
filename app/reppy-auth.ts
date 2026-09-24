import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { Role } from './reppy-data';
import { authRedirectUrl, getSupabaseClient, supabaseConfig } from './supabase-client';
import {
  acceptInvitationWithTelegram,
  completeTelegramTrainerRegistration,
  completeTelegramRedirect,
  telegramSignIn,
  type PendingTelegramRegistration,
} from './telegram-login';

export type AuthProfile = {
  id: string;
  role: Role;
  displayName: string;
};

export type InvitationPreview = {
  studentName: string;
  trainerName: string;
  expiresAt: string;
};

type TelegramLinkCode = {
  code: string;
  expires_at: string;
};

export type TelegramConnection = {
  connected: boolean;
  username: string | null;
  firstName: string | null;
  linkedAt: string | null;
};

export type TrainerRegistrationStatus = {
  telegramVerified: boolean;
  activated: boolean;
  expiresAt: string;
};

type AuthStatus = 'disabled' | 'loading' | 'anonymous' | 'authenticated' | 'profile-missing' | 'error';

export function useReppyAuth() {
  const client = useMemo(() => getSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [status, setStatus] = useState<AuthStatus>(client ? 'loading' : 'disabled');
  const [error, setError] = useState<string>('');
  const [recovery, setRecovery] = useState(false);

  const loadProfile = useCallback(async (nextSession: Session | null) => {
    if (!client || !nextSession) {
      setProfile(null);
      setStatus(client ? 'anonymous' : 'disabled');
      return;
    }

    const { data, error: profileError } = await client
      .from('profiles')
      .select('id, role, display_name')
      .eq('id', nextSession.user.id)
      .maybeSingle();

    if (profileError) {
      setError(profileError.message);
      setStatus('error');
      return;
    }
    if (!data) {
      setProfile(null);
      setStatus('profile-missing');
      return;
    }

    setProfile({ id: data.id, role: data.role as Role, displayName: data.display_name });
    setError('');
    setStatus('authenticated');
  }, [client]);

  useEffect(() => {
    if (!client) return;
    let active = true;

    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setError(sessionError.message);
        setStatus('error');
        return;
      }
      setSession(data.session);
      void loadProfile(data.session);
    });

    const { data: listener } = client.auth.onAuthStateChange((event: AuthChangeEvent, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      window.setTimeout(() => {
        if (active) void loadProfile(nextSession);
      }, 0);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [client, loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!client) return;
    setError('');
    const { error: signInError } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) throw new Error(signInError.message);
  }, [client]);

  const signInWithTelegram = useCallback(async () => {
    if (!client) throw new Error('Supabase не настроен.');
    setError('');
    return telegramSignIn(client);
  }, [client]);

  const finishTelegramTrainerRegistration = useCallback(async (pending: PendingTelegramRegistration, displayName: string) => {
    if (!client) throw new Error('Supabase не настроен.');
    setError('');
    await completeTelegramTrainerRegistration(client, pending, displayName);
  }, [client]);

  const acceptStudentInvitationWithTelegram = useCallback(async (token: string) => {
    if (!client) throw new Error('Supabase не настроен.');
    setError('');
    await acceptInvitationWithTelegram(client, token);
    const { data } = await client.auth.getSession();
    await loadProfile(data.session);
  }, [client, loadProfile]);

  const resumeTelegramRedirect = useCallback(async () => {
    if (!client) throw new Error('Supabase не настроен.');
    const result = await completeTelegramRedirect(client);
    const { data } = await client.auth.getSession();
    await loadProfile(data.session);
    return result;
  }, [client, loadProfile]);

  const signUpStudent = useCallback(async (email: string, password: string, invitationToken: string) => {
    if (!client) return { confirmationRequired: false };
    setError('');
    const { data, error: signUpError } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: authRedirectUrl(`/invite/${encodeURIComponent(invitationToken)}`) },
    });
    if (signUpError) throw new Error(signUpError.message);
    return { confirmationRequired: !data.session };
  }, [client]);

  const startTrainerRegistration = useCallback(async (inviteCode: string, displayName: string, email: string) => {
    if (!client) throw new Error('Supabase не настроен.');
    const { data, error: registrationError } = await client.rpc('start_trainer_registration', {
      p_invite_code: inviteCode,
      p_display_name: displayName,
      p_email: email.trim(),
    });
    if (registrationError) throw new Error(registrationError.message);
    const registration = data as { token?: string; expiresAt?: string } | null;
    if (!registration?.token) throw new Error('Не удалось начать регистрацию тренера.');
    return { token: registration.token, expiresAt: registration.expiresAt ?? '' };
  }, [client]);

  const getTrainerRegistrationStatus = useCallback(async (token: string): Promise<TrainerRegistrationStatus> => {
    if (!client) throw new Error('Supabase не настроен.');
    const { data, error: statusError } = await client.rpc('get_trainer_registration_status', { p_token: token });
    if (statusError) throw new Error(statusError.message);
    const status = data as Partial<TrainerRegistrationStatus> | null;
    if (!status || typeof status.telegramVerified !== 'boolean' || typeof status.activated !== 'boolean') {
      throw new Error('Не удалось проверить регистрацию тренера.');
    }
    return {
      telegramVerified: status.telegramVerified,
      activated: status.activated,
      expiresAt: status.expiresAt ?? '',
    };
  }, [client]);

  const restartTrainerRegistration = useCallback(async (token: string) => {
    if (!client) throw new Error('Supabase не настроен.');
    const { data, error: restartError } = await client.rpc('restart_trainer_registration', { p_token: token });
    if (restartError) throw new Error(restartError.message);
    const registration = data as { token?: string; expiresAt?: string } | null;
    if (!registration?.token) throw new Error('Не удалось обновить ссылку Telegram.');
    return { token: registration.token, expiresAt: registration.expiresAt ?? '' };
  }, [client]);

  const signUpTrainer = useCallback(async (email: string, password: string, inviteCode: string, registrationToken: string) => {
    if (!client) return { confirmationRequired: false };
    const { data, error: signUpError } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: authRedirectUrl(`/trainer/register/${encodeURIComponent(inviteCode)}/${encodeURIComponent(registrationToken)}`) },
    });
    if (signUpError) throw new Error(signUpError.message);
    return { confirmationRequired: !data.session };
  }, [client]);

  const activateTrainerRegistration = useCallback(async (token: string) => {
    if (!client) throw new Error('Supabase не настроен.');
    const { error: activationError } = await client.rpc('activate_trainer_registration', { p_token: token });
    if (activationError) throw new Error(activationError.message);
    const { data } = await client.auth.getSession();
    await loadProfile(data.session);
  }, [client, loadProfile]);

  const sendPasswordReset = useCallback(async (email: string) => {
    if (!client) return;
    const { error: resetError } = await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authRedirectUrl('/auth/recovery'),
    });
    if (resetError) throw new Error(resetError.message);
  }, [client]);

  const updatePassword = useCallback(async (password: string) => {
    if (!client) return;
    const { error: updateError } = await client.auth.updateUser({ password });
    if (updateError) throw new Error(updateError.message);
    setRecovery(false);
  }, [client]);

  const signOut = useCallback(async () => {
    if (!client) return;
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) throw new Error(signOutError.message);
    setProfile(null);
    setSession(null);
    setStatus('anonymous');
  }, [client]);

  const previewInvitation = useCallback(async (token: string): Promise<InvitationPreview> => {
    if (!client) throw new Error('Supabase не настроен.');
    const { data, error: previewError } = await client.rpc('get_student_invitation_preview', { p_token: token });
    if (previewError) throw new Error(previewError.message);
    return data as InvitationPreview;
  }, [client]);

  const acceptInvitation = useCallback(async (token: string) => {
    if (!client) throw new Error('Supabase не настроен.');
    const { error: acceptError } = await client.rpc('accept_student_invitation', { p_token: token });
    if (acceptError) throw new Error(acceptError.message);
    const { data } = await client.auth.getSession();
    await loadProfile(data.session);
  }, [client, loadProfile]);

  const createTelegramLink = useCallback(async () => {
    if (!client) throw new Error('Supabase не настроен.');
    const { data, error: linkError } = await client.rpc('create_telegram_link_code');
    if (linkError) throw new Error(linkError.message);
    const link = (data as TelegramLinkCode[] | null)?.[0];
    if (!link?.code) throw new Error('Не удалось создать ссылку для Telegram.');
    return `https://t.me/reppyappbot?start=${encodeURIComponent(link.code)}`;
  }, [client]);

  const getTelegramConnection = useCallback(async (): Promise<TelegramConnection> => {
    if (!client) throw new Error('Supabase не настроен.');
    const { data, error: connectionError } = await client.rpc('get_telegram_connection');
    if (connectionError) throw new Error(connectionError.message);
    const connection = (data as Array<{
      connected: boolean;
      username: string | null;
      first_name: string | null;
      linked_at: string | null;
    }> | null)?.[0];
    return {
      connected: connection?.connected === true,
      username: connection?.username ?? null,
      firstName: connection?.first_name ?? null,
      linkedAt: connection?.linked_at ?? null,
    };
  }, [client]);

  return {
    enabled: Boolean(supabaseConfig),
    status,
    session,
    profile,
    error,
    recovery,
    signIn,
    signInWithTelegram,
    finishTelegramTrainerRegistration,
    acceptStudentInvitationWithTelegram,
    resumeTelegramRedirect,
    signUpStudent,
    startTrainerRegistration,
    getTrainerRegistrationStatus,
    restartTrainerRegistration,
    signUpTrainer,
    activateTrainerRegistration,
    sendPasswordReset,
    updatePassword,
    signOut,
    previewInvitation,
    acceptInvitation,
    createTelegramLink,
    getTelegramConnection,
    refreshProfile: () => loadProfile(session),
  };
}
