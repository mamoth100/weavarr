import { AndroidRemote, RemoteDirection, RemoteKeyCode } from 'androidtv-remote';
import { getPairedShield, resolveShieldHost } from './shieldPairing';
import { getPlexClients, playOnClient, type PlexClient } from './plexClientControl';

/**
 * Wakes the paired Shield, foregrounds Plex, and commands it to play the
 * given library item. Two steps here are best-effort and UNVERIFIED against
 * a live device (no Shield has been paired yet as of writing this): whether
 * KEYCODE_WAKEUP actually rouses a fully-asleep Shield over this protocol,
 * and whether the `plex://` app-link foregrounds Plex versus Plex needing to
 * already be running in the background for its client-control API to see it.
 */
export async function playOnShield(ratingKey: string): Promise<void> {
  const paired = await getPairedShield();
  if (!paired) throw new Error('No Shield paired yet — pair one in Settings first.');

  const resolved = await resolveShieldHost();
  const host = resolved?.host ?? paired.host;

  const remote = new AndroidRemote(host, {
    pairing_port: 6467,
    remote_port: 6466,
    name: 'DocuView',
    cert: paired.cert as { key: string; cert: string },
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out connecting to the Shield')), 15000);
    remote.once('ready', () => {
      clearTimeout(timeout);
      resolve();
    });
    remote.start().catch((err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  remote.sendKey(RemoteKeyCode.KEYCODE_WAKEUP, RemoteDirection.SHORT);
  try {
    remote.sendAppLink('plex://');
  } catch {
    // Best-effort — Plex may already be running.
  }
  remote.stop();

  const client = await waitForShieldPlexClient(host, 20000);
  if (!client) {
    throw new Error('Plex did not appear on the Shield in time — is it installed and signed in?');
  }

  await playOnClient(client, ratingKey);
}

async function waitForShieldPlexClient(shieldHost: string, timeoutMs: number): Promise<PlexClient | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const clients = await getPlexClients();
    const match = clients.find((c) => c.address === shieldHost);
    if (match) return match;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}
