'use client';

import { useCallback, useEffect, useState } from 'react';

interface LogEntry {
  ts: string;
  level: 'log' | 'warn' | 'error';
  message: string;
}

const LEVEL_STYLE: Record<LogEntry['level'], string> = {
  log: 'text-zinc-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
};

const REFRESH_INTERVAL_MS = 10_000;

/** Settings > Logs: the app's own recent log lines (in-memory ring buffer, newest first) - so "why is it broken" doesn't require docker logs over SSH. */
export default function LogsPanel() {
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'warn' | 'error'>('all');

  const refresh = useCallback(() => {
    fetch('/api/logs', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        setLogs(data.logs ?? []);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const filtered = (logs ?? []).filter((l) =>
    filter === 'all' ? true : filter === 'error' ? l.level === 'error' : l.level !== 'log'
  );

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-400">
        The app&apos;s own recent activity (last 500 lines, newest first, refreshes every 10s).
        Restarting the app clears it - for full history use the container logs.
      </div>

      <section className="space-y-3">
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Recent Activity</h2>

      <div className="flex items-center gap-2">
        {([['all', 'All'], ['warn', 'Warnings+'], ['error', 'Errors only']] as const).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === value ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
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

      {error && <p className="text-sm text-red-400">Failed to load logs: {error}</p>}

      {logs === null ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-6 bg-zinc-900 rounded animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {filter === 'all' ? 'Nothing logged since the last restart.' : 'No matching entries.'}
        </p>
      ) : (
        <div className="bg-zinc-900 rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800/60 font-mono text-xs overflow-x-auto">
          {filtered.map((l, i) => (
            <div key={`${l.ts}-${i}`} className="px-3 py-1.5 flex gap-3 items-baseline">
              <span className="text-zinc-500 whitespace-nowrap">{new Date(l.ts).toLocaleTimeString()}</span>
              <span className={`uppercase w-10 flex-shrink-0 ${LEVEL_STYLE[l.level]}`}>{l.level}</span>
              <span className="text-zinc-300 whitespace-pre-wrap break-all">{l.message}</span>
            </div>
          ))}
        </div>
      )}
      </section>
    </div>
  );
}
