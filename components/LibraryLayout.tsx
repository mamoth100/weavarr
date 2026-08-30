'use client';

import { useEffect, useRef, useState } from 'react';
import RadarrLibraryPanel from '@/components/RadarrLibraryPanel';
import SonarrLibraryPanel from '@/components/SonarrLibraryPanel';

const LABELS: Record<'movies' | 'tv', string> = { movies: 'Movies', tv: 'TV Shows' };

export default function LibraryLayout() {
  // Order comes from Settings > Menu > Library tabs; first is the default.
  const [order, setOrder] = useState<('movies' | 'tv')[]>(['movies', 'tv']);
  const [section, setSection] = useState<'movies' | 'tv'>('movies');
  // A click before the config arrives must win over the config's default.
  const clicked = useRef(false);

  useEffect(() => {
    fetch('/api/menu', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        const tabs = Array.isArray(data.libraryTabs) ? (data.libraryTabs as ('movies' | 'tv')[]) : null;
        if (tabs && tabs.length === 2) {
          setOrder(tabs);
          if (!clicked.current) setSection(tabs[0]);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col sm:flex-row gap-6">
      <nav className="flex sm:flex-col gap-1 sm:w-44 flex-shrink-0">
        {order.map((id) => (
          <button
            key={id}
            onClick={() => {
              clicked.current = true;
              setSection(id);
            }}
            className={`text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              section === id ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            {LABELS[id]}
          </button>
        ))}
      </nav>

      <div className="flex-1 min-w-0">
        {section === 'movies' && <RadarrLibraryPanel />}
        {section === 'tv' && <SonarrLibraryPanel />}
      </div>
    </div>
  );
}
