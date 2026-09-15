'use client';

import { useEffect, useState } from 'react';

interface TraktData {
  rating: number;
  votes: number;
  watchers: number | null;
}

/** Trakt rating for a title. The server fetches it (lib/trakt.ts), so no client id reaches the page and no CORS setup is needed on the Trakt app. */
export default function TraktScore({ imdbId }: { imdbId: string }) {
  const [data, setData] = useState<TraktData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/trakt/rating?imdbId=${encodeURIComponent(imdbId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.rating) setData(d.rating as TraktData);
      })
      .catch(() => {
        // Trakt unreachable or not configured: the line simply does not render.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [imdbId]);

  if (loading) {
    return <div className="text-xs text-zinc-500 animate-pulse">Trakt: loading…</div>;
  }

  if (!data) return null;

  return (
    <>
      <div>
        Trakt: <span className="text-white">{data.rating.toFixed(1)}</span>
        <span className="text-zinc-500"> ({data.votes.toLocaleString()} votes)</span>
      </div>
      {data.watchers !== null && (
        <div className="text-zinc-500 text-xs mt-0.5">{data.watchers.toLocaleString()} watchers on Trakt</div>
      )}
    </>
  );
}
