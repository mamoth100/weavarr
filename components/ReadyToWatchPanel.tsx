'use client';

import { useEffect, useState } from 'react';

interface ReadyToWatchItem {
  type: 'movie' | 'tv';
  id: number;
  title: string;
  year: number;
  unwatchedEpisodeCount?: number;
  sizeOnDisk: number;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

function DeleteButton({ item }: { item: ReadyToWatchItem }) {
  const [status, setStatus] = useState<'idle' | 'confirm' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setStatus('loading');
    setError(null);
    try {
      const url = item.type === 'movie' ? '/api/radarr/delete' : '/api/sonarr/delete';
      const body = item.type === 'movie' ? { movieId: item.id } : { seriesId: item.id };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (status === 'done') {
    return <span className="text-xs font-medium text-green-400">Deleted ✓</span>;
  }

  if (status === 'confirm' || status === 'loading') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-400">Delete this {item.type === 'movie' ? 'movie' : 'show'}?</span>
        <button
          onClick={handleConfirm}
          disabled={status === 'loading'}
          className="px-2.5 py-1 rounded-md text-xs font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-60"
        >
          {status === 'loading' ? 'Deleting…' : 'Yes, delete'}
        </button>
        <button
          onClick={() => setStatus('idle')}
          disabled={status === 'loading'}
          className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setStatus('confirm')}
        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
          status === 'error' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-300 hover:bg-red-600 hover:text-white'
        }`}
      >
        {status === 'error' ? 'Failed — retry' : 'Delete'}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

export default function ReadyToWatchPanel() {
  const [items, setItems] = useState<ReadyToWatchItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/api/ready-to-watch', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setItems(data.items);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) {
    return <p className="text-red-400 text-sm">Failed to load: {error}</p>;
  }

  if (!items) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 bg-zinc-900 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const filtered = items.filter((i) => i.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>{items.length} ready to watch</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by title…"
          className="bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-amber-500 placeholder:text-zinc-600"
        />
      </div>
      {filtered.length === 0 && (
        <p className="text-zinc-600 text-sm">Nothing unwatched right now — you're all caught up.</p>
      )}
      <div className="space-y-2">
        {filtered.map((item) => (
          <div key={`${item.type}-${item.id}`} className="flex items-center justify-between bg-zinc-900 rounded-lg p-3 ring-1 ring-white/5">
            <div>
              <p className="text-sm font-medium">
                {item.title} {item.year ? `(${item.year})` : ''}
                <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 align-middle">
                  {item.type === 'movie' ? 'Movie' : 'TV'}
                </span>
              </p>
              <p className="text-xs text-zinc-500">
                {item.type === 'tv' && `${item.unwatchedEpisodeCount} unwatched episode${item.unwatchedEpisodeCount === 1 ? '' : 's'} · `}
                {formatBytes(item.sizeOnDisk)}
              </p>
            </div>
            <DeleteButton item={item} />
          </div>
        ))}
      </div>
    </div>
  );
}
