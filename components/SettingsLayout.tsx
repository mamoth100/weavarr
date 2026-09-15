'use client';

import { useEffect, useState } from 'react';
import SettingsPanel, { CONNECTION_SECTIONS } from '@/components/SettingsPanel';
import MenuSettingsPanel from '@/components/MenuSettingsPanel';
import BackupPanel from '@/components/BackupPanel';
import LogsPanel from '@/components/LogsPanel';
import JobsPanel from '@/components/JobsPanel';
import SystemStatusPanel from '@/components/SystemStatusPanel';

const SECTIONS = [
  { id: 'connections', label: 'Connections' },
  { id: 'appconfig', label: 'App Config' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'menu', label: 'Menu' },
  { id: 'backup', label: 'Backup/Restore' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'logs', label: 'Logs' },
  { id: 'status', label: 'Status' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

export default function SettingsLayout() {
  const [section, setSection] = useState<SectionId>('connections');

  // /settings?tab=status opens straight on that tab - the sidebar's
  // "Update available" link uses it. Read once from the URL rather than via
  // useSearchParams so this page keeps rendering on the server as before.
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab && SECTIONS.some((s) => s.id === tab)) setSection(tab as SectionId);
  }, []);

  return (
    <div className="flex flex-col sm:flex-row gap-6">
      {/* Wraps on phones: seven tabs in one row overflowed the viewport with
          no scroll cue, so the last few were simply cut off. */}
      <nav className="flex flex-wrap sm:flex-col gap-1 sm:w-44 flex-shrink-0">
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
        {section === 'connections' ? (
          <SettingsPanel sections={CONNECTION_SECTIONS} />
        ) : section === 'appconfig' ? (
          <SettingsPanel sections={['App Config']} />
        ) : section === 'notifications' ? (
          <SettingsPanel sections={['Notifications']} />
        ) : section === 'menu' ? (
          <MenuSettingsPanel />
        ) : section === 'backup' ? (
          <BackupPanel />
        ) : section === 'jobs' ? (
          <JobsPanel />
        ) : section === 'logs' ? (
          <LogsPanel />
        ) : (
          <SystemStatusPanel />
        )}
      </div>
    </div>
  );
}
