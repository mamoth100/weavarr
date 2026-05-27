import Image from 'next/image';
import Link from 'next/link';
import { TMDB_IMAGE_BASE } from '@/lib/tmdb';
import ScoreBadge from './ScoreBadge';
import type { TmdbMovie } from '@/types';

interface Props {
  doc: TmdbMovie;
}

export default function DocCard({ doc }: Props) {
  const year = doc.release_date
    ? new Date(doc.release_date).getFullYear()
    : null;
  const posterUrl = doc.poster_path
    ? `${TMDB_IMAGE_BASE}/w342${doc.poster_path}`
    : null;

  return (
    <Link href={`/documentary/${doc.id}`} className="group">
      <div className="relative aspect-[2/3] bg-zinc-800 rounded-lg overflow-hidden">
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={doc.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 20vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs text-center p-2">
            No Poster
          </div>
        )}
        <div className="absolute top-2 right-2">
          <ScoreBadge score={doc.vote_average} size="sm" />
        </div>
      </div>
      <div className="mt-2 px-1">
        <p className="text-sm font-medium leading-tight truncate group-hover:text-amber-400 transition-colors">
          {doc.title}
        </p>
        {year && <p className="text-xs text-zinc-500 mt-0.5">{year}</p>}
      </div>
    </Link>
  );
}
