/**
 * Merges every notification channel into one "send everywhere enabled" call,
 * same fan-out pattern as lib/mediaServer.ts for Plex/Jellyfin - callers
 * don't need to know which channels exist or how many are on.
 *
 * Every notification belongs to a category so a channel can opt out of one
 * without opting out of the other - e.g. Discord for casual "ready to watch"
 * pings, Pushover for "something actually broke" alerts you want on your phone.
 */
import { sendPushoverNotification } from './pushover';
import { sendWebhookNotification } from './webhookNotify';
import { sendDiscordNotification } from './discordNotify';

export type NotificationCategory = 'import' | 'alert';

export function pushoverEnabled(): boolean {
  return Boolean(process.env.PUSHOVER_USER_KEY && process.env.PUSHOVER_API_TOKEN);
}

export function webhookNotifyEnabled(): boolean {
  return process.env.ENABLE_WEBHOOK_NOTIFY === 'true' && Boolean(process.env.WEBHOOK_NOTIFY_URL);
}

export function discordNotifyEnabled(): boolean {
  return process.env.ENABLE_DISCORD_NOTIFY === 'true' && Boolean(process.env.DISCORD_WEBHOOK_URL);
}

/** Both category toggles default to on (unset !== 'false') so existing channel setups keep receiving everything until someone deliberately narrows it. */
function categoryEnabled(envPrefix: string, category: NotificationCategory): boolean {
  const key = category === 'import' ? `${envPrefix}_NOTIFY_IMPORTS` : `${envPrefix}_NOTIFY_ALERTS`;
  return process.env[key] !== 'false';
}

/** Sends to every channel enabled for this category. Succeeds if at least one delivers; throws only if every eligible channel fails (or none are eligible), so callers can still treat total failure as retry-worthy - same contract as markMovieWatched in lib/mediaServer.ts. */
export async function notifyAllChannels(title: string, message: string, category: NotificationCategory): Promise<void> {
  const attempts: Promise<void>[] = [];
  if (pushoverEnabled() && categoryEnabled('PUSHOVER', category)) attempts.push(sendPushoverNotification(title, message));
  if (webhookNotifyEnabled() && categoryEnabled('WEBHOOK', category)) attempts.push(sendWebhookNotification(title, message));
  if (discordNotifyEnabled() && categoryEnabled('DISCORD', category)) attempts.push(sendDiscordNotification(title, message));
  if (attempts.length === 0) throw new Error(`No notification channel is enabled for "${category}"`);

  const results = await Promise.allSettled(attempts);
  if (results.every((r) => r.status === 'rejected')) {
    throw new Error((results[0] as PromiseRejectedResult).reason?.message ?? 'Notification failed');
  }
}
