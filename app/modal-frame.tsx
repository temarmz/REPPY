import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Icon from './ui-icon';

export const MODAL_LAYER_EVENT = 'reppy:modal-layer';

let openModalLayers = 0;

export function hasOpenModalLayers() {
  return openModalLayers > 0;
}

export function ModalLayer({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const historyCleanupTimer = useRef<number | null>(null);
  const modalId = `reppy-modal-${useId()}`;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (historyCleanupTimer.current) {
      window.clearTimeout(historyCleanupTimer.current);
      historyCleanupTimer.current = null;
    }
    openModalLayers += 1;
    document.body.classList.add('modal-open');
    window.dispatchEvent(new CustomEvent(MODAL_LAYER_EVENT, { detail: true }));
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const appShell = document.querySelector<HTMLElement>('.app-shell');
    if (appShell) {
      appShell.inert = true;
      appShell.setAttribute('aria-hidden', 'true');
    }
    const currentState = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
    if (currentState.reppyModal !== modalId) {
      window.history.pushState({ ...currentState, reppyModal: modalId }, '', window.location.href);
    }
    let focusFrame = window.requestAnimationFrame(() => {
      focusFrame = window.requestAnimationFrame(() => {
        const root = layerRef.current;
        const target = root?.querySelector<HTMLElement>('[autofocus], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])');
        target?.focus({ preventScroll: true });
      });
    });

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
    window.addEventListener('popstate', handleHistoryBack, { capture: true });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handleHistoryBack, { capture: true });
      openModalLayers = Math.max(0, openModalLayers - 1);
      document.body.classList.toggle('modal-open', openModalLayers > 0);
      window.dispatchEvent(new CustomEvent(MODAL_LAYER_EVENT, { detail: openModalLayers > 0 }));
      if (appShell && openModalLayers === 0) {
        appShell.inert = false;
        appShell.removeAttribute('aria-hidden');
      }
      historyCleanupTimer.current = window.setTimeout(() => {
        historyCleanupTimer.current = null;
        if (window.history.state?.reppyModal === modalId) window.history.back();
      }, 0);
      returnFocus?.focus({ preventScroll: true });
    };
  }, [modalId]);

  return createPortal(<div className="modal-layer-root" ref={layerRef}>{children}</div>, document.body);
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
  onClose: () => void;
  children?: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const surfaceClassName = `${surface === 'sheet' ? 'bottom-sheet ' : ''}${className}`.trim();

  return (
    <ModalLayer onClose={onClose}>
      <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
        <section
          className={surfaceClassName}
          data-modal-frame={surface}
          role={role}
          aria-modal="true"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabel ? undefined : titleId}
          aria-describedby={description ? descriptionId : undefined}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {showHandle && <div className="sheet-handle" aria-hidden="true" />}
          <div className="sheet-title">
            <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
            <button type="button" onClick={onClose} aria-label={closeLabel}><Icon name="close" /></button>
          </div>
          {description && <p id={descriptionId}>{description}</p>}
          {children}
        </section>
      </div>
    </ModalLayer>
  );
}
