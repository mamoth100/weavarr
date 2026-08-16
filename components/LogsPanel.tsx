'use client';

import { useCallback, useEffect, useState } from 'react';

type LogSource = 'weavarr' | 'radarr' | 'sonarr' | 'sabnzbd' | 'nzbget' | 'jellyfin';

interface LogEntry {
  ts: string;
  level: 'log' | 'warn' | 'error';
  source: LogSource;
  message: string;
}

interface SourceStatus {
  id: LogSource;
  ok: boolean;
  error?: string;
}

const LEVEL_STYLE: Record<LogEntry['level'], string> = {
  log: 'text-zinc-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
};

// The whole row reads in the level's color, not just the little LEVEL tag -
// scanning a merged timeline for problems shouldn't require reading tags.
const MESSAGE_STYLE: Record<LogEntry['level'], string> = {
  log: 'text-zinc-300',
  warn: 'text-amber-200',
  error: 'text-red-300',
};

const ROW_STYLE: Record<LogEntry['level'], string> = {
  log: '',
  warn: 'bg-amber-500/5',
  error: 'bg-red-500/10',
};

const SOURCE_LABEL: Record<LogSource, string> = {
  weavarr: 'Weavarr',
  radarr: 'Radarr',
  sonarr: 'Sonarr',
  sabnzbd: 'SABnzbd',
  nzbget: 'NZBGet',
  jellyfin: 'Jellyfin',
};

// One accent per source so a merged timeline stays scannable.
const SOURCE_STYLE: Record<LogSource, string> = {
  weavarr: 'text-amber-300',
  radarr: 'text-yellow-500',
  sonarr: 'text-sky-400',
  sabnzbd: 'text-orange-400',
  nzbget: 'text-green-400',
  jellyfin: 'text-purple-400',
};

const REFRESH_INTERVAL_MS = 15_000;

/** Settings > Logs: one merged timeline of Weavarr's own log plus every connected service that exposes logs (Radarr, Sonarr, SABnzbd, NZBGet, Jellyfin - Plex offers no way to read its logs). */
export default function LogsPanel() {
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<'all' | 'warn' | 'error'>('all');
  const [sourceFilter, setSourceFilter] = useState<LogSource | 'all'>('all');

  const refresh = useCallback(() => {
    fetch('/api/service-logs', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setLogs(data.logs ?? []);
        setSources(data.sources ?? []);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const filtered = (logs ?? []).filter(
    (l) =>
      (sourceFilter === 'all' || l.source === sourceFilter) &&
      (levelFilter === 'all' ? true : levelFilter === 'error' ? l.level === 'error' : l.level !== 'log')
  );

  const failedSources = sources.filter((s) => !s.ok);

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-400 space-y-1">
        <p>
          Recent activity from Weavarr and every connected service that exposes its logs (refreshes every 15s,
          newest first). SABnzbd only shares warnings and errors, not its full log.
        </p>
        <p>
          No Plex here - Plex has no way to read its logs remotely (yes, Plex sucks). Weavarr&apos;s own
          conversations with Plex still show under the Weavarr source.
        </p>
      </div>

      <section className="space-y-3">
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Recent Activity</h2>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setSourceFilter('all')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            sourceFilter === 'all' ? 'bg-white text-zinc-950' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
          }`}
        >
          All sources
        </button>
        {sources.map((s) => (
          <button
            key={s.id}
            onClick={() => setSourceFilter(s.id)}
            title={s.ok ? undefined : `Failed to fetch: ${s.error}`}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              sourceFilter === s.id ? 'bg-white text-zinc-950' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            } ${s.ok ? '' : 'opacity-50 line-through'}`}
          >
            {SOURCE_LABEL[s.id]}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {([['all', 'All levels'], ['warn', 'Warnings+'], ['error', 'Errors only']] as const).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setLevelFilter(value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              levelFilter === value ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={refresh}
          className="ml-auto px-3 py-1.5 rounded-full text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
        >
          Refresh
        </button>
      </div>

      {failedSources.length > 0 && (
        <p className="text-xs text-red-400">
          Couldn&apos;t fetch: {failedSources.map((s) => SOURCE_LABEL[s.id]).join(', ')} - their entries are missing
          from the timeline.
        </p>
      )}

      {error && <p className="text-sm text-red-400">Failed to load logs: {error}</p>}

      {logs === null ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-6 bg-zinc-900 rounded animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {levelFilter === 'all' && sourceFilter === 'all' ? 'Nothing logged recently.' : 'No matching entries.'}
        </p>
      ) : (
        <div className="bg-zinc-900 rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800/60 font-mono text-xs overflow-x-auto">
          {filtered.map((l, i) => (
            <div key={`${l.source}-${l.ts}-${i}`} className={`px-3 py-1.5 flex gap-3 items-baseline ${ROW_STYLE[l.level]}`}>
              <span className="text-zinc-500 whitespace-nowrap">{new Date(l.ts).toLocaleTimeString()}</span>
              <span className={`w-16 flex-shrink-0 truncate ${SOURCE_STYLE[l.source]}`}>{SOURCE_LABEL[l.source]}</span>
              <span className={`uppercase w-10 flex-shrink-0 ${LEVEL_STYLE[l.level]}`}>{l.level}</span>
              <span className={`whitespace-pre-wrap break-all ${MESSAGE_STYLE[l.level]}`}>{l.message}</span>
            </div>
          ))}
        </div>
      )}
      </section>
    </div>
  );
}
