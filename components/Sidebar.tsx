'use client';

import { Suspense, useEffect, useState } from 'react';
import SidebarNav from '@/components/SidebarNav';
import { GENRE_CATALOG, DEFAULT_GENRE_IDS } from '@/lib/genreCatalog';
import { MENU_LINK_CATALOG, DEFAULT_LINK_IDS } from '@/lib/menuLinks';
import type { MenuConfig } from '@/lib/settings';

// If /api/menu is unreachable (500 right after a bad settings save, network
// blip), fall back to the built-in default menu instead of hanging on the
// skeleton forever - which on mobile rendered NO nav at all (no hamburger,
// no drawer), leaving no way to reach Settings and fix the config.
function defaultConfig(): MenuConfig {
  return {
    genres: GENRE_CATALOG.filter((g) => DEFAULT_GENRE_IDS.includes(g.id)),
    links: MENU_LINK_CATALOG.filter((l) => DEFAULT_LINK_IDS.includes(l.id)),
  };
}

export default function Sidebar({ mobileTitle }: { mobileTitle?: string }) {
  const [config, setConfig] = useState<MenuConfig | null>(null);

  useEffect(() => {
    fetch('/api/menu', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        setConfig(data.error ? defaultConfig() : data);
      })
      .catch(() => setConfig(defaultConfig()));
  }, []);

  if (!config) {
    return <div className="hidden lg:block w-64 flex-shrink-0 bg-zinc-900 border-r border-zinc-800 animate-pulse" />;
  }

  return (
    <Suspense>
      <SidebarNav config={config} mobileTitle={mobileTitle} />
    </Suspense>
  );
}
