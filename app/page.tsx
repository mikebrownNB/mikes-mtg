export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-12">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">mikes-mtg</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Personal MTG collection scanner & deck builder.
        </p>
      </header>

      <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">
          Phase 1 &middot; Foundation
        </h2>
        <p className="mt-2 text-sm text-neutral-400">
          Scaffold deployed. Next: wire up Supabase, run the schema migration,
          then add the Scryfall import job and the manual card lookup UI.
        </p>
      </section>
    </main>
  );
}
