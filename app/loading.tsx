export default function Loading() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-5">
        <h1 className="text-2xl font-bold tracking-tight">
          Weav<span className="text-amber-400">arr</span>
        </h1>
        <p className="text-zinc-500 text-sm mt-0.5">
          The documentary discovery engine
        </p>
      </header>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="h-20 bg-zinc-900 rounded-lg animate-pulse mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-[2/3] bg-zinc-800 rounded-lg animate-pulse" />
              <div className="h-3 bg-zinc-800 rounded animate-pulse w-3/4" />
              <div className="h-2 bg-zinc-800 rounded animate-pulse w-1/4" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
