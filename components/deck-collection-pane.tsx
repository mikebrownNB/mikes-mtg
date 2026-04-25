"use client";

import { useDraggable } from "@dnd-kit/core";
import { useMemo, useState } from "react";

type Card = {
  id: string;
  name: string;
  set_code: string | null;
  type_line: string | null;
  cmc: number | null;
  image_uris: Record<string, string> | null;
};

export type CollectionPaneItem = {
  id: string;
  quantity: number;
  foil: boolean;
  cards: Card | Card[] | null;
};

function getCard(item: CollectionPaneItem): Card | null {
  return Array.isArray(item.cards) ? item.cards[0] ?? null : item.cards;
}

/**
 * Desktop-only sidebar (`hidden lg:block` from the parent grid). Lists owned
 * cards as small drag handles so the user can drop them on a zone tab to add
 * to the deck. Quantities are summed across foil/non-foil/condition variants
 * since the deck builder doesn't care about printing finish.
 */
export function DeckCollectionPane({
  items,
}: {
  items: CollectionPaneItem[];
}) {
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const map = new Map<string, { card: Card; quantity: number }>();
    for (const it of items) {
      const c = getCard(it);
      if (!c) continue;
      const existing = map.get(c.id);
      if (existing) existing.quantity += it.quantity;
      else map.set(c.id, { card: c, quantity: it.quantity });
    }
    return Array.from(map.values()).sort((a, b) =>
      a.card.name.localeCompare(b.card.name),
    );
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return grouped;
    return grouped.filter((g) => g.card.name.toLowerCase().includes(q));
  }, [grouped, search]);

  return (
    <aside className="hidden lg:flex lg:flex-col lg:gap-3">
      <div className="sticky top-4 flex max-h-[calc(100vh-2rem)] flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">
            Your collection
          </h2>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            Drag a card onto a zone tab to add it.
          </p>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter…"
          className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs focus:border-emerald-600 focus:outline-none"
        />
        <p className="text-[11px] text-neutral-500">
          {filtered.length} of {grouped.length}
        </p>
        <div className="flex-1 overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-xs text-neutral-500">
              {grouped.length === 0 ? "No cards yet" : "No matches"}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {filtered.map(({ card, quantity }) => (
                <CollectionDraggableCard
                  key={card.id}
                  card={card}
                  quantity={quantity}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}

function CollectionDraggableCard({
  card,
  quantity,
}: {
  card: Card;
  quantity: number;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `collection:${card.id}`,
    data: {
      kind: "collection",
      cardId: card.id,
      name: card.name,
      image: card.image_uris?.small ?? null,
    },
  });

  const img = card.image_uris?.small ?? null;
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex cursor-grab select-none items-center gap-2 rounded border border-neutral-800 bg-neutral-900/40 p-1.5 transition active:cursor-grabbing ${
        isDragging
          ? "opacity-30"
          : "hover:border-neutral-700 hover:bg-neutral-900"
      }`}
    >
      {img ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={img}
          alt={card.name}
          loading="lazy"
          draggable={false}
          className="h-12 w-9 flex-shrink-0 rounded object-cover"
        />
      ) : (
        <div className="h-12 w-9 flex-shrink-0 rounded bg-neutral-800" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{card.name}</p>
        <p className="truncate text-[10px] text-neutral-500">
          {card.set_code?.toUpperCase()}
        </p>
      </div>
      <span className="flex-shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px]">
        ×{quantity}
      </span>
    </li>
  );
}
