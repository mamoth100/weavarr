'use client';

import { useRef, useState } from 'react';

export interface DraggableItem {
  id: string;
  label: string;
  checked: boolean;
  /** Greys out the checkbox and blocks toggling, used when unchecking it isn't a valid state. */
  disabled?: boolean;
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
  onRemove,
  orderOnly = false,
}: {
  items: DraggableItem[];
  onReorder: (orderedIds: string[]) => void;
  onToggle: (id: string) => void;
  /** Removable mode: rows get an × instead of a checkbox - for lists whose items are built dynamically (Discover sections) rather than picked from a fixed catalog. */
  onRemove?: (id: string) => void;
  /** Order-only mode: grip + label, no checkbox or × - for fixed sets where only the order matters (Library tabs). */
  orderOnly?: boolean;
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

  /** Keyboard path for reordering: the grip is a button, arrow keys move the row. Dragging is pointer-only by nature, so without this the order could not be changed from a keyboard at all. */
  function moveBy(id: string, delta: -1 | 1) {
    const ids = itemsRef.current.map((it) => it.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    onReorder(ids);
  }

  function handleGripKey(id: string, e: React.KeyboardEvent) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveBy(id, -1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveBy(id, 1);
    }
  }

  return (
    <div ref={containerRef} className="bg-zinc-900 rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800 select-none">
      {items.map((item, index) => (
        <div
          key={item.id}
          className={`p-3 flex items-center gap-3 transition-opacity ${draggingId === item.id ? 'opacity-40' : ''}`}
        >
          <button
            type="button"
            onPointerDown={(e) => handlePointerDown(item.id, e)}
            onKeyDown={(e) => handleGripKey(item.id, e)}
            className="cursor-grab active:cursor-grabbing touch-none text-zinc-500 hover:text-zinc-300 px-1 rounded focus-visible:ring-2 focus-visible:ring-amber-400"
            aria-label={`Reorder ${item.label}: drag, or use the arrow keys`}
          >
            <GripIcon />
          </button>
          {orderOnly ? (
            <span className="text-sm font-medium flex-1">{item.label}</span>
          ) : onRemove ? (
            <>
              <span className="text-sm font-medium flex-1">{item.label}</span>
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                aria-label={`Remove ${item.label}`}
                className="w-6 h-6 touch:w-8 touch:h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 flex-shrink-0"
              >
                ×
              </button>
            </>
          ) : (
            <label className={`flex items-center gap-3 flex-1 ${item.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={item.checked}
                disabled={item.disabled}
                onChange={() => onToggle(item.id)}
                className="w-4 h-4 rounded accent-amber-500 disabled:cursor-not-allowed"
              />
              <span className="text-sm font-medium">{item.label}</span>
            </label>
          )}
          {/* Visible up/down controls for touch and mouse users who would rather tap than drag; the same moves the arrow keys make. */}
          <span className="flex items-center gap-0.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => moveBy(item.id, -1)}
              disabled={index === 0}
              aria-label={`Move ${item.label} up`}
              className="w-6 h-6 touch:w-8 touch:h-8 rounded flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-700 disabled:opacity-25 disabled:hover:bg-transparent"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() => moveBy(item.id, 1)}
              disabled={index === items.length - 1}
              aria-label={`Move ${item.label} down`}
              className="w-6 h-6 touch:w-8 touch:h-8 rounded flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-700 disabled:opacity-25 disabled:hover:bg-transparent"
            >
              ▼
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
