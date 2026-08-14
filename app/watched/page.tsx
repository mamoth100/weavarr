'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useWatchlist } from '@/hooks/useWatchlist';
import { TMDB_IMAGE_BASE } from '@/lib/tmdb';
import BackLink from '@/components/BackLink';
import AppShell from '@/components/AppShell';

export default function WatchedPage() {
  const { watchedItems, toggleWatched } = useWatchlist();

  return (
    <AppShell title="Everything you've watched" headerActions={<BackLink />}>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {watchedItems.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-zinc-500 text-lg">Nothing marked as watched yet.</p>
            <p className="text-zinc-500 text-sm mt-2">
              Hover over any card and tap &ldquo;Mark watched&rdquo; to track what you&apos;ve seen.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-zinc-500 mb-4">
              {watchedItems.length} watched
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {watchedItems.map((item) => {
                const href =
                  item.mediaType === 'tv'
                    ? `/tv/${item.id}`
                    : `/documentary/${item.id}`;
                const posterUrl = item.poster_path
                  ? `${TMDB_IMAGE_BASE}/w342${item.poster_path}`
                  : null;
                const year = item.release_date
                  ? new Date(item.release_date).getFullYear()
                  : null;

                return (
                  <div key={`${item.mediaType}-${item.id}`} className="group">
                    <div className="relative aspect-[2/3] bg-zinc-800 rounded-lg overflow-hidden">
                      <Link href={href}>
                        {posterUrl ? (
                          <Image
                            src={posterUrl}
                            alt={item.title}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 20vw"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs text-center p-2">
                            No Poster
                          </div>
                        )}
                      </Link>

                      {/* Always-visible watched badge */}
                      <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded-md bg-green-600/90 text-white text-xs font-semibold">
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4.5 12.75l6 6 9-13.5"
                          />
                        </svg>
                        Watched
                      </div>

                      {/* Remove from watched - top-right on hover */}
                      <button
                        onClick={() => toggleWatched(item)}
                        className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-zinc-900/80 text-zinc-400 hover:text-red-400 hover:bg-zinc-900 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 touch:opacity-100 transition-all duration-200"
                        aria-label="Remove from watched"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>

                    <Link href={href}>
                      <div className="mt-2 px-1">
                        <p className="text-sm font-medium leading-tight truncate hover:text-amber-400 transition-colors">
                          {item.title}
                        </p>
                        {year && (
                          <p className="text-xs text-zinc-500 mt-0.5">{year}</p>
                        )}
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
