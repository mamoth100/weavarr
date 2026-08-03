/**
 * Merges every notification channel into one "send everywhere enabled" call,
 * same fan-out pattern as lib/mediaServer.ts for Plex/Jellyfin - callers
 * don't need to know which channels exist or how many are on.
 */
import { sendPushoverNotification } from './pushover';
import { sendWebhookNotification } from './webhookNotify';
import { sendDiscordNotification } from './discordNotify';

export function pushoverEnabled(): boolean {
  return Boolean(process.env.PUSHOVER_USER_KEY && process.env.PUSHOVER_API_TOKEN);
}

export function webhookNotifyEnabled(): boolean {
  return process.env.ENABLE_WEBHOOK_NOTIFY === 'true' && Boolean(process.env.WEBHOOK_NOTIFY_URL);
}

export function discordNotifyEnabled(): boolean {
  return process.env.ENABLE_DISCORD_NOTIFY === 'true' && Boolean(process.env.DISCORD_WEBHOOK_URL);
}

/** Sends to every enabled channel. Succeeds if at least one delivers; throws only if every enabled channel fails (or none are enabled), so callers can still treat total failure as retry-worthy - same contract as markMovieWatched in lib/mediaServer.ts. */
export async function notifyAllChannels(title: string, message: string): Promise<void> {
  const attempts: Promise<void>[] = [];
  if (pushoverEnabled()) attempts.push(sendPushoverNotification(title, message));
  if (webhookNotifyEnabled()) attempts.push(sendWebhookNotification(title, message));
  if (discordNotifyEnabled()) attempts.push(sendDiscordNotification(title, message));
  if (attempts.length === 0) throw new Error('No notification channel is enabled');

  const results = await Promise.allSettled(attempts);
  if (results.every((r) => r.status === 'rejected')) {
    throw new Error((results[0] as PromiseRejectedResult).reason?.message ?? 'Notification failed');
  }
}
