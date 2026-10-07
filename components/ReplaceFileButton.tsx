'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import ConfirmButton from '@/components/ConfirmButton';
import { buttonClass } from '@/components/buttonClass';
import type { ReplaceTarget, ReplacementOptions, ReleaseCandidate } from '@/lib/replaceFile';

/**
 * "Get a different version" for a file that plays badly. The modal runs the
 * service's interactive search, hides the release you already have and
 * anything from the same group, and offers the rest. Grabbing one deletes
 * the current file and blocklists its release, so nothing happens to the
 * file until a replacement is confirmed and on its way.
 */

function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return bytes > 0 ? `${Math.round(bytes / 1024)} KB` : '';
}

function CandidateMeta({ c }: { c: ReleaseCandidate }) {
  const bits = [c.quality, formatSize(c.size), c.releaseGroup, c.indexer];
  if (c.protocol === 'torrent' && c.seeders !== null) bits.push(`${c.seeders} seeders`);
  else if (c.ageDays !== null) bits.push(c.ageDays === 0 ? 'today' : `${c.ageDays}d old`);
  return <p className="text-xs text-zinc-500">{bits.filter(Boolean).join(' · ')}</p>;
}

interface ModalProps {
  target: ReplaceTarget;
  /** What the modal heading names: the movie, or "Show S01E04". */
  title: string;
  open: boolean;
  onClose: () => void;
  onReplaced?: () => void;
}

export function ReplaceFileModal({ target, title, open, onClose, onReplaced }: ModalProps) {
  const [options, setOptions] = useState<ReplacementOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grabbed, setGrabbed] = useState<ReleaseCandidate | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const serviceName = target.type === 'movie' ? 'Radarr' : 'Sonarr';
  const targetKey = JSON.stringify(target);

  // Each opening is a fresh search: the same episode can be asked about
  // twice, and the indexers may answer differently the second time.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setOptions(null);
    setError(null);
    setGrabbed(null);
    setShowAll(false);
    fetch('/api/replace/candidates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: targetKey,
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Search failed');
        if (!cancelled) setOptions(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open, targetKey, retryCount]);

  function grabAction(c: ReleaseCandidate) {
    return async () => {
      const res = await fetch('/api/replace/grab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...target, guid: c.guid, indexerId: c.indexerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Grab failed');
      setGrabbed(c);
      onReplaced?.();
    };
  }

  const best = options?.candidates[0] ?? null;
  const rest = options?.candidates.slice(1) ?? [];
  const visibleRest = showAll ? rest : rest.slice(0, 10);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Get a different version of ${title}`}
      wide
      footer={
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold bg-zinc-800 text-zinc-200 hover:bg-zinc-700">
          {grabbed ? 'Done' : 'Close'}
        </button>
      }
    >
      {grabbed ? (
        <div className="space-y-2">
          <p className="text-sm text-green-400 font-medium">On its way.</p>
          <p className="text-sm text-zinc-300 break-all">{grabbed.title}</p>
          <p className="text-xs text-zinc-400">
            The old file is deleted and its release is blocklisted in {serviceName}, so it will not come back. Progress shows on the Requests
            page, and the ready-to-watch ping fires when the new one lands.
          </p>
        </div>
      ) : error ? (
        <div className="space-y-2">
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => setRetryCount((n) => n + 1)} className={buttonClass({ tone: 'primary' })}>
            Try again
          </button>
        </div>
      ) : !options ? (
        <div className="space-y-2">
          <p className="text-sm text-zinc-300">Asking {serviceName}&apos;s indexers for other versions…</p>
          <p className="text-xs text-zinc-500">This can take up to a minute. Every indexer is asked and the slowest one sets the pace.</p>
          <div className="h-10 bg-zinc-800 rounded-lg animate-pulse" />
        </div>
      ) : (
        <div className="space-y-4">
          {options.current && (
            <div className="bg-zinc-800/60 rounded-lg p-3">
              <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">You have now</p>
              <p className="text-sm text-zinc-300 break-all">{options.current.title}</p>
              <p className="text-xs text-zinc-500">
                {[options.current.quality, formatSize(options.current.size), options.current.releaseGroup].filter(Boolean).join(' · ')}
              </p>
            </div>
          )}
          {!options.current ? (
            <p className="text-sm text-zinc-300">There is no file on disk yet, so there is nothing to replace. If a download is running, let it finish first.</p>
          ) : !best ? (
            <p className="text-sm text-zinc-300">
              Nothing different is available right now. Your file stays as it is.
              {options.current.releaseGroup && (
                <span className="text-zinc-500"> Releases from {options.current.releaseGroup} were left out, since that encode is the one giving you trouble.</span>
              )}
            </p>
          ) : (
            <>
              <div className="bg-zinc-900 ring-1 ring-amber-500/40 rounded-lg p-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] uppercase tracking-wider text-amber-400 mb-1">Best match</p>
                  <p className="text-sm text-zinc-100 break-all">{best.title}</p>
                  <CandidateMeta c={best} />
                  {best.warnings.length > 0 && <p className="text-xs text-amber-400/80 mt-1">{best.warnings.join(' ')}</p>}
                </div>
                <ConfirmButton intent="neutral" label="Grab this one" confirmLabel="Replace the file?" busyLabel="Grabbing…" action={grabAction(best)} />
              </div>
              {rest.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">Or pick one yourself</p>
                  <div className="bg-zinc-900 rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800/60">
                    {visibleRest.map((c) => (
                      <div key={`${c.indexerId}:${c.guid}`} className="p-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-200 break-all">{c.title}</p>
                          <CandidateMeta c={c} />
                          {c.warnings.length > 0 && <p className="text-xs text-amber-400/80 mt-1">{c.warnings.join(' ')}</p>}
                        </div>
                        <ConfirmButton compact intent="neutral" label="Grab" confirmLabel="Replace?" busyLabel="Grabbing…" action={grabAction(c)} />
                      </div>
                    ))}
                  </div>
                  {rest.length > visibleRest.length && (
                    <button onClick={() => setShowAll(true)} className="mt-2 text-xs text-amber-400 hover:text-amber-300 font-medium">
                      Show all {rest.length}
                    </button>
                  )}
                </div>
              )}
              <p className="text-xs text-zinc-500">
                Grabbing one deletes your current file and blocklists its release in {serviceName}. Releases you already have, and any from the same
                group, are not listed.
              </p>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

interface ButtonProps {
  target: ReplaceTarget;
  title: string;
  compact?: boolean;
  onReplaced?: () => void;
}

export default function ReplaceFileButton({ target, title, compact = false, onReplaced }: ButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={buttonClass({ tone: 'primary', compact })} title="Swap this file for another release of the same title">
        Different version
      </button>
      <ReplaceFileModal target={target} title={title} open={open} onClose={() => setOpen(false)} onReplaced={onReplaced} />
    </>
  );
}
