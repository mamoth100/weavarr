'use client';

import { useState } from 'react';

interface Props {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  imdbId?: string | null;
}

type Status = 'idle' | 'loading' | 'added' | 'already' | 'error';

export default function RequestButton({ id, mediaType, title, imdbId }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch(mediaType === 'movie' ? '/api/radarr/add' : '/api/sonarr/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mediaType === 'movie' ? { tmdbId: id } : { imdbId, title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Request failed');
      setStatus(data.alreadyAdded ? 'already' : 'added');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const label =
    status === 'loading' ? 'Requesting…' :
    status === 'added' ? 'Requested ✓' :
    status === 'already' ? 'Already in ' + (mediaType === 'movie' ? 'Radarr' : 'Sonarr') :
    status === 'error' ? 'Failed — retry' :
    mediaType === 'movie' ? 'Request (Radarr)' : 'Request (Sonarr)';

  return (
    <div className="inline-flex flex-col">
      <button
        onClick={handleClick}
        disabled={status === 'loading' || status === 'added' || status === 'already'}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
          ${
            status === 'added' || status === 'already'
              ? 'bg-green-600 text-white'
              : status === 'error'
              ? 'bg-red-600 text-white hover:bg-red-500'
              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
          }`}
        aria-label={`Request "${title}" download`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        {label}
      </button>
      {error && <p className="text-xs text-red-400 mt-1 max-w-xs">{error}</p>}
    </div>
  );
}
