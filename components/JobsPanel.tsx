'use client';

import { useEffect, useState } from 'react';
import { buttonClass } from '@/components/buttonClass';

interface Job {
  name: string;
  label: string;
  description: string;
  everyMs: number;
  enabled: boolean;
  enableHint: string | null;
  running: boolean;
  nextRunAt: string | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastDurationMs: number | null;
  lastResult: 'ok' | 'error' | 'skipped' | null;
  lastMessage: string | null;
  runs: number;
}

function formatEvery(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

/** "3m ago" or "in 12m", relative to now. */
function relative(iso: string | null): string {
  if (!iso) return 'never';
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const unit =
    abs < 60_000 ? 'now' :
    abs < 3_600_000 ? `${Math.round(abs / 60_000)}m` :
    abs < 86_400_000 ? `${Math.round(abs / 3_600_000)}h` :
    `${Math.round(abs / 86_400_000)}d`;
  if (unit === 'now') return diff < 0 ? 'just now' : 'any moment';
  return diff < 0 ? `${unit} ago` : `in ${unit}`;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms / 60_000)} min`;
}

/**
 * Settings > Jobs: every background job with its interval, last outcome and
 * next run, plus Run now. Polls every five seconds while something runs and
 * every thirty otherwise, so a manual run shows its outcome without a
 * refresh.
 */
export default function JobsPanel() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch('/api/jobs', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load jobs');
      setJobs(data.jobs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const anyRunning = jobs?.some((j) => j.running) ?? false;
  useEffect(() => {
    load();
    const interval = setInterval(load, anyRunning ? 5000 : 30000);
    return () => clearInterval(interval);
  }, [anyRunning]);

  async function runNow(name: string) {
    setStarting(name);
    try {
      const res = await fetch('/api/jobs/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not start the job');
      // Mark it running at once so the poll speeds up and the button disables.
      setJobs((prev) => (prev ? prev.map((j) => (j.name === name ? { ...j, running: true } : j)) : prev));
      setTimeout(load, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(null);
    }
  }

  if (error && !jobs) return <p className="text-red-400 text-sm">{error}</p>;
  if (!jobs) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 bg-zinc-900 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-400">
        <p>Every background job, how often it runs, what happened last time, and when it runs next. Run now starts one straight away; a job already running is joined, not started twice.</p>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="bg-zinc-900 rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800/60">
        <div className="hidden lg:grid grid-cols-[minmax(0,1fr)_4.5rem_12rem_6rem_5rem] gap-3 px-4 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
          <span>Job</span>
          <span>Every</span>
          <span>Last run</span>
          <span>Next run</span>
          <span />
        </div>
        {jobs.map((j) => {
          const result = j.running ? 'running' : j.lastResult;
          const dot =
            result === 'running' ? 'bg-sky-400 animate-pulse' :
            result === 'ok' ? 'bg-green-400' :
            result === 'error' ? 'bg-red-400' :
            result === 'skipped' ? 'bg-zinc-500' :
            'bg-transparent ring-1 ring-zinc-600';
          const resultText =
            result === 'running' ? 'Running…' :
            result === 'ok' ? `OK ${relative(j.lastFinishedAt)}` :
            result === 'error' ? `Failed ${relative(j.lastFinishedAt)}` :
            result === 'skipped' ? `Skipped ${relative(j.lastFinishedAt)}` :
            'Not run yet';
          return (
            <div key={j.name} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_4.5rem_12rem_6rem_5rem] gap-1 lg:gap-3 px-4 py-3 lg:items-center">
              <div className="min-w-0">
                <p className={`text-sm font-medium ${j.enabled ? '' : 'text-zinc-500'}`}>{j.label}</p>
                <p className="text-xs text-zinc-500">{j.description}</p>
                {!j.enabled && j.enableHint && <p className="text-xs text-amber-400/80 mt-0.5">Off. {j.enableHint}</p>}
              </div>
              <span className="text-sm text-zinc-300">
                <span className="lg:hidden text-zinc-500">Every </span>
                {formatEvery(j.everyMs)}
              </span>
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 text-sm text-zinc-300">
                  <span className={`inline-block w-2 h-2 rounded-full ${dot}`} aria-hidden />
                  {resultText}
                  {!j.running && j.lastDurationMs !== null && j.lastResult && (
                    <span className="text-xs text-zinc-500">({formatDuration(j.lastDurationMs)})</span>
                  )}
                </span>
                {!j.running && j.lastMessage && (
                  <p className={`text-xs mt-0.5 break-words line-clamp-2 ${j.lastResult === 'error' ? 'text-red-400' : 'text-zinc-500'}`}>{j.lastMessage}</p>
                )}
              </div>
              <span className="text-sm text-zinc-300">
                <span className="lg:hidden text-zinc-500">Next </span>
                {j.enabled ? relative(j.nextRunAt) : 'off'}
              </span>
              <div className="lg:text-right">
                <button
                  onClick={() => runNow(j.name)}
                  disabled={!j.enabled || j.running || starting === j.name}
                  className={buttonClass({ tone: 'primary' })}
                  title={j.enabled ? undefined : j.enableHint ?? 'This job is turned off'}
                >
                  {j.running ? 'Running…' : 'Run now'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
