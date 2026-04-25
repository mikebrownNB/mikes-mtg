import { createClient } from "@/lib/supabase/server";

// Auth state lives in cookies; never cache this page.
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

      <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">
          Phase 1 &middot; Foundation
        </h2>
        <p className="mt-2 text-sm text-neutral-400">
          Auth is wired up. Card lookup + add-to-collection ships in the next
          push.
        </p>
      </section>
    </main>
  );
}
