import { Box, Section, Inline, Heading, Paragraph } from './elements';
import { Button } from './controls';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Icon from './icon';
import { pushHistoryEntry } from '../browser-history';

export const MODAL_LAYER_EVENT = 'reppy:modal-layer';

let openModalLayers = 0;
let closingModalLayers = 0;

function applyModalLayerState(modalLayerOpen: boolean) {
  document.body.classList.toggle('modal-open', modalLayerOpen);
  document.querySelectorAll<HTMLElement>('.app-shell').forEach((appShell) => {
    appShell.inert = modalLayerOpen;
    if (modalLayerOpen) appShell.setAttribute('aria-hidden', 'true');
    else appShell.removeAttribute('aria-hidden');
  });
  window.dispatchEvent(new CustomEvent(MODAL_LAYER_EVENT, { detail: modalLayerOpen }));
}

export function reconcileModalLayerState() {
  const modalLayerOpen = Boolean(document.querySelector('.modal-layer-root'));
  if (!modalLayerOpen) {
    openModalLayers = 0;
    closingModalLayers = 0;
  }
  applyModalLayerState(modalLayerOpen);
  return modalLayerOpen;
}

export function hasOpenModalLayers() {
  return openModalLayers > 0 || closingModalLayers > 0;
}

export function ModalLayer({ children, onClose, trackHistory = true, closeOnHistoryBack = true }: {
  children: ReactNode; onClose: () => void; trackHistory?: boolean; closeOnHistoryBack?: boolean;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const modalId = `reppy-modal-${useId()}`;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    openModalLayers += 1;
    applyModalLayerState(true);
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const currentState = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
    if (trackHistory && currentState.reppyModal !== modalId) {
      pushHistoryEntry({ ...currentState, reppyModal: modalId });
    }
    const focusInitialControl = () => {
      const root = layerRef.current;
      const target = root?.querySelector<HTMLElement>('[data-modal-initial-focus]')
        ?? root?.querySelector<HTMLElement>('[autofocus]')
        ?? root?.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])');
      target?.focus({ preventScroll: true });
    };
    let focusFrame = window.requestAnimationFrame(() => {
      focusFrame = window.requestAnimationFrame(() => {
        focusInitialControl();
      });
    });
    const focusRetryTimer = window.setTimeout(() => {
      const root = layerRef.current;
      if (root && !root.contains(document.activeElement)) focusInitialControl();
    }, 120);

    const focusableElements = () => Array.from(layerRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') ?? [])
      .filter((element) => !element.hidden && element.getClientRects().length > 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = focusableElements();
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const handleHistoryBack = (event: PopStateEvent) => {
      if (event.state?.reppyModal === modalId) return;
      onCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    if (closeOnHistoryBack) window.addEventListener('popstate', handleHistoryBack, { capture: true });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.clearTimeout(focusRetryTimer);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handleHistoryBack, { capture: true });
      openModalLayers = Math.max(0, openModalLayers - 1);
      const finishClose = () => {
        const modalLayerOpen = openModalLayers > 0;
        applyModalLayerState(modalLayerOpen);
        if (!modalLayerOpen) returnFocus?.focus({ preventScroll: true });
      };

      // Unlock the application as soon as the visible layer is gone. Browser
      // history may settle later or not emit popstate after an iOS suspension.
      finishClose();

      if (!trackHistory || window.history.state?.reppyModal !== modalId) {
        return;
      }

      closingModalLayers += 1;
      let settled = false;
      const settleHistory = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(historyFallbackTimer);
        window.removeEventListener('popstate', settleHistory);
        closingModalLayers = Math.max(0, closingModalLayers - 1);
        if (!document.querySelector('.modal-layer-root')) applyModalLayerState(false);
      };
      const historyFallbackTimer = window.setTimeout(settleHistory, 1500);
      window.addEventListener('popstate', settleHistory, { once: true });
      window.history.back();
    };
  }, [closeOnHistoryBack, modalId, trackHistory]);

  return createPortal(<Box className="modal-layer-root" ref={layerRef}>{children}</Box>, document.body);
}

export default function ModalFrame({
  title,
  eyebrow,
  subtitle,
  description,
  className = '',
  surface = 'sheet',
  role = 'dialog',
  ariaLabel,
  closeLabel = 'Закрыть',
  showHandle = surface === 'sheet',
  trackHistory = true,
  onClose,
  children,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  description?: ReactNode;
  className?: string;
  surface?: 'sheet' | 'center';
  role?: 'dialog' | 'alertdialog';
  ariaLabel?: string;
  closeLabel?: string;
  showHandle?: boolean;
  trackHistory?: boolean;
  onClose: () => void;
  children?: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const surfaceClassName = `${surface === 'sheet' ? 'bottom-sheet ' : ''}${className}`.trim();

  return (
    <ModalLayer onClose={onClose} trackHistory={trackHistory}>
      <Box className="modal-backdrop" role="presentation" onMouseDown={onClose}>
        <Section
          className={surfaceClassName}
          data-modal-frame={surface}
          role={role}
          aria-modal="true"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabel ? undefined : titleId}
          aria-describedby={description ? descriptionId : undefined}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {showHandle && <Box className="sheet-handle" aria-hidden="true" />}
          <Box className="sheet-title">
            <Box>{eyebrow && <Inline className="eyebrow">{eyebrow}</Inline>}<Heading id={titleId}>{title}</Heading>{subtitle && <Paragraph>{subtitle}</Paragraph>}</Box>
            <Button type="button" onClick={onClose} aria-label={closeLabel}><Icon name="close" /></Button>
          </Box>
          {description && <Paragraph id={descriptionId}>{description}</Paragraph>}
          {children}
        </Section>
      </Box>
    </ModalLayer>
  );
}
