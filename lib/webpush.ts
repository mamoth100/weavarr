import webpush from 'web-push';
import { readFileSync, mkdirSync } from 'fs';
import { writeJsonAtomicSync } from './jsonState';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import type { NotificationLink } from './notificationChannels';

/**
 * Self-hosted web push: VAPID keys generated once into data/, device
 * subscriptions in weavarr.db, no external account. Dormant until the app
 * is served over HTTPS - browsers refuse push subscriptions on plain HTTP,
 * so the whole feature waits on the reverse-proxy follow-up.
 */

const KEYS_PATH = path.join(process.cwd(), 'data', 'webpush-keys.json');
const DB_PATH = path.join(process.cwd(), 'data', 'weavarr.db');

let db: DatabaseSync | null = null;
function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/** Read the keypair, generating it on first use. The public key is what browsers subscribe against - regenerating would orphan every subscription, so the file is permanent. */
export function getVapidKeys(): VapidKeys {
  try {
    return JSON.parse(readFileSync(KEYS_PATH, 'utf8')) as VapidKeys;
  } catch {
    // Atomic write: a torn keys file on the next read would regenerate the
    // pair and orphan every device subscription for good.
    const keys = webpush.generateVAPIDKeys();
    writeJsonAtomicSync(KEYS_PATH, keys);
    return keys;
  }
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function saveSubscription(sub: PushSubscriptionInput): void {
  getDb()
    .prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`
    )
    .run(sub.endpoint, sub.keys.p256dh, sub.keys.auth, new Date().toISOString());
}

export function deleteSubscription(endpoint: string): void {
  getDb().prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).run(endpoint);
}

export function subscriptionCount(): number {
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM push_subscriptions`).get() as { n: number }).n;
}

/** Sends to every subscribed device. Dead subscriptions (the push service answers 404/410 once a browser forgets a device) are pruned as they surface. Throws only when no device could be reached, matching the other channels' contract. */
export async function sendWebpushNotification(title: string, message: string, link?: NotificationLink): Promise<void> {
  const rows = getDb().prepare(`SELECT endpoint, p256dh, auth FROM push_subscriptions`).all() as {
    endpoint: string;
    p256dh: string;
    auth: string;
  }[];
  if (rows.length === 0) throw new Error('No webpush subscriptions - enable notifications on a device first');

  const keys = getVapidKeys();
  const subject = process.env.APP_URL?.trim() || 'mailto:weavarr@localhost';
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);

  const payload = JSON.stringify({ title, message, url: link?.url ?? '/' });
  const results = await Promise.allSettled(
    rows.map((r) => webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, payload))
  );

  results.forEach((res, i) => {
    if (res.status === 'rejected') {
      const code = (res.reason as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) deleteSubscription(rows[i].endpoint);
    }
  });

  if (results.every((r) => r.status === 'rejected')) {
    const first = results[0] as PromiseRejectedResult;
    throw new Error(first.reason instanceof Error ? first.reason.message : String(first.reason));
  }
}
