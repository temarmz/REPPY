import { useCallback, useEffect, useState, type FormEvent } from 'react';
import EmptyState from './empty-state';
import type { AuthProfile, InvitationPreview, TrainerRegistrationStatus } from './reppy-auth';
import { ActionButton, FormError, TextField } from './ui-controls';

function AuthBrand() {
  return <img className="auth-logo" src="logo-wordmark.png" alt="REPPY" />;
}

function readableAuthError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : 'Не удалось выполнить запрос.';
  const normalized = message.toLowerCase();
  if (normalized.includes('invalid login credentials')) return 'Неверный email или пароль.';
  if (normalized.includes('email not confirmed')) return 'Сначала подтверди email по ссылке из письма.';
  if (normalized.includes('user already registered')) return 'Аккаунт с таким email уже существует. Войди в него.';
  if (normalized.includes('password should be')) return 'Пароль должен содержать не меньше 8 символов.';
  if (normalized.includes('invitation is not available')) return 'Приглашение недействительно или уже использовано.';
  return message;
}

function loadTrainerRegistrationCredentials(token?: string) {
  if (!token) return {};
  try {
    return JSON.parse(window.sessionStorage.getItem(`reppy-trainer-registration:${token}`) ?? '{}') as { name?: string; email?: string };
  } catch {
    return {};
  }
}

