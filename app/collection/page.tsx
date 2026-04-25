import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  CollectionManager,
  type CollectionItem,
} from "@/components/collection-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Collection · mikes-mtg" };

export default async function CollectionPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collection_items")
    .select(
      `
      id,
      quantity,
      foil,
      condition,
      notes,
      acquired_at,
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
        prices,
        layout
      )
    `,
    )
    .order("acquired_at", { ascending: false })
    .returns<CollectionItem[]>();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Collection</h1>
        <Link
          href="/"
          className="text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
        >
          Back
        </Link>
      </header>

      {error ? (
        <p className="text-sm text-red-400">
          Error loading collection: {error.message}
        </p>
      ) : (
        <CollectionManager items={data ?? []} />
      )}
    </main>
  );
}
