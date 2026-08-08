/**
 * Backup/restore for everything that makes this install "yours" -
 * .env.local (config) plus everything under data/ except regenerable
 * caches and unrelated pre-existing state. Same idea as Radarr/Sonarr's
 * own backup feature: a single downloadable/restorable zip.
 */
import AdmZip from 'adm-zip';
import { readdir, stat, mkdir, unlink } from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const ENV_FILE = path.join(process.cwd(), '.env.local');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

// posters/ is a regenerable Radarr/Sonarr poster cache, not real state.
// backups/ is this feature's own output - never include itself.
// env-backups/ is the pre-existing per-save snapshot lib/settings.ts
// already keeps - a separate, older mechanism, not part of this one.
const EXCLUDED_DATA_ENTRIES = new Set(['posters', 'backups', 'env-backups']);

export interface BackupInfo {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

function assertSafeFilename(filename: string): void {
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new Error('Invalid backup filename');
  }
}

export async function createBackup(): Promise<BackupInfo> {
  await mkdir(BACKUP_DIR, { recursive: true });
  const zip = new AdmZip();

  try {
    zip.addLocalFile(ENV_FILE, '', '.env.local');
  } catch {
    // No .env.local yet (fresh install before first configuration) - fine,
    // the backup just won't have config to restore.
  }

  const entries = await readdir(DATA_DIR, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (EXCLUDED_DATA_ENTRIES.has(entry.name)) continue;
    const fullPath = path.join(DATA_DIR, entry.name);
    if (entry.isDirectory()) {
      zip.addLocalFolder(fullPath, `data/${entry.name}`);
    } else {
      zip.addLocalFile(fullPath, 'data');
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `weavarr-backup-${timestamp}.zip`;
  const fullPath = path.join(BACKUP_DIR, filename);
  zip.writeZip(fullPath);

  const s = await stat(fullPath);
  return { filename, sizeBytes: s.size, createdAt: s.mtime.toISOString() };
}

export async function listBackups(): Promise<BackupInfo[]> {
  await mkdir(BACKUP_DIR, { recursive: true });
  const files = (await readdir(BACKUP_DIR)).filter((f) => f.endsWith('.zip'));
  const infos = await Promise.all(
    files.map(async (filename) => {
      const s = await stat(path.join(BACKUP_DIR, filename));
      return { filename, sizeBytes: s.size, createdAt: s.mtime.toISOString() };
    })
  );
  return infos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteBackup(filename: string): Promise<void> {
  assertSafeFilename(filename);
  await unlink(path.join(BACKUP_DIR, filename));
}

/** Extracts a backup over the live config/data - the app needs a restart afterward to actually pick up the restored .env.local and reopen the SQLite file, same as any other settings change. */
export async function restoreBackup(filename: string): Promise<void> {
  assertSafeFilename(filename);
  const zip = new AdmZip(path.join(BACKUP_DIR, filename));
  zip.extractAllTo(process.cwd(), true);
}

/** Keeps the newest `retain` backups, deletes the rest. */
export async function pruneBackups(retain: number): Promise<void> {
  const backups = await listBackups();
  const toDelete = backups.slice(Math.max(0, retain));
  await Promise.all(toDelete.map((b) => deleteBackup(b.filename)));
}
