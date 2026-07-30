'use client';

import { useEffect, useState } from 'react';
import GenreSwitcher from '@/components/GenreSwitcher';
import type { MenuConfig } from '@/lib/settings';

export default function GlobalGenreNav() {
  const [config, setConfig] = useState<MenuConfig | null>(null);

  useEffect(() => {
    fetch('/api/menu', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) setConfig(data);
      })
      .catch(() => {});
  }, []);

  if (!config) {
    return <div className="h-[46px] bg-zinc-900 rounded-xl border border-zinc-800 animate-pulse" />;
  }

  return <GenreSwitcher config={config} />;
}
