import Image from 'next/image';
import { notFound } from 'next/navigation';
import AppShell from '@/components/AppShell';
import BackLink from '@/components/BackLink';
import CardGrid from '@/components/CardGrid';
import RequestAllButton from '@/components/RequestAllButton';
import { getCollection, TMDB_IMAGE_BASE } from '@/lib/tmdb';

export const dynamic = 'force-dynamic';

/**
 * A film series on one page, in release order, with the usual cards and a
 * Request all that adds whatever is missing. Reached from the "Part of"
 * link on a movie's page.
 */
export default async function CollectionPage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) notFound();

  let collection;
  try {
    collection = await getCollection(id);
  } catch {
    notFound();
  }

  const years = collection.parts.map((p) => p.release_date?.slice(0, 4)).filter(Boolean);
  const span = years.length > 0 ? `${years[0]} to ${years[years.length - 1]}` : null;

  return (
    <AppShell>
      {collection.backdrop_path && (
        <div className="relative h-40 md:h-64 overflow-hidden">
          <Image src={`${TMDB_IMAGE_BASE}/w1280${collection.backdrop_path}`} alt={collection.name} fill className="object-cover opacity-35" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent" />
        </div>
      )}
      <div className={`max-w-5xl mx-auto px-4 py-8 ${collection.backdrop_path ? '-mt-16 md:-mt-24 relative z-10' : ''}`}>
        <BackLink />
        <div className="flex flex-col sm:flex-row gap-6">
          {collection.poster_path && (
            <div className="relative w-32 h-48 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0 shadow-xl">
              <Image src={`${TMDB_IMAGE_BASE}/w300${collection.poster_path}`} alt={collection.name} fill sizes="128px" className="object-cover" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold">{collection.name}</h1>
            <p className="text-sm text-zinc-400 mt-1">
              {collection.parts.length} movie{collection.parts.length === 1 ? '' : 's'}
              {span && `, ${span}`}
            </p>
            {collection.overview && <p className="mt-3 text-sm text-zinc-300 leading-relaxed">{collection.overview}</p>}
            <div className="mt-4">
              <RequestAllButton movies={collection.parts.map((p) => ({ id: p.id, title: p.title, release_date: p.release_date }))} />
            </div>
          </div>
        </div>

        <section className="mt-10">
          <CardGrid items={collection.parts} mediaType="movie" quiet />
        </section>
      </div>
    </AppShell>
  );
}
