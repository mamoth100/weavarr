import Image from 'next/image';
import Link from 'next/link';
import { TMDB_IMAGE_BASE } from '@/lib/tmdb';
import type { TmdbCredit, OmdbResponse } from '@/types';

const MAX_CAST = 12;
const CREW_JOBS = ['Director', 'Writer', 'Screenplay', 'Creator', 'Executive Producer'];

/**
 * Cast and crew on a detail page, every name a link to that person's page.
 * TMDB credits first; the old OMDb text lines stay as the fallback when a
 * title has none, and OMDb's awards line stays regardless.
 */
export default function CreditsSection({
  credits,
  createdBy,
  omdb,
}: {
  credits?: { cast: TmdbCredit[]; crew: TmdbCredit[] };
  createdBy?: { id: number; name: string; profile_path: string | null }[];
  omdb: OmdbResponse | null;
}) {
  const cast = (credits?.cast ?? []).slice(0, MAX_CAST);
  // One line per role, people deduplicated within it (a director who also wrote).
  const crewByJob = new Map<string, { id: number; name: string }[]>();
  for (const c of createdBy ?? []) crewByJob.set('Creator', [...(crewByJob.get('Creator') ?? []), { id: c.id, name: c.name }]);
  for (const c of credits?.crew ?? []) {
    if (!c.job || !CREW_JOBS.includes(c.job)) continue;
    const list = crewByJob.get(c.job) ?? [];
    if (!list.some((p) => p.id === c.id)) list.push({ id: c.id, name: c.name });
    crewByJob.set(c.job, list);
  }
  const crewLines = CREW_JOBS.filter((job) => crewByJob.has(job)).map((job) => ({
    job: job === 'Screenplay' ? 'Writer' : job,
    people: crewByJob.get(job)!,
  }));
  const hasTmdbCredits = cast.length > 0 || crewLines.length > 0;

  return (
    <div className="mt-5 text-sm space-y-3">
      {hasTmdbCredits ? (
        <>
          {crewLines.map((line) => (
            <p key={line.job}>
              <span className="text-zinc-500">{line.job}{line.people.length > 1 ? 's' : ''}</span>{' '}
              {line.people.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && <span className="text-zinc-500">, </span>}
                  <Link href={`/person/${p.id}`} className="text-zinc-200 hover:text-amber-400 transition-colors">
                    {p.name}
                  </Link>
                </span>
              ))}
            </p>
          ))}
          {cast.length > 0 && (
            <div>
              <p className="text-zinc-500 mb-2">Cast</p>
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {cast.map((c) => (
                  <li key={c.id}>
                    <Link href={`/person/${c.id}`} className="flex items-center gap-2 min-w-0 group">
                      <span className="relative w-9 h-9 rounded-full overflow-hidden bg-zinc-800 flex-shrink-0">
                        {c.profile_path && (
                          <Image src={`${TMDB_IMAGE_BASE}/w185${c.profile_path}`} alt="" fill sizes="36px" className="object-cover" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-zinc-200 group-hover:text-amber-400 transition-colors">{c.name}</span>
                        {c.character && <span className="block truncate text-xs text-zinc-500">{c.character}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        omdb && (
          <div className="space-y-1.5">
            {omdb.Director && omdb.Director !== 'N/A' && (
              <p>
                <span className="text-zinc-500">Director</span> <span className="text-zinc-200">{omdb.Director}</span>
              </p>
            )}
            {omdb.Actors && omdb.Actors !== 'N/A' && (
              <p>
                <span className="text-zinc-500">Featuring</span> <span className="text-zinc-200">{omdb.Actors}</span>
              </p>
            )}
          </div>
        )
      )}
      {omdb?.Awards && omdb.Awards !== 'N/A' && <p className="text-amber-400 text-xs">{omdb.Awards}</p>}
    </div>
  );
}
