'use client';

import { useEffect, useRef, useState } from 'react';
import RequestShowModal from '@/components/RequestShowModal';
import { refreshDownloadProgressSoon } from '@/hooks/useDownloadProgress';

interface Props {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  release_date: string;
  /** Fired on a successful add so the card can flip to its "requested" state immediately. */
  onRequested: () => void;
}

const ARM_TIMEOUT_MS = 5000;

/**
 * Request straight from a browse card - fourth pill in the action column.
 * Shows open the request modal (season picking); movies use the same
 * two-click armed pattern as the delete buttons, because a single stray tap
 * on a card starting a multi-GB download is a nasty surprise. Detail pages
 * keep their one-click movie add - a deliberate, larger target.
 */
export default function CardRequestPill({ id, mediaType, title, poster_path, release_date, onRequested }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'armed' | 'busy' | 'error'>('idle');
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (disarmTimer.current) clearTimeout(disarmTimer.current);
    },
    []
  );

  function handleSuccess() {
    refreshDownloadProgressSoon();
    onRequested();
  }

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (mediaType === 'tv') {
      setModalOpen(true);
      return;
    }
    if (state === 'idle') {
      setState('armed');
      if (disarmTimer.current) clearTimeout(disarmTimer.current);
      disarmTimer.current = setTimeout(() => setState((s) => (s === 'armed' ? 'idle' : s)), ARM_TIMEOUT_MS);
      return;
    }
    if (state === 'busy') return;
    if (disarmTimer.current) clearTimeout(disarmTimer.current);
    setState('busy');
    try {
      const res = await fetch('/api/radarr/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdbId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Request failed');
      handleSuccess();
    } catch {
      setState('error');
    }
  }

  const label =
    mediaType === 'tv' ? 'Request' :
    state === 'armed' ? 'Add movie?' :
    state === 'busy' ? 'Adding…' :
    state === 'error' ? 'Failed - retry' :
    'Request';

  const armedStyle = state === 'armed' || state === 'error'
    ? 'bg-amber-400 text-zinc-950 opacity-100'
    : 'bg-black/70 text-white ring-1 ring-white/30 shadow-lg backdrop-blur-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 touch:opacity-100';

  return (
    <>
      <button
        onClick={handleClick}
        disabled={state === 'busy'}
        className={`absolute top-20 touch:top-[6.5rem] left-2 z-10 flex items-center gap-1 px-2 py-1 touch:px-2.5 touch:py-2 rounded-md text-xs font-semibold transition-all duration-200 disabled:opacity-100 ${armedStyle}`}
        aria-label={`Request "${title}"`}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        {label}
      </button>
      {mediaType === 'tv' && (
        <RequestShowModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={title}
          imdbId={null}
          seasons={[]}
          tmdbId={id}
          highestConfigured
          onSuccess={() => handleSuccess()}
        />
      )}
    </>
  );
}
