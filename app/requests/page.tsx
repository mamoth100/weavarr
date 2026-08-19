import BackLink from '@/components/BackLink';
import RequestsPanel from '@/components/RequestsPanel';
import AppShell from '@/components/AppShell';

export default function RequestsPage() {
  return (
    <AppShell title="Requests" headerActions={<BackLink />}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <RequestsPanel />
      </div>
    </AppShell>
  );
}
