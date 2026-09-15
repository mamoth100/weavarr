import Image from 'next/image';
import { notFound } from 'next/navigation';
import AppShell from '@/components/AppShell';
import BackLink from '@/components/BackLink';
import CardGrid from '@/components/CardGrid';
import ExpandableText from '@/components/ExpandableText';
import { getPerson, TMDB_IMAGE_BASE } from '@/lib/tmdb';

export const dynamic = 'force-dynamic';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * A person's page: photo, bio, and everything they were part of as the same
 * cards used everywhere else, so each title carries its library badge and
 * request button. Reached from the cast and crew names on a detail page.
 */
export default async function PersonPage({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) notFound();

  let person;
  try {
    person = await getPerson(id);
  } catch {
    notFound();
  }

  const born = person.birthday ? formatDate(person.birthday) : null;
  const died = person.deathday ? formatDate(person.deathday) : null;

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <BackLink />
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="relative w-40 h-60 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0">
            {person.profile_path && (
              <Image src={`${TMDB_IMAGE_BASE}/w300${person.profile_path}`} alt={person.name} fill sizes="160px" className="object-cover" priority />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold">{person.name}</h1>
            {person.known_for_department && <p className="text-sm text-zinc-400 mt-1">{person.known_for_department}</p>}
            {(born || person.place_of_birth) && (
              <p className="text-sm text-zinc-500 mt-2">
                {born && <>Born {born}</>}
                {born && person.place_of_birth && ', '}
                {person.place_of_birth}
                {died && <>. Died {died}</>}
              </p>
            )}
            {person.biography && (
              <div className="mt-4">
                <ExpandableText text={person.biography} lines={6} />
              </div>
            )}
          </div>
        </div>

        {person.knownFor.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Known for</h2>
            <CardGrid items={person.knownFor} mediaType="movie" />
          </section>
        )}
        {person.movies.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Movies ({person.movies.length})</h2>
            <CardGrid items={person.movies} mediaType="movie" />
          </section>
        )}
        {person.shows.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Shows ({person.shows.length})</h2>
            <CardGrid items={person.shows} mediaType="tv" />
          </section>
        )}
        {person.movies.length === 0 && person.shows.length === 0 && (
          <p className="mt-10 text-sm text-zinc-500">TMDB lists no movies or shows for this person.</p>
        )}
      </div>
    </AppShell>
  );
}
