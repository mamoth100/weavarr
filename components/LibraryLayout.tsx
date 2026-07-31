'use client';

import { useState } from 'react';
import RadarrLibraryPanel from '@/components/RadarrLibraryPanel';
import SonarrLibraryPanel from '@/components/SonarrLibraryPanel';
import StatusPanel from '@/components/StatusPanel';

const SECTIONS = [
  { id: 'movies', label: 'Movies' },
  { id: 'tv', label: 'TV Shows' },
  { id: 'activity', label: 'Activity' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

export default function LibraryLayout() {
  const [section, setSection] = useState<SectionId>('movies');

  return (
    <div className="flex flex-col sm:flex-row gap-6">
      <nav className="flex sm:flex-col gap-1 sm:w-44 flex-shrink-0">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              section === s.id ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 min-w-0">
        {section === 'movies' && <RadarrLibraryPanel />}
        {section === 'tv' && <SonarrLibraryPanel />}
        {section === 'activity' && <StatusPanel />}
      </div>
    </div>
  );
}
