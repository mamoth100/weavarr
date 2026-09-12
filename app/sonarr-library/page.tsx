import BackLink from '@/components/BackLink';
import SonarrLibraryPanel from '@/components/SonarrLibraryPanel';
import AppShell from '@/components/AppShell';

export default function SonarrLibraryPage() {
  return (
    <AppShell title="Sonarr library" subtitle="Delete any show, any time" headerActions={<BackLink />}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <SonarrLibraryPanel />
      </div>
    </AppShell>
  );
}
