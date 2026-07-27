'use client';

import { useEffect, useState } from 'react';

interface TraktData {
  rating: number;
  votes: number;
  watchers: number | null;
}

export default function TraktScore({ imdbId }: { imdbId: string }) {
  const [data, setData] = useState<TraktData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_TRAKT_CLIENT_ID;
    if (!clientId) {
      setLoading(false);
      return;
    }

    const headers = {
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': clientId,
    };

    Promise.all([
      fetch(`https://api.trakt.tv/movies/${imdbId}/ratings`, { headers }),
      fetch(`https://api.trakt.tv/movies/${imdbId}/stats`, { headers }),
    ])
      .then(async ([ratingsRes, statsRes]) => {
        if (!ratingsRes.ok) {
          // Try search fallback for shows/specials
          const searchRes = await fetch(
            `https://api.trakt.tv/search/imdb/${imdbId}`,
            { headers }
          );
          if (searchRes.ok) {
            const results = await searchRes.json();
            const first = results[0];
            if (first) {
              const type = first.type === 'show' ? 'shows' : 'movies';
              const slug = (first.movie ?? first.show)?.ids?.slug;
              if (slug) {
                const [r2, s2] = await Promise.all([
                  fetch(`https://api.trakt.tv/${type}/${slug}/ratings`, { headers }),
                  fetch(`https://api.trakt.tv/${type}/${slug}/stats`, { headers }),
                ]);
                if (r2.ok) {
                  const ratings = await r2.json();
                  const stats = s2.ok ? await s2.json() : null;
                  setData({ rating: ratings.rating, votes: ratings.votes, watchers: stats?.watchers ?? null });
                }
              }
            }
          }
          setLoading(false);
          return;
        }
        const ratings = await ratingsRes.json();
        const stats = statsRes.ok ? await statsRes.json() : null;
        setData({ rating: ratings.rating, votes: ratings.votes, watchers: stats?.watchers ?? null });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [imdbId]);

  if (loading) {
    return (
      <div className="text-xs text-zinc-600 animate-pulse">Trakt: loading…</div>
    );
  }

  if (!data) return null;

  return (
    <>
      <div>
        Trakt:{' '}
        <span className="text-white">{data.rating.toFixed(1)}</span>
        <span className="text-zinc-600"> ({data.votes.toLocaleString()} votes)</span>
      </div>
      {data.watchers !== null && (
        <div className="text-zinc-500 text-xs mt-0.5">
          {data.watchers.toLocaleString()} watchers on Trakt
        </div>
      )}
    </>
  );
}
