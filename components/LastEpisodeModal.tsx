'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import { invalidateLibraryStatus } from '@/hooks/useLibraryStatus';

export interface DeleteAftermath {
  seriesId: number;
  remainingFiles: number;
  title: string;
  status: string;
  monitorFuture: boolean;
}

/**
 * Appears after an episode delete leaves a show with zero downloaded
 * episodes (Watch, Status, and Library deletes all feed it). Ended shows
 * get told so, with a cleanup offer. Continuing shows get a keep/remove
 * choice plus the future-episodes checkbox - pre-checked when the setting
 * is already on, per the user's spec.
 */
export default function LastEpisodeModal({ aftermath, onClose }: { aftermath: DeleteAftermath | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grabFuture, setGrabFuture] = useState<boolean | null>(null);

  if (!aftermath) return null;
  const ended = aftermath.status === 'ended';
  const continuing = aftermath.status === 'continuing';
  const wantFuture = grabFuture ?? aftermath.monitorFuture;

  async function removeFromSonarr() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/sonarr/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId: aftermath!.seriesId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      invalidateLibraryStatus();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function keep() {
    setBusy(true);
    setError(null);
    try {
      if (continuing && wantFuture !== aftermath!.monitorFuture) {
        const res = await fetch('/api/sonarr/expand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seriesId: aftermath!.seriesId, monitorFuture: wantFuture }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Update failed');
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => { if (!busy) onClose(); }}
      title="That was the last episode"
      footer={
        <>
          <button
            onClick={keep}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-60"
          >
            {busy ? 'Working…' : 'Keep the show'}
          </button>
          <button
            onClick={removeFromSonarr}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-500 disabled:opacity-40"
          >
            Remove from Sonarr
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-zinc-300">
        <p>
          No downloaded episodes of <span className="font-medium text-white">{aftermath.title}</span> remain.
        </p>
        {ended && <p className="text-zinc-400">This show has ended. Nothing new is coming, so it can be cleaned out of Sonarr entirely, or kept for a rewatch someday.</p>}
        {continuing && (
          <>
            <p className="text-zinc-400">This show is still going. Keep it in Sonarr to grab what comes next, or remove it completely.</p>
            <label className="flex items-center gap-2 cursor-pointer select-none touch:py-1">
              <input
                type="checkbox"
                checked={wantFuture}
                onChange={(e) => setGrabFuture(e.target.checked)}
                className="accent-amber-400 touch:w-5 touch:h-5"
              />
              Grab future episodes as they air
            </label>
          </>
        )}
        {!ended && !continuing && <p className="text-zinc-400">Keep it in Sonarr, or remove it completely.</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </Modal>
  );
}
