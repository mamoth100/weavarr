'use client';

import { useState } from 'react';

/** Long text shown clamped with a More toggle. Bios run to a dozen paragraphs; nobody wants that above the filmography. */
export default function ExpandableText({ text, lines = 4 }: { text: string; lines?: 3 | 4 | 6 }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 400;
  const clamp = lines === 3 ? 'line-clamp-3' : lines === 6 ? 'line-clamp-6' : 'line-clamp-4';
  return (
    <div>
      <p className={`text-sm text-zinc-300 leading-relaxed whitespace-pre-line ${open || !long ? '' : clamp}`}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-xs text-amber-400 hover:text-amber-300 font-medium">
          {open ? 'Less' : 'More'}
        </button>
      )}
    </div>
  );
}
