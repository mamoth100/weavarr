import { fetchWithTimeout } from './fetchTimeout';
import { jellyfinHeaders } from './jellyfinAuth';
export interface QualityProfileOption {
  id: number;
  name: string;
}

export interface TestResult {
  ok: boolean;
  message: string;
  /** Only populated for Radarr/Sonarr - the profiles available to pick as default/highest in Settings. */
  profiles?: QualityProfileOption[];
}

function fail(err: unknown): TestResult {
  return { ok: false, message: err instanceof Error ? err.message : String(err) };
}

/** Radarr and Sonarr share one API shape; the same probe serves both. */
async function testArr(name: 'Radarr' | 'Sonarr', url?: string, key?: string): Promise<TestResult> {
  if (!url || !key) return { ok: false, message: 'URL and API key required' };
  try {
    const base = url.replace(/\/$/, '');
    const res = await fetchWithTimeout(`${base}/api/v3/system/status`, {
      headers: { 'X-Api-Key': key },
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status} - check URL and key` };
    const data = await res.json();
    const profilesRes = await fetchWithTimeout(`${base}/api/v3/qualityprofile`, { headers: { 'X-Api-Key': key }, cache: 'no-store' });
    const profiles: QualityProfileOption[] = profilesRes.ok ? await profilesRes.json() : [];
    return { ok: true, message: `Connected - ${name} v${data.version ?? '?'}`, profiles };
  } catch (err) {
    return fail(err);
  }
}

async function testSABnzbd(url?: string, key?: string): Promise<TestResult> {
  if (!url || !key) return { ok: false, message: 'URL and API key required' };
  try {
    const res = await fetchWithTimeout(`${url.replace(/\/$/, '')}/api?mode=version&apikey=${encodeURIComponent(key)}&output=json`, {
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status} - check URL and key` };
    const data = await res.json();
    if (!data.version) return { ok: false, message: 'Unexpected response - check API key' };
    return { ok: true, message: `Connected - SABnzbd v${data.version}` };
  } catch (err) {
    return fail(err);
  }
}

async function testNzbget(url?: string, username?: string, password?: string): Promise<TestResult> {
  if (!url || !username || !password) return { ok: false, message: 'URL, username, and password required' };
  try {
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    const res = await fetchWithTimeout(`${url.replace(/\/$/, '')}/jsonrpc`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'version' }),
      cache: 'no-store',
    });
    if (res.status === 401) return { ok: false, message: 'Rejected - check username and password' };
    if (!res.ok) return { ok: false, message: `HTTP ${res.status} - check URL` };
    const data = await res.json();
    if (data.error) return { ok: false, message: data.error.message ?? 'Unexpected response' };
    return { ok: true, message: `Connected - NZBGet v${data.result}` };
  } catch (err) {
    return fail(err);
  }
}

async function testPlex(url?: string, token?: string): Promise<TestResult> {
  if (!url || !token) return { ok: false, message: 'URL and token required' };
  try {
    const res = await fetchWithTimeout(`${url.replace(/\/$/, '')}/identity?X-Plex-Token=${encodeURIComponent(token)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status} - check URL and token` };
    const data = await res.json();
    const version = data.MediaContainer?.version;
    if (!version) return { ok: false, message: 'Unexpected response - check token' };
    return { ok: true, message: `Connected - Plex v${version}` };
  } catch (err) {
    return fail(err);
  }
}

async function testJellyfin(url?: string, apiKey?: string, username?: string): Promise<TestResult> {
  if (!url || !apiKey) return { ok: false, message: 'URL and API key required' };
  try {
    const res = await fetchWithTimeout(`${url.replace(/\/$/, '')}/System/Info`, {
      headers: jellyfinHeaders(apiKey),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status} - check URL and API key` };
    const data = await res.json();
    if (!data.Version) return { ok: false, message: 'Unexpected response - check API key' };
    if (username) {
      const usersRes = await fetchWithTimeout(`${url.replace(/\/$/, '')}/Users`, {
        headers: jellyfinHeaders(apiKey),
        cache: 'no-store',
      });
      if (!usersRes.ok) return { ok: false, message: `Connected to Jellyfin v${data.Version}, but couldn't list users` };
      const users: { Name?: string }[] = await usersRes.json();
      const normalized = username.toLowerCase().trim();
      const found = users.some((u) => (u.Name ?? '').toLowerCase().trim() === normalized);
      if (!found) return { ok: false, message: `Connected to Jellyfin v${data.Version}, but no user named "${username}"` };
    }
    return { ok: true, message: `Connected - Jellyfin v${data.Version}${username ? '' : ' (no username set yet)'}` };
  } catch (err) {
    return fail(err);
  }
}

