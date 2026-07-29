import Link from 'next/link';
import BackLink from '@/components/BackLink';
import StatusPanel from '@/components/StatusPanel';

export default function StatusPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/" className="text-2xl font-bold tracking-tight hover:text-amber-400 transition">
              Weav<span className="text-amber-400">arr</span>
            </Link>
            <p className="text-zinc-500 text-sm mt-0.5">Download status — SABnzbd, Sonarr, Radarr</p>
          </div>
          <BackLink />
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <StatusPanel />
      </div>
    </main>
  );
}
