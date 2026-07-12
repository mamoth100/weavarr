'use client';

import Image from 'next/image';
import Link from 'next/link';
import { TMDB_IMAGE_BASE } from '@/lib/tmdb';
import ScoreBadge from './ScoreBadge';
import CardActions from './CardActions';
import type { TmdbMovie } from '@/types';

interface Props {
  doc: TmdbMovie;
  mediaType?: 'movie' | 'tv';
  variant?: 'default' | 'upcoming';
}

function formatReleaseDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getLanguageName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export default function DocCard({ doc, mediaType = 'movie', variant = 'default' }: Props) {
  const year = doc.release_date
    ? new Date(doc.release_date).getFullYear()
    : null;
  const posterUrl = doc.poster_path
    ? `${TMDB_IMAGE_BASE}/w342${doc.poster_path}`
    : null;
  const href = mediaType === 'tv' ? `/tv/${doc.id}` : `/documentary/${doc.id}`;

  return (
    <div className="group relative">
      {/* CardActions is OUTSIDE the Link so clicks don't trigger navigation */}
      <CardActions
        id={doc.id}
        mediaType={mediaType}
        title={doc.title}
        poster_path={doc.poster_path}
        release_date={doc.release_date ?? ''}
        original_language={doc.original_language}
      />
      <Link href={href}>
        <div className="relative aspect-[2/3] bg-zinc-800 rounded-lg overflow-hidden">
          {posterUrl ? (
            <Image
              src={posterUrl}
              alt={doc.title}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 20vw"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs text-center p-2">
              No Poster
            </div>
          )}
          <div className="absolute top-2 right-2">
            {variant === 'upcoming' && doc.release_date ? (
              <span className="bg-amber-400 text-zinc-950 text-xs font-semibold px-2 py-1 rounded-md">
                {formatReleaseDate(doc.release_date)}
              </span>
            ) : (
              <ScoreBadge score={doc.vote_average} size="sm" />
            )}
          </div>
          {(doc.spoken_language ?? doc.original_language) && (
            <div className="absolute bottom-2 right-2 bg-zinc-900/80 text-zinc-300 text-xs px-1.5 py-0.5 rounded">
              {doc.spoken_language ?? getLanguageName(doc.original_language!)}
            </div>
          )}
        </div>
        <div className="mt-2 px-1">
          <p className="text-sm font-medium leading-tight truncate group-hover:text-amber-400 transition-colors">
            {doc.title}
          </p>
          {variant !== 'upcoming' && year && <p className="text-xs text-zinc-500 mt-0.5">{year}</p>}
        </div>
      </Link>
    </div>
  );
}
