'use client';

import Image from 'next/image';
import Link from 'next/link';
import { TMDB_IMAGE_BASE } from '@/lib/tmdb';
import { useState } from 'react';
import ScoreBadge from './ScoreBadge';
import CardActions from './CardActions';
import CardRequestPill from './CardRequestPill';
import { useLibraryStatus, type Availability } from '@/hooks/useLibraryStatus';
import { useDownloadProgress } from '@/hooks/useDownloadProgress';
import type { TmdbMovie } from '@/types';

const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: 'In your library',
  partial: 'Partially in your library',
  requested: 'Added - not downloaded yet',
};

/** Seerr-style at-a-glance badge: green = downloaded, amber = some episodes, grey = added but nothing on disk yet. Colors match the calendar legend. */
function AvailabilityBadge({ availability }: { availability: Availability }) {
  const color =
    availability === 'available' ? 'bg-green-500' : availability === 'partial' ? 'bg-amber-400' : 'bg-zinc-600';
  return (
    <div
      // Right edge, under the score badge - the left edge belongs to the
      // stacked action column (heart / not interested / Mark watched).
      className={`absolute top-10 touch:top-12 right-2 z-10 w-5 h-5 rounded-full flex items-center justify-center ring-1 ring-black/40 shadow ${color}`}
      title={AVAILABILITY_LABEL[availability]}
      aria-label={AVAILABILITY_LABEL[availability]}
    >
      {availability === 'requested' ? (
        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l-6-6m6 6l6-6" />
        </svg>
      ) : (
        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      )}
    </div>
  );
}

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
  const libraryStatus = useLibraryStatus();
  const progressMap = useDownloadProgress();
  // Requested from THIS card this session - flips the state instantly while
  // the library-status cache (one fetch per page load) still says unknown.
  const [justRequested, setJustRequested] = useState(false);
  const cardMediaType = doc.mediaType ?? mediaType;
  const availability: Availability | undefined =
    (libraryStatus
      ? (cardMediaType === 'tv' ? libraryStatus.shows[doc.id] : libraryStatus.movies[doc.id])
      : undefined) ?? (justRequested ? 'requested' : undefined);
  const progress = progressMap
    ? (cardMediaType === 'tv' ? progressMap.shows[doc.id] : progressMap.movies[doc.id])
    : undefined;
  const year = doc.release_date
    ? new Date(doc.release_date).getFullYear()
    : null;
  const posterUrl = doc.poster_path
    ? `${TMDB_IMAGE_BASE}/w342${doc.poster_path}`
    : null;
  const href = mediaType === 'tv' ? `/tv/${doc.id}` : `/documentary/${doc.id}`;

  return (
    <div className="group">
      {/* This wrapper is the positioning context for CardActions - it spans
          ONLY the poster. Anchoring to the whole card put bottom-2 below the
          poster, rendering the Watched pill over the title text. */}
      <div className="relative">
        {/* CardActions is OUTSIDE the Link so clicks don't trigger navigation */}
        <CardActions
          id={doc.id}
          mediaType={mediaType}
          title={doc.title}
          poster_path={doc.poster_path}
          release_date={doc.release_date ?? ''}
          original_language={doc.original_language}
        />
        {/* Request pill only while the title isn't in the library - once
            requested/downloading/owned, the badge and progress strip tell
            that story instead. */}
        {libraryStatus && !availability && !progress && (
          <CardRequestPill
            id={doc.id}
            mediaType={cardMediaType}
            title={doc.title}
            poster_path={doc.poster_path}
            release_date={doc.release_date ?? ''}
            onRequested={() => setJustRequested(true)}
          />
        )}
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
            <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs text-center p-2">
              No Poster
            </div>
          )}
          {/* Seerr-style hover synopsis. mouse: only - touch devices have no
              hover, and the detail page carries the full overview there.
              Rendered BEFORE the badges so score/availability stay on top.
              The action column sits top-left, so the text only needs to
              clear the little language chip at bottom-right. */}
          {doc.overview && (
            <div className="hidden mouse:flex absolute inset-0 flex-col justify-end px-3 pt-3 pb-8 bg-gradient-to-t from-black/95 via-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              {/* line-clamp-[7]: bracket syntax on purpose - Tailwind's core
                  clamp utilities stop at 6, and the bare line-clamp-7 class
                  silently compiles to nothing (text overflows the poster). */}
              <p className="text-xs text-zinc-100 leading-snug line-clamp-[7]">{doc.overview}</p>
            </div>
          )}
          {availability && <AvailabilityBadge availability={availability} />}
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
          {/* Live download state: chip + bottom progress strip. Replaces the
              request pill / requested badge while active - the card walks
              Request -> Requested -> downloading % -> In your library. */}
          {progress && (
            <>
              <div className="absolute bottom-2 left-2 bg-sky-600/90 text-white text-xs font-semibold px-1.5 py-0.5 rounded shadow">
                {progress.state === 'importing' ? 'Importing…' : progress.state === 'queued' ? 'Queued' : `↓ ${progress.percent}%`}
              </div>
              <div className="absolute bottom-0 inset-x-0 h-1 bg-zinc-800/80">
                <div className="h-full bg-sky-500 transition-all" style={{ width: `${progress.percent}%` }} />
              </div>
            </>
          )}
          </div>
        </Link>
      </div>
      <Link href={href}>
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
