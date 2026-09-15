import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AppShell from '@/components/AppShell';
import CardGrid from '@/components/CardGrid';
import TrailerButton from '@/components/TrailerButton';
import { catalogGenreForTmdbId } from '@/lib/genreCatalog';
import { getDocumentaryDetail, getWatchProviders, TMDB_IMAGE_BASE } from '@/lib/tmdb';
import { getOmdbData } from '@/lib/omdb';
import { getRadarrMovieIdByTmdbId } from '@/lib/radarr';
import { computeCompositeScore } from '@/lib/scoring';
import ScoreBadge from '@/components/ScoreBadge';
import TraktScore from '@/components/TraktScore';
import DetailActions from '@/components/DetailActions';
import RequestButton from '@/components/RequestButton';
import BackLink from '@/components/BackLink';
import CreditsSection from '@/components/CreditsSection';
import type { TmdbKeyword, WatchProvider } from '@/types';

interface Props {
  params: { id: string };
}

export default async function DocumentaryPage({ params }: Props) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) notFound();

  let detail;
  try {
    detail = await getDocumentaryDetail(id);
  } catch {
    notFound();
  }

  const imdbId = detail.external_ids?.imdb_id ?? null;

  // Fetch external data in parallel (Trakt loaded client-side to avoid Cloudflare block)
  const [omdb, watchProviders, radarrMovieId] = await Promise.all([
    imdbId ? getOmdbData(imdbId) : null,
    getWatchProviders(id),
    getRadarrMovieIdByTmdbId(id).catch(() => null),
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

  // Pick the best trailer: official first, then any trailer, from YouTube only
  const trailerKey = detail.videos?.results
    .filter((v) => v.site === 'YouTube' && v.type === 'Trailer')
    .sort((a, b) => (b.official ? 1 : 0) - (a.official ? 1 : 0))[0]?.key ?? null;

  return (
    <AppShell>
      {/* Backdrop hero */}
      {backdropUrl && (
        <div className="relative h-40 md:h-80 overflow-hidden">
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
        className={`max-w-5xl mx-auto px-4 py-8 ${backdropUrl ? '-mt-16 md:-mt-28 relative z-10' : ''}`}
      >
        <BackLink />
        <div className="flex flex-row gap-4 md:gap-8">
          {/* Poster */}
          {posterUrl && (
            <div className="flex-shrink-0">
              <div className="relative w-28 sm:w-36 md:w-52 aspect-[2/3] rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10">
                <Image src={posterUrl} alt={detail.title} fill className="object-cover" sizes="(max-width: 640px) 112px, (max-width: 768px) 144px, 208px" />
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
                <span>{detail.runtime} min</span>
              )}
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

            {/* Genre chips - clickable into the browse grid when a catalog genre covers them */}
            {(detail.genres?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {detail.genres!.map((g) => {
                  const catalog = catalogGenreForTmdbId(g.id, 'movie');
                  return catalog ? (
                    <Link
                      key={g.id}
                      href={`/?genre=${catalog.id}`}
                      className="text-xs px-2.5 py-1 bg-zinc-800 hover:bg-amber-500 hover:text-black transition-colors rounded-full text-zinc-300 font-medium"
                    >
                      {g.name}
                    </Link>
                  ) : (
                    <span key={g.id} className="text-xs px-2.5 py-1 bg-zinc-800/60 rounded-full text-zinc-500">
                      {g.name}
                    </span>
                  );
                })}
              </div>
            )}

            {detail.belongs_to_collection && (
              <Link
                href={`/collection/${detail.belongs_to_collection.id}`}
                className="inline-flex items-center gap-1.5 mt-3 text-xs px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25 hover:bg-amber-500 hover:text-black transition-colors font-medium"
              >
                Part of the {detail.belongs_to_collection.name}
              </Link>
            )}

            <DetailActions
              id={detail.id}
              mediaType="movie"
              title={detail.title}
              poster_path={detail.poster_path}
              release_date={detail.release_date ?? ''}
            >
              <RequestButton
                id={detail.id}
                mediaType="movie"
                title={detail.title}
                poster_path={detail.poster_path}
                release_date={detail.release_date ?? ''}
                radarrMovieId={radarrMovieId}
              />
            </DetailActions>

            {/* Composite score card */}
            <div className="mt-5 p-4 bg-zinc-900 rounded-xl w-fit ring-1 ring-white/5">
              <div className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">
                Weavarr Score <span className="normal-case text-zinc-500">(Bayesian · IMDb-anchored)</span>
              </div>
              <div className="flex items-center gap-4">
                <ScoreBadge score={score.score} size="lg" />
                <div className="text-xs text-zinc-400 space-y-1">
                  {score.tmdbScore > 0 && (
                    <div>
                      TMDb: <span className="text-white">{score.tmdbScore.toFixed(1)}</span>
                      <span className="text-zinc-500"> ({detail.vote_count.toLocaleString()} votes)</span>
                    </div>
                  )}
                  {score.imdbScore !== null && (
                    <div>
                      IMDb: <span className="text-white">{score.imdbScore.toFixed(1)}</span>
                      <span className="text-zinc-500"> ({omdb?.imdbVotes} votes)</span>
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
                    : 'text-zinc-500'
                }`}
              >
                {score.confidence} confidence
              </div>
            </div>

            {trailerKey && <TrailerButton trailerKey={trailerKey} title={detail.title} />}

            {/* Where to Watch */}
            {(streamingProviders.length > 0 || rentProviders.length > 0) && (
              <div className="mt-6">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                  Where to Watch
                </h2>
                {streamingProviders.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-zinc-500 mb-2">Stream</p>
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
                    <p className="text-xs text-zinc-500 mb-2">Rent / Buy</p>
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

            {/* Cast and crew, every name a link to the person's page */}
            <CreditsSection credits={detail.credits} createdBy={detail.created_by} omdb={omdb} />

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

            <BackLink />
          </div>
        </div>

        {/* More like this - TMDB recommendations as full cards, so badges,
            request pills, and progress all work right here. */}
        {(detail.recommendations?.results.length ?? 0) > 0 && (
          <div className="mt-10">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">More Like This</h2>
            <CardGrid items={detail.recommendations!.results.slice(0, 10)} mediaType="movie" />
          </div>
        )}
      </div>
    </AppShell>
  );
}
