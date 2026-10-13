import { UI_ASSETS } from './ui/assets';
import { Image, Page, Inline, Italic, Paragraph, Section, Box, PageTitle, LineBreak, Figure, FigCaption, Header, Heading, OrderedList, ListItem, Subheading, Card, List, Strong, Bold, Small } from './ui/elements';
import EmptyState from './ui/empty-state';
import { go } from './navigation';
import { TRAINER_NAME, type Student } from './reppy-data';
import Icon from './ui/icon';
import { ActionButton, Button } from './ui/controls';

function Brand() {
  return (
    <Button className="brand-mark brand-button" type="button" onClick={() => go('/')} aria-label="REPPY — на стартовый экран">
      <Image className="brand-logo" src={UI_ASSETS.wordmark} alt="" />
    </Button>
  );
}

export function LoadingScreen({ message, progress = false }: { message: string; progress?: boolean }) {
  return (
    <Page className="loading-screen" aria-busy="true">
      <Image className="loading-logo" src={UI_ASSETS.logo} alt="REPPY" />
      {progress && <Inline className="loading-bar" aria-hidden="true"><Italic /></Inline>}
      <Paragraph>{message}</Paragraph>
    </Page>
  );
}

export function WelcomeScreen({ onLogin, accountMode = false }: { onLogin: () => void; accountMode?: boolean }) {
  return (
    <Page className="welcome-page">
      <Section className="welcome-screen">
        <Box className="welcome-glow" aria-hidden="true" />
        <Section className="welcome-card">
          <Brand />
          <Box className="welcome-copy">
            <Paragraph className="eyebrow">Персональные тренировки без хаоса</Paragraph>
            <PageTitle>ВЕДИ УЧЕНИКОВ.<LineBreak />ВИДЬ ПРОГРЕСС.</PageTitle>
            <Paragraph className="welcome-description">Расписание, программы, результаты подходов и абонементы — в одной понятной связи между тренером и учеником.</Paragraph>
          </Box>
          <Button className="primary-button" type="button" onClick={onLogin}>
            <Icon name="arrow-right" /> {accountMode ? 'Войти в REPPY' : 'Попробовать REPPY'}
          </Button>
          <Box className="hero-points" aria-label={accountMode ? 'Преимущества REPPY' : 'Преимущества демо'}>
            {accountMode
              ? <><Inline>Тренер и ученик</Inline><Inline>Данные синхронизированы</Inline><Inline>Работает на iPhone</Inline></>
              : <><Inline>Без регистрации</Inline><Inline>Обе роли</Inline><Inline>Работает на iPhone</Inline></>}
          </Box>
        </Section>
        <Figure className="hero-mascot">
          <Image src={UI_ASSETS.mascot} alt="Маскот REPPY — спортивный динозавр" />
          <FigCaption>TRAIN · TRACK · GROW</FigCaption>
        </Figure>
      </Section>

      <Section className="landing-section landing-flow" aria-labelledby="landing-flow-title">
        <Header className="landing-section-heading">
          <Paragraph className="eyebrow">От плана до результата</Paragraph>
          <Heading id="landing-flow-title">ОДНА ТРЕНИРОВКА.<LineBreak />ТРИ ПОНЯТНЫХ ШАГА.</Heading>
          <Paragraph>Никаких параллельных таблиц, переписок и потерянных результатов.</Paragraph>
        </Header>
        <OrderedList className="workflow-grid">
          <ListItem><Inline>01</Inline><Icon name="calendar" /><Box><Subheading>Тренер назначает</Subheading><Paragraph>Выбирает ученика, дату и формат, затем адаптирует готовую программу под занятие.</Paragraph></Box></ListItem>
          <ListItem><Inline>02</Inline><Icon name="workout" /><Box><Subheading>Ученик выполняет</Subheading><Paragraph>Заранее видит состав, а в зале отмечает подходы, веса и повторы по таймеру.</Paragraph></Box></ListItem>
          <ListItem><Inline>03</Inline><Icon name="success" /><Box><Subheading>Оба видят итог</Subheading><Paragraph>Результат, самочувствие, комментарий и динамика сохраняются сразу после тренировки.</Paragraph></Box></ListItem>
        </OrderedList>
      </Section>

      <Section className="landing-section role-section" aria-labelledby="roles-title">
        <Header className="landing-section-heading">
          <Paragraph className="eyebrow">Каждому — только нужное</Paragraph>
          <Heading id="roles-title">ДВА ИНТЕРФЕЙСА.<LineBreak />ОДНА АКТУАЛЬНАЯ КАРТИНА.</Heading>
        </Header>
        <Box className="role-showcase-list">
          <Card className="role-showcase">
            <Box className="role-copy">
              <Paragraph className="eyebrow">Для тренера</Paragraph>
              <Subheading>День начинается с расписания</Subheading>
              <Paragraph>Сразу видно, кто и во сколько приходит. Дальше — только действия по конкретному ученику.</Paragraph>
              <List>
                <ListItem><Icon name="check" /><Inline><Strong>Планирование</Strong>Шаблоны, назначения и календарь на ближайшие недели.</Inline></ListItem>
                <ListItem><Icon name="check" /><Inline><Strong>Контекст ученика</Strong>Прогресс, ограничения, комментарии и история занятий.</Inline></ListItem>
                <ListItem><Icon name="check" /><Inline><Strong>Абонементы</Strong>Остаток тренировок, оплаты и списание после занятия.</Inline></ListItem>
              </List>
            </Box>
            <Figure className="landing-art-placeholder trainer-art">
              <Box aria-hidden="true"><Inline>ART 01</Inline><Icon name="calendar" /><Bold>REPPY</Bold></Box>
              <FigCaption><Strong>Тренер собирает неделю</Strong><Small>Место для авторской иллюстрации</Small></FigCaption>
            </Figure>
          </Card>

          <Card className="role-showcase reverse">
            <Box className="role-copy">
              <Paragraph className="eyebrow">Для ученика</Paragraph>
              <Subheading>На тренировке ничего не отвлекает</Subheading>
              <Paragraph>До занятия — дата, формат и состав. Во время — текущие подходы, инструкции и таймер. После — понятная история.</Paragraph>
              <List>
                <ListItem><Icon name="check" /><Inline><Strong>Перед тренировкой</Strong>Просмотр программы, персональных видео и запрос другого времени без звонков.</Inline></ListItem>
                <ListItem><Icon name="check" /><Inline><Strong>Во время</Strong>Вес, повторы, отметки подходов и общий таймер занятия.</Inline></ListItem>
                <ListItem><Icon name="check" /><Inline><Strong>После</Strong>Самочувствие, комментарий тренеру и личная динамика.</Inline></ListItem>
              </List>
            </Box>
            <Figure className="landing-art-placeholder student-art">
              <Box aria-hidden="true"><Inline>ART 02</Inline><Icon name="workout" /><Bold>REPPY</Bold></Box>
              <FigCaption><Strong>Ученик завершает подход</Strong><Small>Место для авторской иллюстрации</Small></FigCaption>
            </Figure>
          </Card>
        </Box>
      </Section>

      <Section className="pricing-section" aria-labelledby="pricing-title">
        <Header className="pricing-heading">
          <Box><Paragraph className="eyebrow">Цена следует за практикой</Paragraph><Heading id="pricing-title">ПЛАТИ ЗА МАСШТАБ.<LineBreak />НЕ ЗА КАЖДОЕ ДЕЙСТВИЕ.</Heading></Box>
          <Paragraph>Тариф определяется числом активных учеников — тех, кому назначена хотя бы одна тренировка в текущем месяце. Неактивные профили не считаются.</Paragraph>
        </Header>
        <Box className="student-free-note"><Icon name="users" /><Inline><Strong>Для ученика — 0 ₽</Strong>Всегда и независимо от тарифа тренера.</Inline></Box>
        <Box className="price-tier-grid">
          <Card><Inline>СТАРТ</Inline><Strong>0 ₽<Small>/ месяц</Small></Strong><Paragraph><Bold>1</Bold> активный ученик</Paragraph></Card>
          <Card className="featured"><Inline>ПРАКТИКА</Inline><Strong>499 ₽<Small>/ месяц</Small></Strong><Paragraph><Bold>2–5</Bold> активных учеников</Paragraph><Italic>Для частного тренера</Italic></Card>
          <Card><Inline>КОМАНДА</Inline><Strong>990 ₽<Small>/ месяц</Small></Strong><Paragraph><Bold>6–15</Bold> активных учеников</Paragraph></Card>
          <Card><Inline>СТУДИЯ</Inline><Strong>1 490 ₽<Small>/ месяц</Small></Strong><Paragraph><Bold>16+</Bold> активных учеников</Paragraph></Card>
        </Box>
        <Paragraph className="pricing-footnote">Внутри диапазона цена фиксирована. При изменении команды тариф автоматически обновится со следующего месяца.</Paragraph>
      </Section>

      <Section className="landing-cta">
        {accountMode
          ? <Box><Paragraph className="eyebrow">Уже с нами?</Paragraph><Heading>ВЕРНИСЬ К ТРЕНИРОВКАМ.</Heading><Paragraph>Войди в аккаунт — расписание, ученики и результаты уже ждут в твоём кабинете.</Paragraph></Box>
          : <Box><Paragraph className="eyebrow">Посмотри вживую</Paragraph><Heading>ПРОЙДИ ПУТЬ ТРЕНЕРА И УЧЕНИКА.</Heading><Paragraph>Демо уже заполнено примерами: можно назначить тренировку, выполнить её и проверить результат с обеих сторон.</Paragraph></Box>}
        <Button className="primary-button" type="button" onClick={onLogin}><Icon name="arrow-right" /> {accountMode ? 'Войти в аккаунт' : 'Открыть демо'}</Button>
      </Section>
    </Page>
  );
}

export function DemoInvitationScreen({ student, onAccept }: { student?: Student; onAccept: (student: Student) => void }) {
  if (!student) {
    return <Page className="invitation-screen"><Brand /><EmptyState icon="close" title="Ссылка не работает" text="Попроси тренера создать новое приглашение." action="На главную" onAction={() => go('/')} /></Page>;
  }
  const initials = student.name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return (
    <Page className="invitation-screen">
      <Brand />
      <Section className="invitation-card">
        <Inline className="invite-avatar">{initials}</Inline>
        <Paragraph className="eyebrow">Приглашение в REPPY</Paragraph>
        <PageTitle>{TRAINER_NAME.toUpperCase()} ЗОВЁТ ТЕБЯ В КОМАНДУ</PageTitle>
        <Paragraph>Привет, {student.name}! Здесь ты будешь получать тренировки и отмечать результаты прямо в зале.</Paragraph>
        <ActionButton icon="check" onClick={() => onAccept(student)}>Принять приглашение</ActionButton>
      </Section>
    </Page>
  );
}
