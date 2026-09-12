import StatusPanel from '@/components/StatusPanel';
import AppShell from '@/components/AppShell';

export default function StatusPage() {
  return (
    <AppShell title="Status" subtitle="Downloader, Sonarr and Radarr queues, recent imports and recently watched">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <StatusPanel />
      </div>
    </AppShell>
  );
}
