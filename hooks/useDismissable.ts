'use client';

import { useEffect, useRef, type RefObject } from 'react';

/** Closes a popover on a click outside `ref` or on Escape while `open`. The callback is read through a ref, so callers can pass an inline function. */
export function useDismissable(open: boolean, ref: RefObject<HTMLElement>, onDismiss: () => void): void {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismissRef.current();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismissRef.current();
    }
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, ref]);
}