async function testTMDB(token?: string): Promise<TestResult> {
  if (!token) return { ok: false, message: 'Token required' };
  try {
    const res = await fetchWithTimeout('https://api.themoviedb.org/3/authentication', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const data = await res.json();
    if (!res.ok || !data.success) return { ok: false, message: data.status_message ?? `HTTP ${res.status}` };
    return { ok: true, message: 'Token valid' };
  } catch (err) {
    return fail(err);
  }
}

async function testOMDb(key?: string): Promise<TestResult> {
  if (!key) return { ok: false, message: 'API key required' };
  try {
    const res = await fetchWithTimeout(`http://www.omdbapi.com/?apikey=${encodeURIComponent(key)}&i=tt0111161`, { cache: 'no-store' });
    const data = await res.json();
    if (data.Response !== 'True') return { ok: false, message: data.Error ?? 'Invalid key' };
    return { ok: true, message: 'Key valid' };
  } catch (err) {
    return fail(err);
  }
}

async function testTrakt(clientId?: string): Promise<TestResult> {
  if (!clientId) return { ok: false, message: 'Client ID required' };
  try {
    const res = await fetchWithTimeout('https://api.trakt.tv/movies/popular?limit=1', {
      headers: { 'Content-Type': 'application/json', 'trakt-api-version': '2', 'trakt-api-key': clientId },
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status} - check the Client ID` };
    return { ok: true, message: 'Client ID valid' };
  } catch (err) {
    return fail(err);
  }
}

async function testPushover(userKey?: string, apiToken?: string): Promise<TestResult> {
  if (!userKey || !apiToken) return { ok: false, message: 'User key and API token required' };
  try {
    const body = new URLSearchParams({ token: apiToken, user: userKey });
    const res = await fetchWithTimeout('https://api.pushover.net/1/users/validate.json', { method: 'POST', body, cache: 'no-store' });
    const data = await res.json();
    if (data.status !== 1) return { ok: false, message: (data.errors ?? []).join(', ') || 'Invalid credentials' };

    // Valid keys are not the same as a delivered message (a muted app, a
    // device that never registered, a quota that ran out), so actually send
    // one, the same way Discord's test does. Uses the values from the form,
    // not the saved env, so an unsaved key can be tested before saving.
    const sendRes = await fetchWithTimeout('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: apiToken, user: userKey, title: 'Weavarr test', message: 'Pushover is working. Notifications from Weavarr will arrive like this.' }),
      cache: 'no-store',
    });
    const sendData = await sendRes.json().catch(() => ({}));
    if (!sendRes.ok || sendData.status !== 1) {
      return { ok: false, message: `Keys are valid but sending failed: ${(sendData.errors ?? []).join(', ') || `HTTP ${sendRes.status}`}` };
    }
    const devices = (data.devices ?? []).length;
    return { ok: true, message: `Test notification sent to ${devices} device${devices === 1 ? '' : 's'} - check your phone` };
  } catch (err) {
    return fail(err);
  }
}

async function testWebhook(url?: string): Promise<TestResult> {
  if (!url) return { ok: false, message: 'Webhook URL required' };
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Weavarr test',
        message: 'This is a test notification from Weavarr.',
        timestamp: new Date().toISOString(),
      }),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status} - check the URL` };
    return { ok: true, message: 'Test notification sent' };
  } catch (err) {
    return fail(err);
  }
}

async function testDiscord(url?: string): Promise<TestResult> {
  if (!url) return { ok: false, message: 'Discord webhook URL required' };
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{ title: 'Weavarr test', description: 'This is a test notification from Weavarr.', color: 0xfbbf24, timestamp: new Date().toISOString() }],
      }),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status} - check the webhook URL` };
    return { ok: true, message: 'Test notification sent - check Discord' };
  } catch (err) {
    return fail(err);
  }
}

export async function testGroup(group: string, values: Record<string, string>): Promise<TestResult> {
  switch (group) {
    case 'Radarr':
      return testArr('Radarr', values.RADARR_URL, values.RADARR_KEY);
    case 'Sonarr':
      return testArr('Sonarr', values.SONARR_URL, values.SONARR_KEY);
    case 'SABnzbd':
      return testSABnzbd(values.SABNZBD_URL, values.SABNZBD_API_KEY);
    case 'NZBGet':
      return testNzbget(values.NZBGET_URL, values.NZBGET_USERNAME, values.NZBGET_PASSWORD);
    case 'Plex':
      return testPlex(values.PLEX_URL, values.PLEX_TOKEN);
    case 'Jellyfin':
      return testJellyfin(values.JELLYFIN_URL, values.JELLYFIN_API_KEY, values.JELLYFIN_USER_ID);
    case 'TMDB':
      return testTMDB(values.TMDB_TOKEN);
    case 'OMDb':
      return testOMDb(values.OMDB_API_KEY);
    case 'Trakt':
      return testTrakt(values.TRAKT_CLIENT_ID);
    case 'Pushover':
      return testPushover(values.PUSHOVER_USER_KEY, values.PUSHOVER_API_TOKEN);
    case 'Webhook':
      return testWebhook(values.WEBHOOK_NOTIFY_URL);
    case 'Webpush': {
      try {
        const { sendWebpushNotification, subscriptionCount } = await import('./webpush');
        const count = subscriptionCount();
        if (count === 0) return { ok: false, message: 'No devices subscribed - use "Enable on this device" first (needs HTTPS)' };
        await sendWebpushNotification('Weavarr test', 'This is a test notification from Weavarr.');
        return { ok: true, message: `Test sent to ${count} device${count === 1 ? '' : 's'}` };
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    }
    case 'Discord':
      return testDiscord(values.DISCORD_WEBHOOK_URL);
    default:
      return { ok: false, message: 'No test available for this group' };
  }
}
