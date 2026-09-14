'use client';

import { useEffect, useState } from 'react';

interface TraktData {
  rating: number;
  votes: number;
  watchers: number | null;
}

/**
 * Trakt rating for a title, fetched from the browser: Trakt's Cloudflare
 * protection blocks server-side calls. The client id comes from a small
 * runtime route rather than a NEXT_PUBLIC_ build-time value, so the id saved
 * in Settings is the one used, in the published image too.
 */
export default function TraktScore({ imdbId }: { imdbId: string }) {
  const [data, setData] = useState<TraktData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const clientId: string = await fetch('/api/trakt/client-id', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => (typeof d?.clientId === 'string' ? d.clientId : ''))
        .catch(() => '');
      if (cancelled) return;
      if (!clientId) {
        setLoading(false);
        return;
      }

      const headers = {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': clientId,
      };

      try {
        const [ratingsRes, statsRes] = await Promise.all([
          fetch(`https://api.trakt.tv/movies/${imdbId}/ratings`, { headers }),
          fetch(`https://api.trakt.tv/movies/${imdbId}/stats`, { headers }),
        ]);
        if (ratingsRes.ok) {
          const ratings = await ratingsRes.json();
          const stats = statsRes.ok ? await statsRes.json() : null;
          if (!cancelled) setData({ rating: ratings.rating, votes: ratings.votes, watchers: stats?.watchers ?? null });
        } else {
          // Not a movie id, or not found as one: resolve through search so
          // shows and specials get their rating too.
          const searchRes = await fetch(`https://api.trakt.tv/search/imdb/${imdbId}`, { headers });
          if (searchRes.ok) {
            const results = await searchRes.json();
            const first = results[0];
            const type = first?.type === 'show' ? 'shows' : 'movies';
            const slug = (first?.movie ?? first?.show)?.ids?.slug;
            if (slug) {
              const [r2, s2] = await Promise.all([
                fetch(`https://api.trakt.tv/${type}/${slug}/ratings`, { headers }),
                fetch(`https://api.trakt.tv/${type}/${slug}/stats`, { headers }),
              ]);
              if (r2.ok) {
                const ratings = await r2.json();
                const stats = s2.ok ? await s2.json() : null;
                if (!cancelled) setData({ rating: ratings.rating, votes: ratings.votes, watchers: stats?.watchers ?? null });
              }
            }
          }
        }
      } catch {
        // Trakt unreachable or blocked: the line simply does not render.
      }
      if (!cancelled) setLoading(false);
    }

    void load();
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
