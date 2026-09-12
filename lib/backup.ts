/**
 * Backup/restore for everything that makes this install "yours" -
 * .env.local (config) plus everything under data/ except regenerable
 * caches and unrelated pre-existing state. Same idea as Radarr/Sonarr's
 * own backup feature: a single downloadable/restorable zip.
 */
import AdmZip from 'adm-zip';
import { readdir, stat, mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { ENV_FILE } from './configDir';

const DATA_DIR = path.join(process.cwd(), 'data');
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
  // The zip stores .env.local at its root, but the live file lives in
  // CONFIG_DIR (a separate mount in Docker). Route that one entry there and
  // extract everything else (data/...) relative to the app root as before.
  for (const entry of zip.getEntries()) {
    if (entry.entryName === '.env.local') {
      await mkdir(path.dirname(ENV_FILE), { recursive: true });
      await writeFile(ENV_FILE, entry.getData());
    } else {
      zip.extractEntryTo(entry, process.cwd(), true, true);
    }
  }
}

/**
 * Accepts a backup file from outside this server (downloaded from a
 * different install, or from this one before a disk died) and drops it
 * into the same backups/ folder as any other backup, so it shows up in
 * the list with the exact same Restore/Download/Delete actions - real
 * disaster recovery, not just "restore from a backup this exact server
 * happened to already have."
 */
export async function saveUploadedBackup(originalFilename: string, buffer: Buffer): Promise<BackupInfo> {
  await mkdir(BACKUP_DIR, { recursive: true });

  // Throws if this isn't actually a readable zip - reject bad uploads early.
  new AdmZip(buffer);

  const safeName = path.basename(originalFilename).replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `uploaded-${timestamp}-${safeName}`;
  const fullPath = path.join(BACKUP_DIR, filename);
  await writeFile(fullPath, buffer);

  const s = await stat(fullPath);
  return { filename, sizeBytes: s.size, createdAt: s.mtime.toISOString() };
}

/** Keeps the newest `retain` backups, deletes the rest. */
export async function pruneBackups(retain: number): Promise<void> {
  const backups = await listBackups();
  const toDelete = backups.slice(Math.max(0, retain));
  await Promise.all(toDelete.map((b) => deleteBackup(b.filename)));
}
