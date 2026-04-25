import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ZONES = new Set(["mainboard", "sideboard", "commander", "maybeboard"]);

/**
 * Update a single deck_card row (quantity / zone) or remove it.
 * RLS on deck_cards scopes by parent deck.user_id automatically.
 *
 * Zone changes get a merge-aware code path: if dragging a card from
 * mainboard -> sideboard and the same card already lives in sideboard,
 * the source row's quantity is folded into the existing target row and
 * the source row is deleted (instead of leaving two duplicate rows).
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

  let newZone: string | null = null;
  if (typeof body.zone === "string") {
    if (!ZONES.has(body.zone)) {
      return NextResponse.json(
        { error: `zone must be one of ${[...ZONES].join(", ")}` },
        { status: 400 },
      );
    }
    newZone = body.zone;
    update.zone = body.zone;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "no valid fields to update" },
      { status: 400 },
    );
  }

  // If we're moving to a different zone, check for an existing row to merge
  // into so we don't end up with two (deck, card, zone) duplicates after a
  // drag-and-drop zone change.
  if (newZone) {
    const { data: current } = await supabase
      .from("deck_cards")
      .select("id, deck_id, card_id, quantity, zone")
      .eq("id", id)
      .maybeSingle();

    if (current && current.zone !== newZone) {
      const { data: target } = await supabase
        .from("deck_cards")
        .select("id, quantity")
        .eq("deck_id", current.deck_id)
        .eq("card_id", current.card_id)
        .eq("zone", newZone)
        .neq("id", id)
        .maybeSingle();

      if (target) {
        // Merge: fold source quantity into target, delete source row.
        const mergedQty =
          target.quantity +
          (typeof update.quantity === "number"
            ? (update.quantity as number)
            : current.quantity);

        const { error: updErr } = await supabase
          .from("deck_cards")
          .update({ quantity: mergedQty })
          .eq("id", target.id);
        if (updErr) {
          return NextResponse.json({ error: updErr.message }, { status: 500 });
        }
        const { error: delErr } = await supabase
          .from("deck_cards")
          .delete()
          .eq("id", id);
        if (delErr) {
          return NextResponse.json({ error: delErr.message }, { status: 500 });
        }
        return NextResponse.json({ ok: true, merged: true, into: target.id });
      }
    }
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
