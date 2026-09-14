'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Local-list companion to InfiniteBrowse: these lists already hold ALL
 * their data client-side, so "pagination" was only a display slice - this
 * reveals another `step` items whenever the sentinel nears the viewport,
 * replacing the numbered page bars. Same IntersectionObserver + scroll
 * fallback pairing as InfiniteBrowse, and the reveal uses a pure state
 * updater (StrictMode double-invokes updaters - see InfiniteBrowse for the
 * bug that lesson came from).
 *
 * `resetKey`: anything that means "this is a different list now" (search
 * query, tab) - changing it snaps back to the first `step` items.
 */
export function useInfiniteReveal(total: number, resetKey: unknown, step = 50) {
  const [visible, setVisible] = useState(step);
  // A callback ref, not useRef: every caller renders a loading state first,
  // so on the first commit there is no sentinel. An effect keyed only on
  // `step` ran once, found nothing, and never looked again, which capped
  // every list at the first `step` rows for good.
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const sentinelRef = useCallback((node: HTMLDivElement | null) => setSentinel(node), []);
  const totalRef = useRef(total);
  totalRef.current = total;

  // eslint-disable-next-line react-hooks/exhaustive-deps -- resetKey is exactly the "different list now" signal
  useEffect(() => {
    setVisible(step);
  }, [resetKey, step]);

  useEffect(() => {
    if (!sentinel) return;

    function reveal() {
      setVisible((v) => (v < totalRef.current ? v + step : v));
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) reveal();
      },
      { rootMargin: '600px 0px' }
    );
    observer.observe(sentinel);

    function check() {
      if (sentinel && sentinel.getBoundingClientRect().top < window.innerHeight + 600) reveal();
    }
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    // The sentinel can already be in view on a short list or tall screen.
    check();

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [sentinel, step]);

  return { visible, sentinelRef };
}
