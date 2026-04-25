import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CardSearch } from "@/components/card-search";
import { CollectionSummary } from "@/components/collection-summary";
import { DecksSummary } from "@/components/decks-summary";

// Auth + collection live in cookies + DB; never cache this page.
export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">mikes-mtg</h1>
          <p className="mt-0.5 text-xs text-neutral-400">{user?.email}</p>
        </div>
        <form action="/auth/sign-out" method="post">
          <button
            type="submit"
            className="text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="flex flex-col gap-3">
        <Link
          href="/scan"
          className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-emerald-900/50 transition hover:bg-emerald-500"
        >
          <span aria-hidden>📷</span> Scan a card
        </Link>
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span className="h-px flex-1 bg-neutral-800" />
          or search
          <span className="h-px flex-1 bg-neutral-800" />
        </div>
        <CardSearch />
      </section>

      <div className="flex flex-col gap-2">
        <CollectionSummary />
        <DecksSummary />
      </div>
    </main>
  );
}
