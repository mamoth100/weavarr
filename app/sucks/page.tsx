'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useWatchlist } from '@/hooks/useWatchlist';
import { TMDB_IMAGE_BASE } from '@/lib/tmdb';
import BackLink from '@/components/BackLink';

export default function SucksPage() {
  const { sucksItems, removeSucks } = useWatchlist();

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/" className="text-2xl font-bold tracking-tight hover:text-amber-400 transition">
              Docu<span className="text-amber-400">View</span>
            </Link>
            <p className="text-zinc-500 text-sm mt-0.5">Things that suck</p>
          </div>
          <BackLink />
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {sucksItems.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-zinc-500 text-lg">Nothing marked as sucks yet.</p>
            <p className="text-zinc-600 text-sm mt-2">
              Hover over any card and tap the thumbs down to track what sucked.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-zinc-600 mb-4">{sucksItems.length} items</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {sucksItems.map((item) => {
                const href = item.mediaType === 'tv' ? `/tv/${item.id}` : `/documentary/${item.id}`;
                const posterUrl = item.poster_path ? `${TMDB_IMAGE_BASE}/w342${item.poster_path}` : null;
                const year = item.release_date ? new Date(item.release_date).getFullYear() : null;

                return (
                  <div key={`${item.mediaType}-${item.id}`} className="group">
                    <div className="relative aspect-[2/3] bg-zinc-800 rounded-lg overflow-hidden">
                      <Link href={href}>
                        {posterUrl ? (
                          <Image
                            src={posterUrl}
                            alt={item.title}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300 opacity-60"
                            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 20vw"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs text-center p-2">
                            No Poster
                          </div>
                        )}
                      </Link>

                      {/* Always-visible sucks badge */}
                      <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded-md bg-red-600/90 text-white text-xs font-semibold">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a8.96 8.96 0 01-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398-.306.774-1.105 1.25-1.987 1.25H14.5m0 0l-4.072 1.957a1.5 1.5 0 01-2.181-1.341V16.5M7.5 15V9.75a.75.75 0 01.75-.75h1.5" />
                        </svg>
                        Sucks
                      </div>

                      {/* Remove — top-right on hover */}
                      <button
                        onClick={() => removeSucks(item.id, item.mediaType)}
                        className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-zinc-900/80 text-zinc-400 hover:text-white hover:bg-zinc-900 opacity-0 group-hover:opacity-100 transition-all duration-200"
                        aria-label="Remove from sucks"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    <Link href={href}>
                      <div className="mt-2 px-1">
                        <p className="text-sm font-medium leading-tight truncate hover:text-amber-400 transition-colors text-zinc-500">
                          {item.title}
                        </p>
                        {year && <p className="text-xs text-zinc-600 mt-0.5">{year}</p>}
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
