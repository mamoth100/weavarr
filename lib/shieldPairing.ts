import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { AndroidRemote } from 'androidtv-remote';
import { discoverShields } from './shieldDiscovery';

const STATE_FILE = path.join(process.cwd(), 'data', 'shield-pairing.json');

export interface PairedShield {
  name: string;
  host: string;
  cert: Record<string, unknown>;
}

interface PendingPairing {
  remote: AndroidRemote;
  name: string;
}

// Module-level so it survives across the two separate HTTP requests a
// pairing flow needs (start -> wait for on-screen PIN -> submit).
const pending = new Map<string, PendingPairing>();

export async function getPairedShield(): Promise<PairedShield | null> {
  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function savePairedShield(shield: PairedShield): Promise<void> {
  await mkdir(path.dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(shield, null, 2), 'utf8');
}

/**
 * The paired Shield's CURRENT address — re-discovers by name via mDNS
 * rather than trusting a stored IP, since DHCP can reassign it at any
 * time. Falls back to the last-known host only if discovery doesn't find
 * it (e.g. the device is fully off, not just standby).
 */
export async function resolveShieldHost(): Promise<{ host: string; name: string } | null> {
  const paired = await getPairedShield();
  if (!paired) return null;

  const found = await discoverShields(4000);
  const match = found.find((s) => s.name === paired.name);
  if (match) return { host: match.host, name: paired.name };

  return { host: paired.host, name: paired.name };
}

/** Starts pairing with a device. Resolves once the device requests the on-screen PIN. */
export async function startPairing(host: string, name: string): Promise<void> {
  if (pending.has(host)) {
    pending.get(host)!.remote.stop();
    pending.delete(host);
  }

  const remote = new AndroidRemote(host, {
    pairing_port: 6467,
    remote_port: 6466,
    name: 'DocuView',
    cert: {},
  });

  await new Promise<void>((resolve, reject) => {
    const onSecret = () => {
      pending.set(host, { remote, name });
      cleanup();
      resolve();
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    function cleanup() {
      remote.removeListener('secret', onSecret);
      remote.removeListener('error', onError);
    }
    remote.on('secret', onSecret);
    remote.on('error', onError);
    remote.start().catch(onError);
  });
}

/** Submits the PIN shown on the TV. Resolves once pairing succeeds and the cert is persisted. */
export async function submitPairingCode(host: string, code: string): Promise<PairedShield> {
  const p = pending.get(host);
  if (!p) throw new Error('No pairing in progress for this device — start pairing again.');
  const session = p;

  return new Promise((resolve, reject) => {
    const onReady = async () => {
      cleanup();
      const cert = session.remote.getCertificate();
      const shield: PairedShield = { name: session.name, host, cert };
      try {
        await savePairedShield(shield);
        pending.delete(host);
        resolve(shield);
      } catch (err) {
        reject(err);
      }
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    function cleanup() {
      session.remote.removeListener('ready', onReady);
      session.remote.removeListener('error', onError);
    }
    session.remote.on('ready', onReady);
    session.remote.on('error', onError);
    session.remote.sendCode(code);
  });
}

export function cancelPairing(host: string): void {
  const p = pending.get(host);
  if (p) {
    p.remote.stop();
    pending.delete(host);
  }
}
