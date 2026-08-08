import BackLink from '@/components/BackLink';
import StatusPanel from '@/components/StatusPanel';
import AppShell from '@/components/AppShell';

export default function StatusPage() {
  return (
    <AppShell title="Download status - Downloader, Sonarr, Radarr" headerActions={<BackLink />}>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <StatusPanel />
      </div>
    </AppShell>
  );
}
