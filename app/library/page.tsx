import BackLink from '@/components/BackLink';
import LibraryLayout from '@/components/LibraryLayout';
import AppShell from '@/components/AppShell';

export default function LibraryPage() {
  return (
    <AppShell title="Library - movies and shows, all in one place" headerActions={<BackLink />}>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <LibraryLayout />
      </div>
    </AppShell>
  );
}
