'use client';

import { useState } from 'react';

interface Props {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
}

type State = 'idle' | 'loading' | 'added' | 'exists' | 'error';

export default function ArrButton({ tmdbId, mediaType }: Props) {
  const [state, setState] = useState<State>('idle');

  async function handle() {
    setState('loading');
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdbId, mediaType }),
      });
      const { status } = await res.json();
      setState(status ?? 'error');
    } catch {
      setState('error');
    }
  }

  const label = mediaType === 'tv' ? 'Sonarr' : 'Radarr';

  const styles: Record<State, string> = {
    idle:    'bg-zinc-800 text-zinc-300 hover:bg-zinc-700',
    loading: 'bg-zinc-800 text-zinc-500 cursor-wait',
    added:   'bg-indigo-600 text-white',
    exists:  'bg-zinc-700 text-zinc-400',
    error:   'bg-zinc-800 text-zinc-600 cursor-default',
  };

  const text: Record<State, string> = {
    idle:    `⬇ Add to ${label}`,
    loading: 'Adding…',
    added:   `✓ Added to ${label}`,
    exists:  'Already in library',
    error:   `${label} unreachable`,
  };

  return (
    <button
      onClick={state === 'idle' ? handle : undefined}
      disabled={state === 'loading'}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${styles[state]}`}
    >
      {text[state]}
    </button>
  );
}

interface Props {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
}

type State = 'idle' | 'loading' | 'added' | 'exists' | 'error';

export default function ArrButton({ tmdbId, mediaType }: Props) {
  const [state, setState] = useState<State>('idle');

  async function handle() {
    setState('loading');
    const result = mediaType === 'tv'
      ? await addToSonarr(tmdbId)
      : await addToRadarr(tmdbId);
    setState(result);
  }

  const label = mediaType === 'tv' ? 'Sonarr' : 'Radarr';

  const styles: Record<State, string> = {
    idle:    'bg-zinc-800 text-zinc-300 hover:bg-zinc-700',
    loading: 'bg-zinc-800 text-zinc-500 cursor-wait',
    added:   'bg-indigo-600 text-white',
    exists:  'bg-zinc-700 text-zinc-400',
    error:   'bg-zinc-800 text-zinc-600 cursor-default',
  };

  const text: Record<State, string> = {
    idle:    `⬇ Add to ${label}`,
    loading: 'Adding…',
    added:   `✓ Added to ${label}`,
    exists:  'Already in library',
    error:   `${label} unreachable`,
  };

  return (
    <button
      onClick={state === 'idle' ? handle : undefined}
      disabled={state === 'loading'}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${styles[state]}`}
    >
      {text[state]}
    </button>
  );
}
