'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';

interface Props {
  trailerKey: string;
  title: string;
}

/** In-app trailer playback: opens the shared Modal with an embedded YouTube player instead of bouncing to a youtube.com tab. */
export default function TrailerButton({ trailerKey, title }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-red-700 hover:bg-red-600 transition rounded-lg text-sm font-medium"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
        Watch Trailer
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`${title} - Trailer`} wide>
        {/* Mounted only while open so closing the modal stops playback. */}
        {open && (
          <div className="aspect-video w-full rounded-lg overflow-hidden bg-black">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1`}
              title={`${title} trailer`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="w-full h-full border-0"
            />
          </div>
        )}
      </Modal>
    </>
  );
}
