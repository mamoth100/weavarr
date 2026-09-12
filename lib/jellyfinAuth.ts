/**
 * Request headers for Jellyfin's API. Jellyfin 12 dropped the legacy
 * X-Emby-Token header (every request came back 401 on a fresh 12.0 install,
 * 2026-09-12) and only accepts the Authorization form. The Authorization
 * form also works on 10.x (verified live against 10.11), so it is the only
 * one used. The Client/Device fields are what older servers expect to see
 * alongside the token; they cost nothing on newer ones.
 */
export function jellyfinHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `MediaBrowser Client="Weavarr", Device="Weavarr", DeviceId="weavarr", Version="1.0", Token="${apiKey}"`,
    Accept: 'application/json',
  };
}
