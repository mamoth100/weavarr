'use client';

import { Suspense, useEffect, useState } from 'react';
import SidebarNav from '@/components/SidebarNav';
import type { MenuConfig } from '@/lib/settings';

export default function Sidebar() {
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
    return <div className="hidden lg:block w-64 flex-shrink-0 bg-zinc-900 border-r border-zinc-800 animate-pulse" />;
  }

  return (
    <Suspense>
      <SidebarNav config={config} />
    </Suspense>
  );
}
