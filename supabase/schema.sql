-- Run this in your Supabase dashboard: SQL Editor → New query
-- Drop old tables if you already ran the previous version
drop table if exists favorites;
drop table if exists watched;

create table favorites (
  id bigint generated always as identity primary key,
  tmdb_id integer not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  title text not null,
  poster_path text,
  release_date text,
  added_at timestamptz default now() not null,
  unique (tmdb_id, media_type)
);

create table watched (
  id bigint generated always as identity primary key,
  tmdb_id integer not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  title text not null,
  poster_path text,
  release_date text,
  watched_at timestamptz default now() not null,
  unique (tmdb_id, media_type)
);

create table sucks (
  id bigint generated always as identity primary key,
  tmdb_id integer not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  title text not null,
  poster_path text,
  release_date text,
  added_at timestamptz default now() not null,
  unique (tmdb_id, media_type)
);
