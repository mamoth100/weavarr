import ReadyToWatchPanel from '@/components/ReadyToWatchPanel';
import AppShell from '@/components/AppShell';

export default function ReadyToWatchPage() {
  return (
    <AppShell title="Watch" subtitle="Missing, downloaded and unwatched, movies and shows">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <ReadyToWatchPanel />
      </div>
    </AppShell>
  );
}
