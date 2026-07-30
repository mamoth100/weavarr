'use client';

import { useState } from 'react';
import SettingsPanel from '@/components/SettingsPanel';
import MenuSettingsPanel from '@/components/MenuSettingsPanel';

const SECTIONS = [
  { id: 'connections', label: 'Connections' },
  { id: 'menu', label: 'Menu' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

export default function SettingsLayout() {
  const [section, setSection] = useState<SectionId>('connections');

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
        {section === 'connections' ? <SettingsPanel /> : <MenuSettingsPanel />}
      </div>
    </div>
  );
}
