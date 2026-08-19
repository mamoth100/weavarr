'use client';

import { useEffect, type ReactNode } from 'react';

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

/**
 * The one modal shell for the whole app - overlay, centered card, Escape and
 * outside-click close, scrollable body with a sticky footer. Feature modals
 * (request flow, Plex logs explainer, whatever comes next) provide only
 * their content, so every dialog opens/closes/looks the same.
 */
export default function Modal({ open, onClose, title, children, footer, wide = false }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl ${wide ? 'max-w-3xl' : 'max-w-md'} w-full max-h-[85vh] flex flex-col`}
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
