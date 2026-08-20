import { fetchWithTimeout } from './fetchTimeout';
import type { NotificationLink } from './notificationChannels';

const PUSHOVER_USER_KEY = process.env.PUSHOVER_USER_KEY;
const PUSHOVER_API_TOKEN = process.env.PUSHOVER_API_TOKEN;

export async function sendPushoverNotification(title: string, message: string, link?: NotificationLink): Promise<void> {
  if (!PUSHOVER_USER_KEY || !PUSHOVER_API_TOKEN) throw new Error('Pushover is not configured');

  const res = await fetchWithTimeout('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: PUSHOVER_API_TOKEN,
      user: PUSHOVER_USER_KEY,
      title,
      message,
      ...(link ? { url: link.url, url_title: link.label } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Pushover send failed: ${res.status} ${await res.text()}`);
}
