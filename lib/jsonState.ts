import { mkdir, readFile, writeFile, rename } from 'fs/promises';
import { mkdirSync, renameSync, writeFileSync } from 'fs';
import path from 'path';

/**
 * Small JSON state files under data/ (dismissed items, notified imports,
 * connection health, threshold memory). Two rules every writer used to get
 * wrong on its own:
 *
 * 1. Writes are atomic (temp file, then rename) and serialized per path, so a
 *    power cut or the restart route's process.exit mid-write can never leave
 *    a half-written file, and two overlapping writers cannot interleave.
 * 2. A file that fails to parse is logged, not silently treated as empty.
 *    Silently starting over meant re-sending every "ready to watch" ping, or
 *    regenerating the push keys and orphaning every subscription.
 */
export async function readJsonState<T>(file: string, fallback: T): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    return fallback; // never written yet
  }
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`[state] ${path.basename(file)} is not valid JSON, starting from empty:`, err instanceof Error ? err.message : err);
    return fallback;
  }
}

const chains = new Map<string, Promise<void>>();

export function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const prev = chains.get(file) ?? Promise.resolve();
  const run = prev.then(async () => {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(value), 'utf8');
    await rename(tmp, file);
  });
  chains.set(
    file,
    run.catch(() => {})
  );
  return run;
}

/** Synchronous twin for the one caller that runs at module load (the push keypair). */
export function writeJsonAtomicSync(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value), 'utf8');
  renameSync(tmp, file);
}
