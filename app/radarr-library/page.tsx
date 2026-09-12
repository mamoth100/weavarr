import BackLink from '@/components/BackLink';
import RadarrLibraryPanel from '@/components/RadarrLibraryPanel';
import AppShell from '@/components/AppShell';

export default function RadarrLibraryPage() {
  return (
    <AppShell title="Radarr library" subtitle="Delete any movie, any time" headerActions={<BackLink />}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <RadarrLibraryPanel />
      </div>
    </AppShell>
  );
}
