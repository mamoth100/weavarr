/**
 * The one SQLite handle for weavarr.db. Three modules used to open their own
 * connection and create their own tables on first touch; with one opener the
 * pragmas apply everywhere and schema changes are numbered instead of
 * re-run on every boot.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';

export const DB_PATH = path.join(process.cwd(), 'data', 'weavarr.db');

// Append only. Each entry runs once, in order, inside its own transaction;
// user_version records how many have run. An existing database from before
// versioning sits at 0 and simply re-runs the IF NOT EXISTS statements.
const MIGRATIONS: string[] = [
  `
    -- Favorites was removed as a feature (2026-08-19, user call: it never
    -- found a job); dropping it once here replaces the drop that used to
    -- run on every boot.
    DROP TABLE IF EXISTS favorites;
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tmdb_id INTEGER,
      tvdb_id INTEGER,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      poster_url TEXT,
      source TEXT NOT NULL,
      seasons TEXT,
      requested_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS watched (
      tmdb_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      release_date TEXT,
      watched_at TEXT NOT NULL,
      PRIMARY KEY (tmdb_id, media_type)
    );
    CREATE TABLE IF NOT EXISTS sucks (
      tmdb_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      release_date TEXT,
      added_at TEXT NOT NULL,
      PRIMARY KEY (tmdb_id, media_type)
    );
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `,
];

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const conn = new DatabaseSync(DB_PATH);
  // WAL lets the pollers read while a request writes; the busy timeout
  // turns "database is locked" into a short wait instead of an error.
  conn.exec('PRAGMA journal_mode = WAL');
  conn.exec('PRAGMA busy_timeout = 5000');
  const row = conn.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
  const version = Number(row?.user_version ?? 0);
  for (let i = version; i < MIGRATIONS.length; i++) {
    conn.exec('BEGIN');
    try {
      conn.exec(MIGRATIONS[i]);
      conn.exec(`PRAGMA user_version = ${i + 1}`);
      conn.exec('COMMIT');
    } catch (err) {
      conn.exec('ROLLBACK');
      conn.close();
      throw err;
    }
  }
  db = conn;
  return db;
}

/**
 * Checkpoint and close, so the file on disk is complete and can be replaced
 * (restore) without a stale write-ahead log being replayed over the new
 * copy. The next getDb() reopens it.
 */
export function closeDb(): void {
  if (!db) return;
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch {
    // best effort; close still flushes what it can
  }
  db.close();
  db = null;
}
