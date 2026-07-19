import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTvDetail, getWatchProviders, TMDB_IMAGE_BASE } from '@/lib/tmdb';
import { getOmdbData } from '@/lib/omdb';
import { computeCompositeScore } from '@/lib/scoring';
import ScoreBadge from '@/components/ScoreBadge';
import TraktScore from '@/components/TraktScore';
import DetailActions from '@/components/DetailActions';
import RequestButton from '@/components/RequestButton';
import BackLink from '@/components/BackLink';
import type { TmdbKeyword, WatchProvider } from '@/types';

interface Props {
  params: { id: string };
}

export default async function TvPage({ params }: Props) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) notFound();

  let detail;
  try {
    detail = await getTvDetail(id);
  } catch {
    notFound();
  }

  const imdbId = detail.external_ids?.imdb_id ?? null;

  const [omdb, watchProviders] = await Promise.all([
    imdbId ? getOmdbData(imdbId) : null,
    getWatchProviders(id, 'tv'),
  ]);

  const score = computeCompositeScore(
    detail.vote_average,
    detail.vote_count,
    omdb,
    null
  );

  const backdropUrl = detail.backdrop_path
    ? `${TMDB_IMAGE_BASE}/w1280${detail.backdrop_path}`
    : null;
  const posterUrl = detail.poster_path
    ? `${TMDB_IMAGE_BASE}/w500${detail.poster_path}`
    : null;
  const year = detail.release_date
    ? new Date(detail.release_date).getFullYear()
    : null;
  const keywords: TmdbKeyword[] = detail.keywords?.keywords ?? [];

  const streamingProviders: WatchProvider[] = watchProviders?.flatrate ?? [];
  const rentProviders: WatchProvider[] = watchProviders?.rent ?? [];

  const trailerKey = detail.videos?.results
    .filter((v) => v.site === 'YouTube' && v.type === 'Trailer')
    .sort((a, b) => (b.official ? 1 : 0) - (a.official ? 1 : 0))[0]?.key ?? null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Nav */}
      <header className="border-b border-zinc-800 px-6 py-5">
        <Link href="/?genre=reality" className="text-2xl font-bold tracking-tight hover:text-amber-400 transition">
          Docu<span className="text-amber-400">View</span>
        </Link>
      </header>

      {/* Backdrop hero */}
      {backdropUrl && (
        <div className="relative h-56 md:h-80 overflow-hidden">
          <Image
            src={backdropUrl}
            alt={detail.title}
            fill
            className="object-cover opacity-35"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent" />
        </div>
      )}

      <div
        className={`max-w-5xl mx-auto px-4 py-8 ${backdropUrl ? '-mt-28 relative z-10' : ''}`}
      >
        <BackLink />
        <div className="flex flex-col md:flex-row gap-8">
          {/* Poster */}
          {posterUrl && (
            <div className="flex-shrink-0">
              <div className="relative w-44 md:w-52 aspect-[2/3] rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10">
                <Image src={posterUrl} alt={detail.title} fill className="object-cover" />
              </div>
            </div>
          )}

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold leading-tight">
              {detail.title}
            </h1>
            {detail.tagline && (
              <p className="text-zinc-400 italic mt-1 text-sm">{detail.tagline}</p>
            )}

            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-zinc-400">
              {year && <span>{year}</span>}
              {detail.runtime && detail.runtime > 0 && (
                <span>{detail.runtime} min / ep</span>
              )}
              {detail.status && (() => {
                const s = detail.status;
                const color =
                  s === 'Returning Series' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                  s === 'Ended'            ? 'bg-zinc-700/60 text-zinc-400 border-zinc-600' :
                  s === 'Canceled'         ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                  s === 'In Production'    ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                                            'bg-zinc-700/60 text-zinc-400 border-zinc-600';
                return (
                  <span className={`px-2 py-0.5 rounded-full text-xs border ${color}`}>
                    {s === 'Returning Series' ? '● Ongoing' :
                     s === 'Canceled'         ? '✕ Cancelled' :
                     s === 'In Production'    ? '⟳ In Production' :
                     s}
                  </span>
                );
              })()}
              {omdb?.Rated && omdb.Rated !== 'N/A' && (
                <span className="px-1.5 py-0.5 border border-zinc-600 rounded text-xs">
                  {omdb.Rated}
                </span>
              )}
              {(detail.spoken_languages?.[0]?.english_name || detail.original_language) && (
                <span className="px-1.5 py-0.5 border border-zinc-600 rounded text-xs">
                  {detail.spoken_languages?.[0]?.english_name ?? detail.original_language}
                </span>
              )}
            </div>

            <DetailActions
              id={detail.id}
              mediaType="tv"
              title={detail.title}
              poster_path={detail.poster_path}
              release_date={detail.release_date ?? ''}
            >
              <RequestButton id={detail.id} mediaType="tv" title={detail.title} imdbId={imdbId} />
            </DetailActions>

            {/* Composite score card */}
            <div className="mt-5 p-4 bg-zinc-900 rounded-xl w-fit ring-1 ring-white/5">
              <div className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">
                DocuView Score <span className="normal-case text-zinc-600">(Bayesian · IMDb-anchored)</span>
              </div>
              <div className="flex items-center gap-4">
                <ScoreBadge score={score.score} size="lg" />
                <div className="text-xs text-zinc-400 space-y-1">
                  {score.tmdbScore > 0 && (
                    <div>
                      TMDb: <span className="text-white">{score.tmdbScore.toFixed(1)}</span>
                      <span className="text-zinc-600"> ({detail.vote_count.toLocaleString()} votes)</span>
                    </div>
                  )}
                  {score.imdbScore !== null && (
                    <div>
                      IMDb: <span className="text-white">{score.imdbScore.toFixed(1)}</span>
                      <span className="text-zinc-600"> ({omdb?.imdbVotes} votes)</span>
                    </div>
                  )}
                  {imdbId && <TraktScore imdbId={imdbId} />}
                  {score.rtScore && (
                    <div>
                      Rotten Tomatoes: <span className="text-white">{score.rtScore}</span>
                    </div>
                  )}
                  {score.metacriticScore && (
                    <div>
                      Metacritic: <span className="text-white">{score.metacriticScore}</span>
                    </div>
                  )}
                </div>
              </div>
              <div
                className={`text-xs mt-2 ${
                  score.confidence === 'high'
                    ? 'text-green-400'
                    : score.confidence === 'medium'
                    ? 'text-yellow-400'
                    : 'text-zinc-600'
                }`}
              >
                {score.confidence} confidence
              </div>
            </div>

            {/* Trailer link */}
            {trailerKey && (
              <a
                href={`https://www.youtube.com/watch?v=${trailerKey}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-red-700 hover:bg-red-600 transition rounded-lg text-sm font-medium"
              >
                ▶ Watch Trailer
              </a>
            )}

            {/* Where to Watch */}
            {(streamingProviders.length > 0 || rentProviders.length > 0) && (
              <div className="mt-6">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                  Where to Watch
                </h2>
                {streamingProviders.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-zinc-600 mb-2">Stream</p>
                    <div className="flex flex-wrap gap-2">
                      {streamingProviders.map((p) => (
                        <div
                          key={p.provider_id}
                          title={p.provider_name}
                          className="relative w-10 h-10 rounded-lg overflow-hidden ring-1 ring-white/10"
                        >
                          <Image
                            src={`${TMDB_IMAGE_BASE}/w45${p.logo_path}`}
                            alt={p.provider_name}
                            fill
                            className="object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {rentProviders.length > 0 && (
                  <div>
                    <p className="text-xs text-zinc-600 mb-2">Rent / Buy</p>
                    <div className="flex flex-wrap gap-2">
                      {rentProviders.map((p) => (
                        <div
                          key={p.provider_id}
                          title={p.provider_name}
                          className="relative w-10 h-10 rounded-lg overflow-hidden ring-1 ring-white/10 opacity-70"
                        >
                          <Image
                            src={`${TMDB_IMAGE_BASE}/w45${p.logo_path}`}
                            alt={p.provider_name}
                            fill
                            className="object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-xs text-zinc-700 mt-2">
                  Availability data via JustWatch · US only
                </p>
              </div>
            )}

            {/* Overview */}
            {detail.overview && (
              <p className="mt-5 text-zinc-300 leading-relaxed text-sm">
                {detail.overview}
              </p>
            )}

            {/* Credits from OMDb */}
            {omdb && (
              <div className="mt-5 text-sm space-y-1.5">
                {omdb.Director && omdb.Director !== 'N/A' && (
                  <p>
                    <span className="text-zinc-500">Director</span>{' '}
                    <span className="text-zinc-200">{omdb.Director}</span>
                  </p>
                )}
                {omdb.Actors && omdb.Actors !== 'N/A' && (
                  <p>
                    <span className="text-zinc-500">Featuring</span>{' '}
                    <span className="text-zinc-200">{omdb.Actors}</span>
                  </p>
                )}
                {omdb.Awards && omdb.Awards !== 'N/A' && (
                  <p className="text-amber-400 text-xs mt-2">🏆 {omdb.Awards}</p>
                )}
              </div>
            )}

            {/* Keywords / tags */}
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-5">
                {keywords.slice(0, 14).map((kw) => (
                  <span
                    key={kw.id}
                    className="text-xs px-2.5 py-1 bg-zinc-800 rounded-full text-zinc-400"
                  >
                    {kw.name}
                  </span>
                ))}
              </div>
            )}

            <Link
              href="/?genre=reality"
              className="inline-block mt-8 text-sm text-zinc-500 hover:text-amber-400 transition"
            >
              ← Back to Reality TV
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
