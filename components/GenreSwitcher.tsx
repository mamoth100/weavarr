'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { MenuConfig } from '@/lib/settings';

interface NavItem {
  key: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

/** Measures actual rendered item widths (via a hidden clone row) and returns how many items fit before a "More" button is needed. */
function useOverflowCount(items: NavItem[], containerRef: React.RefObject<HTMLDivElement>, measureRef: React.RefObject<HTMLDivElement>) {
  const [visibleCount, setVisibleCount] = useState(items.length);

  useEffect(() => {
    function recalc() {
      const container = containerRef.current;
      const measure = measureRef.current;
      if (!container || !measure) return;
      const containerWidth = container.clientWidth;
      const children = Array.from(measure.children) as HTMLElement[];
      if (children.length === 0) return;
      const gap = 4;
      // Last child in the measuring row is the hidden "More" button clone
      const moreWidth = children[children.length - 1].offsetWidth + gap;
      const widths = children.slice(0, -1).map((c) => c.offsetWidth + gap);

      let total = 0;
      let count = 0;
      for (let i = 0; i < widths.length; i++) {
        total += widths[i];
        const remaining = widths.length - (i + 1);
        const budget = remaining > 0 ? containerWidth - moreWidth : containerWidth;
        if (total <= budget) {
          count = i + 1;
        } else {
          break;
        }
      }
      setVisibleCount(count);
    }

    recalc();
    const ro = new ResizeObserver(recalc);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', recalc);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recalc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  return visibleCount;
}

export default function GenreSwitcher({ config }: { config: MenuConfig }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get('genre') ?? config.genres[0]?.id ?? 'documentary';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  const items: NavItem[] = [
    ...config.genres.map((g) => ({
      key: `genre:${g.id}`,
      label: g.label,
      isActive: current === g.id,
      onClick: () => router.push(`/?genre=${g.id}`),
    })),
    ...config.links.map((l) =>
      l.kind === 'tab'
        ? {
            key: `tab:${l.id}`,
            label: l.label,
            isActive: current === l.id,
            onClick: () => router.push(`/?genre=${l.id}`),
          }
        : {
            key: `link:${l.id}`,
            label: l.label,
            isActive: false,
            onClick: () => router.push(l.href!),
          }
    ),
  ];

  const visibleCount = useOverflowCount(items, containerRef, measureRef);
  const visibleItems = items.slice(0, visibleCount);
  const overflowItems = items.slice(visibleCount);

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [menuOpen]);

  function tabClass(active: boolean) {
    return `px-3 sm:px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
      active ? 'bg-amber-400 text-zinc-950' : 'text-zinc-400 hover:text-white'
    }`;
  }

  return (
    <div className="flex items-center gap-1 p-1 bg-zinc-900 rounded-xl border border-zinc-800 max-w-full">
      <div ref={containerRef} className="flex flex-1 min-w-0 gap-1 overflow-hidden">
        {visibleItems.map((item) => (
          <button key={item.key} onClick={item.onClick} className={tabClass(item.isActive)}>
            {item.label}
          </button>
        ))}
      </div>

      {/* Hidden measuring row: every item unwrapped, plus a "More" button clone last — used only to read natural widths */}
      <div
        ref={measureRef}
        className="flex gap-1 fixed opacity-0 pointer-events-none"
        style={{ top: -9999, left: -9999 }}
        aria-hidden
      >
        {items.map((item) => (
          <button key={item.key} className={tabClass(item.isActive)} tabIndex={-1}>
            {item.label}
          </button>
        ))}
        <button className="px-3 py-2 rounded-lg text-sm font-medium" tabIndex={-1}>
          More
        </button>
      </div>

      {overflowItems.length > 0 && (
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="More pages"
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              menuOpen ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            More
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-1 z-20 min-w-[190px] bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1">
              {overflowItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => {
                    setMenuOpen(false);
                    item.onClick();
                  }}
                  className={`w-full text-left px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    item.isActive ? 'text-amber-400' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
