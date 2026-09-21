import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { Role } from './reppy-data';
import { authRedirectUrl, getSupabaseClient, supabaseConfig } from './supabase-client';

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

  return {
    enabled: Boolean(supabaseConfig),
    status,
    session,
    profile,
    error,
    recovery,
    signIn,
    signUpStudent,
    sendPasswordReset,
    updatePassword,
    signOut,
    previewInvitation,
    acceptInvitation,
    createTelegramLink,
    refreshProfile: () => loadProfile(session),
  };
}
