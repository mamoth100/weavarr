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
import { sendWebpushNotification, subscriptionCount } from './webpush';

export type NotificationCategory = 'import' | 'alert';

/** Defaults on (unset !== 'false') unlike Webhook/Discord below - Pushover was the original channel, added before either of those existed or before this toggle did, so existing setups shouldn't go silent just because a toggle now exists. */
export function pushoverEnabled(): boolean {
  return process.env.ENABLE_PUSHOVER !== 'false' && Boolean(process.env.PUSHOVER_USER_KEY && process.env.PUSHOVER_API_TOKEN);
}

export function webhookNotifyEnabled(): boolean {
  return process.env.ENABLE_WEBHOOK_NOTIFY === 'true' && Boolean(process.env.WEBHOOK_NOTIFY_URL);
}

export function discordNotifyEnabled(): boolean {
  return process.env.ENABLE_DISCORD_NOTIFY === 'true' && Boolean(process.env.DISCORD_WEBHOOK_URL);
}

export function webpushEnabled(): boolean {
  try {
    return process.env.ENABLE_WEBPUSH === 'true' && subscriptionCount() > 0;
  } catch {
    return false;
  }
}

/** Both category toggles default to on (unset !== 'false') so existing channel setups keep receiving everything until someone deliberately narrows it. */
function categoryEnabled(envPrefix: string, category: NotificationCategory): boolean {
  const key = category === 'import' ? `${envPrefix}_NOTIFY_IMPORTS` : `${envPrefix}_NOTIFY_ALERTS`;
  return process.env[key] !== 'false';
}

export interface NotificationLink {
  url: string;
  label: string;
}

/** Deep link back into the app - only exists when APP_URL is configured (a LAN app has no address a phone notification could usefully open until the operator names one). */
function appLink(path: string): NotificationLink | undefined {
  const base = process.env.APP_URL?.trim().replace(/\/+$/, '');
  if (!base) return undefined;
  const title = process.env.APP_TITLE?.trim() || 'Weavarr';
  return { url: `${base}${path}`, label: `Open ${title}` };
}

/** Sends to every channel enabled for this category. Succeeds if at least one delivers; throws only if every eligible channel fails (or none are eligible), so callers can still treat total failure as retry-worthy - same contract as markMovieWatched in lib/mediaServer.ts. `path` is where the notification's link lands when APP_URL is set. */
export async function notifyAllChannels(title: string, message: string, category: NotificationCategory, path = '/'): Promise<void> {
  const link = appLink(path);
  const attempts: Promise<void>[] = [];
  if (pushoverEnabled() && categoryEnabled('PUSHOVER', category)) attempts.push(sendPushoverNotification(title, message, link));
  if (webhookNotifyEnabled() && categoryEnabled('WEBHOOK', category)) attempts.push(sendWebhookNotification(title, message, link));
  if (discordNotifyEnabled() && categoryEnabled('DISCORD', category)) attempts.push(sendDiscordNotification(title, message, link));
  if (webpushEnabled() && categoryEnabled('WEBPUSH', category)) attempts.push(sendWebpushNotification(title, message, link));
  if (attempts.length === 0) throw new Error(`No notification channel is enabled for "${category}"`);

  const results = await Promise.allSettled(attempts);
  if (results.every((r) => r.status === 'rejected')) {
    throw new Error((results[0] as PromiseRejectedResult).reason?.message ?? 'Notification failed');
  }
}
