/**
 * Local replacement for the Supabase-backed favorites/watched/sucks tables.
 * Supabase required a hosted project, hand-run SQL to create these tables,
 * and NEXT_PUBLIC_* keys baked in at build time (which broke Docker builds
 * outright, since those secrets aren't available at build time there) -
 * none of that works for something meant to be self-hosted by strangers.
 * SQLite is a single file that ships with the app itself, same reason
 * Sonarr/Radarr use it internally.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'weavarr.db');

export type WatchlistTable = 'favorites' | 'watched' | 'sucks';

const TIMESTAMP_COLUMN: Record<WatchlistTable, 'added_at' | 'watched_at'> = {
  favorites: 'added_at',
  watched: 'watched_at',
  sucks: 'added_at',
};

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
      tmdb_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      release_date TEXT,
      original_language TEXT,
      added_at TEXT NOT NULL,
      PRIMARY KEY (tmdb_id, media_type)
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
  `);
  return db;
}

export interface WatchlistRowInput {
  tmdb_id: number;
  media_type: string;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  original_language?: string | null;
}

export function listRows(table: WatchlistTable): Record<string, unknown>[] {
  return getDb().prepare(`SELECT * FROM ${table}`).all();
}

/** Upsert keyed on (tmdb_id, media_type) - same conflict target the old Supabase upserts used. The timestamp is always set server-side to "now", not trusted from the client. */
export function upsertRow(table: WatchlistTable, row: WatchlistRowInput): void {
  const tsCol = TIMESTAMP_COLUMN[table];
  const now = new Date().toISOString();
  const columns = table === 'favorites'
    ? ['tmdb_id', 'media_type', 'title', 'poster_path', 'release_date', 'original_language', tsCol]
    : ['tmdb_id', 'media_type', 'title', 'poster_path', 'release_date', tsCol];
  const placeholders = columns.map(() => '?').join(', ');
  const updates = columns
    .filter((c) => c !== 'tmdb_id' && c !== 'media_type')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');

  const values: (string | number | null)[] = [
    row.tmdb_id,
    row.media_type,
    row.title,
    row.poster_path,
    row.release_date,
  ];
  if (table === 'favorites') values.push(row.original_language ?? null);
  values.push(now);

  getDb()
    .prepare(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})
       ON CONFLICT(tmdb_id, media_type) DO UPDATE SET ${updates}`
    )
    .run(...values);
}

export function deleteRow(table: WatchlistTable, tmdbId: number, mediaType: string): void {
  getDb().prepare(`DELETE FROM ${table} WHERE tmdb_id = ? AND media_type = ?`).run(tmdbId, mediaType);
}
