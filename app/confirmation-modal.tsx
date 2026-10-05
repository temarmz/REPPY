import ModalFrame from './modal-frame';
import { ActionButton } from './ui-controls';

export default function ConfirmationModal({
  title,
  text,
  confirmLabel,
  danger = false,
  onClose,
  onConfirm,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalFrame title={title} description={text} className="confirmation-sheet" role="alertdialog" showHandle={false} onClose={onClose}>
      <div className="confirmation-actions">
        <ActionButton variant="secondary" data-modal-initial-focus onClick={onClose}>Остаться</ActionButton>
        <ActionButton variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</ActionButton>
      </div>
    </ModalFrame>
  );
}
