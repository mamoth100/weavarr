'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Sticky footer row (action buttons). Scrolling happens in the body above it. */
  footer?: ReactNode;
  /** Wider card (max-w-3xl) for content that needs room - video embeds, tables. */
  wide?: boolean;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The one modal shell for the whole app - overlay, centered card, Escape and
 * outside-click close, scrollable body with a sticky footer. Feature modals
 * (request flow, Plex logs explainer, whatever comes next) provide only
 * their content, so every dialog opens/closes/looks the same.
 *
 * Keyboard: focus moves into the card on open, Tab cycles inside it, and
 * focus returns to whatever opened it on close. Without that a keyboard
 * user tabbed through the whole page behind the overlay before reaching
 * the season checkboxes.
 */
export default function Modal({ open, onClose, title, children, footer, wide = false }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);
  // Read through a ref so the effect below depends on `open` alone. Callers
  // pass a fresh onClose arrow on every render; depending on it re-ran the
  // effect per render, and each teardown handed focus back to the opener,
  // so focus never settled inside the dialog.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    const card = cardRef.current;
    // Defer a tick so the children have rendered and can take focus. A
    // timer, not requestAnimationFrame: frames do not run while the tab is
    // in the background, and a dialog opened from a script or a background
    // tab would then never take focus at all.
    const raf = setTimeout(() => {
      const first = card?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? card)?.focus();
    }, 0);

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !card) return;
      const focusables = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) {
        e.preventDefault();
        card.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !card.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !card.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => {
      clearTimeout(raf);
      document.removeEventListener('keydown', handleKey);
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    // Phones get a bottom sheet (full-width, pinned to the bottom edge,
    // taller); sm+ keeps the centered card. Same dialog, different skin.
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        className={`bg-zinc-900 border border-zinc-700 rounded-t-xl sm:rounded-xl shadow-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-md'} w-full max-h-[92vh] sm:max-h-[85vh] flex flex-col outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-base font-semibold text-white">{title}</h3>
        </div>
        <div className="px-5 pb-4 overflow-y-auto flex-1 min-h-0">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-zinc-800 flex items-center justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}
