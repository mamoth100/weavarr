'use client';

import { useEffect, useState } from 'react';

interface DownloadSlot {
  filename: string;
  status: string;
  mb?: string;
  mbleft?: string;
  percentage?: string;
  timeleft?: string;
  source: 'SABnzbd' | 'NZBGet';
}

interface DownloaderData {
  speedBps?: number;
  mbleft?: number;
  noofslots?: number;
  paused?: boolean;
  slots?: DownloadSlot[];
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
  downloadId?: string;
}

interface ArrData {
  error?: string;
  length?: number;
}

interface RecentImport {
  title: string;
  date: string;
  episode?: string | null;
  inLibrary: boolean | null;
}

interface CleanupCandidateItem {
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  viewedAt: string;
  episodeId: number;
  episodeFileId: number;
  reason: string;
}

interface CleanupError {
  error: string;
}

interface StatusResponse {
  downloader: DownloaderData | null;
  radarr: QueueItem[] | ArrData;
  sonarr: QueueItem[] | ArrData;
  recentImports?: RecentImport[];
  readyToCleanup?: CleanupCandidateItem[] | CleanupError;
}

function isCleanupError(data: CleanupCandidateItem[] | CleanupError): data is CleanupError {
  return !Array.isArray(data);
}

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatMb(mbStr: string | undefined): string {
  const mb = parseFloat(mbStr ?? '0');
  if (isNaN(mb)) return '-';
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || isNaN(bytes)) return '-';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

