import path from 'path';
import { readdir, rm, stat } from 'fs/promises';

/**
 * TMDB artwork never loads straight from TMDB in the browser: every image
 * goes through the app's image optimizer, which fetches it once and keeps
 * the result on disk. In Docker that folder is linked into the data volume
 * (see docker-entrypoint.sh) so it survives updates. Nothing else ever
 * removes entries, so this daily sweep drops the ones that expired more than
 * thirty days ago, which is artwork nobody has looked at in two months.
 */
const CACHE_DIR = path.join(process.cwd(), '.next', 'cache', 'images');
const KEEP_EXPIRED_MS = 30 * 24 * 60 * 60 * 1000;

export async function sweepImageCache(): Promise<void> {
  const entries = await readdir(CACHE_DIR, { withFileTypes: true }).catch(() => null);
  if (!entries) return; // no cache yet, or not the standalone layout
  const now = Date.now();
  let removed = 0;
  let kept = 0;
  let bytes = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(CACHE_DIR, entry.name);
    const files = await readdir(dir).catch(() => [] as string[]);
    // Entry files are named "<maxAge>.<expireAt>.<etag>.<ext>".
    const expireAt = Math.max(0, ...files.map((f) => Number(f.split('.')[1]) || 0));
    if (files.length === 0 || (expireAt > 0 && expireAt + KEEP_EXPIRED_MS < now)) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      removed += 1;
      continue;
    }
    kept += 1;
    for (const f of files) bytes += (await stat(path.join(dir, f)).catch(() => null))?.size ?? 0;
  }
  if (removed > 0) console.log(`[imageCacheSweep] removed ${removed} stale image${removed === 1 ? '' : 's'}, ${kept} kept (${Math.round(bytes / 1024 / 1024)} MB)`);
}
