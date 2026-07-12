-- Run this in your Supabase dashboard: SQL Editor → New query

create table if not exists favorites (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  tmdb_id integer not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  title text not null,
  poster_path text,
  release_date text,
  added_at timestamptz default now() not null,
  unique (user_id, tmdb_id, media_type)
);

alter table favorites enable row level security;

create policy "Users own favorites" on favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists watched (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  tmdb_id integer not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  title text not null,
  poster_path text,
  release_date text,
  watched_at timestamptz default now() not null,
  unique (user_id, tmdb_id, media_type)
);

alter table watched enable row level security;

create policy "Users own watched" on watched
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
