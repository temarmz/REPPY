import EmptyState from './empty-state';
import { go } from './navigation';
import { TRAINER_NAME, type Student } from './reppy-data';
import Icon from './ui-icon';
import { ActionButton } from './ui-controls';

function Brand() {
  return (
    <button className="brand-mark brand-button" type="button" onClick={() => go('/')} aria-label="REPPY — на стартовый экран">
      <img className="brand-logo" src="logo-wordmark.png" alt="" />
    </button>
  );
}

export function LoadingScreen({ message, progress = false }: { message: string; progress?: boolean }) {
  return (
    <main className="loading-screen" aria-busy="true">
      <img className="loading-logo" src="logo-full.png" alt="REPPY" />
      {progress && <span className="loading-bar" aria-hidden="true"><i /></span>}
      <p>{message}</p>
    </main>
  );
}

export function WelcomeScreen({ onLogin, accountMode = false }: { onLogin: () => void; accountMode?: boolean }) {
  return (
    <main className="welcome-page">
      <section className="welcome-screen">
        <div className="welcome-glow" aria-hidden="true" />
        <section className="welcome-card">
          <Brand />
          <div className="welcome-copy">
            <p className="eyebrow">Персональные тренировки без хаоса</p>
            <h1>ВЕДИ УЧЕНИКОВ.<br />ВИДЬ ПРОГРЕСС.</h1>
            <p className="welcome-description">Расписание, программы, результаты подходов и абонементы — в одной понятной связи между тренером и учеником.</p>
          </div>
          <button className="primary-button" type="button" onClick={onLogin}>
            <Icon name="arrow-right" /> {accountMode ? 'Войти в REPPY' : 'Попробовать REPPY'}
          </button>
          <div className="hero-points" aria-label={accountMode ? 'Преимущества REPPY' : 'Преимущества демо'}>
            {accountMode
              ? <><span>Тренер и ученик</span><span>Данные синхронизированы</span><span>Работает на iPhone</span></>
              : <><span>Без регистрации</span><span>Обе роли</span><span>Работает на iPhone</span></>}
          </div>
        </section>
        <figure className="hero-mascot">
          <img src="logo.png" alt="Маскот REPPY — спортивный динозавр" />
          <figcaption>TRAIN · TRACK · GROW</figcaption>
        </figure>
      </section>

      <section className="landing-section landing-flow" aria-labelledby="landing-flow-title">
        <header className="landing-section-heading">
          <p className="eyebrow">От плана до результата</p>
          <h2 id="landing-flow-title">ОДНА ТРЕНИРОВКА.<br />ТРИ ПОНЯТНЫХ ШАГА.</h2>
          <p>Никаких параллельных таблиц, переписок и потерянных результатов.</p>
        </header>
        <ol className="workflow-grid">
          <li><span>01</span><Icon name="calendar" /><div><h3>Тренер назначает</h3><p>Выбирает ученика, дату и формат, затем адаптирует готовую программу под занятие.</p></div></li>
          <li><span>02</span><Icon name="workout" /><div><h3>Ученик выполняет</h3><p>Заранее видит состав, а в зале отмечает подходы, веса и повторы по таймеру.</p></div></li>
          <li><span>03</span><Icon name="success" /><div><h3>Оба видят итог</h3><p>Результат, самочувствие, комментарий и динамика сохраняются сразу после тренировки.</p></div></li>
        </ol>
      </section>

      <section className="landing-section role-section" aria-labelledby="roles-title">
        <header className="landing-section-heading">
          <p className="eyebrow">Каждому — только нужное</p>
          <h2 id="roles-title">ДВА ИНТЕРФЕЙСА.<br />ОДНА АКТУАЛЬНАЯ КАРТИНА.</h2>
        </header>
        <div className="role-showcase-list">
          <article className="role-showcase">
            <div className="role-copy">
              <p className="eyebrow">Для тренера</p>
              <h3>День начинается с расписания</h3>
              <p>Сразу видно, кто и во сколько приходит. Дальше — только действия по конкретному ученику.</p>
              <ul>
                <li><Icon name="check" /><span><strong>Планирование</strong>Шаблоны, назначения и календарь на ближайшие недели.</span></li>
                <li><Icon name="check" /><span><strong>Контекст ученика</strong>Прогресс, ограничения, комментарии и история занятий.</span></li>
                <li><Icon name="check" /><span><strong>Абонементы</strong>Остаток тренировок, оплаты и списание после занятия.</span></li>
              </ul>
            </div>
            <figure className="landing-art-placeholder trainer-art">
              <div aria-hidden="true"><span>ART 01</span><Icon name="calendar" /><b>REPPY</b></div>
              <figcaption><strong>Тренер собирает неделю</strong><small>Место для авторской иллюстрации</small></figcaption>
            </figure>
          </article>

          <article className="role-showcase reverse">
            <div className="role-copy">
              <p className="eyebrow">Для ученика</p>
              <h3>На тренировке ничего не отвлекает</h3>
              <p>До занятия — дата, формат и состав. Во время — текущие подходы, инструкции и таймер. После — понятная история.</p>
              <ul>
                <li><Icon name="check" /><span><strong>Перед тренировкой</strong>Просмотр программы, персональных видео и запрос другого времени без звонков.</span></li>
                <li><Icon name="check" /><span><strong>Во время</strong>Вес, повторы, отметки подходов и общий таймер занятия.</span></li>
                <li><Icon name="check" /><span><strong>После</strong>Самочувствие, комментарий тренеру и личная динамика.</span></li>
              </ul>
            </div>
            <figure className="landing-art-placeholder student-art">
              <div aria-hidden="true"><span>ART 02</span><Icon name="workout" /><b>REPPY</b></div>
              <figcaption><strong>Ученик завершает подход</strong><small>Место для авторской иллюстрации</small></figcaption>
            </figure>
          </article>
        </div>
      </section>

      <section className="pricing-section" aria-labelledby="pricing-title">
        <header className="pricing-heading">
          <div><p className="eyebrow">Цена следует за практикой</p><h2 id="pricing-title">ПЛАТИ ЗА МАСШТАБ.<br />НЕ ЗА КАЖДОЕ ДЕЙСТВИЕ.</h2></div>
          <p>Тариф определяется числом активных учеников — тех, кому назначена хотя бы одна тренировка в текущем месяце. Неактивные профили не считаются.</p>
        </header>
        <div className="student-free-note"><Icon name="users" /><span><strong>Для ученика — 0 ₽</strong>Всегда и независимо от тарифа тренера.</span></div>
        <div className="price-tier-grid">
          <article><span>СТАРТ</span><strong>0 ₽<small>/ месяц</small></strong><p><b>1</b> активный ученик</p></article>
          <article className="featured"><span>ПРАКТИКА</span><strong>499 ₽<small>/ месяц</small></strong><p><b>2–5</b> активных учеников</p><i>Для частного тренера</i></article>
          <article><span>КОМАНДА</span><strong>990 ₽<small>/ месяц</small></strong><p><b>6–15</b> активных учеников</p></article>
          <article><span>СТУДИЯ</span><strong>1 490 ₽<small>/ месяц</small></strong><p><b>16+</b> активных учеников</p></article>
        </div>
        <p className="pricing-footnote">Внутри диапазона цена фиксирована. При изменении команды тариф автоматически обновится со следующего месяца.</p>
      </section>

      <section className="landing-cta">
        {accountMode
          ? <div><p className="eyebrow">Уже с нами?</p><h2>ВЕРНИСЬ К ТРЕНИРОВКАМ.</h2><p>Войди в аккаунт — расписание, ученики и результаты уже ждут в твоём кабинете.</p></div>
          : <div><p className="eyebrow">Посмотри вживую</p><h2>ПРОЙДИ ПУТЬ ТРЕНЕРА И УЧЕНИКА.</h2><p>Демо уже заполнено примерами: можно назначить тренировку, выполнить её и проверить результат с обеих сторон.</p></div>}
        <button className="primary-button" type="button" onClick={onLogin}><Icon name="arrow-right" /> {accountMode ? 'Войти в аккаунт' : 'Открыть демо'}</button>
      </section>
    </main>
  );
}

export function DemoInvitationScreen({ student, onAccept }: { student?: Student; onAccept: (student: Student) => void }) {
  if (!student) {
    return <main className="invitation-screen"><Brand /><EmptyState icon="close" title="Ссылка не работает" text="Попроси тренера создать новое приглашение." action="На главную" onAction={() => go('/')} /></main>;
  }
  const initials = student.name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return (
    <main className="invitation-screen">
      <Brand />
      <section className="invitation-card">
        <span className="invite-avatar">{initials}</span>
        <p className="eyebrow">Приглашение в REPPY</p>
        <h1>{TRAINER_NAME.toUpperCase()} ЗОВЁТ ТЕБЯ В КОМАНДУ</h1>
        <p>Привет, {student.name}! Здесь ты будешь получать тренировки и отмечать результаты прямо в зале.</p>
        <ActionButton icon="check" onClick={() => onAccept(student)}>Принять приглашение</ActionButton>
      </section>
    </main>
  );
}
