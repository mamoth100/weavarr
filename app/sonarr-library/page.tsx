import Link from 'next/link';
import BackLink from '@/components/BackLink';
import SonarrLibraryPanel from '@/components/SonarrLibraryPanel';

export default function SonarrLibraryPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/" className="text-2xl font-bold tracking-tight hover:text-amber-400 transition">
              Docu<span className="text-amber-400">View</span>
            </Link>
            <p className="text-zinc-500 text-sm mt-0.5">Sonarr library — delete any show, any time</p>
          </div>
          <BackLink />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <SonarrLibraryPanel />
      </div>
    </main>
  );
}
