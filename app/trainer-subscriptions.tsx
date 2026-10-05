import { useEffect, useMemo, useState } from 'react';
import {
  dateKey,
  type DemoState,
  type PaymentMethod,
  type Student,
  type SubscriptionEntry,
} from './reppy-data';
import Icon from './ui-icon';
import EmptyState from './empty-state';
import { DatePickerField } from './workout-schedule-fields';
import { ActionButton, FormError } from './ui-controls';
import { subscriptionBalance, subscriptionEntriesFor, type PaymentInput } from './subscription-ledger';
import ConfirmationModal from './confirmation-modal';
import { go } from './navigation';
import PageHeader from './route-page-header';
import { lessonWord, subscriptionBalanceLabel, subscriptionTone } from './workout-display';
import { clearUiDraft, loadUiDraft, saveUiDraft } from './ui-persistence';

function formatRubles(amount = 0) {
  return new Intl.NumberFormat('ru-RU').format(amount) + ' ₽';
}

function paymentMethodLabel(method?: PaymentMethod) {
  return method === 'transfer' ? 'перевод' : 'наличные';
}

function formatSubscriptionDate(value: string) {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export function SubscriptionHistory({ data, student, onDelete }: { data: DemoState; student: Student; onDelete: () => void }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const entries = subscriptionEntriesFor(data.subscriptionEntries, student.id);
  const balance = subscriptionBalance(data.subscriptionEntries, student.id);
  const hasEntries = entries.length > 0;
  const balanceAfter = new Map<string, number>();
  let runningBalance = 0;
  [...entries].reverse().forEach((entry) => {
    runningBalance += entry.lessonDelta;
    balanceAfter.set(entry.id, runningBalance);
  });
  return (
    <main className="content-page narrow-page subscription-history-page">
      <PageHeader back={`/trainer/clients/${student.id}`} semanticBack eyebrow={student.name} title="ИСТОРИЯ АБОНЕМЕНТА" />
      <section className={`subscription-history-summary ${subscriptionTone(balance, hasEntries)}`}>
        <span>ТЕКУЩИЙ БАЛАНС</span>
        <strong>{subscriptionBalanceLabel(balance, hasEntries)}</strong>
        <ActionButton icon="plus" onClick={() => go(`/trainer/clients/${student.id}/subscription/new`)}>Добавить пополнение</ActionButton>
      </section>
      {entries.length ? <section className="subscription-entry-list" aria-label="Операции абонемента">
        {entries.map((entry) => {
          const isPayment = entry.kind === 'payment';
          const title = isPayment
            ? `Пополнение на ${entry.lessonDelta} ${lessonWord(entry.lessonDelta)}`
            : entry.kind === 'session-refund'
              ? 'Возврат занятия'
              : 'Занятие списано';
          const detail = isPayment
            ? `${formatRubles(entry.amountRub)} · ${paymentMethodLabel(entry.paymentMethod)}`
            : entry.workoutName ?? 'Тренировка';
          const content = <>
            <span className={`subscription-entry-delta ${entry.lessonDelta > 0 ? 'positive' : 'negative'}`}>{entry.lessonDelta > 0 ? '+' : ''}{entry.lessonDelta}</span>
            <div><strong>{title}</strong><small>{detail} · {formatSubscriptionDate(entry.occurredAt)}</small>{entry.comment && <p>{entry.comment}</p>}<i>Баланс после операции: {balanceAfter.get(entry.id)}</i></div>
            {isPayment && <Icon name="edit" />}
          </>;
          return isPayment
            ? <button key={entry.id} type="button" onClick={() => go(`/trainer/clients/${student.id}/subscription/payments/${entry.id}`)}>{content}</button>
            : <article key={entry.id}>{content}</article>;
        })}
      </section> : <EmptyState icon="history" title="История пока пуста" text="Добавь первое пополнение абонемента." />}
      {entries.length > 0 && <section className="subscription-danger-zone" aria-label="Удаление абонемента">
        <div><strong>Удаление абонемента</strong><small>Тренировки и результаты ученика останутся на месте.</small></div>
        <ActionButton variant="danger" icon="trash" onClick={() => setDeleteOpen(true)}>Удалить полностью</ActionButton>
      </section>}
      {deleteOpen && <ConfirmationModal
        title="Удалить абонемент полностью?"
        text="Баланс и вся история оплат, списаний и возвратов будут удалены. Тренировки и их результаты сохранятся."
        confirmLabel="Удалить абонемент"
        danger
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false);
          onDelete();
        }}
      />}
    </main>
  );
}

