import { createClient } from "@/lib/supabase/server";
import { CardSearch } from "@/components/card-search";
import { CollectionList } from "@/components/collection-list";

// Auth + collection live in cookies + DB; never cache this page.
export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-8 px-6 py-12">
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

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">
          Add a card
        </h2>
        <CardSearch />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">
          Collection
        </h2>
        <CollectionList />
      </section>
    </main>
  );
}
