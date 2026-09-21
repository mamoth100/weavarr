/**
 * The channels added after Pushover, Webhook, Discord and Webpush: Email,
 * Telegram, ntfy, Gotify, Slack and Pushbullet. Each is one HTTP call (or
 * one SMTP send), so they live together. Every sender takes its config as
 * an argument rather than reading the environment, so the Settings page's
 * Test button can try values that have not been saved yet; the configured
 * wrappers at the bottom are what the fan-out calls.
 */
import { fetchWithTimeout } from './fetchTimeout';
import type { NotificationLink } from './notificationChannels';

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
  to: string;
}

export async function sendEmail(cfg: EmailConfig, title: string, message: string, link?: NotificationLink): Promise<void> {
  // Imported on demand: nodemailer is only worth loading for people who use it.
  const nodemailer = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.password ?? '' } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  const text = link ? `${message}\n\n${link.label}: ${link.url}` : message;
  await transport.sendMail({ from: cfg.from, to: cfg.to, subject: title, text });
}

export async function sendTelegram(botToken: string, chatId: string, title: string, message: string, link?: NotificationLink): Promise<void> {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const text = `<b>${esc(title)}</b>\n${esc(message)}${link ? `\n<a href="${esc(link.url)}">${esc(link.label)}</a>` : ''}`;
  const res = await fetchWithTimeout(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Telegram send failed: ${data.description ?? `HTTP ${res.status}`}`);
  }
}

export async function sendNtfy(serverUrl: string, topic: string, token: string | undefined, title: string, message: string, link?: NotificationLink): Promise<void> {
  const base = (serverUrl || 'https://ntfy.sh').replace(/\/+$/, '');
  // JSON publishing (POST to the server root) rather than headers: header
  // values must be ASCII, and titles like "Pokémon" are not.
  const res = await fetchWithTimeout(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ topic, title, message, ...(link ? { click: link.url } : {}) }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`ntfy send failed: HTTP ${res.status}`);
}

export async function sendGotify(serverUrl: string, appToken: string, title: string, message: string, link?: NotificationLink): Promise<void> {
  const base = serverUrl.replace(/\/+$/, '');
  const res = await fetchWithTimeout(`${base}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Gotify-Key': appToken },
    body: JSON.stringify({
      title,
      message,
      priority: 5,
      ...(link ? { extras: { 'client::notification': { click: { url: link.url } } } } : {}),
    }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Gotify send failed: HTTP ${res.status}`);
}

export async function sendSlack(webhookUrl: string, title: string, message: string, link?: NotificationLink): Promise<void> {
  const text = `*${title}*\n${message}${link ? `\n<${link.url}|${link.label}>` : ''}`;
  const res = await fetchWithTimeout(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Slack send failed: HTTP ${res.status}`);
}

export async function sendPushbullet(accessToken: string, title: string, message: string, link?: NotificationLink): Promise<void> {
  const res = await fetchWithTimeout('https://api.pushbullet.com/v2/pushes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Access-Token': accessToken },
    body: JSON.stringify(link ? { type: 'link', title, body: message, url: link.url } : { type: 'note', title, body: message }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Pushbullet send failed: HTTP ${res.status}`);
}

// ---- configured from the environment, for the fan-out ----

/** The SMTP settings as the app was started with them, or null when the required ones are missing. */
export function emailConfigFromEnv(env: Record<string, string | undefined> = process.env): EmailConfig | null {
  const host = env.SMTP_HOST?.trim();
  const from = env.EMAIL_FROM?.trim();
  const to = env.EMAIL_TO?.trim();
  if (!host || !from || !to) return null;
  const secure = env.SMTP_SECURE === 'true';
  const port = Number(env.SMTP_PORT) || (secure ? 465 : 587);
  return { host, port, secure, user: env.SMTP_USER?.trim() || undefined, password: env.SMTP_PASSWORD || undefined, from, to };
}

export const emailEnabled = () => process.env.ENABLE_EMAIL_NOTIFY === 'true' && emailConfigFromEnv() !== null;
export const telegramEnabled = () => process.env.ENABLE_TELEGRAM_NOTIFY === 'true' && Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
export const ntfyEnabled = () => process.env.ENABLE_NTFY_NOTIFY === 'true' && Boolean(process.env.NTFY_TOPIC);
export const gotifyEnabled = () => process.env.ENABLE_GOTIFY_NOTIFY === 'true' && Boolean(process.env.GOTIFY_URL && process.env.GOTIFY_TOKEN);
export const slackEnabled = () => process.env.ENABLE_SLACK_NOTIFY === 'true' && Boolean(process.env.SLACK_WEBHOOK_URL);
export const pushbulletEnabled = () => process.env.ENABLE_PUSHBULLET_NOTIFY === 'true' && Boolean(process.env.PUSHBULLET_TOKEN);

export const sendEmailNotification = (t: string, m: string, l?: NotificationLink) => sendEmail(emailConfigFromEnv()!, t, m, l);
export const sendTelegramNotification = (t: string, m: string, l?: NotificationLink) => sendTelegram(process.env.TELEGRAM_BOT_TOKEN!, process.env.TELEGRAM_CHAT_ID!, t, m, l);
export const sendNtfyNotification = (t: string, m: string, l?: NotificationLink) => sendNtfy(process.env.NTFY_URL ?? '', process.env.NTFY_TOPIC!, process.env.NTFY_TOKEN || undefined, t, m, l);
export const sendGotifyNotification = (t: string, m: string, l?: NotificationLink) => sendGotify(process.env.GOTIFY_URL!, process.env.GOTIFY_TOKEN!, t, m, l);
export const sendSlackNotification = (t: string, m: string, l?: NotificationLink) => sendSlack(process.env.SLACK_WEBHOOK_URL!, t, m, l);
export const sendPushbulletNotification = (t: string, m: string, l?: NotificationLink) => sendPushbullet(process.env.PUSHBULLET_TOKEN!, t, m, l);
