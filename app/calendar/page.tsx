import BackLink from '@/components/BackLink';
import CalendarPanel from '@/components/CalendarPanel';
import AppShell from '@/components/AppShell';

export default function CalendarPage() {
  return (
    <AppShell title="Calendar - what's airing and releasing, across movies and shows" headerActions={<BackLink />}>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <CalendarPanel />
      </div>
    </AppShell>
  );
}