export function SubscriptionPaymentForm({
  student,
  initial,
  defaults,
  onSave,
  onDelete,
}: {
  student: Student;
  initial?: SubscriptionEntry;
  defaults?: SubscriptionEntry;
  onSave: (input: PaymentInput) => void;
  onDelete?: () => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const source = initial ?? defaults;
  const draftKey = `subscription:${student.id}:${initial?.id ?? 'new'}`;
  const [restoredDraft] = useState(() => loadUiDraft<{
    lessons: string;
    amountRub: string;
    paymentMethod: PaymentMethod;
    occurredAt: string;
    comment: string;
  }>(draftKey));
  const initialValues = useMemo(() => ({
    lessons: String(source?.lessonDelta ?? 8),
    amountRub: String(source?.amountRub ?? 11400),
    paymentMethod: source?.paymentMethod ?? 'cash' as PaymentMethod,
    occurredAt: initial?.occurredAt.slice(0, 10) ?? dateKey(),
    comment: initial?.comment ?? '',
  }), [initial?.comment, initial?.occurredAt, source?.lessonDelta, source?.amountRub, source?.paymentMethod]);
  const [lessons, setLessons] = useState(restoredDraft?.lessons ?? initialValues.lessons);
  const [amountRub, setAmountRub] = useState(restoredDraft?.amountRub ?? initialValues.amountRub);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(restoredDraft?.paymentMethod ?? initialValues.paymentMethod);
  const [occurredAt, setOccurredAt] = useState(restoredDraft?.occurredAt ?? initialValues.occurredAt);
  const [comment, setComment] = useState(restoredDraft?.comment ?? initialValues.comment);
  const [error, setError] = useState('');

  useEffect(() => {
    const current = JSON.stringify({ lessons, amountRub, paymentMethod, occurredAt, comment });
    if (current === JSON.stringify(initialValues)) clearUiDraft(draftKey);
    else saveUiDraft(draftKey, { lessons, amountRub, paymentMethod, occurredAt, comment });
  }, [amountRub, comment, draftKey, initialValues, lessons, occurredAt, paymentMethod]);

  const save = () => {
    const parsedLessons = Number(lessons);
    const parsedAmount = Number(amountRub);
    if (!Number.isInteger(parsedLessons) || parsedLessons <= 0) return setError('Укажи целое количество занятий больше нуля.');
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) return setError('Укажи корректную стоимость.');
    if (!occurredAt) return setError('Укажи дату оплаты.');
    clearUiDraft(draftKey);
    onSave({ lessons: parsedLessons, amountRub: parsedAmount, paymentMethod, occurredAt, comment });
  };
  return (
    <main className="content-page narrow-page subscription-payment-page">
      <PageHeader back={initial ? `/trainer/clients/${student.id}/subscription` : `/trainer/clients/${student.id}`} semanticBack eyebrow={student.name} title={initial ? 'ИСПРАВИТЬ ПОПОЛНЕНИЕ' : 'ДОБАВИТЬ АБОНЕМЕНТ'} />
      <section className="subscription-payment-form">
        <div className="subscription-form-grid">
          <label><span>Количество занятий</span><input type="number" min="1" step="1" inputMode="numeric" value={lessons} onChange={(event) => { setLessons(event.target.value); setError(''); }} /></label>
          <label><span>Стоимость, ₽</span><input type="number" min="0" step="1" inputMode="numeric" value={amountRub} onChange={(event) => { setAmountRub(event.target.value); setError(''); }} /></label>
        </div>
        <fieldset className="payment-method-field">
          <legend>Способ оплаты</legend>
          <div>
            <button type="button" className={paymentMethod === 'cash' ? 'selected' : ''} aria-pressed={paymentMethod === 'cash'} onClick={() => setPaymentMethod('cash')}><Icon name={paymentMethod === 'cash' ? 'check' : 'circle'} /> Наличные</button>
            <button type="button" className={paymentMethod === 'transfer' ? 'selected' : ''} aria-pressed={paymentMethod === 'transfer'} onClick={() => setPaymentMethod('transfer')}><Icon name={paymentMethod === 'transfer' ? 'check' : 'circle'} /> Перевод</button>
          </div>
        </fieldset>
        <DatePickerField label="Дата оплаты" value={occurredAt} onChange={(value) => { setOccurredAt(value); setError(''); }} />
        <label><span>Комментарий <small>необязательно</small></span><textarea maxLength={240} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Например: второе пополнение за месяц" /><i>{comment.length}/240</i></label>
        {error && <FormError>{error}</FormError>}
        <ActionButton icon="check" onClick={save}>{initial ? 'Сохранить изменения' : 'Добавить пополнение'}</ActionButton>
        {initial && onDelete && <ActionButton variant="danger" icon="trash" onClick={() => setDeleteOpen(true)}>Удалить это пополнение</ActionButton>}
      </section>
      {deleteOpen && <ConfirmationModal
        title="Удалить пополнение?"
        text="Операция исчезнет из истории, а баланс будет пересчитан. Списания тренировок сохранятся."
        confirmLabel="Удалить пополнение"
        danger
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          clearUiDraft(draftKey);
          setDeleteOpen(false);
          onDelete?.();
        }}
      />}
    </main>
  );
}
