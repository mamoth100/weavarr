'use client';

import { useEffect, useState } from 'react';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Per-device webpush enrolment - subscriptions are per browser, so this
 * lives next to the Webpush settings rather than being a saved field.
 * Browsers only allow any of this on HTTPS (or localhost), so on plain
 * HTTP the button gives way to a plain-words explanation.
 */
export default function WebpushDeviceButton() {
  const [state, setState] = useState<'checking' | 'insecure' | 'unsupported' | 'off' | 'on' | 'busy' | 'denied'>('checking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.isSecureContext) return setState('insecure');
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return setState('unsupported');
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'on' : 'off'))
      .catch(() => setState('off'));
  }, []);

  async function enable() {
    setState('busy');
    setError(null);
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return setState('denied');
      const { key, error: keyError } = await fetch('/api/push/public-key').then((r) => r.json());
      if (!key) throw new Error(keyError ?? 'No server key');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Subscribe failed');
      setState('on');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('off');
    }
  }

  async function disable() {
    setState('busy');
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState('off');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('on');
    }
  }

  if (state === 'checking') return null;
  if (state === 'insecure') {
    return (
      <span className="text-xs text-zinc-500">
        Asleep for now. Browsers only allow these notifications on an HTTPS address, and this app is on plain HTTP. Once a reverse proxy with a certificate sits in front of Weavarr, a button appears here to turn notifications on for whatever device you are holding.
      </span>
    );
  }
  if (state === 'unsupported') {
    return <span className="text-xs text-zinc-500">This browser doesn&apos;t support web push.</span>;
  }
  if (state === 'denied') {
    return <span className="text-xs text-zinc-500">Notifications are blocked for this site in the browser&apos;s settings.</span>;
  }

  async function sendTest() {
    setError(null);
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'Webpush', values: {} }),
      });
      const data = await res.json();
      if (!data.ok) setError(data.message ?? 'Test failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        onClick={state === 'on' ? disable : enable}
        disabled={state === 'busy'}
        className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-60"
      >
        {state === 'busy' ? 'Working…' : state === 'on' ? 'Turn off notifications here' : 'Turn on notifications here'}
      </button>
      {state === 'on' && (
        <>
          <button
            onClick={sendTest}
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          >
            Test
          </button>
          <span className="text-xs text-green-400">Notifications on for this device</span>
        </>
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </span>
  );
}
