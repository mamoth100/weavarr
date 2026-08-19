/**
 * Weavarr's own permanent record of every request - the answer to "why
 * doesn't Chappelle's Show appear anywhere anymore?" Radarr/Sonarr delete a
 * title's history with the title, so without this there is no durable
 * "everything I asked for" list. Only the FACTS of the request are stored;
 * current status (searching/downloading/available/removed) is derived live
 * by the /api/requests join - stored status would just drift.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'weavarr.db');

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
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
  `);
  return db;
}

export interface RequestRecordInput {
  tmdbId: number | null;
  tvdbId?: number | null;
  mediaType: 'movie' | 'tv';
  title: string;
  posterUrl: string | null;
  /** 'app' = a human clicked something; 'watchlist' = the Plex watchlist sync auto-added it. */
  source: 'app' | 'watchlist';
  /** For shows: the season numbers picked, or a preset like "all". */
  seasons?: string | null;
}

/** Append one request. Deliberately NOT an upsert - re-requesting something after deleting it is a new event with its own date. */
export function recordRequest(input: RequestRecordInput): void {
  getDb()
    .prepare(
      `INSERT INTO requests (tmdb_id, tvdb_id, media_type, title, poster_url, source, seasons, requested_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.tmdbId,
      input.tvdbId ?? null,
      input.mediaType,
      input.title,
      input.posterUrl,
      input.source,
      input.seasons ?? null,
      new Date().toISOString()
    );
}

export interface RequestRow {
  id: number;
  tmdbId: number | null;
  tvdbId: number | null;
  mediaType: 'movie' | 'tv';
  title: string;
  posterUrl: string | null;
  source: string;
  seasons: string | null;
  requestedAt: string;
}

export function getRequestRows(): RequestRow[] {
  return getDb()
    .prepare(`SELECT * FROM requests ORDER BY id DESC`)
    .all()
    .map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: row.id as number,
        tmdbId: (row.tmdb_id as number) ?? null,
        tvdbId: (row.tvdb_id as number) ?? null,
        mediaType: row.media_type as 'movie' | 'tv',
        title: row.title as string,
        posterUrl: (row.poster_url as string) ?? null,
        source: row.source as string,
        seasons: (row.seasons as string) ?? null,
        requestedAt: row.requested_at as string,
      };
    });
}
