import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  DeckBuilder,
  type DeckBuilderDeck,
  type DeckCardRow,
} from "@/components/deck-builder";
import { type CollectionPaneItem } from "@/components/deck-collection-pane";

export const dynamic = "force-dynamic";

export default async function DeckPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: deck, error: deckErr },
    { data: cards, error: cardsErr },
    { data: collection, error: colErr },
  ] = await Promise.all([
    supabase
      .from("decks")
      .select("id, name, format, description, created_at, updated_at")
      .eq("id", id)
      .maybeSingle()
      .returns<DeckBuilderDeck>(),
    supabase
      .from("deck_cards")
      .select(
        `
        id,
        quantity,
        zone,
        card_id,
        cards (
          id,
          name,
          set_code,
          type_line,
          mana_cost,
          cmc,
          colors,
          color_identity,
          rarity,
          image_uris,
          layout,
          raw
        )
      `,
      )
      .eq("deck_id", id)
      .returns<DeckCardRow[]>(),
    // Collection items are used by the desktop drag-and-drop sidebar. The
    // query is intentionally slim — we don't need prices/condition here.
    supabase
      .from("collection_items")
      .select(
        `
        id,
        quantity,
        foil,
        cards (
          id,
          name,
          set_code,
          type_line,
          cmc,
          image_uris
        )
      `,
      )
      .order("acquired_at", { ascending: false })
      .returns<CollectionPaneItem[]>(),
  ]);

  if (deckErr || !deck) {
    if (deckErr) {
      return (
        <main className="mx-auto max-w-2xl px-4 py-8">
          <p className="text-sm text-red-400">Error: {deckErr.message}</p>
        </main>
      );
    }
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-4 py-8 lg:max-w-6xl">
      <Link
        href="/decks"
        className="text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
      >
        ← All decks
      </Link>

      {cardsErr ? (
        <p className="text-sm text-red-400">
          Error loading cards: {cardsErr.message}
        </p>
      ) : (
        <DeckBuilder
          deck={deck}
          cards={cards ?? []}
          collection={colErr ? [] : collection ?? []}
        />
      )}

      {colErr && (
        <p className="text-xs text-red-400">
          Couldn&apos;t load collection sidebar: {colErr.message}
        </p>
      )}
    </main>
  );
}
