import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

/**
 * Compact home-page summary: total unique / total cards / approximate USD
 * value, with a link through to the full /collection management view. Pulls
 * just the columns it needs to keep the home payload small.
 */
export async function CollectionSummary() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("collection_items")
    .select(
      `
      quantity,
      foil,
      cards ( prices )
    `,
    )
    .returns<
      Array<{
        quantity: number;
        foil: boolean;
        cards: { prices: Record<string, string | null> | null } | null;
      }>
    >();

  if (error) {
    return (
      <Link
        href="/collection"
        className="block rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
      >
        Couldn&apos;t load collection: {error.message}
      </Link>
    );
  }

  const items = data ?? [];
  const unique = items.length;
  const total = items.reduce((s, r) => s + r.quantity, 0);
  const value = items.reduce((s, r) => {
    const usd = r.cards?.prices?.usd;
    const usdFoil = r.cards?.prices?.usd_foil;
    const raw = r.foil && usdFoil ? usdFoil : usd;
    if (!raw) return s;
    const parsed = parseFloat(raw);
    return s + (Number.isFinite(parsed) ? parsed * r.quantity : 0);
  }, 0);

  return (
    <Link
      href="/collection"
      className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 transition hover:border-neutral-700 hover:bg-neutral-900"
    >
      <div>
        <p className="text-sm font-medium text-neutral-200">Collection</p>
        <p className="mt-0.5 text-xs text-neutral-400">
          {unique > 0 ? (
            <>
              {unique} unique &middot; {total} total &middot; ~$
              {value.toFixed(2)}
            </>
          ) : (
            "No cards yet"
          )}
        </p>
      </div>
      <span className="text-xs text-neutral-500" aria-hidden>
        →
      </span>
    </Link>
  );
}
