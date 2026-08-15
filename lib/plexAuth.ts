/**
 * Plex PIN-based sign-in (the same flow Seerr/Overseerr and Plex's own apps
 * use): create a PIN, send the user to app.plex.tv/auth to log in on Plex's
 * own site, then poll the PIN until Plex attaches an authToken to it. That
 * token IS the X-Plex-Token the settings field wants - this exists because
 * finding the token by hand (the XML-view trick) is genuinely obscure.
 * The user's Plex password never touches this app.
 */
import { mkdir, readFile, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import path from 'path';

const CLIENT_ID_FILE = path.join(process.cwd(), 'data', 'plex-client-id');
const PRODUCT = 'Weavarr';

// Plex wants a stable per-install client identifier - the PIN poll must use
// the same identifier that created the PIN, and reusing it across sign-ins
// keeps Plex from listing every attempt as a brand-new device.
let cachedClientId: string | null = null;

export async function getPlexClientId(): Promise<string> {
  if (cachedClientId) return cachedClientId;
  try {
    cachedClientId = (await readFile(CLIENT_ID_FILE, 'utf8')).trim();
    if (cachedClientId) return cachedClientId;
  } catch {
    // first run - generate below
  }
  cachedClientId = randomUUID();
  await mkdir(path.dirname(CLIENT_ID_FILE), { recursive: true });
  await writeFile(CLIENT_ID_FILE, cachedClientId, 'utf8');
  return cachedClientId;
}

function plexHeaders(clientId: string) {
  return {
    Accept: 'application/json',
    'X-Plex-Product': PRODUCT,
    'X-Plex-Client-Identifier': clientId,
  };
}

export interface PlexPin {
  pinId: number;
  /** Plex's own login page, pre-wired to this PIN - open in a new tab/popup. */
  authUrl: string;
}

export async function createPlexPin(): Promise<PlexPin> {
  const clientId = await getPlexClientId();
  const res = await fetch('https://plex.tv/api/v2/pins?strong=true', {
    method: 'POST',
    headers: plexHeaders(clientId),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Plex PIN request failed: ${res.status}`);
  const data = await res.json();
  const authUrl =
    `https://app.plex.tv/auth#?clientID=${encodeURIComponent(clientId)}` +
    `&code=${encodeURIComponent(data.code)}` +
    `&context%5Bdevice%5D%5Bproduct%5D=${encodeURIComponent(PRODUCT)}`;
  return { pinId: data.id, authUrl };
}

/** The auth token once the user has approved the PIN on plex.tv, else null (PINs expire after ~15 minutes). */
export async function checkPlexPin(pinId: number): Promise<string | null> {
  const clientId = await getPlexClientId();
  const res = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
    headers: plexHeaders(clientId),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Plex PIN check failed: ${res.status}`);
  const data = await res.json();
  return data.authToken || null;
}
