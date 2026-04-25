import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Create a new deck. Format/description are optional; both stored as `null`
 * if blank. RLS scopes ownership by user_id automatically.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    format?: unknown;
    description?: unknown;
  } | null;

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (name.length > 100) {
    return NextResponse.json({ error: "name too long" }, { status: 400 });
  }

  const format =
    typeof body?.format === "string" && body.format.trim()
      ? body.format.trim()
      : null;
  const description =
    typeof body?.description === "string" && body.description.trim()
      ? body.description.trim().slice(0, 1000)
      : null;

  const { data, error } = await supabase
    .from("decks")
    .insert({ user_id: user.id, name, format, description })
    .select("id, name, format, description, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, deck: data });
}
