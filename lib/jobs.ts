import path from 'path';
import { runExclusive, isRunning } from './runExclusive';
import { readJsonState, writeJsonAtomic } from './jsonState';

/**
 * The background job registry behind Settings > Jobs. Every job the
 * instrumentation hook schedules is registered here, enabled or not, so the
 * page can list all of them with their interval, last outcome and next run,
 * and offer Run now. Jobs used to run on hidden intervals, which is how the
 * queue janitor sat broken for weeks: nothing showed that it never cleared a
 * thing.
 */

export interface JobDefinition {
  /** Stable id, also the runExclusive name, so a manual run and a timer run never overlap. */
  name: string;
  label: string;
  description: string;
  everyMs: number;
  /** False when the job's setting is off; it is listed but never scheduled or run. */
  enabled: boolean;
  /** What turns it on, shown next to a disabled job. */
  enableHint?: string;
  run: () => Promise<unknown>;
}

export type JobResult = 'ok' | 'error' | 'skipped';

/** Thrown by a job that decided not to do its work this time (nothing to do, prerequisite missing). Recorded as skipped, not failed. */
export class JobSkipped extends Error {}

interface JobState {
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastDurationMs: number | null;
  lastResult: JobResult | null;
  /** The error message, or the reason a run was skipped. */
  lastMessage: string | null;
  runs: number;
}

export interface JobInfo extends JobState {
  name: string;
  label: string;
  description: string;
  everyMs: number;
  enabled: boolean;
  enableHint: string | null;
  running: boolean;
  nextRunAt: string | null;
}

const STATE_FILE = path.join(process.cwd(), 'data', 'jobs-state.json');

const jobs = new Map<string, JobDefinition>();
const states = new Map<string, JobState>();
const nextRuns = new Map<string, number>();
const order: string[] = [];
let persisted: Record<string, JobState> | null = null;

function emptyState(): JobState {
  return { lastStartedAt: null, lastFinishedAt: null, lastDurationMs: null, lastResult: null, lastMessage: null, runs: 0 };
}

async function loadPersisted(): Promise<void> {
  if (persisted) return;
  persisted = await readJsonState<Record<string, JobState>>(STATE_FILE, {});
}

async function persist(): Promise<void> {
  const out: Record<string, JobState> = {};
  states.forEach((s, name) => {
    out[name] = s;
  });
  await writeJsonAtomic(STATE_FILE, out);
}

/** Runs the job once under its exclusive name, recording outcome and timing. Overlapping calls join the run in flight. */
async function execute(def: JobDefinition): Promise<unknown> {
  if (isRunning(def.name)) return runExclusive(def.name, def.run);
  return runExclusive(def.name, async () => {
    const state = states.get(def.name) ?? emptyState();
    const started = Date.now();
    state.lastStartedAt = new Date(started).toISOString();
    state.runs += 1;
    states.set(def.name, state);
    try {
      const result = await def.run();
      state.lastResult = 'ok';
      state.lastMessage = null;
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // "X is not configured" is the normal state of a fresh install, not a
      // failure worth an error line every hour. Real failures still log.
      if (err instanceof JobSkipped || /is not configured$/.test(message)) {
        state.lastResult = 'skipped';
        state.lastMessage = message;
      } else {
        state.lastResult = 'error';
        state.lastMessage = message;
        console.error(`[${def.name}] run failed:`, message);
      }
      return undefined;
    } finally {
      state.lastFinishedAt = new Date().toISOString();
      state.lastDurationMs = Date.now() - started;
      persist().catch(() => {});
    }
  });
}

function scheduleNext(def: JobDefinition, delayMs: number): void {
  nextRuns.set(def.name, Date.now() + delayMs);
  const timer = setTimeout(async () => {
    await execute(def).catch(() => {});
    scheduleNext(def, def.everyMs);
  }, delayMs);
  // Never keep the process alive just for a timer.
  timer.unref?.();
}

/**
 * Registers a job and, when enabled, runs it once now and then on its
 * interval. Registration order is the display order.
 */
export async function registerJob(def: JobDefinition): Promise<void> {
  await loadPersisted();
  jobs.set(def.name, def);
  if (!order.includes(def.name)) order.push(def.name);
  states.set(def.name, persisted?.[def.name] ?? emptyState());
  if (!def.enabled) return;
  // The boot run is not awaited: a slow first sync must not hold up the
  // registration of every job behind it.
  void execute(def).catch(() => {});
  scheduleNext(def, def.everyMs);
}

export function listJobs(): JobInfo[] {
  return order.map((name) => {
    const def = jobs.get(name)!;
    const state = states.get(name) ?? emptyState();
    const next = nextRuns.get(name);
    return {
      name,
      label: def.label,
      description: def.description,
      everyMs: def.everyMs,
      enabled: def.enabled,
      enableHint: def.enableHint ?? null,
      running: isRunning(name),
      nextRunAt: def.enabled && next ? new Date(next).toISOString() : null,
      ...state,
    };
  });
}

/** Starts a job from the Jobs page. Returns the job's own result once it finishes. */
export async function runJobNow(name: string): Promise<unknown> {
  const def = jobs.get(name);
  if (!def) throw new Error(`Unknown job "${name}"`);
  if (!def.enabled) throw new Error(`${def.label} is turned off${def.enableHint ? `: ${def.enableHint}` : ''}`);
  return execute(def);
}
