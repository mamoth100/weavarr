// One-time migration: copies existing favorites/watched/sucks rows out of
// Supabase and into the local SQLite DB (data/weavarr.db) that replaced it.
// Safe to re-run - uses INSERT OR REPLACE keyed on (tmdb_id, media_type).
// Run from the project root: node scripts/migrate-from-supabase.mjs
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.log('No Supabase config found in .env.local - nothing to migrate.');
  process.exit(0);
}

async function fetchTable(table) {
  const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}?select=*`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

const DB_PATH = path.join(process.cwd(), 'data', 'weavarr.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS favorites (
    tmdb_id INTEGER NOT NULL, media_type TEXT NOT NULL, title TEXT NOT NULL,
    poster_path TEXT, release_date TEXT, original_language TEXT, added_at TEXT NOT NULL,
    PRIMARY KEY (tmdb_id, media_type)
  );
  CREATE TABLE IF NOT EXISTS watched (
    tmdb_id INTEGER NOT NULL, media_type TEXT NOT NULL, title TEXT NOT NULL,
    poster_path TEXT, release_date TEXT, watched_at TEXT NOT NULL,
    PRIMARY KEY (tmdb_id, media_type)
  );
  CREATE TABLE IF NOT EXISTS sucks (
    tmdb_id INTEGER NOT NULL, media_type TEXT NOT NULL, title TEXT NOT NULL,
    poster_path TEXT, release_date TEXT, added_at TEXT NOT NULL,
    PRIMARY KEY (tmdb_id, media_type)
  );
`);

async function migrateTable(table, tsCol) {
  const rows = await fetchTable(table);
  const hasLang = table === 'favorites';
  const columns = ['tmdb_id', 'media_type', 'title', 'poster_path', 'release_date', ...(hasLang ? ['original_language'] : []), tsCol];
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
  );
  let count = 0;
  for (const row of rows) {
    const values = [row.tmdb_id, row.media_type, row.title, row.poster_path, row.release_date];
    if (hasLang) values.push(row.original_language ?? null);
    values.push(row[tsCol] ?? new Date().toISOString());
    stmt.run(...values);
    count++;
  }
  console.log(`${table}: migrated ${count} rows`);
}

await migrateTable('favorites', 'added_at');
await migrateTable('watched', 'watched_at');
await migrateTable('sucks', 'added_at');

console.log('Migration complete:', DB_PATH);
