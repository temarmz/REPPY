import { useEffect, useState, type FormEvent } from 'react';
import EmptyState from './empty-state';
import type { AuthProfile, InvitationPreview } from './reppy-auth';
import type { PendingTelegramRegistration } from './telegram-login';
import { hasTelegramRedirectCallback } from './telegram-login';
import { ActionButton, FormError, TextField } from './ui-controls';

function AuthBrand() {
  return <img className="auth-logo" src="logo-wordmark.png" alt="REPPY" />;
}

function readableAuthError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : 'Не удалось выполнить запрос.';
  const normalized = message.toLowerCase();
  if (normalized.includes('invitation is not available: expired')) return 'Срок действия приглашения истёк. Попроси тренера создать новую ссылку.';
  if (normalized.includes('invitation is not available: revoked')) return 'Тренер отозвал это приглашение. Попроси новую ссылку.';
  if (normalized.includes('invitation is not available: used')) return 'Это приглашение уже использовано. Войди через Telegram.';
  if (normalized.includes('invitation is not available')) return 'Приглашение недействительно или уже использовано.';
  return message;
}

export function AccountScreen({
  initialError,
  onTelegramSignIn,
  onCompleteRegistration,
  onResumeTelegram,
  onHome,
}: {
  initialError?: string;
  onTelegramSignIn: () => Promise<PendingTelegramRegistration | null>;
  onCompleteRegistration: (pending: PendingTelegramRegistration, displayName: string) => Promise<void>;
  onResumeTelegram: () => Promise<PendingTelegramRegistration | null>;
  onHome: () => void;
}) {
  const [pending, setPending] = useState<PendingTelegramRegistration | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(() => hasTelegramRedirectCallback('login'));
  const [error, setError] = useState(initialError ?? '');

  useEffect(() => {
    if (!hasTelegramRedirectCallback('login')) return;
    let active = true;
    void onResumeTelegram()
      .then((registration) => {
        if (!active || !registration) return;
        setPending(registration);
        setDisplayName(registration.displayName);
      })
      .catch((reason: unknown) => { if (active) setError(readableAuthError(reason)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [onResumeTelegram]);

  const signIn = async () => {
    setBusy(true);
    setError('');
    try {
      const registration = await onTelegramSignIn();
      if (registration) {
        setPending(registration);
        setDisplayName(registration.displayName);
      }
    } catch (reason) {
      setError(readableAuthError(reason));
    } finally {
      setBusy(false);
    }
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      await onCompleteRegistration(pending, displayName);
    } catch (reason) {
      setError(readableAuthError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <AuthBrand />
        <p className="eyebrow">Аккаунт REPPY</p>
        <h1>ВОЙТИ ИЛИ СОЗДАТЬ</h1>
        {!pending ? <div className="auth-form">
          {error && <FormError>{error}</FormError>}
          <ActionButton icon="arrow-right" disabled={busy} onClick={() => void signIn()}>{busy ? 'Открываем Telegram…' : 'Продолжить через Telegram'}</ActionButton>
          <p className="auth-description">Ученику нужна ссылка-приглашение от тренера.</p>
        </div> : <form className="auth-form" onSubmit={create}>
          <p className="auth-description">Аккаунта ещё нет. Проверь имя и создай кабинет тренера — повторно открывать Telegram не нужно.</p>
          <div><TextField id="trainer-telegram-name" label="Имя тренера" autoComplete="name" minLength={2} maxLength={120} required value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></div>
          {pending.username && <p className="form-notice">Telegram: @{pending.username}</p>}
          {error && <FormError>{error}</FormError>}
          <ActionButton icon="check" type="submit" disabled={busy || displayName.trim().length < 2}>{busy ? 'Создаём кабинет…' : 'Создать кабинет тренера'}</ActionButton>
          <button className="auth-text-button" type="button" disabled={busy} onClick={() => { setPending(null); setError(''); }}>Использовать другой Telegram</button>
        </form>}
        <ActionButton variant="secondary" icon="home" onClick={onHome}>На главную</ActionButton>
      </section>
    </main>
  );
}

export function SupabaseInvitationScreen({
  token,
  signedIn,
  profile,
  onPreview,
  onTelegramAccept,
  onResumeTelegram,
  onAccept,
  onHome,
}: {
  token: string;
  signedIn: boolean;
  profile: AuthProfile | null;
  onPreview: (token: string) => Promise<InvitationPreview>;
  onTelegramAccept: (token: string) => Promise<void>;
  onResumeTelegram: () => Promise<PendingTelegramRegistration | null>;
  onAccept: (token: string) => Promise<void>;
  onHome: () => void;
}) {
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(() => hasTelegramRedirectCallback('accept-student-invitation'));
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void onPreview(token)
      .then((value) => { if (active) setPreview(value); })
      .catch((reason: unknown) => { if (active) setPreviewError(readableAuthError(reason)); });
    return () => { active = false; };
  }, [onPreview, token]);

  useEffect(() => {
    if (!hasTelegramRedirectCallback('accept-student-invitation')) return;
    let active = true;
    void onResumeTelegram()
      .catch((reason: unknown) => { if (active) setError(readableAuthError(reason)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [onResumeTelegram]);

  useEffect(() => {
    if (!preview) return;
    const remaining = new Date(preview.expiresAt).getTime() - Date.now();
    const timer = window.setTimeout(
      () => setExpired(true),
      Math.min(Math.max(remaining + 50, 0), 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [preview]);

  const acceptWithTelegram = async () => {
    setBusy(true);
    setError('');
    try {
      await onPreview(token);
      await onTelegramAccept(token);
    } catch (reason) {
      setError(readableAuthError(reason));
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    setBusy(true);
    setError('');
    try {
      await onAccept(token);
    } catch (reason) {
      setError(readableAuthError(reason));
    } finally {
      setBusy(false);
    }
  };

  if (previewError) {
    return <main className="invitation-screen"><EmptyState icon="close" title="Ссылка не работает" text={previewError} action="На главную" onAction={onHome} /></main>;
  }
  if (expired) {
    return <main className="invitation-screen"><EmptyState icon="close" title="Ссылка устарела" text="Срок действия приглашения истёк. Попроси тренера создать новую ссылку." action="На главную" onAction={onHome} /></main>;
  }
  if (!preview) {
    return <main className="loading-screen" aria-busy="true"><img className="loading-logo" src="logo-full.png" alt="REPPY" /><p>Проверяем приглашение…</p></main>;
  }

  return (
    <main className="invitation-screen">
      <section className="invitation-card auth-invitation-card">
        <span className="invite-avatar">{preview.studentName.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
        <p className="eyebrow">Приглашение в REPPY</p>
        <h1>{preview.trainerName.toUpperCase()} ЗОВЁТ ТЕБЯ В КОМАНДУ</h1>
        <p>Привет, {preview.studentName}! Приглашение действует до {new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(preview.expiresAt))}.</p>

        {signedIn ? (
          <div className="auth-form">
            {profile?.role === 'trainer' && <FormError>Аккаунт тренера нельзя привязать как ученика.</FormError>}
            {error && <FormError>{error}</FormError>}
            <ActionButton icon="check" disabled={busy || profile?.role === 'trainer'} onClick={accept}>{busy ? 'Принимаем…' : 'Принять приглашение'}</ActionButton>
          </div>
        ) : (
          <div className="auth-form">
            <p>Подтверди личность через Telegram — имя ученика уже указал тренер.</p>
            {error && <FormError>{error}</FormError>}
            <ActionButton icon="arrow-right" disabled={busy} onClick={() => void acceptWithTelegram()}>{busy ? 'Открываем Telegram…' : 'Принять через Telegram'}</ActionButton>
          </div>
        )}
      </section>
    </main>
  );
}

export function MissingProfileScreen({ onSignOut }: { onSignOut: () => Promise<void> }) {
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <AuthBrand />
        <EmptyState icon="users" title="Профиль ещё не подключён" text="Ученику нужно открыть приглашение тренера. Тренер завершает регистрацию по одноразовой ссылке от REPPY." action="Выйти" onAction={() => void onSignOut()} />
      </section>
    </main>
  );
}
