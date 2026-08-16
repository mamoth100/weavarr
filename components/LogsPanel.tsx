'use client';

import { useCallback, useEffect, useState } from 'react';

/** The Plex chip's payoff: Plex is the one connected service with no way to read its logs, and the chip owes users an explanation. */
function PlexExcuseModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Why there are no Plex logs"
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-w-md w-full p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-white">Where are the Plex logs?</h3>
        <p className="text-sm text-zinc-300">
          There aren&apos;t any. Plex sucks with pulling logs with their API. No sugar coating this.
        </p>
        <p className="text-sm text-zinc-400">
          Every other service here hands over its recent log entries through a simple API call. Plex has no way to
          read its logs remotely at all - its only mechanism is downloading a multi-megabyte diagnostics zip of every
          rotated log file, which is not a thing a log viewer can politely do every 15 seconds.
        </p>
        <p className="text-sm text-zinc-400">
          The good news: everything Weavarr does <span className="text-zinc-200">with</span> Plex - sign-in, watched
          sync, watchlist sync - logs under the <span className="text-amber-300">Weavarr</span> source with real error
          messages. Only Plex&apos;s internal chatter is missing, and that lives in its server settings if you ever
          truly need it.
        </p>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-black hover:bg-amber-400"
          >
            Fair enough
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [plexConfigured, setPlexConfigured] = useState(false);
  const [showPlexModal, setShowPlexModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<'all' | 'warn' | 'error'>('all');
  const [sourceFilter, setSourceFilter] = useState<LogSource | 'all'>('all');

  // SAB's full log is a multi-megabyte fetch on its side, so it's only
  // requested while the SABnzbd chip is selected - the always-on feed
  // carries just its warnings/errors. sourceFilter in the deps makes chip
  // changes refetch immediately.
  const refresh = useCallback(() => {
    fetch(`/api/service-logs${sourceFilter === 'sabnzbd' ? '?sabFull=1' : ''}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setLogs(data.logs ?? []);
        setSources(data.sources ?? []);
        setPlexConfigured(Boolean(data.plexConfigured));
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [sourceFilter]);

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
          newest first). SABnzbd&apos;s always-on feed carries only its warnings and errors - select its chip to
          load the full log (minus its very chatty debug lines).
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
        {plexConfigured && (
          <button
            onClick={() => setShowPlexModal(true)}
            title="Why no Plex logs?"
            className="px-3 py-1.5 rounded-full text-sm font-medium bg-zinc-800/60 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 border border-dashed border-zinc-700 transition-colors"
          >
            Plex*
          </button>
        )}
      </div>

      {showPlexModal && <PlexExcuseModal onClose={() => setShowPlexModal(false)} />}

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
