import BackLink from '@/components/BackLink';
import SettingsLayout from '@/components/SettingsLayout';
import AppShell from '@/components/AppShell';

export default function SettingsPage() {
  return (
    <AppShell title="Settings" headerActions={<BackLink />}>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <SettingsLayout />
      </div>
    </AppShell>
  );
}
