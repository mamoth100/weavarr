import LibraryLayout from '@/components/LibraryLayout';
import AppShell from '@/components/AppShell';

export default function LibraryPage() {
  return (
    <AppShell title="Library" subtitle="Movies and shows in one place">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <LibraryLayout />
      </div>
    </AppShell>
  );
}
