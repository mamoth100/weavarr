'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { SUBGENRES, SORT_OPTIONS } from '@/lib/subgenres';
import type { SortOption } from '@/types';

interface Props {
  currentSubgenre?: string;
  currentSort: SortOption;
}

export default function FilterBar({ currentSubgenre, currentSort }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, val]) => {
      if (val === undefined || val === '') {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    });
    params.delete('page'); // reset to page 1 on filter change
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      {/* Subgenre chips */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => navigate({ subgenre: undefined })}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            !currentSubgenre
              ? 'bg-amber-500 text-black'
              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
          }`}
        >
          All
        </button>
        {SUBGENRES.map((sg) => (
          <button
            key={sg.id}
            onClick={() => navigate({ subgenre: sg.id })}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              currentSubgenre === sg.id
                ? 'bg-amber-500 text-black'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {sg.emoji} {sg.label}
          </button>
        ))}
      </div>

      {/* Sort */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-zinc-400">Sort by:</span>
        <select
          value={currentSort}
          onChange={(e) => navigate({ sort: e.target.value })}
          className="bg-zinc-800 text-white text-sm rounded px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-amber-500"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
