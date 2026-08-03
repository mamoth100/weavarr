const WEBHOOK_URL = process.env.WEBHOOK_NOTIFY_URL;

/** Sends a plain JSON payload to a user-configured URL - the lowest-common-denominator channel, works with anything that accepts an HTTP POST (Zapier, ntfy, a personal script, etc), not tied to any specific provider's payload shape. */
export async function sendWebhookNotification(title: string, message: string): Promise<void> {
  if (!WEBHOOK_URL) throw new Error('Webhook notifications are not configured');
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, message, timestamp: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Webhook send failed: ${res.status} ${await res.text()}`);
}