export function AccountScreen({
  recovery,
  initialError,
  onSignIn,
  onSendPasswordReset,
  onUpdatePassword,
}: {
  recovery: boolean;
  initialError?: string;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSendPasswordReset: (email: string) => Promise<void>;
  onUpdatePassword: (password: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<'sign-in' | 'forgot' | 'recovery'>(recovery ? 'recovery' : 'sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? '');
  const [notice, setNotice] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'sign-in') {
        await onSignIn(email, password);
      } else if (mode === 'forgot') {
        await onSendPasswordReset(email);
        setNotice('Письмо для восстановления отправлено. Проверь почту.');
      } else {
        await onUpdatePassword(password);
        setNotice('Пароль обновлён. Можно продолжать работу.');
      }
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
        <h1>{mode === 'sign-in' ? 'ВОЙТИ' : mode === 'forgot' ? 'ВОССТАНОВИТЬ ПАРОЛЬ' : 'НОВЫЙ ПАРОЛЬ'}</h1>
        <p className="auth-description">
          {mode === 'sign-in' && 'Используй аккаунт тренера или ученика.'}
          {mode === 'forgot' && 'Отправим на email безопасную ссылку для смены пароля.'}
          {mode === 'recovery' && 'Придумай новый пароль длиной не меньше 8 символов.'}
        </p>
        <form className="auth-form" onSubmit={submit}>
          {mode !== 'recovery' && <div><TextField id="auth-email" label="Email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>}
          {mode !== 'forgot' && <div><TextField id="auth-password" label={mode === 'recovery' ? 'Новый пароль' : 'Пароль'} type="password" autoComplete={mode === 'recovery' ? 'new-password' : 'current-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></div>}
          {error && <FormError>{error}</FormError>}
          {notice && <p className="form-notice" role="status">{notice}</p>}
          <ActionButton icon="arrow-right" type="submit" disabled={busy}>{busy ? 'Подождите…' : mode === 'sign-in' ? 'Войти' : mode === 'forgot' ? 'Отправить ссылку' : 'Сохранить пароль'}</ActionButton>
        </form>
        {mode === 'sign-in' && <button className="auth-text-button" type="button" onClick={() => setMode('forgot')}>Не помню пароль</button>}
        {mode === 'forgot' && <button className="auth-text-button" type="button" onClick={() => setMode('sign-in')}>Вернуться ко входу</button>}
      </section>
    </main>
  );
}

export function TrainerRegistrationScreen({
  inviteCode,
  registrationToken,
  signedIn,
  onStart,
  onStatus,
  onRestart,
  onSignUp,
  onActivate,
  onComplete,
  onHome,
}: {
  inviteCode: string;
  registrationToken?: string;
  signedIn: boolean;
  onStart: (inviteCode: string, displayName: string, email: string) => Promise<{ token: string; expiresAt: string }>;
  onStatus: (token: string) => Promise<TrainerRegistrationStatus>;
  onRestart: (token: string) => Promise<{ token: string; expiresAt: string }>;
  onSignUp: (email: string, password: string, inviteCode: string, registrationToken: string) => Promise<{ confirmationRequired: boolean }>;
  onActivate: (token: string) => Promise<void>;
  onComplete: () => void;
  onHome: () => void;
}) {
  const [name, setName] = useState(() => loadTrainerRegistrationCredentials(registrationToken).name ?? '');
  const [email, setEmail] = useState(() => loadTrainerRegistrationCredentials(registrationToken).email ?? '');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<TrainerRegistrationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refreshTelegramStatus = useCallback(async () => {
    if (!registrationToken) return;
    try {
      const next = await onStatus(registrationToken);
      setStatus(next);
      setError('');
    } catch {
      setError('Ссылка регистрации недействительна или устарела.');
    }
  }, [onStatus, registrationToken]);

  useEffect(() => {
    if (!registrationToken) return;
    const initialCheck = window.setTimeout(() => void refreshTelegramStatus(), 0);
    const interval = window.setInterval(() => void refreshTelegramStatus(), 3000);
    window.addEventListener('focus', refreshTelegramStatus);
    return () => {
      window.clearTimeout(initialCheck);
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshTelegramStatus);
    };
  }, [refreshTelegramStatus, registrationToken]);

  const start = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const registration = await onStart(inviteCode, name, email);
      try {
        window.sessionStorage.setItem(
          `reppy-trainer-registration:${registration.token}`,
          JSON.stringify({ name, email }),
        );
      } catch {
        // The registration URL still carries the opaque token for a same-page flow.
      }
      window.location.hash = `/trainer/register/${encodeURIComponent(inviteCode)}/${encodeURIComponent(registration.token)}`;
    } catch (reason) {
      setError(readableAuthError(reason));
    } finally {
      setBusy(false);
    }
  };

  const createAccount = async () => {
    if (!registrationToken) return;
    setBusy(true);
    setError('');
    try {
      const result = await onSignUp(email, password, inviteCode, registrationToken);
      if (result.confirmationRequired) setNotice('Подтверди email по ссылке из письма — затем вернись на эту страницу.');
    } catch (reason) {
      setError(readableAuthError(reason));
    } finally {
      setBusy(false);
    }
  };

  const restartTelegramVerification = async () => {
    if (!registrationToken) return;
    setBusy(true);
    setError('');
    try {
      const registration = await onRestart(registrationToken);
      window.location.hash = `/trainer/register/${encodeURIComponent(inviteCode)}/${encodeURIComponent(registration.token)}`;
    } catch (reason) {
      setError(readableAuthError(reason));
    } finally {
      setBusy(false);
    }
  };

  const copyTelegramCommand = async () => {
    if (!registrationToken) return;
    try {
      await navigator.clipboard.writeText(`/start trainer_${registrationToken}`);
      setNotice('Команда скопирована. Вставь её в чат с ботом REPPY и отправь.');
      setError('');
    } catch {
      setError('Не удалось скопировать команду. Выдели и скопируй её вручную.');
    }
  };

  const activate = async () => {
    if (!registrationToken) return;
    setBusy(true);
    setError('');
    try {
      await onActivate(registrationToken);
      try { window.sessionStorage.removeItem(`reppy-trainer-registration:${registrationToken}`); } catch { /* ignore */ }
      onComplete();
    } catch (reason) {
      setError(readableAuthError(reason));
    } finally {
      setBusy(false);
    }
  };

  const botUrl = registrationToken ? `https://t.me/reppyappbot?start=trainer_${registrationToken}` : '';
  return (
    <main className="invitation-screen">
      <section className="invitation-card auth-invitation-card">
        <AuthBrand />
        <p className="eyebrow">Регистрация тренера</p>
        <h1>СОЗДАЙ КАБИНЕТ ТРЕНЕРА</h1>
        {!registrationToken ? <form className="auth-form" onSubmit={start}>
          <div><TextField id="trainer-name" label="Ваше имя" autoComplete="name" minLength={2} required value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div><TextField id="trainer-email" label="Email из приглашения" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          {error && <FormError>{error}</FormError>}
          <ActionButton icon="arrow-right" type="submit" disabled={busy}>{busy ? 'Подождите…' : 'Продолжить'}</ActionButton>
        </form> : <div className="auth-form">
          {!status?.telegramVerified ? <>
            <p>Подтверди Telegram: открой бота по ссылке, нажми Start и вернись сюда.</p>
            <a className="primary-button" href={botUrl}>Открыть Telegram</a>
            <p className="auth-description">Если Telegram открыл бота без готовой команды, отправь ему эту команду:</p>
            <code>/start trainer_{registrationToken}</code>
            <button className="auth-text-button" type="button" onClick={() => void copyTelegramCommand()}>Скопировать команду</button>
            <ActionButton variant="secondary" icon="check" disabled={busy} onClick={() => void refreshTelegramStatus()}>Я подтвердил Telegram</ActionButton>
            <button className="auth-text-button" type="button" disabled={busy} onClick={() => void restartTelegramVerification()}>Создать новую ссылку Telegram</button>
          </> : !signedIn ? <>
            <p>Telegram подтверждён. Теперь задай пароль для аккаунта REPPY.</p>
            <div><TextField id="trainer-password" label="Пароль" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
            <ActionButton icon="arrow-right" disabled={busy || password.length < 8} onClick={createAccount}>{busy ? 'Создаём…' : 'Создать аккаунт'}</ActionButton>
          </> : <>
            <p>Telegram и email подтверждены. Осталось активировать кабинет тренера.</p>
            <ActionButton icon="check" disabled={busy} onClick={activate}>{busy ? 'Активируем…' : 'Открыть кабинет'}</ActionButton>
          </>}
          {error && <FormError>{error}</FormError>}
          {notice && <p className="form-notice" role="status">{notice}</p>}
        </div>}
        <button className="auth-text-button" type="button" onClick={onHome}>На главную</button>
      </section>
    </main>
  );
}

export function SupabaseInvitationScreen({
  token,
  signedIn,
  profile,
  onPreview,
  onSignIn,
  onSignUp,
  onAccept,
  onHome,
}: {
  token: string;
  signedIn: boolean;
  profile: AuthProfile | null;
  onPreview: (token: string) => Promise<InvitationPreview>;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string, token: string) => Promise<{ confirmationRequired: boolean }>;
  onAccept: (token: string) => Promise<void>;
  onHome: () => void;
}) {
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [mode, setMode] = useState<'sign-up' | 'sign-in'>('sign-up');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    void onPreview(token)
      .then((value) => { if (active) setPreview(value); })
      .catch(() => { if (active) setPreviewError(true); });
    return () => { active = false; };
  }, [onPreview, token]);

  const submitCredentials = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'sign-in') {
        await onSignIn(email, password);
      } else {
        const result = await onSignUp(email, password, token);
        if (result.confirmationRequired) setNotice('Подтверди email по ссылке из письма, затем вернись сюда.');
      }
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
    return <main className="invitation-screen"><EmptyState icon="close" title="Ссылка не работает" text="Попроси тренера создать новое приглашение." action="На главную" onAction={onHome} /></main>;
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
          <form className="auth-form" onSubmit={submitCredentials}>
            <div><TextField id="invite-email" label="Email из приглашения" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
            <div><TextField id="invite-password" label="Пароль" type="password" autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
            {error && <FormError>{error}</FormError>}
            {notice && <p className="form-notice" role="status">{notice}</p>}
            <ActionButton icon="arrow-right" type="submit" disabled={busy}>{busy ? 'Подождите…' : mode === 'sign-up' ? 'Создать аккаунт' : 'Войти и принять'}</ActionButton>
            <button className="auth-text-button" type="button" onClick={() => setMode((current) => current === 'sign-up' ? 'sign-in' : 'sign-up')}>{mode === 'sign-up' ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Создать'}</button>
          </form>
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
