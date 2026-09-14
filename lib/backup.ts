/**
 * Backup/restore for everything that makes this install "yours" -
 * .env.local (config) plus everything under data/ except regenerable
 * caches and unrelated pre-existing state. Same idea as Radarr/Sonarr's
 * own backup feature: a single downloadable/restorable zip.
 */
import AdmZip from 'adm-zip';
import { readdir, stat, mkdir, unlink, writeFile, readFile } from 'fs/promises';
import path from 'path';
import { ENV_FILE } from './configDir';
import { SETTINGS_SCHEMA } from './settings';
import { getDb, closeDb } from './db';

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
  let dbSnapshot: string | null = null;
  for (const entry of entries) {
    if (EXCLUDED_DATA_ENTRIES.has(entry.name)) continue;
    // SQLite's journal side files belong to the live database, not a copy.
    if (/\.db-(wal|shm|journal)$/.test(entry.name)) continue;
    const fullPath = path.join(DATA_DIR, entry.name);
    if (entry.isDirectory()) {
      zip.addLocalFolder(fullPath, `data/${entry.name}`);
    } else if (entry.name.endsWith('.db')) {
      // The database is open in this process. A byte-for-byte read while a
      // write is in flight can produce a copy that will not open on restore;
      // VACUUM INTO writes a consistent snapshot through SQLite itself.
      dbSnapshot = path.join(BACKUP_DIR, `.snapshot-${process.pid}-${entry.name}`);
      await unlink(dbSnapshot).catch(() => {});
      getDb().exec(`VACUUM INTO '${dbSnapshot.replace(/'/g, "''")}'`);
      zip.addLocalFile(dbSnapshot, 'data', entry.name);
    } else {
      zip.addLocalFile(fullPath, 'data');
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `weavarr-backup-${timestamp}.zip`;
  const fullPath = path.join(BACKUP_DIR, filename);
  zip.writeZip(fullPath);
  if (dbSnapshot) await unlink(dbSnapshot).catch(() => {});

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

/** The zip bytes for download. Same filename rule as delete and restore. */
export async function readBackupFile(filename: string): Promise<Buffer> {
  assertSafeFilename(filename);
  return readFile(path.join(BACKUP_DIR, filename));
}

/** Extracts a backup over the live config/data - the app needs a restart afterward to actually pick up the restored .env.local and reopen the SQLite file, same as any other settings change. */
export async function restoreBackup(filename: string): Promise<void> {
  assertSafeFilename(filename);
  const zip = new AdmZip(path.join(BACKUP_DIR, filename));
  const entries = zip.getEntries();

  // Validate the whole zip before touching anything. Uploads are accepted
  // from anyone on the LAN, so a zip is untrusted input: an entry named
  // server.js or .next/anything is a legal path under the app root and would
  // be executed on the next restart. Only the settings file and the data
  // folder are ever restored, and the data entries that the backup itself
  // never includes (posters, backups, env-backups) are refused too.
  for (const entry of entries) {
    if (entry.isDirectory) continue; // folder markers are never extracted (see below)
    const name = entry.entryName.replace(/\\/g, '/');
    if (name === '.env.local') continue;
    const parts = name.split('/');
    const escapes = parts.some((p) => p === '..' || p === '') || path.isAbsolute(name);
    const underData = parts[0] === 'data' && parts.length > 1 && !EXCLUDED_DATA_ENTRIES.has(parts[1]);
    if (escapes || !underData) throw new Error(`Backup refused: it contains "${entry.entryName}", which is not a settings or data file`);
  }

  // The live database handle is closed (and its write-ahead log folded in)
  // before the file is overwritten; otherwise SQLite would replay the old
  // log over the restored copy on the next open.
  closeDb();
  for (const side of ['-wal', '-shm']) {
    await unlink(path.join(DATA_DIR, `weavarr.db${side}`)).catch(() => {});
  }

  for (const entry of entries) {
    if (entry.entryName === '.env.local') {
      // Only known settings keys, one per line. A restored file is
      // environment for the next boot, so anything else (NODE_OPTIONS, a
      // value smuggling a newline) must not get through.
      const allowed = new Set(SETTINGS_SCHEMA.map((f) => f.key));
      const kept = entry
        .getData()
        .toString('utf8')
        .split(/\r?\n/)
        .filter((line) => {
          const eq = line.indexOf('=');
          if (eq <= 0) return false;
          return allowed.has(line.slice(0, eq).trim());
        });
      await mkdir(path.dirname(ENV_FILE), { recursive: true });
      await writeFile(ENV_FILE, kept.join('\n') + '\n', 'utf8');
    } else if (!entry.isDirectory) {
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
