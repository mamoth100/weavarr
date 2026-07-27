import { AndroidRemote, RemoteDirection, RemoteKeyCode } from 'androidtv-remote';
import { getPairedShield, resolveShieldHost } from './shieldPairing';

/**
 * Wakes the paired Shield and foregrounds Plex. Commanding Plex to play a
 * specific title from here isn't possible — that needs Plex's own
 * client-control protocol, which turned out to be unreliable for this
 * client (empty/stale discovery, a local command port that comes and goes).
 * This just gets the TV on and Plex open; picking the title is manual.
 */
export async function openPlexOnShield(): Promise<void> {
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
}
