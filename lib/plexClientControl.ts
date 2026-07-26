const PLEX_URL = process.env.PLEX_URL;
const PLEX_TOKEN = process.env.PLEX_TOKEN;
const CONTROLLER_ID = 'docuview-controller';

export interface PlexClient {
  name: string;
  address: string;
  port: number;
  machineIdentifier: string;
  product: string;
}

/** Currently reachable, controllable Plex clients — e.g. the Shield's Plex app, once it's running. */
export async function getPlexClients(): Promise<PlexClient[]> {
  if (!PLEX_URL || !PLEX_TOKEN) throw new Error('Plex is not configured');
  const res = await fetch(`${PLEX_URL}/clients?X-Plex-Token=${PLEX_TOKEN}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Plex clients failed: ${res.status}`);
  const data = await res.json();
  const items: Record<string, unknown>[] = data.MediaContainer?.Server ?? [];
  return items.map((c) => ({
    name: c.name as string,
    address: c.address as string,
    port: Number(c.port),
    machineIdentifier: c.machineIdentifier as string,
    product: c.product as string,
  }));
}

async function getServerMachineIdentifier(): Promise<string> {
  const res = await fetch(`${PLEX_URL}/identity?X-Plex-Token=${PLEX_TOKEN}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Plex identity failed: ${res.status}`);
  const data = await res.json();
  const id = data.MediaContainer?.machineIdentifier;
  if (!id) throw new Error('Could not determine Plex server machine identifier');
  return id;
}

/**
 * Commands a specific Plex client to start playing a library item by its
 * ratingKey. NOT YET LIVE-VERIFIED — there was no reachable Plex client to
 * test against when this was written (nothing was running Plex on the LAN
 * at the time). This follows the standard, widely-used community pattern
 * for Plex's client-control API (the same mechanism behind "Cast to
 * device" in Plex's own apps), but needs a real end-to-end test against an
 * actual client — e.g. once the Shield is paired and Plex is launched on
 * it — before trusting it fully.
 */
export async function playOnClient(client: PlexClient, ratingKey: string): Promise<void> {
  if (!PLEX_URL || !PLEX_TOKEN) throw new Error('Plex is not configured');
  const serverMachineIdentifier = await getServerMachineIdentifier();

  const params = new URLSearchParams({
    key: `/library/metadata/${ratingKey}`,
    offset: '0',
    machineIdentifier: serverMachineIdentifier,
    protocol: 'http',
    address: client.address,
    port: String(client.port),
    commandID: '1',
    'X-Plex-Token': PLEX_TOKEN,
  });

  const res = await fetch(`${PLEX_URL}/player/playback/playMedia?${params}`, {
    method: 'GET',
    headers: {
      'X-Plex-Target-Client-Identifier': client.machineIdentifier,
      'X-Plex-Client-Identifier': CONTROLLER_ID,
    },
  });
  if (!res.ok) throw new Error(`Plex playMedia failed: ${res.status} ${await res.text()}`);
}
