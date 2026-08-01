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

  return (
    <div className="flex justify-center items-center gap-4 mt-10">
      {page > 1 && (
        <a
          href={buildHref(page - 1)}
          className="px-4 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition text-sm"
        >
          Previous
        </a>
      )}
      <span className="text-sm text-zinc-400">
        Page {page} of {capped}
      </span>
      {page < capped && (
        <a
          href={buildHref(page + 1)}
          className="px-4 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition text-sm"
        >
          Next
        </a>
      )}
    </div>
  );
}
