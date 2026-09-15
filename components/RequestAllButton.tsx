'use client';

import { useEffect, useRef, useState } from 'react';
import { useLibraryStatus, invalidateLibraryStatus } from '@/hooks/useLibraryStatus';
import { refreshDownloadProgressSoon } from '@/hooks/useDownloadProgress';
import { buttonClass, armedButtonClass } from '@/components/buttonClass';

interface Movie {
  id: number;
  title: string;
  release_date: string;
}

const ARM_TIMEOUT_MS = 6000;

/**
 * Adds every movie in a collection that is not already in Radarr, one after
 * another so Radarr is not hit with a burst. Two clicks to start, same as
 * every other action that kicks off downloads. Movies not yet released are
 * added too: Radarr monitors them and grabs them when they come out.
 */
export default function RequestAllButton({ movies }: { movies: Movie[] }) {
  const status = useLibraryStatus();
  const [state, setState] = useState<'idle' | 'armed' | 'busy' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState<{ done: number; total: number; failed: string[] }>({ done: 0, total: 0, failed: [] });
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (disarmTimer.current) clearTimeout(disarmTimer.current); }, []);

  if (status === null) return null;
  const missing = movies.filter((m) => !status.movies[m.id]);

  if (state === 'done') {
    const added = progress.total - progress.failed.length;
    return (
      <div className="text-sm">
        <span className="text-green-400 font-medium">Added {added} of {progress.total}.</span>
        {progress.failed.length > 0 && <p className="text-xs text-red-400 mt-1">Failed: {progress.failed.join(', ')}</p>}
      </div>
    );
  }
  if (missing.length === 0) return <span className="text-sm text-zinc-500">Every movie in this collection is already in your library or requested.</span>;

  async function run() {
    setState('busy');
    const failed: string[] = [];
    setProgress({ done: 0, total: missing.length, failed });
    for (const m of missing) {
      try {
        const res = await fetch('/api/radarr/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tmdbId: m.id }),
        });
        if (!res.ok) failed.push(m.title);
      } catch {
        failed.push(m.title);
      }
      setProgress((p) => ({ ...p, done: p.done + 1, failed: [...failed] }));
    }
    invalidateLibraryStatus();
    refreshDownloadProgressSoon();
    setState('done');
  }

  function arm() {
    setState('armed');
    if (disarmTimer.current) clearTimeout(disarmTimer.current);
    disarmTimer.current = setTimeout(() => setState((s) => (s === 'armed' ? 'idle' : s)), ARM_TIMEOUT_MS);
  }

  if (state === 'busy') {
    return (
      <button disabled className={armedButtonClass()}>
        Adding {Math.min(progress.done + 1, progress.total)} of {progress.total}…
      </button>
    );
  }
  if (state === 'armed') {
    return (
      <button onClick={run} className={armedButtonClass()}>
        Add {missing.length} movie{missing.length === 1 ? '' : 's'} to Radarr?
      </button>
    );
  }
  return (
    <button onClick={arm} className={buttonClass({ tone: 'primary' })}>
      Request all ({missing.length} missing)
    </button>
  );
}
