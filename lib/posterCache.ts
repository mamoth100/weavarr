import { mkdir, readFile, writeFile, unlink } from 'fs/promises';
import path from 'path';

/**
 * Poster thumbnails downloaded once from Radarr/Sonarr and kept on disk
 * indefinitely, rather than proxying a fresh request to Radarr/Sonarr on
 * every page load - matters once a library gets into the thousands of
 * titles and every Library/Ready to Watch load would otherwise mean
 * hundreds of round-trips to Radarr/Sonarr just for thumbnails.
 */
const POSTER_DIR = path.join(process.cwd(), 'data', 'posters');

function cachePath(service: 'radarr' | 'sonarr', id: number): string {
  return path.join(POSTER_DIR, service, `${id}.jpg`);
}

/** Serves a poster from local disk cache, downloading and caching it first on a cache miss. Returns null if Radarr/Sonarr has no poster for this id (a 404 there isn't cached, so it's retried next time - covers a title whose poster hasn't synced yet). */
export async function getCachedPoster(
  service: 'radarr' | 'sonarr',
  id: number,
  baseUrl: string,
  apiKey: string
): Promise<Buffer | null> {
  const file = cachePath(service, id);
  try {
    return await readFile(file);
  } catch {
    // not cached yet - fall through and fetch it
  }

  const res = await fetch(`${baseUrl}/MediaCover/${id}/poster.jpg`, { headers: { 'X-Api-Key': apiKey } });
  if (!res.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buffer);
  return buffer;
}

/** Removes a cached poster - call whenever the underlying movie/series is deleted so the cache doesn't accumulate images for things that no longer exist. */
export async function deleteCachedPoster(service: 'radarr' | 'sonarr', id: number): Promise<void> {
  try {
    await unlink(cachePath(service, id));
  } catch {
    // wasn't cached - nothing to clean up
  }
}
