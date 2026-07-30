'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
      <div className="text-center max-w-md space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">
          Weav<span className="text-amber-400">arr</span>
        </h1>
        <p className="text-zinc-400">
          Something went wrong loading this page — usually a brief hiccup reaching TMDB. It almost always works on retry.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-black hover:bg-amber-400"
        >
          Try Again
        </button>
        {error.digest && (
          <p className="text-xs text-zinc-600">Digest: {error.digest}</p>
        )}
      </div>
    </main>
  );
}
