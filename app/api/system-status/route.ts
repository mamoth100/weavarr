import { NextResponse } from 'next/server';
import { statfs } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

interface DiskRow {
  location: string;
  freeBytes: number;
  totalBytes: number;
}

// Weavarr's container only mounts its own config/data - the media disks
// belong to Radarr/Sonarr's world, and both expose exactly this via their
// diskspace API, so the media rows come from them instead of local statfs.
async function arrDiskspace(url: string | undefined, key: string | undefined): Promise<DiskRow[]> {
  if (!url || !key) return [];
  const res = await fetch(`${url.replace(/\/$/, '')}/api/v3/diskspace`, {
    headers: { 'X-Api-Key': key },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`diskspace failed: ${res.status}`);
  const rows: { path?: string; freeSpace?: number; totalSpace?: number }[] = await res.json();
  return rows
    .filter((r) => r.path && typeof r.freeSpace === 'number' && typeof r.totalSpace === 'number')
    .map((r) => ({ location: r.path as string, freeBytes: r.freeSpace as number, totalBytes: r.totalSpace as number }));
}

async function localDisk(dir: string): Promise<DiskRow | null> {
  try {
    const s = await statfs(dir);
    return { location: dir, freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize };
  } catch {
    return null;
  }
}

export async function GET() {
  const radarrEnabled = process.env.ENABLE_RADARR !== 'false';
  const sonarrEnabled = process.env.ENABLE_SONARR !== 'false';

  const dataDir = path.join(process.cwd(), 'data');
  const [appDisk, radarrDisks, sonarrDisks] = await Promise.all([
    localDisk(dataDir),
    arrDiskspace(radarrEnabled ? process.env.RADARR_URL : undefined, radarrEnabled ? process.env.RADARR_KEY : undefined).catch(() => []),
    arrDiskspace(sonarrEnabled ? process.env.SONARR_URL : undefined, sonarrEnabled ? process.env.SONARR_KEY : undefined).catch(() => []),
  ]);

  // Radarr and Sonarr usually watch the same volumes - collapse duplicates.
  const disks: DiskRow[] = [];
  const seen = new Set<string>();
  for (const d of [...(appDisk ? [{ ...appDisk, location: `${appDisk.location} (app data)` }] : []), ...radarrDisks, ...sonarrDisks]) {
    if (seen.has(d.location)) continue;
    seen.add(d.location);
    disks.push(d);
  }

  let version = 'unknown';
  try {
    version = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')).version ?? 'unknown';
  } catch {
    // standalone builds without package.json just show "unknown"
  }

  return NextResponse.json({
    disks,
    about: {
      version,
      nodeVersion: process.version,
      platform: `${process.platform} (${process.arch})`,
      docker: existsSync('/.dockerenv'),
      dataDirectory: dataDir,
      uptimeSeconds: Math.round(process.uptime()),
    },
  });
}
