import { createClient } from "@/lib/supabase/server";

type CardRow = {
  id: string;
  name: string;
  set_code: string | null;
  type_line: string | null;
  mana_cost: string | null;
  image_uris: Record<string, string> | null;
  prices: Record<string, string | null> | null;
};

type CollectionRow = {
  id: string;
  quantity: number;
  foil: boolean;
  condition: string | null;
  cards: CardRow | CardRow[] | null;
};

export async function CollectionList() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collection_items")
    .select(
      `
      id,
      quantity,
      foil,
      condition,
      cards (
        id,
        name,
        set_code,
        type_line,
        mana_cost,
        image_uris,
        prices
      )
    `,
    )
    .order("acquired_at", { ascending: false })
    .returns<CollectionRow[]>();

  if (error) {
    return (
      <p className="text-sm text-red-400">
        Error loading collection: {error.message}
      </p>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        No cards yet — search above to add some.
      </p>
    );
  }

  const totalCards = data.reduce((s, r) => s + r.quantity, 0);
  const totalValue = data.reduce((s, r) => {
    const card = Array.isArray(r.cards) ? r.cards[0] : r.cards;
    const usd = card?.prices?.usd ? parseFloat(card.prices.usd) : 0;
    return s + (Number.isFinite(usd) ? usd * r.quantity : 0);
  }, 0);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-neutral-500">
        {data.length} unique &middot; {totalCards} total
        {totalValue > 0 && ` · ~$${totalValue.toFixed(2)}`}
      </p>
      <ul className="flex flex-col gap-2">
        {data.map((row) => {
          const card = Array.isArray(row.cards) ? row.cards[0] : row.cards;
          if (!card) return null;
          const img = card.image_uris?.small ?? null;
          return (
            <li
              key={row.id}
              className="flex items-center gap-3 rounded-md border border-neutral-800 bg-neutral-900/50 p-2"
            >
              {img ? (
                // Plain <img> avoids configuring next/image remote patterns
                // for Scryfall's CDN; small thumbnails, no perf hit worth it.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img}
                  alt={card.name}
                  loading="lazy"
                  className="h-16 w-12 flex-shrink-0 rounded object-cover"
                />
              ) : (
                <div className="h-16 w-12 flex-shrink-0 rounded bg-neutral-800" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{card.name}</p>
                <p className="truncate text-xs text-neutral-500">
                  {card.set_code?.toUpperCase()} · {card.type_line ?? ""}
                </p>
              </div>
              <div className="flex-shrink-0 rounded bg-neutral-800 px-2 py-0.5 text-xs">
                ×{row.quantity}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
