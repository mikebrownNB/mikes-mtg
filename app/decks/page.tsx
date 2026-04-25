import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DecksIndex, type DeckSummary } from "@/components/decks-index";

export const dynamic = "force-dynamic";
export const metadata = { title: "Decks · mikes-mtg" };

export default async function DecksPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("decks")
    .select("id, name, format, description, updated_at")
    .order("updated_at", { ascending: false })
    .returns<DeckSummary[]>();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Decks</h1>
        <Link
          href="/"
          className="text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
        >
          Back
        </Link>
      </header>

      {error ? (
        <p className="text-sm text-red-400">
          Error loading decks: {error.message}
        </p>
      ) : (
        <DecksIndex decks={data ?? []} />
      )}
    </main>
  );
}
