import { createRoot } from 'react-dom/client';
import { SubscriptionPaymentForm } from '../../app/trainer-subscriptions';
import { createSubscriptionPayment } from '../../app/subscription-ledger';
import type { PaymentInput } from '../../app/subscription-ledger';
const root = createRoot(document.getElementById('root')!);
const student = { id: 'payment-conflict', name: 'Тест', status: 'active' as const, color: 'lime' as const };
let payment = { ...createSubscriptionPayment(student.id, { lessons: 2, amountRub: 0, paymentMethod: 'cash', occurredAt: '2026-11-08' }), revision: 1 };
const saves: PaymentInput[] = [];
const render = () => root.render(<SubscriptionPaymentForm student={student} initial={payment} onSave={input => saves.push(input)} />);
declare global { interface Window { paymentConflictQa: { remote: () => void; saves: PaymentInput[] } } }
window.paymentConflictQa = { saves, remote: () => { payment = { ...payment, lessonDelta: 3, revision: 2 }; render(); } };
render();
