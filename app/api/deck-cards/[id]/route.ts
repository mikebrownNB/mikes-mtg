import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ZONES = new Set(["mainboard", "sideboard", "commander", "maybeboard"]);

/**
 * Update a single deck_card row (quantity / zone) or remove it.
 * RLS on deck_cards scopes by parent deck.user_id automatically.
 */

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (typeof body.quantity === "number") {
    if (!Number.isInteger(body.quantity) || body.quantity < 1) {
      return NextResponse.json(
        { error: "quantity must be a positive integer" },
        { status: 400 },
      );
    }
    update.quantity = body.quantity;
  }

  if (typeof body.zone === "string") {
    if (!ZONES.has(body.zone)) {
      return NextResponse.json(
        { error: `zone must be one of ${[...ZONES].join(", ")}` },
        { status: 400 },
      );
    }
    update.zone = body.zone;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "no valid fields to update" },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("deck_cards")
    .update(update)
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { error } = await supabase.from("deck_cards").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
