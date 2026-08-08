import BackLink from '@/components/BackLink';
import ReadyToWatchPanel from '@/components/ReadyToWatchPanel';
import AppShell from '@/components/AppShell';

export default function ReadyToWatchPage() {
  return (
    <AppShell title="Watch - what's missing, downloaded and unwatched, movies and shows" headerActions={<BackLink />}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <ReadyToWatchPanel />
      </div>
    </AppShell>
  );
}