function formatSpeed(bytesPerSec: number | undefined): string {
  const v = bytesPerSec ?? 0;
  if (v >= 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB/s`;
  if (v >= 1024) return `${(v / 1024).toFixed(1)} KB/s`;
  return `${v.toFixed(0)} B/s`;
}

function formatTimeleft(timeleft: string | undefined): string {
  return timeleft && timeleft !== '00:00:00' ? ` · ${timeleft}` : '';
}

function isArrError(data: QueueItem[] | ArrData): data is ArrData {
  return !Array.isArray(data);
}

// Downloading has a direct percentage; post-processing entries (e.g.
// "Unpacking: 52/56 - 0:22 left") only have a fraction embedded in the text.
// "Queued" items always sit at 0% (haven't started downloading) - not worth a bar.
function extractProgressPercent(slot: DownloadSlot): number | null {
  if (slot.status === 'Queued') return null;
  if (slot.percentage !== undefined) return Number(slot.percentage);
  const match = slot.status.match(/(\d+)\/(\d+)/);
  if (!match) return null;
  return (Number(match[1]) / Number(match[2])) * 100;
}

// Combines SABnzbd and NZBGet into one queue (see lib/downloaders.ts) - each
// item keeps a "source" tag so it's clear which client is handling it.
// Renders nothing when neither client is enabled (data is null).
function DownloaderSection({ data }: { data: DownloaderData | null }) {
  if (!data) return null;

  return (
    <section>
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Downloader</h2>
      {data.error ? (
        <p className="text-red-400 text-sm">{data.error}</p>
      ) : (
        <>
          <div className="bg-zinc-900 rounded-lg p-4 ring-1 ring-white/5 mb-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Speed</span>
              <span className="font-medium">{data.paused ? 'Paused' : formatSpeed(data.speedBps)}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-zinc-400">Queue size</span>
              <span className="font-medium">{data.noofslots ?? 0} item{data.noofslots === 1 ? '' : 's'}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-zinc-400">Remaining</span>
              <span className="font-medium">{formatMb(String(data.mbleft ?? 0))}</span>
            </div>
          </div>
          {(!data.slots || data.slots.length === 0) ? (
            <p className="text-xs text-zinc-600">Queue is empty.</p>
          ) : (
            <div className="space-y-2">
              {data.slots.map((slot, i) => {
                const progress = extractProgressPercent(slot);
                return (
                  <div key={`${slot.source}-${slot.filename}-${i}`} className="bg-zinc-900 rounded-lg p-3 ring-1 ring-white/5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate" title={slot.filename}>{slot.filename}</p>
                      <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap px-1.5 py-0.5 bg-zinc-800 rounded">
                        {slot.source}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-zinc-500 mt-1">
                      <span className="text-amber-400">{slot.status}</span>
                      {slot.percentage !== undefined && (
                        <span className="text-amber-400">
                          {slot.status !== 'Queued' && `${slot.percentage}% · `}
                          {formatMb(slot.mbleft)} left{formatTimeleft(slot.timeleft)}
                        </span>
                      )}
                    </div>
                    {progress !== null && <ProgressBar percent={progress} />}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-1 bg-zinc-800 rounded-full mt-1.5 overflow-hidden">
      <div
        className="h-full bg-amber-400 rounded-full transition-all"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

// "importPending" / "importing" are normal transient states that resolve on
// their own within seconds - only offer manual import for genuinely stuck ones.
const STUCK_STATES = ['importBlocked', 'importFailed', 'failedPending', 'failed'];
function needsManualImport(trackedDownloadState: string): boolean {
  return STUCK_STATES.includes(trackedDownloadState);
}

function ImportButton({ service, downloadId }: { service: 'radarr' | 'sonarr'; downloadId?: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (!downloadId) return null;

  async function handleClick() {
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch(`/api/${service}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ downloadId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Import failed');
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={handleClick}
        disabled={status === 'loading' || status === 'done'}
        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
          status === 'done'
            ? 'bg-green-600 text-white'
            : status === 'error'
            ? 'bg-red-600 text-white hover:bg-red-500'
            : 'bg-amber-500 text-black hover:bg-amber-400'
        }`}
      >
        {status === 'loading' ? 'Importing…' : status === 'done' ? 'Import triggered' : status === 'error' ? 'Failed - retry' : 'Import'}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

function CleanupButton({ episodeId, episodeFileId }: { episodeId: number; episodeFileId: number }) {
  const [status, setStatus] = useState<'idle' | 'confirm' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch('/api/sonarr/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId, episodeFileId }),
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
    return <span className="text-xs font-medium text-green-400 mt-2 inline-block">Deleted</span>;
  }

  if (status === 'confirm' || status === 'loading') {
    return (
      <div className="flex items-center gap-2 mt-2">
        <span className="text-xs text-zinc-400">Delete this episode's file?</span>
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
    <div className="mt-2">
      <button
        onClick={() => setStatus('confirm')}
        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
          status === 'error' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-300 hover:bg-red-600 hover:text-white'
        }`}
      >
        {status === 'error' ? 'Failed - retry' : 'Delete episode'}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
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
    <div className="space-y-8">
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <DownloaderSection data={data.downloader} />

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
              <div key={item.downloadId ?? `${item.title}-${item.episode}-${i}`} className="bg-zinc-900 rounded-lg p-3 ring-1 ring-white/5">
                <p className="text-sm font-medium truncate">{item.title}{item.episode ? ` - ${item.episode}` : ''}</p>
                <div className="flex items-center justify-between text-xs text-zinc-500 mt-1">
                  <span className="text-amber-400">{item.trackedDownloadState ?? item.status}</span>
                  <span>{formatBytes(item.sizeleft)} left{formatTimeleft(item.timeleft)}</span>
                </div>
                {needsManualImport(item.trackedDownloadState) && (
                  <ImportButton service="sonarr" downloadId={item.downloadId} />
                )}
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
              <div key={item.downloadId ?? `${item.title}-${i}`} className="bg-zinc-900 rounded-lg p-3 ring-1 ring-white/5">
                <p className="text-sm font-medium truncate">{item.title}</p>
                <div className="flex items-center justify-between text-xs text-zinc-500 mt-1">
                  <span className="text-amber-400">{item.trackedDownloadState ?? item.status}</span>
                  <span>{formatBytes(item.sizeleft)} left{formatTimeleft(item.timeleft)}</span>
                </div>
                {needsManualImport(item.trackedDownloadState) && (
                  <ImportButton service="radarr" downloadId={item.downloadId} />
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>

    {/* Ready to Clean Up - episodes watched (per Plex) that still have a file in Sonarr */}
    {data.readyToCleanup && !isCleanupError(data.readyToCleanup) && data.readyToCleanup.length > 0 && (
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Ready to Clean Up</h2>
        <div className="space-y-2">
          {data.readyToCleanup.map((item) => (
            <div key={item.episodeId} className="bg-zinc-900 rounded-lg p-3 ring-1 ring-white/5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {item.showTitle} - S{String(item.seasonNumber).padStart(2, '0')}E{String(item.episodeNumber).padStart(2, '0')}
                </p>
                <span className="text-xs font-medium text-amber-400 whitespace-nowrap">{item.reason}</span>
              </div>
              <p className="text-xs text-zinc-500">Watched {timeAgo(item.viewedAt)}</p>
              <CleanupButton episodeId={item.episodeId} episodeFileId={item.episodeFileId} />
            </div>
          ))}
        </div>
      </section>
    )}

    {/* Recently Imported - cross-checked against your media server(s) */}
    {data.recentImports && data.recentImports.length > 0 && (
      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Recently Imported</h2>
        <div className="space-y-2">
          {data.recentImports.map((item) => (
            <div key={`${item.title}-${item.episode ?? ''}-${item.date}`} className="flex items-center justify-between bg-zinc-900 rounded-lg p-3 ring-1 ring-white/5">
              <div>
                <p className="text-sm font-medium">{item.title}{item.episode ? ` - ${item.episode}` : ''}</p>
                <p className="text-xs text-zinc-500">{timeAgo(item.date)}</p>
              </div>
              {item.inLibrary === null ? (
                <span className="text-xs text-zinc-600">Not checked</span>
              ) : item.inLibrary ? (
                <span className="text-xs font-medium text-green-400">In library</span>
              ) : (
                <span className="text-xs font-medium text-amber-400">Not in library yet</span>
              )}
            </div>
          ))}
        </div>
      </section>
    )}
    </div>
  );
}
