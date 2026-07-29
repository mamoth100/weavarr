'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useWatchlist } from '@/hooks/useWatchlist';
import { TMDB_IMAGE_BASE } from '@/lib/tmdb';
import BackLink from '@/components/BackLink';

export default function FavoritesPage() {
  const { favorites, removeFavorite, isWatched, toggleWatched, addSucks, isSucks } =
    useWatchlist();

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/" className="text-2xl font-bold tracking-tight hover:text-amber-400 transition">
              Weav<span className="text-amber-400">arr</span>
            </Link>
            <p className="text-zinc-500 text-sm mt-0.5">Your favorites</p>
          </div>
          <BackLink />
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {favorites.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-zinc-500 text-lg">No favorites yet.</p>
            <p className="text-zinc-600 text-sm mt-2">
              Hover over any card and tap the heart to save it here.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-zinc-600 mb-4">
              {favorites.length} saved
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {favorites.map((item) => {
                const watched = isWatched(item.id, item.mediaType);
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
                const isUpcoming = item.release_date
                  ? new Date(item.release_date + 'T00:00:00') > new Date()
                  : false;
                const releaseDateLabel = item.release_date
                  ? new Date(item.release_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
                          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs text-center p-2">
                            No Poster
                          </div>
                        )}
                      </Link>

                      {/* Upcoming release date badge — top-right */}
                      {isUpcoming && releaseDateLabel && (
                        <div className="absolute top-2 right-2 bg-amber-400 text-zinc-950 text-xs font-semibold px-2 py-1 rounded-md">
                          {releaseDateLabel}
                        </div>
                      )}

                      {/* Watched toggle */}
                      <button
                        onClick={() => toggleWatched(item)}
                        className={`absolute bottom-2 left-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-all duration-200
                          ${
                            watched
                              ? 'bg-green-600/90 text-white opacity-100'
                              : 'bg-zinc-900/80 text-zinc-400 opacity-0 group-hover:opacity-100'
                          }`}
                        aria-label={
                          watched ? 'Mark as unwatched' : 'Mark as watched'
                        }
                      >
                        {watched ? (
                          <>
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
                          </>
                        ) : (
                          <>
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                            </svg>
                            Mark watched
                          </>
                        )}
                      </button>

                      {/* Thumbs down — move to sucks */}
                      <button
                        onClick={() => {
                          addSucks({ ...item, addedAt: Date.now() });
                          removeFavorite(item.id, item.mediaType);
                        }}
                        className={`absolute bottom-10 left-2 z-10 p-1.5 rounded-full transition-all duration-200
                          ${
                            isSucks(item.id, item.mediaType)
                              ? 'bg-red-600/90 text-white opacity-100'
                              : 'bg-zinc-900/80 text-zinc-400 opacity-0 group-hover:opacity-100'
                          }`}
                        aria-label="Move to sucks"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a8.96 8.96 0 01-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398-.306.774-1.105 1.25-1.987 1.25H14.5m0 0l-4.072 1.957a1.5 1.5 0 01-2.181-1.341V16.5M7.5 15V9.75a.75.75 0 01.75-.75h1.5" />
                        </svg>
                      </button>

                      {/* Remove button — top-right on hover */}
                      <button
                        onClick={() => removeFavorite(item.id, item.mediaType)}
                        className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-zinc-900/80 text-zinc-400 hover:text-red-400 hover:bg-zinc-900 opacity-0 group-hover:opacity-100 transition-all duration-200"
                        aria-label="Remove from favorites"
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

                      {/* Language badge — bottom-right */}
                      {item.original_language && (
                        <div className="absolute bottom-2 right-2 bg-zinc-900/80 text-zinc-300 text-xs px-1.5 py-0.5 rounded">
                          {(() => { try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(item.original_language) ?? item.original_language; } catch { return item.original_language; } })()}
                        </div>
                      )}
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
    </main>
  );
}
