import CalendarPanel from '@/components/CalendarPanel';
import AppShell from '@/components/AppShell';

export default function CalendarPage() {
  return (
    <AppShell title="Calendar" subtitle="What is airing and releasing across movies and shows">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <CalendarPanel />
      </div>
    </AppShell>
  );
}
