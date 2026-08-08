import Sidebar from '@/components/Sidebar';

/** Left-rail layout used by every page - replaces the old top GenreSwitcher bar. Each page keeps its own <header>/content, just nested in here instead of a bare <main>. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-white lg:flex">
      <Sidebar />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
