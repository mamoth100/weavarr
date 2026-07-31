import Link from 'next/link';
import { Suspense } from 'react';
import BackLink from '@/components/BackLink';
import LibraryLayout from '@/components/LibraryLayout';
import GlobalGenreNav from '@/components/GlobalGenreNav';

export default function LibraryPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/" className="text-2xl font-bold tracking-tight hover:text-amber-400 transition">
              Weav<span className="text-amber-400">arr</span>
            </Link>
            <p className="text-zinc-500 text-sm mt-0.5">Library - movies, shows, and activity, all in one place</p>
          </div>
          <BackLink />
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 pt-5 pb-2">
        <Suspense>
          <GlobalGenreNav />
        </Suspense>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <LibraryLayout />
      </div>
    </main>
  );
}
