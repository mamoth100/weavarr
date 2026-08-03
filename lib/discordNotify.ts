const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

/** Posts a rich embed to a Discord channel via an incoming webhook - no bot, no OAuth, just the URL from Server Settings > Integrations > Webhooks. */
export async function sendDiscordNotification(title: string, message: string): Promise<void> {
  if (!DISCORD_WEBHOOK_URL) throw new Error('Discord notifications are not configured');
  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{ title, description: message, color: 0xfbbf24, timestamp: new Date().toISOString() }],
    }),
  });
  if (!res.ok) throw new Error(`Discord send failed: ${res.status} ${await res.text()}`);
}
