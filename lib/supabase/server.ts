import { createServerClient } from "@supabase/ssr";
import { createClient as createRawClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client wired up to Next.js cookies. Use inside Server
 * Components, Route Handlers, and Server Actions. Auth cookies are read +
 * written through this client; keep it scoped to a single request.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component (cookies are read-only there).
            // Safe to ignore — middleware will refresh the session on the next request.
          }
        },
      },
    },
  );
}

/**
 * Service-role client for server-only privileged operations (e.g. the
 * Scryfall import job, or any code path that must bypass RLS). Never import
 * this from a Client Component.
 */
export function createServiceClient() {
  return createRawClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
