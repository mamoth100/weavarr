'use client';

import { useRef, useState } from 'react';

export interface DraggableItem {
  id: string;
  label: string;
  checked: boolean;
}

function GripIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" className="flex-shrink-0">
      <circle cx="2.5" cy="2.5" r="1.5" />
      <circle cx="7.5" cy="2.5" r="1.5" />
      <circle cx="2.5" cy="8" r="1.5" />
      <circle cx="7.5" cy="8" r="1.5" />
      <circle cx="2.5" cy="13.5" r="1.5" />
      <circle cx="7.5" cy="13.5" r="1.5" />
    </svg>
  );
}

export default function DraggableCheckList({
  items,
  onReorder,
  onToggle,
}: {
  items: DraggableItem[];
  onReorder: (orderedIds: string[]) => void;
  onToggle: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Always-current ref so the pointermove listener (created once per drag gesture)
  // sees each intermediate reorder instead of a stale `items` snapshot from pointerdown.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  function handlePointerDown(id: string, e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('input')) return;
    e.preventDefault();
    setDraggingId(id);

    function handlePointerMove(ev: PointerEvent) {
      const container = containerRef.current;
      if (!container) return;
      const currentItems = itemsRef.current;
      const rows = Array.from(container.children) as HTMLElement[];
      const currentIndex = currentItems.findIndex((it) => it.id === id);
      for (let i = 0; i < rows.length; i++) {
        if (i === currentIndex) continue;
        const rect = rows[i].getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        const crossedDown = i > currentIndex && ev.clientY > mid;
        const crossedUp = i < currentIndex && ev.clientY < mid;
        if (crossedDown || crossedUp) {
          const nextIds = currentItems.map((it) => it.id);
          const [moved] = nextIds.splice(currentIndex, 1);
          nextIds.splice(i, 0, moved);
          onReorder(nextIds);
          break;
        }
      }
    }
    function handlePointerUp() {
      setDraggingId(null);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    }
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  return (
    <div ref={containerRef} className="bg-zinc-900 rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800 select-none">
      {items.map((item) => (
        <div
          key={item.id}
          className={`p-3 flex items-center gap-3 transition-opacity ${draggingId === item.id ? 'opacity-40' : ''}`}
        >
          <span
            onPointerDown={(e) => handlePointerDown(item.id, e)}
            className="cursor-grab active:cursor-grabbing touch-none text-zinc-500 hover:text-zinc-300 px-1"
            aria-label="Drag to reorder"
          >
            <GripIcon />
          </span>
          <label className="flex items-center gap-3 flex-1 cursor-pointer">
            <input
              type="checkbox"
              checked={item.checked}
              onChange={() => onToggle(item.id)}
              className="w-4 h-4 rounded accent-amber-500"
            />
            <span className="text-sm font-medium">{item.label}</span>
          </label>
        </div>
      ))}
    </div>
  );
}
