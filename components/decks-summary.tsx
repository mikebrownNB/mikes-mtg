import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

/**
 * Compact home-page summary linking through to /decks. Just a count for now;
 * the full list lives at /decks.
 */
export async function DecksSummary() {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("decks")
    .select("*", { count: "exact", head: true });

  if (error) {
    return (
      <Link
        href="/decks"
        className="block rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300"
      >
        Couldn&apos;t load decks: {error.message}
      </Link>
    );
  }

  return (
    <Link
      href="/decks"
      className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 transition hover:border-neutral-700 hover:bg-neutral-900"
    >
      <div>
        <p className="text-sm font-medium text-neutral-200">Decks</p>
        <p className="mt-0.5 text-xs text-neutral-400">
          {count ?? 0} {count === 1 ? "deck" : "decks"}
        </p>
      </div>
      <span className="text-xs text-neutral-500" aria-hidden>
        →
      </span>
    </Link>
  );
}
