'use client';

import { useRouter } from 'next/navigation';

export default function BackLink() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-amber-400 transition-colors mb-6"
    >
      {/* router.back() goes wherever the user actually came from, so the old
          "Back to Browse" label lied whenever that wasn't the browse page. */}
      ← Back
    </button>
  );
}
