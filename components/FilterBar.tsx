'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { SUBGENRES, SORT_OPTIONS } from '@/lib/subgenres';
import type { SortOption } from '@/types';

interface Props {
  activeSubgenres: string[];
  currentSort: SortOption;
}

export default function FilterBar({ activeSubgenres, currentSort }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function toggleSubgenre(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    const next = activeSubgenres.includes(id)
      ? activeSubgenres.filter((s) => s !== id)
      : [...activeSubgenres, id];

    if (next.length === 0) {
      params.delete('subgenres');
    } else {
      params.set('subgenres', next.join(','));
    }
    params.delete('page');
    router.push(`?${params.toString()}`);
  }

  function clearAll() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('subgenres');
    params.delete('page');
    router.push(`?${params.toString()}`);
  }

  function setSort(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort', value);
    params.delete('page');
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      {/* Subgenre chips */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={clearAll}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            activeSubgenres.length === 0
              ? 'bg-amber-500 text-black'
              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
          }`}
        >
          All
        </button>
        {SUBGENRES.map((sg) => {
          const active = activeSubgenres.includes(sg.id);
          return (
            <button
              key={sg.id}
              onClick={() => toggleSubgenre(sg.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                active
                  ? 'bg-amber-500 text-black'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {sg.emoji} {sg.label}
            </button>
          );
        })}
      </div>

      {/* Sort */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-zinc-400">Sort by:</span>
        <select
          value={currentSort}
          onChange={(e) => setSort(e.target.value)}
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
