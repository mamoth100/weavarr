import Link from 'next/link';

interface Props {
  page: number;
  totalPages: number;
  subgenres?: string;
  sort: string;
  decade?: string;
  query?: string;
  genre?: string;
  defaultGenre?: string;
  lang?: string;
  year?: string;
  show?: string;
  sucks?: string;
  fav?: string;
  upcomingGenre?: string;
}

/** First, last, current +/- neighbors - with ellipses where pages are skipped. */
function pageSequence(page: number, totalPages: number): (number | 'gap')[] {
  const wanted = new Set<number>([1, 2, page - 1, page, page + 1, totalPages - 1, totalPages]);
  const pages = Array.from(wanted)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);

  const out: (number | 'gap')[] = [];
  let prev = 0;
  for (const p of pages) {
    if (p - prev > 1) out.push('gap');
    out.push(p);
    prev = p;
  }
  return out;
}

export default function Pagination({ page, totalPages, subgenres, sort, decade, query, genre, defaultGenre, lang, year, show, sucks, fav, upcomingGenre }: Props) {
  const capped = Math.min(totalPages, 500);

  function buildHref(p: number) {
    const params = new URLSearchParams({ sort, page: String(p) });
    if (subgenres) params.set('subgenres', subgenres);
    if (decade) params.set('decade', decade);
    if (query) params.set('q', query);
    if (genre && genre !== defaultGenre) params.set('genre', genre);
    if (lang && lang !== 'en') params.set('lang', lang);
    if (year) params.set('year', year);
    if (show) params.set('show', show);
    if (sucks) params.set('sucks', sucks);
    if (fav) params.set('fav', fav);
    if (upcomingGenre) params.set('upcomingGenre', upcomingGenre);
    return `?${params.toString()}`;
  }

  if (capped <= 1) return null;

  return (
    <div className="flex justify-center items-center gap-1.5 sm:gap-2 mt-10 flex-wrap">
      {page > 1 && (
        <Link
          href={buildHref(page - 1)}
          className="px-3 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition text-sm"
        >
          Previous
        </Link>
      )}
      {pageSequence(page, capped).map((p, i) =>
        p === 'gap' ? (
          <span key={`gap-${i}`} className="px-1 text-zinc-500 text-sm select-none">
            …
          </span>
        ) : p === page ? (
          <span
            key={p}
            aria-current="page"
            className="px-3 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-black"
          >
            {p}
          </span>
        ) : (
          <Link
            key={p}
            href={buildHref(p)}
            className="px-3 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition text-sm text-zinc-300"
          >
            {p}
          </Link>
        )
      )}
      {page < capped && (
        <Link
          href={buildHref(page + 1)}
          className="px-3 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition text-sm"
        >
          Next
        </Link>
      )}
    </div>
  );
}
