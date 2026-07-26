'use client';

import { useEffect, useState } from 'react';

interface PairedShield {
  name: string;
  host: string;
}

interface DiscoveredShield {
  name: string;
  host: string;
}

export default function ShieldSetupPanel() {
  const [paired, setPaired] = useState<PairedShield | null | undefined>(undefined);
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredShield[] | null>(null);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  const [pairingHost, setPairingHost] = useState<string | null>(null);
  const [pairingName, setPairingName] = useState<string | null>(null);
  const [pairStatus, setPairStatus] = useState<'idle' | 'starting' | 'awaiting-code' | 'submitting' | 'error'>('idle');
  const [pairError, setPairError] = useState<string | null>(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    refreshPaired();
  }, []);

  async function refreshPaired() {
    try {
      const res = await fetch('/api/settings/shield', { cache: 'no-store' });
      const data = await res.json();
      setPaired(data.paired ?? null);
    } catch {
      setPaired(null);
    }
  }

  async function handleDiscover() {
    setDiscovering(true);
    setDiscoverError(null);
    setDiscovered(null);
    try {
      const res = await fetch('/api/settings/shield/discover', { cache: 'no-store' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDiscovered(data.shields);
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiscovering(false);
    }
  }

  async function handleStartPair(host: string, name: string) {
    setPairingHost(host);
    setPairingName(name);
    setPairStatus('starting');
    setPairError(null);
    setCode('');
    try {
      const res = await fetch('/api/settings/shield/pair/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to start pairing');
      setPairStatus('awaiting-code');
    } catch (err) {
      setPairStatus('error');
      setPairError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSubmitCode() {
    if (!pairingHost || !code.trim()) return;
    setPairStatus('submitting');
    setPairError(null);
    try {
      const res = await fetch('/api/settings/shield/pair/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: pairingHost, code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Pairing failed');
      setPaired(data.paired);
      setPairingHost(null);
      setPairingName(null);
      setPairStatus('idle');
      setCode('');
    } catch (err) {
      setPairStatus('error');
      setPairError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleCancelPair() {
    setPairingHost(null);
    setPairingName(null);
    setPairStatus('idle');
    setPairError(null);
    setCode('');
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Shield / Play on TV</h2>
        <button
          onClick={handleDiscover}
          disabled={discovering}
          className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-60"
        >
          {discovering ? 'Searching…' : 'Find Shield Devices'}
        </button>
      </div>

      <div className="bg-zinc-900 rounded-lg ring-1 ring-white/5 p-3 space-y-3">
        <div className="text-sm">
          {paired === undefined && <span className="text-zinc-500">Checking pairing status…</span>}
          {paired === null && <span className="text-zinc-500">No Shield paired yet — find one below to pair it.</span>}
          {paired && (
            <span className="text-green-400">
              ✓ Paired to <span className="font-medium">{paired.name}</span>{' '}
              <span className="text-zinc-600">({paired.host})</span>
            </span>
          )}
        </div>

        {discoverError && <p className="text-xs text-red-400">{discoverError}</p>}

        {discovered && discovered.length === 0 && (
          <p className="text-xs text-zinc-500">No Shield devices found on the network.</p>
        )}

        {discovered && discovered.length > 0 && (
          <ul className="space-y-2">
            {discovered.map((s) => {
              const isPaired = paired?.name === s.name;
              const isPairingThis = pairingHost === s.host && pairingName === s.name;
              return (
                <li key={s.name} className="border border-zinc-800 rounded-lg p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-zinc-600">{s.host}</p>
                    </div>
                    {isPaired ? (
                      <span className="text-xs font-medium text-green-400">✓ Paired</span>
                    ) : (
                      <button
                        onClick={() => handleStartPair(s.host, s.name)}
                        disabled={pairStatus === 'starting' || pairStatus === 'submitting'}
                        className="px-2.5 py-1 rounded-md text-xs font-medium bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40"
                      >
                        Pair
                      </button>
                    )}
                  </div>

                  {isPairingThis && pairStatus === 'starting' && (
                    <p className="text-xs text-zinc-500">Starting pairing — check the TV for a PIN…</p>
                  )}

                  {isPairingThis && (pairStatus === 'awaiting-code' || pairStatus === 'submitting') && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="PIN shown on TV"
                        autoFocus
                        className="flex-1 bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-amber-500 placeholder:text-zinc-600"
                      />
                      <button
                        onClick={handleSubmitCode}
                        disabled={pairStatus === 'submitting' || !code.trim()}
                        className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40"
                      >
                        {pairStatus === 'submitting' ? 'Submitting…' : 'Submit'}
                      </button>
                      <button
                        onClick={handleCancelPair}
                        className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {isPairingThis && pairStatus === 'error' && (
                    <p className="text-xs text-red-400">{pairError}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
