import BackLink from '@/components/BackLink';
import SettingsPanel from '@/components/SettingsPanel';

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Docu<span className="text-amber-400">View</span>
            </h1>
            <p className="text-zinc-500 text-sm mt-0.5">Settings — configuration stored in .env.local</p>
          </div>
          <BackLink />
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <SettingsPanel />
      </div>
    </main>
  );
}
