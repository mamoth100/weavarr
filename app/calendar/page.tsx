import Link from 'next/link';
import BackLink from '@/components/BackLink';
import CalendarPanel from '@/components/CalendarPanel';
import AppShell from '@/components/AppShell';

export default function CalendarPage() {
  return (
    <AppShell>
      <header className="border-b border-zinc-800 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/" className="text-2xl font-bold tracking-tight hover:text-amber-400 transition">
              Weav<span className="text-amber-400">arr</span>
            </Link>
            <p className="text-zinc-500 text-sm mt-0.5">Calendar - what's airing and releasing, across movies and shows</p>
          </div>
          <BackLink />
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <CalendarPanel />
      </div>
    </AppShell>
  );
}
