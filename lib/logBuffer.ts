/**
 * In-memory ring buffer behind the Settings Logs tab, fed by patching
 * console.log/warn/error - every existing log line in the app lands here
 * with zero call-site changes. Self-hosters get "why is it broken" answers
 * in the UI instead of needing `docker logs` over SSH.
 *
 * State lives on globalThis, not module scope: Next bundles instrumentation
 * and each route separately, so a plain module-level buffer could exist as
 * several disconnected copies. globalThis is process-wide regardless of
 * bundling, and the same trick guards against double-patching.
 */

export interface LogEntry {
  ts: string;
  level: 'log' | 'warn' | 'error';
  message: string;
}

const MAX_ENTRIES = 500;

interface LogStore {
  buffer: LogEntry[];
  patched: boolean;
}

function store(): LogStore {
  const g = globalThis as typeof globalThis & { __weavarrLogs?: LogStore };
  if (!g.__weavarrLogs) g.__weavarrLogs = { buffer: [], patched: false };
  return g.__weavarrLogs;
}

function format(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return a.stack ?? a.message;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ')
    // Terminal color escape codes render as garbage in the web viewer.
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;]*m/g, '')
    .slice(0, 2000);
}

export function patchConsole(): void {
  const s = store();
  if (s.patched) return;
  s.patched = true;
  for (const level of ['log', 'warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      try {
        s.buffer.push({ ts: new Date().toISOString(), level, message: format(args) });
        if (s.buffer.length > MAX_ENTRIES) s.buffer.splice(0, s.buffer.length - MAX_ENTRIES);
      } catch {
        // logging must never break the thing being logged
      }
    };
  }
}

/** Newest first. */
export function getLogs(): LogEntry[] {
  return [...store().buffer].reverse();
}
