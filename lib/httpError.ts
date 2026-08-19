/**
 * Human-sized error out of an arr-style error response. Radarr/Sonarr error
 * bodies carry a short "message" plus a multi-kilobyte .NET stack trace in
 * "description" - dumping the raw body into an Error meant the UI rendered
 * the entire stack trace to the user (seen live on the Watch page). Extract
 * the message; clamp anything unparseable.
 */
export async function readableApiError(res: Response, prefix: string): Promise<string> {
  let detail = `HTTP ${res.status}`;
  try {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      detail = parsed.message ?? parsed.error ?? text.slice(0, 160);
    } catch {
      if (text.trim()) detail = text.slice(0, 160);
    }
  } catch {
    // body unreadable - the status code is all we have
  }
  return `${prefix}: ${detail}`;
}
