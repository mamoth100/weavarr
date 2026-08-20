/**
 * fetch with a deadline, used by every outbound service call (Radarr,
 * Sonarr, Plex, TMDB, notifiers...). Node's fetch otherwise waits on the
 * OS TCP timeout, over a minute on most systems, so one hung service could
 * hang a whole page render. The classic other-people's-networks bug: our
 * own stack answers in milliseconds, a stranger's NAS on WiFi does not.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

/** Configured deadline in ms. API_REQUEST_TIMEOUT is seconds in App Config; unset or invalid falls back to 10s. */
export function apiTimeoutMs(): number {
  const raw = Number(process.env.API_REQUEST_TIMEOUT);
  return Number.isFinite(raw) && raw > 0 ? raw * 1000 : DEFAULT_TIMEOUT_MS;
}

export async function fetchWithTimeout(url: string | URL, init: RequestInit = {}): Promise<Response> {
  const ms = apiTimeoutMs();
  try {
    // Caller-supplied init wins on conflict (nobody passes a signal today,
    // but if one ever does, their abort semantics should hold).
    return await fetch(url, { signal: AbortSignal.timeout(ms), ...init });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      let host = String(url);
      try {
        host = new URL(String(url)).host;
      } catch {}
      throw new Error(`No response from ${host} within ${Math.round(ms / 1000)}s`);
    }
    throw err;
  }
}
