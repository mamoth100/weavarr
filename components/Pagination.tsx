interface Props {
  page: number;
  totalPages: number;
  subgenre?: string;
  sort: string;
}

export default function Pagination({ page, totalPages, subgenre, sort }: Props) {
  const capped = Math.min(totalPages, 500); // TMDb caps at page 500

  function buildHref(p: number) {
    const params = new URLSearchParams({ sort, page: String(p) });
    if (subgenre) params.set('subgenre', subgenre);
    return `?${params.toString()}`;
  }

  return (
    <div className="flex justify-center items-center gap-4 mt-10">
      {page > 1 && (
        <a
          href={buildHref(page - 1)}
          className="px-4 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition text-sm"
        >
          ← Previous
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
          Next →
        </a>
      )}
    </div>
  );
}
