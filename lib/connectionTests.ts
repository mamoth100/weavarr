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

async function testRadarr(url?: string, key?: string): Promise<TestResult> {
  if (!url || !key) return { ok: false, message: 'URL and API key required' };
  try {
    const base = url.replace(/\/$/, '');
    const res = await fetch(`${base}/api/v3/system/status`, {
      headers: { 'X-Api-Key': key },
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status} - check URL and key` };
    const data = await res.json();
    const profilesRes = await fetch(`${base}/api/v3/qualityprofile`, { headers: { 'X-Api-Key': key }, cache: 'no-store' });
    const profiles: QualityProfileOption[] = profilesRes.ok ? await profilesRes.json() : [];
    return { ok: true, message: `Connected - Radarr v${data.version ?? '?'}`, profiles };
  } catch (err) {
    return fail(err);
  }
}

async function testSonarr(url?: string, key?: string): Promise<TestResult> {
  if (!url || !key) return { ok: false, message: 'URL and API key required' };
  try {
    const base = url.replace(/\/$/, '');
    const res = await fetch(`${base}/api/v3/system/status`, {
      headers: { 'X-Api-Key': key },
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status} - check URL and key` };
    const data = await res.json();
    const profilesRes = await fetch(`${base}/api/v3/qualityprofile`, { headers: { 'X-Api-Key': key }, cache: 'no-store' });
    const profiles: QualityProfileOption[] = profilesRes.ok ? await profilesRes.json() : [];
    return { ok: true, message: `Connected - Sonarr v${data.version ?? '?'}`, profiles };
  } catch (err) {
    return fail(err);
  }
}

async function testSABnzbd(url?: string, key?: string): Promise<TestResult> {
  if (!url || !key) return { ok: false, message: 'URL and API key required' };
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/api?mode=version&apikey=${encodeURIComponent(key)}&output=json`, {
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
    const res = await fetch(`${url.replace(/\/$/, '')}/jsonrpc`, {
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
    const res = await fetch(`${url.replace(/\/$/, '')}/identity?X-Plex-Token=${encodeURIComponent(token)}`, {
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
    const res = await fetch(`${url.replace(/\/$/, '')}/System/Info`, {
      headers: { 'X-Emby-Token': apiKey, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status} - check URL and API key` };
    const data = await res.json();
    if (!data.Version) return { ok: false, message: 'Unexpected response - check API key' };
    if (username) {
      const usersRes = await fetch(`${url.replace(/\/$/, '')}/Users`, {
        headers: { 'X-Emby-Token': apiKey, Accept: 'application/json' },
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
    const res = await fetch('https://api.themoviedb.org/3/authentication', {
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
    const res = await fetch(`http://www.omdbapi.com/?apikey=${encodeURIComponent(key)}&i=tt0111161`, { cache: 'no-store' });
    const data = await res.json();
    if (data.Response !== 'True') return { ok: false, message: data.Error ?? 'Invalid key' };
    return { ok: true, message: 'Key valid' };
  } catch (err) {
    return fail(err);
  }
}

async function testPushover(userKey?: string, apiToken?: string): Promise<TestResult> {
  if (!userKey || !apiToken) return { ok: false, message: 'User key and API token required' };
  try {
    const body = new URLSearchParams({ token: apiToken, user: userKey });
    const res = await fetch('https://api.pushover.net/1/users/validate.json', { method: 'POST', body, cache: 'no-store' });
    const data = await res.json();
    if (data.status !== 1) return { ok: false, message: (data.errors ?? []).join(', ') || 'Invalid credentials' };
    return { ok: true, message: `Valid - ${(data.devices ?? []).length} device(s)` };
  } catch (err) {
    return fail(err);
  }
}

async function testWebhook(url?: string): Promise<TestResult> {
  if (!url) return { ok: false, message: 'Webhook URL required' };
  try {
    const res = await fetch(url, {
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
    const res = await fetch(url, {
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

async function testSupabase(url?: string, anonKey?: string): Promise<TestResult> {
  if (!url || !anonKey) return { ok: false, message: 'URL and anon key required' };
  try {
    // The bare /rest/v1/ root rejects publishable/anon keys ("secret key
    // required") on newer Supabase projects - query an actual table
    // Weavarr uses instead, which is what the anon key is really for.
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/favorites?select=id&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) return { ok: false, message: 'Rejected - check anon key' };
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
    return { ok: true, message: 'Reachable' };
  } catch (err) {
    return fail(err);
  }
}

export async function testGroup(group: string, values: Record<string, string>): Promise<TestResult> {
  switch (group) {
    case 'Radarr':
      return testRadarr(values.RADARR_URL, values.RADARR_KEY);
    case 'Sonarr':
      return testSonarr(values.SONARR_URL, values.SONARR_KEY);
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
    case 'Pushover':
      return testPushover(values.PUSHOVER_USER_KEY, values.PUSHOVER_API_TOKEN);
    case 'Webhook':
      return testWebhook(values.WEBHOOK_NOTIFY_URL);
    case 'Discord':
      return testDiscord(values.DISCORD_WEBHOOK_URL);
    case 'Supabase':
      return testSupabase(values.NEXT_PUBLIC_SUPABASE_URL, values.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    default:
      return { ok: false, message: 'No test available for this group' };
  }
}
