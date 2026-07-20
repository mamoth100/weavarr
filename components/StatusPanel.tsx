'use client';

import { useEffect, useState } from 'react';

interface SabSlot {
  filename: string;
  mb: string;
  mbleft: string;
  percentage: string;
  status: string;
  timeleft: string;
}

interface SabData {
  speed?: string;
  mbleft?: string;
  noofslots?: number;
  paused?: boolean;
  slots?: SabSlot[];
  error?: string;
}

interface QueueItem {
  title: string;
  episode?: string | null;
  status: string;
  trackedDownloadState: string;
  size: number;
  sizeleft: number;
  timeleft?: string;
}

interface ArrData {
  error?: string;
  length?: number;
}

interface StatusResponse {
  sab: SabData;
  radarr: QueueItem[] | ArrData;
  sonarr: QueueItem[] | ArrData;
}

function formatMb(mbStr: string | undefined): string {
  const mb = parseFloat(mbStr ?? '0');
  if (isNaN(mb)) return '—';
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || isNaN(bytes)) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

function formatTimeleft(timeleft: string | undefined): string {
  return timeleft && timeleft !== '00:00:00' ? ` · ${timeleft}` : '';
}

function isArrError(data: QueueItem[] | ArrData): data is ArrData {
  return !Array.isArray(data);
}

export default function StatusPanel() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch('/api/status', { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled) { setData(json); setError(null); }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }
    poll();
    const interval = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (error) {
    return <p className="text-red-400 text-sm">Failed to load status: {error}</p>;
  }

  if (!data) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-zinc-900 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* SABnzbd */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">SABnzbd</h2>
        {data.sab.error ? (
          <p className="text-red-400 text-sm">{data.sab.error}</p>
        ) : (
          <>
            <div className="bg-zinc-900 rounded-lg p-4 ring-1 ring-white/5 mb-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Speed</span>
                <span className="font-medium">{data.sab.paused ? 'Paused' : `${data.sab.speed ?? '0'}B/s`}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-zinc-400">Queue size</span>
                <span className="font-medium">{data.sab.noofslots ?? 0} item{data.sab.noofslots === 1 ? '' : 's'}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-zinc-400">Remaining</span>
                <span className="font-medium">{formatMb(data.sab.mbleft)}</span>
              </div>
            </div>
            {(!data.sab.slots || data.sab.slots.length === 0) ? (
              <p className="text-xs text-zinc-600">Queue is empty.</p>
            ) : (
              <div className="space-y-2">
                {data.sab.slots.map((slot, i) => (
                  <div key={i} className="bg-zinc-900 rounded-lg p-3 ring-1 ring-white/5">
                    <p className="text-sm font-medium truncate" title={slot.filename}>{slot.filename}</p>
                    <div className="flex items-center justify-between text-xs text-zinc-500 mt-1">
                      <span className="text-amber-400">{slot.status}</span>
                      <span>{slot.percentage}% · {formatMb(slot.mbleft)} left{formatTimeleft(slot.timeleft)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* Sonarr */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Sonarr</h2>
        {isArrError(data.sonarr) ? (
          <p className="text-red-400 text-sm">{data.sonarr.error}</p>
        ) : data.sonarr.length === 0 ? (
          <p className="text-xs text-zinc-600">Nothing in the queue.</p>
        ) : (
          <div className="space-y-2">
            {data.sonarr.map((item, i) => (
              <div key={i} className="bg-zinc-900 rounded-lg p-3 ring-1 ring-white/5">
                <p className="text-sm font-medium truncate">{item.title}{item.episode ? ` — ${item.episode}` : ''}</p>
                <div className="flex items-center justify-between text-xs text-zinc-500 mt-1">
                  <span className="text-amber-400">{item.trackedDownloadState ?? item.status}</span>
                  <span>{formatBytes(item.sizeleft)} left{formatTimeleft(item.timeleft)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Radarr */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Radarr</h2>
        {isArrError(data.radarr) ? (
          <p className="text-red-400 text-sm">{data.radarr.error}</p>
        ) : data.radarr.length === 0 ? (
          <p className="text-xs text-zinc-600">Nothing in the queue.</p>
        ) : (
          <div className="space-y-2">
            {data.radarr.map((item, i) => (
              <div key={i} className="bg-zinc-900 rounded-lg p-3 ring-1 ring-white/5">
                <p className="text-sm font-medium truncate">{item.title}</p>
                <div className="flex items-center justify-between text-xs text-zinc-500 mt-1">
                  <span className="text-amber-400">{item.trackedDownloadState ?? item.status}</span>
                  <span>{formatBytes(item.sizeleft)} left{formatTimeleft(item.timeleft)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
