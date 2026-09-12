import { fetchWithTimeout } from './fetchTimeout';

/**
 * Update awareness. Deploys are git pulls, so the truthful version is the
 * commit the running image was built from (GIT_SHA build arg, "unknown"
 * outside Docker). "An update is available" means GitHub's main has moved
 * past it. While the repo is private the unauthenticated API returns 404
 * and the whole check degrades to "unavailable" rather than an error.
 */

const REPO = 'mamoth100/weavarr';

export function localCommit(): string {
  // Images built by GitHub Actions carry the full 40-character commit id;
  // the Pi's local build passes the short one. Show the short form either way.
  return (process.env.GIT_SHA || 'unknown').slice(0, 7);
}

export interface UpdateStatus {
  /** Short SHA of GitHub's current main, or null when unreachable/private. */
  latest: string | null;
  /** true = main moved past this build; null = can't tell (no local SHA or no GitHub). */
  updateAvailable: boolean | null;
}

export async function checkForUpdate(): Promise<UpdateStatus> {
  const local = localCommit();
  try {
    const res = await fetchWithTimeout(`https://api.github.com/repos/${REPO}/commits/main`, {
      headers: { Accept: 'application/vnd.github+json' },
      // 6h cache: unauthenticated GitHub allows 60 requests/hour per IP,
      // and "did main move" doesn't need to be fresher than that.
      next: { revalidate: 21600 },
    });
    if (!res.ok) return { latest: null, updateAvailable: null };
    const sha = (await res.json()).sha as string | undefined;
    if (!sha) return { latest: null, updateAvailable: null };
    return {
      latest: sha.slice(0, 7),
      updateAvailable: local === 'unknown' ? null : !sha.startsWith(local),
    };
  } catch {
    return { latest: null, updateAvailable: null };
  }
}
