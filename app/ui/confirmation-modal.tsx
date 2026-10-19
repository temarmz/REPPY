import { Box } from './elements';
import ModalFrame from './modal-frame';
import { ActionButton } from './controls';

export default function ConfirmationModal({
  title,
  text,
  confirmLabel,
  danger = false,
  trackHistory = true,
  onClose,
  onConfirm,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  trackHistory?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalFrame title={title} description={text} className="confirmation-sheet" role="alertdialog" showHandle={false} trackHistory={trackHistory} onClose={onClose}>
      <Box className="confirmation-actions">
        <ActionButton variant="secondary" data-modal-initial-focus onClick={onClose}>Остаться</ActionButton>
        <ActionButton variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</ActionButton>
      </Box>
    </ModalFrame>
  );
}
