'use client';

import { useEffect, useState } from 'react';

interface DiskRow {
  location: string;
  freeBytes: number;
  totalBytes: number;
}

interface About {
  version: string;
  nodeVersion: string;
  platform: string;
  docker: boolean;
  dataDirectory: string;
  uptimeSeconds: number;
}

interface SystemStatus {
  disks: DiskRow[];
  about: About;
}

function formatGiB(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Settings > Status: Sonarr-style system page - disk space (app data volume + the media disks Radarr/Sonarr report) and an About block. */
export default function SystemStatusPanel() {
  const [data, setData] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/system-status', { cache: 'no-store' })
      .then((res) => res.json())
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) return <p className="text-sm text-red-400">Failed to load status: {error}</p>;

  if (!data) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-zinc-900 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const aboutRows: [string, string][] = [
    ['Version', data.about.version],
    ['Node.js', data.about.nodeVersion],
    ['Platform', data.about.platform],
    ['Docker', data.about.docker ? 'Yes' : 'No'],
    ['App data directory', data.about.dataDirectory],
    ['Uptime', formatUptime(data.about.uptimeSeconds)],
  ];

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-400">
        <p>Disk space for the app&apos;s data volume and the media disks Radarr/Sonarr report, plus version and runtime details.</p>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Disk Space</h2>
        {data.disks.length === 0 ? (
          <p className="text-xs text-zinc-500">No disk information available.</p>
        ) : (
          <div className="bg-zinc-900 rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800/60">
            <div className="hidden sm:grid grid-cols-[1fr_7rem_7rem_8rem] gap-3 px-4 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              <span>Location</span>
              <span className="text-right">Free</span>
              <span className="text-right">Total</span>
              <span />
            </div>
            {data.disks.map((d) => {
              const usedPct = d.totalBytes > 0 ? ((d.totalBytes - d.freeBytes) / d.totalBytes) * 100 : 0;
              return (
                <div key={d.location} className="grid grid-cols-1 sm:grid-cols-[1fr_7rem_7rem_8rem] gap-1 sm:gap-3 px-4 py-3 sm:items-center">
                  <span className="text-sm font-medium break-all">{d.location}</span>
                  <span className="text-sm text-zinc-300 sm:text-right">
                    <span className="sm:hidden text-zinc-500">Free: </span>
                    {formatGiB(d.freeBytes)}
                  </span>
                  <span className="text-sm text-zinc-300 sm:text-right">
                    <span className="sm:hidden text-zinc-500">Total: </span>
                    {formatGiB(d.totalBytes)}
                  </span>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mt-1 sm:mt-0" title={`${usedPct.toFixed(0)}% used`}>
                    <div
                      className={`h-full rounded-full ${usedPct >= 90 ? 'bg-red-500' : usedPct >= 75 ? 'bg-amber-400' : 'bg-sky-500'}`}
                      style={{ width: `${Math.min(100, Math.max(0, usedPct))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">About</h2>
        <div className="bg-zinc-900 rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800/60">
          {aboutRows.map(([label, value]) => (
            <div key={label} className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 px-4 py-2.5">
              <span className="text-sm text-zinc-500 sm:w-44 flex-shrink-0">{label}</span>
              <span className="text-sm font-medium break-all">{value}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
