'use client';

import { useEffect, useState } from 'react';

interface TmdbSeason {
  season_number: number;
  name: string;
  episode_count: number;
}

interface SonarrState {
  seriesId: number | null;
  episodes: { seasonNumber: number; episodeNumber: number; hasFile: boolean }[];
}

/**
 * Seerr-style per-season availability chips on the show detail page: green =
 * every episode on disk, amber = some, grey = none. Colors match the
 * availability badge and calendar legend. Renders nothing until Sonarr
 * knows the show - availability of a show you don't have is just noise.
 */
export default function SeasonAvailability({ tmdbId, seasons }: { tmdbId: number; seasons: TmdbSeason[] }) {
  const [state, setState] = useState<SonarrState | 'none' | null>(null);

  useEffect(() => {
    fetch(`/api/sonarr/series-state?tmdbId=${tmdbId}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setState(data && data.seriesId ? data : 'none'))
      .catch(() => setState('none'));
  }, [tmdbId]);

  if (state === null || state === 'none') return null;

  const onDiskBySeason = new Map<number, number>();
  for (const e of state.episodes) {
    if (e.hasFile) onDiskBySeason.set(e.seasonNumber, (onDiskBySeason.get(e.seasonNumber) ?? 0) + 1);
  }

  const rows = seasons
    .filter((s) => s.season_number >= 0 && s.episode_count > 0)
    .sort((a, b) => a.season_number - b.season_number)
    .map((s) => {
      const have = Math.min(onDiskBySeason.get(s.season_number) ?? 0, s.episode_count);
      const color = have >= s.episode_count ? 'bg-green-500' : have > 0 ? 'bg-amber-400' : 'bg-zinc-600';
      const label = s.season_number === 0 ? 'SP' : `S${s.season_number}`;
      const name = s.season_number === 0 ? 'Specials' : `Season ${s.season_number}`;
      return { key: s.season_number, label, color, title: `${name} · ${have} of ${s.episode_count} downloaded` };
    });

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-zinc-500 mr-1">Seasons</span>
      {rows.map((r) => (
        <span
          key={r.key}
          title={r.title}
          aria-label={r.title}
          className={`px-2 py-0.5 rounded-md text-xs font-semibold text-zinc-950 ${r.color}`}
        >
          {r.label}
        </span>
      ))}
    </div>
  );
}
